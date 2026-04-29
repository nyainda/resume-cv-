/**
 * CV Prompt Helpers — Phase A of the simplified architecture.
 *
 * Pure-JS helpers that augment the existing Groq main-generation prompt with:
 *   1. LOCKED REAL VALUES — explicit "use exactly these numbers, never invent"
 *      table built from the user's profile.  Eliminates the 800K → 8M class
 *      of bug at the source.
 *   2. FIELD-AWARE GOOD EXAMPLES — 3-5 reference bullets per field that
 *      anchor Groq's tone.  Numbers in examples are PLACEHOLDERS ({N},
 *      {REVENUE}) so Groq cannot accidentally copy them into the user's CV.
 *   3. BAD EXAMPLES — the production bugs we have actually seen, used as
 *      negative anchors in the prompt.
 *   4. fixPronouns() — final safety net that repairs broken pronouns the
 *      banned-phrase substitutor sometimes leaves behind ("'ve developed"
 *      → "I've developed").
 *
 * No new LLM calls.  No KV reads.  No worker dependency.  Drop-in.
 */

import type { UserProfile } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. FIELD DETECTION — ranked keyword match against JD + profile signals.
// ─────────────────────────────────────────────────────────────────────────────
export type CVField =
    | 'irrigation'
    | 'drought_management'
    | 'tech'
    | 'ngo'
    | 'government'
    | 'sales'
    | 'finance'
    | 'healthcare'
    | 'education'
    | 'general';

const FIELD_KEYWORDS: Record<Exclude<CVField, 'general'>, string[]> = {
    irrigation: ['irrigation', 'drip', 'water resource', 'biosystems', 'agricultural engineering', 'farm equipment', 'sprinkler'],
    drought_management: ['drought', 'early warning', 'food security', 'famine', 'climate resilience', 'ndma', 'fewsnet'],
    tech: ['software', 'developer', 'backend', 'frontend', 'full-stack', 'devops', 'data engineer', 'machine learning', 'react', 'node', 'python', 'java', 'cloud', 'kubernetes'],
    ngo: ['ngo', 'community', 'humanitarian', 'donor', 'beneficiar', 'grassroots', 'civil society', 'non-profit', 'charity'],
    government: ['government', 'county', 'public sector', 'ministry', 'authority', 'policy', 'regulator', 'civil service'],
    sales: ['sales', 'revenue', 'business development', 'account manager', 'quota', 'pipeline', 'b2b', 'territory', 'commercial'],
    finance: ['finance', 'accounting', 'audit', 'tax', 'banking', 'investment', 'cfa', 'cpa', 'treasury', 'risk'],
    healthcare: ['healthcare', 'clinical', 'patient', 'hospital', 'nursing', 'pharmacy', 'medical', 'public health'],
    education: ['teacher', 'lecturer', 'curriculum', 'pedagog', 'school', 'tutor', 'student outcomes', 'classroom'],
};

