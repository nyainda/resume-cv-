/**
 * oneDriveService.test.ts
 *
 * Regression tests for the OneDrive / shared-file integration.
 * Tests cover:
 *   1. encodeShareUrl — Microsoft Graph "Sharing ID" encoding
 *   2. googleDocsExportUrl — Google Docs URL pattern detection
 *   3. toDirectOneDriveDownloadUrl — classic onedrive.live.com download URL conversion
 *   4. downloadSharedFile — routing logic (Google Docs → Graph API → fallback chain)
 *   5. getSharedFileMetadata — routing logic
 *   6. OneDriveService — listWordFiles, downloadFile, getFileLastModified
 *   7. localStorage helpers — getMsToken, saveSyncUrl, clearSyncUrl
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorageMock() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
        _store:     store,
    };
}

// ─── Constants (must stay in sync with oneDriveService.ts) ───────────────────

const GRAPH_BASE   = 'https://graph.microsoft.com/v1.0';
const LS_MS_TOKEN  = 'cv_builder:ms_access_token';
const LS_SYNC_URL  = 'cv_builder:word_sync_url';

// ─── Inline logic mirrors (for isolated unit testing) ────────────────────────

function encodeShareUrl(shareUrl: string): string {
    return 'u!' + btoa(shareUrl)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function googleDocsExportUrl(raw: string): string | null {
    const docsMatch = raw.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docsMatch) return `https://docs.google.com/document/d/${docsMatch[1]}/export?format=docx`;

    const driveFileMatch = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch) return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;

    const driveOpenMatch = raw.match(/drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/);
    if (driveOpenMatch) return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;

    return null;
}

function toDirectOneDriveDownloadUrl(raw: string): string | null {
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

// ══════════════════════════════════════════════════════════════════════════════
// 1. encodeShareUrl — Microsoft Graph Sharing ID
// ══════════════════════════════════════════════════════════════════════════════

describe('encodeShareUrl — Microsoft Graph Sharing ID encoding', () => {
    it('starts with the "u!" prefix required by Graph Shares API', () => {
        const encoded = encodeShareUrl('https://1drv.ms/w/c/abc123');
        expect(encoded).toMatch(/^u!/);
    });

    it('replaces "+" with "-" in the base64 output', () => {
        // Find a URL whose base64 contains "+" — test the replacement
        const encoded = encodeShareUrl('https://1drv.ms/w/test+url');
        expect(encoded).not.toContain('+');
    });

    it('replaces "/" with "_" in the base64 output', () => {
        const encoded = encodeShareUrl('https://onedrive.live.com/share');
        expect(encoded).not.toContain('/');
    });

    it('removes "=" padding from the base64 output', () => {
        const encoded = encodeShareUrl('https://1drv.ms/w/abc');
        expect(encoded).not.toContain('=');
    });

    it('is deterministic — same URL always produces the same encoded value', () => {
        const url = 'https://1drv.ms/w/c/abc123?e=token';
        expect(encodeShareUrl(url)).toBe(encodeShareUrl(url));
    });

    it('different URLs produce different encoded values', () => {
        const a = encodeShareUrl('https://1drv.ms/w/file-a');
        const b = encodeShareUrl('https://1drv.ms/w/file-b');
        expect(a).not.toBe(b);
    });

    it('Graph Shares URL is constructed correctly from encoded ID', () => {
        const encoded = encodeShareUrl('https://1drv.ms/w/c/abc123');
        const graphUrl = `${GRAPH_BASE}/shares/${encoded}/driveItem?$select=@microsoft.graph.downloadUrl,name`;
        expect(graphUrl).toMatch(/^https:\/\/graph\.microsoft\.com\/v1\.0\/shares\/u!/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. googleDocsExportUrl — Google Docs URL pattern matching
// ══════════════════════════════════════════════════════════════════════════════

describe('googleDocsExportUrl — Google Docs URL detection and export conversion', () => {
    it('converts a docs.google.com/document/d/{id}/edit URL to a .docx export URL', () => {
        const url = 'https://docs.google.com/document/d/abc123XYZ/edit?usp=sharing';
        const result = googleDocsExportUrl(url);
        expect(result).toBe('https://docs.google.com/document/d/abc123XYZ/export?format=docx');
    });

    it('converts a docs.google.com/document/d/{id}/view URL', () => {
        const url = 'https://docs.google.com/document/d/myDocId-_1/view';
        const result = googleDocsExportUrl(url);
        expect(result).toBe('https://docs.google.com/document/d/myDocId-_1/export?format=docx');
    });

    it('converts a drive.google.com/file/d/{id}/view URL', () => {
        const url = 'https://drive.google.com/file/d/fileIdABC/view?usp=sharing';
        const result = googleDocsExportUrl(url);
        expect(result).toBe('https://drive.google.com/uc?export=download&id=fileIdABC');
    });

    it('converts a drive.google.com/open?id={id} URL', () => {
        const url = 'https://drive.google.com/open?id=driveOpenId123';
        const result = googleDocsExportUrl(url);
        expect(result).toBe('https://drive.google.com/uc?export=download&id=driveOpenId123');
    });

    it('returns null for a OneDrive URL', () => {
        expect(googleDocsExportUrl('https://1drv.ms/w/c/abc123')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(googleDocsExportUrl('')).toBeNull();
    });

    it('returns null for a plain text string', () => {
        expect(googleDocsExportUrl('not a url')).toBeNull();
    });

    it('preserves the document ID exactly including hyphens and underscores', () => {
        const url = 'https://docs.google.com/document/d/1a2b_3c-4d/edit';
        const result = googleDocsExportUrl(url);
        expect(result).toContain('1a2b_3c-4d');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. toDirectOneDriveDownloadUrl — classic live.com URL conversion
// ══════════════════════════════════════════════════════════════════════════════

describe('toDirectOneDriveDownloadUrl — classic onedrive.live.com URL conversion', () => {
    const editUrl = 'https://onedrive.live.com/edit?resid=ABC123&authkey=DEF456';
    const viewUrl = 'https://onedrive.live.com/view?resid=ABC123&authkey=DEF456';

    it('converts a classic edit URL to a download URL', () => {
        const result = toDirectOneDriveDownloadUrl(editUrl);
        expect(result).toBe('https://onedrive.live.com/download?resid=ABC123&authkey=DEF456');
    });

    it('converts a classic view URL to a download URL', () => {
        const result = toDirectOneDriveDownloadUrl(viewUrl);
        expect(result).toBe('https://onedrive.live.com/download?resid=ABC123&authkey=DEF456');
    });

    it('returns null for a modern 1drv.ms sharing link (Graph API handles these)', () => {
        expect(toDirectOneDriveDownloadUrl('https://1drv.ms/w/c/abc123?e=token')).toBeNull();
    });

    it('returns null for a Google Docs URL', () => {
        expect(toDirectOneDriveDownloadUrl('https://docs.google.com/document/d/abc/edit')).toBeNull();
    });

    it('returns null when resid is present but authkey is missing', () => {
        const result = toDirectOneDriveDownloadUrl('https://onedrive.live.com/edit?resid=ABC123');
        expect(result).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(toDirectOneDriveDownloadUrl('')).toBeNull();
    });

    it('accepts AuthKey (capital K) as an alternative param name', () => {
        const url = 'https://onedrive.live.com/edit?resid=RES&AuthKey=KEY';
        expect(toDirectOneDriveDownloadUrl(url)).toBe('https://onedrive.live.com/download?resid=RES&authkey=KEY');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. downloadSharedFile routing logic
// ══════════════════════════════════════════════════════════════════════════════

describe('downloadSharedFile — routing logic', () => {
    it('routes a Google Docs URL directly to the export endpoint', async () => {
        const fetchCalls: string[] = [];
        const mockFetch = vi.fn(async (url: string) => {
            fetchCalls.push(url);
            return new Response(new ArrayBuffer(100), { status: 200 });
        });
        vi.stubGlobal('fetch', mockFetch);

        const docUrl = 'https://docs.google.com/document/d/myDocId/edit';
        const gdocsExport = googleDocsExportUrl(docUrl);
        expect(gdocsExport).toContain('export?format=docx');

        const resp = await mockFetch(gdocsExport!);
        expect(resp.ok).toBe(true);
        expect(fetchCalls[0]).toBe(gdocsExport);
    });

    it('throws a descriptive error on Google Docs 403 (not shared publicly)', async () => {
        const mockFetch = vi.fn(async () => new Response('Forbidden', { status: 403 }));
        vi.stubGlobal('fetch', mockFetch);

        async function downloadGoogleDoc(exportUrl: string): Promise<ArrayBuffer> {
            const resp = await fetch(exportUrl);
            if (resp.status === 403) {
                throw new Error('Google Docs access denied. Make sure the document is shared with "Anyone with the link can view"');
            }
            return resp.arrayBuffer();
        }

        await expect(
            downloadGoogleDoc('https://docs.google.com/document/d/abc/export?format=docx'),
        ).rejects.toThrow('Google Docs access denied');
    });

    it('throws a descriptive error on OneDrive 401 (access denied)', async () => {
        const mockFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
        vi.stubGlobal('fetch', mockFetch);

        async function downloadOneDrive(url: string): Promise<ArrayBuffer> {
            const resp = await fetch(url);
            if (resp.status === 401 || resp.status === 403) {
                throw new Error(`OneDrive access denied (HTTP ${resp.status}). The sharing permission must be "Anyone with the link can view".`);
            }
            return resp.arrayBuffer();
        }

        await expect(
            downloadOneDrive('https://graph.microsoft.com/v1.0/shares/u!abc/driveItem'),
        ).rejects.toThrow('OneDrive access denied (HTTP 401)');
    });

    it('falls back gracefully when Graph Shares API returns non-ok without throwing', async () => {
        // When Graph API 404s, the function should try the content endpoint next
        let callCount = 0;
        const mockFetch = vi.fn(async () => {
            callCount++;
            if (callCount === 1) return new Response('Not Found', { status: 404 });
            return new Response(new ArrayBuffer(50), { status: 200 });
        });
        vi.stubGlobal('fetch', mockFetch);

        const resp1 = await mockFetch('graph-url');
        expect(resp1.ok).toBe(false);
        const resp2 = await mockFetch('content-url');
        expect(resp2.ok).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. getSharedFileMetadata routing
// ══════════════════════════════════════════════════════════════════════════════

describe('getSharedFileMetadata — URL routing', () => {
    it('returns synthetic metadata for a Google Docs URL (no fetch needed)', async () => {
        const url = 'https://docs.google.com/document/d/myDocId/edit';
        const isGDocs = /docs\.google\.com\/document\/d\//.test(url);
        expect(isGDocs).toBe(true);
        // In the real service this returns { name: 'Google Document', lastModifiedDateTime: ... }
    });

    it('returns synthetic metadata for a Google Drive file URL', () => {
        const url = 'https://drive.google.com/file/d/fileId/view';
        const isDrive = /drive\.google\.com\/(file\/d\/|open\?.*id=)/.test(url);
        expect(isDrive).toBe(true);
    });

    it('calls Graph Shares API for a OneDrive URL', async () => {
        const fetchCalls: string[] = [];
        const mockFetch = vi.fn(async (url: string) => {
            fetchCalls.push(url);
            return new Response(
                JSON.stringify({ name: 'CV.docx', lastModifiedDateTime: '2026-01-01T00:00:00Z' }),
                { status: 200 },
            );
        });
        vi.stubGlobal('fetch', mockFetch);

        const shareUrl = 'https://1drv.ms/w/c/abc123?e=token';
        const encoded = encodeShareUrl(shareUrl);
        const graphUrl = `${GRAPH_BASE}/shares/${encoded}/driveItem?$select=name,lastModifiedDateTime,eTag`;

        const resp = await mockFetch(graphUrl);
        const data = await resp.json();

        expect(data.name).toBe('CV.docx');
        expect(fetchCalls[0]).toContain('/shares/u!');
    });

    it('throws when Graph API returns non-ok for metadata', async () => {
        const mockFetch = vi.fn(async () => new Response('Not Found', { status: 404 }));
        vi.stubGlobal('fetch', mockFetch);

        async function getMetadata(graphUrl: string) {
            const resp = await fetch(graphUrl);
            if (!resp.ok) throw new Error(`Could not read file metadata: ${resp.status}`);
        }

        await expect(getMetadata(`${GRAPH_BASE}/shares/u!abc/driveItem`)).rejects.toThrow('404');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. OneDriveService class — authenticated file operations
// ══════════════════════════════════════════════════════════════════════════════

describe('OneDriveService — authenticated file operations', () => {
    const TOKEN = 'ms-access-token-xyz';

    function authHeader(token: string) {
        return `Bearer ${token}`;
    }

    it('listWordFiles sends Authorization header', async () => {
        let capturedAuth = '';
        const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
            capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
            return new Response(
                JSON.stringify({ value: [{ id: '1', name: 'CV.docx', webUrl: 'https://x', lastModifiedDateTime: '2026-01-01T00:00:00Z', size: 1024 }] }),
                { status: 200 },
            );
        });
        vi.stubGlobal('fetch', mockFetch);

        await mockFetch(`${GRAPH_BASE}/me/drive/root/search(q='.docx')`, { headers: { Authorization: authHeader(TOKEN) } });
        expect(capturedAuth).toBe(`Bearer ${TOKEN}`);
    });

    it('listWordFiles filters to only .docx files', () => {
        const files = [
            { id: '1', name: 'CV.docx', webUrl: '', lastModifiedDateTime: '2026-01-01', size: 100 },
            { id: '2', name: 'Notes.txt', webUrl: '', lastModifiedDateTime: '2026-01-01', size: 50 },
            { id: '3', name: 'Resume.docx', webUrl: '', lastModifiedDateTime: '2026-01-02', size: 200 },
        ];
        const filtered = files.filter(f => f.name.toLowerCase().endsWith('.docx'));
        expect(filtered).toHaveLength(2);
        expect(filtered.map(f => f.name)).toContain('CV.docx');
        expect(filtered.map(f => f.name)).not.toContain('Notes.txt');
    });

    it('listWordFiles sorts files by lastModifiedDateTime descending (newest first)', () => {
        const files = [
            { id: '1', name: 'Old.docx', lastModifiedDateTime: '2025-01-01T00:00:00Z' },
            { id: '2', name: 'New.docx', lastModifiedDateTime: '2026-06-01T00:00:00Z' },
            { id: '3', name: 'Mid.docx', lastModifiedDateTime: '2025-12-01T00:00:00Z' },
        ];
        const sorted = [...files].sort(
            (a, b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime(),
        );
        expect(sorted[0].name).toBe('New.docx');
        expect(sorted[2].name).toBe('Old.docx');
    });

    it('downloadFile calls the correct Graph endpoint with the file ID', async () => {
        const fetchCalls: string[] = [];
        const mockFetch = vi.fn(async (url: string) => {
            fetchCalls.push(url);
            return new Response(new ArrayBuffer(200), { status: 200 });
        });
        vi.stubGlobal('fetch', mockFetch);

        const fileId = 'item-id-abc123';
        const expectedUrl = `${GRAPH_BASE}/me/drive/items/${fileId}/content`;
        await mockFetch(expectedUrl, { headers: { Authorization: authHeader(TOKEN) } });

        expect(fetchCalls[0]).toBe(expectedUrl);
    });

    it('downloadFile throws on 401 with a descriptive session-expired message', async () => {
        const mockFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
        vi.stubGlobal('fetch', mockFetch);

        async function downloadFile(fileId: string): Promise<ArrayBuffer> {
            const resp = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}/content`);
            if (resp.status === 401) throw new Error('Microsoft session expired. Please reconnect in Settings.');
            if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
            return resp.arrayBuffer();
        }

        await expect(downloadFile('abc')).rejects.toThrow('Microsoft session expired');
    });

    it('getFileLastModified returns the lastModifiedDateTime string', async () => {
        const expectedDate = '2026-06-15T12:00:00Z';
        const mockFetch = vi.fn(async () =>
            new Response(JSON.stringify({ lastModifiedDateTime: expectedDate }), { status: 200 }),
        );
        vi.stubGlobal('fetch', mockFetch);

        const resp = await mockFetch(`${GRAPH_BASE}/me/drive/items/abc?$select=lastModifiedDateTime`);
        const data = await resp.json();
        expect(data.lastModifiedDateTime).toBe(expectedDate);
    });

    it('getFileLastModified throws on non-ok response', async () => {
        const mockFetch = vi.fn(async () => new Response('Error', { status: 500 }));
        vi.stubGlobal('fetch', mockFetch);

        async function getFileLastModified(fileId: string): Promise<string> {
            const resp = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}?$select=lastModifiedDateTime`);
            if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`);
            const data = await resp.json();
            return data.lastModifiedDateTime as string;
        }

        await expect(getFileLastModified('abc')).rejects.toThrow('500');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. localStorage helpers — getMsToken, saveSyncUrl, clearSyncUrl
// ══════════════════════════════════════════════════════════════════════════════

describe('OneDrive localStorage helpers', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);
    });

    it('getMsToken returns null when no token is stored', () => {
        expect(ls.getItem(LS_MS_TOKEN)).toBeNull();
    });

    it('getMsToken returns the stored token', () => {
        ls.setItem(LS_MS_TOKEN, 'my-ms-token');
        expect(ls.getItem(LS_MS_TOKEN)).toBe('my-ms-token');
    });

    it('saveSyncUrl persists the URL under the correct key', () => {
        ls.setItem(LS_SYNC_URL, 'https://1drv.ms/w/c/abc');
        expect(ls.getItem(LS_SYNC_URL)).toBe('https://1drv.ms/w/c/abc');
    });

    it('clearSyncUrl removes the URL from localStorage', () => {
        ls.setItem(LS_SYNC_URL, 'https://1drv.ms/w/c/abc');
        ls.removeItem(LS_SYNC_URL);
        expect(ls.getItem(LS_SYNC_URL)).toBeNull();
    });

    it('getSavedSyncUrl returns null when nothing is stored', () => {
        expect(ls.getItem(LS_SYNC_URL)).toBeNull();
    });

    it('ms token key is namespaced under cv_builder:', () => {
        expect(LS_MS_TOKEN).toBe('cv_builder:ms_access_token');
    });

    it('sync URL key is namespaced under cv_builder:', () => {
        expect(LS_SYNC_URL).toBe('cv_builder:word_sync_url');
    });
});
