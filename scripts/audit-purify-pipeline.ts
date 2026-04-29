/**
 * Pipeline audit harness — exercises every rule in services/cvPurificationPipeline.ts
 * against a hand-crafted dummy CV that intentionally violates each rule, then
 * prints a per-step diff plus a verdict (PASS/FAIL) for whether the expected
 * leak fired. Run with:  npx tsx scripts/audit-purify-pipeline.ts
 *
 * The dummy CV is structured so each field probes a specific rule cluster:
 *   - summary           → unicode_glyph, weak_qualifier, banned_phrase,
 *                         number_format, orphan_metric, markup_strip
 *   - experience[0]     → CURRENT job, present-tense bullets (tense check),
 *                         covers first_person, weak_opener, weird_opener,
 *                         duplicate_word, banned_phrase, short/long bullets
 *   - experience[1]     → PAST job, past-tense bullets, round-number jitter
 *                         saturation (>60%) and orphan_metric edge cases
 *   - education[0]      → COMPLETED degree with "currently pursuing" leak
 *   - skills            → skill_casing + duplicate_skill probes
 *   - projects[0]       → markup_strip + capitalise probes
 */

// Vite injects `import.meta.env` at build time. Under Node+tsx it's undefined,
// so any top-level access in an imported module crashes. Stamp a no-op env
// BEFORE the dynamic import below — static imports would be hoisted and run
// first, which is why we resolve the pipeline at runtime instead.
(import.meta as any).env = (import.meta as any).env || {};

import type { CVData } from '../types';
import type { PurifyReport } from '../services/cvPurificationPipeline';

const { purifyCV } = await import('../services/cvPurificationPipeline');

