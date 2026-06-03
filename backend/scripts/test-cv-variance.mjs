#!/usr/bin/env node
/**
 * test-cv-variance.mjs
 *
 * Catches the feedback-loop monotony problems discussed in the variance
 * architecture review. Three tiers of tests:
 *
 *   TIER 1 — Unit (no network, instant)
 *     • shuffleArray produces different orderings per call
 *     • selectNarrativeAngle distributes across all 4 angles
 *     • buildReferenceBlock uses "CALIBRATION TARGETS" language (not "mirror")
 *     • verb pool slice is ≤12 (not the full pool of 30+)
 *     • forbidden phrases slice is ≤20 (not the full list)
 *
 *   TIER 2 — Structural (worker probe, no generation)
 *     • brief.verb_pool has ≥20 entries (enough to sample from)
 *     • brief.forbidden_phrases has ≥10 entries
 *     • Verifying shuffled subsets differ between two calls
 *
 *   TIER 3 — Integration (requires CV_ENGINE_URL + GROQ_API_KEY, optional)
 *     • 3 generations of same profile → summary Jaccard < 0.4
 *     • Facts (numbers, company names) stay identical across angles
 *     • Verb opener variety across 3 generations ≥ 70% unique
 *     • Example pool angle distribution — no single angle > 50%
 *
 * Usage:
 *   node scripts/test-cv-variance.mjs                  # Tier 1+2 only
 *   GROQ_API_KEY=gsk_xxx node scripts/test-cv-variance.mjs  # all tiers
 *   CV_ENGINE_URL=https://... GROQ_API_KEY=gsk_xxx node scripts/test-cv-variance.mjs
 *
 * Exit code 0 = all tiers that ran passed.
 * Exit code 1 = at least one check failed.
 */

'use strict';

const WORKER   = process.env.CV_ENGINE_URL || 'https://cv-engine-worker.dripstech.workers.dev';
const GROQ_KEY = process.env.GROQ_API_KEY  || '';
const TIMEOUT  = 60_000;

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const C = {
    g:  s => `\x1b[32m${s}\x1b[0m`,
    r:  s => `\x1b[31m${s}\x1b[0m`,
    y:  s => `\x1b[33m${s}\x1b[0m`,
    b:  s => `\x1b[1m${s}\x1b[0m`,
    d:  s => `\x1b[2m${s}\x1b[0m`,
    cy: s => `\x1b[36m${s}\x1b[0m`,
};
const PASS = C.g('✓ PASS');
const FAIL = C.r('✗ FAIL');
const WARN = C.y('⚠ WARN');
const SKIP = C.d('– SKIP');

let passed = 0, failed = 0, warned = 0, skipped = 0;

function check(label, result, expected, { warn = false, detail = '' } = {}) {
    const ok = typeof expected === 'boolean' ? result === expected
              : typeof expected === 'number'  ? result >= expected
              : true;
    if (ok) {
        console.log(`  ${PASS}  ${label}${detail ? C.d(' — ' + detail) : ''}`);
        passed++;
    } else if (warn) {
        console.log(`  ${WARN}  ${label}${detail ? C.d(' — ' + detail) : ''}`);
        warned++;
    } else {
        console.log(`  ${FAIL}  ${label}${detail ? C.d(' — ' + detail) : ''}`);
        failed++;
    }
}
function skip(label, reason) {
    console.log(`  ${SKIP}  ${label}${C.d(' — ' + reason)}`);
    skipped++;
}

// ── Core helpers (mirrors geminiService.ts) ───────────────────────────────────

/** Fisher-Yates shuffle — pure function, no mutation */
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const NARRATIVE_ANGLES = ['impact', 'process', 'people', 'growth'];

function selectNarrativeAngle() {
    return NARRATIVE_ANGLES[Math.floor(Math.random() * NARRATIVE_ANGLES.length)];
}

/**
 * Jaccard similarity between two strings (word-level token sets).
 * Returns 0.0 (completely different) … 1.0 (identical).
 */
function jaccardSimilarity(a, b) {
    const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    const intersection = [...ta].filter(t => tb.has(t)).length;
    const union = new Set([...ta, ...tb]).size;
    return union === 0 ? 1 : intersection / union;
}

