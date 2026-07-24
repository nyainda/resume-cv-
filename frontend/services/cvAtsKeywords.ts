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
    // Document / generic abbreviations — these are NEVER meaningful ATS gap
    // keywords because they refer to the CV itself or are too ambiguous to
    // inject verbatim into bullets (e.g. "CV" = curriculum vitae, "GE" = a
    // common two-letter abbreviation that appears in many JDs with different
    // meanings, "TBC", "TBD", "N/A", "NA", etc.).
    'CV', 'GE', 'TBC', 'TBD', 'NA', 'TBA', 'EG', 'IE', 'VS', 'RE',
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
    'include', 'including', 'manage', 'support', 'provide', 'ensure',
    'develop', 'create', 'build', 'lead', 'drive', 'help', 'use',
    'within', 'across', 'between', 'during', 'related', 'using', 'making',
    // Job-ad filler words — appear in every JD but aren't ATS keywords
    'opportunity', 'position', 'candidate', 'applicant', 'apply', 'application',
    'responsibilities', 'requirements', 'qualifications', 'about', 'join',
    'experience', 'background', 'knowledge', 'ability', 'skills', 'skill',
    'proven', 'demonstrated', 'excellent', 'outstanding', 'exceptional',
    'passionate', 'motivated', 'dynamic', 'innovative', 'collaborative',
    'seeking', 'looking', 'ideal', 'perfect', 'successful', 'fast',
    'growing', 'exciting', 'competitive', 'attractive', 'generous',
    'please', 'send', 'email', 'contact', 'submit', 'interested',
]);

