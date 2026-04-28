/**
 * workerStatusDiagnostic.ts
 *
 * Runs once at app startup and prints a clearly-formatted summary of whether
 * the two Cloudflare Workers (PDF renderer + CV engine) are configured and
 * reachable. Designed so users on any deploy (Replit, Vercel, custom) can
 * open DevTools → Console and instantly see whether the production env vars
 * are wired up correctly.
 *
 * Also exposes `window.__workerStatus()` so users can re-run the check at any
 * time from the console without reloading the page.
 */

import { isCloudflareConfigured, isCloudflareWorkerOnline } from './cloudflareWorkerService';
import { isCVEngineConfigured } from './cvEngineClient';

// IMPORTANT: access `import.meta.env.X` directly (no `as any` cast), otherwise
// Vite's static replacement skips it and the value comes back undefined in
// the dev/prod bundles.
const PDF_WORKER_URL = import.meta.env.VITE_PDF_WORKER_URL ?? '';
const CV_ENGINE_URL = import.meta.env.VITE_CV_ENGINE_URL ?? '';

interface WorkerCheck {
    name: string;
    configured: boolean;
    url: string;
    reachable: boolean | null;
    httpStatus?: number;
    note?: string;
}

const HEALTH_TIMEOUT_MS = 5000;
const LLM_PROBE_TIMEOUT_MS = 8000;

async function checkHealth(url: string): Promise<{ ok: boolean; status: number; note?: string }> {
    if (!url) return { ok: false, status: 0 };
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

/**
 * Real LLM probe — calls the tiered-llm endpoint with the cheapest free task
 * ("general" → Llama 3.1 8B free) and 2 tokens. Edge `/health` only checks D1
 * row counts and stays green even when Workers AI is wedged with 502s, so we
 * verify the actual AI binding instead. ~free, runs once per page load.
 */
async function probeCVEngineLLM(url: string): Promise<{ ok: boolean; status: number; note?: string }> {
    if (!url) return { ok: false, status: 0 };
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/api/cv/tiered-llm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: 'general',
                system: 'Reply with the single word: ok',
                prompt: 'ping',
                temperature: 0,
                maxTokens: 64,
            }),
            signal: AbortSignal.timeout(LLM_PROBE_TIMEOUT_MS),
        });
        if (!res.ok) {
            return { ok: false, status: res.status, note: `LLM probe failed (HTTP ${res.status}) — Workers AI upstream may be rate-limited or down.` };
        }
        const data = await res.json().catch(() => null) as { text?: string } | null;
        const text = (data?.text || '').trim();
        if (!text) {
            return { ok: false, status: res.status, note: 'LLM probe returned empty text — Workers AI binding is reachable but not generating output.' };
        }
        return { ok: true, status: res.status };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, note: `LLM probe network error: ${msg}` };
    }
}

async function runChecks(): Promise<WorkerCheck[]> {
    const pdfConfigured = isCloudflareConfigured();
    const enginedConfigured = isCVEngineConfigured();

    const [pdfHealth, engineProbe] = await Promise.all([
        pdfConfigured ? checkHealth(PDF_WORKER_URL) : Promise.resolve({ ok: false, status: 0 }),
        enginedConfigured ? probeCVEngineLLM(CV_ENGINE_URL) : Promise.resolve({ ok: false, status: 0 }),
    ]);

    return [
        {
            name: 'PDF Worker',
            configured: pdfConfigured,
            url: PDF_WORKER_URL || '(unset)',
            reachable: pdfConfigured ? pdfHealth.ok : null,
            httpStatus: pdfConfigured ? pdfHealth.status : undefined,
            note: pdfConfigured ? undefined : 'VITE_PDF_WORKER_URL is not set in this build.',
        },
        {
            name: 'CV Engine Worker',
            configured: enginedConfigured,
            url: CV_ENGINE_URL || '(unset)',
            reachable: enginedConfigured ? engineProbe.ok : null,
            httpStatus: enginedConfigured ? engineProbe.status : undefined,
            note: enginedConfigured ? engineProbe.note : 'VITE_CV_ENGINE_URL is not set in this build.',
        },
    ];
}

function printReport(checks: WorkerCheck[]): void {
    const allHealthy = checks.every((c) => c.configured && c.reachable === true);
    const banner = allHealthy
        ? '%c✅ ProCV — Cloudflare Workers connected'
        : '%c⚠️ ProCV — Cloudflare Workers issue detected';
    const bannerStyle = allHealthy
        ? 'background:#16a34a;color:white;font-weight:bold;padding:4px 8px;border-radius:4px'
        : 'background:#dc2626;color:white;font-weight:bold;padding:4px 8px;border-radius:4px';

    console.groupCollapsed(banner, bannerStyle);
    for (const c of checks) {
        const status = !c.configured
            ? 'NOT CONFIGURED'
            : c.reachable
                ? `OK (HTTP ${c.httpStatus})`
                : `UNREACHABLE (HTTP ${c.httpStatus || 'no response'})`;
        const colour = !c.configured ? '#f59e0b' : c.reachable ? '#16a34a' : '#dc2626';
        console.log(
            `%c${c.name}%c  →  %c${status}%c\n  ${c.url}${c.note ? `\n  ${c.note}` : ''}`,
            'font-weight:bold',
            'color:inherit',
            `color:${colour};font-weight:bold`,
            'color:inherit',
        );
    }
    if (!allHealthy) {
        console.log(
            '%cFix:%c set the missing env vars in your hosting provider (Vercel: Project → Settings → Environment Variables) and redeploy. Required:\n  VITE_PDF_WORKER_URL=https://<your-pdf-worker>.workers.dev\n  VITE_CV_ENGINE_URL=https://<your-cv-engine-worker>.workers.dev',
            'color:#dc2626;font-weight:bold',
            'color:inherit',
        );
    }
    console.log('Run %cwindow.__workerStatus()%c again any time to recheck.', 'font-family:monospace;background:#f3f4f6;padding:2px 4px;border-radius:3px', 'color:inherit');
    console.groupEnd();
}

async function runAndPrint(): Promise<WorkerCheck[]> {
    const checks = await runChecks();
    printReport(checks);
    return checks;
}

export function runWorkerStatusDiagnostic(): void {
    if (typeof window === 'undefined') return;
    // Expose a global so the user can re-run the check from DevTools.
    (window as any).__workerStatus = runAndPrint;
    // Defer slightly so the worker warm-up call has a chance to populate state.
    setTimeout(() => {
        void runAndPrint();
    }, 800);
}