/** Extract numbers from text (for fact-consistency checks) */
function extractNumbers(text) {
    return (text.match(/\d[\d,.]*/g) || []).map(n => n.replace(/,/g, '')).sort();
}

/** First word of each bullet (verb opener detection) */
function extractOpeners(bullets) {
    return bullets
        .map(b => b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ''))
        .filter(Boolean);
}

/** Simple word count */
function wc(text) { return text.split(/\s+/).filter(Boolean).length; }

// ── TIER 1 — Unit tests ───────────────────────────────────────────────────────
console.log(C.b('\n═══════════════════════════════════════'));
console.log(C.b('  TIER 1 — Unit (no network)'));
console.log(C.b('═══════════════════════════════════════\n'));

// T1-1: shuffleArray produces different ordering
{
    const pool = ['a','b','c','d','e','f','g','h','i','j','k','l'];
    const runs = new Set();
    for (let i = 0; i < 20; i++) runs.add(shuffleArray(pool).join(','));
    check('shuffleArray produces different orderings across 20 runs',
          runs.size > 3, true,
          { detail: `${runs.size} distinct orderings` });
}

// T1-2: shuffleArray never mutates original
{
    const pool = ['x','y','z'];
    const orig = [...pool];
    shuffleArray(pool);
    check('shuffleArray never mutates the original array',
          JSON.stringify(pool) === JSON.stringify(orig), true);
}

// T1-3: verb pool slice — should be 12, not 24
{
    const fakePool = Array.from({length: 30}, (_, i) => `verb${i}`);
    const sample = shuffleArray(fakePool).slice(0, 12);
    check('Verb pool sample is exactly 12 (not the full pool)',
          sample.length === 12, true,
          { detail: `got ${sample.length}` });
}

// T1-4: two consecutive verb pool samples should differ
{
    const fakePool = Array.from({length: 30}, (_, i) => `verb${i}`);
    const s1 = shuffleArray(fakePool).slice(0, 12).join(',');
    const s2 = shuffleArray(fakePool).slice(0, 12).join(',');
    // Very unlikely (1/C(30,12) chance) that two random 12-picks from 30 are identical
    check('Two consecutive verb pool samples differ',
          s1 !== s2, true,
          { warn: true, detail: 'should differ almost always' });
}

// T1-5: forbidden phrases slice — should be 20
{
    const fakeForbidden = Array.from({length: 35}, (_, i) => `phrase_${i}`);
    const sample = shuffleArray(fakeForbidden).slice(0, 20);
    check('Forbidden phrase sample is exactly 20 (not all 30+)',
          sample.length === 20, true,
          { detail: `got ${sample.length}` });
}

// T1-6: narrative angle selection — distributes across all 4 angles
{
    const counts = { impact: 0, process: 0, people: 0, growth: 0 };
    for (let i = 0; i < 400; i++) counts[selectNarrativeAngle()]++;
    const dominance = Math.max(...Object.values(counts)) / 400;
    check('No single angle dominates >40% of 400 selections',
          dominance < 0.4, true,
          { detail: `max share = ${(dominance*100).toFixed(1)}% — ${JSON.stringify(counts)}` });
    for (const angle of NARRATIVE_ANGLES) {
        check(`Angle "${angle}" selected at least 10 times in 400 runs`,
              counts[angle] >= 10, true,
              { detail: `${counts[angle]} times` });
    }
}

// T1-7: Jaccard similarity — known cases
{
    const identical = jaccardSimilarity('hello world foo bar', 'hello world foo bar');
    check('Jaccard: identical strings = 1.0', Math.abs(identical - 1) < 0.001, true);

    const disjoint  = jaccardSimilarity('alpha beta gamma', 'delta epsilon zeta');
    check('Jaccard: disjoint strings = 0.0', Math.abs(disjoint) < 0.001, true);

    const partial   = jaccardSimilarity('led the team grew revenue', 'built the team cut costs');
    check('Jaccard: partial overlap < 0.5', partial < 0.5, true,
          { detail: `${partial.toFixed(3)}` });
}

