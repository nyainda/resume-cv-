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

/**
 * Normalise any known OneDrive sharing URL format into the most direct
 * form we can use to download the file.
 *
 * Supported formats:
 *   • onedrive.live.com/edit?resid=...&authkey=...   → direct download URL
 *   • onedrive.live.com/view?resid=...&authkey=...   → direct download URL
 *   • 1drv.ms/w/c/{cid}/{itemId}?e={token}          → direct download URL
 *   • 1drv.ms/b/c/{cid}/{itemId}?e={token}          → direct download URL
 *   • anything else                                  → unchanged (Graph API handles it)
 */
function normaliseShareUrl(raw: string): string {
    const trimmed = raw.trim();

    // Classic onedrive.live.com edit/view links with resid + authkey
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

    // Newer 1drv.ms/w/c/{cid}/{itemId}?e={token} format (Word Online sharing links)
    // Also handles /b/c/ (Excel), /p/c/ (PowerPoint), /f/c/ (generic file)
    const oneDrvMatch = trimmed.match(/^https?:\/\/1drv\.ms\/[a-z]\/c\/([0-9a-fA-F]+)\/([^?]+)\?e=(.+)$/);
    if (oneDrvMatch) {
        const [, cid, itemPath, authkey] = oneDrvMatch;
        // Build an anonymous download URL using the OneDrive consumer API
        // The itemPath is the base64url-encoded item reference — use it as the resid
        return `https://onedrive.live.com/download.aspx?cid=${cid}&resid=${itemPath}&authkey=!${authkey}`;
    }

    return trimmed;
}

export async function downloadSharedFile(shareUrl: string): Promise<ArrayBuffer> {
    const normalised = normaliseShareUrl(shareUrl);

    // Direct download URLs (both new and classic formats)
    if (
        normalised.includes('/download?resid=') ||
        normalised.includes('/download.aspx?') ||
        normalised.includes('/download.aspx')
    ) {
        const resp = await fetch(normalised);
        if (resp.ok) return resp.arrayBuffer();
        // If the constructed URL fails, fall through to Graph API
    }

    // Microsoft Graph shares API — works for "Anyone with the link" public shares
    const encoded = encodeShareUrl(normalised.startsWith('https://1drv.ms') ? shareUrl.trim() : normalised);

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
        const errBody = await metaResp.text().catch(() => '');
        if (metaResp.status === 401 || metaResp.status === 403) {
            throw new Error(
                'Access denied (HTTP ' + metaResp.status + ').\n' +
                'Make sure the sharing link permission is set to "Anyone with the link can view" — ' +
                'not "Specific people" or "Only me".'
            );
        }
        if (errBody) console.warn('Graph API error:', errBody);
    }

    // Fallback: Graph legacy content endpoint
    const contentResp = await fetch(`${GRAPH_BASE}/shares/${encoded}/driveItem/content`);
    if (contentResp.ok) return contentResp.arrayBuffer();

    // Final fallback: old OneDrive API
    const oldApi = await fetch(`https://api.onedrive.com/v1.0/shares/${encoded}/root/content`);
    if (oldApi.ok) return oldApi.arrayBuffer();

    throw new Error(
        'Could not download the file. Please check:\n' +
        '1. The sharing permission is "Anyone with the link can view"\n' +
        '2. The link points to a .docx Word document\n' +
        '3. The link has not expired\n\n' +
        'Tip: In OneDrive, open Share → Manage access → set to "Anyone with the link".'
    );
}

export async function getSharedFileMetadata(shareUrl: string): Promise<SharedFileInfo> {
    const normalised = normaliseShareUrl(shareUrl);
    // Always encode the original URL (not the normalised download URL) for Graph metadata
    const toEncode = shareUrl.trim();
    const encoded = encodeShareUrl(toEncode);
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