const C = {
    reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

function header(text: string) {
    console.log(`\n${C.bold}${C.cyan}══ ${text} ${'═'.repeat(Math.max(0, 70 - text.length))}${C.reset}`);
}
function sub(text: string) {
    console.log(`\n${C.bold}${C.blue}── ${text} ${'─'.repeat(Math.max(0, 68 - text.length))}${C.reset}`);
}
function diff(label: string, before: string, after: string) {
    const changed = before !== after;
    const marker = changed ? `${C.yellow}● CHANGED${C.reset}` : `${C.dim}○ unchanged${C.reset}`;
    console.log(`  ${C.bold}${label}${C.reset}  ${marker}`);
    console.log(`    ${C.dim}before:${C.reset} ${JSON.stringify(before)}`);
    console.log(`    ${C.dim}after :${C.reset} ${JSON.stringify(after)}`);
}

// ─── Dummy CV — every field is a probe ──────────────────────────────────────

const dummyCV: CVData = {
    // SUMMARY probe — paragraph polish (no first-person strip, no weak-opener strip).
    // Triggers: unicode_glyph (full-width $＄, math digits 𝟓𝟎, NBSP), weak_qualifier
    // ("very", "really"), banned_phrase ("leveraging", "passion for"), number_format
    // ("5 %"), orphan_metric ("through %"), markup_strip ("**bold**").
    summary:
        'i am a **dynamic team player** with a passion for leveraging '
        + 'innovative solutions to drive meaningful change. very experienced '
        + 'engineer who really focuses on best practices and ＄１，０００ budgets. '
        + 'i shipped 𝟓𝟎\u00A0% improvement through %\u200B in production.',

    // SKILLS probe — case canonicalisation + dedupe.
    skills: ['javascript', 'JavaScript', 'PYTHON', 'react.js', 'React.js', 'typescript', 'TypeScript'],

    experience: [
        // CURRENT JOB (endDate empty/Present) — bullets MUST be present-tense.
        // Probes: first_person, weak_opener, weird_opener, weak_qualifier,
        // banned_phrase, duplicate_word, markup_strip, short bullet, long bullet,
        // unicode_glyph in bullets, orphan_metric, number_format, trailing_period.
        {
            company: 'Acme Corp',
            jobTitle: 'Senior Engineer',
            dates: '2024 - Present',
            startDate: '2024-01-01',
            endDate: '',
            responsibilities: [
                // first_person + weak_opener + trailing_period + banned_phrase
                'I was responsible for leveraging best practices to deliver synergy.',
                // weak_qualifier "very" + duplicate_word "the the" + capitalise lowercase
                'very efficiently optimised the the team workflow by ２０% utilising new tools',
                // markup_strip + orphan_metric + number_format
                '**Spearheaded** a project that improved metrics through % significantly',
                // SHORT bullet (<12 words)
                'Did stuff at work',
                // LONG bullet (>30 words) — also has unicode digits + Arabic-Indic.
                // NOTE: keep it well above 30 words so the new "end-to-end" stripper
                // (which removes ~1 word) doesn't push it back under the threshold.
                'Architected and shipped a comprehensive end-to-end distributed system across ٢٥ '
                + 'microservices serving over ＄１２，０００，０００ in transactions handled with rigor and '
                + 'reliability while mentoring a cross functional team of ten engineers daily across '
                + 'four global offices spanning multiple regions and product lines.',
                // weird_opener "Worked on" or similar weak verb + capitalise + first_person variant
                'my goal was to enable knowledge sharing across the org through documentation',
                // BLANK-METRIC bug (real CV, Apr 2026): the AI emitted the connector
                // "in revenue" but lost the leading number. Pattern: "<verb>, in revenue and <continuation>".
                // After fix: ", in revenue" should be dropped (no digit precedes within 12 chars).
                'Sell water solutions materials and equipment, in revenue and beating monthly targets by 15% since Dec 2023',
                // INCOMPLETE-METRIC bug: "by through X" — leading prep "by" lost
                // its number ("by [50%] through better coordination"). After fix:
                // "by " should be dropped, leaving "through better coordination".
                'Streamline project workflows, reducing lead times by through better coordination between sales and engineering teams',
                // ENSURING filler bug: ", ensuring <participle phrase>" is the most
                // over-used filler in real generations. After fix: the trailing
                // ", ensuring timely completion" clause should be dropped entirely.
                'Navigate a portfolio of end-to-end irrigation projects across western Kenya, ensuring timely completion through effective coordination',
                // WEIRD-OPENER probe: "Re-framed" prefix is a CF Workers AI artifact —
                // rewriteWeirdOpeners must drop the "Re-" and uppercase the next char,
                // emitting a `weird_opener` leak.
                'Re-framed the customer onboarding journey across 3 product lines and 12 markets',
                // DUP-PREP-PHRASE probe: same content word ("training") appears twice
                // separated by a prep phrase ("across the team through training"), and
                // the trailing "<prep> WORD" duplicates an earlier WORD. dropRedundantPrepPhrase
                // should strip the trailing fragment, emitting `dup_prep_phrase`.
                'Built training materials and rolled out training across the team through training',
                // ARTICLE-AGREEMENT probe: first-person strip turns "I am a engineer"
                // into "Am a engineer" — fixArticleAgreement must repair to "Am an engineer",
                // emitting `article_agreement`.
                'I am a engineer focused on platform reliability and developer experience',
                // ORPHAN-LEADING-DECIMAL probe (Apr 29 2026 — Bruce Oyugi McKinsey CV):
                // AI dropped the leading "$1" from "$1.8M", leaving "achieving.8M in sales".
                // After fix: the verb + orphan + "in sales" connector should all be stripped,
                // leaving the bullet ending cleanly with no trailing comma.
                'Generate revenue from Water Solutions sales by aligning equipment specifications with client crop water requirements, resulting.8M in sales',
                // TIME-PREP DROPPED-UNIT probe (Apr 29 2026 — Bruce Oyugi McKinsey CV):
                // AI dropped the duration from "within [24 hours] of reporting", leaving
                // the broken fragment "within of reporting". After fix: whole "within of
                // reporting" stripped, comma preserved so the next clause stays grammatical.
                'Lead follow-up visits and troubleshoot system inefficiencies within of reporting, improving client retention to 95%',
                // UNIVERSAL "metric verb without a number" probes (Apr 29 2026):
                // The AI commonly tacks "achieving/cutting/increasing/reducing X" onto
                // the end of a bullet without a number, producing a "censored bullet"
                // feel. The new stripUnquantifiedMetricGerund step should drop the
                // dangling clause when no digit is present in it.
                'Design drip and sprinkler systems using IrriCAD and AutoCAD, achieving water savings through precise emitter placement',
                'Streamline handover between sales and installation teams using a shared project management dashboard, cutting lead time',
                'Train farmers on operation of automated irrigation controls, increasing adoption of scheduling features',
                // SAFETY: a metric-gerund clause WITH a number must NOT be stripped.
                // "increasing revenue by 30%" stays untouched.
                'Run cross-functional alignment sessions weekly with engineering and sales, increasing revenue by 30% across the region',
                // SAFETY: a metric-gerund as PRIMARY verb (no leading comma) must
                // NOT trigger this rule. Bullet stands as written.
                'Achieving water savings on every project I design across western Kenya monthly',
            ],
        },
        // PAST JOB (endDate set) — bullets MUST be past-tense.
        // Probes: tense flip if any bullet is present-tense; round-number saturation.
        {
            company: 'Startup XYZ',
            jobTitle: 'Engineer',
            dates: '2020 - 2023',
            startDate: '2020-01-01',
            endDate: '2023-12-31',
            responsibilities: [
                // PRESENT TENSE in PAST job → tense_flip expected
                'Lead a team of 5 to deliver projects on time',
                // Round-number saturation (these should all look "too round")
                'Increased revenue by 100% across all regions',
                'Reduced costs by 50% through process optimisation',
                'Boosted retention by 200% via improved onboarding',
                'Delivered 1000 units to enterprise customers',
                // Extra round-number bullet keeps the saturation > 60% threshold
                // even after the new orphan-decimal/time-prep probes were added
                // to the current-job dataset upstream.
                'Saved 500 hours of manual reporting via automation',
                // CJK comma + period probe — should normalise to ASCII
                'Managed budget of $1\u3001000\u3002 5 in operating expenses',
                // PROBE: pathological RAMBLING bullet (>45 words) to exercise
                // the relaxed long_bullet threshold. A bullet this long carries
                // too many ideas and is a real defect. (Apr 29 2026)
                'Owned the complete redesign of the regional sales playbook including the discovery script the qualification scorecard the executive briefing template the proposal cadence the renewal motion the upsell motion the partner referral motion the quarterly account review template the win-loss debrief template and the customer reference programme across all four lines of business this fiscal year.',
            ],
        },
        // PROBE: MONOTONE BULLET RHYTHM (Apr 29 2026).
        // 4 bullets, all 18–20 words long → population stddev < 3.
        // The new bullet_rhythm_monotone detector should fire on this role.
        // Also exercises the relaxed long_bullet threshold (45w) — none of
        // these crosses it, so long_bullet must NOT fire on this role.
        {
            company: 'Monotone Co',
            jobTitle: 'Operations Manager',
            dates: '2018–2020',
            startDate: '2018-01',
            endDate: '2020-12',
            responsibilities: [
                'Coordinated quarterly supplier reviews across the East African region with the procurement and logistics teams jointly.',
                'Owned monthly inventory reconciliation for the central warehouse working closely with finance and operations leadership weekly.',
                'Streamlined the goods-receiving process across three distribution sites by aligning shift schedules with arrival windows.',
                'Trained new warehouse supervisors on safety protocols and stocktake procedures during onboarding sessions every quarter.',
            ],
        },
        // PROBE: ROUND-NUMBER SATURATION (Apr 29 2026).
        // Restores round-number coverage after the new rhythm probe roles
        // diluted the overall numbers ratio. 4 bullets, all containing only
        // round numbers (multiples of 5/10/100). Lengths span 9w / 14w / 19w /
        // 25w → stddev ≈ 6 → does NOT trigger the monotone leak.
        {
            company: 'Round Numbers Co',
            jobTitle: 'Growth Lead',
            dates: '2012–2015',
            startDate: '2012-01',
            endDate: '2014-12',
            responsibilities: [
                'Closed 50 enterprise deals reaching the 100 milestone.',
                'Hit a 30% gross margin target consistently for 10 consecutive months across the region.',
                'Grew the partner ecosystem by 40% in 12 months hitting 200 active partners across East Africa.',
                'Reduced churn by 20% across all customer segments in two quarters by introducing a 90-day onboarding success plan and a 30-day check-in cadence.',
            ],
        },
        // PROBE: 8-BULLET HEALTHY MIX (Apr 29 2026).
        // Verifies the rhythm rules SCALE with bullet count. Users can set
        // pointCount up to 8+ per role. Composition mirrors the prompt's
        // proportional formula for N=8: 2 punchy + 4 standard + 2 narrative.
        // Must NOT trigger bullet_rhythm_monotone (stddev ≈ 9, well > 3).
        // Must NOT trigger short_bullet (no bullet < 8w).
        // Must NOT trigger long_bullet (no bullet > 45w).
        {
            company: 'Big Mix Co',
            jobTitle: 'Programme Director',
            dates: '2010–2012',
            startDate: '2010-01',
            endDate: '2011-12',
            responsibilities: [
                // Punchy x2 (10w, 11w)
                'Owned the regional growth scorecard for the Africa hub.',
                'Chaired the weekly cross-functional pricing standup with three teams.',
                // Standard x4 (17w, 18w, 19w, 20w)
                'Built the customer-success dashboard from scratch and deployed it to twelve country offices in twenty weeks.',
                'Led a sixty-person delivery organisation across Nairobi Lagos and Cape Town through three product launches.',
                'Restructured the partner-channel commercial model to align incentives across resellers system integrators and direct sales teams.',
                'Translated the corporate growth strategy into seven measurable quarterly objectives for each of four regional general managers.',
                // Narrative x2 (32w, 35w)
                'Architected the rollout plan for the new pricing engine across four lines of business over an eighteen-month window. The transition closed with a ninety-five percent customer-retention rate during the cutover quarter.',
                'Stood up the executive briefing programme for the top fifty enterprise accounts in the region. The programme generated forty qualified expansion conversations in its first half-year and seeded eleven seven-figure renewals.',
            ],
        },
        // PROBE: HEALTHY MIXED RHYTHM (Apr 29 2026).
        // Mix of one PUNCHY (~10w), two STANDARD (~18w), one NARRATIVE
        // (~32w, two sentences). Stddev ≈ 9 → comfortably above 3.
        // The bullet_rhythm_monotone detector must NOT fire on this role.
        // Also verifies the relaxed short_bullet threshold (now 8w not 12w):
        // the punchy bullet is 10 words and must NOT trigger short_bullet.
        {
            company: 'Healthy Mix Inc',
            jobTitle: 'Senior Project Lead',
            dates: '2015–2018',
            startDate: '2015-01',
            endDate: '2017-12',
            responsibilities: [
                'Closed 3 enterprise accounts in the first quarter alone.',
                'Built the regional dashboard from scratch with the engineering team and rolled it out to 12 sites.',
                'Led the cross-functional pricing committee through a six-month overhaul of the commercial discount structure.',
                'Architected the rollout plan for the new CRM across 4 country offices over an 18-month window. The transition closed with a 92% user-adoption rate and zero unplanned downtime during go-live weekends.',
            ],
        },
        // PROBE: BAND IMBALANCE WITH OUTLIER (Apr 29 2026).
        // Targets the edge case the new bullet_band_imbalance detector was
        // designed for: 5 punchy bullets at 9w each + 1 narrative bullet at
        // 30w. The single 30w outlier inflates stddev to ≈ 7.83 — well above
        // the bullet_rhythm_monotone threshold of 3 — so the OLD detector
        // gives this role a clean bill of health. But 5 of 6 bullets are
        // still stuck in the punchy band, so the role still reads as
        // visually flat. The NEW detector must fire here.
        // Expected detector behaviour for this role:
        //   bullet_rhythm_monotone   → MUST NOT fire (stddev ≈ 7.83 > 3)
        //   bullet_band_imbalance    → MUST fire (5 bullets in punchy band)
        //   short_bullet             → MUST NOT fire (every bullet ≥ 8w)
        //   long_bullet              → MUST NOT fire (no bullet > 45w)
        {
            company: 'Punchy Stack Co',
            jobTitle: 'Operations Lead',
            dates: '2008–2010',
            startDate: '2008-01',
            endDate: '2009-12',
            responsibilities: [
                // Punchy x5 — each exactly 9 words → all in the punchy band.
                // Digits chosen as round multiples of 5/10/25/100 so this
                // role also keeps the dataset-level round_number ratio
                // above its firing threshold (those checks pre-date this
                // probe and would otherwise fall silent).
                'Hosted 50 weekly reviews with the engineering teams here.',
                'Owned 20 standup notes for the regional sales group.',
                'Tracked 100 forecast variance reports against the baseline targets.',
                'Reviewed 10 partner performance scorecards with channel operations leads.',
                'Audited 25 budget submissions across the four business units.',
                // Narrative x1 — 30 words → in the narrative band. Pulls
                // stddev above 3 so the monotone check abstains, leaving
                // the band-imbalance detector as the only line of defence.
                // Vocabulary deliberately distinct from the other narrative
                // bullets in this fixture so the dataset-level
                // repeated_phrase detector is not nudged off-target.
                'Consolidated the regional finance reporting stack onto a single shared warehouse across two fiscal quarters by retiring six redundant pipelines and standardising the chart of accounts for every subsidiary entity.',
            ],
        },
    ],

    education: [
        // COMPLETED degree (year=2020) but description says "currently pursuing"
        // → pursuing_strip expected.
        {
            degree: 'BSc Computer Science',
            school: 'State University',
            year: '2020',
            description: 'Currently pursuing thesis on distributed systems. GPA 3.8.',
        },
    ],

    projects: [
        {
            name: 'Open Source Lib',
            // markup_strip (`code`, leading bullet) + capitalise + unicode_glyph
            description: '- `cli` tool that processes ＳＯ％ of CSV files via streaming',
        },
    ],
};

// ─── Run the pipeline ───────────────────────────────────────────────────────

header('PIPELINE AUDIT — purifyCV against dummy CV');
console.log(`${C.dim}Pipeline order: substitute → tense → round-jitter → polish → skills → diagnostics${C.reset}`);

// Silence the [Purify] console.warn noise so the audit output is readable.
const origWarn = console.warn;
const captured: string[] = [];
console.warn = (...args: any[]) => { captured.push(args.map(a => String(a)).join(' ')); };

const t0 = Date.now();
const { cv: cleaned, report } = purifyCV(dummyCV);
const elapsed = Date.now() - t0;

console.warn = origWarn;

// ─── Per-field diff ─────────────────────────────────────────────────────────

sub('SUMMARY');
diff('summary', dummyCV.summary, cleaned.summary);

sub('SKILLS');
console.log(`  ${C.dim}before:${C.reset} ${JSON.stringify(dummyCV.skills)}`);
console.log(`  ${C.dim}after :${C.reset} ${JSON.stringify(cleaned.skills)}`);
console.log(`  ${C.bold}removed${C.reset}: ${dummyCV.skills.length - cleaned.skills.length}`);

sub('EXPERIENCE[0] — CURRENT job (Acme Corp)');
dummyCV.experience[0].responsibilities.forEach((b, j) => {
    diff(`bullet[${j}]`, b, cleaned.experience[0].responsibilities[j]);
});

sub('EXPERIENCE[1] — PAST job (Startup XYZ)');
dummyCV.experience[1].responsibilities.forEach((b, j) => {
    diff(`bullet[${j}]`, b, cleaned.experience[1].responsibilities[j]);
});

sub('EDUCATION[0] — completed degree');
diff('description', dummyCV.education[0].description!, cleaned.education[0].description!);

sub('PROJECTS[0]');
diff('description', dummyCV.projects![0].description, cleaned.projects![0].description);

// ─── Leak report ────────────────────────────────────────────────────────────

sub('LEAK REPORT');
const byType = new Map<string, number>();
for (const l of report.leaks) byType.set(l.leakType, (byType.get(l.leakType) || 0) + 1);
const sorted = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
console.log(`  Total leaks recorded: ${C.bold}${report.leaks.length}${C.reset}`);
console.log(`  By type:`);
for (const [type, count] of sorted) {
    console.log(`    ${C.cyan}${type.padEnd(22)}${C.reset} ×${count}`);
}

sub('REPORT METRICS');
console.log(`  bulletsTenseFlipped : ${report.bulletsTenseFlipped}`);
console.log(`  metricsJittered     : ${report.metricsJittered}`);
console.log(`  substitutionsMade   : ${report.substitutionsMade}`);
console.log(`  polishFixes         : ${report.polishFixes}`);
console.log(`  skillsCanonicalised : ${report.skillsCanonicalised}`);
console.log(`  skillsDeduped       : ${report.skillsDeduped}`);
console.log(`  quantificationRatio : ${(report.quantificationRatio * 100).toFixed(0)}%`);
console.log(`  roundNumberRatio    : ${(report.roundNumberRatio * 100).toFixed(0)}%`);
console.log(`  roundNumberFlagged  : ${report.roundNumberFlagged}`);
console.log(`  repeatedPhrases     : ${report.repeatedPhrases.length}`);
console.log(`  tenseIssues         : ${report.tenseIssues.length}`);

if (report.tenseIssues.length) {
    console.log(`\n  ${C.yellow}Remaining tense issues:${C.reset}`);
    report.tenseIssues.forEach(t => console.log(`    - ${t}`));
}
if (report.repeatedPhrases.length) {
    console.log(`\n  ${C.yellow}Remaining repeated phrases:${C.reset}`);
    report.repeatedPhrases.forEach(r => console.log(`    - "${r.phrase}" ×${r.count}`));
}

// ─── Rule-by-rule verdict ───────────────────────────────────────────────────

sub('RULE VERDICT — did each expected leak type fire?');

const fullText = JSON.stringify(cleaned);
const fullSummary = cleaned.summary;
const allBullets = cleaned.experience.flatMap(e => e.responsibilities).join(' ');

interface Check {
    name: string;
    expectFire: boolean;
    actualFired: boolean;
    extra?: string;
}

const checks: Check[] = [
    // Phase-2 polish leaks
    { name: 'unicode_glyph fired',          expectFire: true,  actualFired: byType.has('unicode_glyph') },
    { name: 'markup_artifact fired',        expectFire: true,  actualFired: byType.has('markup_artifact') },
    { name: 'first_person fired',           expectFire: true,  actualFired: byType.has('first_person') },
    { name: 'weak_opener fired',            expectFire: true,  actualFired: byType.has('weak_opener') },
    { name: 'weak_qualifier fired',         expectFire: true,  actualFired: byType.has('weak_qualifier') },
    { name: 'orphan_metric fired',          expectFire: true,  actualFired: byType.has('orphan_metric') },
    { name: 'number_format fired',          expectFire: true,  actualFired: byType.has('number_format') },
    { name: 'capitalisation fired',         expectFire: true,  actualFired: byType.has('capitalisation') },
    { name: 'trailing_period fired',        expectFire: true,  actualFired: byType.has('trailing_period') },
    // Substitution / banned-phrase / pursuing
    { name: 'banned_phrase fired',          expectFire: true,  actualFired: byType.has('banned_phrase') },
    { name: 'duplicate_word fired',         expectFire: true,  actualFired: byType.has('duplicate_word') },
    { name: 'pursuing_phrase fired',        expectFire: true,  actualFired: byType.has('pursuing_phrase') },
    // Skills
    { name: 'skill_casing fired',           expectFire: true,  actualFired: byType.has('skill_casing') },
    { name: 'duplicate_skill fired',        expectFire: true,  actualFired: byType.has('duplicate_skill') },
    // Tense + round + length
    { name: 'tense_mismatch fired',         expectFire: true,  actualFired: byType.has('tense_mismatch') },
    { name: 'round_number fired (jitter)',  expectFire: true,  actualFired: byType.has('round_number') },
    { name: 'short_bullet fired',           expectFire: true,  actualFired: byType.has('short_bullet') },
    { name: 'long_bullet fired',            expectFire: true,  actualFired: byType.has('long_bullet') },

    // Output sanity — no leftover non-ASCII digits/symbols.
    {
        name: 'No full-width digits remain (０-９)',
        expectFire: false,
        actualFired: /[\uFF10-\uFF19]/.test(fullText),
    },
    {
        name: 'No math digits remain (𝟎-𝟗)',
        expectFire: false,
        actualFired: /[\u{1D7CE}-\u{1D7FF}]/u.test(fullText),
    },
    {
        name: 'No Arabic-Indic digits remain (٠-٩)',
        expectFire: false,
        actualFired: /[\u0660-\u0669]/.test(fullText),
    },
    {
        name: 'No NBSP remains (\\u00A0)',
        expectFire: false,
        actualFired: /\u00A0/.test(fullText),
    },
    {
        name: 'No zero-width chars remain',
        expectFire: false,
        actualFired: /[\u200B-\u200D\uFEFF\u2060]/.test(fullText),
    },
    {
        name: 'No CJK comma/period remain (、 。)',
        expectFire: false,
        actualFired: /[\u3001\u3002]/.test(fullText),
    },
    {
        name: 'No "$ 1000" (unformatted) remains',
        expectFire: false,
        actualFired: /\$\s+\d/.test(fullText),
    },
    {
        name: 'No "5 %" (unformatted) remains',
        expectFire: false,
        actualFired: /\d\s+%/.test(fullText),
    },
    {
        name: 'No orphan " % " remains in any bullet',
        expectFire: false,
        actualFired: /(?<!\d)\s%\s/.test(allBullets),
    },
    {
        name: 'No leading "I " / "i " in any bullet',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities)
            .some(b => /^\s*[Ii]\s+/.test(b)),
    },
    {
        name: 'No bullet ends with a period',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities)
            .some(b => /\.\s*$/.test(b.trim())),
    },
    {
        name: 'No "**bold**" markdown remains',
        expectFire: false,
        actualFired: /\*\*[^*]+\*\*/.test(fullText),
    },
    {
        name: 'No HTML tags remain',
        expectFire: false,
        actualFired: /<[a-zA-Z\/][^>]*>/.test(fullText),
    },
    {
        name: 'Skills are unique (case-insensitive)',
        expectFire: false,
        actualFired: (() => {
            const lc = cleaned.skills.map(s => s.toLowerCase());
            return new Set(lc).size !== lc.length;
        })(),
    },
    {
        name: 'Banned word "leveraging" is gone from summary',
        expectFire: false,
        actualFired: /\bleveraging\b/i.test(fullSummary),
    },
    {
        name: 'Banned word "synergy" is gone everywhere',
        expectFire: false,
        actualFired: /\bsynergy\b/i.test(fullText),
    },
    {
        name: 'Banned word "spearheaded" is gone everywhere',
        expectFire: false,
        actualFired: /\bspearheaded\b/i.test(fullText),
    },
    {
        name: '"Currently pursuing" stripped from completed degree',
        expectFire: false,
        actualFired: /currently pursuing/i.test(cleaned.education[0].description || ''),
    },

    // ── New checks added Apr 28 2026 from real-CV bug report ──────────────────
    {
        name: 'No ", ensuring …" filler clause remains in any bullet',
        expectFire: false,
        actualFired: /,\s*ensuring\s+/i.test(allBullets),
    },
    {
        name: 'No "end-to-end" buzzword remains anywhere',
        expectFire: false,
        actualFired: /\bend[- ]to[- ]end\b/i.test(fullText),
    },
    {
        name: 'No consecutive prepositions like "by through" remain',
        expectFire: false,
        actualFired: /\b(?:by|of|to|from|with|over|under)\s+(?:through|via|by|with|using|including|featuring|across|within|during)\b/i.test(allBullets),
    },
    {
        name: 'No dangling ", in revenue/sales/profit" without leading number',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities).some(b => {
            // Find every ", in <noun>" occurrence and verify a digit precedes it within 12 chars.
            const re = /,\s+in\s+(revenue|sales|profits?|earnings|growth|costs?|savings?|expenses?|margins?)\b/gi;
            let m: RegExpExecArray | null;
            while ((m = re.exec(b)) !== null) {
                const prev = b.slice(Math.max(0, m.index - 12), m.index);
                if (!/\d/.test(prev)) return true; // dangling — fail
            }
            return false;
        }),
    },
    // Check the new probes also produced their corresponding leak entries —
    // the substitution diff records "ensuring …" / "end-to-end …" through the
    // "banned_phrase" leak type (substitutions are tagged that way upstream).
    {
        name: 'banned_phrase leak captured "ensuring" or "end-to-end" hits',
        expectFire: true,
        actualFired: report.leaks.some(l => l.leakType === 'banned_phrase' &&
            (/ensuring/i.test(l.phrase) || /end[- ]to[- ]end/i.test(l.phrase))),
    },

    // ── Coverage for the previously-untested leakTypes ────────────────────────
    // Each one has a dedicated probe bullet upstream (Acme bullets [9]–[11]).
    {
        name: 'weird_opener fired (Re-framed → Framed)',
        expectFire: true,
        actualFired: byType.has('weird_opener'),
    },
    {
        name: 'No "Re-" verb prefix remains in any bullet',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities)
            .some(b => /^\s*Re-[a-z]/.test(b)),
    },
    {
        name: 'dup_prep_phrase fired (trailing "through training" stripped)',
        expectFire: true,
        actualFired: byType.has('dup_prep_phrase'),
    },
    {
        name: 'article_agreement fired ("a engineer" → "an engineer")',
        expectFire: true,
        actualFired: byType.has('article_agreement'),
    },
    {
        name: 'No "a engineer" / "an manager" disagreement remains',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities)
            .some(b => /\b[Aa]\s+[aeiouAEIOU]\w/.test(b) || /\b[Aa]n\s+[bcdfghjklmnpqrstvwxz]/.test(b)),
    },

    // ── New checks added Apr 29 2026 — Bruce Oyugi McKinsey CV ────────────────
    {
        name: 'No orphan leading-decimal ".8M/.5K/.25%" remains anywhere',
        expectFire: false,
        actualFired: /(?<![\d])\.\d+\s*(?:K|M|B|%)\b/.test(fullText),
    },
    {
        name: 'No "<verb>.<digit>M/K/B" glued fragment remains (e.g. "achieving.8M")',
        expectFire: false,
        actualFired: /\b(?:achieving|reaching|delivering|generating|resulting|adding|earning|saving|hitting|exceeding|producing|driving|netting)\.\d/i.test(fullText),
    },
    {
        name: 'No "within|after|before|during of <noun>" broken fragment remains',
        expectFire: false,
        actualFired: /\b(?:within|after|before|during)\s+of\b/i.test(allBullets),
    },
    {
        name: 'No bullet ends with a dangling comma/semicolon',
        expectFire: false,
        actualFired: cleaned.experience.flatMap(e => e.responsibilities)
            .some(b => /[,;:]\s*$/.test(b)),
    },
    {
        name: 'orphan_metric leak captured the new orphan-leading-decimal/time-prep probes',
        expectFire: true,
        // Both probe bullets should each fire orphan_metric — at least 2 hits in addition
        // to the pre-existing summary/bullet probes (which contributed ~5 already).
        actualFired: (byType.get('orphan_metric') || 0) >= 6,
    },

    // ── Universal "metric verb without a number" coverage (Apr 29 2026) ──────
    {
        name: 'unquantified_metric_verb fired (3 probes: achieving/cutting/increasing)',
        expectFire: true,
        actualFired: byType.has('unquantified_metric_verb'),
    },
    {
        name: 'unquantified_metric_verb fired AT LEAST 3 times (one per probe bullet)',
        expectFire: true,
        actualFired: (byType.get('unquantified_metric_verb') || 0) >= 3,
    },
    {
        name: 'No ", achieving water savings" clause remains in any bullet',
        expectFire: false,
        actualFired: /,\s+achieving\s+water\s+savings\b/i.test(allBullets),
    },
    {
        name: 'No ", cutting lead time" clause remains in any bullet',
        expectFire: false,
        actualFired: /,\s+cutting\s+lead\s+time\b/i.test(allBullets),
    },
    {
        name: 'No ", increasing adoption of scheduling features" clause remains',
        expectFire: false,
        actualFired: /,\s+increasing\s+adoption\s+of\s+scheduling\b/i.test(allBullets),
    },
    {
        name: 'SAFETY: ", increasing revenue by 30%" preserved (has digit)',
        expectFire: false,
        actualFired: !cleaned.experience[0].responsibilities.some(
            b => /increasing revenue by 30/i.test(b),
        ),
    },
    {
        name: 'SAFETY: primary-verb gerund "Achieving water savings on every project" preserved',
        expectFire: false,
        actualFired: !cleaned.experience[0].responsibilities.some(
            b => /Achieving water savings on every project/i.test(b),
        ),
    },

    // ── Bullet rhythm / length-threshold checks (Apr 29 2026) ───────────────
    {
        name: 'bullet_rhythm_monotone fired on the Monotone Co role (4 bullets all ~19w)',
        expectFire: true,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_rhythm_monotone'
              && /Monotone Co/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'bullet_rhythm_monotone did NOT fire on the Healthy Mix Inc role (mixed lengths)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_rhythm_monotone'
              && /Healthy Mix Inc/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'short_bullet did NOT fire on the 10-word punchy bullet (threshold loosened from 12 → 8)',
        expectFire: false,
        // The "Closed 3 enterprise accounts in the first quarter alone." bullet
        // is 10 words. Under the OLD rule (<12) this would have fired. Under
        // the NEW rule (<8) it must not.
        actualFired: report.leaks.some(
            l => l.leakType === 'short_bullet'
              && /Closed 3 enterprise accounts/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'long_bullet did NOT fire on the 32-word narrative bullet (threshold loosened from 30 → 45)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'long_bullet'
              && /Architected the rollout plan/i.test(l.phrase || ''),
        ),
    },

    // ── 8-bullet rhythm scaling checks (Apr 29 2026) ─────────────────────────
    // The rules must SCALE — a user setting pointCount=8 with a healthy
    // proportional mix (2 punchy + 4 standard + 2 narrative) must pass
    // every length-related detector.
    {
        name: 'bullet_rhythm_monotone did NOT fire on the 8-bullet Big Mix Co role (proportional mix)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_rhythm_monotone'
              && /Big Mix Co/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'No short_bullet leaks on the 8-bullet Big Mix Co role (all bullets ≥ 8 words)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'short_bullet'
              && /experience\[4\]/.test(l.fieldLocation || ''),
        ),
    },
    {
        name: 'No long_bullet leaks on the 8-bullet Big Mix Co role (all bullets ≤ 45 words)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'long_bullet'
              && /experience\[4\]/.test(l.fieldLocation || ''),
        ),
    },
    {
        name: 'Big Mix Co role retains all 8 bullets after polish (no silent drops)',
        expectFire: false,
        actualFired: cleaned.experience[4].responsibilities.length !== 8,
    },

    // ── Band-imbalance detector checks (Apr 29 2026) ─────────────────────────
    // Punchy Stack Co lives at experience[6] (after Healthy Mix Inc at [5]).
    // The role has 6 bullets: 5 punchy (9w each) + 1 narrative (30w). Stddev
    // works out to ≈ 7.83, well above the monotone threshold of 3, so the
    // OLD detector abstains. The NEW band-imbalance detector must catch it
    // — this is the exact edge case it was added for.
    {
        name: 'bullet_band_imbalance fired on the Punchy Stack Co role (5 bullets in punchy band, 1 outlier)',
        expectFire: true,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_band_imbalance'
              && /Punchy Stack Co/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'bullet_rhythm_monotone did NOT fire on Punchy Stack Co (stddev ≈ 7.83 — proves band detector closes the gap)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_rhythm_monotone'
              && /Punchy Stack Co/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'bullet_band_imbalance did NOT fire on the 8-bullet Big Mix Co role (max 4 in any band — healthy 2/4/2 split)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_band_imbalance'
              && /Big Mix Co/i.test(l.phrase || ''),
        ),
    },
    {
        name: 'bullet_band_imbalance did NOT fire on the 4-bullet Healthy Mix Inc role (below the ≥5-bullet threshold)',
        expectFire: false,
        actualFired: report.leaks.some(
            l => l.leakType === 'bullet_band_imbalance'
              && /Healthy Mix Inc/i.test(l.phrase || ''),
        ),
    },
];

