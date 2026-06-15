/**
 * cvPurifyClient.ts
 *
 * Thin client for the Worker-side purification endpoint.
 * All substitution rules, tense maps, voice profiles, and banned-phrase
 * replacements live exclusively in the Worker — they are NOT in this bundle.
 *
 * POST /api/cv/purify-cv
 *   Body:     { cv: CVData }
 *   Response: { cv: CVData, changes: string[], gate: WorkerGateResult }
 *
 * Falls back gracefully (returns original cv) if the Worker is unreachable.
 *
 * The `gate` field contains the Worker's final visible-text quality verdict
 * (passed, quality_mode, counts, issues). Callers should check
 * `gate.quality_mode === 'degraded'` to decide whether to trigger a repair pass.
 */

import type { CVData } from '../types';

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const TIMEOUT_MS = 8000;

let _circuitOpen = false;
let _circuitOpenAt = 0;
const CIRCUIT_RESET_MS = 60_000;

function _circuitAlive(): boolean {
    if (!_circuitOpen) return true;
    if (Date.now() - _circuitOpenAt > CIRCUIT_RESET_MS) {
        _circuitOpen = false;
        return true;
    }
    return false;
}

function _openCircuit(): void {
    _circuitOpen = true;
    _circuitOpenAt = Date.now();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkerGateIssue {
    field:    string;
    issue:    string;
    text:     string;
    severity: 'critical' | 'high' | 'medium';
}

export interface WorkerGateResult {
    passed:       boolean;
    quality_mode: 'full' | 'degraded';
    counts:       { critical: number; high: number; medium: number };
    issues:       WorkerGateIssue[];
}

export interface RemotePurifyResult {
    cv:          CVData;
    changes:     string[];
    gate:        WorkerGateResult | null;
    fromWorker:  boolean;
}

// ── Null gate sentinel — used when worker is unreachable ──────────────────────
const NULL_GATE: WorkerGateResult = {
    passed:       true,
    quality_mode: 'full',
    counts:       { critical: 0, high: 0, medium: 0 },
    issues:       [],
};

/**
 * Sends the CV to the Worker's purification endpoint.
 * Runs substitution, tense enforcement, and voice fidelity passes server-side.
 * Also runs the final visible-text gate (scans all fields for critical issues).
 *
 * Returns the cleaned CV, a list of changes made, and the gate verdict.
 * On any failure, returns the original CV unchanged so the local pipeline
 * can continue — gate is null when the worker was unreachable.
 */
export async function remotePrePurify(cv: CVData): Promise<RemotePurifyResult> {
    if (!ENGINE_URL || !_circuitAlive()) {
        return { cv, changes: [], gate: null, fromWorker: false };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${ENGINE_URL}/api/cv/purify-cv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cv }),
            signal: ctrl.signal,
        });

        if (!res.ok) {
            if (res.status >= 500) _openCircuit();
            console.warn(`[PurifyClient] Worker returned ${res.status} — falling back to local pipeline.`);
            return { cv, changes: [], gate: null, fromWorker: false };
        }

        const data = await res.json() as { cv?: CVData; changes?: string[]; gate?: WorkerGateResult };
        if (!data?.cv) {
            console.warn('[PurifyClient] Unexpected response shape — using original cv.');
            return { cv, changes: [], gate: null, fromWorker: false };
        }

        const gate: WorkerGateResult = data.gate ?? NULL_GATE;

        if (data.changes?.length) {
            console.info(`[PurifyClient] Worker purify: ${data.changes.join(', ')}`);
        }

        if (!gate.passed) {
            console.warn(
                `[PurifyClient] Gate FAILED — quality_mode=${gate.quality_mode}, ` +
                `critical=${gate.counts.critical}, high=${gate.counts.high}, medium=${gate.counts.medium}. ` +
                `Issues: ${gate.issues.map(i => `${i.field}:${i.issue}`).join(', ')}`,
            );
        }

        return { cv: data.cv, changes: data.changes ?? [], gate, fromWorker: true };

    } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (isAbort) {
            console.warn('[PurifyClient] Worker purify timed out — continuing with local pipeline.');
        } else {
            _openCircuit();
            console.warn('[PurifyClient] Worker purify failed — continuing with local pipeline.', err);
        }
        return { cv, changes: [], gate: null, fromWorker: false };
    } finally {
        clearTimeout(timer);
    }
}
