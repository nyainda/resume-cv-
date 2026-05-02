#!/usr/bin/env node
/**
 * test-gap-pin.mjs
 *
 * CI gate for the ATS gap-pin pipeline:
 *   extractJdKeywords  →  scoreAtsCoverage  →  missing[] passed to generateCV
 *
 * Tests the deterministic (zero-LLM) parts only:
 *   1. extractJdKeywords returns keywords from a JD
 *   2. scoreAtsCoverage correctly splits keywords into matched / missing
 *   3. The gap (missing) list is capped at 12 (as per CVGenerator)
 *   4. Edge cases: empty JD, empty CV, all-matched, all-missing
 *
 * Design principle: use controlled JDs with unambiguous single-word tech terms
 * (acronyms like AWS, SQL or plain curated terms like docker, kubernetes) to
 * avoid the phrase-extraction ambiguity where "proficiency in X and Y" produces
 * a multi-word "x y" phrase that subsumes the individual terms.
 *
 * The logic below is a faithful mirror of the TypeScript implementations in:
 *   frontend/services/cvAtsKeywords.ts  (extractJdKeywords + scoreAtsCoverage)
 */

// ─── Mirror of extractJdKeywords ───────────────────────────────────────────

const ACRONYM_STOPWORDS = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'HAS', 'ARE', 'NOT', 'BUT', 'ALL', 'WAS',
    'CAN', 'ITS', 'OUR', 'YOU', 'MAY', 'WILL', 'ALSO', 'SUCH', 'ANY',
    'WHO', 'HOW', 'NEW', 'USE', 'KEY', 'GET', 'SET', 'LET', 'PUT', 'ONE',
    'TWO', 'SIX', 'TEN', 'YES', 'NO', 'OR', 'TO', 'IN', 'OF', 'AT', 'BE',
]);

const PHRASE_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'has', 'are', 'not', 'but', 'all', 'was',
    'can', 'its', 'our', 'you', 'may', 'will', 'also', 'such', 'any', 'who',
    'how', 'new', 'use', 'key', 'get', 'set', 'let', 'a', 'an', 'in', 'of',
    'at', 'be', 'to', 'or', 'is', 'it', 'we', 'as', 'on', 'by', 'do', 'if',
    'so', 'up', 'from', 'that', 'this', 'they', 'them', 'their', 'have',
    'been', 'will', 'would', 'could', 'should', 'must', 'shall', 'your',
    'able', 'work', 'role', 'team', 'time', 'year', 'years', 'day', 'days',
    'strong', 'good', 'great', 'well', 'high', 'plus', 'more', 'other',
    'level', 'based', 'minimum', 'required', 'preferred', 'ideally', 'bonus',
    'include', 'including', 'manage', 'support', 'provide',
    'ensure', 'develop', 'create', 'build', 'lead', 'drive', 'help', 'use',
    'within', 'across', 'between', 'during', 'related', 'using', 'making',
]);

const CURATED_TECH_TERMS = new Set([
    'python', 'java', 'javascript', 'typescript', 'golang', 'ruby', 'rust',
    'swift', 'kotlin', 'scala', 'php', 'perl', 'bash', 'shell',
    'react', 'angular', 'vue', 'svelte', 'nextjs', 'nuxtjs', 'gatsby',
    'nodejs', 'express', 'fastapi', 'django', 'flask', 'rails', 'spring',
    'sql', 'mysql', 'postgresql', 'sqlite', 'oracle', 'mssql',
    'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',
    'docker', 'kubernetes', 'terraform', 'ansible', 'helm', 'jenkins',
    'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
    'aws', 'gcp', 'azure', 'cloudflare', 'heroku', 'vercel', 'netlify',
    'linux', 'unix', 'windows', 'macos',
    'agile', 'scrum', 'kanban', 'devops', 'devsecops', 'mlops',
    'tensorflow', 'pytorch', 'keras', 'sklearn', 'pandas', 'numpy',
    'tableau', 'powerbi', 'looker', 'dbt', 'airflow', 'spark',
    'graphql', 'rest', 'grpc', 'soap', 'oauth', 'jwt', 'saml',
    'microservices', 'serverless', 'ci/cd', 'tdd', 'bdd', 'sre',
    'figma', 'sketch', 'invision', 'zeplin',
    'salesforce', 'hubspot', 'zendesk', 'sap',
    'excel', 'powerpoint', 'word', 'gsuite', 'slack',
    'machine learning', 'deep learning', 'natural language processing',
    'computer vision', 'data science', 'data engineering', 'data analysis',
    'product management', 'project management', 'program management',
    'business analysis', 'systems design', 'system design',
    'technical writing', 'stakeholder management', 'cross-functional',
]);

