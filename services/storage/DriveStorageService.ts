// src/services/storage/DriveStorageService.ts
// Token is injected from GoogleAuthContext — no popup logic here.

import { IStorageService } from './IStorageService';

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export class DriveStorageService implements IStorageService {
    readonly isPersistent = true;
    readonly label = 'Google Drive';
    readonly currentToken: string;

    constructor(token: string) {
        this.currentToken = token;
    }

    async save(key: string, data: unknown): Promise<void> {
        const filename = this.toFilename(key);
        const body = JSON.stringify(data);
        try {
            const existingId = await this.findFileId(filename);
            if (existingId) {
                await this.patchFile(existingId, body);
            } else {
                await this.createFile(filename, body);
            }
            window.dispatchEvent(new CustomEvent('drive-save-success', { detail: { key } }));
        } catch (err) {
            window.dispatchEvent(new CustomEvent('drive-save-error', { detail: { key, error: err } }));
            throw err;
        }
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        try {
            const filename = this.toFilename(key);
            const fileId = await this.findFileId(filename);
            if (!fileId) return null;
            const res = await this.apiFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`);
            if (!res.ok) return null;
            const text = await res.text();
            if (!text) return null;
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
        const fileId = await this.findFileId(this.toFilename(key));
        if (fileId) await this.apiFetch(`${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' });
    }

    async sync(): Promise<void> { }

    async uploadPDFFile(filename: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string }> {
        const DRIVE_FOLDER_NAME = 'AI CV Builder';

        // Find or create the "AI CV Builder" folder in My Drive
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

    private toFilename(key: string): string {
        return `cvb__${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    }

    private fromFilename(name: string): string {
        const m = name.match(/^cvb__(.+)\.json$/);
        return m ? m[1] : '';
    }

    private async findFileId(filename: string): Promise<string | null> {
        const res = await this.apiFetch(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&q=name%3D%27${encodeURIComponent(filename)}%27&fields=files(id)`
        );
        if (!res.ok) return null;
        const json = await res.json();
        return json.files?.[0]?.id ?? null;
    }

    private async createFile(filename: string, content: string): Promise<void> {
        // 1. Create file with metadata (empty content)
        const metaRes = await this.apiFetch(DRIVE_FILES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: filename, parents: ['appDataFolder'] }),
        });
        if (!metaRes.ok) throw new Error(`Could not create file on Drive: ${metaRes.statusText}`);
        const { id } = await metaRes.json();

        // 2. Upload the content
        await this.patchFile(id, content);
    }

    private async patchFile(fileId: string, content: string): Promise<void> {
        await this.apiFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: content,
        });
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