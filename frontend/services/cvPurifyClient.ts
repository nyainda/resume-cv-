/**
 * cvPurifyClient.ts
 *
 * Thin client for the Worker-side purification endpoint.
 * All substitution rules, tense maps, voice profiles, and banned-phrase
 * replacements live exclusively in the Worker — they are NOT in this bundle.
 *
 * POST /api/cv/purify-cv
 *   Body:     { cv: CVData }
 *   Response: { cv: CVData, changes: string[] }
 *
 * Falls back gracefully (returns original cv) if the Worker is unreachable.
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

/**
 * Sends the CV to the Worker's purification endpoint.
 * Runs substitution, tense enforcement, and voice fidelity passes server-side.
 * Returns the cleaned CV (and a list of changes made).
 * On any failure, returns the original CV unchanged so the local pipeline can continue.
 */
export async function remotePrePurify(cv: CVData): Promise<{ cv: CVData; changes: string[]; fromWorker: boolean }> {
    if (!ENGINE_URL || !_circuitAlive()) {
        return { cv, changes: [], fromWorker: false };
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
            return { cv, changes: [], fromWorker: false };
        }

        const data = await res.json() as { cv?: CVData; changes?: string[] };
        if (!data?.cv) {
            console.warn('[PurifyClient] Unexpected response shape — using original cv.');
            return { cv, changes: [], fromWorker: false };
        }

        if (data.changes?.length) {
            console.info(`[PurifyClient] Worker purify: ${data.changes.join(', ')}`);
        }

        return { cv: data.cv, changes: data.changes ?? [], fromWorker: true };

    } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (isAbort) {
            console.warn('[PurifyClient] Worker purify timed out — continuing with local pipeline.');
        } else {
            _openCircuit();
            console.warn('[PurifyClient] Worker purify failed — continuing with local pipeline.', err);
        }
        return { cv, changes: [], fromWorker: false };
    } finally {
        clearTimeout(timer);
    }
}
