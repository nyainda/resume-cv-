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
    | 'data_analytics'
    // ── Tech specialisations ───────────────────────────────────────────────
    | 'frontend_web'
    | 'backend_eng'
    | 'fullstack_eng'
    | 'mobile_eng'
    | 'ml_ai_eng'
    | 'devops_infra'
    | 'security_eng'
    | 'qa_eng'
    // ── Civil ─────────────────────────────────────────────────────────────
    | 'civil_engineering'
    | 'construction'
    | 'architecture'
    | 'manufacturing'
    | 'logistics'
    | 'ngo'
    | 'government'
    | 'sales'
    | 'marketing'
    | 'finance'
    | 'legal'
    | 'healthcare'
    | 'education'
    | 'hr'
    | 'consulting'
    | 'operations'
    | 'product_mgmt'
    | 'hospitality'
    | 'media'
    | 'general';

// ─── Title-to-field direct map ────────────────────────────────────────────────
// Checked BEFORE the keyword scorer. Each pattern is a job-title substring
// (case-insensitive). When a profile job title matches, that field gets a
// bonus score — 10× when no JD, 2× when a JD is present.
//
// This is especially valuable for thin JDs (LinkedIn posts, short emails) where
// the body text is sparse. We also apply this map to the FIRST LINE of a thin
// JD (<200 chars) so "Graduate Structural Engineer" in a post body gets the
// same signal as if it were in the profile.
const TITLE_FIELD_MAP: Array<[RegExp, Exclude<CVField, 'general'>]> = [
    // Irrigation / Biosystems
    [/\b(irrigation|biosystem|agricultural engineer|agr[io]|hydrol|water resource|drip system|sprinkler|farm engineer|agronomist|agro-processing|water supply|borehole|dam|wetland)\b/i, 'irrigation'],
    // Drought / Food security
    [/\b(drought|early.?warning|food securi|famine|ndma|fewsnet|climate resilien|food system|resilience officer|livelihood|nutrition officer)\b/i, 'drought_management'],
    // Civil Engineering — many title variants
    [/\b(civil engineer|structural engineer|site engineer|geotechni|quantity surveyor|\bQS\b|road engineer|highway engineer|bridge engineer|drainage engineer|infrastructure engineer|resident engineer|clerk of works|water engineer|environmental engineer|transport engineer|graduate engineer)\b/i, 'civil_engineering'],
    // Construction
    [/\b(construction manager|site manager|contracts? manager|building contractor|MEP engineer|construction supervisor|foreman|site supervisor|project engineer.*construction|construction director|building manager|clerk of works)\b/i, 'construction'],
    // Architecture
    [/\b(architect|architectural designer|urban plann|landscape architect|interior design|BIM coordinator|revit specialist|spatial design|urban design|master plann)\b/i, 'architecture'],
    // Manufacturing
    [/\b(production engineer|manufacturing engineer|process engineer|plant engineer|quality engineer|\bQC engineer\b|lean engineer|factory manager|production manager|tooling engineer|manufacturing technician|industrial engineer|plant manager|assembly)\b/i, 'manufacturing'],
    // Logistics / Supply chain
    [/\b(logistics|supply chain|procurement officer|warehouse manager|inventory manager|fleet manager|freight|shipping|customs|distribution|fulfilment|buyer|category manager|demand planner|operations coordinator.*logistics|clearing agent)\b/i, 'logistics'],
    // Tech / Software
    [/\b(software engineer|software developer|backend developer|frontend developer|full.?stack developer|devops engineer|cloud engineer|site reliability|\bSRE\b|mobile developer|android developer|ios developer|firmware engineer|embedded engineer|web developer|systems engineer|platform engineer|infrastructure engineer.*tech)\b/i, 'tech'],
    // Data / Analytics / ML
    [/\b(data analyst|data scientist|business analyst|BI developer|BI analyst|tableau developer|power bi developer|data engineer|analytics engineer|ML engineer|machine learning engineer|data architect|research analyst|quantitative analyst|data manager|reporting analyst)\b/i, 'data_analytics'],
    // Sales / Business development
    [/\b(sales engineer|account manager|account executive|business development|sales rep|sales manager|commercial manager|key account manager|territory manager|\bBDR\b|\bSDR\b|inside sales|outside sales|sales consultant|sales director|pre-sales|channel manager)\b/i, 'sales'],
    // Marketing / Brand
    [/\b(marketing manager|brand manager|marketing executive|digital marketing|content manager|SEO specialist|growth marketer|social media manager|communications manager|PR specialist|campaign manager|marketing analyst|marketing officer|brand strategist)\b/i, 'marketing'],
    // Finance / Accounting
    [/\b(accountant|financial analyst|finance manager|auditor|treasury|investment analyst|credit analyst|tax consultant|financial controller|\bCFO\b|risk analyst|fund manager|portfolio manager|\bCPA\b|\bCFA\b|\bACCA\b|finance officer|budget analyst|financial advisor)\b/i, 'finance'],
    // Legal
    [/\b(lawyer|attorney|advocate|barrister|solicitor|legal officer|legal counsel|paralegal|compliance officer|regulatory affairs|IP specialist|corporate counsel|litigation|legal advisor|company secretary|legal associate)\b/i, 'legal'],
    // Consulting
    [/\b(management consultant|strategy analyst|transformation lead|change management|engagement manager|consulting manager|advisory|business consultant|strategy consultant|programme manager|program manager)\b/i, 'consulting'],
    // Operations
    [/\b(operations manager|operations analyst|process analyst|business operations|operations director|\bCOO\b|operational excellence|business process|operations coordinator|performance manager|continuous improvement)\b/i, 'operations'],
    // HR / People
    [/\b(\bHR\b|human resources|talent acquisition|recruiter|recruitment consultant|HR manager|HR business partner|\bHRBP\b|\bL&D\b|learning and development|people operations|compensation.*benefits|payroll|employer branding|HR officer|talent manager|people manager)\b/i, 'hr'],
    // NGO / Humanitarian / Development
    [/\b(\bNGO\b|humanitarian|community development|programme officer|project officer|field officer|community officer|\bWASH\b|development worker|relief|social worker|community worker|grassroots|non-profit|charity|beneficiar)\b/i, 'ngo'],
    // Government / Public sector
    [/\b(county government|public sector|ministry|parastatal|state corporation|public administration|policy analyst|policy officer|regulatory officer|county officer|civil servant|government officer)\b/i, 'government'],
    // Healthcare / Clinical
    [/\b(\bdoctor\b|physician|nurse|pharmacist|clinical officer|public health|epidemiologist|lab technician|radiographer|dentist|surgeon|healthcare worker|medical officer|community health|disease surveillance|health officer|clinical|medical doctor)\b/i, 'healthcare'],
    // Education / Training
    [/\b(teacher|lecturer|tutor|professor|curriculum developer|education officer|instructor|school principal|training officer|trainer|facilitator|pedagog|academic|teaching assistant|education coordinator)\b/i, 'education'],
    // Hospitality / Tourism
    [/\b(hotel manager|front office manager|housekeeping|food and beverage|F&B manager|events coordinator|concierge|restaurant manager|guest relations|hospitality manager|tourism officer|hotel supervisor|catering)\b/i, 'hospitality'],
    // Media / Communications
    [/\b(journalist|broadcaster|editor|photographer|videographer|content creator|media officer|communications officer|radio presenter|film producer|documentary|video editor|publishing|copywriter|media manager|PR officer)\b/i, 'media'],
];

