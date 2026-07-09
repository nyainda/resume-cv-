// services/storage/DriveStorageService.ts
// Token is injected from AuthContext — no popup logic here.
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
import { getUserPrefix, getStorageUserId } from './userStorageNamespace';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

interface FileMeta {
    id: string;
    modifiedTime: string;
}

// ── Filename format ──────────────────────────────────────────────────────────
//
// New format (structural account isolation):
//   cvb__u{procvUserId}__{key}.json
//
//   The ProCV user ID is embedded in every Drive filename.  This means that
//   even if the wrong Google account's Drive is connected (e.g. browser
//   auto-selects a different Google session during the consent popup), that
//   account's appDataFolder will contain files named for a DIFFERENT ProCV
//   user ID — so `findFileWithMeta` returns null for every key and no data
//   is ever loaded into the wrong session.  The mismatch becomes a hard
//   filesystem boundary, not a runtime check.
//
// Legacy format (pre-structural fix):
//   cvb__{key}.json
//
//   Old files are detected and renamed by `migrateDriveFilesToUserScope()`,
//   which runs once after Drive is connected.  Until migration completes,
//   loads fall back to localStorage (which still holds the user's local data).

export class DriveStorageService implements IStorageService {
    readonly isPersistent = true;
    readonly label = 'Google Drive';
    readonly currentToken: string;
    /** ProCV user ID embedded in every Drive filename for structural isolation. */
    readonly userId: string;
    private readonly mtimePrefix: string;

    constructor(token: string, userId?: string | null) {
        this.currentToken = token;
        // Prefer the explicitly passed userId; fall back to the in-memory
        // namespace cache.  Drive should never be activated for anonymous users,
        // but 'anon' is a safe sentinel if somehow it is.
        this.userId = userId ?? getStorageUserId() ?? 'anon';
        // mtime keys are user-scoped so Drive conflict timestamps are fully
        // isolated between accounts on the same device.
        this.mtimePrefix = `${getUserPrefix()}cv_drv_mtime:`;
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
        // Only return keys for files that belong to THIS user (correct prefix).
        // Files from a mismatched Google account will have a different userId
        // prefix and are silently skipped — they are never loaded.
        const userPrefix = `cvb__u${this.userId}__`;
        return (json.files as Array<{ name: string }>)
            .filter((f) => f.name.startsWith(userPrefix))
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

    // ── PDF upload ─────────────────────────────────────────────────────────────
    // Stores the PDF in the hidden appDataFolder (drive.appdata scope — no
    // visible folder created, works with the scope we already have).

    async uploadPDFFile(filename: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string }> {
        const metadata = JSON.stringify({
            name: filename,
            mimeType: 'application/pdf',
            parents: ['appDataFolder'],
        });
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
            `${DRIVE_UPLOAD_URL}?uploadType=multipart&spaces=appDataFolder&fields=id`,
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: combined,
            }
        );
        if (!res.ok) throw new Error(`Drive PDF upload failed: ${res.statusText}`);
        const { id } = await res.json();
        // appDataFolder files don't have a public webViewLink — return a stable reference URL
        return { id, webViewLink: `https://drive.google.com/file/d/${id}/view` };
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private toFilename(key: string): string {
        // New format: cvb__u{userId}__{safeKey}.json
        // The userId prefix makes cross-account leaks impossible at the
        // filesystem level — a wrong Google account's Drive contains files
        // with a different userId prefix, so findFileWithMeta returns null.
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `cvb__u${this.userId}__${safeKey}.json`;
    }

    private fromFilename(name: string): string {
        // New format: cvb__u{userId}__{key}.json
        const newMatch = name.match(/^cvb__u[^_]+__(.+)\.json$/);
        if (newMatch) return newMatch[1];
        // Legacy format: cvb__{key}.json (pre-structural-fix files)
        const legacyMatch = name.match(/^cvb__(.+)\.json$/);
        return legacyMatch ? legacyMatch[1] : '';
    }

    private storeMtime(filename: string, mtime: string): void {
        try {
            localStorage.setItem(this.mtimePrefix + filename, mtime);
        } catch { /* quota — mtime is best-effort */ }
    }

    private getStoredMtime(filename: string): string | null {
        return localStorage.getItem(this.mtimePrefix + filename);
    }

