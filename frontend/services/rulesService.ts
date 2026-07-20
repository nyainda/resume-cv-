/**
 * rulesService — fetches the CV pipeline rules from the CF Worker at runtime.
 *
 * The sensitive system prompts (SYSTEM_INSTRUCTION_PROFESSIONAL, humanizer,
 * parser, validator, audit rules) are never bundled into the client. They live
 * exclusively as TypeScript constants inside the Cloudflare Worker, compiled
 * and deployed server-side. This file fetches them once per session and caches
 * them in module memory.
 *
 * DevTools Network tab will only show the raw profile/JD data going IN and the
 * finished CV JSON coming OUT. The prompt engineering rules stay opaque.
 */

export interface CVRules {
    version: string;
    systemProfessional: string;
    humanizationRules: string;
    humanizationChecklist: string;
    systemHumanizer: string;
    systemParser: string;
    systemValidator: string;
    systemAudit: string;
    // Generation IP fetched from Worker (never bundled)
    scenarioA: string;
    scenarioB: string;
    scenarioC: string;
    scenarioD: string;
    scenarioModeOverride: string;
    pivotBlockTemplate: string;
    humanizationInstructionHeader: string;
    criticalRulesReminder: string;
    cvDataSchema: string;
}

let _cache: CVRules | null = null;
let _inflight: Promise<CVRules> | null = null;

const ENGINE_URL = (import.meta.env.VITE_CV_ENGINE_URL as string | undefined) || '';

export async function fetchCVRules(): Promise<CVRules> {
    if (_cache) return _cache;
    if (_inflight) return _inflight;

    _inflight = (async (): Promise<CVRules> => {
        // Try the CF Worker URL first (production path).
        // If that fails (worker not yet deployed, CF down, etc.),
        // fall back to the local dev PDF server via the Vite proxy at /api/cv/rules.
        const urls = ENGINE_URL
            ? [`${ENGINE_URL}/api/cv/rules`, '/api/cv/rules']
            : ['/api/cv/rules'];

        for (const url of urls) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(url, {
                    signal: controller.signal,
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' },
                });
                clearTimeout(timer);
                if (res.status === 401) {
                    // Not logged in yet — don't cache, let the next call retry after login.
                    _inflight = null;
                    return OFFLINE_FALLBACK;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rules = (await res.json()) as CVRules;
                _cache = rules;
                return rules;
            } catch {
                // try next URL
            }
        }

        // Genuine network failure — don't cache so the next generation attempt retries.
        console.warn('[RulesService] Could not fetch pipeline rules from any source — using offline fallback.');
        _inflight = null;
        return OFFLINE_FALLBACK;
    })();

    return _inflight;
}

export function getCachedRules(): CVRules | null {
    return _cache;
}

export function invalidateRulesCache(): void {
    _cache = null;
    _inflight = null;
}

const OFFLINE_FALLBACK: CVRules = {
    version: 'offline',
    systemProfessional: 'You are a professional CV writer. Output only valid JSON matching the requested schema.',
    humanizationRules: '',
    humanizationChecklist: '',
    systemHumanizer: 'You are a senior editor. Rewrite professional text to sound natural and human-written. Return only the rewritten text.',
    systemParser: 'You are an expert data parser. Convert unstructured text into accurate JSON. Output ONLY the raw JSON — no markdown, no commentary.',
    systemValidator: 'You are a strict CV quality validator. Return only valid JSON.',
    systemAudit: 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON with keys: summary and experience.',
    // Generation IP — empty offline fallback (no IP exposed in bundle)
    scenarioA: '',
    scenarioB: '',
    scenarioC: '',
    scenarioD: '',
    scenarioModeOverride: '',
    pivotBlockTemplate: '',
    humanizationInstructionHeader: '',
    criticalRulesReminder: '',
    cvDataSchema: 'RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching the schema provided.',
};
