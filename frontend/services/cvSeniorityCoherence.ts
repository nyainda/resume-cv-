/**
 * cvSeniorityCoherence.ts — Career-level believability auditor.
 *
 * Answers the recruiter's instinctive question:
 *   "Does this bullet match who this person actually is?"
 *
 * How it works:
 *   1. Parse every role's startDate/endDate to calculate real tenure months.
 *   2. Detect role TYPE from title keywords (intern / trainee / attachment /
 *      junior / mid / senior / lead / executive).  Each role gets its OWN
 *      mini-tier — a senior person's 2012 internship entry is audited as an
 *      intern role, not as a senior role.
 *   3. Per-role, scan every bullet for tier-mismatched language:
 *      • OVERREACH — ownership / strategy / executive-access claims in a role
 *        that could not realistically carry that responsibility.
 *      • UNDERREACH — purely assistive "helped / supported" language in a
 *        senior/lead role that should own outcomes.
 *   4. Return a SeniorityCoherenceReport with issue list + career-level summary.
 *
 * Design constraints (same as cvStyleGovernance.ts):
 *   - Pure, synchronous, zero AI cost, zero network calls.
 *   - Never modifies the CV. Detect-only.
 *   - Never throws — entire audit is wrapped in try/catch at call sites.
 *   - Covers ALL role types: employment, internships, attachments, graduate
 *     trainee programmes, industrial placements, apprenticeships, volunteer
 *     and freelance entries.
 */

