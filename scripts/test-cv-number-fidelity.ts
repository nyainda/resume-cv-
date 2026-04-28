/**
 * Number-fidelity guardrail tests.
 *
 * Run with:  npx tsx scripts/test-cv-number-fidelity.ts
 *
 * Covers the regression where the number-fidelity strip in
 * services/geminiService.ts deleted just the digits and left orphan "%",
 * "+", "-noun", "KES ", "$" symbols behind. Also exercises the per-bullet
 * fallback to source bullets when a generated bullet would come out broken.
 */
import {
    collectSourceNumberTokens,
    stripUngroundedNumbers,
    tidyOrphanRemnants,
    repairBulletsAgainstSource,
    isBulletDegraded,
} from '../services/cvNumberFidelity';

interface Case {
    label: string;
    actual: string;
    forbid?: RegExp[];      // patterns that must NOT appear in actual
    require?: RegExp[];     // patterns that MUST appear in actual
    equals?: string;        // exact match
}

const cases: Case[] = [];

// ── stripUngroundedNumbers: orphan-symbol regression cases ────────────────
const empty = new Set<string>();

cases.push({
    label: 'KES with comma orphan is fully cleaned',
    actual: stripUngroundedNumbers(
        'Engineered strategic sales generating KES 9,876,543 in revenue for Elgon',
        empty,
    ),
    forbid: [/KES\s*,/, /\bKES\b\s*$/, /\s,\s*in\b/],
});

cases.push({
    label: 'orphan % after preposition is removed',
    actual: stripUngroundedNumbers(
        'Exceeded monthly targets by 30% from Dec 2023 to Present',
        empty,
    ),
    forbid: [/\bby\s+%/, /\s%/, /\sby\s+from\b/],
    require: [/from Dec 2023 to Present/], // year preserved
});

cases.push({
    label: 'orphan + after "of" is removed (no "of + clients")',
    actual: stripUngroundedNumbers(
        'Manages a portfolio of 15+ end-to-end project lifecycles',
        empty,
    ),
    forbid: [/of\s+\+/, /\s\+\s/],
    require: [/portfolio/, /lifecycles/],
});

cases.push({
    label: 'orphan -person between article and noun is removed',
    actual: stripUngroundedNumbers(
        'Coordinates with a 5-person field operations team across Nairobi',
        empty,
    ),
    forbid: [/\ba\s+-person\b/, /\s-person\b/],
    require: [/field operations team/],
});

cases.push({
    label: '4-digit calendar year is preserved',
    actual: stripUngroundedNumbers(
        'Joined Elgon Kenya in 2023 as a Field Engineer',
        empty,
    ),
    require: [/\b2023\b/],
});

cases.push({
    label: 'number that appears in source is preserved',
    actual: stripUngroundedNumbers(
        'Served 47 clients across East Africa with 97.5% satisfaction',
        new Set(['47', '97.5']),
    ),
    require: [/\b47\b/, /97\.5%/],
});

cases.push({
    label: '$ amount fully consumed (no orphan $ or "$ ,") ',
    actual: stripUngroundedNumbers(
        'Saved the department $250,000 in operating costs',
        empty,
    ),
    // Hollow but grammatical: "Saved the department in operating costs".
    // The per-bullet fallback (repairBulletsAgainstSource) catches this in
    // production. Here we only assert no orphan currency symbol survived.
    forbid: [/\$\s*,/, /\$\s/, /\$$/],
});

cases.push({
    label: '"by 5x" fully consumed',
    actual: stripUngroundedNumbers('Improved throughput by 5x in Q4', empty),
    forbid: [/\bby\s+x\b/, /\bby\s+in\b/],
    require: [/throughput/, /Q4/],
});

