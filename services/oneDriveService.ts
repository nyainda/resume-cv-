const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LS_MS_TOKEN = 'cv_builder:ms_access_token';

export interface OneDriveFile {
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime: string;
    size: number;
}

export function getMsToken(): string | null {
    try { return localStorage.getItem(LS_MS_TOKEN); } catch { return null; }
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
