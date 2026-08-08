/**
 * Pre-generation detectors: currency, seniority, scenario, domain, gaps.
 * Logic unchanged.
 */

import type { UserProfile, CVData } from '../../types';

export function _normalizeCurrencyInCV(cv: CVData, detectedCurrency: string): CVData {
    if (!detectedCurrency || detectedCurrency === 'NONE') return cv;

    // All supported codes except the detected one — these are the "wrong" ones.
    const KNOWN_CODES = ['USD', 'GBP', 'EUR', 'NGN', 'ZAR', 'UGX', 'TZS', 'AED', 'CAD', 'AUD', 'INR', 'KES'];
    const wrongCodes = KNOWN_CODES.filter(c => c !== detectedCurrency);

    // Symbol → code mapping for symbol-first amounts ("$2M", "£50K", "€1.5M", "₦800K").
    const SYMBOL_TO_CODE: Record<string, string> = {
        '$': 'USD', '£': 'GBP', '€': 'EUR', '₦': 'NGN', '₹': 'INR',
    };
    const wrongSymbolEntries = Object.entries(SYMBOL_TO_CODE).filter(([, code]) => code !== detectedCurrency);

    const normalizeText = (text: string): string => {
        let out = text;
        // 1. Wrong currency code followed by digit: "USD 2M" → "KES 2M"
        if (wrongCodes.length > 0) {
            out = out.replace(
                new RegExp(`\\b(${wrongCodes.join('|')})\\s*(\\d)`, 'g'),
                `${detectedCurrency} $2`,
            );
        }
        // 2. Wrong currency symbol followed by digit: "$2M" → "KES 2M"
        for (const [sym] of wrongSymbolEntries) {
            const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(`${escaped}\\s*(\\d)`, 'g'), `${detectedCurrency} $1`);
        }
        return out;
    };

    return {
        ...cv,
        summary: normalizeText(cv.summary || ''),
        experience: (cv.experience || []).map(role => ({
            ...role,
            // idx 0 = scope-anchor bullet — exempt (anchor wins over general rule).
            responsibilities: (role.responsibilities || []).map(
                (bullet, idx) => idx === 0 ? bullet : normalizeText(bullet),
            ),
        })),
    };
}

/** BLOCK A — Detect currency from job description and profile location. */
export function detectCurrency(jd: string, location: string): string {
    const src = `${jd} ${location}`.toLowerCase();

    // Step 1 — explicit currency symbols/words
    if (/\bkes\b|ksh|kenya shilling|kenyan shilling/.test(src)) return 'KES';
    if (/\busd\b|us\$|\bdollars?\b|\bunited states\b/.test(src)) return 'USD';
    if (/\bgbp\b|£|pounds? sterling|british pounds?|\buk\b|united kingdom/.test(src)) return 'GBP';
    if (/\beur\b|€|\beuros?\b|\beuropean\b/.test(src)) return 'EUR';
    if (/\bngn\b|₦|\bnaira\b|\bnigeria\b/.test(src)) return 'NGN';
    if (/\bzar\b|\brand\b|south african rand|south africa/.test(src)) return 'ZAR';
    if (/\bugx\b|uganda shilling|\buganda\b/.test(src)) return 'UGX';
    if (/\btzs\b|tanzanian shilling|\btanzania\b/.test(src)) return 'TZS';
    if (/\baed\b|\bdirham\b|\buae\b|\bdubai\b|abu dhabi/.test(src)) return 'AED';

    // Step 2 — location keywords
    if (/nairobi|mombasa|kisumu|nakuru|eldoret|nyeri|thika|kikuyu|kiambu|machakos|kakamega|meru|garissa|kitale|malindi|migori|kisii|bungoma|nandi|laikipia|muranga|murang.a|embu|isiolo|voi|lamu|wajir|mandera|marsabit|samburu|turkana|baringo|kericho|bomet|narok|kajiado|makueni|taita|kwale|kilifi|tana river|\bkenya\b/.test(src)) return 'KES';
    if (/lagos|abuja|port harcourt|\bnigeria\b/.test(src)) return 'NGN';
    if (/johannesburg|cape town|durban|south africa/.test(src)) return 'ZAR';
    if (/london|manchester|birmingham|\buk\b|united kingdom/.test(src)) return 'GBP';
    if (/new york|san francisco|chicago|\busa\b|united states/.test(src)) return 'USD';
    if (/kampala|\buganda\b/.test(src)) return 'UGX';
    if (/dar es salaam|\btanzania\b/.test(src)) return 'TZS';
    if (/\bdubai\b|abu dhabi|\buae\b/.test(src)) return 'AED';
    if (/paris|berlin|amsterdam|brussels/.test(src)) return 'EUR';

    // Step 3 — no currency detected
    return 'NONE';
}

