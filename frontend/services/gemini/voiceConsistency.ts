/**
 * Voice consistency enforcement against engine brief.
 */

import { CVData } from '../../types';
import { type CVBrief, workerTieredLLM } from '../cvEngineClient';
import { groqChat, GROQ_FAST } from '../groqService';
import { shuffleArray } from './varianceHelpers';


// ─────────────────────────────────────────────────────────────────────────────
// Voice consistency enforcement — validates generated bullets against the
// brief and rewrites failing ones via a single targeted Groq call per role.
// ─────────────────────────────────────────────────────────────────────────────

// Verbs that are technically valid English but read as obviously off-key on a
// professional CV. The CV-engine seed contains them (Critiques→Critiqued,
// Bylines→Bylined, Synthesises→Synthesised, Mobilises→Mobilised, …). When the
// voice-rewriter receives them in the verb pool, it sometimes builds bullets
// like "Critiqued rigorous testing protocols" or "Bylined technical reports".
// Filter them out client-side so the rewriter can only choose tasteful options.
const OBSCURE_CV_VERBS = new Set([
    'critiqued', 'critique', 'critiques',
    'bylined', 'byline', 'bylines',
    'synthesised', 'synthesized', 'synthesises', 'synthesizes',
    'mobilised', 'mobilized', 'mobilises', 'mobilizes',
    're-emphasised', 're-emphasized', 're-emphasises', 're-emphasizes',
    'reemphasised', 'reemphasized',
    'enlisted', 'enlist', 'enlists',
    'galvanised', 'galvanized', 'galvanises', 'galvanizes',
    'rallied', 'rally', 'rallies',
    'op-edded', 'opedded',
    'ghost-wrote', 'ghostwrote',
    'box-plotted', 'boxplotted',
    'histogrammed',
    'wireframed', 'mocked',
    'composed', 'compose', 'composes',
    're-articulated', 'rearticulated', 're-articulates', 'rearticulates',
    'debriefed', 'debrief', 'debriefs',
    'taught',
]);

export function filterTastefulVerbs(verbs: string[]): string[] {
    return verbs.filter(v => v && !OBSCURE_CV_VERBS.has(v.trim().toLowerCase()));
}

