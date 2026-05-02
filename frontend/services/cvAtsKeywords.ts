/**
 * cvAtsKeywords.ts
 *
 * Deterministic (zero-LLM) ATS keyword extraction and CV coverage scoring.
 *
 * Algorithm:
 *  1. ACRONYMS  — ALL-CAPS tokens ≥ 2 chars (AWS, SQL, REST, CI/CD, UI/UX).
 *  2. PascalCase tech compounds — JavaScript, TypeScript, MongoDB, TensorFlow.
 *  3. Curated lowercase tech terms — python, react, docker, etc.
 *  4. Phrase extraction — "experience with X", "proficiency in X", "knowledge of X".
 *  5. Frequency weight → keep the most repeated terms, cap at 35.
 *
 * Scoring: for each keyword, case-insensitive whole-word regex search against
 * the flattened CV text (summary + bullets + skills + projects).
 */

import type { CVData } from '../types';

// ── Stopword sets ─────────────────────────────────────────────────────────────

const ACRONYM_STOPWORDS = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'HAS', 'ARE', 'NOT', 'BUT', 'ALL', 'WAS',
    'CAN', 'ITS', 'OUR', 'YOU', 'MAY', 'WILL', 'WILL', 'ALSO', 'SUCH', 'ANY',
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
    'include', 'including', 'including', 'manage', 'support', 'provide',
    'ensure', 'develop', 'create', 'build', 'lead', 'drive', 'help', 'use',
    'within', 'across', 'between', 'during', 'related', 'using', 'making',
]);

// Curated list of common lowercase tech/domain terms to extract even when
// they appear uncapitalised in the JD.
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
    'salesforce', 'hubspot', 'zendesk', 'sap', 'oracle',
    'excel', 'powerpoint', 'word', 'gsuite', 'slack',
    'machine learning', 'deep learning', 'natural language processing',
    'computer vision', 'data science', 'data engineering', 'data analysis',
    'product management', 'project management', 'program management',
    'business analysis', 'systems design', 'system design',
    'technical writing', 'stakeholder management', 'cross-functional',
]);

// ── Extraction helpers ────────────────────────────────────────────────────────

/**
 * Extracts ATS-relevant keywords from a job description string.
 * Returns a deduped, frequency-weighted list capped at 35 terms.
 * Pure deterministic — no LLM calls.
 */
export function extractJdKeywords(jd: string): string[] {
    if (!jd || !jd.trim()) return [];

    const freq: Map<string, number> = new Map();
    const add = (term: string, weight = 1) => {
        const t = term.trim();
        if (!t || t.length < 2) return;
        freq.set(t, (freq.get(t) ?? 0) + weight);
    };

    // 1. ACRONYMS — standalone ALL-CAPS tokens (2–6 chars, optional /- joiners)
    for (const m of jd.matchAll(/\b([A-Z]{2,6})(?:[/\-][A-Z]{2,6})?\b/g)) {
        const token = m[0];
        if (!ACRONYM_STOPWORDS.has(token) && !/^\d+$/.test(token)) {
            add(token, 2); // acronyms get double weight
        }
    }

    // 2. PascalCase compound tech terms: JavaScript, TypeScript, GraphQL, etc.
    for (const m of jd.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+(?:\.?[jJ][sS])?)\b/g)) {
        add(m[1], 2);
    }

    // 3. Curated lowercase terms — check all multi-word ones with substring first
    const jdLower = jd.toLowerCase();
    for (const term of CURATED_TECH_TERMS) {
        if (term.includes(' ')) {
            if (jdLower.includes(term)) add(term, 3);
        } else {
            const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (rx.test(jd)) add(term, 2);
        }
    }

    // 4. Phrase extraction — "experience with X", "proficiency in X",
    //    "knowledge of X", "X+ years" skill anchors, "background in X"
    const phraseRx = /(?:experience with|proficiency in|knowledge of|background in|expertise in|skilled in|familiar with|understanding of)\s+([A-Za-z][A-Za-z0-9\s\-/]{2,40}?)(?=[,;.\n]|$)/gi;
    for (const m of jd.matchAll(phraseRx)) {
        const raw = m[1].trim().toLowerCase();
        const words = raw.split(/\s+/).filter(w => !PHRASE_STOPWORDS.has(w));
        if (words.length > 0 && words.length <= 4) add(words.join(' '), 3);
    }

    // 5. Noun-phrase extraction — adjacent non-stop capitalised words (e.g. "Cloud Architecture")
    for (const m of jd.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
        const phrase = m[1];
        const words = phrase.split(/\s+/).map(w => w.toLowerCase());
        if (words.every(w => !PHRASE_STOPWORDS.has(w))) {
            add(phrase, 1);
        }
    }

    // Sort by frequency desc, deduplicate substrings, cap at 35
    const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t);

    // Remove a term if it's a substring of a higher-ranked term already included
    const final: string[] = [];
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