const FIELD_KEYWORDS: Record<Exclude<CVField, 'general'>, string[]> = {
    // ── Engineering & Built Environment ────────────────────────────────────────
    irrigation:         ['irrigation', 'drip', 'water resource', 'biosystems', 'agricultural engineering', 'farm equipment', 'sprinkler', 'hydrology'],
    drought_management: ['drought', 'early warning', 'food security', 'famine', 'climate resilience', 'ndma', 'fewsnet'],
    civil_engineering:  ['civil engineer', 'structural engineer', 'structural design', 'reinforced concrete', 'geotechnical', 'surveying', 'road design', 'infrastructure', 'construction supervision', 'site engineer', 'quantity surveyor', 'highway', 'bridge', 'retaining wall', 'drainage', 'foundation design', 'autocad', 'staad', 'etabs'],
    construction:       ['construction', 'site management', 'contractor', 'subcontractor', 'project site', 'bill of quantities', 'bq', 'nec', 'fidic', 'building works', 'mep', 'mechanical electrical'],
    architecture:       ['architect', 'architectural design', 'urban planning', 'master plan', 'bim', 'revit', 'building information', 'planning permission', 'landscape', 'facade'],
    manufacturing:      ['manufacturing', 'production', 'assembly', 'quality control', 'qc', 'lean', 'six sigma', 'kaizen', 'factory', 'plant', 'tooling', 'machining', 'process engineer'],
    logistics:          ['logistics', 'supply chain', 'procurement', 'warehouse', 'inventory', 'fleet', 'freight', 'shipping', 'customs', 'distribution', 'last mile', 'fulfilment'],
    // ── Technology & Data ───────────────────────────────────────────────────────
    tech:               ['software engineer', 'software developer', 'backend', 'frontend', 'full-stack', 'devops', 'react', 'node.js', 'kubernetes', 'cloud engineer', 'site reliability', 'api development', 'microservices', 'firmware', 'mobile developer'],
    data_analytics:     ['data analyst', 'data scientist', 'business intelligence', 'bi developer', 'tableau', 'power bi', 'looker', 'data pipeline', 'data warehouse', 'etl', 'sql analyst', 'machine learning engineer', 'nlp', 'deep learning', 'data engineering', 'analytics engineer'],
    // ── Business & Commercial ──────────────────────────────────────────────────
    sales:              ['sales', 'business development', 'account manager', 'quota', 'pipeline', 'b2b', 'territory', 'commercial', 'key account', 'client acquisition'],
    marketing:          ['marketing', 'brand', 'campaign', 'digital marketing', 'seo', 'sem', 'social media', 'content strategy', 'growth hacking', 'market research', 'copywriting', 'advertising', 'pr'],
    finance:            ['finance', 'accounting', 'audit', 'tax', 'banking', 'investment', 'cfa', 'cpa', 'treasury', 'financial modelling', 'valuation', 'risk management', 'credit', 'capital markets'],
    consulting:         ['consultant', 'consulting', 'advisory', 'strategy', 'management consulting', 'transformation', 'business case', 'stakeholder management', 'change management', 'due diligence'],
    operations:         ['operations', 'process improvement', 'operational excellence', 'kpi', 'performance management', 'continuous improvement', 'sop', 'business operations'],
    // ── Professional Services ──────────────────────────────────────────────────
    legal:              ['legal', 'lawyer', 'attorney', 'advocate', 'barrister', 'solicitor', 'litigation', 'contract law', 'compliance', 'regulatory', 'intellectual property', 'corporate law'],
    hr:                 ['human resources', 'hr', 'talent acquisition', 'recruitment', 'employer branding', 'payroll', 'hris', 'labour relations', 'learning and development', 'l&d', 'compensation and benefits'],
    // ── Public & Social ───────────────────────────────────────────────────────
    ngo:                ['ngo', 'community development', 'humanitarian', 'donor', 'beneficiar', 'grassroots', 'civil society', 'non-profit', 'charity', 'development programme'],
    government:         ['government', 'county government', 'public sector', 'ministry', 'authority', 'policy', 'regulator', 'civil service', 'parastatal', 'state corporation'],
    // ── Other Sectors ─────────────────────────────────────────────────────────
    healthcare:         ['healthcare', 'clinical', 'patient', 'hospital', 'nursing', 'pharmacy', 'medical doctor', 'public health', 'epidemiology', 'disease surveillance'],
    education:          ['teacher', 'lecturer', 'curriculum', 'pedagog', 'school', 'tutor', 'student outcomes', 'classroom', 'academic research', 'higher education'],
    hospitality:        ['hotel', 'hospitality', 'tourism', 'housekeeping', 'front office', 'food and beverage', 'events management', 'concierge', 'restaurant'],
    media:              ['journalism', 'broadcast', 'film', 'photography', 'media production', 'content creator', 'video editing', 'publishing', 'editorial', 'radio'],
};

