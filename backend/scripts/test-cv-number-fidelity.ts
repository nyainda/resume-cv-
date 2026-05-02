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
    repairTextAgainstSource,
    isBulletDegraded,
    auditCvQuality,
} from '../../services/cvNumberFidelity';
import {
    stripFirstPersonPronouns,
    normalizePresentTenseToImperative,
    auditCvVoice,
    hasFirstPerson,
    startsWithThirdPersonSingularVerb,
} from '../../services/cvVoiceFidelity';

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

// ── repairTextAgainstSource: summary fallback when generated is broken ───
cases.push({
    label: 'summary: severely-hollowed generated falls back to source',
    actual: repairTextAgainstSource(
        // Long bullet that loses most of its words to the strip — should be
        // detected as degraded and replaced with source.
        'Generated KES 9,876,543 KES 1,234,567 KES 555,000 KES 222,000 KES 333,000 in revenue.',
        'Experienced sales leader with a track record across East Africa.',
        new Set<string>(), // no grounded numbers
    ),
    equals: 'Experienced sales leader with a track record across East Africa.',
});
cases.push({
    label: 'summary: stub-prefix generated falls back to source',
    actual: repairTextAgainstSource(
        'by 30% across the East Africa region.',
        'Experienced sales leader with a track record across East Africa.',
        new Set<string>(),
    ),
    equals: 'Experienced sales leader with a track record across East Africa.',
});
cases.push({
    label: 'summary: empty source returns stripped text (no fallback)',
    actual: repairTextAgainstSource(
        'by 30% across the region.',
        '',
        new Set<string>(),
    ),
    require: [/across the region/],
});
cases.push({
    label: 'summary: clean generated is kept (numbers grounded)',
    actual: repairTextAgainstSource(
        'Designed irrigation systems for 5 large-scale projects across Nairobi.',
        'Source summary text.',
        new Set<string>(['5']),
    ),
    require: [/Designed irrigation systems for 5 large-scale projects/],
});

// ── auditCvQuality: orphan-symbol detection on the full CV shape ─────────
{
    const dirtyCv = {
        summary: 'Sales leader who generated KES , in revenue.',
        experience: [
            {
                jobTitle: 'Sales Lead',
                company: 'Acme',
                responsibilities: [
                    'Exceeded targets by % from Dec 2023',  // orphan_percent + stub
                    'Led a -person team across Nairobi',     // orphan_hyphen_noun
                    '',                                      // empty_bullet
                    'Delivered the the new playbook.',       // duplicate_adjacent_word
                ],
            },
        ],
        projects: [
            { name: 'Atlas', description: 'Built a system used by + clients.' },  // orphan_plus
        ],
    };
    const report = auditCvQuality(dirtyCv);
    cases.push({
        label: 'audit: detects every orphan-symbol class on a dirty CV',
        actual: String(report.totalIssues >= 6 ? 'YES' : `NO (${report.totalIssues})`),
        equals: 'YES',
    });
    cases.push({
        label: 'audit: score drops below 100 when issues exist',
        actual: report.score < 100 ? 'YES' : 'NO',
        equals: 'YES',
    });
    cases.push({
        label: 'audit: counts bullets correctly',
        actual: String(report.totalBullets),
        equals: '4',
    });
    cases.push({
        label: 'audit: runs in under 50 ms on a small CV',
        actual: report.durationMs < 50 ? 'YES' : `NO (${report.durationMs}ms)`,
        equals: 'YES',
    });
}
{
    const cleanCv = {
        summary: 'Designed irrigation systems for 5 large-scale projects across Nairobi in 2023.',
        experience: [
            {
                jobTitle: 'Engineer',
                company: 'Acme',
                responsibilities: [
                    'Designed irrigation systems for large-scale agricultural projects.',
                    'Led cross-functional teams to deliver on quarterly milestones in Q4.',
                ],
            },
        ],
        projects: [
            { name: 'Atlas', description: 'Built an internal platform used by the operations team.' },
        ],
    };
    const report = auditCvQuality(cleanCv);
    cases.push({
        label: 'audit: clean CV scores 100/100 with zero issues',
        actual: `${report.score}/${report.totalIssues}`,
        equals: '100/0',
    });
}

