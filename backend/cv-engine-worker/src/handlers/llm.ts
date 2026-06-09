/// <reference types="@cloudflare/workers-types" />
import { Env } from '../types';
import { json, safeJson, clamp } from '../utils';
import {
    _CV_SYSTEM_PROFESSIONAL,
    _CV_SYSTEM_HUMANIZER,
    _CV_SYSTEM_PARSER,
    _CV_SYSTEM_VALIDATOR,
    _CV_SYSTEM_AUDIT,
} from './purify';

// ─── Legacy LLM proxy (Llama 70B) ────────────────────────────────────────────
const WORKER_LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WORKER_LLM_MAX_PROMPT_CHARS = 60000;
const WORKER_LLM_MAX_SYSTEM_CHARS = 4000;
const WORKER_LLM_DEFAULT_MAX_TOKENS = 4096;
const WORKER_LLM_HARD_MAX_TOKENS = 12000;

export async function handleLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const system = typeof body?.system === 'string' ? body.system.slice(0, WORKER_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, WORKER_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.2), 0, 1);
    const maxTokens = clamp(
        Number(body?.maxTokens ?? WORKER_LLM_DEFAULT_MAX_TOKENS),
        64,
        WORKER_LLM_HARD_MAX_TOKENS,
    );

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    try {
        const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens };
        if (wantsJson) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(WORKER_LLM_MODEL as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (!text) return json({ error: 'llm_empty', model: WORKER_LLM_MODEL }, request, env, 502);
        return json({ text, model: WORKER_LLM_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'llm_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

// ─── Vision extract ───────────────────────────────────────────────────────────
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_MAX_PROMPT_CHARS = 4000;
const VISION_DEFAULT_MAX_TOKENS = 4096;
const VISION_HARD_MAX_TOKENS = 8192;

export async function handleVisionExtract(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const base64 = typeof body?.image === 'string' ? body.image : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, VISION_MAX_PROMPT_CHARS) : '';

    if (!base64 || !prompt) return json({ error: 'missing_image_or_prompt' }, request, env, 400);
    if (mimeType && !/^image\//i.test(mimeType)) {
        return json({ error: 'unsupported_mime', mimeType, hint: 'Llama Vision accepts images only. PDFs must be rasterized first or routed to Gemini.' }, request, env, 415);
    }

    let bytes: Uint8Array;
    try {
        const clean = base64.replace(/^data:[^;]+;base64,/, '');
        const bin = atob(clean);
        if (bin.length > VISION_MAX_IMAGE_BYTES) {
            return json({ error: 'image_too_large', maxBytes: VISION_MAX_IMAGE_BYTES }, request, env, 413);
        }
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
        return json({ error: 'invalid_base64' }, request, env, 400);
    }

    const maxTokens = clamp(Number(body?.maxTokens ?? VISION_DEFAULT_MAX_TOKENS), 64, VISION_HARD_MAX_TOKENS);

    try {
        const res: any = await env.AI.run(VISION_MODEL as any, {
            prompt,
            image: Array.from(bytes),
            max_tokens: maxTokens,
        } as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.description === 'string') text = res.description;
        else if (typeof res?.result?.response === 'string') text = res.result.response;

        if (!text) return json({ error: 'vision_empty', model: VISION_MODEL }, request, env, 502);
        return json({ text, model: VISION_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'vision_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

// ─── Tiered LLM ───────────────────────────────────────────────────────────────

export const TIERED_MODEL_MAP: Record<string, { model: string; tier: number; free: boolean; description: string }> = {
    jdDeepAnalysis:       { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Deep JD intelligence + gap analysis — DeepSeek-R1 32B' },
    gapAnalysis:          { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Candidate ↔ JD gap analysis — DeepSeek-R1 32B' },
    corpusConfidence:     { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Corpus candidate confidence scoring — DeepSeek-R1 32B' },
    voiceScoring:         { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'Voice scoring vs JD + field + seniority — Llama 70B' },
    jdKeywords:           { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'JD keyword extraction, tier 1/2/3 classification — Llama 70B' },
    cvGenerate:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Main CV JSON generation — Mistral Small 3.1 24B (FREE)' },
    cvGenerateLong:       { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Long-context CV generation — Mistral Small 3.1 24B (FREE)' },
    cvExperience:         { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV experience bullets — Mistral Small 3.1 24B (FREE)' },
    cvProjects:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV projects section — Mistral Small 3.1 24B (FREE)' },
    cvAudit:              { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Post-generation humanizer audit — Mistral Small 3.1 24B (FREE)' },
    cvValidate:           { model: '@cf/meta/llama-3.1-8b-instruct',               tier: 2, free: true,  description: 'Strict CV quality validator — Llama 3.1 8B (FREE)' },
    parser:               { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Word/GitHub profile JSON parser — Mistral Small 3.1 24B (FREE)' },
    cvSummary:            { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV professional summary — Mistral Small 3.1 24B (FREE)' },
    cvSkills:             { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV skills list — IBM Granite 4.0 Micro (FREE)' },
    cvEducation:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV education section — IBM Granite 4.0 Micro (FREE)' },
    cvFallback:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Section-parallel fallback — Mistral Small 3.1 24B (FREE)' },
    rhythmSelection:      { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 2, free: true,  description: 'Rhythm pattern selection per role type (FREE)' },
    seniorityDetect:      { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 2, free: true,  description: 'Seniority + field detection from JD — Llama 3.2 3B (FREE)' },
    multilingualGenerate: { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Multilingual CV text generation — Mistral Small 3.1 24B (FREE)' },
    bannedCheck:          { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Banned phrase check — Llama 3.2 3B (FREE)' },
    tenseCheck:           { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Tense consistency enforcement — Llama 3.2 3B (FREE)' },
    voiceConsistency:     { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Voice consistency per bullet — Hermes-2 Pro 7B (FREE)' },
    verbRepeatCheck:      { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Verb repetition check — Granite 4.0 Micro (FREE)' },
    rhythmCheck:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Rhythm compliance check — Granite 4.0 Micro (FREE)' },
    candidateDedup:       { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Dedup check for corpus candidates — Llama 3.2 3B (FREE)' },
    corpusCrawl:          { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Source page crawling + extraction — Hermes-2 Pro (FREE)' },
    jdParse:              { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'JD keyword + company + title extraction — Granite 4.0 Micro (FREE)' },
    humanize:             { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Plain-text humanizer — Hermes-2 Pro 7B (FREE)' },
    coverLetter:          { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Cover letter generation — Mistral Small 3.1 24B (FREE)' },
    general:              { model: '@cf/meta/llama-3.1-8b-instruct',               tier: 3, free: true,  description: 'General purpose fallback — Llama 3.1 8B (FREE)' },
};

const PAID_UPGRADE_MAP: Record<string, string> = {
    cvGenerate:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvGenerateLong: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvExperience:   '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvProjects:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvSummary:      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

export const TIERED_LLM_MAX_PROMPT_CHARS  = 100000;
export const TIERED_LLM_MAX_SYSTEM_CHARS  = 6000;
export const TIERED_LLM_DEFAULT_MAX_TOKENS = 2048;
export const TIERED_LLM_HARD_MAX_TOKENS   = 8192;

export async function handleTieredLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const taskKey     = typeof body?.task === 'string' ? body.task.trim() : 'general';
    const paidUpgrade = body?.paidUpgrade === true;
    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
    };
    const system = _internalSystemMap[taskKey] ?? '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
    const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
    const model       = upgradedModel ?? baseMapping.model;
    const { tier, free: baseFree, description } = baseMapping;
    const free        = upgradedModel ? false : baseFree;

    const wantsJson  = body?.json === true;
    const wantStream = body?.stream === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(
        Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS),
        64,
        TIERED_LLM_HARD_MAX_TOKENS,
    );

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
    messages.push({ role: 'user', content: prompt });

    // ── Streaming path ────────────────────────────────────────────────────────
    if (wantStream) {
        try {
            const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens, stream: true };
            const streamRes: any = await env.AI.run(model as any, payload as any);
            if (!streamRes || typeof streamRes[Symbol.asyncIterator] !== 'function') {
                throw new Error('model did not return an async iterator');
            }

            const { readable, writable } = new TransformStream();
            const writer  = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            void (async () => {
                try {
                    let buf = '';
                    for await (const chunk of streamRes as AsyncIterable<Uint8Array>) {
                        buf += decoder.decode(chunk, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const raw = line.slice(6).trim();
                            if (!raw || raw === '[DONE]') continue;
                            try {
                                const evt = JSON.parse(raw) as any;
                                const text: string =
                                    evt?.response ??
                                    evt?.choices?.[0]?.delta?.content ??
                                    '';
                                if (text) {
                                    const norm = JSON.stringify({
                                        type:  'content_block_delta',
                                        delta: { type: 'text_delta', text },
                                    });
                                    await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                }
                            } catch { /* ignore */ }
                        }
                    }
                } finally {
                    await writer.close().catch(() => {});
                }
            })();

            return new Response(readable, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
            });
        } catch (e: any) {
            return json({ error: 'stream_failed', message: String(e?.message || e), model, task: taskKey }, request, env, 502);
        }
    }

    // ── Non-streaming path ────────────────────────────────────────────────────
    try {
        const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) return json({ error: 'llm_empty', model, task: taskKey, tier, free }, request, env, 502);
        return json({ text, model, task: taskKey, tier, free, description }, request, env);
    } catch (e: any) {
        return json({ error: 'llm_failed', message: String(e?.message || e), model, task: taskKey, tier, free }, request, env, 502);
    }
}

// ─── Race LLM ─────────────────────────────────────────────────────────────────
const RACE_LLM_MAX_CANDIDATES = 3;

export async function handleRaceLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const tasks: string[] = Array.isArray(body?.tasks)
        ? body.tasks.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, RACE_LLM_MAX_CANDIDATES)
        : [];
    if (tasks.length < 2) return json({ error: 'need_at_least_two_tasks' }, request, env, 400);

    const paidUpgrade = body?.paidUpgrade === true;
    const system = typeof body?.system === 'string' ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson  = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS), 64, TIERED_LLM_HARD_MAX_TOKENS);

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction) : system;

    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) baseMessages.push({ role: 'system', content: effectiveSystem });
    baseMessages.push({ role: 'user', content: prompt });

    const t0 = Date.now();

    const runOne = async (taskKey: string) => {
        const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
        const model = upgradedModel ?? baseMapping.model;
        const { tier, free: baseFree, description } = baseMapping;
        const free = upgradedModel ? false : baseFree;

        const payload: Record<string, unknown> = { messages: baseMessages, temperature, max_tokens: maxTokens };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${taskKey}`);

        return { text, task: taskKey, model, tier, free, description };
    };

    const candidates = tasks.map(runOne);
    try {
        const winner = await Promise.any(candidates);
        const raceMs = Date.now() - t0;
        return json({ ...winner, raceMs, candidates: tasks.length }, request, env);
    } catch (e: any) {
        const reasons = e?.errors?.map((x: any) => String(x?.message || x)) ?? [String(e?.message || e)];
        return json({ error: 'all_candidates_failed', tasks, reasons }, request, env, 502);
    }
}

// ─── Parallel sections ────────────────────────────────────────────────────────
const PARALLEL_SECTIONS_MAX_COUNT       = 8;
const PARALLEL_SECTIONS_DEFAULT_FALLBACK = 'cvFallback';
const PARALLEL_SECTIONS_INSTRUCTION_MAX  = 6000;
const PARALLEL_SECTIONS_PREAMBLE_MAX     = TIERED_LLM_MAX_PROMPT_CHARS;

interface ParallelSectionInput {
    name: string;
    task: string;
    instruction: string;
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
}

interface ParallelSectionResult {
    text: string;
    model: string;
    task: string;
    ms: number;
    fellBack: boolean;
    error?: string;
}

export async function handleParallelSections(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const system      = _CV_SYSTEM_PROFESSIONAL;
    const profileHash = typeof body?.profile_hash === 'string' ? body.profile_hash.trim() : '';
    const rawPreamble = typeof body?.preamble === 'string' ? body.preamble.slice(0, PARALLEL_SECTIONS_PREAMBLE_MAX) : '';
    const fallbackTask: string = typeof body?.fallbackTask === 'string' && body.fallbackTask.trim()
        ? body.fallbackTask.trim()
        : PARALLEL_SECTIONS_DEFAULT_FALLBACK;

    let preamble = rawPreamble;
    const PROFILE_PLACEHOLDER = '{{PROFILE}}';
    if (profileHash && preamble.includes(PROFILE_PLACEHOLDER)) {
        try {
            const row = await env.CV_DB.prepare(
                `SELECT compact_json FROM profile_cache WHERE hash = ?`
            ).bind(profileHash).first<{ compact_json: string }>();

            if (row?.compact_json) {
                preamble = preamble.replaceAll(PROFILE_PLACEHOLDER, row.compact_json);
                const now = Math.floor(Date.now() / 1000);
                env.CV_DB.prepare(
                    `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE hash = ?`
                ).bind(now, profileHash).run().catch(() => {});
            }
        } catch {
            // D1 read failure — leave preamble as-is
        }
    }

    const rawSections: any[] = Array.isArray(body?.sections) ? body.sections : [];
    if (rawSections.length === 0) return json({ error: 'missing_sections' }, request, env, 400);

    const sections: ParallelSectionInput[] = rawSections
        .slice(0, PARALLEL_SECTIONS_MAX_COUNT)
        .map((s: any) => ({
            name:        String(s?.name || '').trim(),
            task:        String(s?.task || 'general').trim(),
            instruction: String(s?.instruction || '').slice(0, PARALLEL_SECTIONS_INSTRUCTION_MAX),
            maxTokens:   Number.isFinite(s?.maxTokens) ? clamp(Number(s.maxTokens), 64, TIERED_LLM_HARD_MAX_TOKENS) : 1024,
            temperature: Number.isFinite(s?.temperature) ? clamp(Number(s.temperature), 0, 1) : 0.4,
            json:        s?.json === true,
        }))
        .filter(s => s.name && s.instruction);

    if (sections.length === 0) return json({ error: 'no_valid_sections' }, request, env, 400);

    const names = new Set<string>();
    for (const s of sections) {
        if (names.has(s.name)) return json({ error: 'duplicate_section_name', name: s.name }, request, env, 400);
        names.add(s.name);
    }

    const t0 = Date.now();

    const callOnce = async (
        sec: ParallelSectionInput,
        taskKey: string,
    ): Promise<{ text: string; model: string }> => {
        const mapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const { model } = mapping;

        const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
        const wantsJson = sec.json === true;
        const effectiveSystem = wantsJson
            ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
            : system;

        const userContent = preamble
            ? preamble + '\n\n──── SECTION: ' + sec.name.toUpperCase() + ' ────\n' + sec.instruction
            : sec.instruction;

        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
        messages.push({ role: 'user', content: userContent });

        const payload: Record<string, unknown> = {
            messages,
            temperature: sec.temperature ?? 0.4,
            max_tokens:  sec.maxTokens ?? 1024,
        };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${sec.name}`);

        return { text, model };
    };

    const runSection = async (sec: ParallelSectionInput): Promise<[string, ParallelSectionResult]> => {
        const sectionStart = Date.now();
        try {
            const out = await callOnce(sec, sec.task);
            return [sec.name, { text: out.text, model: out.model, task: sec.task, ms: Date.now() - sectionStart, fellBack: false }];
        } catch (primaryErr: any) {
            try {
                const out = await callOnce(sec, fallbackTask);
                return [sec.name, { text: out.text, model: out.model, task: fallbackTask, ms: Date.now() - sectionStart, fellBack: true }];
            } catch (fallbackErr: any) {
                return [sec.name, {
                    text: '', model: '', task: sec.task, ms: Date.now() - sectionStart, fellBack: false,
                    error: `primary=${String(primaryErr?.message || primaryErr).slice(0, 120)}; fallback=${String(fallbackErr?.message || fallbackErr).slice(0, 120)}`,
                }];
            }
        }
    };

    const settled = await Promise.all(sections.map(runSection));
    const results: Record<string, ParallelSectionResult> = {};
    const errors: Array<{ section: string; message: string }> = [];
    for (const [name, r] of settled) {
        results[name] = r;
        if (r.error) errors.push({ section: name, message: r.error });
    }

    const allFailed = settled.every(([, r]) => !r.text);
    if (allFailed) return json({ error: 'all_sections_failed', errors, totalMs: Date.now() - t0 }, request, env, 502);

    return json({ ok: true, totalMs: Date.now() - t0, results, errors }, request, env);
}

// ─── Proxy LLM (Claude / Gemini / OpenRouter) ─────────────────────────────────

const PROXY_MAX_PROMPT_CHARS  = 100000;
const PROXY_MAX_SYSTEM_CHARS  = 8000;
const PROXY_DEFAULT_MAX_TOKENS = 4096;
const PROXY_HARD_MAX_TOKENS   = 16000;

export async function handleProxyLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const provider = typeof body?.provider === 'string' ? body.provider.toLowerCase().trim() : '';
    const apiKey   = typeof body?.apiKey   === 'string' ? body.apiKey.trim()                 : '';
    const model    = typeof body?.model    === 'string' ? body.model.trim()                  : '';
    const prompt   = typeof body?.prompt   === 'string' ? body.prompt.slice(0, PROXY_MAX_PROMPT_CHARS) : '';
    const task     = typeof body?.task     === 'string' ? body.task.trim()                   : '';
    const wantJson = body?.json === true;
    const wantStream = body?.stream === true;
    const useSearch  = body?.useSearch === true;

    if (!provider || !apiKey || !prompt) {
        return json({ error: 'missing_fields', required: ['provider', 'apiKey', 'prompt'] }, request, env, 400);
    }
    if (!['claude', 'gemini', 'openrouter', 'together', 'cerebras'].includes(provider)) {
        return json({ error: 'unsupported_provider', allowed: ['claude', 'gemini', 'openrouter', 'together', 'cerebras'] }, request, env, 400);
    }

    const temperature = clamp(Number(body?.temperature ?? 0.4), 0, 1);
    const maxTokens   = clamp(Number(body?.maxTokens ?? PROXY_DEFAULT_MAX_TOKENS), 64, PROXY_HARD_MAX_TOKENS);

    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
        cvSummary:        _CV_SYSTEM_PROFESSIONAL,
    };
    const system = task && _internalSystemMap[task]
        ? _internalSystemMap[task]
        : typeof body?.system === 'string'
            ? body.system.slice(0, PROXY_MAX_SYSTEM_CHARS)
            : '';

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantJson && !useSearch
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    try {
        // ── Claude ────────────────────────────────────────────────────────────
        if (provider === 'claude') {
            const claudeModel = model || 'claude-3-5-haiku-20241022';

            const claudeBody: Record<string, unknown> = {
                model: claudeModel,
                max_tokens: maxTokens,
                temperature,
                messages: [{ role: 'user', content: prompt }],
            };
            if (effectiveSystem) claudeBody.system = effectiveSystem;

            if (wantStream) {
                claudeBody.stream = true;
                const sRes = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify(claudeBody),
                });
                if (!sRes.ok || !sRes.body) {
                    const errText = await sRes.text().catch(() => '');
                    return json({ error: 'claude_stream_failed', status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
                }
                return new Response(sRes.body, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
                });
            }

            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(claudeBody),
            });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({ error: 'upstream_error', message: raw.slice(0, 200), status: res.status }, request, env, errStatus);
            }
            const data = await res.json() as any;
            const text: string = data?.content?.[0]?.text ?? '';
            if (!text) return json({ error: 'empty_response' }, request, env, 502);
            return json({ text, model: claudeModel, provider: 'claude' }, request, env);
        }

        // ── OpenRouter / Together / Cerebras ─────────────────────────────────
        if (['openrouter', 'together', 'cerebras'].includes(provider)) {
            const baseUrls: Record<string, string> = {
                openrouter: 'https://openrouter.ai/api/v1/chat/completions',
                together:   'https://api.together.xyz/v1/chat/completions',
                cerebras:   'https://api.cerebras.ai/v1/chat/completions',
            };
            const baseUrl = baseUrls[provider];
            const resolvedModel = model || (provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free');

            const msgs: Array<{ role: string; content: string }> = [];
            if (effectiveSystem) msgs.push({ role: 'system', content: effectiveSystem });
            msgs.push({ role: 'user', content: prompt });

            const oaiBody: Record<string, unknown> = {
                model: resolvedModel,
                messages: msgs,
                max_tokens: maxTokens,
                temperature,
            };
            if (wantJson) oaiBody.response_format = { type: 'json_object' };

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://procv.app';
                headers['X-Title'] = 'ProCV';
            }

            if (wantStream) {
                oaiBody.stream = true;
                const sRes = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(oaiBody) });
                if (!sRes.ok || !sRes.body) {
                    const errText = await sRes.text().catch(() => '');
                    return json({ error: `${provider}_stream_failed`, status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
                }
                const { readable, writable } = new TransformStream();
                const writer  = writable.getWriter();
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                void (async () => {
                    let buf = '';
                    try {
                        const reader = sRes.body!.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop() ?? '';
                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const raw = line.slice(6).trim();
                                if (!raw || raw === '[DONE]') continue;
                                try {
                                    const evt = JSON.parse(raw) as any;
                                    const text: string = evt?.choices?.[0]?.delta?.content ?? '';
                                    if (text) {
                                        const norm = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
                                        await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    } finally {
                        await writer.close().catch(() => {});
                    }
                })();

                return new Response(readable, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
                });
            }

            const res = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(oaiBody) });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({ error: 'upstream_error', message: raw.slice(0, 200), status: res.status }, request, env, errStatus);
            }
            const data = await res.json() as any;
            const text: string = data?.choices?.[0]?.message?.content ?? '';
            if (!text) return json({ error: 'empty_response' }, request, env, 502);
            return json({ text, model: resolvedModel, provider }, request, env);
        }

        // ── Gemini ────────────────────────────────────────────────────────────
        const geminiModel = model || 'gemini-2.0-flash';
        const geminiBody: Record<string, unknown> = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(wantJson && !useSearch ? { responseMimeType: 'application/json' } : {}),
            },
        };
        if (effectiveSystem) geminiBody.systemInstruction = { parts: [{ text: effectiveSystem }] };
        if (useSearch) geminiBody.tools = [{ googleSearch: {} }];

        if (wantStream && !useSearch) {
            const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
            const sRes = await fetch(streamUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(geminiBody),
            });
            if (!sRes.ok || !sRes.body) {
                const errText = await sRes.text().catch(() => '');
                return json({ error: 'gemini_stream_failed', status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
            }
            const { readable, writable } = new TransformStream();
            const writer  = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            void (async () => {
                let buf = '';
                try {
                    const reader = sRes.body!.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const raw = line.slice(6).trim();
                            if (!raw || raw === '[DONE]') continue;
                            try {
                                const evt = JSON.parse(raw) as any;
                                const text: string = evt?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                                if (text) {
                                    const norm = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
                                    await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                }
                            } catch { /* ignore */ }
                        }
                    }
                } finally {
                    await writer.close().catch(() => {});
                }
            })();

            return new Response(readable, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
            });
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(geminiBody),
        });
        if (!res.ok) {
            const raw = await res.text().catch(() => '');
            let msg = '';
            try { msg = (JSON.parse(raw) as any)?.error?.message || ''; } catch { /**/ }
            const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
            return json({ error: 'upstream_error', message: msg || `Gemini error ${res.status}`, status: res.status }, request, env, errStatus);
        }
        const data = await res.json() as any;
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) return json({ error: 'empty_response' }, request, env, 502);
        return json({ text, model: geminiModel, provider: 'gemini' }, request, env);

    } catch (err: any) {
        return json({ error: 'proxy_error', message: String(err?.message || err) }, request, env, 502);
    }
}

// ─── Account tier probe ───────────────────────────────────────────────────────

export async function handleAccountTier(request: Request, env: Env): Promise<Response> {
    const PAID_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    try {
        const res: any = await env.AI.run(PAID_MODEL as any, {
            messages: [
                { role: 'system', content: 'Reply with the single word: ok' },
                { role: 'user',   content: 'ping' },
            ],
            temperature: 0,
            max_tokens: 4,
        });
        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text.trim()) return json({ tier: 'paid', model: PAID_MODEL }, request, env);
        return json({ tier: 'free', model: PAID_MODEL, note: 'paid model returned empty — likely free tier' }, request, env);
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        const isQuota = msg.includes('4006') || msg.toLowerCase().includes('neuron') || msg.toLowerCase().includes('quota');
        return json({ tier: 'free', model: PAID_MODEL, note: isQuota ? 'neuron quota exhausted' : msg.slice(0, 120) }, request, env);
    }
}
