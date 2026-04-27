/**
 * cloudflareWorkerService.ts
 *
 * Sends the CV HTML to the Cloudflare Worker (headless Chrome on Cloudflare's
 * edge network) and triggers a PDF download in the browser.
 *
 * Set VITE_PDF_WORKER_URL in .env.local (dev) and in Vercel env vars (prod).
 */

const WORKER_URL: string =
  (import.meta as unknown as { env: Record<string, string> }).env
    ?.VITE_PDF_WORKER_URL ?? "";

export type PDFFormat = "A4" | "Letter";

export interface CloudflarePDFOptions {
  html: string;
  filename?: string;
  format?: PDFFormat;
  onStatus?: (msg: string) => void;
}

export interface CloudflarePDFResult {
  ok: boolean;
  error?: string;
}

export function isCloudflareConfigured(): boolean {
  return Boolean(WORKER_URL && WORKER_URL.startsWith("https://"));
}

export async function isCloudflareWorkerOnline(): Promise<boolean> {
  if (!isCloudflareConfigured()) return false;
  try {
    const res = await fetch(`${WORKER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CloudflarePdfBytesResult {
  ok: boolean;
  bytes?: Uint8Array;
  error?: string;
}

/**
 * POST HTML to the Cloudflare Worker and return the resulting PDF bytes.
 * Used by both the download flow (generateAndDownloadViaCF) and the merge
 * flow (PDFMerger via cvDownloadService.getCVPdfBytes).
 */
export async function renderHtmlToPdfBytesViaCF(
  opts: CloudflarePDFOptions
): Promise<CloudflarePdfBytesResult> {
  const { html, filename = "cv.pdf", format = "A4", onStatus } = opts;

  if (!isCloudflareConfigured()) {
    return { ok: false, error: "Cloudflare Worker URL is not configured. Set VITE_PDF_WORKER_URL." };
  }

  try {
    onStatus?.("Sending to Cloudflare renderer…");

    const res = await fetch(`${WORKER_URL}/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename, format }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `Worker error ${res.status}` };
    }

    const buf = await res.arrayBuffer();
    return { ok: true, bytes: new Uint8Array(buf) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cloudflareWorkerService]", msg);
    return { ok: false, error: msg };
  }
}

export async function generateAndDownloadViaCF(
  opts: CloudflarePDFOptions
): Promise<CloudflarePDFResult> {
  const { filename = "cv.pdf", onStatus } = opts;

  const result = await renderHtmlToPdfBytesViaCF(opts);
  if (!result.ok) return { ok: false, error: result.error };

  onStatus?.("Downloading…");

  const blob = new Blob([result.bytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);

  return { ok: true };
}