let passed = 0, failed = 0;
const fails: string[] = [];
for (const c of checks) {
    const ok = c.expectFire === c.actualFired;
    const label = c.expectFire
        ? (ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`)
        : (ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`);
    const extra = c.extra ? `  ${C.dim}(${c.extra})${C.reset}` : '';
    console.log(`  ${label}  ${c.name}${extra}`);
    if (ok) passed++;
    else { failed++; fails.push(c.name); }
}

// ─── Secondary mini-CV: dataset-level leak coverage ─────────────────────────
// The main dummy CV above is keyword-dense and metric-rich, so the dataset-level
// detectors (low_quantification at <40%, repeated_phrase across bullets, the
// whitespace_dash polish step) don't necessarily fire. This second pass uses a
// sparse CV intentionally engineered to trigger ONLY those three leak categories.

sub('SECONDARY CV — coverage for low_quantification, repeated_phrase, whitespace_dash');

const sparseCv: CVData = {
    summary: 'Engineer with experience in software systems and platform tools.',
    skills: ['Python'],
    experience: [
        {
            company: 'Past Co',
            jobTitle: 'Engineer',
            dates: '2020 - 2023',
            startDate: '2020-01-01',
            endDate: '2023-12-31',
            responsibilities: [
                // Whitespace + dash artefacts: tab, double-space, hyphen-with-spaces around dash
                // → normaliseWhitespaceAndDashes should normalise → emits whitespace_dash leak.
                'Built\tnew  features  -  shipped to production for the platform team',
                // Repeated 3-gram across bullets ("delivered measurable results") — appears 3×
                // → detectPhraseRepetition should flag → emits repeated_phrase leak.
                'Owned the rollout strategy and delivered measurable results for the customer team',
                'Drove cross-team alignment and delivered measurable results for the partner team',
                'Designed onboarding flows and delivered measurable results for the analytics team',
                // Bullets WITHOUT any number — these drive the quantification ratio below 40%.
                'Mentored newer engineers across the platform group',
                'Supported on-call rotation for the core services team',
                'Collaborated with product managers on roadmap planning',
            ],
        },
    ],
    education: [],
};