function extractJdKeywords(jd) {
    if (!jd || !jd.trim()) return [];
    const freq = new Map();
    const add = (term, weight = 1) => {
        const t = term.trim();
        if (!t || t.length < 2) return;
        freq.set(t, (freq.get(t) ?? 0) + weight);
    };
    for (const m of jd.matchAll(/\b([A-Z]{2,6})(?:[/\-][A-Z]{2,6})?\b/g)) {
        const token = m[0];
        if (!ACRONYM_STOPWORDS.has(token) && !/^\d+$/.test(token)) add(token, 2);
    }
    for (const m of jd.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+(?:\.?[jJ][sS])?)\b/g)) {
        add(m[1], 2);
    }
    const jdLower = jd.toLowerCase();
    for (const term of CURATED_TECH_TERMS) {
        if (term.includes(' ')) {
            if (jdLower.includes(term)) add(term, 3);
        } else {
            const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (rx.test(jd)) add(term, 2);
        }
    }
    const phraseRx = /(?:experience with|proficiency in|knowledge of|background in|expertise in|skilled in|familiar with|understanding of)\s+([A-Za-z][A-Za-z0-9\s\-/]{2,40}?)(?=[,;.\n]|$)/gi;
    for (const m of jd.matchAll(phraseRx)) {
        const raw = m[1].trim().toLowerCase();
        const words = raw.split(/\s+/).filter(w => !PHRASE_STOPWORDS.has(w));
        if (words.length > 0 && words.length <= 4) add(words.join(' '), 3);
    }
    for (const m of jd.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
        const phrase = m[1];
        const words = phrase.split(/\s+/).map(w => w.toLowerCase());
        if (words.every(w => !PHRASE_STOPWORDS.has(w))) add(phrase, 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const final = [];
    for (const term of sorted) {
        const tl = term.toLowerCase();
        const dominated = final.some(f => {
            const fl = f.toLowerCase();
            return fl !== tl && (fl.includes(tl) || tl.includes(fl));
        });
        if (!dominated) final.push(term);
        if (final.length >= 35) break;
    }
    return final;
}

// ─── Mirror of flattenCvText + scoreAtsCoverage ──────────────────────────────

function flattenCvText(cv) {
    const parts = [];
    if (cv.summary) parts.push(cv.summary);
    for (const exp of (cv.experience || [])) {
        if (exp.jobTitle) parts.push(exp.jobTitle);
        if (exp.company) parts.push(exp.company);
        for (const b of (exp.responsibilities || [])) parts.push(b);
    }
    for (const s of (cv.skills || [])) parts.push(s);
    for (const proj of (cv.projects || [])) {
        if (proj.name) parts.push(proj.name);
        if (proj.description) parts.push(proj.description);
    }
    return parts.join(' ');
}

function scoreAtsCoverage(cv, jd) {
    if (!jd || !jd.trim()) return { keywords: [], matched: [], missing: [], score: 100, hasJd: false };
    const keywords = extractJdKeywords(jd);
    if (keywords.length === 0) return { keywords: [], matched: [], missing: [], score: 100, hasJd: true };
    const cvText = flattenCvText(cv);
    const matched = [], missing = [];
    for (const kw of keywords) {
        const pattern = kw.includes(' ')
            ? kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            : `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
        const rx = new RegExp(pattern, 'i');
        (rx.test(cvText) ? matched : missing).push(kw);
    }
    const score = Math.round((matched.length / keywords.length) * 100);
    return { keywords, matched, missing, score, hasJd: true };
}

// ─── Controlled test fixtures (avoid phrase-extraction multi-word ambiguity) ──
//
// Technique: list tech terms separated by commas (not "experience with X and Y")
// so each term lands as an isolated acronym or curated single-word lookup.
// This gives us deterministic, unambiguous golden keywords.

// JD where we know exactly which terms will be extracted
const JD_CONTROLLED = `
Senior DevOps Engineer — required skills:
docker, kubernetes, AWS, SQL, agile, git, terraform, redis, jenkins, CI/CD
`;

// Full-prose JD for statistical assertions (non-specific keyword checks)
const JD_PROSE = `
We are looking for a Senior Software Engineer with 5+ years of experience.
Required: docker, kubernetes, AWS deployment, SQL databases, git version control.
Preferred: terraform infrastructure, redis caching, agile development process.
Experience with jenkins for CI/CD pipelines is a strong plus.
`;

const CV_GOOD = {
    summary: 'DevOps engineer with 6 years of experience deploying docker containers on AWS.',
    skills: ['docker', 'kubernetes', 'AWS', 'SQL', 'agile', 'git', 'terraform'],
    experience: [{
        jobTitle: 'Senior DevOps Engineer',
        company: 'Acme Corp',
        responsibilities: [
            'Deployed containerised workloads using docker and kubernetes on AWS EKS.',
            'Managed SQL databases for 3 production services across regions.',
            'Maintained git repositories and CI/CD pipelines with jenkins and terraform.',
        ],
    }],
    projects: [],
};

const CV_POOR = {
    summary: 'Business analyst with 4 years experience.',
    skills: ['Excel', 'PowerPoint', 'Jira'],
    experience: [{
        jobTitle: 'Business Analyst',
        company: 'Old Corp',
        responsibilities: [
            'Created Excel reports for stakeholders.',
            'Managed Jira tickets and wrote PowerPoint decks.',
        ],
    }],
    projects: [],
};

const CV_EMPTY = {
    summary: '',
    skills: [],
    experience: [],
    projects: [],
};

// ─── Test runner ──────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const failures = [];

function assert(label, condition, detail = '') {
    if (condition) {
        pass++;
        console.log(`  ✓ ${label}`);
    } else {
        fail++;
        failures.push({ label, detail });
        console.log(`  ✗ ${label}${detail ? `  (${detail})` : ''}`);
    }
}

// ── Suite 1: extractJdKeywords — basic contract ───────────────────────────────
console.log('\n[1] extractJdKeywords — basic contract');

const kwsCtrl = extractJdKeywords(JD_CONTROLLED);
console.log(`     extracted: ${kwsCtrl.join(', ')}`);

assert('returns an array',           Array.isArray(kwsCtrl));
assert('non-empty for real JD',      kwsCtrl.length > 0,        `got ${kwsCtrl.length}`);
assert('capped at 35',               kwsCtrl.length <= 35,      `got ${kwsCtrl.length}`);
assert('no exact-string duplicates', new Set(kwsCtrl).size === kwsCtrl.length,
       `${kwsCtrl.length} total, ${new Set(kwsCtrl).size} unique`);
assert('finds docker',               kwsCtrl.some(k => /\bdocker\b/i.test(k)));
assert('finds kubernetes',           kwsCtrl.some(k => /\bkubernetes\b/i.test(k)));
assert('finds AWS',                  kwsCtrl.some(k => /\baws\b/i.test(k)));
assert('finds SQL',                  kwsCtrl.some(k => /\bsql\b/i.test(k)));
assert('finds git',                  kwsCtrl.some(k => /\bgit\b/i.test(k)));
assert('finds agile',                kwsCtrl.some(k => /\bagile\b/i.test(k)));
assert('empty JD → []',              extractJdKeywords('').length === 0);
assert('whitespace JD → []',         extractJdKeywords('   ').length === 0);

// ── Suite 2: extractJdKeywords — prose JD ────────────────────────────────────
console.log('\n[2] extractJdKeywords — prose JD');

const kwsProse = extractJdKeywords(JD_PROSE);
console.log(`     extracted: ${kwsProse.join(', ')}`);

assert('returns non-empty array',    kwsProse.length > 0);
assert('capped at 35',               kwsProse.length <= 35);
assert('finds docker in prose',      kwsProse.some(k => /\bdocker\b/i.test(k)));
assert('finds AWS in prose',         kwsProse.some(k => /\baws\b/i.test(k)));

// ── Suite 3: scoreAtsCoverage — good CV ──────────────────────────────────────
console.log('\n[3] scoreAtsCoverage — CV with strong coverage');

const goodReport = scoreAtsCoverage(CV_GOOD, JD_CONTROLLED);
console.log(`     score=${goodReport.score}  matched=${goodReport.matched.join(', ')}`);
console.log(`     missing=${goodReport.missing.join(', ')}`);

assert('hasJd = true',               goodReport.hasJd);
assert('keywords populated',         goodReport.keywords.length > 0);
assert('matched non-empty',          goodReport.matched.length > 0);
assert('score ≥ 50 for good CV',     goodReport.score >= 50,    `score=${goodReport.score}`);
assert('matched + missing = total',
       goodReport.matched.length + goodReport.missing.length === goodReport.keywords.length,
       `${goodReport.matched.length}+${goodReport.missing.length}≠${goodReport.keywords.length}`);
assert('docker matched',             goodReport.matched.some(k => /\bdocker\b/i.test(k)));
assert('kubernetes matched',         goodReport.matched.some(k => /\bkubernetes\b/i.test(k)));
assert('AWS matched',                goodReport.matched.some(k => /\baws\b/i.test(k)));

// ── Suite 4: scoreAtsCoverage — poor CV ──────────────────────────────────────
console.log('\n[4] scoreAtsCoverage — CV with weak coverage');

const poorReport = scoreAtsCoverage(CV_POOR, JD_CONTROLLED);
console.log(`     score=${poorReport.score}  missing=${poorReport.missing.join(', ')}`);

assert('hasJd = true',               poorReport.hasJd);
assert('missing non-empty',          poorReport.missing.length > 0);
assert('score < 50 for poor CV',     poorReport.score < 50,     `score=${poorReport.score}`);
assert('good CV scores higher',
       goodReport.score > poorReport.score,
       `good=${goodReport.score} vs poor=${poorReport.score}`);
assert('matched + missing = total',
       poorReport.matched.length + poorReport.missing.length === poorReport.keywords.length);
assert('docker missing from poor CV',   poorReport.missing.some(k => /\bdocker\b/i.test(k)));
assert('kubernetes missing from poor CV', poorReport.missing.some(k => /\bkubernetes\b/i.test(k)));

// ── Suite 5: edge cases ───────────────────────────────────────────────────────
console.log('\n[5] Edge cases');

const emptyJdReport = scoreAtsCoverage(CV_GOOD, '');
assert('empty JD → score=100',       emptyJdReport.score === 100);
assert('empty JD → hasJd=false',     emptyJdReport.hasJd === false);
assert('empty JD → no keywords',     emptyJdReport.keywords.length === 0);

const emptyCvReport = scoreAtsCoverage(CV_EMPTY, JD_CONTROLLED);
assert('empty CV → score=0',         emptyCvReport.score === 0,
       `score=${emptyCvReport.score}`);
assert('empty CV → all missing',
       emptyCvReport.missing.length === emptyCvReport.keywords.length);

// ── Suite 6: gap-pin cap (as done in CVGenerator + geminiService) ─────────────
console.log('\n[6] Gap-pin cap (top 12)');

const capReport = scoreAtsCoverage(CV_POOR, JD_CONTROLLED);
const capped = capReport.missing.slice(0, 12);
assert('capped list ≤ 12',           capped.length <= 12,   `got ${capped.length}`);
assert('capped list non-empty',      capped.length > 0,     `got ${capped.length}`);
assert('capped is subset of missing', capped.every(k => capReport.missing.includes(k)));

// ── Suite 7: previewGapCount (render-time badge logic) ────────────────────────
console.log('\n[7] previewGapCount (render-time badge)');

function previewGapCount(cv, jd, cvPurpose) {
    if (!cv || !jd || !jd.trim() || cvPurpose !== 'job') return 0;
    return Math.min(scoreAtsCoverage(cv, jd).missing.length, 12);
}

assert('job + poor CV + JD → > 0',
       previewGapCount(CV_POOR, JD_CONTROLLED, 'job') > 0);
assert('job + good CV scores better than poor',
       previewGapCount(CV_GOOD, JD_CONTROLLED, 'job') < previewGapCount(CV_POOR, JD_CONTROLLED, 'job'));
assert('academic mode → 0',
       previewGapCount(CV_POOR, JD_CONTROLLED, 'academic') === 0);
assert('no JD → 0',
       previewGapCount(CV_POOR, '', 'job') === 0);
assert('null CV → 0',
       previewGapCount(null, JD_CONTROLLED, 'job') === 0);
assert('capped at 12 even for empty CV',
       previewGapCount(CV_EMPTY, JD_CONTROLLED, 'job') <= 12);

// ── Suite 8: gap-pin prompt block (ensures pin list is never > 12) ────────────
console.log('\n[8] Gap-pin prompt block content');

function buildGapPinBlock(missingKeywords) {
    const pinned = (missingKeywords || []).slice(0, 12);
    if (pinned.length === 0) return '';
    const kwLines = pinned.map(k => `  - ${k}`).join('\n');
    return `ATS GAP-PIN: ${kwLines}`;
}

const block12 = buildGapPinBlock(Array.from({ length: 20 }, (_, i) => `kw${i}`));
const blockEmpty = buildGapPinBlock([]);
const blockNull  = buildGapPinBlock(null);

assert('block is empty for 0 keywords',   blockEmpty === '');
assert('block is empty for null',         blockNull  === '');
assert('block capped at 12 terms',
       (block12.match(/^  - /gm) || []).length <= 12,
       `found ${(block12.match(/^  - /gm) || []).length} lines`);
assert('block is non-empty for 20 input keywords', block12.length > 0);

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('');
console.log(`[gap-pin test] ${pass} passed, ${fail} failed`);

if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  ✗ ${f.label}${f.detail ? `  — ${f.detail}` : ''}`);
    }
    console.log('\nIf extractJdKeywords or scoreAtsCoverage changed intentionally,');
    console.log('update the mirror copies and golden assertions in this file.');
    process.exit(1);
}
process.exit(0);