/** BLOCK B — Detect seniority from work experience dates. */
export function detectSeniority(workExperience: Array<{ startDate: string; endDate: string }>): string {
    let totalMonths = 0;
    const now = new Date();
    for (const exp of workExperience || []) {
        const start = new Date(exp.startDate);
        const end = exp.endDate?.toLowerCase() === 'present' ? now : new Date(exp.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months > 0) totalMonths += months;
    }
    if (totalMonths < 6) return 'intern';
    if (totalMonths < 24) return 'junior';
    if (totalMonths < 60) return 'mid';
    return 'senior';
}

/**
 * Classify the candidate into one of four empty/thin CV scenarios (v2.3).
 * A = no experience, no projects
 * B = has experience, no projects
 * C = no experience, has projects
 * D = thin experience (< 6 months total), with or without projects
 * standard = full profile — standard rules apply
 */
export function detectScenario(
    workExperience: Array<{ startDate: string; endDate: string }>,
    projects: Array<unknown>
): 'A' | 'B' | 'C' | 'D' | 'standard' {
    let totalMonths = 0;
    const now = new Date();
    for (const exp of workExperience || []) {
        const start = new Date(exp.startDate);
        const end = exp.endDate?.toLowerCase() === 'present' ? now : new Date(exp.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months > 0) totalMonths += months;
    }
    const hasExp = totalMonths > 0;
    const hasProjects = Array.isArray(projects) && projects.length > 0;

    if (!hasExp && !hasProjects) return 'A';
    if (!hasExp && hasProjects) return 'C';
    if (hasExp && totalMonths < 6) return 'D'; // thin — applies with or without projects
    if (hasExp && !hasProjects) return 'B';
    return 'standard';
}

/**
 * Domain taxonomy used for the career-pivot detector. Each bucket lists keywords
 * that strongly imply a candidate or a JD belongs to that field. Keep keywords
 * specific (avoid generic words like "manager" or "lead") to minimize false matches.
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
    software:     ['software', 'developer', 'programmer', 'engineer (software)', 'frontend', 'backend', 'full-stack', 'fullstack', 'devops', 'sre', 'mobile', 'ios', 'android', 'react', 'node', 'python', 'javascript', 'typescript', 'java', 'golang', 'kubernetes', 'docker', 'web developer', 'application engineer'],
    data:         ['data scientist', 'data engineer', 'data analyst', 'machine learning', 'ml engineer', 'ai engineer', 'analytics', 'sql', 'pandas', 'spark', 'airflow', 'tableau', 'power bi', 'statistician', 'bi developer'],
    design:       ['designer', 'ux', 'ui', 'product design', 'graphic design', 'visual design', 'figma', 'sketch', 'illustrator', 'photoshop', 'creative director'],
    marketing:    ['marketing', 'seo', 'sem', 'content marketing', 'growth marketing', 'brand', 'campaign', 'social media manager', 'digital marketing', 'copywriter'],
    sales:        ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'quota', 'sales rep', 'inside sales', 'outside sales'],
    finance:      ['finance', 'financial analyst', 'accountant', 'cpa', 'cfa', 'audit', 'tax', 'controller', 'treasury', 'investment', 'banking', 'actuarial'],
    hr:           ['human resources', 'hr ', 'talent acquisition', 'recruiter', 'people ops', 'hrbp', 'compensation', 'l&d'],
    legal:        ['attorney', 'lawyer', 'paralegal', 'legal counsel', 'compliance officer', 'litigation'],
    operations:   ['operations manager', 'supply chain', 'logistics', 'procurement', 'warehouse', 'inventory'],
    project_pm:   ['project manager', 'program manager', 'pmo', 'scrum master', 'product manager', 'product owner'],
    healthcare:   ['nurse', 'doctor', 'physician', 'clinical', 'patient', 'medical', 'pharmacist', 'therapist', 'radiology', 'cardiology'],
    education:    ['teacher', 'lecturer', 'professor', 'tutor', 'curriculum', 'instructor', 'educator'],
    agriculture:  ['agriculture', 'agricultural', 'agronomy', 'agronomist', 'crop', 'soil', 'irrigation', 'livestock', 'horticulture', 'farm'],
    civil:        ['civil engineer', 'structural engineer', 'site engineer', 'surveyor', 'autocad', 'construction manager'],
    mechanical:   ['mechanical engineer', 'mechatronics', 'hvac', 'manufacturing engineer', 'cad', 'solidworks'],
    electrical:   ['electrical engineer', 'electronics', 'power systems', 'circuit', 'pcb'],
    chemistry:    ['chemist', 'chemical engineer', 'lab technician', 'biochemist', 'analytical chemistry'],
    environment:  ['environmental engineer', 'sustainability', 'water resources', 'waste management', 'eia'],
    hospitality:  ['chef', 'hotel', 'hospitality', 'restaurant manager', 'concierge', 'tourism'],
    construction: ['construction', 'foreman', 'contractor', 'quantity surveyor'],
    research:     ['researcher', 'phd candidate', 'postdoctoral', 'academic research', 'thesis', 'principal investigator'],
};

export function classifyDomains(text: string): Set<string> {
    const t = ' ' + text.toLowerCase() + ' ';
    const found = new Set<string>();
    for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
        for (const kw of kws) {
            if (t.includes(kw.toLowerCase())) { found.add(domain); break; }
        }
    }
    return found;
}

/**
 * Detects when the candidate's background is in a clearly different field from
 * the target role — e.g. agricultural engineer applying to a software role.
 * Orthogonal to scenarios A–D: a pivot can apply on top of any scenario.
 *
 * Returns null when no JD is provided, when domains overlap, or when either
 * side is too generic to classify confidently.
 */