export function detectField(jd: string | undefined, profile?: UserProfile): CVField {
    // S6: If the user explicitly chose a field via the ontology dropdown, honour
    // it directly — skip all keyword scoring. This is the primary fix for the
    // "keyword mismatch on thin JDs" problem described in the engineering audit.
    if (profile?.preferredField) {
        const pf = profile.preferredField as CVField;
        // Validate it's a known leaf (guards against stale localStorage values)
        const VALID_FIELDS: CVField[] = [
            'irrigation','drought_management','tech','data_analytics','civil_engineering',
            'construction','architecture','manufacturing','logistics','ngo','government',
            'sales','marketing','finance','legal','healthcare','education','hr',
            'consulting','operations','hospitality','media','general',
        ];
        if (VALID_FIELDS.includes(pf)) return pf;
    }

    const jdRaw  = jd || '';
    const jdCorpus = jdRaw.toLowerCase();
    const jdPresent = jdCorpus.trim().length > 50;

    // "Thin JD" — a LinkedIn post or short email with almost no body text
    // (< 200 chars, like "Graduate Structural Engineer — EBK-registrable, civil
    // engineering degree required"). Extract the first non-blank line and treat
    // it as a title signal.
    const jdThin = jdRaw.trim().length > 0 && jdRaw.trim().length < 200;
    const jdFirstLine = jdThin
        ? jdRaw.trim().split(/\r?\n/).find(l => l.trim().length > 3) ?? ''
        : '';

    // Build profile corpora — job titles are kept separate because they carry
    // the strongest semantic signal and get elevated weight when no JD is present.
    const profileTitles = (profile?.workExperience || [])
        .map(e => (e.jobTitle || '').toLowerCase())
        .join(' ');
    const profileBody = [
        ...(profile?.workExperience || []).map(e =>
            `${e.company || ''} ${e.responsibilities || ''}`),
        ...(Array.isArray((profile as any)?.skills) ? (profile as any).skills : []),
    ].join(' ').toLowerCase();

    // Score accumulator keyed by field.
    const scores: Record<string, number> = {};
    const add = (field: string, pts: number) => { scores[field] = (scores[field] ?? 0) + pts; };

    // ── Pass 1: TITLE_FIELD_MAP (direct substring match on job titles) ─────────
    // When no JD: profile titles get 10× boost — they ARE the field signal.
    // When JD thin: profile titles 8×, JD first-line 6×.
    // When JD rich: profile titles 2× (tiebreaker only), JD keyword scoring dominates.
    const titleBoost = !jdPresent ? 10 : jdThin ? 8 : 2;
    for (const [rx, field] of TITLE_FIELD_MAP) {
        if (rx.test(profileTitles)) add(field, titleBoost);
        if (jdThin && rx.test(jdFirstLine)) add(field, 6);
        else if (jdPresent && rx.test(jdCorpus)) add(field, 2);
    }

    // ── Pass 2: keyword scorer (FIELD_KEYWORDS) ───────────────────────────────
    // JD body 3× · profile body (skills/responsibilities) 1×.
    for (const [field, kws] of Object.entries(FIELD_KEYWORDS) as Array<[Exclude<CVField, 'general'>, string[]]>) {
        for (const kw of kws) {
            if (jdPresent && jdCorpus.includes(kw)) add(field, 3);
            if (profileBody.includes(kw)) add(field, 1);
        }
    }

    // Pick the highest-scoring field.
    let best: { field: CVField; score: number } = { field: 'general', score: 0 };
    for (const [field, score] of Object.entries(scores)) {
        if (score > best.score) best = { field: field as CVField, score };
    }
    return best.field;
}

