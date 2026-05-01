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
import { markFailure, markSuccess } from './providerHealth';

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
    /** True when the worker replied HTTP 200 but the LLM produced no tokens.
     *  This is a cold-start symptom only — the endpoint IS reachable, the
     *  model is still loading. Must NOT open the circuit breaker. */
    coldModel?: boolean;
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
/**
 * Extended result that distinguishes "HTTP 200 but model returned empty text"
 * (cold model — transient, NOT a circuit-breaker event) from "HTTP 5xx or no
 * response" (genuine failure that should open the circuit).
 */
interface LLMProbeResult {
    ok: boolean;
    status: number;
    note?: string;
    /** True only when the worker replied HTTP 200 but the LLM produced no text.
     *  This is a COLD-START symptom, not a real connectivity failure. The
     *  circuit-breaker must NOT be opened in this case — the worker IS up. */
    emptyResponseHttp200?: boolean;
}

async function probeCVEngineLLM(url: string): Promise<LLMProbeResult> {
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
        // Worker returns JSON for both success and failure. Parse once and
        // surface the real reason (e.g. "4006: daily neuron quota exhausted")
        // so the banner tells the user exactly what's wrong.
        const data = await res.json().catch(() => null) as { text?: string; error?: string; message?: string } | null;
        if (!res.ok) {
            const reason = (data?.message || data?.error || '').toString().trim();
            const note = reason
                ? `LLM probe failed (HTTP ${res.status}): ${reason.slice(0, 240)}`
                : `LLM probe failed (HTTP ${res.status}) — Workers AI upstream may be rate-limited or down.`;
            return { ok: false, status: res.status, note };
        }
        const text = (data?.text || '').trim();
        if (!text) {
            // HTTP 200 but the LLM returned no tokens — this is a COLD-START symptom,
            // NOT a connectivity failure. The worker endpoint is reachable; the model
            // is just still loading weights. Mark emptyResponseHttp200 so the caller
            // can show a banner warning WITHOUT opening the circuit-breaker.
            return {
                ok: false,
                status: res.status,
                note: 'LLM probe returned empty text — Workers AI model is cold-loading. Generation will work once the model warms up.',
                emptyResponseHttp200: true,
            };
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
        pdfConfigured
            ? checkHealth(PDF_WORKER_URL)
            : Promise.resolve({ ok: false, status: 0 } as { ok: boolean; status: number; note?: string }),
        enginedConfigured
            ? probeCVEngineLLM(CV_ENGINE_URL)
            : Promise.resolve({ ok: false, status: 0 } as LLMProbeResult),
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
            coldModel: enginedConfigured ? (engineProbe as LLMProbeResult).emptyResponseHttp200 : false,
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

// ─── In-app event surface ────────────────────────────────────────────────────
// The console log is great for power users, but the average user never opens
// DevTools. We re-publish the result as a `CustomEvent` so a banner component
// (or any other UI) can listen for it and show a friendly message — most
// importantly the daily Cloudflare Workers AI Neuron-quota exhaustion (error
// 4006) which makes every CV generation silently fall back until 00:00 UTC.

export type WorkerStatusReason = 'healthy' | 'quota_exhausted' | 'unreachable' | 'misconfigured' | 'cold_model';

export interface WorkerStatusDetail {
    healthy: boolean;
    reason: WorkerStatusReason;
    message: string;          // Short user-friendly sentence.
    rawNote?: string;         // Original probe note for power users.
}

export const WORKER_STATUS_EVENT = 'procv:worker-status';

// Module-level cache so late-mounting UI (e.g. WorkerStatusBanner that only
// renders after the user leaves the landing page) can read the latest result
// without waiting for the next `runAndPrint`.
let latestStatus: WorkerStatusDetail | null = null;
export function getLatestWorkerStatus(): WorkerStatusDetail | null {
    return latestStatus;
}

function summarise(checks: WorkerCheck[]): WorkerStatusDetail {
    const engine = checks.find((c) => c.name === 'CV Engine Worker');
    if (!engine || !engine.configured) {
        return {
            healthy: false,
            reason: 'misconfigured',
            message: 'AI worker not configured. CV generation will use Gemini/Groq only.',
            rawNote: engine?.note,
        };
    }
    if (engine.reachable) {
        return { healthy: true, reason: 'healthy', message: 'AI worker connected.' };
    }
    // Cold-start: the worker replied HTTP 200 but the LLM returned empty text.
    // The endpoint IS reachable — the model is just still loading weights.
    // This is a transient state; CV generation should be attempted normally
    // and the worker will serve real output once warm.
    if (engine.coldModel) {
        return {
            healthy: false,
            reason: 'cold_model',
            message: 'AI worker is warming up — CV generation will work momentarily. Click "Wake AI models" to speed this up.',
            rawNote: engine.note,
        };
    }
    const note = (engine.note || '').toLowerCase();
    const isQuota = note.includes('4006') || note.includes('neuron') || note.includes('daily free allocation');
    if (isQuota) {
        return {
            healthy: false,
            reason: 'quota_exhausted',
            message: "Today's free AI budget is used up. CV generation will fall back to slower providers until the daily reset at 00:00 UTC.",
            rawNote: engine.note,
        };
    }
    return {
        healthy: false,
        reason: 'unreachable',
        message: 'AI worker is unreachable. CV generation will fall back to Gemini/Groq.',
        rawNote: engine.note,
    };
}

function publish(checks: WorkerCheck[]): void {
    if (typeof window === 'undefined') return;
    const detail = summarise(checks);
    latestStatus = detail;

    // Mirror the diagnostic result into the central providerHealth circuit so
    // every other client (cvEngineClient call sites, banner, etc.) stays in
    // sync. We only care about the CV Engine probe here — the PDF worker has
    // its own healthcheck path and isn't part of the AI provider routing.
    if (detail.reason === 'healthy') {
        markSuccess('cf-worker');
    } else if (detail.reason === 'quota_exhausted' || detail.reason === 'unreachable') {
        markFailure('cf-worker', detail.rawNote || detail.reason);
    }
    // 'cold_model' → HTTP 200 but LLM returned no tokens (model is loading).
    //   The worker IS reachable, so we must NOT open the circuit. We also
    //   must NOT call markSuccess yet (the LLM isn't ready). The circuit
    //   stays in whatever state it was in before this probe ran.
    // 'misconfigured' → no env var; nothing to circuit-break.

    try {
        window.dispatchEvent(new CustomEvent<WorkerStatusDetail>(WORKER_STATUS_EVENT, { detail }));
    } catch {
        /* CustomEvent unsupported — silently ignore. */
    }
}

async function runAndPrint(): Promise<WorkerCheck[]> {
    const checks = await runChecks();
    printReport(checks);
    publish(checks);
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
