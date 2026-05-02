// services/storage/DriveStorageService.ts
// Token is injected from GoogleAuthContext — no popup logic here.
//
// Optimistic Locking:
//   Every save() reads the remote file's modifiedTime first.
//   If it differs from the timestamp we stored when we last loaded/saved,
//   someone else modified it since — we throw DriveConflictError instead
//   of blindly overwriting. The caller (StorageRouter) surfaces this to the UI.
//
// modifiedTime tracking:
//   Stored in localStorage as `cv_drv_mtime:{filename}` so it persists
//   across page reloads. Updated on every successful save or load.

import { IStorageService } from './IStorageService';
import { DriveConflictError } from './storageErrors';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const MTIME_PREFIX = 'cv_drv_mtime:';

interface FileMeta {
    id: string;
    modifiedTime: string;
}

export class DriveStorageService implements IStorageService {
    readonly isPersistent = true;
    readonly label = 'Google Drive';
    readonly currentToken: string;

    constructor(token: string) {
        this.currentToken = token;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    async save(key: string, data: unknown, skipConflictCheck = false): Promise<void> {
        const filename = this.toFilename(key);
        const body = JSON.stringify(data);
        try {
            const meta = await this.findFileWithMeta(filename);
            if (meta) {
                if (!skipConflictCheck) {
                    await this.checkConflict(key, filename, meta, data);
                }
                const newMtime = await this.patchFile(meta.id, body);
                this.storeMtime(filename, newMtime ?? meta.modifiedTime);
            } else {
                const newMtime = await this.createFile(filename, body);
                if (newMtime) this.storeMtime(filename, newMtime);
            }
            window.dispatchEvent(new CustomEvent('drive-save-success', { detail: { key } }));
        } catch (err) {
            if (err instanceof DriveConflictError) throw err; // let caller handle
            window.dispatchEvent(new CustomEvent('drive-save-error', { detail: { key, error: err } }));
            throw err;
        }
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        try {
            const filename = this.toFilename(key);
            const meta = await this.findFileWithMeta(filename);
            if (!meta) return null;
            const res = await this.apiFetch(`${DRIVE_FILES_URL}/${meta.id}?alt=media`);
            if (!res.ok) return null;
            const text = await res.text();
            if (!text) return null;
            // Record the mtime we just loaded — this is our conflict baseline
            this.storeMtime(filename, meta.modifiedTime);
            return JSON.parse(text) as T;
        } catch (err) {
            console.error(`[DriveStorageService] load failed for "${key}":`, err);
            return null;
        }
    }

    async list(): Promise<string[]> {
        const res = await this.apiFetch(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(name)&pageSize=100`
        );
        if (!res.ok) return [];
        const json = await res.json();
        return (json.files as Array<{ name: string }>)
            .map((f) => this.fromFilename(f.name))
            .filter(Boolean);
    }

    async delete(key: string): Promise<void> {
        const meta = await this.findFileWithMeta(this.toFilename(key));
        if (meta) {
            await this.apiFetch(`${DRIVE_FILES_URL}/${meta.id}`, { method: 'DELETE' });
            this.clearMtime(this.toFilename(key));
        }
    }

    async sync(): Promise<void> { }

    // ── Conflict resolution helpers ────────────────────────────────────────────

    /** Force-save, ignoring any conflict — used after user clicks "Overwrite". */
    async forceSave(key: string, data: unknown): Promise<void> {
        return this.save(key, data, true);
    }

    /** Fetch the latest Drive data for a key — used in conflict resolution. */
    async fetchDriveData<T = unknown>(key: string): Promise<T | null> {
        return this.load<T>(key);
    }

    // ── PDF upload (unchanged) ─────────────────────────────────────────────────

    async uploadPDFFile(filename: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string }> {
        const DRIVE_FOLDER_NAME = 'ProCV';

        let folderId: string | null = null;
        const folderSearch = await this.apiFetch(
            `${DRIVE_FILES_URL}?q=name%3D%27${encodeURIComponent(DRIVE_FOLDER_NAME)}%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)&spaces=drive`
        );
        if (folderSearch.ok) {
            const { files } = await folderSearch.json();
            folderId = files?.[0]?.id ?? null;
        }
        if (!folderId) {
            const createRes = await this.apiFetch(DRIVE_FILES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
            });
            if (!createRes.ok) throw new Error(`Could not create Drive folder: ${createRes.statusText}`);
            const folder = await createRes.json();
            folderId = folder.id;
        }

        const metadata = JSON.stringify({ name: filename, mimeType: 'application/pdf', parents: [folderId] });
        const boundary = 'cvbuilder_pdf_' + Date.now();
        const encoder = new TextEncoder();
        const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
        const filePart = encoder.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
        const closing = encoder.encode(`\r\n--${boundary}--`);

        const combined = new Uint8Array(metaPart.length + filePart.length + bytes.length + closing.length);
        combined.set(metaPart, 0);
        combined.set(filePart, metaPart.length);
        combined.set(bytes, metaPart.length + filePart.length);
        combined.set(closing, metaPart.length + filePart.length + bytes.length);

        const res = await this.apiFetch(
            `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`,
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: combined,
            }
        );
        if (!res.ok) throw new Error(`Drive PDF upload failed: ${res.statusText}`);
        return await res.json();
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private toFilename(key: string): string {
        return `cvb__${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    }

    private fromFilename(name: string): string {
        const m = name.match(/^cvb__(.+)\.json$/);
        return m ? m[1] : '';
    }

    private storeMtime(filename: string, mtime: string): void {
        try {
            localStorage.setItem(MTIME_PREFIX + filename, mtime);
        } catch { /* quota — mtime is best-effort */ }
    }

    private getStoredMtime(filename: string): string | null {
        return localStorage.getItem(MTIME_PREFIX + filename);
    }

    private clearMtime(filename: string): void {
        localStorage.removeItem(MTIME_PREFIX + filename);
    }

    private async checkConflict(
        key: string,
        filename: string,
        remoteMeta: FileMeta,
        localData: unknown,
    ): Promise<void> {
        const storedMtime = this.getStoredMtime(filename);

        // No stored mtime → first time saving from this browser → no conflict
        if (!storedMtime) return;

        // Timestamps match → we're the last writer → safe to overwrite
        if (storedMtime === remoteMeta.modifiedTime) return;

        // Mismatch → someone else (or another tab/device) modified the file
        // Load the Drive version so we can show it in the conflict dialog
        let driveData: unknown = null;
        try {
            const res = await this.apiFetch(`${DRIVE_FILES_URL}/${remoteMeta.id}?alt=media`);
            if (res.ok) {
                const text = await res.text();
                if (text) driveData = JSON.parse(text);
            }
        } catch { /* best-effort */ }

        throw new DriveConflictError(key, localData, driveData, remoteMeta.modifiedTime, storedMtime);
    }

    /** Find a file in appDataFolder and return its id + modifiedTime. */
    private async findFileWithMeta(filename: string): Promise<FileMeta | null> {
        const res = await this.apiFetch(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&q=name%3D%27${encodeURIComponent(filename)}%27&fields=files(id,modifiedTime)`
        );
        if (!res.ok) return null;
        const json = await res.json();
        const file = json.files?.[0];
        if (!file?.id) return null;
        return { id: file.id, modifiedTime: file.modifiedTime };
    }

    private async createFile(filename: string, content: string): Promise<string | null> {
        const metaRes = await this.apiFetch(DRIVE_FILES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: filename, parents: ['appDataFolder'] }),
        });
        if (!metaRes.ok) throw new Error(`Could not create file on Drive: ${metaRes.statusText}`);
        const { id } = await metaRes.json();
        return this.patchFile(id, content);
    }

    /** Patch file content and return the new modifiedTime from Drive. */
    private async patchFile(fileId: string, content: string): Promise<string | null> {
        const res = await this.apiFetch(
            `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media&fields=modifiedTime`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: content,
            }
        );
        if (!res.ok) return null;
        try {
            const json = await res.json();
            return json.modifiedTime ?? null;
        } catch {
            return null;
        }
    }

    private async apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
        const res = await fetch(url, {
            ...init,
            headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.currentToken}` },
        });
        if (res.status === 401) throw new Error('Google Drive token expired. Please sign in again.');
        return res;
    }
}