// ── stripUngroundedNumbers: time-unit consumption ────────────────────────
// Real bug from the field: AI wrote "Field & Sales Engineer with 5 years
// delivering technical sales" but "5" wasn't grounded. The old strip ate
// just "5", leaving "with years delivering" — orphan time reference.
cases.push({
    label: 'time unit: "with 5 years delivering" → no orphan "with years"',
    actual: stripUngroundedNumbers(
        'Field & Sales Engineer with 5 years delivering technical sales and water solutions',
        empty,
    ),
    forbid: [/\bwith\s+years\b/, /\bof\s+years\b/, /\bfor\s+years\b/],
});

cases.push({
    label: 'time unit: grounded "5 years" survives',
    actual: stripUngroundedNumbers(
        'Engineer with 5 years delivering technical sales',
        new Set(['5']),
    ),
    require: [/5\s+years/],
});

cases.push({
    label: 'tidyOrphanRemnants alone removes a stray "with years"',
    actual: tidyOrphanRemnants('Engineer with years delivering technical sales'),
    forbid: [/\bwith\s+years\b/],
    require: [/Engineer\s+delivering/],
});

// ── stripFirstPersonPronouns ─────────────────────────────────────────────
cases.push({
    label: 'first-person: "I\'ve combined X to help" → "Combined X to help"',
    actual: stripFirstPersonPronouns(
        "I've combined data analysis, site surveying, and project management to help farmers adopt precision agriculture.",
    ),
    forbid: [/\bI've\b/, /\bI\b/, /\bI\s/],
    require: [/Combined data analysis/, /to help farmers/],
});

cases.push({
    label: 'first-person: mid-sentence "I have built" pronoun stripped',
    actual: stripFirstPersonPronouns(
        'Across the engagement, I have built robust dashboards used by 30 stakeholders.',
    ),
    forbid: [/\bI\s+have\b/, /\bI've\b/, /\bI\b/],
    require: [/built robust dashboards/],
});

cases.push({
    label: 'first-person: "my team" → "the team", "we delivered" → "Delivered"',
    actual: stripFirstPersonPronouns(
        'We delivered the project on time. My team owned the rollout.',
    ),
    forbid: [/\bWe\b/, /\bwe\b/, /\bMy\b/, /\bmy\b/],
    require: [/Delivered the project/, /the team/],
});

cases.push({
    label: 'first-person: text with no pronouns is unchanged',
    actual: stripFirstPersonPronouns(
        'Designed irrigation systems for commercial farms across East Africa.',
    ),
    equals: 'Designed irrigation systems for commercial farms across East Africa.',
});

// ── normalizePresentTenseToImperative ────────────────────────────────────
cases.push({
    label: 'tense: "Generates KES …" → "Generate KES …"',
    actual: normalizePresentTenseToImperative(
        'Generates KES 10,000,000 in equipment revenue by closing sales above monthly targets',
    ),
    require: [/^Generate\s+KES/],
    forbid: [/^Generates\b/],
});

cases.push({
    label: 'tense: "Delivers tailored …" → "Deliver tailored …"',
    actual: normalizePresentTenseToImperative(
        'Delivers tailored irrigation designs using AutoCAD',
    ),
    require: [/^Deliver\s+tailored/],
    forbid: [/^Delivers\b/],
});

cases.push({
    label: 'tense: "Maintains …" / "Improves …" / "Reduces …" all normalised',
    actual: [
        normalizePresentTenseToImperative('Maintains a 98% client satisfaction rate'),
        normalizePresentTenseToImperative('Improves client retention'),
        normalizePresentTenseToImperative('Reduces inventory costs'),
    ].join(' || '),
    require: [/^Maintain\s+a\s+98%/, /\|\|\s+Improve\s+client/, /\|\|\s+Reduce\s+inventory/],
    forbid: [/Maintains\s/, /Improves\s/, /Reduces\s/],
});

cases.push({
    label: 'tense: imperative bullet ("Manage 15+ …") is unchanged',
    actual: normalizePresentTenseToImperative('Manage 15+ end-to-end irrigation projects annually'),
    equals: 'Manage 15+ end-to-end irrigation projects annually',
});

cases.push({
    label: 'tense: past-tense bullet ("Led the design …") is unchanged',
    actual: normalizePresentTenseToImperative('Led the design of drip, sprinkler, and center pivot systems'),
    equals: 'Led the design of drip, sprinkler, and center pivot systems',
});

cases.push({
    label: 'tense: unknown verb ("Synthesizes …") left alone (allow-list only)',
    actual: normalizePresentTenseToImperative('Synthesizes raw signal data into reports'),
    equals: 'Synthesizes raw signal data into reports',
});

// ── auditCvVoice + audit integration ─────────────────────────────────────
{
    const badCv = {
        summary: "I've combined data analysis and project management to help farmers.",
        experience: [
            {
                jobTitle: 'Field Engineer',
                company: 'Elgon',
                endDate: 'Present',
                responsibilities: [
                    'Manage 15 end-to-end projects annually.',
                    'Generates KES 10,000,000 in equipment revenue.',
                    'Delivers tailored irrigation designs.',
                ],
            },
            {
                jobTitle: 'Intern',
                company: 'Elgon',
                endDate: 'Jan 2024',
                responsibilities: [
                    'Led the design of drip and sprinkler systems for 20 farms.',
                ],
            },
        ],
    };
    const voiceIssues = auditCvVoice(badCv);
    const kinds = voiceIssues.map(v => v.kind).sort().join(',');
    cases.push({
        label: 'audit voice: detects 1 first_person + 2 tense issues in current role only',
        actual: kinds,
        equals: 'first_person_pronoun,tense_third_person_singular,tense_third_person_singular',
    });
    // Past role bullet "Led the design" must NOT trigger tense flag.
    const pastRoleFlags = voiceIssues.filter(v => v.where.includes('experience[1]'));
    cases.push({
        label: 'audit voice: past-tense bullet in non-current role is NOT flagged',
        actual: String(pastRoleFlags.length),
        equals: '0',
    });
    // Full audit merges voice + orphan probes into one report.
    const fullReport = auditCvQuality(badCv as any);
    cases.push({
        label: 'audit: voice issues are merged into auditCvQuality report',
        actual: fullReport.issues.some(i => i.kind === 'first_person_pronoun')
            && fullReport.issues.some(i => i.kind === 'tense_third_person_singular')
            ? 'YES' : 'NO',
        equals: 'YES',
    });
}

cases.push({
    label: 'audit voice: hasFirstPerson detects "I\'ve" but not bare "Indian"',
    actual: `${hasFirstPerson("I've combined")},${hasFirstPerson('Indian Ocean shipping route')}`,
    equals: 'true,false',
});

cases.push({
    label: 'audit voice: startsWithThirdPersonSingularVerb true for "Generates", false for "Manage"',
    actual: `${startsWithThirdPersonSingularVerb('Generates KES 10M')},${startsWithThirdPersonSingularVerb('Manage 15 projects')}`,
    equals: 'true,false',
});

// dangling_time_ref probe in audit
{
    const cv = {
        summary: 'Engineer with years delivering water solutions across East Africa.',
        experience: [],
    };
    const report = auditCvQuality(cv as any);
    cases.push({
        label: 'audit: "with years" in summary surfaces dangling_time_ref',
        actual: report.issues.some(i => i.kind === 'dangling_time_ref') ? 'YES' : 'NO',
        equals: 'YES',
    });
}

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