export type FieldDetectionSource =
    | { kind: 'user-pinned' }
    | { kind: 'auto-detected'; score: number; evidence: string[] };

/**
 * Same logic as detectField() but also returns *how* the field was chosen:
 * - 'user-pinned'   — user set a preferred field via the S6 ontology dropdown
 * - 'auto-detected' — keyword scoring won; includes the winning score
 *
 * Used by the generation pipeline to record fieldSource in GenerationTrace.
 */
export function detectFieldWithSource(
    jd: string | undefined,
    profile?: UserProfile,
): { field: CVField; source: FieldDetectionSource } {
    const VALID_FIELDS: CVField[] = [
        'irrigation','drought_management','tech','data_analytics','civil_engineering',
        'construction','architecture','manufacturing','logistics','ngo','government',
        'sales','marketing','finance','legal','healthcare','education','hr',
        'consulting','operations','hospitality','media','general',
    ];

    // 1️⃣ User-pinned choice takes highest priority
    if (profile?.preferredField) {
        const pf = profile.preferredField as CVField;
        if (VALID_FIELDS.includes(pf)) {
            return { field: pf, source: { kind: 'user-pinned' } };
        }
    }

    // 2️⃣ Import-time detected field — pre-cached by the zero-token pipeline,
    //    skips keyword scoring entirely (fast path, no re-computation).
    if (profile?.detectedField) {
        const df = profile.detectedField as CVField;
        if (VALID_FIELDS.includes(df)) {
            return { field: df, source: { kind: 'title-match', titles: [profile.detectedField] } };
        }
    }

    // Fall through to auto-detection — re-run the scorer so this function
    // has no hidden dependency on detectField's internal state.
    const field = detectField(jd, profile);

    // Reconstruct the winning score and collect human-readable evidence lines.
    // We re-run a minimal scorer pass here (the scores map is not exported
    // from detectField, so we can't reuse it).
    const jdCorpus = (jd || '').toLowerCase();
    const jdPresent = jdCorpus.trim().length > 50;
    const jdThin = (jd || '').trim().length > 0 && (jd || '').trim().length < 200;
    const jdFirstLine = jdThin
        ? (jd || '').trim().split(/\r?\n/).find(l => l.trim().length > 3) ?? ''
        : '';
    const profileTitles = (profile?.workExperience || [])
        .map(e => (e.jobTitle || '').toLowerCase()).join(' ');
    const profileBody = [
        ...(profile?.workExperience || []).map(e => `${e.company || ''} ${e.responsibilities || ''}`),
        ...(Array.isArray((profile as any)?.skills) ? (profile as any).skills : []),
    ].join(' ').toLowerCase();

    let winScore = 0;
    const evidence: string[] = [];
    const titleBoost = !jdPresent ? 10 : jdThin ? 8 : 2;

    for (const [rx, f] of TITLE_FIELD_MAP) {
        if (f !== field) continue;
        if (rx.test(profileTitles)) {
            winScore += titleBoost;
            // Extract the first profile job title that matched for the label
            const matchedTitle = (profile?.workExperience || [])
                .map(e => e.jobTitle || '')
                .find(t => rx.test(t.toLowerCase()));
            evidence.push(`title: "${matchedTitle ?? 'profile'}" (+${titleBoost})`);
        }
        if (jdThin && rx.test(jdFirstLine.toLowerCase())) {
            winScore += 6;
            evidence.push(`title in JD: "${jdFirstLine.slice(0, 40)}" (+6)`);
        } else if (jdPresent && rx.test(jdCorpus)) {
            winScore += 2;
            evidence.push(`title match in JD (+2)`);
        }
    }

    const fkws = (FIELD_KEYWORDS as Record<string, string[]>)[field] ?? [];
    for (const kw of fkws) {
        if (jdPresent && jdCorpus.includes(kw)) {
            winScore += 3;
            evidence.push(`JD: "${kw}" (+3)`);
        } else if (profileBody.includes(kw)) {
            winScore += 1;
            evidence.push(`profile: "${kw}" (+1)`);
        }
    }

    return { field, source: { kind: 'auto-detected', score: winScore, evidence } };
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
    // ── S3: Confidence-tagged non-numeric claims ────────────────────────────
    /** Certifications/courses/licences the user explicitly listed (user_supplied).
     *  The LLM may only cite credentials that appear in this list. */
    certifications: string[];
    /** Awards, honours, publications, presentations the user explicitly listed
     *  (user_supplied). The LLM may only cite these — never fabricate rankings. */
    awardsAndHonors: string[];
    /** Team sizes, budget figures, management scope extracted verbatim from the
     *  responsibilities text (system_extracted). Used to validate leadership
     *  claims without over-restricting — includes surrounding context. */
    leadershipSignals: Array<{ signal: string; context: string }>;
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

    // ── S3: Confidence-tagged non-numeric claims ────────────────────────────────

    // Certifications, courses, memberships, licences — user_supplied
    const certifications: string[] = [];
    for (const section of profile.customSections || []) {
        if (['certifications', 'courses', 'memberships', 'patents', 'licenses'].includes(section.type)) {
            for (const item of section.items) {
                if (item.title?.trim()) certifications.push(item.title.trim());
            }
        }
    }
    // Also surface certifications stored directly on CVData if this is a profile with them
    if ((profile as unknown as { certifications?: Array<string | {name:string}> }).certifications) {
        const rawCerts = (profile as unknown as { certifications: Array<string | {name:string}> }).certifications;
        for (const c of rawCerts) {
            const name = typeof c === 'string' ? c : c?.name;
            if (name?.trim() && !certifications.includes(name.trim())) certifications.push(name.trim());
        }
    }

    // Awards, honours, publications, presentations — user_supplied
    const awardsAndHonors: string[] = [];
    for (const section of profile.customSections || []) {
        if (['awards', 'achievements', 'publications', 'presentations', 'volunteer'].includes(section.type)) {
            for (const item of section.items) {
                if (item.title?.trim()) awardsAndHonors.push(item.title.trim());
            }
        }
    }

    // Leadership signals — system_extracted from responsibilities text
    const LEADERSHIP_RX: RegExp[] = [
        /managed\s+(?:a\s+)?team\s+of\s+\d+/gi,
        /led\s+(?:a\s+)?team\s+of\s+\d+/gi,
        /supervised\s+(?:a\s+)?(?:team\s+of\s+)?\d+/gi,
        /managed\s+\d+\s+(?:direct\s+)?reports?/gi,
        /team\s+of\s+\d+\s+(?:engineers?|developers?|people|members?|staff|analysts?)/gi,
        /oversaw\s+\d+\s+(?:engineers?|developers?|people|members?|staff)/gi,
        /mentored\s+\d+\s+(?:engineers?|developers?|people|junior|mid)/gi,
        /budget\s+of\s+(?:USD?|[$€£₦₹¥])?\s*[\d,.]+/gi,
        /revenue\s+of\s+(?:USD?|[$€£₦₹¥])?\s*[\d,.]+/gi,
        /\d+\s+direct\s+reports?/gi,
        /managed\s+(?:a\s+)?(?:\$|£|€|USD|GBP|EUR)[\d,.]+\s*(?:m|million|k|thousand|bn|billion)?\s*budget/gi,
    ];
    const leadershipSignals: Array<{ signal: string; context: string }> = [];
    const seenLeadership = new Set<string>();
    for (const role of profile.workExperience || []) {
        const blob = typeof role.responsibilities === 'string' ? role.responsibilities : '';
        const label = `${role.jobTitle || 'role'} @ ${role.company || ''}`;
        for (const rx of LEADERSHIP_RX) {
            rx.lastIndex = 0;
            for (const m of blob.matchAll(rx)) {
                const sig = m[0].trim();
                const key = sig.toLowerCase();
                if (seenLeadership.has(key)) continue;
                seenLeadership.add(key);
                const idx = blob.toLowerCase().indexOf(key);
                const ctx = idx >= 0
                    ? blob.slice(Math.max(0, idx - 20), Math.min(blob.length, idx + sig.length + 20)).replace(/\s+/g, ' ').trim()
                    : label;
                leadershipSignals.push({ signal: sig, context: `${label}: "…${ctx}…"` });
            }
        }
    }

    return { concreteNumbers, realOrganizations, realDegrees, yearsExperience, currentRole, certifications, awardsAndHonors, leadershipSignals };
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
    civil_engineering: [
        'Supervised construction of a {N} km road section — delivered {N} days ahead of programme at {REVENUE} project value.',
        'Designed reinforced-concrete bridge deck for {N} t live load — passed third-party structural review first pass.',
        'Coordinated geotechnical investigations across {N} sites, informing foundation designs for {N} structures.',
        'Prepared bills of quantities for {N} infrastructure packages — cost estimates accurate to within {N}%.',
    ],
    construction: [
        'Managed {N} concurrent subcontractors on a {REVENUE} civil works package — zero RIDDOR incidents.',
        'Tracked daily progress against NEC3 programme — flagged {N} early warnings that prevented {N} days of delay.',
        'Coordinated MEP installation across {N} floors — handover achieved {N} weeks ahead of contract completion date.',
        'Prepared {N} interim payment certificates totalling {REVENUE} — approved without dispute by the employer.',
    ],
    architecture: [
        'Produced planning drawings for {N} mixed-use schemes — all {N} achieved planning permission first submission.',
        'Led BIM coordination on a {REVENUE} commercial development — resolved {N} clash-detection issues pre-construction.',
        'Developed concept through RIBA Stage {N} for a {N}-unit residential scheme within a {REVENUE} client brief.',
        'Prepared {N} sets of tender documentation — contractor queries reduced by roughly {N}% vs previous project.',
    ],
    data_analytics: [
        'Built a {STACK} dashboard ingesting {N}M daily events — cut reporting turnaround from {N} days to {N} hours.',
        'Designed an ETL pipeline processing {N}GB daily — data freshness improved from {N}-hour to {N}-minute lag.',
        'Developed a churn-prediction model achieving {N}% recall — flagged {N} at-risk accounts before renewal cycle.',
        'Automated {N} weekly reports in SQL + Python — freed {N} analyst-hours per week for higher-value work.',
    ],
    manufacturing: [
        'Implemented a Kaizen initiative across {N} assembly lines — defect rate dropped by roughly {N}% in {N} months.',
        'Led a Six Sigma DMAIC project that cut scrap from {N}% to {N}% — saving approximately {REVENUE}/year.',
        'Maintained OEE above {N}% across {N} CNC machines through structured preventive-maintenance scheduling.',
        'Coordinated handover of {N} tooling projects to production — all delivered on spec with zero rework.',
    ],
    logistics: [
        'Managed last-mile distribution for {N} SKUs across {N} warehouses — on-time delivery rate above {N}%.',
        'Negotiated {N} freight contracts, reducing average cost per shipment by roughly {N}%.',
        'Implemented a WMS upgrade across {N} sites — pick accuracy improved from {N}% to {N}%.',
        'Cleared {N} time-sensitive customs entries — zero late-release penalties across {N} months.',
    ],
    marketing: [
        'Ran {N} paid-search campaigns across {N} markets — cost per acquisition reduced by roughly {N}%.',
        'Grew organic traffic by roughly {N}% in {N} months through a structured SEO and content programme.',
        'Managed a {REVENUE} campaign budget across {N} channels — ROAS of {N}x against a {N}x target.',
        'Produced {N} long-form content pieces per month — average time-on-page up roughly {N}% quarter on quarter.',
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
    legal: [
        'Drafted and negotiated {N} commercial contracts per quarter — zero post-execution disputes.',
        'Managed a litigation portfolio of {N} active matters — {N} resolved by settlement within {N} months.',
        'Conducted regulatory compliance reviews across {N} business units — zero enforcement actions during tenure.',
        'Advised on {N} M&A transactions with an aggregate deal value of {REVENUE} — all closed within agreed timelines.',
    ],
    consulting: [
        'Delivered a cost-optimisation engagement for a {REVENUE}-revenue client — identified {REVENUE} in savings.',
        'Managed {N} workstreams across {N} engagement teams — all milestones met within agreed fee budgets.',
        'Facilitated {N} executive workshops that produced a board-approved 3-year strategic roadmap.',
        'Built a financial model used to support a {REVENUE} capital-raise — model was accepted by lead investor first pass.',
    ],
    operations: [
        'Reduced process cycle time by roughly {N}% across {N} workflows through structured SOP redesign.',
        'Led a cross-functional team of {N} to implement a new ERP module — went live {N} weeks ahead of schedule.',
        'Owned vendor management for {N} suppliers — consolidated to {N}, cutting procurement overhead by roughly {N}%.',
        'Developed and monitored {N} operational KPIs across {N} departments — dashboard adopted company-wide.',
    ],
    hr: [
        'Reduced time-to-hire from {N} to {N} days across {N} roles by restructuring the screening workflow.',
        'Led learning-and-development programmes for {N} staff — training satisfaction score improved by roughly {N}%.',
        'Managed payroll and benefits administration for {N} employees — zero compliance findings in {N}-year period.',
        'Partnered with {N} hiring managers to fill {N} roles in {N} months — {N}% of hires passed probation.',
    ],
    hospitality: [
        'Managed front-office operations for a {N}-room property — guest satisfaction score above {N}% for {N} quarters.',
        'Oversaw food-and-beverage revenue of {REVENUE}/month — upselling programme lifted average cover spend by {N}%.',
        'Coordinated {N} corporate events per month, achieving {N}% repeat-booking rate from clients.',
        'Led a {N}-person team through peak season — zero service complaints escalated to management over {N} months.',
    ],
    media: [
        'Produced {N} long-form documentary segments — {N} aired on national broadcast within {N} months of assignment.',
        'Managed post-production workflow for {N} episodes — delivered {N} days ahead of broadcast schedule.',
        'Grew digital audience by roughly {N}% over {N} months through a structured content and engagement strategy.',
        'Shot and edited {N} commercial campaigns for {N} clients — all approved without revision on first submission.',
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

=== CREDENTIAL & CLAIM INTEGRITY [S3] ===
${locked.certifications.length > 0
    ? `CERTIFICATIONS (user_supplied — cite freely, exact spelling):\n${locked.certifications.map(c => `   ✅ "${c}"`).join('\n')}`
    : `CERTIFICATIONS: (none listed by the user)\n   ❌ Do NOT mention any certification name whatsoever — e.g. "AWS Certified", "PMP", "CISSP", "Scrum Master", "Google Professional" — none of these exist in this profile.`}

${locked.awardsAndHonors.length > 0
    ? `AWARDS & HONOURS (user_supplied — cite freely):\n${locked.awardsAndHonors.map(a => `   ✅ "${a}"`).join('\n')}`
    : `AWARDS & HONOURS: (none listed)\n   ❌ Do NOT fabricate rankings, awards, or honour mentions (e.g. "Ranked #1", "Top Performer", "Best in Region", "Employee of the Month").`}

${locked.leadershipSignals.length > 0
    ? `LEADERSHIP DATA (system_extracted — only these team/budget figures are verified):\n${locked.leadershipSignals.map(l => `   ✅ ${l.signal}  [from: ${l.context}]`).join('\n')}`
    : `LEADERSHIP DATA: (none extracted)\n   ❌ Do NOT state team sizes, headcount, direct reports, or budget/revenue responsibility unless the exact figure already appears in NUMBERS above.`}

FORBIDDEN TO FABRICATE (applies regardless of context):
   ❌ Any certification, credential, or qualification not in the CERTIFICATIONS list above.
   ❌ Any award, ranking, or competitive claim not in the AWARDS & HONOURS list above.
   ❌ Any team size, people-managed count, or budget figure not in NUMBERS or LEADERSHIP DATA above.
   ❌ The phrases "Ranked #1", "Top performer", "Best in", "Award-winning", "Recognised as" — unless backed by AWARDS & HONOURS above.
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

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CONFIDENCE HISTORY — last 5 auto-detected fields stored in localStorage
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_HISTORY_KEY = 'cv:fieldHistory';
const FIELD_HISTORY_MAX = 5;

export interface FieldHistoryEntry {
    field: CVField;
    score: number;
    /** ISO timestamp */
    at: string;
}

/** Read the stored history (newest first). Never throws. */
export function getFieldHistory(): FieldHistoryEntry[] {
    try {
        const raw = localStorage.getItem(FIELD_HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as FieldHistoryEntry[];
    } catch {
        return [];
    }
}

/**
 * Push one entry for an auto-detected field. User-pinned detections are
 * deliberately excluded so the history reflects what scoring actually chose.
 */
export function recordFieldHistory(source: FieldDetectionSource, field: CVField): void {
    if (source.kind === 'user-pinned') return;
    const entry: FieldHistoryEntry = { field, score: source.score, at: new Date().toISOString() };
    try {
        const prev = getFieldHistory();
        const next = [entry, ...prev].slice(0, FIELD_HISTORY_MAX);
        localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(next));
    } catch {
        // localStorage full or unavailable — skip silently
    }
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