import { CVData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SeniorityTier =
    | 'intern'      // trainee, attachment, placement, apprentice
    | 'junior'      // 0–24 months; "junior", "associate", "graduate"
    | 'mid'         // 24–60 months; unqualified IC titles
    | 'senior'      // 60–120 months; "senior", "staff", "principal"
    | 'lead'        // 8–15 years; "lead", "manager", "head of"
    | 'executive';  // 12+ years; "director", "VP", "C-suite", "founder"

export interface RoleProfile {
    roleIndex: number;
    label: string;          // "Software Engineer Intern @ Acme"
    tier: SeniorityTier;
    months: number;         // duration of this specific role
    titleSignal: 'intern' | 'junior' | 'senior_title' | 'exec_title' | 'none';
}

export interface CareerProfile {
    tier: SeniorityTier;    // overall career tier (driven by most recent / most senior)
    totalMonths: number;    // deduplicated work months across all roles
    hasInternRoles: boolean;
    roles: RoleProfile[];
    evidenceSummary: string; // e.g. "6 roles, 84 total months, most recent: Senior Engineer"
}

export interface SeniorityIssue {
    kind: 'seniority_overreach' | 'seniority_underreach';
    severity: 'warn' | 'info';
    where: string;           // "Software Engineer Intern @ Acme"
    detail: string;          // human-readable description
    fieldLocation: string;   // "experience[0].responsibilities[2]"
    flaggedPhrase: string;   // the actual match that triggered this
    roleTier: SeniorityTier;
}

export interface SeniorityCoherenceReport {
    career: CareerProfile;
    issues: SeniorityIssue[];
    totalIssues: number;
    durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseDate(s: string | undefined | null): Date | null {
    if (!s) return null;
    const lower = s.trim().toLowerCase();
    if (lower === 'present' || lower === 'current' || lower === 'now') return new Date();
    // Try "YYYY-MM", "YYYY-MM-DD", "Month YYYY", "YYYY"
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // "Jan 2020", "January 2020", "Jan. 2020"
    const monthYear = /([a-z]+\.?)\s+(\d{4})/i.exec(s);
    if (monthYear) {
        const d2 = new Date(`${monthYear[1]} 1 ${monthYear[2]}`);
        if (!isNaN(d2.getTime())) return d2;
    }
    // Plain 4-digit year: treat as Jan 1 of that year
    const yearOnly = /^(\d{4})$/.exec(s.trim());
    if (yearOnly) return new Date(parseInt(yearOnly[1]), 0, 1);
    return null;
}

function monthsBetween(start: Date, end: Date): number {
    const diff = (end.getFullYear() - start.getFullYear()) * 12
        + (end.getMonth() - start.getMonth());
    return Math.max(0, diff);
}

/** Merge overlapping [start, end] intervals and sum the total months. */
function totalDedupedMonths(intervals: Array<[Date, Date]>): number {
    if (!intervals.length) return 0;
    const sorted = [...intervals].sort((a, b) => a[0].getTime() - b[0].getTime());
    const merged: Array<[Date, Date]> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const [s, e] = sorted[i];
        if (s.getTime() <= last[1].getTime()) {
            if (e.getTime() > last[1].getTime()) last[1] = e;
        } else {
            merged.push([s, e]);
        }
    }
    return merged.reduce((sum, [s, e]) => sum + monthsBetween(s, e), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Title signal detection
// ─────────────────────────────────────────────────────────────────────────────

const INTERN_TITLE_SIGNALS = [
    /\bintern\b/i,
    /\btrainee\b/i,
    /\battachment\b/i,
    /\bindustrial\s+(?:attachment|training|placement)\b/i,
    /\bwork\s+placement\b/i,
    /\bwork\s+experience\b/i,
    /\bgraduate\s+trainee\b/i,
    /\bgraduate\s+programme\b/i,
    /\bgraduate\s+program\b/i,
    /\bapprentice\b/i,
    /\bplacement\s+student\b/i,
    /\bsandwich\s+student\b/i,
    /\bco[\s-]?op\b/i,              // co-op student
    /\bvocational\s+training\b/i,
];

const JUNIOR_TITLE_SIGNALS = [
    /\bjunior\b/i,
    /\bjr\.?\b/i,
    /\bassociate\s+(?!director|partner|professor|dean)/i,
    /\bgraduate\s+(?:engineer|developer|analyst|consultant|architect)/i,
    /\bentry[\s-]level\b/i,
    /\bassistant\s+(?!manager|director|professor)/i,    // "assistant dev" but not "assistant manager"
];

const SENIOR_TITLE_SIGNALS = [
    /\bsenior\b/i,
    /\bstaff\s+(?:engineer|developer|architect|scientist)\b/i,
    /\bprincipal\s+(?!investigator)\b/i,
    /\btech(?:nical)?\s+lead\b/i,
    /\blead\s+(?:engineer|developer|architect|analyst|scientist|designer)\b/i,
    /\bsolutions?\s+architect\b/i,
];

const LEAD_TITLE_SIGNALS = [
    /\b(?:engineering|product|team|tech(?:nical)?|development)\s+manager\b/i,
    /\bhead\s+of\b/i,
    /\bgroup\s+(?:lead|manager)\b/i,
    /\bmanager\b/i,    // broad fallback — only used if none of the above match
];

const EXEC_TITLE_SIGNALS = [
    /\bdirector\b/i,
    /\bvice\s+president\b/i,
    /\b\bVP\b/,
    /\bC[TEOFMP]O\b/,  // CEO, CTO, CFO, CMO, CPO
    /\bchief\s+\w+\s+officer\b/i,
    /\bpresident\b/i,
    /\bfounder\b/i,
    /\bco[\s-]?founder\b/i,
    /\bpartner\b/i,
    /\bprincipal\s+investigator\b/i,
];

type TitleSignal = 'intern' | 'junior' | 'senior_title' | 'lead_title' | 'exec_title' | 'none';

function classifyTitleSignal(title: string): TitleSignal {
    if (!title) return 'none';
    if (INTERN_TITLE_SIGNALS.some(r => r.test(title))) return 'intern';
    if (EXEC_TITLE_SIGNALS.some(r => r.test(title))) return 'exec_title';
    if (LEAD_TITLE_SIGNALS.some(r => r.test(title))) return 'lead_title';
    if (SENIOR_TITLE_SIGNALS.some(r => r.test(title))) return 'senior_title';
    if (JUNIOR_TITLE_SIGNALS.some(r => r.test(title))) return 'junior';
    return 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-role tier derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveRoleTier(titleSignal: TitleSignal, durationMonths: number): SeniorityTier {
    if (titleSignal === 'intern')      return 'intern';
    if (titleSignal === 'exec_title')  return 'executive';
    if (titleSignal === 'lead_title')  return 'lead';
    if (titleSignal === 'senior_title') {
        // A "senior" title with very short tenure is suspicious but we accept it.
        return durationMonths >= 36 ? 'senior' : 'mid';
    }
    if (titleSignal === 'junior')      return 'junior';
    // No title signal — derive from duration alone.
    if (durationMonths < 6)  return 'junior';  // very short — play it safe
    if (durationMonths < 30) return 'junior';
    if (durationMonths < 66) return 'mid';
    if (durationMonths < 120) return 'senior';
    return 'lead';
}

// ─────────────────────────────────────────────────────────────────────────────
// Career-level profile inference
// ─────────────────────────────────────────────────────────────────────────────

export function inferCareerProfile(cv: CVData): CareerProfile {
    const experience = cv.experience || [];
    const intervals: Array<[Date, Date]> = [];
    const roles: RoleProfile[] = [];

    for (let i = 0; i < experience.length; i++) {
        const e = experience[i];
        const title = (e.jobTitle || '').trim();
        const company = (e.company || '').trim();
        const label = `${title}${company ? ' @ ' + company : ''}`;

        const start = parseDate(e.startDate);
        const end   = parseDate(e.endDate) ?? new Date(); // treat missing end as present

        const months = start ? monthsBetween(start, end) : 0;
        if (start) intervals.push([start, end]);

        const titleSignal = classifyTitleSignal(title) as TitleSignal;
        const tier = deriveRoleTier(titleSignal, months);

        roles.push({ roleIndex: i, label, tier, months, titleSignal: titleSignal as any });
    }

    const totalMonths = totalDedupedMonths(intervals);
    const hasInternRoles = roles.some(r => r.tier === 'intern');

    // Career tier = most senior tier across all roles, capped by total experience.
    // A one-month VP stint doesn't make someone an executive.
    const tierOrder: SeniorityTier[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'executive'];
    const rawMax = roles.reduce((best, r) => {
        const ri = tierOrder.indexOf(r.tier);
        const bi = tierOrder.indexOf(best);
        return ri > bi ? r.tier : best;
    }, 'junior' as SeniorityTier);

    // Sanity-cap: if total experience is too short for the claimed tier, step back.
    let careerTier: SeniorityTier = rawMax;
    if (rawMax === 'executive' && totalMonths < 84) careerTier = 'lead';
    else if (rawMax === 'lead'  && totalMonths < 48) careerTier = 'senior';
    else if (rawMax === 'senior' && totalMonths < 24) careerTier = 'mid';

    const mostRecent = roles[0]; // already sorted newest-first by the pipeline
    const evidenceSummary = `${roles.length} role(s), ${totalMonths} total months`
        + (mostRecent ? `, most recent: ${mostRecent.label}` : '');

    return { tier: careerTier, totalMonths, hasInternRoles, roles, evidenceSummary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Overreach patterns — keyed by the ROLE tier being audited
// ─────────────────────────────────────────────────────────────────────────────

interface OverreachRule {
    pattern: RegExp;
    detail: string;
    minTierToFlag: SeniorityTier; // flag this phrase only when role tier ≤ this tier
}

// INTERN-level overreach rules — things no intern would realistically own.
const INTERN_OVERREACH_RULES: OverreachRule[] = [
    {
        pattern: /\b(?:led|leading)\s+(?:the|a|an|our|my|this)\s+\w+/gi,
        detail: '"led [X]" — interns rarely lead owned workstreams',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bmanaged\s+(?:a|the|our|my)\s+team\b/gi,
        detail: '"managed a/the team" is uncommon for an intern role',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\b(?:owned|owns)\s+(?:the|a|an|our|this|entire)\s+\w+/gi,
        detail: '"owned X" — direct ownership claim is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bspearheaded\b/gi,
        detail: '"spearheaded" implies strategic initiative ownership beyond intern scope',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bpioneer(?:ed|ing)?\s+(?:the|a|an|our)\b/gi,
        detail: '"pioneered X" implies a first-mover strategic claim uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bdrove\s+(?:company|org(?:anization)?|enterprise|cross[\s-]?(?:functional|team|org)|department)/gi,
        detail: '"drove company/org-wide X" — cross-org ownership is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bestablished\s+(?:company|org(?:anization)?|enterprise|cross|firm|department|division)[\s-]/gi,
        detail: '"established [org-wide] X" — setting org-wide practices is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bstrategic\s+(?:direction|roadmap|vision|plan(?:ning)?|initiative|agenda|pillar)\b/gi,
        detail: '"strategic X" — strategic ownership is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bdirectly\s+responsible\s+for\b/gi,
        detail: '"directly responsible for" implies sole ownership beyond intern scope',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bP&L\b/gi,
        detail: 'P&L ownership is uncommon for an intern role',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bboard[\s-]level\b/gi,
        detail: 'Board-level exposure is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\breported\s+(?:directly\s+)?to\s+(?:the\s+)?(?:CEO|CTO|CFO|COO|CMO|CPO|VP|vice\s+president|board|C[\s-]suite|executive\s+team)/gi,
        detail: 'Direct C-suite/board reporting is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bmanaged\s+(?:[5-9]|\d{2,})\s+(?:direct\s+)?reports\b/gi,
        detail: 'Managing 5+ direct reports is uncommon for an intern',
        minTierToFlag: 'intern',
    },
    {
        pattern: /\bteam\s+of\s+(?:[1-9]\d|\d{3,})\b/gi,
        detail: 'Leading a team of 10+ people is uncommon for an intern',
        minTierToFlag: 'intern',
    },
];

// JUNIOR-level overreach rules — things a 0-2 year IC wouldn't realistically own.
const JUNIOR_OVERREACH_RULES: OverreachRule[] = [
    {
        pattern: /\bP&L\s+ownership\b/gi,
        detail: 'P&L ownership is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\bboard[\s-]level\b/gi,
        detail: 'Board-level responsibility is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\bC[\s-]suite\b/gi,
        detail: 'C-suite engagement is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\bcompany[\s-]wide\s+(?:strategy|initiative|transformation|programme|program)\b/gi,
        detail: '"company-wide strategy/initiative" ownership is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\bmanaged\s+(?:1[0-9]|\d{2,})\s+(?:direct\s+)?reports\b/gi,
        detail: 'Managing 10+ direct reports is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\boversaw\s+(?:the\s+)?(?:entire|whole|full)\b/gi,
        detail: '"oversaw the entire X" is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
    {
        pattern: /\bestablished\s+(?:company|org|enterprise|firm)[\s-]/gi,
        detail: '"established [org-wide] X" is uncommon for a junior role',
        minTierToFlag: 'junior',
    },
];

// MID-level overreach rules — unexpected claims for a 2-5 year IC.
const MID_OVERREACH_RULES: OverreachRule[] = [
    {
        pattern: /\bP&L\s+(?:ownership|responsibility)\s+of\s+\$[2-9]\d{6}|\$\d{8,}/gi,
        detail: 'P&L ownership of $2M+ is uncommon for a mid-level IC role',
        minTierToFlag: 'mid',
    },
    {
        pattern: /\bmanaged\s+(?:[2-9]\d|\d{3,})\s+(?:direct\s+)?reports\b/gi,
        detail: 'Managing 20+ direct reports is uncommon for a mid-level role',
        minTierToFlag: 'mid',
    },
    {
        pattern: /\bboard[\s-]level\b/gi,
        detail: 'Board-level responsibility is uncommon for a mid-level role',
        minTierToFlag: 'mid',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Underreach patterns — too-humble language for a senior/lead/executive role.
// ─────────────────────────────────────────────────────────────────────────────

interface UnderreachRule {
    pattern: RegExp;
    detail: string;
    minTierToFlag: SeniorityTier; // flag only when role tier ≥ this tier
}

const SENIOR_UNDERREACH_RULES: UnderreachRule[] = [
    {
        pattern: /^(?:assisted|helping|helped)\s+(?:the|a|an|my|our)\s+team\b/gi,
        detail: '"Assisted/Helped the team" as a primary bullet opener is too junior for a senior role — state what you owned or delivered',
        minTierToFlag: 'senior',
    },
    {
        pattern: /^supported\s+(?:the|a|an|my|our)\s+(?:team|group|department)\s+(?:in|with|by)\b/gi,
        detail: '"Supported the team in/with X" as a primary bullet is too junior for a senior role',
        minTierToFlag: 'senior',
    },
    {
        pattern: /^(?:shadowed|observed|attended)\b/gi,
        detail: '"Shadowed/Observed" is intern-level language in a senior role bullet',
        minTierToFlag: 'senior',
    },
];

const LEAD_UNDERREACH_RULES: UnderreachRule[] = [
    ...SENIOR_UNDERREACH_RULES.map(r => ({ ...r, minTierToFlag: 'lead' as SeniorityTier })),
    {
        pattern: /^(?:assisted|helped|supported)\b/gi,
        detail: 'Lead/manager roles should show ownership — "assisted/helped" as opener understates this',
        minTierToFlag: 'lead',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tier order helpers
// ─────────────────────────────────────────────────────────────────────────────

const TIER_ORDER: SeniorityTier[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'executive'];

function tierIndex(t: SeniorityTier): number {
    return TIER_ORDER.indexOf(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main audit function
// ─────────────────────────────────────────────────────────────────────────────

export function auditSeniorityCoherence(cv: CVData): SeniorityCoherenceReport {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const issues: SeniorityIssue[] = [];
    const career = inferCareerProfile(cv);

    for (const rp of career.roles) {
        const { roleIndex, label, tier } = rp;
        const bullets: string[] = (cv.experience[roleIndex]?.responsibilities) || [];

        for (let bi = 0; bi < bullets.length; bi++) {
            const bullet = (bullets[bi] || '').trim();
            if (!bullet) continue;
            const fieldLocation = `experience[${roleIndex}].responsibilities[${bi}]`;

            // ── OVERREACH checks ──────────────────────────────────────────
            const overreachRules: OverreachRule[] =
                tier === 'intern' ? INTERN_OVERREACH_RULES
                : tier === 'junior' ? [...INTERN_OVERREACH_RULES, ...JUNIOR_OVERREACH_RULES]
                : tier === 'mid'    ? [...INTERN_OVERREACH_RULES, ...JUNIOR_OVERREACH_RULES, ...MID_OVERREACH_RULES]
                : [];

            for (const rule of overreachRules) {
                if (tierIndex(tier) > tierIndex(rule.minTierToFlag)) continue;
                rule.pattern.lastIndex = 0;
                const match = rule.pattern.exec(bullet);
                if (match) {
                    issues.push({
                        kind: 'seniority_overreach',
                        severity: 'warn',
                        where: label,
                        detail: rule.detail,
                        fieldLocation,
                        flaggedPhrase: match[0],
                        roleTier: tier,
                    });
                    break; // one overreach issue per bullet is enough
                }
            }

            // ── UNDERREACH checks ─────────────────────────────────────────
            if (tier === 'senior' || tier === 'lead' || tier === 'executive') {
                const underreachRules: UnderreachRule[] =
                    tier === 'lead' || tier === 'executive'
                        ? LEAD_UNDERREACH_RULES
                        : SENIOR_UNDERREACH_RULES;

                for (const rule of underreachRules) {
                    if (tierIndex(tier) < tierIndex(rule.minTierToFlag)) continue;
                    rule.pattern.lastIndex = 0;
                    const match = rule.pattern.exec(bullet);
                    if (match) {
                        issues.push({
                            kind: 'seniority_underreach',
                            severity: 'info',
                            where: label,
                            detail: rule.detail,
                            fieldLocation,
                            flaggedPhrase: match[0],
                            roleTier: tier,
                        });
                        break;
                    }
                }
            }
        }
    }

    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (issues.length > 0) {
        const overreach  = issues.filter(i => i.kind === 'seniority_overreach').length;
        const underreach = issues.filter(i => i.kind === 'seniority_underreach').length;
        console.warn(
            `[SeniorityCoherence] ${issues.length} issue(s) in ${durationMs.toFixed(1)}ms`
            + ` — overreach: ${overreach}, underreach: ${underreach}`
            + ` | career: ${career.tier} (${career.totalMonths}mo)`
        );
    }
    return { career, issues, totalIssues: issues.length, durationMs };
}
