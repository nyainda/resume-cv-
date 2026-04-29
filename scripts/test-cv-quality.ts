/**
 * Universal CV quality test — exercises every guardrail in the purification
 * chain against a realistic dummy CV that contains every kind of breakage
 * we have ever shipped:
 *
 *   • orphan decimal stubs           ("Generated.8M")
 *   • chained prepositions           ("by since Dec")
 *   • "with <participle>" stranded   ("with delivering")
 *   • hedged-outcome residue         ("achieving average water savings")
 *   • half-open ranges               ("from over 95%")
 *   • lowercase sentence starts      (". the team")
 *   • lowercase pronoun "i"          ("i designed")
 *   • missing space after period     (".Designed")
 *   • double / orphan commas         (", ,") and stray currency commas
 *   • "on average" tail              ("…savings on average.")
 *
 * The script does THREE things in sequence:
 *   1. UNIT  — feeds 20+ broken phrases through `tidyOrphanRemnants` and
 *              checks the output matches expectations.
 *   2. AUDIT — runs the full `auditCvQuality` against the dummy CV BEFORE
 *              and AFTER cleanup and prints both reports side-by-side.
 *   3. CV    — prints the dummy CV in full, before and after the universal
 *              cleanup, so a human can eyeball the result.
 *
 * Run:   npx tsx scripts/test-cv-quality.ts
 * Exits with code 0 if every check passes, code 1 otherwise.
 */

import {
    tidyOrphanRemnants,
    auditCvQuality,
    isBulletDegraded,
} from '../services/cvNumberFidelity';
// We import the polish pipeline indirectly through purifyCV in production,
// but for the trailing-period unit test we re-implement the same single rule
// inline so this script stays free of Vite-only dependencies.
function ensureTrailingPeriod(text: string): string {
    if (!text) return text;
    let out = text.replace(/\s+$/g, '');
    if (!out) return text;
    out = out.replace(/[,;]+$/g, '.');
    if (/\.{2,}$/.test(out) && !/\.\.\.$/.test(out)) out = out.replace(/\.+$/, '.');
    if (/[.!?…]$/.test(out)) return out;
    return out + '.';
}

// ── Tiny ANSI helpers (no deps) ────────────────────────────────────────────
const C = {
    g: (s: string) => `\x1b[32m${s}\x1b[0m`,
    r: (s: string) => `\x1b[31m${s}\x1b[0m`,
    y: (s: string) => `\x1b[33m${s}\x1b[0m`,
    b: (s: string) => `\x1b[1m${s}\x1b[0m`,
    d: (s: string) => `\x1b[2m${s}\x1b[0m`,
};
const PASS = C.g('PASS');
const FAIL = C.r('FAIL');

let totalPassed = 0;
let totalFailed = 0;

function expectClean(label: string, input: string, mustNotContain: RegExp[]): void {
    const out = tidyOrphanRemnants(input);
    const violations = mustNotContain.filter(rx => rx.test(out));
    if (violations.length === 0) {
        totalPassed++;
        console.log(`  ${PASS} ${label}`);
        console.log(`         in : ${C.d(input)}`);
        console.log(`         out: ${out}`);
    } else {
        totalFailed++;
        console.log(`  ${FAIL} ${label}`);
        console.log(`         in : ${C.d(input)}`);
        console.log(`         out: ${C.r(out)}`);
        console.log(`         hit: ${violations.map(r => r.source).join(', ')}`);
    }
}

function expectExact(label: string, input: string, expected: string): void {
    const out = tidyOrphanRemnants(input);
    if (out === expected) {
        totalPassed++;
        console.log(`  ${PASS} ${label}`);
        console.log(`         out: ${out}`);
    } else {
        totalFailed++;
        console.log(`  ${FAIL} ${label}`);
        console.log(`         in  : ${C.d(input)}`);
        console.log(`         got : ${C.r(out)}`);
        console.log(`         want: ${C.g(expected)}`);
    }
}

