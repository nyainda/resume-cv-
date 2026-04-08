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

/** Encode a sharing URL using the Microsoft Graph "Sharing ID" scheme. */
function encodeShareUrl(shareUrl: string): string {
    return 'u!' + btoa(shareUrl)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Convert classic onedrive.live.com edit/view links (that carry resid + authkey in
 * the query string) into direct download URLs.  All other formats — including the
 * newer 1drv.ms/w/c/…?e=… Word-Online sharing links — are left unchanged so that
 * the Microsoft Graph shares API can resolve them using the original URL.
 */
function toDirectDownloadUrl(raw: string): string | null {
    if (raw.includes('onedrive.live.com/edit') || raw.includes('onedrive.live.com/view')) {
        try {
            const u = new URL(raw);
            const resid = u.searchParams.get('resid') || u.searchParams.get('id');
            const authkey = u.searchParams.get('authkey') || u.searchParams.get('AuthKey');
            if (resid && authkey) {
                return `https://onedrive.live.com/download?resid=${resid}&authkey=${authkey}`;
            }
        } catch { }
    }
    return null;
}

/**
 * Download a file from any OneDrive / Word Online sharing URL.
 *
 * Strategy (in order):
 *  1. If it's a classic onedrive.live.com edit/view link, construct a direct
 *     download URL and fetch that.
 *  2. Send the ORIGINAL sharing URL (not a normalised version) to the Microsoft
 *     Graph shares API — this correctly handles all 1drv.ms short-link formats,
 *     including the newer 1drv.ms/w/c/{cid}/{item}?e={token} Word-Online links.
 *  3. Legacy fallback via the old OneDrive v1 API.
 */
export async function downloadSharedFile(shareUrl: string): Promise<ArrayBuffer> {
    const rawUrl = shareUrl.trim();

    // ── Step 1: classic direct-download URL ──────────────────────────────────
    const directUrl = toDirectDownloadUrl(rawUrl);
    if (directUrl) {
        try {
            const resp = await fetch(directUrl);
            if (resp.ok) return resp.arrayBuffer();
        } catch { /* fall through */ }
    }

    // ── Step 2: Microsoft Graph shares API (always use original URL) ─────────
    const encoded = encodeShareUrl(rawUrl);

    const metaResp = await fetch(
        `${GRAPH_BASE}/shares/${encoded}/driveItem?$select=@microsoft.graph.downloadUrl,name`
    );

    if (metaResp.ok) {
        const meta = await metaResp.json();
        const dlUrl: string | undefined = meta['@microsoft.graph.downloadUrl'];
        if (dlUrl) {
            const fileResp = await fetch(dlUrl);
            if (!fileResp.ok) throw new Error(`File download failed (${fileResp.status}).`);
            return fileResp.arrayBuffer();
        }
    } else {
        const status = metaResp.status;
        if (status === 401 || status === 403) {
            throw new Error(
                `Access denied (HTTP ${status}).\n` +
                'The sharing permission must be "Anyone with the link can view".\n' +
                'In OneDrive: right-click the file → Share → change to "Anyone with the link" → Copy.'
            );
        }
        // Log but continue to fallback
        console.warn('Graph API shares response:', status, await metaResp.text().catch(() => ''));
    }

    // ── Step 3: Graph legacy content endpoint ────────────────────────────────
    const contentResp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem/content`);
    if (contentResp.ok) return contentResp.arrayBuffer();

    // ── Step 4: Old OneDrive v1 API ──────────────────────────────────────────
    const oldApi = await fetch(`https://api.onedrive.com/v1.0/shares/${encoded}/root/content`);
    if (oldApi.ok) return oldApi.arrayBuffer();

    throw new Error(
        'Could not download the file. Please check:\n' +
        '1. Sharing is set to "Anyone with the link can view" (not Specific people or Only me)\n' +
        '2. The link points to a .docx Word document\n' +
        '3. The link has not expired\n\n' +
        'In OneDrive: right-click the file → Share → "Anyone with the link" → Copy link.'
    );
}

export async function getSharedFileMetadata(shareUrl: string): Promise<SharedFileInfo> {
    const encoded = encodeShareUrl(shareUrl.trim());
    const resp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem?$select=name,lastModifiedDateTime,eTag`);
    if (!resp.ok) throw new Error(`Could not read file metadata: ${resp.status}`);
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