// Generic phrases that look like keywords but are too vague to be real ATS terms.
// Matched case-insensitively. If a noun-phrase matches any of these it is discarded.
const GENERIC_PHRASE_BLOCKLIST = new Set([
    'track record', 'strong background', 'minimum experience', 'proven ability',
    'strong skills', 'excellent communication', 'good communication',
    'attention detail', 'problem solving', 'team player', 'self starter',
    'fast paced', 'new opportunities', 'wide range', 'broad range',
    'key skills', 'core skills', 'essential skills', 'relevant experience',
    'strong experience', 'deep experience', 'solid experience',
    'demonstrated ability', 'proven track', 'strong understanding',
    'good knowledge', 'solid knowledge', 'working knowledge',
    'basic knowledge', 'understanding of', 'familiarity with',
    'various tools', 'variety of', 'wide variety', 'wide range',
    'years of experience', 'minimum of', 'at least', 'or more',
    'plus years', 'years plus', 'equal opportunity', 'all qualified',
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
    //    Requires ≥2 occurrences OR presence in CURATED_TECH_TERMS to prevent generic JD phrases
    //    from polluting the keyword set (e.g. "Strong Background", "New Opportunities").
    const nounPhraseFreq: Map<string, number> = new Map();
    for (const m of jd.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
        const phrase = m[1];
        const phraseLower = phrase.toLowerCase();
        const words = phraseLower.split(/\s+/);
        // Reject if any constituent word is a stopword
        if (!words.every(w => !PHRASE_STOPWORDS.has(w))) continue;
        // Reject if the phrase matches any generic-phrase blocklist entry
        if (GENERIC_PHRASE_BLOCKLIST.has(phraseLower)) continue;
        // Reject single-word "phrases" that are just generic nouns
        if (words.length === 1 && PHRASE_STOPWORDS.has(phraseLower)) continue;
        nounPhraseFreq.set(phrase, (nounPhraseFreq.get(phrase) ?? 0) + 1);
    }
    for (const [phrase, count] of nounPhraseFreq) {
        // Only include a noun phrase if it appears ≥2 times in the JD (prevents one-off noise)
        // Exception: multi-word phrases with 3+ words are specific enough to include once
        const words = phrase.split(/\s+/);
        if (count >= 2 || words.length >= 3) {
            add(phrase, count);
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

// ── Semantic synonym map ──────────────────────────────────────────────────────
// Maps canonical tech terms → alternatives that mean the same thing.
// When a JD keyword is NOT found literally in the CV, we check whether any
// synonym IS present — these count as "semantic matches" (40% of the total score).
// Keeps matching accurate without requiring exact keyword alignment.

const SEMANTIC_SYNONYMS: Record<string, string[]> = {
    kubernetes:                ['container orchestration', 'k8s', 'container cluster', 'helm', 'kubectl'],
    docker:                    ['containerisation', 'containerization', 'container', 'dockerfile'],
    aws:                       ['amazon web services', 'ec2', 's3', 'lambda', 'cloudfront', 'rds', 'cloud infrastructure'],
    gcp:                       ['google cloud', 'google cloud platform', 'bigquery', 'cloud run', 'gke'],
    azure:                     ['microsoft azure', 'azure devops', 'aks', 'azure functions'],
    terraform:                 ['infrastructure as code', 'iac', 'pulumi', 'cloudformation'],
    'ci/cd':                   ['continuous integration', 'continuous deployment', 'continuous delivery', 'pipeline', 'jenkins', 'github actions', 'gitlab ci'],
    devops:                    ['site reliability', 'platform engineering', 'infrastructure', 'devsecops'],
    'machine learning':        ['ml', 'deep learning', 'neural network', 'model training', 'ai/ml', 'artificial intelligence'],
    'natural language processing': ['nlp', 'text classification', 'sentiment analysis', 'language model', 'llm'],
    'computer vision':         ['image recognition', 'object detection', 'image classification', 'cv'],
    python:                    ['py', 'python3', 'python 3', 'numpy', 'pandas', 'scikit'],
    typescript:                ['ts', 'tsx', 'typed javascript'],
    javascript:                ['js', 'es6', 'ecmascript', 'node', 'nodejs'],
    react:                     ['reactjs', 'react.js', 'next.js', 'nextjs', 'jsx'],
    sql:                       ['postgresql', 'mysql', 'sqlite', 'relational database', 'database queries', 'mssql'],
    mongodb:                   ['nosql', 'document database', 'mongoose'],
    graphql:                   ['api', 'rest api', 'gql'],
    microservices:             ['distributed systems', 'service-oriented', 'soa', 'event-driven'],
    agile:                     ['scrum', 'kanban', 'sprint', 'iterative', 'lean'],
    'product management':      ['product owner', 'product roadmap', 'product strategy', 'go-to-market'],
    'project management':      ['pmp', 'delivery management', 'programme management', 'project lead'],
    'data science':            ['data analysis', 'analytics', 'statistical analysis', 'data mining'],
    'data engineering':        ['etl', 'data pipeline', 'data warehouse', 'dbt', 'airflow', 'spark'],
    'stakeholder management':  ['executive communication', 'c-suite', 'client management', 'relationship management'],
    'technical writing':       ['documentation', 'api docs', 'runbooks', 'confluence'],
    leadership:                ['managed team', 'led team', 'team lead', 'head of', 'director', 'people manager'],
    figma:                     ['ui design', 'ux design', 'product design', 'prototyping', 'wireframing'],
    salesforce:                ['crm', 'sales cloud', 'service cloud', 'sfdc'],
    tableau:                   ['data visualisation', 'data visualization', 'powerbi', 'looker', 'dashboards'],
    elasticsearch:             ['search', 'opensearch', 'full-text search', 'lucene'],
    redis:                     ['caching', 'in-memory', 'cache layer'],
    kafka:                     ['event streaming', 'message queue', 'pubsub', 'rabbitmq'],
    linux:                     ['unix', 'bash', 'shell scripting', 'cli', 'ubuntu', 'centos'],
    security:                  ['cybersecurity', 'infosec', 'vulnerability', 'penetration testing', 'compliance', 'soc 2', 'iso 27001'],
    blockchain:                ['web3', 'smart contracts', 'solidity', 'ethereum', 'defi'],
    'cross-functional':        ['cross-team', 'collaboration', 'interdepartmental', 'worked across'],
    communication:             ['presentation', 'written communication', 'verbal', 'public speaking'],
    mentoring:                 ['coaching', 'training', 'upskilling', 'onboarding'],
    automation:                ['scripting', 'workflow automation', 'rpa', 'zapier', 'make'],
    'business analysis':       ['requirements gathering', 'process improvement', 'brd', 'functional specification'],
    'financial modelling':     ['financial analysis', 'excel modelling', 'forecasting', 'fp&a', 'valuation'],
};

// ── Coverage scoring ──────────────────────────────────────────────────────────

export interface AtsKeywordReport {
    keywords: string[];
    matched: string[];
    missing: string[];
    score: number;          // 0-100 keyword-only (legacy field, preserved)
    semanticScore: number;  // 0-100 composite (40% keyword + 40% semantic + 20% evidence)
    hasJd: boolean;
    breakdown: {
        keywordPct: number;   // % of JD keywords found literally in CV
        semanticPct: number;  // % of missing keywords matched via synonym
        evidencePct: number;  // % of matched keywords found in experience bullets (not just skills)
    };
}

const EMPTY_REPORT: AtsKeywordReport = {
    keywords: [], matched: [], missing: [],
    score: 100, semanticScore: 100, hasJd: false,
    breakdown: { keywordPct: 100, semanticPct: 100, evidencePct: 100 },
};

/**
 * Scores how well the CV covers JD keywords — three ways:
 *  1. Direct keyword match (literal, case-insensitive whole-word)
 *  2. Semantic match (synonym lookup for missed keywords)
 *  3. Evidence coverage (keywords that appear in bullets, not just skills)
 *
 * Final composite: 40% keyword + 40% semantic + 20% evidence.
 */
export function scoreAtsCoverage(cv: CVData, jd: string): AtsKeywordReport {
    if (!jd || !jd.trim()) return EMPTY_REPORT;

    const keywords = extractJdKeywords(jd);
    if (keywords.length === 0) return { ...EMPTY_REPORT, hasJd: true };

    const cvText = flattenCvText(cv);

    // Flatten only the experience bullets for the evidence check
    const experienceText = (cv.experience ?? [])
        .flatMap(e => e.responsibilities ?? [])
        .join(' ');

    const matched: string[] = [];
    const semanticMatched: string[] = [];  // missing but matched via synonym
    const missing: string[] = [];
    let evidenceCount = 0;  // matched keywords that appear in bullets

    const testInText = (term: string, text: string) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (term.includes('/')) {
            // Slash-delimited terms (a/b, ci/cd, psd2/fca): \b doesn't anchor
            // correctly around the '/' character, causing false "missing" reports
            // even when the term is present. Fix: match slash OR whitespace/dash
            // between components, AND check the slash-stripped form as a fallback.
            const flexible = escaped.replace(/\//g, '[/\\s-]?');
            const stripped = term.replace(/\//g, '').replace(/\s+/g, ' ').trim()
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(?:^|[^a-zA-Z0-9])${flexible}(?:[^a-zA-Z0-9]|$)`, 'i').test(text)
                || new RegExp(`\\b${stripped}\\b`, 'i').test(text);
        }
        const pattern = term.includes(' ')
            ? escaped
            : `\\b${escaped}\\b`;
        return new RegExp(pattern, 'i').test(text);
    };

    for (const kw of keywords) {
        const directHit = testInText(kw, cvText);

        if (directHit) {
            matched.push(kw);
            // Evidence: does the keyword appear in a bullet (not just skills)?
            if (testInText(kw, experienceText)) evidenceCount++;
        } else {
            // Semantic fallback: check synonyms
            const kwLower = kw.toLowerCase();
            const synonyms = SEMANTIC_SYNONYMS[kwLower] ?? [];
            const semanticHit = synonyms.some(syn => testInText(syn, cvText));
            if (semanticHit) {
                semanticMatched.push(kw);
            } else {
                missing.push(kw);
            }
        }
    }

    const total = keywords.length;
    const keywordPct  = Math.round((matched.length / total) * 100);
    const semanticPct = Math.round(((matched.length + semanticMatched.length) / total) * 100);
    const evidencePct = matched.length > 0
        ? Math.round((evidenceCount / matched.length) * 100)
        : 0;

    // Composite: 40% keyword + 40% semantic + 20% evidence
    const semanticScore = Math.round(
        keywordPct  * 0.40 +
        semanticPct * 0.40 +
        evidencePct * 0.20
    );

    return {
        keywords,
        matched,
        missing,
        score: keywordPct,          // legacy field — keyword-only
        semanticScore,              // recommended field to use
        hasJd: true,
        breakdown: { keywordPct, semanticPct, evidencePct },
    };
}