const { cv: sparseClean, report: sparseReport } = purifyCV(sparseCv);
const sparseTypes = new Set(sparseReport.leaks.map(l => l.leakType));

const sparseChecks: Check[] = [
    {
        name: 'low_quantification fired (<40% of bullets have a number)',
        expectFire: true,
        actualFired: sparseTypes.has('low_quantification'),
        extra: `actual ratio ${(sparseReport.quantificationRatio * 100).toFixed(0)}%`,
    },
    {
        name: 'repeated_phrase fired ("delivered measurable results" ×3)',
        expectFire: true,
        actualFired: sparseTypes.has('repeated_phrase'),
        extra: `${sparseReport.repeatedPhrases.length} phrase(s) flagged`,
    },
    {
        name: 'whitespace_dash fired (tab + double-space + bare dash)',
        expectFire: true,
        actualFired: sparseTypes.has('whitespace_dash'),
    },
    {
        name: 'No tab characters remain in any sparse-CV bullet',
        expectFire: false,
        actualFired: sparseClean.experience[0].responsibilities.some(b => /\t/.test(b)),
    },
    {
        name: 'No double-space remains in any sparse-CV bullet',
        expectFire: false,
        actualFired: sparseClean.experience[0].responsibilities.some(b => /  /.test(b)),
    },
];