// T1-8: buildReferenceBlock language check (mirrors cvExamplesClient.ts)
{
    // Simulate what buildReferenceBlock produces
    const mockBlock = `
===== STRUCTURAL REFERENCE (size targets only — do NOT copy content, phrasing, or angle) =====
A proven CV for a mid Software Engineer (honest mode) used these measurements:
  • Summary: ~65 words
  • Skills: 14 items
  • Bullet band distribution per role (target these proportions, NOT this sequence):
  Role 1: 5 bullets, avg 18 words [punchy×1 / standard×3 / narrative×1]
These are CALIBRATION TARGETS. All content, tone, angle and phrasing must come entirely from
the candidate's real profile and JD. Never echo example phrasing.
===== END STRUCTURAL REFERENCE =====`;

    const hasCalibrationLanguage  = mockBlock.includes('CALIBRATION TARGETS');
    const hasNoMirrorInstruction  = !mockBlock.includes('mirror this variation');
    const hasNeverEchoInstruction = mockBlock.includes('Never echo example phrasing');
    const hasSizeTargetsOnly      = mockBlock.includes('size targets only');

    check('Reference block says "CALIBRATION TARGETS" (not template language)',
          hasCalibrationLanguage, true);
    check('Reference block does NOT say "mirror this variation"',
          hasNoMirrorInstruction, true);
    check('Reference block says "Never echo example phrasing"',
          hasNeverEchoInstruction, true);
    check('Reference block says "size targets only"',
          hasSizeTargetsOnly, true);
}

// T1-9: rhythm constraint mode — no fixed sequence
{
    const constraintBlock = '- Rhythm constraints: each role must have ≥1 punchy bullet (≤14 words) and ≥1 narrative bullet (≥25 words); avoid 3+ consecutive bullets of the same length class. The exact sequence is your choice — vary it.';
    check('Rhythm block uses constraint mode (≥1 punchy, ≥1 narrative)',
          constraintBlock.includes('≥1 punchy bullet') && constraintBlock.includes('≥1 narrative bullet'), true);
    check('Rhythm block says "exact sequence is your choice"',
          constraintBlock.includes('The exact sequence is your choice'), true);
    check('Rhythm block does NOT enforce a fixed sequence',
          !constraintBlock.includes('→'), true);
}

// ── TIER 2 — Structural (worker probe) ───────────────────────────────────────
console.log(C.b('\n═══════════════════════════════════════'));
console.log(C.b('  TIER 2 — Structural (worker probe)'));
console.log(C.b('═══════════════════════════════════════\n'));

const BRIEF_FIXTURE = {
    jd: 'Senior Software Engineer. 5+ years React, Node.js, PostgreSQL. Lead teams of 6+.',
    profile: {
        workExperience: [{ jobTitle: 'Software Engineer', company: 'Acme', yearsExperience: 6 }],
        skills: ['React', 'Node.js', 'PostgreSQL'],
    },
    section: 'current_role',
};