// ── collectSourceNumberTokens: pulls numbers from summary too ─────────────
{
    const profile = {
        professionalSummary: 'Engineer with 3 years specialising in irrigation, generating KES 9,876,543 in revenue and 97.5% client satisfaction across 47 clients.',
        workExperience: [],
    };
    const tokens = collectSourceNumberTokens([], profile);
    cases.push({
        label: 'collect: summary number "47" picked up',
        actual: tokens.has('47') ? 'YES' : 'NO',
        equals: 'YES',
    });
    cases.push({
        label: 'collect: summary number "97.5" picked up',
        actual: tokens.has('97.5') ? 'YES' : 'NO',
        equals: 'YES',
    });
    cases.push({
        label: 'collect: comma-stripped form "9876543" also picked up',
        actual: tokens.has('9876543') ? 'YES' : 'NO',
        equals: 'YES',
    });
}

// ── repairBulletsAgainstSource: per-bullet fallback ───────────────────────
{
    const sourceBullets = [
        'Designed irrigation systems for large-scale agricultural projects across Nairobi.',
        'Conducted site assessments and technical analyses for clients in Central Kenya.',
        'Developed and maintained strong relationships with clients to drive long-term growth.',
    ];
    const generated = [
        // Good — should pass through stripped of bogus number
        'Designed irrigation systems for 5 large-scale agricultural projects across Nairobi.',
        // Garbage after strip — should fall back to source bullet [1]
        'Conducted assessments for % of clients with KES , in revenue.',
        // Sentence stub after strip — should fall back to source bullet [2]
        'by 5x and a 30%',
    ];
    const repaired = repairBulletsAgainstSource(generated, sourceBullets, empty);
    cases.push({
        label: 'repair: kept the good bullet (stripped of bogus number)',
        actual: repaired[0],
        require: [/Designed irrigation systems for large-scale agricultural projects/],
    });
    cases.push({
        label: 'repair: replaced garbage bullet with source bullet [1]',
        actual: repaired[1],
        equals: sourceBullets[1],
    });
    cases.push({
        label: 'repair: replaced sentence stub with source bullet [2]',
        actual: repaired[2],
        equals: sourceBullets[2],
    });
}

// ── isBulletDegraded sanity ───────────────────────────────────────────────
cases.push({
    label: 'degraded: empty string is degraded',
    actual: isBulletDegraded('', 'Some original bullet here') ? 'YES' : 'NO',
    equals: 'YES',
});
cases.push({
    label: 'degraded: starts with preposition is degraded',
    actual: isBulletDegraded('by Q4 in Nairobi', 'Original much longer bullet here') ? 'YES' : 'NO',
    equals: 'YES',
});
cases.push({
    label: 'degraded: healthy long bullet is NOT degraded',
    actual: isBulletDegraded(
        'Designed irrigation systems for large-scale agricultural projects across Nairobi.',
        'Designed irrigation systems for 5 large-scale agricultural projects across Nairobi.',
    ) ? 'YES' : 'NO',
    equals: 'NO',
});

// ── tidyOrphanRemnants: pure idempotency on already-clean text ───────────
cases.push({
    label: 'tidy: clean text is unchanged',
    actual: tidyOrphanRemnants('Designed irrigation systems for 5 projects.'),
    equals: 'Designed irrigation systems for 5 projects.',
});

// ── Run ───────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
for (const c of cases) {
    let ok = true;
    let reason = '';
    if (c.equals !== undefined && c.actual !== c.equals) {
        ok = false;
        reason = `expected exact "${c.equals}"`;
    }
    if (ok && c.forbid) {
        for (const rx of c.forbid) {
            if (rx.test(c.actual)) {
                ok = false;
                reason = `forbidden pattern ${rx} appeared`;
                break;
            }
        }
    }
    if (ok && c.require) {
        for (const rx of c.require) {
            if (!rx.test(c.actual)) {
                ok = false;
                reason = `required pattern ${rx} missing`;
                break;
            }
        }
    }
    if (ok) {
        pass++;
        console.log(`  ✓ ${c.label}`);
    } else {
        fail++;
        console.log(`  ✗ ${c.label}`);
        console.log(`      ${reason}`);
        console.log(`      got:  "${c.actual}"`);
    }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
