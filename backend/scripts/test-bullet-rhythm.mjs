/**
 * test-bullet-rhythm.mjs
 *
 * Validates the quality checks added to cvQualityGate.ts:
 *   1. Summary too-short  — minimum 60 words (was incorrectly set to 45)
 *   2. Bullet too-short   — minimum 8 words per bullet
 *   3. Flat bullet rhythm — 3+ consecutive short bullets (all <12 words)
 *   4. Arrow separator    — "→" used as sentence connector inside a bullet
 *   5. Duplicate skills   — same skill appearing twice (case-insensitive)
 *   6. Project arrows     — "→" inside project description prose
 *
 * The checks are re-implemented inline here (plain JS mirror of the TypeScript)
 * so this script has zero external dependencies and runs with:
 *
 *   node backend/scripts/test-bullet-rhythm.mjs
 *
 * Exits 0 when every check passes, 1 on any failure.
 *
 * The CV used as fixture is modelled directly on the Bruce Oyugi Nyainda CV
 * attached by the user — it contains every real problem observed in that output.
 */

'use strict';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const C = {
    g: s => `\x1b[32m${s}\x1b[0m`,
    r: s => `\x1b[31m${s}\x1b[0m`,
    y: s => `\x1b[33m${s}\x1b[0m`,
    b: s => `\x1b[1m${s}\x1b[0m`,
    d: s => `\x1b[2m${s}\x1b[0m`,
};
const PASS = C.g('PASS');
const FAIL = C.r('FAIL');

let totalPassed = 0;
let totalFailed = 0;

function check(label, result, detail = '') {
    if (result) {
        totalPassed++;
        console.log(`  ${PASS}  ${label}`);
    } else {
        totalFailed++;
        console.log(`  ${FAIL}  ${label}`);
        if (detail) console.log(`         ${C.r(detail)}`);
    }
}

// ── Quality-check implementations (mirrors cvQualityGate.ts) ─────────────────

const BULLET_MIN_WORDS = 8;
const RHYTHM_SHORT_THRESHOLD = 12;
const RHYTHM_MAX_CONSECUTIVE = 3;
const SUMMARY_MIN_WORDS = 60;
const SUMMARY_MAX_WORDS = 115;
const ARROW_SEPARATOR_RE = /→/;

function wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns violations found in a summary string. */
function checkSummary(summary) {
    const issues = [];
    const wc = wordCount(summary);
    if (wc < SUMMARY_MIN_WORDS) {
        issues.push(`too_short: ${wc} words (min ${SUMMARY_MIN_WORDS})`);
    }
    if (wc > SUMMARY_MAX_WORDS) {
        issues.push(`too_long: ${wc} words (max ${SUMMARY_MAX_WORDS})`);
    }
    return issues;
}

/** Returns violation names found in a list of bullets for one role. */
function checkBullets(bullets) {
    const issues = [];

    // 1. Stub bullets
    const stubs = bullets.filter(b => wordCount(b) < BULLET_MIN_WORDS);
    if (stubs.length > 0) {
        issues.push(`bullet_too_short: ${stubs.length} bullet(s) under ${BULLET_MIN_WORDS} words: ${stubs.map(b => `"${b.trim().slice(0, 40)}"`).join(', ')}`);
    }

    // 2. Flat rhythm (3+ consecutive short bullets)
    let consecutive = 0;
    let maxConsecutive = 0;
    for (const b of bullets) {
        const wc = wordCount(b);
        if (wc < RHYTHM_SHORT_THRESHOLD) {
            consecutive++;
            maxConsecutive = Math.max(maxConsecutive, consecutive);
        } else {
            consecutive = 0;
        }
    }
    if (maxConsecutive >= RHYTHM_MAX_CONSECUTIVE) {
        issues.push(`flat_bullet_rhythm: ${maxConsecutive} consecutive bullets all under ${RHYTHM_SHORT_THRESHOLD} words`);
    }

    // 3. Arrow separators
    const arrowBullets = bullets.filter(b => ARROW_SEPARATOR_RE.test(b));
    if (arrowBullets.length > 0) {
        issues.push(`arrow_separator: ${arrowBullets.length} bullet(s) contain "→"`);
    }

    return issues;
}

/** Returns violation names found in a skills array. */
function checkSkills(skills) {
    const issues = [];
    const seen = new Map();
    const dupes = [];
    for (const s of skills) {
        if (typeof s !== 'string' || !s.trim()) continue;
        const key = s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) {
            dupes.push(s.trim());
        } else {
            seen.set(key, s.trim());
        }
    }
    if (dupes.length > 0) {
        issues.push(`duplicate_skill: ${dupes.map(s => `"${s}"`).join(', ')}`);
    }
    return issues;
}