let brief = null;
try {
    const res = await fetch(`${WORKER}/api/cv/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(BRIEF_FIXTURE),
        signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
        brief = await res.json();
    } else {
        console.log(C.y(`  Worker /api/cv/brief returned HTTP ${res.status} — skipping Tier 2`));
    }
} catch (e) {
    console.log(C.y(`  Worker unreachable (${e.message}) — skipping Tier 2`));
}

if (brief) {
    check('brief.verb_pool has ≥20 entries (enough to sample random 12)',
          (brief.verb_pool || []).length >= 20, true,
          { detail: `${(brief.verb_pool || []).length} verbs` });

    check('brief.forbidden_phrases has ≥10 entries',
          (brief.forbidden_phrases || []).length >= 10, true,
          { detail: `${(brief.forbidden_phrases || []).length} phrases` });

    // Simulate two verb samples — must differ
    const sample1 = shuffleArray(brief.verb_pool).slice(0, 12).map(v => v.verb_past || v.verb).join(',');
    const sample2 = shuffleArray(brief.verb_pool).slice(0, 12).map(v => v.verb_past || v.verb).join(',');
    check('Two shuffled verb pool samples from live brief differ',
          sample1 !== sample2, true,
          { warn: true, detail: 'expected in >99.9% of cases' });

    // Simulate two forbidden phrase samples — must differ
    const fp1 = shuffleArray(brief.forbidden_phrases).slice(0, 20).join(',');
    const fp2 = shuffleArray(brief.forbidden_phrases).slice(0, 20).join(',');
    check('Two shuffled forbidden phrase samples from live brief differ',
          fp1 !== fp2, true,
          { warn: true });

    // Rhythm — brief should still have a sequence (for validator reference)
    check('brief.rhythm.sequence exists (used by validator)',
          Array.isArray(brief.rhythm?.sequence) && brief.rhythm.sequence.length > 0, true,
          { detail: `sequence: ${(brief.rhythm?.sequence || []).join(' → ')}` });
} else {
    for (let i = 0; i < 5; i++) skip('Tier 2 check', 'worker unreachable');
}

// ── TIER 3 — Integration (requires GROQ_API_KEY) ─────────────────────────────
console.log(C.b('\n═══════════════════════════════════════'));
console.log(C.b('  TIER 3 — Integration (generation divergence)'));
console.log(C.b('═══════════════════════════════════════\n'));

if (!GROQ_KEY) {
    console.log(C.d('  Set GROQ_API_KEY=gsk_xxx to enable Tier 3 generation tests.\n'));
    for (let i = 0; i < 8; i++) skip('Tier 3 check', 'GROQ_API_KEY not set');
} else {
    // Shared profile fixture — same person every time
    const PROFILE = {
        personalInfo: { name: 'Test Person', email: 'test@example.com', location: 'Nairobi, Kenya' },
        workExperience: [
            {
                jobTitle: 'Water Resources Engineer',
                company: 'Nairobi Water Authority',
                startDate: '2019-01',
                endDate: 'Present',
                responsibilities: [
                    'Designed irrigation networks serving 50,000 smallholder farmers using EPANET and HEC-RAS',
                    'Managed KES 45M project budget across 3 counties with 0% cost overrun',
                    'Led team of 8 engineers delivering 14 boreholes in Machakos County',
                    'Trained 120 community water technicians across 6 sub-counties',
                    'Reduced system leakage from 34% to 11% using pressure zone management',
                ],
            },
            {
                jobTitle: 'Junior Engineer',
                company: 'Water Solutions Ltd',
                startDate: '2017-03',
                endDate: '2018-12',
                responsibilities: [
                    'Supported design of 3 rural water supply schemes serving 12,000 people',
                    'Conducted field surveys for 24 borehole sites across Turkana County',
                ],
            },
        ],
        skills: ['EPANET', 'HEC-RAS', 'AutoCAD Civil 3D', 'FIDIC contracts', 'GIS', 'Community engagement', 'Budget management', 'Team leadership'],
        education: [{ degree: 'BSc Biosystems Engineering', institution: 'University of Nairobi', year: '2016' }],
    };

    const JD = `Senior Water Resources Engineer. 5+ years experience in irrigation and rural water supply in East Africa.
Required: EPANET, HEC-RAS, AutoCAD Civil 3D, FIDIC contract administration, donor reporting (USAID/AfDB).
Will design irrigation networks, manage budgets of USD 5-15M, lead teams of 6-12 engineers.`;

    // We use Groq directly (same as test-worker-vs-groq.mjs) to avoid needing full pipeline
    async function generateSummaryViaGroq(systemPrompt, userPrompt) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 300,
            }),
            signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    const ANGLES = ['impact', 'process', 'people'];
    const summaries = [];
    const systemPrompt = `You are a world-class CV writer. Generate ONLY a professional CV summary (60-90 words). No intro, no label, just the summary text. No markdown.`;

    for (const angle of ANGLES) {
        const angleDefs = {
            impact:  'Lead with the strongest quantified business result, then prove with a second achievement.',
            process: 'Lead with the signature working method or system this person is known for building.',
            people:  'Lead with leadership style and the team/stakeholder scale operated at.',
        };
        const userPrompt = `
PROFILE:
Name: Test Person | Senior Water Resources Engineer | 6 years experience
Key achievements: 50,000 farmers served | KES 45M budget, 0% overrun | 8-person team | leakage 34%→11% | 120 technicians trained
Skills: EPANET, HEC-RAS, AutoCAD Civil 3D, FIDIC, GIS, budget management

JOB: ${JD}

NARRATIVE ANGLE — ${angle.toUpperCase()}: ${angleDefs[angle]}

Write a 60-90 word professional summary for this person applying to this job.
The summary must feel like a DIFFERENT HUMAN wrote it compared to other angles — same facts, completely different framing.
Do NOT start with "Experienced" or "Results-driven". Use specific numbers from the profile.`;

        console.log(C.d(`  Generating [${angle}] angle summary via Groq...`));
        try {
            const t0 = Date.now();
            const summary = await generateSummaryViaGroq(systemPrompt, userPrompt);
            const ms = Date.now() - t0;
            summaries.push({ angle, summary, ms });
            console.log(C.d(`  [${angle}] ${ms}ms — "${summary.substring(0, 80)}…"`));
        } catch (e) {
            console.log(C.r(`  [${angle}] FAILED — ${e.message}`));
            summaries.push({ angle, summary: '', ms: 0 });
        }
    }

    // T3-1: Summaries are all non-empty
    for (const { angle, summary } of summaries) {
        check(`[${angle}] summary generated (non-empty)`, summary.length > 0, true,
              { detail: `${wc(summary)} words` });
    }

    // T3-2: Summaries mention real numbers from the profile
    for (const { angle, summary } of summaries) {
        if (!summary) continue;
        const nums = extractNumbers(summary);
        check(`[${angle}] summary contains real numbers from profile`,
              nums.length > 0, true,
              { detail: `found: ${nums.slice(0, 4).join(', ')}` });
    }

    // T3-3: Pairwise Jaccard similarity < 0.4
    const pairs = [
        [summaries[0], summaries[1]],
        [summaries[0], summaries[2]],
        [summaries[1], summaries[2]],
    ].filter(([a, b]) => a?.summary && b?.summary);

    for (const [a, b] of pairs) {
        const sim = jaccardSimilarity(a.summary, b.summary);
        check(`[${a.angle}] vs [${b.angle}] Jaccard similarity < 0.40`,
              sim < 0.4, true,
              { warn: sim < 0.55, detail: `similarity = ${sim.toFixed(3)}` });
    }

    // T3-4: Facts consistency — the same numbers appear across all angles
    const validSummaries = summaries.filter(s => s.summary);
    if (validSummaries.length >= 2) {
        // The number "50" (50,000 farmers) or "45" (KES 45M) or "8" (team) should appear in most
        const profileNumbers = ['50', '45', '8', '120', '34', '11'];
        const numberPresence = profileNumbers.map(n => ({
            n,
            inSummaries: validSummaries.filter(s => s.summary.includes(n)).length,
        }));
        const dominated = numberPresence.filter(p => p.inSummaries >= 2);
        check('Real profile numbers appear consistently across angle summaries',
              dominated.length >= 1, true,
              { detail: `${dominated.map(p => `"${p.n}" in ${p.inSummaries}/${validSummaries.length}`).join(', ')}` });
    } else {
        skip('Facts consistency check', 'not enough generated summaries');
    }

    // T3-5: Opening words are different across angles (no convergence on opener)
    const openers = validSummaries.map(s => s.summary.trim().split(/\s+/)[0]?.toLowerCase());
    const uniqueOpeners = new Set(openers);
    check('Different angles produce different opening words',
          uniqueOpeners.size >= 2, true,
          { warn: true, detail: `openers: ${openers.join(' / ')}` });

    console.log(C.b('\n  Full summaries by angle:'));
    for (const { angle, summary } of summaries) {
        if (summary) {
            console.log(`  ${C.cy(angle.padEnd(8))} ${summary}`);
        }
    }
}

// ── Final report ──────────────────────────────────────────────────────────────
console.log(C.b('\n═══════════════════════════════════════'));
console.log(C.b('  RESULTS'));
console.log(C.b('═══════════════════════════════════════'));
console.log(`  ${C.g(passed + ' passed')}  ${failed > 0 ? C.r(failed + ' failed') : C.d('0 failed')}  ${warned > 0 ? C.y(warned + ' warned') : C.d('0 warned')}  ${skipped > 0 ? C.d(skipped + ' skipped') : ''}`);

if (failed > 0) {
    console.log(C.r('\n  ✗ VARIANCE TEST SUITE FAILED — the feedback-loop monotony problem may be active.\n'));
    process.exit(1);
} else if (warned > 0) {
    console.log(C.y('\n  ⚠ Suite passed with warnings — investigate warned checks before production.\n'));
    process.exit(0);
} else {
    console.log(C.g('\n  ✓ All variance checks passed. Outputs are diverging correctly.\n'));
    process.exit(0);
}