let sparsePassed = 0, sparseFailed = 0;
for (const c of sparseChecks) {
    const ok = c.expectFire === c.actualFired;
    const label = ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
    const extra = c.extra ? `  ${C.dim}(${c.extra})${C.reset}` : '';
    console.log(`  ${label}  ${c.name}${extra}`);
    if (ok) sparsePassed++;
    else { sparseFailed++; fails.push(`[secondary] ${c.name}`); }
}

// ─── leakType coverage matrix ───────────────────────────────────────────────
// Cross-check every leakType in the PurifyLeak union against the combined
// fire-set. Anything missing means a regression in coverage.

sub('LEAK-TYPE COVERAGE MATRIX');

const ALL_LEAK_TYPES = [
    'banned_phrase', 'duplicate_word', 'pursuing_phrase', 'tense_mismatch',
    'round_number', 'repeated_phrase',
    'first_person', 'weak_qualifier', 'weak_opener', 'weird_opener', 'markup_artifact',
    'capitalisation', 'trailing_period', 'number_format', 'whitespace_dash',
    'skill_casing', 'duplicate_skill', 'low_quantification',
    'orphan_metric', 'short_bullet', 'long_bullet', 'unicode_glyph',
    'dup_prep_phrase', 'article_agreement',
    'unquantified_metric_verb',
    'bullet_rhythm_monotone',
    'bullet_band_imbalance',
] as const;