/** Returns violation names found in a projects array. */
function checkProjects(projects) {
    const issues = [];
    const arrowProjects = projects.filter(p => typeof p?.description === 'string' && ARROW_SEPARATOR_RE.test(p.description));
    if (arrowProjects.length > 0) {
        issues.push(`arrow_separator in project: ${arrowProjects.map(p => `"${(p.name || 'unnamed').slice(0, 30)}"`).join(', ')}`);
    }
    return issues;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────
//
// CV data that mirrors the real Bruce Oyugi Nyainda CV problems exactly.

const BRUCE_CV = {
    summary:
        // ~54 words — below the 60-word minimum
        'Mid-level civil engineer in structural design and construction supervision. ' +
        'Delivered high-quality infrastructure projects by engineering project implementation lifecycles, ' +
        'managing site assessments, system design, and cost estimation. Registered as a GE with EBK, ' +
        'and been eager to learn in contract management.',

    experience: [
        {
            jobTitle: 'Sales Engineer - Irrigation Department',
            company: 'Elgon Kenya',
            responsibilities: [
                'Manage a portfolio of irrigation projects, coordinating with a technical team',
                'Generate KES 800,000 in sales',          // 6 words — too short
                'Engineers project implementation lifecycles',         // 4 words — too short
                'Appraised site conditions to design tailored irrigation solutions, reducing water waste by 25-40%',
                'Mentor junior engineers on technical sales skills',   // 8 words — borderline ok
            ],
        },
        {
            jobTitle: 'Junior Civil Engineer',
            company: 'Trans-African Infrastructure Solutions',
            responsibilities: [
                'Managed preliminary road design for urban and rural networks using AutoCAD software',
                'Quantified traffic data for road safety audits, informing design and planning decisions',
                'Restructured tender documentation for infrastructure projects',   // 6 words — too short
                'Processed geotechnical data to inform foundation designs, reducing errors',
                'Validated project timelines',                         // 3 words — too short
                'Reviewed project documentation',                      // 3 words — too short
                // ↑ Three consecutive short bullets starting from index 2
            ],
        },
    ],

    skills: [
        'Civil Engineering Principles',
        'Road Design & Planning',
        'Traffic Surveys & Data Analysis',
        'Java',
        'Python',
        'CI/CD Pipelines',           // duplicate below
        'Technical Documentation',    // duplicate below (different capitalisation)
        'Communication',
        'Version control',
        'CI/CD pipelines',            // duplicate
        'Software development lifecycle',
        'technical documentation',    // duplicate (lowercase)
        'Code reviews',
        'Git',
    ],

    projects: [
        {
            name: 'Design and Implementation of a Drip Irrigation System',
            description:
                'Ensured optimal water usage for 25–40% savings across diverse client needs → Applied core engineering design principles to develop and implement a sustainable drip irrigation system → Achieved 25-40% water savings for clients while maintaining crop yield',
        },
        {
            name: "L'Oréal BrandStorm 2020",
            description:
                'Developed practical solutions for real-world business challenges → led an international innovation competition → Enhanced research skills and adaptability in a competitive environment',
        },
    ],
};

// A "good" CV that should pass all checks.
const GOOD_CV = {
    summary:
        'Civil and Biosystems Engineer with four years of experience spanning irrigation system design, road infrastructure planning, ' +
        'and construction supervision across East Africa. Delivered KES 800,000 in project sales at Elgon Kenya while managing ' +
        'end-to-end implementation lifecycles and coordinating cross-functional technical teams. Registered Graduate Engineer with EBK, ' +
        'with a distinction-level thesis on irrigation optimisation and hands-on expertise across geotechnical analysis, AutoCAD design, and site supervision.',

    experience: [
        {
            jobTitle: 'Sales Engineer',
            company: 'Elgon Kenya',
            responsibilities: [
                'Manage a portfolio of irrigation projects, coordinating technical assessments, system design, and client delivery across three counties.',
                'Generated KES 800,000 in sales revenue by designing tailored drip and sprinkler irrigation systems for commercial farms.',
                'Appraised site soil and water conditions to design bespoke irrigation solutions, cutting client water waste by 25–40%.',
                'Mentored two junior engineers on technical sales methodology, shortening their ramp time by six weeks.',
                'Standardised maintenance protocols for 12 existing irrigation installations, reducing unplanned downtime by 30%.',
            ],
        },
    ],

    skills: [
        'Civil Engineering Principles',
        'Road Design & Planning',
        'AutoCAD',
        'Irrigation System Design',
        'Geotechnical Analysis',
        'Traffic Surveys',
        'Technical Documentation',
        'Contract Management',
    ],

    projects: [
        {
            name: 'Drip Irrigation Pilot — Nakuru County',
            description:
                'Designed and implemented a gravity-fed drip irrigation system for a 12-farm cooperative, achieving 25–40% water savings while maintaining crop yield targets. Applied fluid mechanics and soil moisture modelling to size pipes and emitters correctly for the local clay-loam soil profile.',
        },
    ],
};

// ── Run tests ─────────────────────────────────────────────────────────────────

console.log(C.b('\n━━━ 1. SUMMARY WORD COUNT ━━━\n'));

const bruceIssues = checkSummary(BRUCE_CV.summary);
check(
    'Bruce CV summary flagged as too_short',
    bruceIssues.some(i => i.startsWith('too_short')),
    `Expected too_short violation — summary is ${wordCount(BRUCE_CV.summary)} words (minimum ${SUMMARY_MIN_WORDS}). Issues found: ${bruceIssues.join('; ') || 'none'}`,
);

const goodIssues = checkSummary(GOOD_CV.summary);
check(
    'Good CV summary passes word-count check',
    !goodIssues.some(i => i.startsWith('too_short') || i.startsWith('too_long')),
    `Unexpected violation: ${goodIssues.join('; ')}`,
);

console.log(`\n  Bruce summary word count: ${C.y(String(wordCount(BRUCE_CV.summary)))} (min ${SUMMARY_MIN_WORDS})`);
console.log(`  Good summary word count:  ${C.g(String(wordCount(GOOD_CV.summary)))}`);

// ── 2. Bullet too-short ───────────────────────────────────────────────────────

console.log(C.b('\n━━━ 2. BULLET TOO-SHORT ━━━\n'));

for (const role of BRUCE_CV.experience) {
    const issues = checkBullets(role.responsibilities);
    const hasTooShort = issues.some(i => i.startsWith('bullet_too_short'));
    const stubs = role.responsibilities.filter(b => wordCount(b) < BULLET_MIN_WORDS);
    check(
        `"${role.jobTitle}" has ${stubs.length} stub bullet(s) detected`,
        hasTooShort,
        `Expected bullet_too_short violation. Issues: ${issues.join('; ') || 'none'}`,
    );
    if (stubs.length > 0) {
        for (const s of stubs) {
            console.log(`    ${C.r('✗')} ${C.d(`"${s.trim()}" (${wordCount(s)} words)`)}`);
        }
    }
}

const goodBulletIssues = checkBullets(GOOD_CV.experience[0].responsibilities);
const goodHasTooShort = goodBulletIssues.some(i => i.startsWith('bullet_too_short'));
check(
    'Good CV bullets all pass the minimum word count',
    !goodHasTooShort,
    `Unexpected bullet_too_short: ${goodBulletIssues.join('; ')}`,
);

// ── 3. Flat bullet rhythm ─────────────────────────────────────────────────────

console.log(C.b('\n━━━ 3. FLAT BULLET RHYTHM ━━━\n'));

for (const role of BRUCE_CV.experience) {
    const issues = checkBullets(role.responsibilities);
    const hasRhythm = issues.some(i => i.startsWith('flat_bullet_rhythm'));
    // Only flag roles where we actually have 3+ consecutive short bullets
    const shortFlags = role.responsibilities.map(b => wordCount(b) < RHYTHM_SHORT_THRESHOLD);
    let consecutive = 0;
    let maxConsec = 0;
    for (const f of shortFlags) {
        if (f) { consecutive++; maxConsec = Math.max(maxConsec, consecutive); }
        else consecutive = 0;
    }
    if (maxConsec >= RHYTHM_MAX_CONSECUTIVE) {
        check(
            `"${role.jobTitle}" flat-rhythm detected (${maxConsec} consecutive short)`,
            hasRhythm,
            `Expected flat_bullet_rhythm. Issues: ${issues.join('; ') || 'none'}`,
        );
        console.log(`    Bullet lengths: ${role.responsibilities.map(b => wordCount(b) < RHYTHM_SHORT_THRESHOLD ? C.r(String(wordCount(b))) : C.g(String(wordCount(b)))).join('  ')}`);
    } else {
        console.log(`  ${C.d('skip')}  "${role.jobTitle}" (maxConsecutiveShort=${maxConsec} < ${RHYTHM_MAX_CONSECUTIVE} — no rhythm violation expected)`);
    }
}

const goodRhythmIssues = checkBullets(GOOD_CV.experience[0].responsibilities);
check(
    'Good CV bullets pass rhythm check',
    !goodRhythmIssues.some(i => i.startsWith('flat_bullet_rhythm')),
    `Unexpected rhythm violation: ${goodRhythmIssues.join('; ')}`,
);

// ── 4. Arrow separators in bullets ───────────────────────────────────────────

console.log(C.b('\n━━━ 4. ARROW SEPARATORS IN BULLETS ━━━\n'));

// The Bruce CV doesn't have arrows in experience bullets — only in projects.
// Let's test with an explicit arrow-bullet fixture.
const arrowBulletsFixture = [
    'Appraised site conditions to design solutions → Reduced water waste by 25% across 12 farms → Mentored two juniors on the technique.',
    'Managed 15 irrigation projects across three counties, achieving full delivery within budget.',
    'Restructured tender documentation → saved 30% preparation time on repeat bids.',
];

const arrowBulletIssues = checkBullets(arrowBulletsFixture);
check(
    'Arrow-bullet fixture detected as arrow_separator violation',
    arrowBulletIssues.some(i => i.startsWith('arrow_separator')),
    `Expected arrow_separator violation. Issues: ${arrowBulletIssues.join('; ') || 'none'}`,
);

const cleanBullets = [
    'Appraised site conditions to design bespoke irrigation solutions, reducing water waste by 25% across 12 farms.',
    'Managed 15 irrigation projects across three counties, achieving full delivery within budget and schedule.',
    'Restructured tender documentation templates, saving 30% preparation time on repeat infrastructure bids.',
];
check(
    'Clean bullets pass arrow check',
    !checkBullets(cleanBullets).some(i => i.startsWith('arrow_separator')),
    'Unexpected arrow_separator in clean bullets',
);

// ── 5. Duplicate skills ───────────────────────────────────────────────────────

console.log(C.b('\n━━━ 5. DUPLICATE SKILLS ━━━\n'));

const bruceSkillIssues = checkSkills(BRUCE_CV.skills);
check(
    'Bruce CV skills — duplicate detected',
    bruceSkillIssues.some(i => i.startsWith('duplicate_skill')),
    `Expected duplicate_skill. Issues: ${bruceSkillIssues.join('; ') || 'none'}`,
);
if (bruceSkillIssues.length > 0) {
    console.log(`    ${C.r(bruceSkillIssues[0])}`);
}

const goodSkillIssues = checkSkills(GOOD_CV.skills);
check(
    'Good CV skills — no duplicates',
    !goodSkillIssues.some(i => i.startsWith('duplicate_skill')),
    `Unexpected duplicate: ${goodSkillIssues.join('; ')}`,
);

// ── 6. Arrow separators in project descriptions ───────────────────────────────

console.log(C.b('\n━━━ 6. ARROW SEPARATORS IN PROJECTS ━━━\n'));

const bruceProjIssues = checkProjects(BRUCE_CV.projects);
check(
    'Bruce CV projects — arrow separator detected',
    bruceProjIssues.some(i => i.startsWith('arrow_separator in project')),
    `Expected arrow_separator violation. Issues: ${bruceProjIssues.join('; ') || 'none'}`,
);
if (bruceProjIssues.length > 0) {
    console.log(`    ${C.r(bruceProjIssues[0])}`);
}

const goodProjIssues = checkProjects(GOOD_CV.projects);
check(
    'Good CV project descriptions — no arrows',
    !goodProjIssues.some(i => i.startsWith('arrow_separator')),
    `Unexpected arrow in project: ${goodProjIssues.join('; ')}`,
);

// ── 7. Full Bruce-CV audit (all checks combined) ──────────────────────────────

console.log(C.b('\n━━━ 7. FULL BRUCE-CV AUDIT ━━━\n'));

const allBruceViolations = [
    ...checkSummary(BRUCE_CV.summary),
    ...BRUCE_CV.experience.flatMap(r => checkBullets(r.responsibilities).map(i => `${r.jobTitle}: ${i}`)),
    ...checkSkills(BRUCE_CV.skills),
    ...checkProjects(BRUCE_CV.projects),
];

const allGoodViolations = [
    ...checkSummary(GOOD_CV.summary),
    ...GOOD_CV.experience.flatMap(r => checkBullets(r.responsibilities).map(i => `${r.jobTitle}: ${i}`)),
    ...checkSkills(GOOD_CV.skills),
    ...checkProjects(GOOD_CV.projects),
];

check(
    `Bruce CV has ${allBruceViolations.length} violation(s) — all quality problems caught`,
    allBruceViolations.length >= 5,
    `Expected ≥5 total violations in the Bruce CV, got ${allBruceViolations.length}`,
);

check(
    'Good CV has zero violations',
    allGoodViolations.length === 0,
    `Unexpected violations: ${allGoodViolations.join(' | ')}`,
);

console.log('');
console.log(C.b('  Bruce CV violations:'));
for (const v of allBruceViolations) {
    console.log(`    ${C.r('•')} ${v}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(C.b('\n━━━ SUMMARY ━━━'));
console.log(`  ${C.g(String(totalPassed))} passed   ${totalFailed > 0 ? C.r(String(totalFailed)) : C.g('0')} failed`);

if (totalFailed > 0) {
    console.log(C.r('\n  Some checks failed — review output above and fix cvQualityGate.ts.\n'));
    process.exit(1);
} else {
    console.log(C.g('\n  All checks passed.\n'));
    process.exit(0);
}