function expectPreserved(label: string, input: string): void {
    const out = tidyOrphanRemnants(input);
    if (out === input.trim().replace(/\s+/g, ' ')) {
        totalPassed++;
        console.log(`  ${PASS} ${label}  ${C.d('(unchanged)')}`);
    } else {
        totalFailed++;
        console.log(`  ${FAIL} ${label}`);
        console.log(`         in : ${C.d(input)}`);
        console.log(`         out: ${C.r(out)}`);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. UNIT — phrase-level cleanup
// ────────────────────────────────────────────────────────────────────────────
console.log(C.b('\n━━━ 1. PHRASE-LEVEL CLEANUP ━━━\n'));

console.log(C.b('Orphan decimals & currency:'));
expectClean('Orphan decimal mid-sentence',
    'Generated.8M in revenue last year.',
    [/\.\d/, /\b\.8M\b/]);
expectClean('Orphan currency word',
    'Brought in by KES from the regional office.',
    [/\bby\s+KES\b/]);
expectClean('Orphan "$ ," group',
    'Saved $ ,500,000 in operating cost.',
    [/\$\s*,/]);

console.log(C.b('\nChained prepositions / temporals:'));
expectClean('"by since" chain',
    'Exceeded targets by since Dec 2023.',
    [/\bby\s+since\b/]);
expectClean('"by from" chain',
    'Increased uptime by from 90% baseline.',
    [/\bby\s+from\b/]);
expectClean('"to in" chain',
    'Scaled to in three regions.',
    [/\bto\s+in\b/]);

console.log(C.b('\nReal ranges must SURVIVE:'));
expectPreserved('"from 50% to over 95%" range',
    'Improved efficiency from 50% to over 95% within six months.');
expectPreserved('"from 10 to 25 sites" range',
    'Expanded coverage from 10 to 25 sites across East Africa.');

console.log(C.b('\nUnanchored participles:'));
expectClean('"with delivering"',
    'Field engineer with delivering irrigation in Kenya.',
    [/\bwith\s+delivering\b/]);
expectClean('"with managing"',
    'Senior PM with managing a team of 5.',
    [/\bwith\s+managing\b/]);

console.log(C.b('\nHedged-outcome residue:'));
expectClean('"achieving average water savings"',
    'Designed irrigation systems, achieving average water savings.',
    [/achieving\s+average\s+water\s+savings/]);
expectClean('"yielding substantial growth"',
    'Launched programme, yielding substantial growth.',
    [/yielding\s+substantial\s+growth/]);

console.log(C.b('\n"on average" tail:'));
expectClean('"on average" at end',
    'Cut energy use by 18% on average.',
    [/\bon\s+average\.?$/]);
expectPreserved('"on average," at start kept',
    'On average, the team ships 3 features a week.');

console.log(C.b('\nTrailing period on bullets (NEW rule — every bullet ends with .):'));
function expectBullet(label: string, input: string, expected: string) {
    const out = ensureTrailingPeriod(input);
    if (out === expected) {
        totalPassed++;
        console.log(`  ${PASS} ${label}`);
        console.log(`         out: ${out}`);
    } else {
        totalFailed++;
        console.log(`  ${FAIL} ${label}`);
        console.log(`         in  : ${C.d(input)}`);
        console.log(`         got : ${C.r(out)}`);
        console.log(`         want: ${C.g(expected)}`);
    }
}
expectBullet('Bare bullet gets a period',
    'Managed 15 irrigation projects across 3 counties',
    'Managed 15 irrigation projects across 3 counties.');
expectBullet('Already-period bullet unchanged',
    'Cut energy use by 18%.',
    'Cut energy use by 18%.');
expectBullet('Trailing comma → period',
    'Built the team, hired five engineers,',
    'Built the team, hired five engineers.');
expectBullet('Trailing semicolon → period',
    'Designed the system;',
    'Designed the system.');
expectBullet('Question mark preserved',
    'Why ship without tests?',
    'Why ship without tests?');
expectBullet('Ellipsis preserved',
    'And then it shipped...',
    'And then it shipped...');
expectBullet('Double period collapses to one',
    'Generated revenue..',
    'Generated revenue.');

console.log(C.b('\nCapitalisation & punctuation:'));
expectExact('Capitalises after period',
    'Designed bridges. focused on safety.',
    'Designed bridges. Focused on safety.');
expectExact('Adds space after period',
    'Designed bridges.Focused on safety.',
    'Designed bridges. Focused on safety.');
expectExact('Standalone "i" → "I"',
    'i designed the system and i shipped it.',
    'I designed the system and I shipped it.');
expectExact('Collapses double comma',
    'Built the team,, hired five engineers.',
    'Built the team, hired five engineers.');
expectExact('Comma before period stripped',
    'Cut downtime, on average, .',
    'Cut downtime.');
expectPreserved('"i.e." not touched',
    'Built the prototype (i.e. the first cut) in a week.');
expectPreserved('Title-case sentence kept',
    'Designed and shipped a payment service across three regions.');

// ────────────────────────────────────────────────────────────────────────────
// 2. AUDIT — full CV report before / after
// ────────────────────────────────────────────────────────────────────────────
console.log(C.b('\n━━━ 2. FULL-CV AUDIT (BEFORE → AFTER) ━━━\n'));

const dummyBroken = {
    personalInfo: { name: 'Asha Mwangi', email: 'asha@example.com' },
    summary:
        'Field & Sales Engineer with delivering water and energy solutions in East Africa\u2019s agricultural sector. ' +
        'Generated.8M in revenue by engineering strategic sales of Water Solutions, exceeding monthly targets by since Dec 2023. ' +
        'designed and delivered 15 irrigation system projects with a focus on data-driven decision making, achieving average water savings.',
    experience: [
        {
            jobTitle: 'Field & Sales Engineer',
            company: 'Davis & Shirtliff',
            responsibilities: [
                'Generated.8M in revenue by engineering strategic sales of Water Solutions',
                'Exceeded monthly targets by since Dec 2023, growing the East-Africa pipeline',
                'Designed and delivered 15 irrigation system projects with delivering data-driven decisions',
                'Improved water-use efficiency from 50% to over 95% within the irrigated zones',
                'i championed the new CRM rollout across the regional team.',
            ],
        },
    ],
    projects: [
        {
            name: 'Smart Irrigation Pilot',
            description:
                'Led a pilot covering 12 farms.achieving average water savings, on average. ' +
                'i coordinated the field-team and ,, partner agronomists.',
        },
    ],
} as any;

const before = auditCvQuality(dummyBroken);
console.log(C.b('BEFORE:'),
    `score=${C.r(String(before.score))}/100  bullets=${before.totalBullets}  issues=${C.r(String(before.totalIssues))}  (${before.durationMs}ms)`);
for (const i of before.issues.slice(0, 12)) {
    console.log(`  ${C.r('•')} [${i.kind}] ${i.where}`);
    console.log(`      ${C.d(i.snippet)}`);
}

// Now apply the universal cleanup to every text field and re-audit.
const cleaned = {
    ...dummyBroken,
    summary: tidyOrphanRemnants(dummyBroken.summary),
    experience: dummyBroken.experience.map((r: any) => ({
        ...r,
        responsibilities: r.responsibilities.map((b: string) => tidyOrphanRemnants(b)),
    })),
    projects: dummyBroken.projects.map((p: any) => ({
        ...p,
        description: tidyOrphanRemnants(p.description),
    })),
};

const after = auditCvQuality(cleaned);
console.log('');
console.log(C.b('AFTER :'),
    `score=${after.score === 100 ? C.g('100') : C.y(String(after.score))}/100  bullets=${after.totalBullets}  issues=${after.totalIssues === 0 ? C.g('0') : C.y(String(after.totalIssues))}  (${after.durationMs}ms)`);
for (const i of after.issues) {
    console.log(`  ${C.y('•')} [${i.kind}] ${i.where}`);
    console.log(`      ${C.d(i.snippet)}`);
}

if (before.totalIssues > 0 && after.totalIssues < before.totalIssues) {
    totalPassed++;
    console.log(`\n  ${PASS} Audit issues dropped from ${before.totalIssues} to ${after.totalIssues}`);
} else {
    totalFailed++;
    console.log(`\n  ${FAIL} Audit did not improve (before=${before.totalIssues}, after=${after.totalIssues})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. DUMMY CV — full before/after print so a human can eyeball it
// ────────────────────────────────────────────────────────────────────────────
console.log(C.b('\n━━━ 3. DUMMY CV — BEFORE → AFTER ━━━\n'));

function printCv(label: string, cv: any): void {
    console.log(C.b(`── ${label} ──`));
    console.log(C.b('Summary:'));
    console.log('  ' + cv.summary);
    for (const role of cv.experience) {
        console.log(C.b(`\n${role.jobTitle} @ ${role.company}`));
        for (const b of role.responsibilities) {
            console.log('  • ' + b);
        }
    }
    for (const p of cv.projects) {
        console.log(C.b(`\nProject: ${p.name}`));
        console.log('  ' + p.description);
    }
    console.log('');
}

printCv('BEFORE (broken)', dummyBroken);
printCv('AFTER  (cleaned)', cleaned);

// ── Bullet-degradation check (cleaned bullets must NOT trip isBulletDegraded)
console.log(C.b('━━━ 4. BULLET HEALTH CHECK (post-cleanup) ━━━\n'));
for (const role of cleaned.experience) {
    for (let idx = 0; idx < role.responsibilities.length; idx++) {
        const b = role.responsibilities[idx];
        const orig = dummyBroken.experience[0].responsibilities[idx];
        const degraded = isBulletDegraded(b, orig);
        if (!degraded) {
            totalPassed++;
            console.log(`  ${PASS} bullet ${idx + 1} healthy: ${C.d(b.slice(0, 80))}…`);
        } else {
            totalFailed++;
            console.log(`  ${FAIL} bullet ${idx + 1} would still trigger fallback`);
            console.log(`         ${C.r(b)}`);
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────────────────────────────────────────
console.log(C.b('\n━━━ SUMMARY ━━━'));
console.log(`  ${C.g(String(totalPassed))} passed   ${totalFailed > 0 ? C.r(String(totalFailed)) : '0'} failed`);
process.exit(totalFailed > 0 ? 1 : 0);
