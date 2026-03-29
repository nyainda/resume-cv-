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
        const existingId = await this.findFileId(filename);
        if (existingId) {
            await this.patchFile(existingId, body);
        } else {
            await this.createFile(filename, body);
        }
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        const filename = this.toFilename(key);
        const fileId = await this.findFileId(filename);
        if (!fileId) return null;
        const res = await this.apiFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`);
        if (!res.ok) return null;
        try { return (await res.json()) as T; } catch { return null; }
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
        const meta = JSON.stringify({ name: filename, parents: ['appDataFolder'] });
        const form = new FormData();
        form.append('metadata', new Blob([meta], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'application/json' }));
        await this.apiFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, { method: 'POST', body: form });
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