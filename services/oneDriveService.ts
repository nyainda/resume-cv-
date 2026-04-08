const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LS_MS_TOKEN = 'cv_builder:ms_access_token';
const LS_SYNC_URL = 'cv_builder:word_sync_url';

export interface OneDriveFile {
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime: string;
    size: number;
}

export interface SharedFileInfo {
    name: string;
    lastModifiedDateTime: string;
    eTag?: string;
}

export function getMsToken(): string | null {
    try { return localStorage.getItem(LS_MS_TOKEN); } catch { return null; }
}

export function getSavedSyncUrl(): string | null {
    try { return localStorage.getItem(LS_SYNC_URL); } catch { return null; }
}

export function saveSyncUrl(url: string): void {
    try { localStorage.setItem(LS_SYNC_URL, url); } catch { }
}

export function clearSyncUrl(): void {
    try { localStorage.removeItem(LS_SYNC_URL); } catch { }
}

function encodeShareUrl(shareUrl: string): string {
    return 'u!' + btoa(shareUrl)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function normaliseShareUrl(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes('onedrive.live.com/edit') || trimmed.includes('onedrive.live.com/view')) {
        try {
            const u = new URL(trimmed);
            const resid = u.searchParams.get('resid') || u.searchParams.get('id');
            const authkey = u.searchParams.get('authkey') || u.searchParams.get('AuthKey');
            if (resid && authkey) {
                return `https://onedrive.live.com/download?resid=${resid}&authkey=${authkey}`;
            }
        } catch { }
    }
    return trimmed;
}

export async function downloadSharedFile(shareUrl: string): Promise<ArrayBuffer> {
    const normalised = normaliseShareUrl(shareUrl);

    if (normalised.includes('/download?resid=') || normalised.includes('/download.aspx')) {
        const resp = await fetch(normalised);
        if (!resp.ok) throw new Error(`Download failed (${resp.status}). Make sure the link is set to "Anyone with the link can view".`);
        return resp.arrayBuffer();
    }

    const encoded = encodeShareUrl(normalised);

    const metaResp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem?$select=@microsoft.graph.downloadUrl,name`);
    if (metaResp.ok) {
        const meta = await metaResp.json();
        const dlUrl: string | undefined = meta['@microsoft.graph.downloadUrl'];
        if (dlUrl) {
            const fileResp = await fetch(dlUrl);
            if (!fileResp.ok) throw new Error(`File download failed: ${fileResp.status}`);
            return fileResp.arrayBuffer();
        }
    }

    const contentResp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem/content`);
    if (contentResp.ok) return contentResp.arrayBuffer();

    const oldApi = await fetch(`https://api.onedrive.com/v1.0/shares/${encoded}/root/content`);
    if (oldApi.ok) return oldApi.arrayBuffer();

    throw new Error(
        'Could not download the file. Make sure:\n' +
        '1. The sharing link is set to "Anyone with the link can view"\n' +
        '2. The link is for a .docx file\n' +
        '3. The link has not expired'
    );
}

export async function getSharedFileMetadata(shareUrl: string): Promise<SharedFileInfo> {
    const normalised = normaliseShareUrl(shareUrl);
    const encoded = encodeShareUrl(normalised);
    const resp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem?$select=name,lastModifiedDateTime,eTag`);
    if (!resp.ok) throw new Error(`Could not read file info: ${resp.status}`);
    return resp.json() as Promise<SharedFileInfo>;
}

export class OneDriveService {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private get authHeader() {
        return { Authorization: `Bearer ${this.token}` };
    }

    async listWordFiles(): Promise<OneDriveFile[]> {
        const resp = await fetch(
            `${GRAPH_BASE}/me/drive/root/search(q='.docx')?$select=id,name,webUrl,lastModifiedDateTime,size&$top=50`,
            { headers: this.authHeader }
        );
        if (resp.status === 401) throw new Error('Microsoft session expired. Please reconnect in Settings.');
        if (!resp.ok) throw new Error(`OneDrive error: ${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        return ((data.value || []) as OneDriveFile[])
            .filter(f => f.name.toLowerCase().endsWith('.docx'))
            .sort((a, b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());
    }

    async downloadFile(fileId: string): Promise<ArrayBuffer> {
        const resp = await fetch(
            `${GRAPH_BASE}/me/drive/items/${fileId}/content`,
            { headers: this.authHeader }
        );
        if (resp.status === 401) throw new Error('Microsoft session expired. Please reconnect in Settings.');
        if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
        return resp.arrayBuffer();
    }

    async getFileLastModified(fileId: string): Promise<string> {
        const resp = await fetch(
            `${GRAPH_BASE}/me/drive/items/${fileId}?$select=lastModifiedDateTime`,
            { headers: this.authHeader }
        );
        if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`);
        const data = await resp.json();
        return data.lastModifiedDateTime as string;
    }
}