const combinedTypes = new Set<string>([...byType.keys(), ...sparseTypes]);
const missing = ALL_LEAK_TYPES.filter(t => !combinedTypes.has(t));
let coveragePassed = 0, coverageFailed = 0;
for (const t of ALL_LEAK_TYPES) {
    const fired = combinedTypes.has(t);
    const label = fired ? `${C.green}COVERED${C.reset}` : `${C.red}MISSING${C.reset}`;
    console.log(`  ${label}  ${t}`);
    if (fired) coveragePassed++;
    else { coverageFailed++; fails.push(`[coverage] ${t} not exercised by any probe`); }
}

// ─── Summary ────────────────────────────────────────────────────────────────

const totalChecks = checks.length + sparseChecks.length + ALL_LEAK_TYPES.length;
const totalPassed = passed + sparsePassed + coveragePassed;
const totalFailed = failed + sparseFailed + coverageFailed;

sub('SUMMARY');
console.log(`  Pipeline ran in ${C.bold}${elapsed} ms${C.reset}`);
console.log(`  Main checks       : ${passed}/${checks.length}`);
console.log(`  Secondary checks  : ${sparsePassed}/${sparseChecks.length}`);
console.log(`  LeakType coverage : ${coveragePassed}/${ALL_LEAK_TYPES.length}` +
    (missing.length ? `  ${C.red}(missing: ${missing.join(', ')})${C.reset}` : ''));
console.log(`  Verdict: ${C.bold}${totalPassed}/${totalChecks}${C.reset} checks passed, ${totalFailed > 0 ? C.red : C.green}${totalFailed} failed${C.reset}`);
if (fails.length) {
    console.log(`\n  ${C.red}Failed checks:${C.reset}`);
    fails.forEach(f => console.log(`    - ${f}`));
}
if (captured.length) {
    sub('CAPTURED [Purify] WARNINGS');
    captured.forEach(c => console.log(`  ${C.dim}${c}${C.reset}`));
}

console.log('');
process.exit(totalFailed > 0 ? 1 : 0);