export async function enforceVoiceConsistency(cvData: CVData, brief: CVBrief): Promise<void> {
    const roles = cvData.experience || [];
    // ── Priority 1: Verb pool — shuffle + take 16 for enforcement ────────────
    // Voice enforcement needs slightly more verbs than generation (16 vs 12)
    // because it fixes EXISTING bullets that already used some verbs, so we
    // need headroom for non-repeating replacements across multiple roles.
    // Still shuffled so the enforcement verb set differs from the generation set.
    const rawVerbs = shuffleArray(brief.verb_pool.slice(0, 40)).map(v => v.verb_past || v.verb);
    const tastefulVerbs = filterTastefulVerbs(rawVerbs).slice(0, 16);
    const verbList = tastefulVerbs.join(', ');
    const droppedVerbs = rawVerbs.filter(v => !tastefulVerbs.includes(v));
    if (droppedVerbs.length > 0) {
        console.log(`[CV Engine] Voice enforcement: filtered ${droppedVerbs.length} obscure verb(s) from pool:`, droppedVerbs);
    }
    // ── Priority 3: Rotate forbidden phrases — different 20 per enforcement run
    const forbidden = shuffleArray(brief.forbidden_phrases).slice(0, 20).join(', ');
    const avoidedVerbs = (brief.field?.avoided_verbs || []).join(', ') || 'none';
    const voice = brief.voice.primary;

    // ── Phase B speed: per-role validate+fix is now PARALLEL ──
    // Each role mutates a different `role.responsibilities` array, so there's
    // no shared state to race. Going from sequential to Promise.all turns
    // 3 roles × ~30 s each → ~30 s total instead of ~90 s.
    const processRole = async (role: typeof roles[number]): Promise<{ fixed: number; ran: boolean }> => {
        const bullets = role.responsibilities || [];
        if (bullets.length < 2) return { fixed: 0, ran: false };

        const result: ValidateVoiceResult | null = await validateVoice(bullets, brief);

        // ── Local repeated-word check (architecture doc Fix 5) ──
        const overused = findOverusedWords(bullets, 5);
        const overusedByBullet: Record<number, string[]> = {};
        for (const w of overused) {
            for (const idx of (w.bulletIndices || [])) {
                (overusedByBullet[idx] = overusedByBullet[idx] || []).push(
                    `replace overused word "${w.word}" (used ${w.count}× in this role) with a synonym or restructure the sentence to drop it`
                );
            }
        }
        const overusedFailing = Object.keys(overusedByBullet).map(n => Number(n));

        if ((!result || result.passed) && overusedFailing.length === 0) return { fixed: 0, ran: false };

        const remoteFailing = result?.failing_bullets || [];
        const failing = Array.from(new Set([...remoteFailing, ...overusedFailing])).sort((a, b) => a - b);
        if (failing.length === 0) return { fixed: 0, ran: false };

        const issuesByBullet: Record<number, string[]> = {};
        for (const issue of (result?.issues || [])) {
            if (issue.bullet === undefined) continue;
            const key = issue.bullet as number;
            const note =
                issue.issue === 'forbidden_phrase' ? `remove forbidden phrase "${(issue as any).phrase}"` :
                issue.issue === 'avoided_verb_for_field' ? `verb "${(issue as any).verb}" is wrong for this field — replace it` :
                issue.issue === 'verb_outside_pool' ? `verb "${(issue as any).verb}" is not in the approved pool — pick from the pool` :
                issue.issue === 'repeated_verb' ? `verb "${(issue as any).verb}" is repeated — pick a different approved verb` :
                issue.issue === 'information_density' ? `bullet is information-thin (${(issue as any).score ?? 0}/5 signals: ${((issue as any).signals || []).join(', ') || 'none'}). Add missing factual context, method, scope, or outcome using only the original meaning — never invent facts or numbers` :
                // ── Priority 2: rhythm_drift is now advisory only ──────────
                // We switched to constraint-mode rhythm (≥1 punchy + ≥1 narrative,
                // no 3 same in a row) so individual bullet length mismatches against
                // the old fixed sequence are expected and valid. The purification
                // pipeline's bullet_band_imbalance check still catches gross
                // imbalance (all same length). Skip per-bullet rewrites here.
                issue.issue === 'rhythm_drift' ? null :
                issue.issue;
            // Skip null notes (rhythm_drift is advisory-only now)
            if (note !== null) {
                (issuesByBullet[key] = issuesByBullet[key] || []).push(note);
            }
        }
        for (const [idxStr, notes] of Object.entries(overusedByBullet)) {
            const idx = Number(idxStr);
            (issuesByBullet[idx] = issuesByBullet[idx] || []).push(...notes);
        }

        const fixList = failing.map(i => `  ${i + 1}. ORIGINAL: "${bullets[i]}"\n     FIX: ${(issuesByBullet[i] || ['general voice mismatch']).join('; ')}`).join('\n');

        const fixPrompt = `You are rewriting CV bullet points to match a strict voice brief. Return ONLY a JSON object: {"fixes": [{"index": <number>, "bullet": "<rewritten>"}]}.

ROLE: ${role.jobTitle} @ ${role.company}

VOICE BRIEF:
- Voice: ${voice?.name || 'neutral'} (${voice?.tone || ''}), verbosity ${voice?.verbosity_level ?? 3}/5, metric preference ${voice?.metric_preference || 'medium'}.
- Rhythm constraints: each role must have ≥1 punchy bullet (≤14 words) and ≥1 narrative bullet (≥25 words); avoid 3+ consecutive bullets of the same length class. The exact sequence is your choice — vary it.
- APPROVED VERB POOL (must start each fixed bullet with one of these, never repeating across the role): ${verbList}.
- FIELD-AVOIDED VERBS (never use): ${avoidedVerbs}.
- FORBIDDEN PHRASES (zero tolerance): ${forbidden}.

ALL BULLETS IN THIS ROLE (for context, do not duplicate other verbs):
${bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}

REWRITE THESE BULLETS (return them in the fixes array, indexed from 1):
${fixList}

Rules: keep the original meaning and any real metrics, fix the listed issues, do not add fabricated data, match the voice & rhythm targets, return only the listed indices.
- OPENER DIVERSITY (enforce while rewriting): if this role currently has ≥3 consecutive verb-led bullets or >70% verb-led bullets, vary at least 1 rewritten bullet to open with a non-verb frame — scope ("For N clients,…"), context ("As the [role],…"), collaboration ("With the [team/department],…"), timeframe ("Over the [period],…"), or a leading number ("N projects…"). Do NOT invent facts to do this — reshape the existing content.`;

        try {
            const voiceFixSystem = 'You are a precise CV editor that returns only valid JSON.';
            const stripFencesVoice = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            let raw: string | null = null;
            if (getSelectedProvider() === 'workers-ai') {
                try {
                    raw = await workerTieredLLM('voiceConsistency', fixPrompt, {
                        system: voiceFixSystem,
                        temperature: 0.4,
                        json: true,
                        maxTokens: 1200,
                        timeoutMs: 30000,
                    });
                    if (raw && import.meta.env.DEV) console.log(`[CV Engine] Voice fix via Workers AI — ${role.jobTitle}.`);
                } catch (cfErr) {
                    console.warn('[CV Engine] Workers AI voice fix failed, falling back to selected provider:', cfErr);
                }
            }
            if (!raw) raw = await groqChat(GROQ_FAST, voiceFixSystem, fixPrompt, { temperature: 0.4, json: true, maxTokens: 1200, task: 'voiceConsistency' });
            const parsed = JSON.parse(stripFencesVoice(raw ?? '{}'));
            const fixes: Array<{ index: number; bullet: string }> = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
            let fixed = 0;
            for (const f of fixes) {
                const idx = (f.index ?? 0) - 1;
                if (idx >= 0 && idx < bullets.length && typeof f.bullet === 'string' && f.bullet.trim()) {
                    bullets[idx] = f.bullet.trim();
                    fixed++;
                }
            }
            role.responsibilities = bullets;
            return { fixed, ran: true };
        } catch (e) {
            if (import.meta.env.DEV) console.warn(`[CV Engine] Voice fix failed for role ${role.jobTitle}:`, e);
            return { fixed: 0, ran: false };
        }
    };

    const t0 = performance.now();
    const results = await Promise.all(roles.map(processRole));
    const totalFixed = results.reduce((s, r) => s + r.fixed, 0);
    const totalRoles = results.filter(r => r.ran).length;
    const elapsed = Math.round(performance.now() - t0);

    if (totalFixed > 0) {
        console.log(`[CV Engine] Voice enforcement: rewrote ${totalFixed} bullet(s) across ${totalRoles} role(s) in ${elapsed} ms (parallel).`);
    }
}