export function detectDomainPivot(
    profile: any,
    jobDescription?: string,
    targetTitle?: string
): { from: string[]; to: string[] } | null {
    if (!jobDescription || jobDescription.trim().length < 40) return null;

    // Skills can be string[] or {name}[] depending on profile shape — handle both.
    const skillTexts: string[] = (profile.skills || [])
        .slice(0, 20)
        .map((s: any) => typeof s === 'string' ? s : (s?.name || ''))
        .filter(Boolean);

    const candText = [
        ...((profile.workExperience || []).slice(0, 3).map((w: any) => `${w.jobTitle || ''} ${w.description || ''}`)),
        ...((profile.education || []).slice(0, 2).map((e: any) => `${e.degree || ''} ${e.fieldOfStudy || ''}`)),
        ...skillTexts,
    ].join(' ');

    const jdText = `${targetTitle || ''} ${jobDescription}`;

    const candDomains = classifyDomains(candText);
    const jdDomains   = classifyDomains(jdText);

    if (candDomains.size === 0 || jdDomains.size === 0) return null;

    // Overlap = no pivot
    const jdArr = Array.from(jdDomains);
    for (const d of jdArr) if (candDomains.has(d)) return null;

    return { from: Array.from(candDomains), to: jdArr };
}

/**
 * Instruction block for cross-domain (career pivot) applications. Forces the
 * model to lead with honest transferable-skills framing instead of pretending
 * the candidate has domain expertise they don't have.
 */
export function buildPivotBlock(pivot: { from: string[]; to: string[] } | null): string {
    if (!pivot) return '';
    // Template text lives in the CF Worker — fetched by loadRules() at boot.
    return _pivotBlockTemplate
        .replace('{{FROM}}', pivot.from.join(', '))
        .replace('{{TO}}', pivot.to.join(', '));
}

/**
 * Returns a focused, scenario-specific instruction block to inject into the CV
 * generation prompt. Concise by design — the AI should act on these, not skim them.
 */
export function buildScenarioBlock(scenario: 'A' | 'B' | 'C' | 'D' | 'standard', mode: string): string {
    if (scenario === 'standard') return '';
    // Scenario text lives in the CF Worker — fetched by loadRules() at boot.
    const modeOverrideInject = (mode === 'boosted' || mode === 'aggressive') && _scenarioModeOverride
        ? `
${_scenarioModeOverride}
`
        : '';
    let template = '';
    if (scenario === 'A')      template = _scenarioA;
    else if (scenario === 'B') template = _scenarioB;
    else if (scenario === 'C') template = _scenarioC;
    else if (scenario === 'D') template = _scenarioD;
    return template.replace('{{MODE_OVERRIDE}}', modeOverrideInject);
}

/** BLOCK C — Derive market from detected currency. */
export function detectMarket(currency: string): string {
    const map: Record<string, string> = {
        KES: 'East Africa', UGX: 'East Africa', TZS: 'East Africa',
        NGN: 'West Africa', ZAR: 'Southern Africa',
        GBP: 'UK', USD: 'USA / Global', EUR: 'European', AED: 'Gulf',
        NONE: 'Unknown — counts and percentages only',
    };
    return map[currency] || 'Unknown — counts and percentages only';
}

/** Gap detection — finds employment gaps longer than 3 months and describes them. */
export interface GapInfo {
    gapMonths: number;
    fromRole: string;
    toRole: string;
    gapStart: string; // e.g. "Jun 2020"
    gapEnd: string;   // e.g. "Jan 2024"
}

export function detectGaps(workExperience: Array<{ company: string; jobTitle: string; startDate: string; endDate: string }>): GapInfo[] {
    if (!workExperience || workExperience.length < 2) return [];
    const now = new Date();
    const sorted = [...workExperience].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const gaps: GapInfo[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const currEnd = curr.endDate?.toLowerCase() === 'present' ? now : new Date(curr.endDate);
        const nextStart = new Date(next.startDate);
        if (isNaN(currEnd.getTime()) || isNaN(nextStart.getTime())) continue;
        const gapMonths = (nextStart.getFullYear() - currEnd.getFullYear()) * 12 + (nextStart.getMonth() - currEnd.getMonth());
        if (gapMonths > 3) {
            const fmt = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            gaps.push({
                gapMonths,
                fromRole: `${curr.jobTitle} at ${curr.company}`,
                toRole: `${next.jobTitle} at ${next.company}`,
                gapStart: fmt(currEnd),
                gapEnd: fmt(nextStart),
            });
        }
    }
    return gaps;
}

/** Builds a human-readable gap context string to inject into mode prompts. */