    private clearMtime(filename: string): void {
        localStorage.removeItem(this.mtimePrefix + filename);
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

/**
 * migrateDriveFilesToUserScope — one-time rename of legacy Drive files.
 *
 * Existing users who connected Drive before the structural filename fix have
 * files named `cvb__profiles.json` (no userId prefix).  This function finds
 * those files and renames them to `cvb__u{userId}__profiles.json` so the app
 * can read them with the new naming convention.
 *
 * Idempotent — guarded by a per-user localStorage flag.
 * Best-effort — a Drive API failure silently skips the rename; the user falls
 * back to their local cache and the rename is retried on next connect.
 */
export async function migrateDriveFilesToUserScope(
    token: string,
    userId: string,
): Promise<void> {
    if (!token || !userId) return;

    const flagKey = `procv:drive_ns_migrated_${userId}`;
    if (localStorage.getItem(flagKey) === '1') return; // already done

    const auth = { Authorization: `Bearer ${token}` };

    let files: Array<{ id: string; name: string }> = [];
    try {
        const res = await fetch(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(id,name)&pageSize=100`,
            { headers: auth },
        );
        if (!res.ok) return; // Drive unavailable — retry next time
        const json = await res.json() as { files?: Array<{ id: string; name: string }> };
        files = json.files ?? [];
    } catch { return; }

    // Only rename files in the OLD format: cvb__key.json (no user prefix)
    const oldFormat = files.filter(
        f => /^cvb__(?!u\d+__)/.test(f.name) && f.name.endsWith('.json'),
    );

    let allRenamed = true;
    for (const file of oldFormat) {
        // Extract the key from the old filename and build the new name
        const oldKey = file.name.replace(/^cvb__/, '').replace(/\.json$/, '');
        const newName = `cvb__u${userId}__${oldKey}.json`;
        try {
            const res = await fetch(`${DRIVE_FILES_URL}/${file.id}`, {
                method: 'PATCH',
                headers: { ...auth, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            });
            if (!res.ok) allRenamed = false; // PATCH failed — mark for retry
        } catch {
            allRenamed = false; // Network error — leave old file in place, retry next time
        }
    }

    // Only record "done" when every rename succeeded.  If any failed, skip the
    // flag so the next Drive connect retries the remaining files.
    if (allRenamed) {
        localStorage.setItem(flagKey, '1');
    }
}

/**
 * deleteAllDriveData — call during account deletion, while the Google token
 * is still valid (before googleSignOut()).
 *
 * Removes:
 *  1. All ProCV data files stored in the hidden appDataFolder (JSON blobs)
 *  2. The "ProCV" PDF export folder visible in the user's My Drive
 *
 * All operations are best-effort — a Drive error never blocks account deletion.
 */
export async function deleteAllDriveData(token: string): Promise<void> {
    if (!token) return;
    const auth = { Authorization: `Bearer ${token}` };

    // ── 1. appDataFolder (hidden app data — cvb__*.json files) ───────────────
    try {
        const listRes = await fetch(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(id)&pageSize=1000`,
            { headers: auth },
        );
        if (listRes.ok) {
            const { files } = await listRes.json() as { files: Array<{ id: string }> };
            await Promise.allSettled(
                (files ?? []).map(f =>
                    fetch(`${DRIVE_FILES_URL}/${f.id}`, { method: 'DELETE', headers: auth }),
                ),
            );
        }
    } catch { /* best-effort — Drive unavailable or token insufficient */ }

    // ── 2. "ProCV" folder in My Drive (PDF exports) ───────────────────────────
    try {
        const folderRes = await fetch(
            `${DRIVE_FILES_URL}?spaces=drive` +
            `&q=name%3D%27ProCV%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse` +
            `&fields=files(id)`,
            { headers: auth },
        );
        if (folderRes.ok) {
            const { files } = await folderRes.json() as { files: Array<{ id: string }> };
            await Promise.allSettled(
                (files ?? []).map(f =>
                    fetch(`${DRIVE_FILES_URL}/${f.id}?supportsAllDrives=true`, { method: 'DELETE', headers: auth }),
                ),
            );
        }
    } catch { /* best-effort */ }
}