export function detectField(jd: string | undefined, profile?: UserProfile): CVField {
    const corpus = [
        jd || '',
        ...(profile?.workExperience || []).map(e => `${e.jobTitle || ''} ${e.company || ''} ${e.responsibilities || ''}`),
    ].join(' ').toLowerCase();

    let best: { field: CVField; score: number } = { field: 'general', score: 0 };
    for (const [field, kws] of Object.entries(FIELD_KEYWORDS) as Array<[Exclude<CVField, 'general'>, string[]]>) {
        let score = 0;
        for (const kw of kws) {
            if (corpus.includes(kw)) score += 1;
        }
        if (score > best.score) best = { field, score };
    }
    return best.score > 0 ? best.field : 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOCKED VALUES — pull every real number / proper noun out of the profile
//    so the prompt can tell Groq exactly what may be used.
// ─────────────────────────────────────────────────────────────────────────────
export interface LockedValues {
    /** Every concrete number the user already wrote, with its surrounding
     *  context.  Used to tell Groq "if you cite a number it must be one of
     *  these — do not invent any others". */
    concreteNumbers: Array<{ value: string; context: string }>;
    /** Real institutions / organizations the user named.  Used to forbid
     *  invented company names like "McKinsey" sneaking into the summary. */
    realOrganizations: string[];
    /** Real degree names exactly as the user wrote them. */
    realDegrees: string[];
    /** Years experience computed deterministically. */
    yearsExperience: number;
    /** Current role title (most recent). */
    currentRole: string | null;
}

const NUMBER_RX = /\b\d[\d,]*(?:\.\d+)?(?:\s*%|\s*(?:m|million|k|thousand|bn|billion))?\b/gi;
const CURRENCY_RX = /\b(?:USD|EUR|GBP|KES|KSH|NGN|ZAR|GHS|UGX|TZS|RWF|XOF|XAF|JPY|CNY|INR|AUD|CAD|AED)\s*[\d,]+(?:\.\d+)?(?:\s*(?:m|million|k|thousand|bn|billion))?/gi;
const SYMBOL_CURRENCY_RX = /[$€£₦₹¥]\s*[\d,]+(?:\.\d+)?(?:\s*(?:m|million|k|thousand|bn|billion))?/gi;

function extractNumbersFromText(text: string, sourceLabel: string): Array<{ value: string; context: string }> {
    if (!text || typeof text !== 'string') return [];
    const out: Array<{ value: string; context: string }> = [];
    const seen = new Set<string>();

    const push = (val: string) => {
        const norm = val.trim().toLowerCase();
        if (!norm || seen.has(norm)) return;
        seen.add(norm);
        // Pull a short context snippet (±25 chars) for the model to anchor on.
        const idx = text.toLowerCase().indexOf(norm);
        const ctx = idx >= 0
            ? text.slice(Math.max(0, idx - 25), Math.min(text.length, idx + val.length + 25)).replace(/\s+/g, ' ').trim()
            : sourceLabel;
        out.push({ value: val.trim(), context: ctx });
    };

    for (const m of text.matchAll(CURRENCY_RX)) push(m[0]);
    for (const m of text.matchAll(SYMBOL_CURRENCY_RX)) push(m[0]);
    for (const m of text.matchAll(NUMBER_RX)) {
        const v = m[0].trim();
        // Skip pure 4-digit years and tiny ordinals — they are noise.
        if (/^\d{4}$/.test(v) && parseInt(v, 10) > 1900 && parseInt(v, 10) < 2100) continue;
        if (/^[1-9]$/.test(v)) continue;
        push(v);
    }
    return out;
}

export function lockRealNumbers(profile: UserProfile): LockedValues {
    const numbers: Array<{ value: string; context: string }> = [];

    // Pull from every responsibility blob across every role.
    // (UserProfile.workExperience.responsibilities is a single string in this
    //  schema — splitting on newlines lets us still attribute context.)
    for (const role of profile.workExperience || []) {
        const label = `${role.jobTitle || 'role'} @ ${role.company || ''}`;
        const blob = typeof role.responsibilities === 'string' ? role.responsibilities : '';
        if (blob) numbers.push(...extractNumbersFromText(blob, label));
    }
    // Pull from project descriptions.
    for (const p of profile.projects || []) {
        numbers.push(...extractNumbersFromText(p.description || '', `project: ${p.name || ''}`));
    }
    // Education in this schema has no description field — degree + school +
    // graduationYear only — no free-text numbers to extract.

    // De-dupe by value.
    const seen = new Set<string>();
    const concreteNumbers = numbers.filter(n => {
        const k = n.value.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    const realOrganizations = Array.from(new Set([
        ...(profile.workExperience || []).map(e => e.company).filter(Boolean) as string[],
        ...(profile.education || []).map(e => e.school).filter(Boolean) as string[],
        ...(profile.projects || []).map(p => p.name).filter(Boolean) as string[],
    ]));

    const realDegrees = (profile.education || [])
        .map(e => e.degree)
        .filter(Boolean) as string[];

    // Compute years experience from start/end dates (current = today).
    const now = new Date();
    let totalMonths = 0;
    for (const role of profile.workExperience || []) {
        const start = role.startDate ? new Date(role.startDate) : null;
        const end = role.endDate && !/present|current/i.test(role.endDate) ? new Date(role.endDate) : now;
        if (start && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
            totalMonths += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        }
    }
    const yearsExperience = Math.max(0, Math.round(totalMonths / 12));

    const currentRole = (profile.workExperience || [])
        .find(e => !e.endDate || /present|current/i.test(e.endDate))?.jobTitle || null;

    return { concreteNumbers, realOrganizations, realDegrees, yearsExperience, currentRole };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FIELD-AWARE FEW-SHOT EXAMPLES — placeholder numbers ({N}, {REVENUE}) so
//    Groq imitates the STYLE without copying the data into the user's CV.
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_EXAMPLES: Record<CVField, string[]> = {
    irrigation: [
        'Manages {N} enterprise client accounts across {REGION}, coordinating with a {N}-person field operations team.',
        'Designed drip irrigation systems for {N} smallholder farms, cutting water usage by roughly {N}%.',
        'First contact for site escalations — resolved {N} pump failures without escalating to management.',
        'Surveyed {N} client sites, producing tailored irrigation designs per soil type and crop pattern.',
    ],
    drought_management: [
        'Collected early-warning data across {N} sub-counties, preparing monthly bulletins for county stakeholders.',
        'Coordinated food-security assessments for {N} communities, feeding county drought response planning.',
        'Monitored drought conditions across {N} counties, recommending interventions reaching {N} households.',
        'Disseminated bulletins to {N} government and NGO stakeholders — zero delayed reports across {N} months.',
    ],
    tech: [
        'Built a {STACK} dashboard for {USE_CASE}, reducing reporting time from {N} days to {N} hours.',
        'Shipped {N} API features that cut response time by roughly {N}% for {N}+ daily users.',
        'Debugged the legacy authentication system — login failures dropped to near zero within a week.',
        'Sole engineer on the v{N} rewrite — delivered on time with zero rework after handover.',
    ],
    ngo: [
        'Coordinated drought-response programmes reaching {N} households across {N} counties.',
        'Trained {N} community health workers on early-warning systems across {COUNTY} County.',
        'Facilitated quarterly stakeholder forums with county officials — zero duplication of effort.',
        'Mobilised {N} NGO partners for joint response — delivered within {N} weeks of activation.',
    ],
    government: [
        'Implemented county drought-response policy across {N} sub-counties, covering {N} vulnerable households.',
        'Prepared and disseminated monthly bulletins to {N} county-government departments.',
        'Coordinated {N} government and NGO stakeholders — zero missed reporting deadlines.',
        'Monitored compliance with water-use regulations across {N} schemes, flagging {N} violations.',
    ],
    sales: [
        'Generated {REVENUE} in {PRODUCT} revenue across {REGION} in {YEAR}.',
        'Managed {N} enterprise accounts, exceeding monthly targets consistently over {N} months.',
        'Converted {N} of {N} site assessments into full installations — {N}% close rate.',
        'Built long-term relationships with {N} key accounts — roughly {N}% of revenue from repeat business.',
    ],
    finance: [
        'Reconciled {N} monthly statements covering {REVENUE} in transactions — zero post-close adjustments.',
        'Led the {YEAR} statutory audit for a {REVENUE} portfolio — closed with no management letter points.',
        'Built a forecasting model that improved cash-flow accuracy by roughly {N}% across {N} business units.',
        'Owned month-end close for {N} entities — cut close time from {N} days to {N} days.',
    ],
    healthcare: [
        'Triaged {N}+ outpatient cases per shift across {N} clinical pathways.',
        'Reduced average patient wait time by roughly {N}% by reorganising the morning intake workflow.',
        'Co-led an audit of {N} discharge files — flagged {N} documentation gaps and closed each within a week.',
        'Trained {N} new staff on the {SYSTEM} clinical-records system — zero compliance findings in the next quarter.',
    ],
    education: [
        'Taught {SUBJECT} to {N} students across {N} year groups — average grade improved by roughly {N}%.',
        'Designed a new {TOPIC} module adopted by the department for the {YEAR} cohort.',
        'Mentored {N} teaching assistants through their first semester — all retained for the following year.',
        'Coordinated parent-engagement evenings reaching {N}+ families — attendance up roughly {N}% year on year.',
    ],
    general: [
        'Managed a portfolio of {N} accounts across {N} regions, maintaining consistent delivery standards.',
        'Reduced process inefficiencies by roughly {N}%, saving the team approximately {N} hours per week.',
        'Led a {N}-person team across {N} regions — zero missed deadlines across all projects.',
        'First contact for client escalations — resolved {N} critical issues without escalating to management.',
    ],
};

const SUMMARY_GOOD_EXAMPLES: string[] = [
    'Biosystems engineer with {N} years in irrigation design and drought risk management across {REGION}. Managed {N} enterprise accounts generating {REVENUE} annually through strategic sales and technical support. Looking for a role where field experience and data-driven thinking actually matter.',
    'Software engineer with {N} years building full-stack web applications using {STACK}. Shipped production features used by {N}+ users, cutting system response time by roughly {N}%. Looking for a role where technical depth and product thinking are both valued.',
    'Sales engineer with {N} years generating {REVENUE} in equipment revenue across {REGION}. Managed {N} enterprise accounts while providing technical support and field surveys to close deals. Looking for a role where technical knowledge and commercial instinct work together.',
];

const SUMMARY_BAD_EXAMPLES: Array<{ text: string; issue: string }> = [
    { text: '"As a Field & Sales Engineer delivering water and energy solutions..."', issue: 'LLM opener — the summary MUST start with the job title or years of experience, NEVER with "As a", "As an", "A", "An", or "I". Drop "As a" and start directly: "Field & Sales Engineer with 2+ years…"' },
    { text: '"Bringing expertise to a management consulting team driving agricultural transformations."', issue: 'cover-letter tailoring artifact — the summary is role-agnostic; never address the target employer or team in it. Move this sentence to the cover letter.' },
    { text: '"2 years as Field & Sales Engineer accomplished KES 8,000,000 in revenue..."', issue: 'wrong number — added an extra zero (was 800,000)' },
    { text: '"Looking to join a team like McKinsey to drive solutions..."', issue: 'invented company name — never name companies that are not in the profile' },
    { text: '"Currently pursuing a Bachelor\'s degree in Agricultural Engineering..."', issue: 'wrong: candidate already graduated, and the degree name is also wrong' },
    { text: '"\'ve developed a strong foundation in data analysis..."', issue: 'broken pronoun — missing "I" before "\'ve"' },
    { text: '"goal is to work with stakeholders to develop early warning systems..."', issue: 'broken pronoun — missing "My" before "goal"' },
    { text: '"Generate KES ,000 in revenue"', issue: 'broken metric — placeholder digit was not filled in' },
    { text: '"exceeding monthly targets by %"', issue: 'broken metric — bare percent with no number' },
    { text: '"coordinating with a -person field operations team"', issue: 'broken metric — missing number before unit' },
    { text: '"Cascaded sales of Water Solutions across key projects"', issue: 'corporate-speak — does not describe what was actually done' },
    { text: '"Critiqued rigorous testing protocols"', issue: 'wrong verb — picks an obscure synonym instead of "Conducted" or "Performed"' },
];

export function getFieldExamples(field: CVField): string[] {
    return FIELD_EXAMPLES[field] || FIELD_EXAMPLES.general;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANCHOR BLOCK — the full text injected into the existing main prompt.
// ─────────────────────────────────────────────────────────────────────────────
export function buildPromptAnchorBlock(opts: {
    locked: LockedValues;
    field: CVField;
}): string {
    const { locked, field } = opts;
    const examples = getFieldExamples(field);

    const numbersBlock = locked.concreteNumbers.length > 0
        ? locked.concreteNumbers.slice(0, 30).map(n => `   - "${n.value}"  (from: ${n.context})`).join('\n')
        : '   - (the profile contains no concrete numbers — use qualitative language instead, never invent figures)';

    const orgsBlock = locked.realOrganizations.length > 0
        ? locked.realOrganizations.slice(0, 20).map(o => `"${o}"`).join(', ')
        : '(none provided)';

    const degreesBlock = locked.realDegrees.length > 0
        ? locked.realDegrees.map(d => `"${d}"`).join(', ')
        : '(none provided)';

    return `
=== LOCKED REAL VALUES — COPY EXACTLY, NEVER INVENT ===

NUMBERS — the ONLY numeric figures you may use in this CV are these.
If a bullet would benefit from a metric you don't see in this list,
write it qualitatively instead ("a substantial portion", "the bulk of",
"most of") — never invent a number, never round one up, never add zeros.
${numbersBlock}

ORGANIZATIONS — only use these names. Never invent companies, never
mention recognisable brands ("McKinsey", "Google", "MIT") that are not
in this list:
   ${orgsBlock}

DEGREES — copy character-for-character. Do NOT translate, paraphrase,
swap "Biosystems" for "Agricultural", or invent a department name:
   ${degreesBlock}

YEARS EXPERIENCE — computed from the actual employment dates: ${locked.yearsExperience}
${locked.currentRole ? `CURRENT ROLE — ${locked.currentRole}` : ''}

=== STYLE ANCHOR — GOOD BULLET EXAMPLES (${field.replace('_', ' ')}) ===
These show TONE only. Tokens in {CURLY_BRACES} are placeholders — they
illustrate where a number / region / stack would go. NEVER copy a
placeholder or a number from these examples into the user's CV.
${examples.map(e => `   ✅ ${e}`).join('\n')}

=== SUMMARY STYLE ANCHOR — GOOD ===
${SUMMARY_GOOD_EXAMPLES.map(e => `   ✅ "${e}"`).join('\n')}

=== BAD EXAMPLES — never produce output that looks like these ===
${SUMMARY_BAD_EXAMPLES.map(b => `   ❌ ${b.text}\n      └─ ${b.issue}`).join('\n')}

=== SUMMARY OPENER RULE (CRITICAL) ===
The professional summary's first word MUST be either:
  a) The candidate's job title: "Field & Sales Engineer with 2+ years…"
  b) Their years of experience: "2+ years delivering water and energy solutions…"
NEVER start with "As a", "As an", "A", "An", "I", or "I'm".
NEVER end the summary with a sentence that addresses the employer or names the target role/company.
That belongs in a cover letter — the summary is role-agnostic.

=== WORD REPETITION RULE ===
Within a single role's bullets, no non-generic word may appear more than twice.
Replace the 3rd+ occurrence with a synonym or a more specific noun.
Example: "stakeholder" used 3 times in the same role → replace 2 of the 3 with
"clients", "farm owners", "project sponsors", or another concrete noun.

=== PRONOUN INTEGRITY (CRITICAL) ===
- Every contraction must keep its pronoun: write "I've", "I'm", "I'll" — never bare "'ve", "'m", "'ll".
- Possessives must keep their pronoun: write "My goal", "My aim" — never bare "goal is" / "aim is" at the start of a clause.
- These rules apply in summary, bullets, and project descriptions alike.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST-PROCESSING — fix dropped pronouns the substitutor sometimes leaves.
//    Pure regex, idempotent, safe to run on any field.
// ─────────────────────────────────────────────────────────────────────────────
export function fixPronouns(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    // Bare "'ve" / "'m" / "'ll" / "'d" at start-of-token (no letter before) → prepend "I".
    out = out.replace(/(^|[\s(\[{>"'`])'(ve|m|ll|d)\b/g, "$1I'$2");
    // "goal is/was" / "aim is/was" / "plan is/was" at start of a clause → "My ___ is/was".
    // ANCHORED to start-of-text or end-of-sentence punctuation ONLY — never to bare
    // whitespace, otherwise mid-sentence "the goal was clear" would mangle to
    // "theMy goal was clear" (real safety bug exposed by the Apr 29 2026 audit). The
    // earlier wider variant `[\s(\[{>"'\`]` had this latent bug; tightening here also
    // covers the past-tense form ("Goal was X" → "My goal was X") that was missing.
    out = out.replace(
        /(^|[.!?]\s+)(goal|aim|plan|hope|intent)\s+(is|was)\b/gi,
        (_m, p1, w, v) => `${p1}My ${w.toLowerCase()} ${v.toLowerCase()}`,
    );
    // "Am a / Am an / Am the" at start of a clause → "I am a / I am an / I am the".
    // Same root cause: stripFirstPerson drops the leading "I" from "I am the lead engineer"
    // and leaves a dangling "Am the lead engineer". Restore the "I". Added Apr 29 2026.
    // Same start-anchored discipline so we don't wreck names like "Sam an analyst".
    out = out.replace(
        /(^|[.!?]\s+)Am\s+(an?|the)\b/g,
        (_m, p1, det) => `${p1}I am ${det}`,
    );
    // Collapse double spaces from substitutions.
    out = out.replace(/[ \t]{2,}/g, ' ');
    return out;
}

/** Apply fixPronouns to every text field in a CV in one shot. */
export function fixPronounsInCV<T extends {
    summary?: string;
    experience?: Array<{ responsibilities?: string[] }>;
    projects?: Array<{ description?: string }>;
    education?: Array<{ description?: string }>;
}>(cv: T): T {
    const out: T = { ...cv };
    if (typeof out.summary === 'string') out.summary = fixPronouns(out.summary);
    if (Array.isArray(out.experience)) {
        out.experience = out.experience.map(role => ({
            ...role,
            responsibilities: (role.responsibilities || []).map(fixPronouns),
        })) as T['experience'];
    }
    if (Array.isArray(out.projects)) {
        out.projects = out.projects.map(p => ({ ...p, description: fixPronouns(p.description || '') })) as T['projects'];
    }
    if (Array.isArray(out.education)) {
        out.education = out.education.map(e => ({ ...e, description: fixPronouns(e.description || '') })) as T['education'];
    }
    return out;
}