// ── Bullet candidate finder ───────────────────────────────────────────────────

export interface BulletCandidate {
    /** The raw bullet text. */
    text: string;
    /**
     * `where` path in the format that `applyFixToCv` / `parseAuditPath` expect:
     * `experience[N] jobTitle @ company#M`
     */
    where: string;
    /** Human-readable location label for the UI. */
    label: string;
}

/**
 * Finds the single most relevant bullet in the CV to insert a given keyword.
 *
 * Scoring (pure, deterministic):
 *  +3 per token of the keyword found as a whole word in the bullet
 *  +1 if the bullet already contains a number (it's quantified — a strong bullet)
 *  -1 if the bullet is very short (<30 chars) — not enough room to expand
 *  Tie-break: prefer bullets that are already longer (more context to weave into)
 *
 * Returns null when no experience bullets exist.
 */
export function findBestBulletForKeyword(
    cv: CVData,
    keyword: string,
): BulletCandidate | null {
    const kwTokens = keyword.toLowerCase().split(/\s+/).filter(Boolean);

    let best: BulletCandidate | null = null;
    let bestScore = -Infinity;

    const roles = cv.experience ?? [];
    for (let ri = 0; ri < roles.length; ri++) {
        const role = roles[ri];
        const bullets = role.responsibilities ?? [];
        for (let bi = 0; bi < bullets.length; bi++) {
            const text = String(bullets[bi] ?? '').trim();
            if (!text) continue;

            const tl = text.toLowerCase();
            let score = 0;

            // Token overlap with keyword
            for (const tok of kwTokens) {
                const rx = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                if (rx.test(tl)) score += 3;
            }

            // Prefer quantified bullets (already strong)
            if (/\d/.test(text)) score += 1;

            // Penalise very short bullets
            if (text.length < 30) score -= 1;

            // Prefer longer bullets as tie-break
            score += text.length * 0.001;

            if (score > bestScore) {
                bestScore = score;
                const jobTitle = role.jobTitle ?? '';
                const company = role.company ?? '';
                best = {
                    text,
                    where: `experience[${ri}] ${jobTitle} @ ${company}#${bi}`,
                    label: jobTitle ? `${jobTitle}${company ? ` @ ${company}` : ''}` : `Role ${ri + 1}`,
                };
            }
        }
    }

    return best;
}

// ── CV text flattening ────────────────────────────────────────────────────────

/** Concatenates all searchable CV text into one string for keyword scanning. */
export function flattenCvText(cv: CVData): string {
    const parts: string[] = [];
    if (cv.summary) parts.push(cv.summary);
    for (const exp of cv.experience || []) {
        if (exp.jobTitle) parts.push(exp.jobTitle);
        if (exp.company) parts.push(exp.company);
        for (const b of exp.responsibilities || []) parts.push(b);
    }
    for (const s of cv.skills || []) parts.push(s);
    for (const proj of cv.projects || []) {
        if (proj.name) parts.push(proj.name);
        if (proj.description) parts.push(proj.description);
    }
    return parts.join(' ');
}

// ── Coverage scoring ──────────────────────────────────────────────────────────

export interface AtsKeywordReport {
    keywords: string[];
    matched: string[];
    missing: string[];
    score: number;   // 0–100
    hasJd: boolean;
}

const EMPTY_REPORT: AtsKeywordReport = {
    keywords: [], matched: [], missing: [], score: 100, hasJd: false,
};

/**
 * Scores how many extracted JD keywords appear in the CV text.
 * Returns an AtsKeywordReport. O(keywords × cvText).
 */
export function scoreAtsCoverage(cv: CVData, jd: string): AtsKeywordReport {
    if (!jd || !jd.trim()) return EMPTY_REPORT;

    const keywords = extractJdKeywords(jd);
    if (keywords.length === 0) return { ...EMPTY_REPORT, hasJd: true };

    const cvText = flattenCvText(cv);
    const matched: string[] = [];
    const missing: string[] = [];

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
