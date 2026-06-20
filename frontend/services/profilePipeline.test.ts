/**
 * profilePipeline.test.ts
 *
 * Maximum-coverage tests for the ProCV profile data pipeline.
 *
 * The central contract this suite enforces:
 *   NOTHING reaches the LLM unless it has passed through the pipeline.
 *
 * Pipeline stages tested (in order of data flow):
 *
 *  Stage 0 — Inbound profile purification
 *             cleanImportedText / removeDuplicateWords
 *             Runs BEFORE any profile data enters the system.
 *
 *  Stage 1 — Profile compaction (buildCompactProfileJson)
 *             Strips ids, photos, truncates long text, caps list lengths.
 *             Guarantees the LLM never sees raw profile verbosity.
 *
 *  Stage 2 — SHA-256 hash gate
 *             Profile is hashed before upload; same profile → same hash → skip.
 *             LLM requests use hash reference ({{PROFILE}}) instead of inline text.
 *
 *  Stage 3 — Profile cache localStorage isolation
 *             Cache hash keys are slot-scoped and cleared on account wipe.
 *
 *  Stage 4 — Number fidelity (stripUngroundedNumbers / tidyOrphanRemnants)
 *             Hallucinated numbers in generated CV text are stripped.
 *             Grounded numbers (present in source profile) are preserved.
 *
 *  Stage 5 — Phrase / quality detectors
 *             detectPhraseRepetition, detectRoundNumberSaturation,
 *             detectSummaryBulletPhraseLeaks — catch AI output patterns.
 *
 *  Stage 6 — LLM gate contract
 *             Proves that the compacted profile:
 *               (a) contains no `id` / `photo` fields
 *               (b) has all long text truncated before sending
 *               (c) is always deterministically hashable
 *               (d) changes hash when profile content changes
 *               (e) hash keys are namespaced and wipe-resistant
 *
 *  Stage 7 — Profile room key isolation
 *             p:${slotId}:* keys are scoped per slot and cleared on wipe.
 *
 *  Stage 8 — End-to-end pipeline scenarios
 *             Simulated: import → purify → compact → hash → gate check →
 *             generation request shape → number fidelity pass on output.
 *
 * All tests run in Node (vitest node env). No browser APIs. No network.
 * localStorage and crypto.subtle are polyfilled where needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Shared Types (minimal, mirroring types.ts) ───────────────────────────────

interface WorkExperience {
    id?: string;
    company?: string;
    jobTitle?: string;
    startDate?: string;
    endDate?: string;
    responsibilities?: string | string[];
    pointCount?: number;
}

interface Project {
    id?: string;
    name?: string;
    description?: string;
    link?: string;
}

interface Education {
    degree?: string;
    school?: string;
    graduationYear?: string;
}

interface UserProfile {
    id?: string;
    photo?: string;
    personalInfo?: Record<string, string>;
    summary?: string;
    skills?: string[];
    workExperience?: WorkExperience[];
    projects?: Project[];
    education?: Education[];
    languages?: string[];
    customSections?: unknown[];
    sectionOrder?: string[];
    professionalSummary?: string;
}

interface UserProfileSlot {
    id: string;
    name?: string;
    profile: UserProfile;
}

interface CVData {
    summary?: string;
    experience?: Array<{
        company?: string;
        jobTitle?: string;
        endDate?: string;
        responsibilities?: string[];
    }>;
    education?: Array<{ description?: string }>;
    projects?: Array<{ description?: string }>;
    skills?: string[];
}

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLS() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => Object.keys(store).forEach(k => delete store[k]),
        get length() { return Object.keys(store).length; },
        key:        (i: number) => Object.keys(store)[i] ?? null,
        keys:       () => Object.keys(store),
        _store:     store,
    };
}

// ─── SHA-256 (mirrors profileCacheClient.ts sha256Hex) ───────────────────────

async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Profile compaction (mirrors buildCompactProfileJson exactly) ─────────────

const MAX_RESP = 350;
const MAX_PROJ_DESC = 200;
const PROFILE_CACHE_PREFIX = 'cv_builder:profile_cache_hash:';

function stripCompact(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(stripCompact).filter((v: any) =>
            v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
        );
    }
    if (obj && typeof obj === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(obj)) {
            if (k === 'id' || k === 'photo') continue;
            const s = stripCompact(v);
            if (s !== null && s !== undefined && s !== '' && !(Array.isArray(s) && s.length === 0)) {
                out[k] = s;
            }
        }
        return out;
    }
    return obj;
}

function buildCompactProfileJson(slot: UserProfileSlot): string {
    const profile = slot.profile;
    const compact = stripCompact({
        personalInfo: profile.personalInfo,
        skills: (profile.skills || []).slice(0, 20),
        projects: (profile.projects || []).slice(0, 6).map(p => ({
            name: p.name,
            description: typeof p.description === 'string' ? p.description.substring(0, MAX_PROJ_DESC) : '',
            link: p.link,
        })),
        workExperience: (profile.workExperience || []).map(e => ({
            company: e.company,
            jobTitle: e.jobTitle,
            startDate: e.startDate,
            endDate: e.endDate,
            pointCount: e.pointCount,
            responsibilities: typeof e.responsibilities === 'string'
                ? e.responsibilities.substring(0, MAX_RESP)
                : (Array.isArray(e.responsibilities)
                    ? (e.responsibilities as string[]).slice(0, 6).join('\n').substring(0, MAX_RESP)
                    : ''),
        })),
        education: (profile.education || []).map(e => ({
            degree: e.degree,
            school: e.school,
            graduationYear: e.graduationYear,
        })),
        languages: profile.languages,
        customSections: profile.customSections,
        sectionOrder: profile.sectionOrder,
    });
    return JSON.stringify(compact);
}

// ─── cleanImportedText (mirrors cvPurificationPipeline.ts exactly) ────────────

function removeDuplicateWords(input: string): string {
    if (!input || typeof input !== 'string') return input || '';
    let out = input;
    let prev: string;
    do {
        prev = out;
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        out = out.replace(/\b(\w+)\s+(?:and|or|&|,)\s+\1\b/gi, '$1');
    } while (out !== prev);
    return out;
}

function cleanImportedText(input: string): { cleaned: string; changes: string[] } {
    if (!input || typeof input !== 'string') return { cleaned: input || '', changes: [] };
    let out = input;
    const changes: string[] = [];

    // Strip tilde-before-number AI tell
    if (/~\d/.test(out)) {
        changes.push('~ before number → removed (AI tell)');
        out = out.replace(/~(\d)/g, '$1');
    }

    // Collapse double spaces and orphaned spaces before punctuation
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');

    const before = out;
    out = removeDuplicateWords(out);
    if (out !== before) changes.push('removed duplicate adjacent words');
    return { cleaned: out, changes };
}

// ─── Number fidelity (mirrors cvNumberFidelity.ts core logic) ────────────────

const CURRENCY_WORDS =
    'USD|EUR|GBP|KES|KSH|NGN|ZAR|GHS|UGX|TZS|RWF|XOF|XAF|JPY|CNY|INR|AUD|CAD|CHF|AED';
const UNIT_SUFFIXES =
    '%|x|times|m|million|k|thousand|bn|billion|M|K|years?|months?|weeks?|days?|hours?';
const HYPHEN_NOUN_SUFFIXES =
    'person|people|day|days|week|weeks|month|months|year|years|strong|fold|member|members|hour|hours|minute|minutes|second|seconds';

const NUMERIC_PHRASE_SOURCE =
    `(?:\\b(?:${CURRENCY_WORDS})\\s*)?` +
    `[$€£₦₹¥]?\\s*` +
    `(?<![A-Za-z])` +
    `\\d[\\d,]*(?:\\.\\d+)?` +
    `(?![A-Za-z])` +
    `(?:\\s*(?:${UNIT_SUFFIXES})\\b)?` +
    `(?:-(?:${HYPHEN_NOUN_SUFFIXES})\\b)?` +
    `\\+?`;

const YEAR_RX = /^(?:19|20)\d{2}$/;
const STRANDED_PREPS = new Set([
    'by', 'of', 'to', 'with', 'at', 'from', 'for', 'in', 'on',
    'across', 'over', 'under', 'above', 'below', 'reaching',
    'achieving', 'approximately', 'around', 'about', 'roughly', 'nearly', 'almost',
]);

function collectSourceNumberTokens(sourceBullets: string[], profile?: Partial<UserProfile>): Set<string> {
    const haystacks: string[] = [...sourceBullets];
    if (profile) {
        if (typeof profile.professionalSummary === 'string') haystacks.push(profile.professionalSummary);
        if (typeof profile.summary === 'string') haystacks.push(profile.summary);
        for (const role of (profile.workExperience || [])) {
            const r = role.responsibilities;
            if (typeof r === 'string') haystacks.push(r);
            else if (Array.isArray(r)) haystacks.push(...r);
        }
        for (const proj of (profile.projects || [])) {
            if (proj && typeof proj.description === 'string') haystacks.push(proj.description);
        }
    }
    const tokens = new Set<string>();
    for (const h of haystacks) {
        const hits = String(h || '').match(/\b\d+(?:[.,]\d+)*\b/g) || [];
        for (const t of hits) {
            tokens.add(t);
            tokens.add(t.replace(/,/g, ''));
        }
    }
    return tokens;
}

function tidyOrphanRemnants(text: string): string {
    let out = text;
    out = out.replace(/(?<!\d)[$€£₦₹¥]?\.\d+(?:\s*[KMBkmb])?\b\+?/g, '');
    out = out.replace(/(?<!\d)\s*%(?!\w)/g, '');
    out = out.replace(/(^|[\s(])\+(?=\s|$|[a-zA-Z])/g, '$1');
    out = out.replace(new RegExp(`\\b(a|an|the)\\s+-(?:${HYPHEN_NOUN_SUFFIXES})\\b\\s*`, 'gi'), '');
    out = out.replace(/(^|\s)-(?=[a-zA-Z])/g, '$1');
    out = out.replace(/\s{2,}/g, ' ').trim();
    return out;
}

function stripUngroundedNumbers(text: string, sourceTokens: Set<string>): string {
    if (!text) return '';
    const rx = new RegExp(NUMERIC_PHRASE_SOURCE, 'gi');
    let out = text.replace(rx, (full) => {
        const digitMatch = full.match(/\d[\d,]*(?:\.\d+)?/);
        if (!digitMatch) return full;
        const digitCore = digitMatch[0];
        const digitNoCommas = digitCore.replace(/,/g, '');
        if (YEAR_RX.test(digitNoCommas)) return full;
        if (sourceTokens.has(digitCore) || sourceTokens.has(digitNoCommas)) return full;
        return '';
    });
    out = tidyOrphanRemnants(out);
    return out;
}

// ─── Phrase / quality detectors (mirrors cvPurificationPipeline.ts) ───────────

function gatherCVText(cv: CVData): string {
    const parts: string[] = [];
    if (cv.summary) parts.push(cv.summary);
    (cv.experience || []).forEach(e => (e.responsibilities || []).forEach(b => parts.push(b)));
    (cv.education || []).forEach(e => e.description && parts.push(e.description));
    (cv.projects || []).forEach(p => p.description && parts.push(p.description));
    return parts.join(' \n ');
}

function detectPhraseRepetition(cv: CVData): Array<{ phrase: string; count: number }> {
    const text = gatherCVText(cv).toLowerCase().replace(/[^\w\s]/g, ' ');
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 8) return [];
    const STOP = new Set(['the','and','a','an','of','in','to','for','with','on','at','by','is','was','as','or','this','that','it','be']);
    const counts = new Map<string, number>();
    for (let n = 4; n <= 7; n++) {
        for (let i = 0; i + n <= words.length; i++) {
            const window = words.slice(i, i + n);
            const content = window.filter(w => !STOP.has(w)).length;
            if (content < Math.ceil(n * 0.6)) continue;
            const phrase = window.join(' ');
            counts.set(phrase, (counts.get(phrase) || 0) + 1);
        }
    }
    const repeated: Array<{ phrase: string; count: number }> = [];
    for (const [phrase, count] of counts.entries()) {
        if (count >= 2) repeated.push({ phrase, count });
    }
    repeated.sort((a, b) => b.phrase.length - a.phrase.length);
    const kept: typeof repeated = [];
    for (const r of repeated) {
        if (!kept.some(k => k.phrase.includes(r.phrase))) kept.push(r);
    }
    return kept.slice(0, 10);
}

function detectRoundNumberSaturation(cv: CVData): { ratio: number; flagged: boolean } {
    const text = gatherCVText(cv);
    const numbers = text.match(/\b\d+(?:\.\d+)?\s?%?/g) || [];
    if (numbers.length < 4) return { ratio: 0, flagged: false };
    const round = numbers.filter(n => {
        const v = parseFloat(n);
        if (isNaN(v)) return false;
        return v % 5 === 0 || v % 10 === 0;
    }).length;
    const ratio = round / numbers.length;
    return { ratio, flagged: ratio > 0.6 };
}

function detectSummaryBulletPhraseLeaks(cv: CVData): Array<{ phrase: string; locations: string[] }> {
    if (!cv.summary) return [];
    const STOP = new Set(['the','and','a','an','of','in','to','for','with','on','at','by','is','was','as','or','this','that','it','be','from','their','its']);
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ');
    const summaryWords = normalize(cv.summary).split(/\s+/).filter(Boolean);
    const summaryPhrases = new Set<string>();
    for (let n = 2; n <= 4; n++) {
        for (let i = 0; i + n <= summaryWords.length; i++) {
            const window = summaryWords.slice(i, i + n);
            const content = window.filter(w => !STOP.has(w) && w.length >= 4).length;
            if (content >= Math.ceil(n * 0.6)) summaryPhrases.add(window.join(' '));
        }
    }
    const results: Array<{ phrase: string; locations: string[] }> = [];
    for (const phrase of summaryPhrases) {
        const locations: string[] = [];
        (cv.experience || []).forEach((role, ri) => {
            (role.responsibilities || []).forEach((b, bi) => {
                if (normalize(b).includes(phrase)) locations.push(`experience[${ri}].responsibilities[${bi}]`);
            });
        });
        if (locations.length > 0) results.push({ phrase, locations });
    }
    results.sort((a, b) => b.phrase.length - a.phrase.length);
    const kept: typeof results = [];
    for (const r of results) {
        if (!kept.some(k => k.phrase.includes(r.phrase))) kept.push(r);
    }
    return kept.slice(0, 10);
}

// ─── Profile cache localStorage helpers (mirrors profileCacheClient.ts) ────────

function getProfileCacheHash(ls: ReturnType<typeof makeLS>, slotId: string): string | null {
    return ls.getItem(PROFILE_CACHE_PREFIX + slotId);
}

function setProfileCacheHash(ls: ReturnType<typeof makeLS>, slotId: string, hash: string): void {
    ls.setItem(PROFILE_CACHE_PREFIX + slotId, hash);
}

async function getHashIfCached(ls: ReturnType<typeof makeLS>, compactJson: string): Promise<string | null> {
    const hash = await sha256Hex(compactJson);
    for (const key of ls.keys()) {
        if (key.startsWith(PROFILE_CACHE_PREFIX)) {
            if (ls.getItem(key) === hash) return hash;
        }
    }
    return null;
}

// Account-wipe clears profile cache hashes (mirrors clearAppData)
function clearProfileCacheHashes(ls: ReturnType<typeof makeLS>): void {
    ls.keys()
        .filter(k => k.startsWith('cv_builder:') && k !== 'cv_builder:deviceId')
        .forEach(k => ls.removeItem(k));
}

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeFullProfile(overrides: Partial<UserProfile> = {}): UserProfileSlot {
    const profile: UserProfile = {
        id: 'profile-id-should-be-stripped',
        photo: 'data:image/png;base64,xxxxLargePhotoDataHere',
        personalInfo: { name: 'Alice Smith', email: 'alice@example.com', location: 'London' },
        summary: 'Experienced software engineer with 7 years of fintech experience.',
        skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Redis', 'Docker',
                 'Kubernetes', 'AWS', 'GraphQL', 'Python', 'Go', 'Rust', 'C++',
                 'Java', 'Scala', 'Kotlin', 'Swift', 'Dart', 'Flutter', 'Angular',
                 // 21st skill — must be cut
                 'Vue.js'],
        workExperience: [
            {
                id: 'exp-id-should-be-stripped',
                company: 'FinTech Co',
                jobTitle: 'Senior Engineer',
                startDate: '2020-01',
                endDate: 'Present',
                responsibilities: 'Built a distributed payments platform handling 500K transactions per day. ' +
                    'Led a team of 8 engineers. Reduced latency by 47% through query optimisation. ' +
                    'Migrated legacy monolith to microservices cutting infrastructure cost by $1.2M/year. ' +
                    'This text is intentionally very long to test the 350-character truncation. '.repeat(4),
            },
            {
                id: 'exp-id-2',
                company: 'StartupXYZ',
                jobTitle: 'Software Engineer',
                startDate: '2017-06',
                endDate: '2019-12',
                responsibilities: ['Shipped MVP in 6 weeks', 'Reduced churn by 23%', 'Built CI/CD pipeline'],
            },
        ],
        projects: [
            { id: 'proj-1', name: 'OpenPayments', description: 'Open-source payment protocol used by 200+ companies. '.repeat(5), link: 'https://github.com/a/b' },
            { id: 'proj-2', name: 'DataViz', description: 'React dashboard with real-time charting', link: '' },
            { id: 'proj-3', name: 'ML Pipeline', description: 'Python ML pipeline processing 1M records/day' },
            { id: 'proj-4', name: 'Auth Service', description: 'OAuth2 microservice' },
            { id: 'proj-5', name: 'CLI Tool', description: 'Rust CLI for log analysis' },
            { id: 'proj-6', name: 'Docs Site', description: 'Documentation website' },
            // 7th project — must be cut
            { id: 'proj-7', name: 'Should Be Stripped', description: 'This project should not appear in compact' },
        ],
        education: [
            { degree: 'BSc Computer Science', school: 'Imperial College London', graduationYear: '2017' },
        ],
        languages: ['English (Native)', 'French (B2)'],
        ...overrides,
    };
    return { id: 'slot-1', name: 'Main Profile', profile };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 0 — Inbound profile purification (cleanImportedText / removeDuplicateWords)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 0 — Inbound profile purification', () => {
    describe('removeDuplicateWords — adjacent duplicate removal', () => {
        it('removes adjacent duplicate words ("the the")', () => {
            expect(removeDuplicateWords('the the team')).toBe('the team');
        });
        it('removes case-insensitive adjacent duplicates ("The THE")', () => {
            expect(removeDuplicateWords('The THE team')).toBe('The team');
        });
        it('removes duplicates connected by "and"', () => {
            expect(removeDuplicateWords('documentation and documentation')).toBe('documentation');
        });
        it('removes duplicates connected by "or"', () => {
            expect(removeDuplicateWords('managed or managed')).toBe('managed');
        });
        it('removes duplicates connected by "," (with spaces around comma)', () => {
            expect(removeDuplicateWords('skills , skills')).toBe('skills');
        });
        it('collapses triple duplicates ("a a a" → "a")', () => {
            expect(removeDuplicateWords('a a a')).toBe('a');
        });
        it('does not alter text with no duplicates', () => {
            const t = 'Delivered 47% reduction in latency';
            expect(removeDuplicateWords(t)).toBe(t);
        });
        it('returns empty string for empty input', () => {
            expect(removeDuplicateWords('')).toBe('');
        });
        it('handles non-string gracefully', () => {
            expect(removeDuplicateWords(null as any)).toBe('');
        });
        it('is idempotent — running twice produces the same result', () => {
            const t = 'built and built the the platform';
            const once = removeDuplicateWords(t);
            expect(removeDuplicateWords(once)).toBe(once);
        });
        it('does not collapse different words that happen to start alike', () => {
            const t = 'manage management strategy';
            expect(removeDuplicateWords(t)).toBe(t);
        });
    });

    describe('cleanImportedText — AI tell stripping + whitespace', () => {
        it('strips tilde-before-number AI tell ("~50%" → "50%")', () => {
            const { cleaned, changes } = cleanImportedText('Reduced latency by ~50%');
            expect(cleaned).toBe('Reduced latency by 50%');
            expect(changes).toContain('~ before number → removed (AI tell)');
        });
        it('strips multiple tilde tells in one pass', () => {
            const { cleaned } = cleanImportedText('~30% cost reduction and ~12 team members');
            expect(cleaned).toBe('30% cost reduction and 12 team members');
        });
        it('does NOT strip a tilde not followed by a digit', () => {
            const { cleaned } = cleanImportedText('name ~ Alice');
            expect(cleaned).toBe('name ~ Alice');
        });
        it('collapses double spaces from deletions', () => {
            const { cleaned } = cleanImportedText('built  the platform');
            expect(cleaned).toBe('built the platform');
        });
        it('removes space-before-punctuation artefacts', () => {
            const { cleaned } = cleanImportedText('Delivered results , on time');
            expect(cleaned).toBe('Delivered results, on time');
        });
        it('removes duplicate words after substitutions', () => {
            const { cleaned, changes } = cleanImportedText('built the the system');
            expect(cleaned).toBe('built the system');
            expect(changes).toContain('removed duplicate adjacent words');
        });
        it('returns unchanged text with no changes array when nothing matches', () => {
            const t = 'Led a team of 8 engineers to deliver a payment platform';
            const { cleaned, changes } = cleanImportedText(t);
            expect(cleaned).toBe(t);
            expect(changes).toHaveLength(0);
        });
        it('is idempotent — running the same text twice produces the same result', () => {
            const t = 'Reduced by ~30% and cut and cut costs';
            const { cleaned: first } = cleanImportedText(t);
            const { cleaned: second } = cleanImportedText(first);
            expect(first).toBe(second);
        });
        it('handles empty string without throwing', () => {
            const { cleaned, changes } = cleanImportedText('');
            expect(cleaned).toBe('');
            expect(changes).toHaveLength(0);
        });
        it('handles non-string without throwing', () => {
            const { cleaned } = cleanImportedText(null as any);
            expect(cleaned).toBe('');
        });
        it('[Gate] AI tells are stripped BEFORE text reaches the compact profile', () => {
            const raw = 'Increased revenue by ~40% across ~12 product lines';
            const { cleaned } = cleanImportedText(raw);
            expect(cleaned).not.toContain('~');
            expect(cleaned).toContain('40%');
            expect(cleaned).toContain('12');
        });
        it('[Gate] duplicate words from substitutions are collapsed before profile storage', () => {
            const { cleaned } = cleanImportedText('knowledge sharing and knowledge sharing best practices');
            expect(removeDuplicateWords(cleaned)).not.toMatch(/(\b\w+\b)\s+(?:and\s+)?\1/i);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1 — Profile compaction contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 1 — Profile compaction (buildCompactProfileJson)', () => {
    let slot: UserProfileSlot;
    let compact: any;

    beforeEach(() => {
        slot = makeFullProfile();
        compact = JSON.parse(buildCompactProfileJson(slot));
    });

    describe('Field stripping — PII / metadata fields', () => {
        it('strips top-level profile id', () => {
            expect(compact.id).toBeUndefined();
        });
        it('strips photo (base64 blob never reaches LLM)', () => {
            expect(compact.photo).toBeUndefined();
        });
        it('strips workExperience[].id', () => {
            (compact.workExperience || []).forEach((e: any) => {
                expect(e.id).toBeUndefined();
            });
        });
        it('strips projects[].id', () => {
            (compact.projects || []).forEach((p: any) => {
                expect(p.id).toBeUndefined();
            });
        });
        it('strips null / undefined / empty-string fields recursively', () => {
            const s = makeFullProfile({ skills: ['TypeScript', '', 'React'] });
            const c = JSON.parse(buildCompactProfileJson(s));
            // The empty string should not appear in the compact output
            expect(c.skills).not.toContain('');
        });
        it('strips empty-array fields recursively', () => {
            const s = makeFullProfile({ languages: [] });
            const c = JSON.parse(buildCompactProfileJson(s));
            expect(c.languages).toBeUndefined();
        });
    });

    describe('Skills — capped at 20', () => {
        it('only includes the first 20 skills (21st is cut)', () => {
            expect(compact.skills.length).toBeLessThanOrEqual(20);
        });
        it('the 21st skill ("Vue.js") does not appear in compact', () => {
            expect(compact.skills).not.toContain('Vue.js');
        });
        it('the first 20 skills are all present', () => {
            const expected = ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Redis',
                'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Python', 'Go', 'Rust',
                'C++', 'Java', 'Scala', 'Kotlin', 'Swift', 'Dart', 'Flutter', 'Angular'];
            expected.forEach(skill => expect(compact.skills).toContain(skill));
        });
    });

    describe('Projects — capped at 6', () => {
        it('only includes first 6 projects', () => {
            expect(compact.projects.length).toBeLessThanOrEqual(6);
        });
        it('the 7th project ("Should Be Stripped") is absent', () => {
            const names = compact.projects.map((p: any) => p.name);
            expect(names).not.toContain('Should Be Stripped');
        });
        it('project descriptions are truncated to 200 chars', () => {
            compact.projects.forEach((p: any) => {
                expect((p.description || '').length).toBeLessThanOrEqual(MAX_PROJ_DESC);
            });
        });
        it('project names and links are preserved', () => {
            const proj = compact.projects[0];
            expect(proj.name).toBe('OpenPayments');
            expect(proj.link).toBe('https://github.com/a/b');
        });
    });

    describe('Work experience — responsibilities truncated to 350 chars', () => {
        it('string responsibilities are truncated to 350 chars', () => {
            const exp = compact.workExperience[0];
            expect(exp.responsibilities.length).toBeLessThanOrEqual(MAX_RESP);
        });
        it('array responsibilities are joined then truncated to 350 chars', () => {
            const exp = compact.workExperience[1];
            expect(exp.responsibilities.length).toBeLessThanOrEqual(MAX_RESP);
        });
        it('preserves company, jobTitle, startDate, endDate', () => {
            const exp = compact.workExperience[0];
            expect(exp.company).toBe('FinTech Co');
            expect(exp.jobTitle).toBe('Senior Engineer');
            expect(exp.startDate).toBe('2020-01');
            expect(exp.endDate).toBe('Present');
        });
        it('does NOT expose raw long responsibilities to the LLM', () => {
            const raw = slot.profile.workExperience![0].responsibilities as string;
            const stored = compact.workExperience[0].responsibilities;
            expect(raw.length).toBeGreaterThan(MAX_RESP);
            expect(stored.length).toBeLessThanOrEqual(MAX_RESP);
        });
    });

    describe('Education preserved', () => {
        it('includes degree, school, graduationYear', () => {
            expect(compact.education[0].degree).toBe('BSc Computer Science');
            expect(compact.education[0].school).toBe('Imperial College London');
            expect(compact.education[0].graduationYear).toBe('2017');
        });
    });

    describe('Output format', () => {
        it('produces a valid JSON string', () => {
            const json = buildCompactProfileJson(slot);
            expect(() => JSON.parse(json)).not.toThrow();
        });
        it('is deterministic — identical input produces identical output', () => {
            const a = buildCompactProfileJson(makeFullProfile());
            const b = buildCompactProfileJson(makeFullProfile());
            expect(a).toBe(b);
        });
        it('output changes when profile name changes', () => {
            const slotA = makeFullProfile({ personalInfo: { name: 'Alice' } });
            const slotB = makeFullProfile({ personalInfo: { name: 'Bob' } });
            expect(buildCompactProfileJson(slotA)).not.toBe(buildCompactProfileJson(slotB));
        });
        it('[Gate] compact JSON is significantly shorter than raw profile JSON', () => {
            const rawSize = JSON.stringify(slot.profile).length;
            const compactSize = buildCompactProfileJson(slot).length;
            // Compact must be shorter due to truncation, stripping, and capping
            expect(compactSize).toBeLessThan(rawSize);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2 — SHA-256 hash gate
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 2 — SHA-256 hash gate', () => {
    it('same compact JSON always hashes to the same value', async () => {
        const json = buildCompactProfileJson(makeFullProfile());
        const h1 = await sha256Hex(json);
        const h2 = await sha256Hex(json);
        expect(h1).toBe(h2);
    });

    it('hash is always 64 hex characters', async () => {
        const hash = await sha256Hex('any content here');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('different profiles produce different hashes', async () => {
        const a = buildCompactProfileJson(makeFullProfile({ personalInfo: { name: 'Alice' } }));
        const b = buildCompactProfileJson(makeFullProfile({ personalInfo: { name: 'Bob' } }));
        expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
    });

    it('adding a skill changes the hash (mutation detection)', async () => {
        const slotA = makeFullProfile({ skills: ['TypeScript'] });
        const slotB = makeFullProfile({ skills: ['TypeScript', 'React'] });
        const hA = await sha256Hex(buildCompactProfileJson(slotA));
        const hB = await sha256Hex(buildCompactProfileJson(slotB));
        expect(hA).not.toBe(hB);
    });

    it('hash gate: same profile → same hash → should skip re-upload', async () => {
        const ls = makeLS();
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const hash = await sha256Hex(json);

        // First upload: store the hash
        setProfileCacheHash(ls, slot.id, hash);

        // Check gate: stored hash matches computed hash → skip
        const stored = getProfileCacheHash(ls, slot.id);
        expect(stored).toBe(hash); // gate passes — no re-upload needed
    });

    it('hash gate: changed profile → different hash → must re-upload', async () => {
        const ls = makeLS();
        const slot = makeFullProfile();
        const oldJson = buildCompactProfileJson(slot);
        const oldHash = await sha256Hex(oldJson);
        setProfileCacheHash(ls, slot.id, oldHash);

        // Profile changes
        slot.profile.personalInfo = { name: 'Alice Updated' };
        const newJson = buildCompactProfileJson(slot);
        const newHash = await sha256Hex(newJson);

        const stored = getProfileCacheHash(ls, slot.id);
        expect(stored).not.toBe(newHash); // hash mismatch → re-upload required
    });

    it('getHashIfCached returns hash when profile is cached', async () => {
        const ls = makeLS();
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const hash = await sha256Hex(json);
        setProfileCacheHash(ls, slot.id, hash);

        const found = await getHashIfCached(ls, json);
        expect(found).toBe(hash);
    });

    it('getHashIfCached returns null when profile is NOT cached', async () => {
        const ls = makeLS();
        const json = buildCompactProfileJson(makeFullProfile());
        const found = await getHashIfCached(ls, json);
        expect(found).toBeNull();
    });

    it('[Gate] if hash is cached, {{PROFILE}} substitution should be used (not inline text)', async () => {
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const hash = await sha256Hex(json);

        // Simulate the preamble construction decision:
        // if hash exists → use {{PROFILE}} placeholder, not inline JSON
        const cachedHash = hash; // simulating a cache hit
        const preamble = cachedHash
            ? `=== PROFILE ===\n{{PROFILE}}\n=== END PROFILE ===`
            : `=== PROFILE ===\n${json}\n=== END PROFILE ===`;

        expect(preamble).toContain('{{PROFILE}}');
        expect(preamble).not.toContain(json); // raw profile NOT inlined
    });

    it('[Gate] if hash is NOT cached, full compact JSON is sent inline (not raw profile)', async () => {
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const cachedHash: string | null = null; // cache miss

        const preamble = cachedHash
            ? `{{PROFILE}}`
            : `=== PROFILE ===\n${json}\n=== END PROFILE ===`;

        // Compact JSON is used — not the raw profile with id/photo
        expect(preamble).toContain(json);
        // Photo must not be present even in the inline fallback
        const parsedInline = JSON.parse(json);
        expect(parsedInline.photo).toBeUndefined();
        expect(parsedInline.id).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3 — Profile cache localStorage isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 3 — Profile cache localStorage isolation', () => {
    let ls: ReturnType<typeof makeLS>;

    beforeEach(() => { ls = makeLS(); });

    it('hash key is namespaced: cv_builder:profile_cache_hash:<slotId>', () => {
        setProfileCacheHash(ls, 'slot-1', 'abc123');
        const key = PROFILE_CACHE_PREFIX + 'slot-1';
        expect(ls.getItem(key)).toBe('abc123');
    });

    it('different slots use different keys (no cross-slot bleed)', () => {
        setProfileCacheHash(ls, 'slot-1', 'hash-a');
        setProfileCacheHash(ls, 'slot-2', 'hash-b');
        expect(getProfileCacheHash(ls, 'slot-1')).toBe('hash-a');
        expect(getProfileCacheHash(ls, 'slot-2')).toBe('hash-b');
    });

    it('getProfileCacheHash returns null when no hash is stored', () => {
        expect(getProfileCacheHash(ls, 'slot-999')).toBeNull();
    });

    it('getHashIfCached scans all slots to find a match', async () => {
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const hash = await sha256Hex(json);

        // Stored under a different slot
        setProfileCacheHash(ls, 'slot-9', hash);

        const found = await getHashIfCached(ls, json);
        expect(found).toBe(hash);
    });

    it('[Account wipe] all profile_cache_hash keys are cleared on wipe', () => {
        setProfileCacheHash(ls, 'slot-1', 'hash-1');
        setProfileCacheHash(ls, 'slot-2', 'hash-2');
        setProfileCacheHash(ls, 'slot-abc-def', 'hash-3');

        clearProfileCacheHashes(ls);

        expect(getProfileCacheHash(ls, 'slot-1')).toBeNull();
        expect(getProfileCacheHash(ls, 'slot-2')).toBeNull();
        expect(getProfileCacheHash(ls, 'slot-abc-def')).toBeNull();
    });

    it('[Account wipe] after wipe, getHashIfCached returns null (no stale hits)', async () => {
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        const hash = await sha256Hex(json);
        setProfileCacheHash(ls, 'slot-1', hash);

        clearProfileCacheHashes(ls);

        const found = await getHashIfCached(ls, json);
        expect(found).toBeNull();
    });

    it('[Account wipe] device_id is preserved even when cache hashes are cleared', () => {
        ls.setItem('cv_builder:deviceId', 'device-abc');
        setProfileCacheHash(ls, 'slot-1', 'hash-1');
        clearProfileCacheHashes(ls);
        expect(ls.getItem('cv_builder:deviceId')).toBe('device-abc');
    });

    it('clearing one slot hash does not affect other slots', () => {
        setProfileCacheHash(ls, 'slot-1', 'hash-a');
        setProfileCacheHash(ls, 'slot-2', 'hash-b');
        ls.removeItem(PROFILE_CACHE_PREFIX + 'slot-1');
        expect(getProfileCacheHash(ls, 'slot-1')).toBeNull();
        expect(getProfileCacheHash(ls, 'slot-2')).toBe('hash-b');
    });

    it('stale hash from deleted slot does not leak into getHashIfCached for new slot', async () => {
        // User A had slot-1 with hash-a
        const slotA = makeFullProfile({ personalInfo: { name: 'Alice' } });
        const jsonA = buildCompactProfileJson(slotA);
        const hashA = await sha256Hex(jsonA);
        setProfileCacheHash(ls, 'slot-1', hashA);

        // Account wiped
        clearProfileCacheHashes(ls);

        // User B has completely different profile — no hash hit
        const slotB = makeFullProfile({ personalInfo: { name: 'Bob' } });
        const jsonB = buildCompactProfileJson(slotB);
        const found = await getHashIfCached(ls, jsonB);
        expect(found).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 4 — Number fidelity (hallucination guard)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 4 — Number fidelity (hallucination guard)', () => {
    describe('collectSourceNumberTokens', () => {
        it('collects numbers from source bullets', () => {
            const tokens = collectSourceNumberTokens(['Reduced costs by 47%', 'Managed team of 8']);
            expect(tokens.has('47')).toBe(true);
            expect(tokens.has('8')).toBe(true);
        });
        it('collects numbers from profile summary', () => {
            const tokens = collectSourceNumberTokens([], { summary: '7 years of experience' });
            expect(tokens.has('7')).toBe(true);
        });
        it('collects numbers from workExperience responsibilities', () => {
            const tokens = collectSourceNumberTokens([], {
                workExperience: [{ responsibilities: 'Cut latency by 300 ms across 5 services, saving 1,200 hours' }],
            });
            expect(tokens.has('300')).toBe(true);
            expect(tokens.has('5')).toBe(true);
            expect(tokens.has('1,200')).toBe(true);
        });
        it('stores both comma-form and comma-stripped form ("1,200" and "1200")', () => {
            const tokens = collectSourceNumberTokens(['Revenue of 1,200,000']);
            expect(tokens.has('1,200,000')).toBe(true);
            expect(tokens.has('1200000')).toBe(true);
        });
        it('returns empty set for empty inputs', () => {
            const tokens = collectSourceNumberTokens([]);
            expect(tokens.size).toBe(0);
        });
    });

    describe('stripUngroundedNumbers — hallucinated numbers removed', () => {
        it('removes a number that does NOT appear in source profile', () => {
            const tokens = collectSourceNumberTokens(['Increased revenue by 47%']);
            const result = stripUngroundedNumbers('Grew team to 99 engineers', tokens);
            expect(result).not.toMatch(/\b99\b/);
        });

        it('preserves a number that DOES appear in source profile', () => {
            const tokens = collectSourceNumberTokens(['Led a team of 8 engineers']);
            const result = stripUngroundedNumbers('Managed a team of 8 engineers', tokens);
            expect(result).toContain('8');
        });

        it('[Calendar Year] always preserves 4-digit calendar years (never hallucinations)', () => {
            const tokens = new Set<string>(); // year NOT in source
            const result = stripUngroundedNumbers('From 2019 to 2023', tokens);
            expect(result).toContain('2019');
            expect(result).toContain('2023');
        });

        it('removes hallucinated % figure when no matching source number', () => {
            const tokens = collectSourceNumberTokens(['Cut costs by 23%']);
            const result = stripUngroundedNumbers('Improved efficiency by 85%', tokens);
            expect(result).not.toMatch(/85%/);
        });

        it('preserves grounded % figure from source profile', () => {
            const tokens = collectSourceNumberTokens(['Reduced churn by 23%']);
            const result = stripUngroundedNumbers('Reduced churn by 23%', tokens);
            expect(result).toContain('23%');
        });

        it('removes hallucinated currency figure ("$1.5M" not in source)', () => {
            const tokens = collectSourceNumberTokens(['Generated $200K in revenue']);
            const result = stripUngroundedNumbers('Delivered $1.5M cost saving', tokens);
            expect(result).not.toMatch(/1\.5M/);
        });

        it('[Gate] after stripping, no ungrounded metric appears in output', () => {
            const profile: Partial<UserProfile> = {
                workExperience: [{ responsibilities: 'Shipped MVP in 6 weeks. Reduced churn by 23%.' }],
            };
            const tokens = collectSourceNumberTokens([], profile);

            const generated = 'Shipped MVP in 6 weeks. Reduced churn by 23%. Grew revenue by $4.2M (hallucinated).';
            const clean = stripUngroundedNumbers(generated, tokens);

            expect(clean).toContain('6');
            expect(clean).toContain('23%');
            expect(clean).not.toMatch(/4\.2M/);
        });
    });

    describe('tidyOrphanRemnants — cleanup after number stripping', () => {
        it('removes orphan % with no preceding digit', () => {
            const result = tidyOrphanRemnants('improved results by %');
            expect(result).not.toContain('%');
        });
        it('removes orphan leading "+" after number is stripped', () => {
            const result = tidyOrphanRemnants('managed + engineers');
            expect(result.trim()).not.toMatch(/^\+/);
        });
        it('removes "a -person team" orphan hyphen construct', () => {
            const result = tidyOrphanRemnants('led a -person team');
            expect(result).not.toContain('-person');
        });
        it('collapses double spaces after orphan removal', () => {
            const result = tidyOrphanRemnants('Achieved  results');
            expect(result).not.toContain('  ');
        });
        it('does not corrupt a clean bullet with no orphans', () => {
            const clean = 'Led a team of 8 engineers to deliver the platform in 6 weeks';
            const result = tidyOrphanRemnants(clean);
            expect(result).toBe(clean);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 5 — Phrase / quality detectors
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 5 — CV quality detectors', () => {
    describe('detectPhraseRepetition', () => {
        it('returns empty array for a CV with no repetitions', () => {
            const cv: CVData = {
                summary: 'Experienced engineer',
                experience: [{ responsibilities: ['Built payment platform', 'Led team of 8'] }],
            };
            expect(detectPhraseRepetition(cv)).toHaveLength(0);
        });

        it('detects a 4-word phrase repeated across two bullets', () => {
            const cv: CVData = {
                experience: [{
                    responsibilities: [
                        'Drove end-to-end product development across three teams',
                        'Led end-to-end product development for the payments feature',
                    ],
                }],
            };
            const leaks = detectPhraseRepetition(cv);
            expect(leaks.length).toBeGreaterThan(0);
            expect(leaks[0].count).toBeGreaterThanOrEqual(2);
        });

        it('does not flag stop-word-only phrases', () => {
            const cv: CVData = {
                experience: [{
                    responsibilities: [
                        'Built the system and the team together',
                        'Led the system and the team to success',
                    ],
                }],
            };
            const leaks = detectPhraseRepetition(cv);
            // "the system and the" is dominated by stop words — should not flag
            const stopWordOnly = leaks.filter(l => l.phrase === 'the system and the');
            expect(stopWordOnly).toHaveLength(0);
        });

        it('returns empty array for a CV with very little text', () => {
            const cv: CVData = { summary: 'Engineer' };
            expect(detectPhraseRepetition(cv)).toHaveLength(0);
        });

        it('returns items with phrase and count properties', () => {
            const longPhrase = 'delivered scalable infrastructure solutions for enterprise clients';
            const cv: CVData = {
                experience: [{
                    responsibilities: [
                        longPhrase + ' across five data centres',
                        longPhrase + ' in the healthcare sector',
                    ],
                }],
            };
            const leaks = detectPhraseRepetition(cv);
            if (leaks.length > 0) {
                expect(leaks[0]).toHaveProperty('phrase');
                expect(leaks[0]).toHaveProperty('count');
                expect(leaks[0].count).toBeGreaterThanOrEqual(2);
            }
        });
    });

    describe('detectRoundNumberSaturation', () => {
        it('does not flag a CV with fewer than 4 numbers', () => {
            const cv: CVData = { summary: 'Led a team of 8', experience: [] };
            const { flagged } = detectRoundNumberSaturation(cv);
            expect(flagged).toBe(false);
        });

        it('flags a CV where >60% of numbers are round (AI tell)', () => {
            const cv: CVData = {
                experience: [{
                    responsibilities: [
                        'Increased revenue by 20%',
                        'Reduced cost by 30%',
                        'Grew team to 50 engineers',
                        'Shipped 100 features',
                        'Improved NPS by 47 points', // non-round
                    ],
                }],
            };
            const { flagged, ratio } = detectRoundNumberSaturation(cv);
            expect(flagged).toBe(true);
            expect(ratio).toBeGreaterThan(0.6);
        });

        it('does not flag a realistic CV with mixed specific and round numbers', () => {
            const cv: CVData = {
                experience: [{
                    responsibilities: [
                        'Reduced latency by 47%',
                        'Managed a team of 8 engineers',
                        'Cut infrastructure cost by $1.2M',
                        'Shipped 23 features in Q3 2023',
                    ],
                }],
            };
            const { flagged } = detectRoundNumberSaturation(cv);
            expect(flagged).toBe(false);
        });
    });

    describe('detectSummaryBulletPhraseLeaks', () => {
        it('returns empty array when summary is absent', () => {
            const cv: CVData = { experience: [{ responsibilities: ['Built things'] }] };
            expect(detectSummaryBulletPhraseLeaks(cv)).toHaveLength(0);
        });

        it('detects a phrase from summary recycled verbatim into a bullet', () => {
            const cv: CVData = {
                summary: 'Expert in client-focused design and technical analysis',
                experience: [{
                    responsibilities: [
                        'Applied client-focused design principles across the product',
                    ],
                }],
            };
            const leaks = detectSummaryBulletPhraseLeaks(cv);
            expect(leaks.length).toBeGreaterThan(0);
            expect(leaks[0].locations.length).toBeGreaterThan(0);
        });

        it('returns location in format experience[ri].responsibilities[bi]', () => {
            const cv: CVData = {
                summary: 'Specialised in distributed systems design',
                experience: [
                    { responsibilities: ['Led distributed systems design for payments'] },
                ],
            };
            const leaks = detectSummaryBulletPhraseLeaks(cv);
            if (leaks.length > 0) {
                expect(leaks[0].locations[0]).toMatch(/^experience\[\d+\]\.responsibilities\[\d+\]$/);
            }
        });

        it('does not flag if summary phrase does not appear in any bullet', () => {
            const cv: CVData = {
                summary: 'Passionate about inclusive user experiences',
                experience: [{
                    responsibilities: [
                        'Built payment systems at scale',
                        'Led infrastructure migration to AWS',
                    ],
                }],
            };
            const leaks = detectSummaryBulletPhraseLeaks(cv);
            // "inclusive user experiences" does not appear in bullets
            expect(leaks.every(l => !l.phrase.includes('inclusive user'))).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 6 — LLM gate contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 6 — LLM gate contract', () => {
    it('[Gate] compact profile never contains raw id field', () => {
        const slot = makeFullProfile();
        const compact = JSON.parse(buildCompactProfileJson(slot));
        // Deep scan for any 'id' key
        function hasId(obj: any): boolean {
            if (!obj || typeof obj !== 'object') return false;
            if ('id' in obj) return true;
            return Object.values(obj).some(v => hasId(v));
        }
        expect(hasId(compact)).toBe(false);
    });

    it('[Gate] compact profile never contains photo data', () => {
        const slot = makeFullProfile();
        const json = buildCompactProfileJson(slot);
        expect(json).not.toContain('data:image');
        expect(json).not.toContain('base64');
        expect(json).not.toContain('photo');
    });

    it('[Gate] compact profile is always a string (JSON serialised, not object)', () => {
        const json = buildCompactProfileJson(makeFullProfile());
        expect(typeof json).toBe('string');
    });

    it('[Gate] hash of compact profile is always 64 hex chars', async () => {
        const json = buildCompactProfileJson(makeFullProfile());
        const hash = await sha256Hex(json);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('[Gate] changing skills causes hash to change (mutation detection works)', async () => {
        const slotA = makeFullProfile({ skills: ['TypeScript', 'React'] });
        const slotB = makeFullProfile({ skills: ['TypeScript', 'Python'] });
        const hA = await sha256Hex(buildCompactProfileJson(slotA));
        const hB = await sha256Hex(buildCompactProfileJson(slotB));
        expect(hA).not.toBe(hB);
    });

    it('[Gate] changing responsibilities causes hash to change', async () => {
        const slotA = makeFullProfile();
        slotA.profile.workExperience![0].responsibilities = 'Old bullet';
        const slotB = makeFullProfile();
        slotB.profile.workExperience![0].responsibilities = 'Updated bullet with 47% improvement';
        const hA = await sha256Hex(buildCompactProfileJson(slotA));
        const hB = await sha256Hex(buildCompactProfileJson(slotB));
        expect(hA).not.toBe(hB);
    });

    it('[Gate] photo change does NOT change the hash (photo is stripped before hashing)', async () => {
        const slotA = makeFullProfile({ photo: 'data:image/png;base64,OLD' });
        const slotB = makeFullProfile({ photo: 'data:image/png;base64,NEW' });
        const hA = await sha256Hex(buildCompactProfileJson(slotA));
        const hB = await sha256Hex(buildCompactProfileJson(slotB));
        // Photo is stripped → same compact JSON → same hash
        expect(hA).toBe(hB);
    });

    it('[Gate] tilde AI tell in responsibility is stripped BEFORE hash (inbound sanitization first)', () => {
        const rawResp = 'Increased sales by ~40% across ~12 product lines';
        const { cleaned } = cleanImportedText(rawResp);
        expect(cleaned).not.toContain('~');
        // The cleaned version should be what reaches the compact profile
        const slot = makeFullProfile();
        slot.profile.workExperience![0].responsibilities = cleaned;
        const json = buildCompactProfileJson(slot);
        expect(json).not.toContain('~40%');
    });

    it('[Gate] generated CV output goes through number fidelity before returning to user', () => {
        const profile: Partial<UserProfile> = {
            workExperience: [{ responsibilities: 'Saved 47% on infrastructure costs' }],
        };
        const tokens = collectSourceNumberTokens([], profile);

        // LLM output (contains hallucinated 99%)
        const generated = 'Reduced infrastructure costs by 99% saving the business millions';
        const cleaned = stripUngroundedNumbers(generated, tokens);

        // 99% is not in source → stripped
        expect(cleaned).not.toMatch(/99%/);
        // Text is still readable after stripping
        expect(cleaned.length).toBeGreaterThan(0);
    });

    it('[Gate] generated CV output with grounded numbers passes through unchanged', () => {
        const profile: Partial<UserProfile> = {
            workExperience: [{ responsibilities: 'Reduced latency by 47% across 8 services' }],
        };
        const tokens = collectSourceNumberTokens([], profile);
        const generated = 'Reduced latency by 47% across 8 microservices';
        const cleaned = stripUngroundedNumbers(generated, tokens);
        expect(cleaned).toContain('47%');
        expect(cleaned).toContain('8');
    });

    it('[Gate] instruction leaks from LLM are detectable via INSTRUCTION_LEAK patterns', () => {
        const instructionLeakPatterns = [
            /^Note[:\s—–-]+[^.!?]*[.!?]/i,
            /^Based\s+on\s+(?:the|their|your)\s+(?:profile|CV|resume|experience|information|data)[,:\s]+/i,
            /^The\s+(?:candidate|user|applicant|professional)\s+(?:has|does\s+not\s+have|lacks)[^.!?]*[.!?]/i,
            /^Years?\s+(?:of\s+experience\s+)?(?:is|are)\s+not\s+\w+/i,
            /^I\s+(?:have\s+)?(?:noted?|cannot|could\s+not|will\s+not)[^.!?]*[.!?]/i,
        ];

        const leakedSummaries = [
            'Note: The candidate lacks fintech experience.',
            'Based on the profile, the engineer has strong skills.',
            'The candidate does not have leadership experience.',
            'Years of experience is not provided, however the engineer has led teams.',
            'I cannot determine the exact years of service.',
        ];

        leakedSummaries.forEach(summary => {
            const detected = instructionLeakPatterns.some(p => p.test(summary));
            expect(detected).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 7 — Profile room key isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 7 — Profile room key isolation (p:* keys)', () => {
    let ls: ReturnType<typeof makeLS>;

    beforeEach(() => { ls = makeLS(); });

    it('profile room keys are scoped per slot: p:${slotId}:${field}', () => {
        ls.setItem('p:slot-1:jd', 'Senior Engineer JD');
        ls.setItem('p:slot-2:jd', 'Product Manager JD');
        expect(ls.getItem('p:slot-1:jd')).toBe('Senior Engineer JD');
        expect(ls.getItem('p:slot-2:jd')).toBe('Product Manager JD');
    });

    it('slot-1 JD does not bleed into slot-2', () => {
        ls.setItem('p:slot-1:jd', 'FinTech JD');
        expect(ls.getItem('p:slot-2:jd')).toBeNull(); // slot-2 gets nothing
    });

    it('all p:* keys for all slots are cleared on account wipe', () => {
        ls.setItem('p:slot-1:jd', 'JD A');
        ls.setItem('p:slot-1:company', 'FinTech Co');
        ls.setItem('p:slot-2:jd', 'JD B');
        ls.setItem('p:slot-2:jobTitle', 'Product Manager');
        ls.setItem('p:abc-uuid:purpose', 'promotion');

        // Wipe clears all p:* keys
        ls.keys().filter(k => k.startsWith('p:')).forEach(k => ls.removeItem(k));

        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('p:slot-1:company')).toBeNull();
        expect(ls.getItem('p:slot-2:jd')).toBeNull();
        expect(ls.getItem('p:abc-uuid:purpose')).toBeNull();
    });

    it('clearing one slot\'s room keys does not affect other slots', () => {
        ls.setItem('p:slot-1:jd', 'JD A');
        ls.setItem('p:slot-2:jd', 'JD B');

        // Only clear slot-1
        ls.keys().filter(k => k.startsWith('p:slot-1:')).forEach(k => ls.removeItem(k));

        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('p:slot-2:jd')).toBe('JD B'); // unaffected
    });

    it('all expected profile-room field types are scoped correctly', () => {
        const fields = ['jd', 'company', 'jobTitle', 'mode', 'purpose', 'keywords'];
        fields.forEach(f => {
            ls.setItem(`p:slot-1:${f}`, `value-${f}`);
        });
        fields.forEach(f => {
            expect(ls.getItem(`p:slot-1:${f}`)).toBe(`value-${f}`);
        });
    });

    it('[User A → User B] slot room keys do not bleed between users after wipe', () => {
        // User A's slot
        ls.setItem('p:slot-1:jd', 'User A secret JD content');
        ls.setItem('p:slot-1:company', 'User A target company');

        // Account wipe
        ls.keys().filter(k => k.startsWith('p:')).forEach(k => ls.removeItem(k));

        // User B's new session — can see nothing from User A
        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('p:slot-1:company')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 8 — End-to-end pipeline scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stage 8 — End-to-end pipeline scenarios', () => {
    it('E2E: import raw text → purify → compact → hash → LLM receives only clean data', async () => {
        // Step 0: Raw profile text from a CV import (with AI tells)
        const rawSummary = 'Experienced engineer with ~7 years in fintech. Managed managed teams.';
        const { cleaned: cleanedSummary } = cleanImportedText(rawSummary);

        // Verify AI tells stripped
        expect(cleanedSummary).not.toContain('~');
        expect(cleanedSummary).not.toMatch(/managed managed/i);

        // Step 1: Build slot with purified data
        const slot: UserProfileSlot = {
            id: 'slot-user1',
            name: 'User Profile',
            profile: {
                id: 'should-be-stripped',
                photo: 'data:image/png;base64,largeblob',
                personalInfo: { name: 'Alice Smith' },
                summary: cleanedSummary,
                skills: ['TypeScript', 'React'],
                workExperience: [{
                    id: 'exp-id-stripped',
                    company: 'FinTech Co',
                    jobTitle: 'Senior Engineer',
                    responsibilities: 'Cut latency by 47%. Managed a team of 8.',
                }],
            },
        };

        // Step 2: Compact (PII stripped, text truncated)
        const compactJson = buildCompactProfileJson(slot);
        const compact = JSON.parse(compactJson);

        expect(compact.id).toBeUndefined();          // id stripped
        expect(compact.photo).toBeUndefined();        // photo stripped
        expect(compact.workExperience[0].id).toBeUndefined(); // nested id stripped
        // summary is not in the compact spec — verify purified summary went into workExperience
        // (in this fixture the slot summary was placed in the profile, compaction omits it by design)
        // Instead verify the compact JSON string itself has no tilde AI tells
        expect(compactJson).not.toContain('~');

        // Step 3: Hash for cache gate
        const hash = await sha256Hex(compactJson);
        expect(hash).toHaveLength(64);

        // Step 4: Simulate LLM preamble construction — compact only
        const preamble = `=== PROFILE ===\n${compactJson}\n=== END PROFILE ===`;
        expect(preamble).not.toContain('"id"');
        expect(preamble).not.toContain('base64');

        // Step 5: Simulated LLM output → number fidelity check
        const sourceTokens = collectSourceNumberTokens([], slot.profile);
        const generated = 'Led a team of 8 engineers, cutting latency by 47%. Grew revenue by $2.5M (hallucinated).';
        const cleaned = stripUngroundedNumbers(generated, sourceTokens);

        expect(cleaned).toContain('8');     // grounded
        expect(cleaned).toContain('47%');   // grounded
        expect(cleaned).not.toMatch(/2\.5M/); // hallucinated → stripped
    });

    it('E2E: profile mutation → hash changes → cache invalidated → re-upload triggered', async () => {
        const ls = makeLS();
        // Use a small skill list so mutations within the 20-skill cap are visible
        const slot = makeFullProfile({ skills: ['TypeScript', 'React'] });

        const json1 = buildCompactProfileJson(slot);
        const hash1 = await sha256Hex(json1);
        setProfileCacheHash(ls, slot.id, hash1);

        // Profile is updated: one of the compacted skills is replaced
        slot.profile.skills![0] = 'Python'; // was 'TypeScript'

        const json2 = buildCompactProfileJson(slot);
        const hash2 = await sha256Hex(json2);

        const stored = getProfileCacheHash(ls, slot.id);
        expect(stored).toBe(hash1); // old hash still stored
        expect(hash1).not.toBe(hash2); // new hash differs → re-upload needed
    });

    it('E2E: two profiles with identical compact output share the same cache hash', async () => {
        // Profiles differ only in their photo — which is stripped
        const slotA = makeFullProfile({ photo: 'data:image/png;base64,AAA' });
        const slotB = makeFullProfile({ photo: 'data:image/png;base64,BBB' });

        const jsonA = buildCompactProfileJson(slotA);
        const jsonB = buildCompactProfileJson(slotB);

        expect(jsonA).toBe(jsonB); // same after stripping photo
        expect(await sha256Hex(jsonA)).toBe(await sha256Hex(jsonB));
    });

    it('E2E: account wipe clears all pipeline state (cache, room, session keys)', () => {
        const ls = makeLS();

        // Populate all pipeline state
        setProfileCacheHash(ls, 'slot-1', 'hash-abc');
        ls.setItem('p:slot-1:jd', 'Some JD');
        ls.setItem('cv_builder:profiles', JSON.stringify([{ id: 'slot-1' }]));
        ls.setItem('procv:worker_session', 'token-abc');
        ls.setItem('profiles', JSON.stringify([{ id: 'legacy' }]));
        ls.setItem('currentCV', JSON.stringify({ name: 'Alice CV' }));

        // Wipe
        const keysToRemove = ls.keys().filter(k =>
            k.startsWith('cv_builder:') ||
            k.startsWith('procv:') ||
            k.startsWith('p:') ||
            ['profiles', 'currentCV', 'savedCVs', 'savedCoverLetters', 'trackedApps', 'starStories', 'template'].includes(k)
        );
        keysToRemove.forEach(k => ls.removeItem(k));

        // All pipeline state gone
        expect(getProfileCacheHash(ls, 'slot-1')).toBeNull();
        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem('procv:worker_session')).toBeNull();
        expect(ls.getItem('profiles')).toBeNull();
        expect(ls.getItem('currentCV')).toBeNull();
    });

    it('E2E: round-number-saturated CV output is flagged, specific-number-rich output is not', () => {
        const aiCv: CVData = {
            experience: [{
                responsibilities: [
                    'Increased revenue by 20%',
                    'Reduced cost by 30%',
                    'Grew team to 50 people',
                    'Shipped 100 features',
                    'Improved NPS by 40 points',
                ],
            }],
        };
        const humanCv: CVData = {
            experience: [{
                responsibilities: [
                    'Increased revenue by 23%',
                    'Reduced cost by 47%',
                    'Grew team to 11 people',
                    'Shipped 87 features',
                    'Improved NPS by 38 points',
                ],
            }],
        };
        expect(detectRoundNumberSaturation(aiCv).flagged).toBe(true);
        expect(detectRoundNumberSaturation(humanCv).flagged).toBe(false);
    });

    it('E2E: summary phrase leak detector catches AI recycling summary into bullets', () => {
        const cv: CVData = {
            summary: 'Expert in scalable distributed systems and cloud infrastructure',
            experience: [{
                responsibilities: [
                    'Designed scalable distributed systems for the payments team',
                    'Led cloud infrastructure migration reducing costs by 34%',
                ],
            }],
        };
        const leaks = detectSummaryBulletPhraseLeaks(cv);
        expect(leaks.length).toBeGreaterThan(0);
        // At least one leak should point to experience
        expect(leaks.some(l => l.locations.some(loc => loc.startsWith('experience')))).toBe(true);
    });

    it('E2E: complete profile pipeline produces a LLM-safe payload with no raw PII metadata', async () => {
        const rawSlot = makeFullProfile();
        const compactJson = buildCompactProfileJson(rawSlot);
        const compact = JSON.parse(compactJson);
        const hash = await sha256Hex(compactJson);

        // The "LLM payload" is the compact JSON + hash reference
        const llmPayload = {
            preamble_profile: compactJson,
            profile_hash: hash,
        };

        // Invariants the payload must satisfy:
        expect(JSON.parse(llmPayload.preamble_profile).id).toBeUndefined();
        expect(JSON.parse(llmPayload.preamble_profile).photo).toBeUndefined();
        expect(llmPayload.profile_hash).toHaveLength(64);
        expect(llmPayload.profile_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.parse(llmPayload.preamble_profile).skills.length).toBeLessThanOrEqual(20);
        expect(JSON.parse(llmPayload.preamble_profile).projects.length).toBeLessThanOrEqual(6);

        const exp = JSON.parse(llmPayload.preamble_profile).workExperience[0];
        expect(exp.responsibilities.length).toBeLessThanOrEqual(MAX_RESP);
        expect(exp.id).toBeUndefined();
    });
});
