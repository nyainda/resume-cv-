import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { initNlp } from './nlpTense';
import { truncate } from '../utils/textTruncate';
import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, CVGenerationMode, ScholarshipFormat, EnhancedJobAnalysis } from '../types';
import { groqChat, groqChatStream, GROQ_LARGE, GROQ_FAST, getLastAiEngine, getSelectedProvider, getClaudeModel, getGroqApiKey } from './groqService';
import { purifyCV, purifyText, cleanImportedText, purifyProfile, purifyInboundCV, revertCorruptedMetrics, enforceOpenerDiversity, applyRemoteBannedPhrasesToCV, enforceTenseConsistency, type PurifyReport } from './cvPurificationPipeline';
import { remotePrePurify } from './cvPurifyClient';
import { detectField, detectFieldWithSource, lockRealNumbers, buildPromptAnchorBlock, fixPronounsInCV } from './cvPromptHelpers';
import { logGeneration, quickHash } from './telemetryService';
import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { MarketResearchResult, buildMarketIntelligencePrompt } from './marketResearch';
import { buildBrief, validateVoice, reportLeaks, workerLLM, workerTieredLLM, workerRaceLLM, workerParallelSections, workerVisionExtract, getCachedBannedPhrases, type CVBrief, type ValidateVoiceResult, type ParallelSectionRequest } from './cvEngineClient';
import { findOverusedWords } from './cvEngine/wordFrequency';
import { ROLE_TRACKS } from '../data/roleTracks';
import { normaliseCustomSections } from '../utils/normaliseSectionType';
import { profileToCV } from '../utils/profileToCV';
import { formatExpDateRange } from '../utils/cvDataUtils';
import {
    collectSourceNumberTokens as _collectSourceNumberTokens,
    repairBulletsAgainstSource as _repairBulletsAgainstSource,
    repairTextAgainstSource as _repairTextAgainstSource,
    logCvQualityReport as _logCvQualityReport,
    auditCvQuality as _auditCvQuality,
} from './cvNumberFidelity';
import { repairCvSummaryWithAi as _repairCvSummaryWithAi } from './aiInlineFix';
import { startTrace, storeTrace, attachTrace, type TraceBuilder } from './generationTrace';
import { getPromptVersions } from './promptRegistryClient';
import { runValidationEngine } from './cvValidationEngine';
import { reconcileSkills, type ReconciledSkills } from './skillsReconciler';
import { runFinalCVGuard, fixSummaryOpener, purgeSummarySeekingLanguage, deduplicateSkills } from './cvFinalGuard';

// ── Pipeline-safe banned-phrases helper ──────────────────────────────────────
// Used by every AI call that generates or rewrites CV content to ensure
// they respect the same banned-phrase list as the main generation pipeline.
// Falls back to a hardcoded set when the CF worker is unreachable.
const _BANNED_PHRASES_FALLBACK =
    'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, ' +
    'catalyzed, responsible for, helped with, assisted in, tasked with, worked on, ' +
    'passionate about, dynamic, results-driven, detail-oriented, innovative, ' +
    'cutting-edge, robust, seamlessly, delve, harnessed, navigated';

async function _getBannedPhrasesForPrompt(): Promise<string> {
    try {
        const entries = await getCachedBannedPhrases();
        if (entries && entries.length > 0) {
            return entries.slice(0, 25).map(b => `"${b.phrase}"`).join(', ');
        }
    } catch { /* silent fallback */ }
    return _BANNED_PHRASES_FALLBACK;
}

// ── Polish sub-stage progress event ──────────────────────────────────────────
// Fired inside runQualityPolishPasses so CVGenerationProgress can show
// per-substep detail while the 'polishing' stage is active.
export const POLISH_STAGE_EVENT = 'procv:polish-stage';
export type PolishStageId = 'humanizing' | 'purifying' | 'voice' | 'finalizing';
export interface PolishStagePayload { stage: PolishStageId }
function _dispatchPolishStage(stage: PolishStageId) {
    try { window.dispatchEvent(new CustomEvent<PolishStagePayload>(POLISH_STAGE_EVENT, { detail: { stage } })); }
    catch { /* non-browser env — ignore */ }
}
import {
    stripFirstPersonPronouns as _stripFirstPersonPronouns,
    normalizePresentTenseToImperative as _normalizePresentTenseToImperative,
} from './cvVoiceFidelity';
import {
    computeExampleFingerprint,
    fetchCVExample,
    storeCVExample,
    buildReferenceBlock,
    type NarrativeAngle,
    computeExampleQualityScore,
} from './cvExamplesClient';
import { getHashIfCached, getProfileCacheHash, sha256Hex } from './profileCacheClient';

// ── Variance helpers ──────────────────────────────────────────────────────────
// These inject controlled randomness at the prompt level so each generation
// feels like a different person wrote it, while facts stay identical.

/** Fisher-Yates shuffle — always returns a NEW array, never mutates. */
function shuffleArray<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── Narrative Angle System ────────────────────────────────────────────────────
// Each generation randomly picks one of four angles.
// The angle changes FRAMING only — facts, metrics, companies are always fixed.
const NARRATIVE_ANGLES: Record<NarrativeAngle, {
    name: string;
    description: string;
    summaryFocus: string;
    bulletBias: string;
}> = {
    impact: {
        name: 'Impact',
        description: 'Lead with quantified outcomes and business results. Every role is told through what changed because of this person.',
        summaryFocus: 'open with the strongest measurable result delivered, then prove it with a second achievement',
        bulletBias: 'lead with the outcome when strong data exists ("Cut X by Y%, saving Z") rather than always opening with an action verb',
    },
    process: {
        name: 'Process',
        description: 'Lead with systems, methods, and how work was done. Emphasise the HOW over the WHAT.',
        summaryFocus: 'open with the signature working method or the system/framework this person is known for building or improving',
        bulletBias: 'show the mechanism ("By redesigning X, achieved Y") — the method is the story; use scope-openers and context-openers frequently',
    },
    people: {
        name: 'People',
        description: 'Lead with collaboration, influence, and team impact. Emphasise who was worked with and who was developed.',
        summaryFocus: 'open with the leadership or collaboration style and the team/stakeholder scale operated at',
        bulletBias: 'anchor bullets in team size, stakeholder scope, or mentorship outcomes where genuine data exists',
    },
    growth: {
        name: 'Growth',
        description: 'Lead with progression, expanding scope, and learning trajectory. Show momentum over time.',
        summaryFocus: 'open with the arc — the expanding responsibility earned and the trajectory demonstrated',
        bulletBias: 'show before/after scope within roles where the progression is real; use timeframe-openers ("Over X months,…") to show pace',
    },
};

// ─── Narrative angle history (localStorage, zero tokens) ─────────────────────
// Tracks which angles have been used recently so each new generation picks
// the LEAST-recently-used angle. All 4 angles rotate evenly across sessions.
const _ANGLE_HISTORY_KEY = 'cv:angleHistory';
const _ALL_ANGLES: NarrativeAngle[] = ['impact', 'process', 'people', 'growth'];

function _readAngleHistory(): NarrativeAngle[] {
    try {
        const raw = localStorage.getItem(_ANGLE_HISTORY_KEY);
        const arr: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return (arr as unknown[]).filter((a): a is NarrativeAngle =>
            typeof a === 'string' && (_ALL_ANGLES as string[]).includes(a)
        );
    } catch { return []; }
}

/** Call after a successful generation to record the angle that was used. */
export function recordAngleUsed(angle: NarrativeAngle): void {
    try {
        const history = _readAngleHistory();
        // Keep last 8 entries (2 full rotations), move used angle to the end.
        const updated = [...history.filter(a => a !== angle), angle].slice(-8);
        localStorage.setItem(_ANGLE_HISTORY_KEY, JSON.stringify(updated));
    } catch { /* localStorage unavailable — silent */ }
}

/**
 * Picks the narrative angle least recently used by this user.
 * An optional `historyOverride` is accepted so unit tests can inject history
 * without touching localStorage.
 *
 * Algorithm:
 *   - Each angle gets a "recency score" = its position in history (higher = newer).
 *   - Angles not yet in history score 0 (freshest possible — pick these first).
 *   - Among ties, pick randomly so the first-time experience is still varied.
 */
export function selectFreshAngle(historyOverride?: NarrativeAngle[]): NarrativeAngle {
    const history = historyOverride ?? _readAngleHistory();
    const scored = _ALL_ANGLES.map(angle => {
        const lastIdx = history.lastIndexOf(angle); // -1 if never used
        return { angle, recency: lastIdx === -1 ? 0 : lastIdx + 1 };
    });
    scored.sort((a, b) => a.recency - b.recency);
    const minRecency = scored[0].recency;
    const candidates = scored.filter(s => s.recency === minRecency);
    return candidates[Math.floor(Math.random() * candidates.length)].angle;
}

function buildNarrativeAngleBlock(angle: NarrativeAngle): string {
    const a = NARRATIVE_ANGLES[angle];
    return `**NARRATIVE ANGLE — ${a.name.toUpperCase()}**: ${a.description}
- Summary focus: ${a.summaryFocus}.
- Bullet framing bias: ${a.bulletBias}.
- CRITICAL: this angle affects framing and emphasis ONLY. Facts, metrics, company names, dates must never change.`;
}
import { runQualityGate, consumePreviousViolationsBlock } from './cvQualityGate';

// ─── CV Generation Cache ──────────────────────────────────────────────────────
// In-memory LRU-style cache so regenerating the same profile+JD combo is instant.
// Entries expire after 30 minutes or when the cache reaches its size limit.
// IMPORTANT: Bump CV_RULES_VERSION whenever generation instructions change —
// this automatically invalidates every cached result so users always get CVs
// built under the latest rules.
const CV_RULES_VERSION = '2.5'; // bumped: 15-rule reminder, TITLE_FIELD_MAP, deterministic assembler
const CV_CACHE_MAX = 12;
const CV_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry { result: CVData; ts: number; }
const cvCache = new Map<string, CacheEntry>();

function cloneCVData(data: CVData): CVData {
    try {
        return structuredClone(data);
    } catch {
        return JSON.parse(JSON.stringify(data)) as CVData;
    }
}

function cvCacheKey(
    profile: UserProfile,
    jd: string,
    mode: string,
    purpose: string,
    opts?: {
        targetLanguage?: string;
        scholarshipFormat?: ScholarshipFormat;
        marketResearch?: MarketResearchResult | null;
        /** Confirmed-missing ATS keywords to pin — included so gap-targeted runs cache separately. */
        targetKeywords?: string[];
    }
): string {
    const profileSnap = {
        name: profile.personalInfo?.name,
        title: profile.personalInfo?.title,
        location: profile.personalInfo?.location,
        summary: profile.summary,
        exp: (profile.workExperience || []).map(e => `${e.jobTitle}@${e.company}:${e.startDate}-${e.endDate}`),
        edu: (profile.education || []).map(e => `${e.degree}@${e.school}`),
        skills: [...(profile.skills || [])].sort(),
        projects: (profile.projects || []).map(p => `${p.name}|${p.description || ''}`),
        sectionOrder: profile.sectionOrder || [],
        customSections: (profile.customSections || []).map(s => ({
            label: s.label,
            items: (s.items || []).map(i => i.title),
        })),
    };
    const profileHash = quickHash(JSON.stringify(profileSnap));
    const jdHash = quickHash((jd || '').replace(/\s+/g, ' ').trim());
    const marketHash = opts?.marketResearch ? quickHash(JSON.stringify(opts.marketResearch)) : 'none';
    const kwHash = (opts?.targetKeywords?.length)
        ? quickHash([...(opts.targetKeywords)].sort().join(','))
        : 'none';
    return [
        `v${CV_RULES_VERSION}`,
        `p:${profileHash}`,
        `jd:${jdHash}`,
        `m:${mode}`,
        `purpose:${purpose}`,
        `lang:${opts?.targetLanguage || 'default'}`,
        `scholarship:${opts?.scholarshipFormat || 'standard'}`,
        `market:${marketHash}`,
        `kw:${kwHash}`,
    ].join('|');
}

function cvCacheGet(key: string): CVData | null {
    const entry = cvCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CV_CACHE_TTL_MS) { cvCache.delete(key); return null; }
    return cloneCVData(entry.result);
}

function cvCacheSet(key: string, result: CVData): void {
    if (cvCache.size >= CV_CACHE_MAX) {
        // Evict the oldest entry
        const oldest = [...cvCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) cvCache.delete(oldest[0]);
    }
    cvCache.set(key, { result: cloneCVData(result), ts: Date.now() });
}

/** Call this when the user saves their profile — invalidates all cached CVs for that profile. */
export function invalidateCVCache(): void {
    cvCache.clear();
}

// ─── PRE-GENERATION PIPELINE ─────────────────────────────────────────────────
// Implements Blocks A, B, C, D from the Master AI Generation Instructions.

/**
 * Normalises wrong currency symbols/codes to the detected market currency.
 *
 * Anchor-wins rule: the FIRST bullet of each role is always exempt — it is
 * typically a scope-anchor bullet that pins a specific portfolio/contract
 * figure the user entered themselves. A specific anchor ("$2M exactly")
 * always beats the general currency rule ("use KES").
 *
 * All other bullets and the professional summary are normalised
 * deterministically. Only fires when detectedCurrency is a known non-NONE
 * code, and only rewrites tokens whose currency differs from the detected one.
 */
function _normalizeCurrencyInCV(cv: CVData, detectedCurrency: string): CVData {
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
function detectCurrency(jd: string, location: string): string {
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
function detectSeniority(workExperience: Array<{ startDate: string; endDate: string }>): string {
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
function detectScenario(
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

function classifyDomains(text: string): Set<string> {
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
function detectDomainPivot(
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
function buildPivotBlock(pivot: { from: string[]; to: string[] } | null): string {
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
function buildScenarioBlock(scenario: 'A' | 'B' | 'C' | 'D' | 'standard', mode: string): string {
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
function detectMarket(currency: string): string {
    const map: Record<string, string> = {
        KES: 'East Africa', UGX: 'East Africa', TZS: 'East Africa',
        NGN: 'West Africa', ZAR: 'Southern Africa',
        GBP: 'UK', USD: 'USA / Global', EUR: 'European', AED: 'Gulf',
        NONE: 'Unknown — counts and percentages only',
    };
    return map[currency] || 'Unknown — counts and percentages only';
}

/** Gap detection — finds employment gaps longer than 3 months and describes them. */
interface GapInfo {
    gapMonths: number;
    fromRole: string;
    toRole: string;
    gapStart: string; // e.g. "Jun 2020"
    gapEnd: string;   // e.g. "Jan 2024"
}

function detectGaps(workExperience: Array<{ company: string; jobTitle: string; startDate: string; endDate: string }>): GapInfo[] {
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
function buildGapContext(gaps: GapInfo[]): string {
    if (gaps.length === 0) return '';
    const lines = gaps.map(g =>
        `• ${g.gapMonths}-month gap between "${g.fromRole}" (ended ${g.gapStart}) and "${g.toRole}" (started ${g.gapEnd})`
    );
    return `\nDETECTED EMPLOYMENT GAPS — handle intelligently in the narrative:\n${lines.join('\n')}\n`;
}

/** Returns the relevant metrics ceiling string for the validator prompt. */
function buildMetricsCeiling(seniority: string, currency: string): string {
    type SeniorityKey = 'intern' | 'junior' | 'mid' | 'senior';
    type CurrencyKey = 'KES' | 'NGN' | 'ZAR' | 'GBP' | 'USD' | 'EUR' | 'AED' | 'NONE';

    const ceilings: Record<SeniorityKey, Record<CurrencyKey, string>> = {
        intern: {
            KES: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            NGN: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            ZAR: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            GBP: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            USD: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            EUR: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            AED: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            NONE: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
        },
        junior: {
            KES: 'Max project value: KES 4M. Max revenue/yr: KES 6M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            NGN: 'Max project value: NGN 40M. Max revenue/yr: NGN 60M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            ZAR: 'Max project value: ZAR 400K. Max revenue/yr: ZAR 600K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            GBP: 'Max project value: GBP 250K. Max revenue/yr: GBP 500K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            USD: 'Max project value: USD 300K. Max revenue/yr: USD 600K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            EUR: 'Max project value: EUR 280K. Max revenue/yr: EUR 550K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            AED: 'Max project value: AED 1.1M. Max revenue/yr: AED 2.2M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            NONE: 'No monetary figures. Max projects: 8. Max team: 3. Max efficiency gain: 18%.',
        },
        mid: {
            KES: 'Max project value: KES 18M. Max revenue/yr: KES 22M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            NGN: 'Max project value: NGN 180M. Max revenue/yr: NGN 220M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            ZAR: 'Max project value: ZAR 1.8M. Max revenue/yr: ZAR 2.2M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            GBP: 'Max project value: GBP 1.1M. Max revenue/yr: GBP 1.4M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            USD: 'Max project value: USD 1.3M. Max revenue/yr: USD 1.6M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            EUR: 'Max project value: EUR 1.2M. Max revenue/yr: EUR 1.5M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            AED: 'Max project value: AED 4.8M. Max revenue/yr: AED 5.9M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            NONE: 'No monetary figures. Max projects: 18. Max team: 10. Max efficiency gain: 28%.',
        },
        senior: {
            KES: 'Max project value: KES 120M. Max revenue/yr: KES 90M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            NGN: 'Max project value: NGN 1.2B. Max revenue/yr: NGN 900M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            ZAR: 'Max project value: ZAR 12M. Max revenue/yr: ZAR 9M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            GBP: 'Max project value: GBP 7.2M. Max revenue/yr: GBP 5.4M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            USD: 'Max project value: USD 8.5M. Max revenue/yr: USD 6.4M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            EUR: 'Max project value: EUR 7.8M. Max revenue/yr: EUR 5.9M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            AED: 'Max project value: AED 31M. Max revenue/yr: AED 23M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            NONE: 'No monetary figures. Max projects: 45. Max team: 25. Max efficiency gain: 42%.',
        },
    };

    const s = (seniority as SeniorityKey) in ceilings ? (seniority as SeniorityKey) : 'junior';
    const c = (currency as CurrencyKey) in ceilings[s] ? (currency as CurrencyKey) : 'NONE';
    return ceilings[s][c];
}

/** Build the mode-specific prompt block (Part 5 of Master Instructions). */
function buildModePromptBlock(
    mode: string,
    currency: string,
    seniority: string,
    market: string,
    blockD: string,
    gaps: GapInfo[] = []
): string {
    const blocks = `
BLOCK A — DETECTED CURRENCY: ${currency === 'NONE' ? 'NONE — use no monetary figures anywhere. Counts, percentages, and units only.' : currency}
BLOCK B — DETECTED SENIORITY: ${seniority}
BLOCK C — DETECTED MARKET: ${market}
BLOCK D — COMPANY CONTEXT: ${blockD || 'No company identified — proceed on JD signals alone.'}
${buildGapContext(gaps)}`;

    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // ─── Shared rules injected into every mode ────────────────────────────────
    const sharedHumanizationRules = `
BULLET LENGTH & RHYTHM RULES (mix lengths PROPORTIONALLY in every role):
- Within EACH role, MIX three bullet lengths to give the eye visual rhythm:
    • PUNCHY bullets (8–14 words): a single crisp sentence — verb, what, outcome.
    • STANDARD bullets (15–22 words): the workhorse length.
    • NARRATIVE bullets (25–40 words, two sentences): one short context sentence + one outcome sentence — reserve for the strongest achievement.
- Proportional targets (scale with the role's total bullet count N):
    • Punchy   ≈ 25% of bullets — minimum 1 per role.
    • Standard ≈ 50% of bullets — the bulk of the role.
    • Narrative ≈ 15–25% of bullets — minimum 1 if N ≥ 4; up to 2 if N ≥ 8; up to 3 if N ≥ 10.
- Worked examples (N = total bullets in the role):
    • N=3  → 1 punchy + 2 standard           (narrative optional)
    • N=4  → 1 punchy + 2 standard + 1 narrative
    • N=5  → 1 punchy + 3 standard + 1 narrative
    • N=6  → 2 punchy + 3 standard + 1 narrative
    • N=7  → 2 punchy + 4 standard + 1 narrative
    • N=8  → 2 punchy + 4 standard + 2 narrative
    • N=9  → 2 punchy + 5 standard + 2 narrative
    • N=10 → 2 punchy + 5 standard + 3 narrative
- Three bullets in a row of similar length within the same role = failure. The reader's eye should land on different visual masses as it scans down.
- A role with ≥5 bullets that uses only ONE length band (all standard, all narrative, or all punchy) = failure, regardless of how many bullets it has.
- Hard floors and ceilings: under 8 words = stub (failure). Over 45 words = rambling (failure).
- Structure (every length): [Strong Verb] + [What + How/Where/Who] + [Measurable Outcome or Observable Impact].

METRIC DENSITY RULES:
- TARGET: At least 40% of bullets per role MUST carry a number or measurable outcome. With 5 bullets, aim for 2–3 with metrics. With 8 bullets, aim for 3–4. Falling below 30% metric density is a FAILURE.
- Max 65% of bullets per role may contain a number — keep at least 1–2 per role purely qualitative so the CV doesn't read as mechanically perfect.
- Mix metric types: percentages, headcounts, currency, time saved, volume, site count, project count. Never repeat the same metric type in consecutive bullets.
- ROUND-NUMBER VARIATION (binding): Across the entire CV, NO MORE THAN 40% of numeric metrics may be multiples of 5 or 10. Real recruiters spot strings like "25%, 15%, 20%, 30%" instantly as AI output. Mix in specific numbers — 23%, 17%, 41%, 8.5h/wk, 47, 112, 1,340. If you must round, round to odd boundaries (3, 7, 11, 23) at least half the time.
- Bullets without numbers must still be vivid: "across 4 counties", "for a national client base", "within a 6-person team".
- METRIC SYNTHESIS (mandatory for engineering, operations, sales, field-based roles — use when explicit numbers are absent):
  You MUST synthesize conservative, credible metrics from available context — duration, scope keywords, seniority, and domain norms. Mark estimates with approximation language ("~", "12+", "up to X"). A conservative estimate always beats a vague description.
  Synthesis rules by domain:
  • Engineering / Construction: infer project count from tenure (18mo ≈ 4–8 projects), site area from scope keywords ("multiple farms" ≈ "12+ sites"), team size from role level (junior=2–3, mid=4–6), budget from project type norms.
  • Irrigation / Water: "multiple commercial farms" → "12+ commercial farm clients"; "site assessments" → "conducted 20+ site assessments"; "hydraulic design" → "designed systems covering 50+ hectares".
  • Sales / Business development: infer pipeline value, client count, or growth % from tenure and seniority norms.
  • Operations / Logistics: infer volume, cycle time reduction, or cost savings % from role scope.
  • Civil / Infrastructure: infer km of road, number of drawings, project value range from role level and market norms.
  THE ONLY EXCEPTION: never synthesize a monetary amount (KES, USD, etc.) unless the user's profile explicitly mentions revenue, contract value, or budget — use counts and percentages instead.

GAP HANDLING RULES:
${gaps.length === 0
    ? '- No significant gaps detected in this profile.'
    : `- Gaps detected (see Block context above). Handle each intelligently:
  - If the gap is under 12 months: address it subtly in the summary or the adjacent role bullets ("while pursuing independent professional development", "during a period of focused study and certification").
  - If the gap is 12+ months: in Honest/Boosted modes, reference it briefly in the summary with a neutral, human framing. In Aggressive mode, you may use the self-directed entry rules below to fill the most significant gap.
  - Never leave a long gap completely unacknowledged if it appears suspicious — a recruiter will notice it and make negative assumptions. Control the narrative.
  - If the gap appears to coincide with a period of studying (e.g., 2020 attachment → 2024 intern suggests degree completion), frame the intervening period as academic: "Following completion of [degree/studies] in [year]..."`}
`;

    if (mode === 'honest') {
        return `
${blocks}

You are a professional CV writer operating in HONEST MODE for the global job market.

YOUR JOB IN THIS MODE:
Rewrite the user's real experience to be the strongest, clearest, most ATS-optimised version of itself. You are not adding anything that did not happen. You are making what did happen communicated in the most compelling way possible for this specific job in this specific market.

WHAT YOU CAN DO:
- Rewrite bullet points using strong, precise action verbs that match the job description's own language. Every verb must be different.
- Mirror exact keywords and terminology from the job description — if the JD says "stakeholder engagement", use those exact words. Place the 3 most critical JD keywords in the summary.
- Reorder bullet points within each role so the most JD-relevant achievement appears first, least relevant last.
- Improve grammar, sentence structure, and clarity throughout. Remove all filler phrases immediately.
- Use Block D company context to align language and tone precisely. A corporate firm gets precise, formal language. A startup gets action-focused, impact-driven language. An NGO gets mission-oriented, beneficiary-focused language.

METRIC RULE — CONTEXTUAL INFERENCE ONLY:
You may add a metric ONLY when there is enough context in what the user wrote to reasonably infer it.
  ALLOWED: User wrote "managed projects for 2 years" → infer "Managed 4–6 [project type] projects" (LOW end of ${seniority} range in ${market}).
  ALLOWED: User wrote "handled client accounts in Nairobi region" → infer "Managed 8–12 client accounts across Nairobi and surroundings".
  ALLOWED: User wrote "exceeded sales targets" → infer "Exceeded sales targets by 10–12%" (conservative LOW end).
  NOT ALLOWED: User gave zero context about quantity, scale, or value → describe without any number at all.
  NOT ALLOWED: Adding monetary figures when no financial scope was mentioned.
  THE TEST: Can you reasonably infer this number from what the user wrote? YES → use LOW end. NO → describe without a number.

METRIC CEILINGS for ${seniority} in ${market}: ${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Express everything as percentages, counts, and units.'
    : `Use only ${currency} throughout. If more than one currency symbol appears anywhere in the document, remove ALL monetary figures and rewrite using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company, role, or experience not provided by the user
- Change any employment dates for any reason
- Invent any metric the user did not mention or clearly imply
- Add skills the user did not list anywhere in their profile
- Change a job title to something grander than what was held
- Write any currency other than ${currency === 'NONE' ? 'none (no monetary figures at all)' : currency}
- Mix two currencies anywhere in the same document
- Ignore the company context in Block D
`;
    }

    if (mode === 'boosted') {
        return `
${blocks}

You are a professional CV writer operating in BOOSTED MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked. They cannot be changed. No new companies or employed roles may be added. This is absolute and non-negotiable.

YOUR JOB IN THIS MODE:
Take the user's real experience and make it as strong as it can plausibly be — using implied responsibilities standard for this role type and seniority in the detected market, and quantifying vague achievements using the low-to-mid range of the detected market metrics. Everything added must be something the candidate could confidently discuss and defend in an interview.

WHAT YOU CAN DO (everything in Honest Mode, plus):
- Add implied responsibilities that are genuinely standard for this role type at this seniority level. These are tasks any experienced recruiter would assume someone in this position carried out, even if the user did not list them explicitly. A junior water engineer who listed "site surveys" implicitly also coordinated with contractors, reviewed technical specs, and reported to a senior engineer — these can be added as bullets.
- Quantify vague achievements using the LOW-TO-MID end of the metrics table for ${market} at ${seniority} level. Never use the high end — that belongs to Aggressive Mode.
- Add 1–2 relevant skills from the job description that are genuinely plausible for this role type, industry, and background. The test: would any experienced recruiter believe someone in this position plausibly has this skill? If any doubt — do not add it.
- Strengthen the professional summary using Block D company context. Align language, terminology, and tone to what this specific company values and how they talk about their work publicly.
- For significant gaps (shown in Block context above): include a brief, natural-sounding reference in the summary or in the bullets adjacent to the gap period.

NUMBERS MUST LOOK REAL — the moment a number looks invented, the whole CV is suspect:
- Use 2.3M, not 2M. Use 11%, not 10%. Use 14 clients, not 15. Use 7 projects, not 5 or 10.
- Irregular, specific numbers read as real. Clean, round numbers read as made up.

METRIC CEILINGS (MAXIMUM allowed — midpoint of range):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures. Counts, percentages, and units only throughout the entire document.'
    : `Use only ${currency} throughout the entire document. Never mix currencies. Never use a currency that was not detected.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company or employed role not provided by the user
- Change any employment dates for any reason
- Use metrics above the MIDPOINT of the detected market table
- Add skills that are implausible for the background, industry, or role type
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
    }

    // aggressive
    return `
${blocks}

You are a professional CV writer operating in AGGRESSIVE MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked and sacred. They cannot be changed, abbreviated, extended, or replaced under any circumstances whatsoever. This is the one rule in this mode that has zero flexibility. Every other decision is subordinate to it.

YOUR JOB IN THIS MODE:
Produce the most powerful version of this CV that is still fully credible to a recruiter in the detected market. Bold, targeted, keyword-saturated, and deeply aligned to the target company. Every single claim must still be defensible if a recruiter asks the candidate about it face-to-face in an interview. If a claim cannot be defended in an interview — remove it.

WHAT YOU CAN DO (everything in Boosted Mode, plus):
- Use the MID-TO-HIGH end of the metrics table for ${market} at ${seniority} level. The HIGH end of the range is the absolute hard ceiling — never exceed it, never get close to exceeding it.
- Add strong stretch responsibilities that are plausible for someone performing at the very top of their current role — not someone who has already been promoted beyond it. A high-performing junior engineer leads complex projects and mentors new hires. They do NOT manage a team of 15 or control a multi-million portfolio.
- Write a highly targeted, executive-quality professional summary positioning the user as the ideal candidate for this specific role at this specific company. Every sentence earns its place by connecting the user's real experience to what the JD and Block D say the company needs. No generic sentences. No filler. No padding.
- Maximise keyword density from the JD throughout every section. Every keyword appears inside a sentence that demonstrates genuine competence — not just mentioned. The CV must read like a human wrote it, not a keyword list.
- Use Block D company context deeply and specifically. Mirror their language, their values, their industry terminology. A recruiter at that company should feel the CV was written by someone who already understands their world from the inside.

FILLING A GENUINE EXPERIENCE GAP:
${gaps.length === 0
    ? 'No significant gaps detected — do not add any self-directed entry.'
    : `Gaps detected (see Block context above). You may add ONE self-directed work entry to fill the most significant gap only, if and only if ALL of these rules are satisfied:
- RULE A: Self-directed work only — freelance, independent project, short-term contract, or voluntary work. NEVER an employed role at a named company. The reason: a named employed role can be checked by calling HR. A freelance or consulting entry cannot be disproved in the same way — freelancers commonly work without formal contracts or payroll records.
- RULE B: The work type must exactly match the user's real skills. A water engineer's self-directed entry involves water engineering. A sales professional's entry involves sales consulting. Do not introduce any skill type that does not already exist in the profile.
- RULE C: Dates must sit entirely within the gap. No overlap with any real employment on either side. Cannot extend beyond today's date.
- RULE D: Seniority must match the surrounding roles. No sudden title promotion within the self-directed entry.
- RULE E: Use the LOW end of metrics for this entry — it must be the most modest entry on the CV. The real jobs must look more impressive than the gap filler.
- RULE F: Only ONE self-directed entry maximum. If there are multiple gaps, fill only the most professionally damaging one. Leave all others unfilled.
If ANY rule cannot be satisfied — do not add the entry. An unfilled gap is better than a fabricated record that can destroy the candidate's credibility.`}

NUMBERS MUST LOOK REAL — experienced recruiters catch inflated CVs by the numbers first:
- Use 13%, not 15%. Use KES 3.8M, not KES 4M. Use 22 clients, not 20 or 25. Use 7 projects, not 5 or 10. Use USD 287K, not USD 300K.
- Suspiciously round numbers are the single most common tell on an inflated CV.

METRIC CEILINGS (ABSOLUTE MAXIMUM — high end of range — never exceed):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Percentages, counts, and units only throughout.'
    : `Use only ${currency} throughout. Final pass before returning: scan every bullet for currency symbols. If more than one appears anywhere in the entire document, remove ALL monetary figures and rewrite those bullets using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Change any provided company name or date for any reason
- Add an employed role at any company the user did not actually work at
- Invent skills or experience types the user does not have
- Use metrics above the HIGH end of the detected market table
- Apply senior-level metrics to a junior-level profile
- Create a backwards career timeline
- Add more than one self-directed entry per CV
- Use a self-directed entry that overlaps with real employment dates
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
}

/** PART 6 — Groq validator. Runs after Boosted and Aggressive generation. */
async function runGroqValidator(
    cvData: CVData,
    rawExperience: string,
    currency: string,
    seniority: string,
    market: string,
    scenario: 'A' | 'B' | 'C' | 'D' | 'standard' = 'standard',
    hasSourceProjects: boolean = false
): Promise<CVData> {
    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // Scenario-specific checks injected only when relevant
    const scenarioChecks = scenario === 'standard' ? '' : `
CHECK 7 — EMPTY SECTION GUARD (applies to all scenarios)
Scan the entire CV. If any section key is present but its value is an empty array, empty string, or null → FLAG "Empty section: [name]" → Remove the key entirely.
An absent section is professional. An empty section header with no content is not.

CHECK 8 — FABRICATED SECTION GUARD
${scenario === 'B' || scenario === 'D'
    ? `SCENARIO ${scenario}: The source profile has NO personal projects.
If the generated CV contains a "projects" array with any entries → FLAG "Fabricated projects section" → Remove the entire projects array.
EXCEPTION: If a project entry is explicitly labelled as "Academic Project, [Institution], [Year]" AND the user's education data supports it → keep it.`
    : scenario === 'A'
    ? `SCENARIO A: The source profile has NO work experience AND NO personal projects.
If the generated CV contains an "experience" array with any entries → FLAG "Fabricated work experience" → Remove the entire experience array.
If the generated CV contains project entries NOT labelled as academic projects → FLAG "Fabricated project" → Remove those entries.`
    : scenario === 'C'
    ? `SCENARIO C: The source profile has NO work experience.
If the generated CV contains an "experience" array with entries that are NOT internships, attachments, volunteer technical work, or freelance work → FLAG "Fabricated work experience" → Remove those entries.`
    : ''}

CHECK 9 — SKILLS EVIDENCE AUDIT (thin CVs only — seniority: ${seniority})
${seniority === 'intern' ? `This is an intern/entry-level profile. Every skill listed must be directly traceable to:
  a) A named course or module in the education section, OR
  b) A project entry in the CV, OR
  c) A bullet point in an experience entry.
Skills with no evidence trail → FLAG "Unevidenced skill: [name]" → Remove from skills array.
Maximum tolerance: 0 unevidenced skills for Scenario A/C profiles.` : 'Skip Check 9 — not a thin CV profile.'}

CHECK 10 — SCENARIO SUMMARY CONSISTENCY
${scenario === 'A' ? `SCENARIO A: The summary must NOT imply professional work history. If it contains phrases like "X years of professional experience", "proven track record in [industry]", or any language implying paid employment → FLAG "Summary implies non-existent experience" → Rewrite as a Foundation Summary: [Degree/field/institution] + [specific capabilities from coursework] + [one academic achievement] + [readiness to contribute].`
    : scenario === 'C' ? `SCENARIO C: The summary must NOT imply paid work history. It must be a Projects-Led Summary: [identity as builder] + [strongest project outcome with metric] + [core technical stack] + [readiness to contribute to a team].`
    : scenario === 'D' ? `SCENARIO D: The summary must NOT overstate experience. It must be an Emerging Professional summary grounded in the single internship/attachment — no claims beyond what that role and education can support.`
    : ''}
`;

    const validatorPrompt = `
You are a strict CV quality validator for the global job market.

You have received:
- The generated CV to validate (below)
- The user's original raw work experience (source of truth)
- DETECTED CURRENCY: ${currency}
- DETECTED SENIORITY: ${seniority}
- DETECTED MARKET: ${market}
- METRIC CEILINGS: ${metricsCeiling}
- CANDIDATE SCENARIO: ${scenario} ${scenario !== 'standard' ? '(special handling required — see checks 7–10)' : '(standard profile)'}
- SOURCE PROFILE HAS PROJECTS: ${hasSourceProjects}

USER'S ORIGINAL RAW EXPERIENCE (source of truth — company names from here are the ONLY valid ones):
${rawExperience}

GENERATED CV TO VALIDATE:
${JSON.stringify(cvData)}

Run ALL checks below in strict order. Do not skip any check.

CHECK 1 — COMPANY INTEGRITY
Every company name in the generated CV must be one of:
  a) A company provided by the user in their original experience
  b) A self-directed freelance/consulting entry with no company name ("Independent Consultant" or "Freelance [Role]")
Any invented company name → FLAG "Unverifiable company: [name]" → Remove the entire experience entry.

CHECK 2 — TIMELINE LOGIC
No role's start date after its own end date. No two full-time roles at different employers overlap by more than 1 month. Any self-directed entry must sit cleanly within a detected gap.
Any timeline violation → FLAG and correct where obvious, remove where it cannot be explained.

CHECK 3 — METRIC BELIEVABILITY & TYPE CLASSIFICATION
Apply the metric ceilings above. Anything above the ceiling → FLAG "Metric too high for ${seniority} in ${market}: [metric]" → Reduce to the top of the acceptable range.
Suspiciously round numbers (exactly 50, exactly 10M, exactly 20%) → make them specific and slightly irregular.

METRIC TYPE RULES — apply these BEFORE checking the ceiling:
a) SALARY/COMPENSATION metrics — any phrase like "earning X/month", "salary of X", "package of X", "take-home X", "CTC X", "remuneration X" in an experience bullet → FLAG "Personal salary in bullet: [phrase]" → Remove the salary phrase entirely. A CV bullet describes impact and achievement, not personal pay.
b) PROJECT VALUE / BUDGET metrics — phrases like "managed a KES X project", "project budget of X", "contract value X", "project worth X" are LEGITIMATE for civil engineers, project managers, procurement officers, and contractors. Apply the "Max project value" ceiling, not the "Max revenue" ceiling.
c) SALES / REVENUE metrics — phrases like "generated X in revenue", "closed X in deals", "grew revenue by X%" are LEGITIMATE for sales, business development, and commercial roles. Apply the "Max revenue/yr" ceiling.
d) Do NOT confuse a civil engineer's "KES 50M infrastructure project" with a fabricated revenue claim — judge by context (project, contract, budget, scheme, works = project value; revenue, sales, deals, bookings = sales metric).

CHECK 4 — CURRENCY CONSISTENCY
Scan every bullet, section, and summary for currency symbols. More than one distinct currency → FLAG "Currency mixing" → Remove all monetary figures from affected sections, rewrite as percentages and counts.
Any currency symbol when DETECTED CURRENCY is NONE → FLAG → Remove all monetary figures.

CHECK 5 — SENIORITY CONSISTENCY
Job titles and responsibilities must match ${seniority} level.
Intern/Junior with team of 10+ → FLAG. Junior with multi-million claims → FLAG. "Director/Head of/VP" under 5 years → FLAG.
Any mismatch → rewrite to correct seniority level.

CHECK 6 — SKILLS PLAUSIBILITY
Every skill must be plausible for the user's industry, role type, and background.
Completely disconnected skills → FLAG "Implausible skill: [name]" → Remove.
${scenarioChecks}
OUTPUT FORMAT — return JSON only, no markdown, no explanation:
{"valid": true|false, "flags": ["description1", ...], "cv": <full corrected cv data object>}
The "cv" field must ALWAYS be present — even when all checks pass.
`;

    const validatorSystem = _validatorSystem || 'You are a strict CV quality validator. Return only valid JSON.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // ── Safe merge: if the validator response was truncated and dropped roles/projects,
    // restore them from the pre-validation cvData so the user never loses content.
    const safeValidatorMerge = (validatedCv: any): CVData => {
        if (!validatedCv || typeof validatedCv !== 'object') return cvData;

        let merged = { ...validatedCv };

        // Restore experience roles that didn't fit in the validator's token budget
        if (Array.isArray(cvData.experience) && cvData.experience.length > 0) {
            const retainedExp: any[] = Array.isArray(merged.experience) ? merged.experience : [];
            if (retainedExp.length < cvData.experience.length) {
                console.warn(
                    `[CV Validator] Response had ${retainedExp.length}/${cvData.experience.length} roles — ` +
                    `restoring ${cvData.experience.length - retainedExp.length} truncated role(s) from pre-validation CV.`
                );
                const validatedKeys = new Set(retainedExp.map((e: any) => `${e.company}|${e.jobTitle}`));
                const restored = [...retainedExp];
                for (const orig of cvData.experience) {
                    if (!validatedKeys.has(`${orig.company}|${orig.jobTitle}`)) {
                        restored.push(orig);
                    }
                }
                // Re-sort to match original profile order
                const order = new Map(cvData.experience.map((e, i) => [`${e.company}|${e.jobTitle}`, i]));
                restored.sort((a: any, b: any) =>
                    (order.get(`${a.company}|${a.jobTitle}`) ?? 999) -
                    (order.get(`${b.company}|${b.jobTitle}`) ?? 999)
                );
                merged = { ...merged, experience: restored };
            }
        }

        // Restore projects if validator dropped them entirely (token budget exhausted after experience)
        if (Array.isArray(cvData.projects) && cvData.projects.length > 0) {
            if (!Array.isArray(merged.projects) || merged.projects.length === 0) {
                console.warn('[CV Validator] Projects absent in validator response — restoring from pre-validation CV.');
                merged = { ...merged, projects: cvData.projects };
            }
        }

        // Restore certifications if dropped
        if (Array.isArray(cvData.certifications) && cvData.certifications.length > 0) {
            if (!Array.isArray(merged.certifications) || merged.certifications.length === 0) {
                merged = { ...merged, certifications: cvData.certifications };
            }
        }

        return merged as CVData;
    };

    // Use Cloudflare Workers AI only when it is the selected provider.
    // When user has chosen Claude or Gemini, skip directly to groqChat (which
    // routes through their selected provider) — no wasted timeout on Worker AI.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('cvValidate', validatorPrompt, {
                system: validatorSystem,
                temperature: 0.1,
                json: true,
                maxTokens: 6000,
            });
            if (cf) {
                try {
                    const parsed = JSON.parse(stripFences(cf));
                    if (parsed.flags && parsed.flags.length > 0) {
                        console.warn('[CV Validator] Flags raised (cf):', parsed.flags);
                    }
                    console.log('[CV Validator] Pass complete via Cloudflare Workers AI (tiered: cvValidate).');
                    return safeValidatorMerge(parsed.cv || cvData);
                } catch (parseErr) {
                    console.warn('[CV Validator] Worker JSON parse failed, falling back to selected provider:', parseErr);
                }
            }
        } catch (cfErr) {
            console.warn('[CV Validator] Worker call failed, falling back to selected provider:', cfErr);
        }
    }

    try {
        const result = await groqChat(GROQ_LARGE, validatorSystem, validatorPrompt, { temperature: 0.1, json: true, maxTokens: 6000 });
        const parsed = JSON.parse(stripFences(result));
        if (parsed.flags && parsed.flags.length > 0) {
            console.warn('[CV Validator] Flags raised:', parsed.flags);
        }
        return safeValidatorMerge(parsed.cv || cvData);
    } catch (e) {
        console.error('[CV Validator] Validation failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 7 — Humanization Audit Pass.
 * Runs after the Groq validator (or after Gemini generation in Honest mode).
 * Checks and fixes: short bullets, banned phrases, metric overload, and uniform rhythm.
 */
/**
 * Build the PROBLEM 9 ("must-fix leaks") block for the audit prompt.
 *
 * We only forward leak types where the LLM has a fighting chance of doing better
 * than the deterministic layer because it has surrounding context AND access to
 * the candidate's voice — round numbers, orphan metrics (gerund-without-digit
 * fragments the regex was forced to drop), and band imbalance (rhythm).
 *
 * Why these three specifically:
 *   • round_number          — jitter is deliberately disabled (it lied about real
 *                             100% achievements). The AI can ask itself "is this
 *                             a placeholder or the truth?" using surrounding
 *                             context, which the regex cannot.
 *   • orphan_metric         — stripOrphanMetrics conservatively DROPS the dangling
 *                             clause to avoid fabricating outcomes. The AI can
 *                             rebuild the bullet with real claims from the rest
 *                             of the role.
 *   • bullet_band_imbalance — pure rhythm flag. Already covered by PROBLEM 5
 *                             but worth surfacing the SPECIFIC offending role
 *                             so the editor doesn't have to re-derive it.
 *
 * Everything else (banned phrases, repeated phrases, tense, casing, whitespace,
 * skill canonicalisation, etc.) the deterministic layer already FIXES — it would
 * be wasteful to re-ask the LLM.
 */
function buildMustFixLeakBlock(leaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }>): string {
    const FORWARDED = new Set(['round_number', 'orphan_metric', 'bullet_band_imbalance']);
    const filtered = leaks.filter(l => FORWARDED.has(l.leakType));
    if (filtered.length === 0) return '';

    // Cap at 12 entries to keep the prompt token-budget sane on heavy CVs.
    const capped = filtered.slice(0, 12);
    const lines = capped.map((l, i) => {
        const loc = l.fieldLocation ? ` [${l.fieldLocation}]` : '';
        const snippet = l.contextSnippet ? ` — "${l.contextSnippet.slice(0, 140)}"` : '';
        return `  ${i + 1}. ${l.leakType}${loc}: ${l.phrase || ''}${snippet}`;
    }).join('\n');

    return `

PROBLEM 9 — DETERMINISTIC PURIFY FLAGGED THESE SPECIFIC LEAKS (must fix every one):
The deterministic purify layer ran a pre-scan and identified the following items it could NOT safely auto-fix without inventing content. You have access to the full CV context and the candidate's voice — fix them using truthful surrounding signal:

${lines}

How to fix each leakType:
  • round_number — the metric reads as suspicious (e.g. "exactly 25%", "exactly 50,000", "exactly 100"). If a less-round figure (e.g. "27%", "48,200", "11") is supported by other parts of the same bullet/role, use that. If you cannot ground a precise number, REWRITE the bullet to use scope language ("across 11 counties", "for the largest cohort to date") instead of inventing a digit. Never fabricate a number.
  • orphan_metric — the bullet contains/contained a gerund clause that promised a metric but had none ("achieving water savings", "cutting lead time"). The regex stripped the clause; you should REBUILD the outcome with a concrete result drawn from the rest of the role's responsibilities, the company name, or the role title. If no real outcome can be grounded, leave the bullet shorter rather than fabricate.
  • bullet_band_imbalance — the named role has ≥5 bullets all in the same length band. Apply PROBLEM 5's mix rule SPECIFICALLY to this role: shorten one bullet to the punchy band (8–14 words) AND/OR expand the strongest bullet into a two-sentence narrative (25–40 words).
`.trimEnd();
}

async function runHumanizationAudit(cvData: CVData, mustFixLeaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }> = []): Promise<CVData> {
    // Sync the prompt with the LIVE banned-phrase list from the worker's KV cache
    // (D1 → KV → here). Falls back to the small hardcoded list when offline so the
    // pipeline never breaks. Cap at 80 phrases to keep the prompt token-budget sane.
    const HARDCODED_BANNED_BULLETS = '"delve", "robust", "seamlessly", "synergy", "cutting-edge", "state-of-the-art", "passionate about", "dynamic team", "innovative solutions", "results-driven", "detail-oriented", "team player", "go-getter", "responsible for", "helped with", "assisted in", "tasked with", "worked on", "was part of", "participated in", "contributed to"';
    const HARDCODED_BANNED_SUMMARY = '"passionate", "driven", "innovative", "seasoned professional", "dynamic", "cutting-edge", "result-oriented", "proactive", "detail-oriented", "versatile"';
    let liveBannedBullets = HARDCODED_BANNED_BULLETS;
    let liveBannedSummary = HARDCODED_BANNED_SUMMARY;
    let liveCount = 0;
    try {
        const banned = await getCachedBannedPhrases();
        if (banned && banned.length) {
            const phrases = banned.map(b => b.phrase).filter(p => typeof p === 'string' && p.length > 0);
            // Cap at 40 (not 80) — keeps the humanizer prompt under Groq's TPM limit
            // while still covering the most common AI-ism violations.
            const bulletList = phrases.slice(0, 40);
            liveBannedBullets = bulletList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            // Summary check: single-word adjectives only (1 token, no spaces)
            const summaryList = phrases.filter(p => !p.includes(' ') && p.length <= 18).slice(0, 20);
            if (summaryList.length >= 5) {
                liveBannedSummary = summaryList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            }
            liveCount = phrases.length;
        }
    } catch (e) {
        console.warn('[CV Humanizer] Live banned-phrase fetch failed, using hardcoded list:', e);
    }
    if (liveCount > 0) {
        console.log(`[CV Humanizer] Audit prompt synced with ${liveCount} live banned phrases from CV engine.`);
    }

    const mustFixBlock = buildMustFixLeakBlock(mustFixLeaks);
    if (mustFixBlock) {
        console.log(`[CV Humanizer] Forwarding ${mustFixLeaks.filter(l => ['round_number', 'orphan_metric', 'bullet_band_imbalance'].includes(l.leakType)).length} must-fix leak(s) into audit prompt.`);
    }

    let auditPrompt = `
You are a senior career writing editor with 20 years of experience. You are reviewing a CV JSON object.
Your ONLY job is to fix the specific problems listed below. Do not rewrite anything that isn't broken. Do not change dates, company names, job titles, or skills. Return the complete, corrected JSON.

PROBLEMS TO FIX — check every experience role's responsibilities array:

PROBLEM 1 — STUB BULLETS (expand any bullet under 8 words):
A bullet under 8 words is a stub — too thin to carry any signal. Expand it by adding context: scope, who was affected, the outcome, or how it was done. Keep it truthful to what the bullet was saying. Bullets in the 8–14 word "punchy" band are intentional and should be kept short and crisp.
Example fix:
  BEFORE: "Managed client accounts."  (3 words — stub)
  AFTER:  "Managed 11 commercial accounts across Eastern Kenya."  (8 words — punchy, kept short)

PROBLEM 2 — BANNED PHRASES (replace these with specific, direct language):
Scan for and replace: ${liveBannedBullets}.
Replace each with a direct action verb or a specific description of what was actually done.

PROBLEM 3 — METRIC DENSITY (target 40–65% of bullets per role having a number):
Count bullets per role.
• If MORE than 65% contain a number: rewrite the excess bullets to remove numbers but keep them vivid using scope language ("across 4 counties", "for a national client base", "within a small cross-functional team"). Keep numbers in the bullets with the STRONGEST outcomes; remove from the weakest.
• If FEWER than 30% contain a number AND the role is in engineering, sales, operations, finance, or field-based work: add a conservative inferred metric to the weakest descriptive bullets. Use approximation language ("~", "12+", "up to X"). Never invent figures that cannot be inferred from the bullet content.
Priority: keep numbers in the bullets with the STRONGEST outcomes.

PROBLEM 4 — DUPLICATE VERB STARTERS (no two bullets across the whole document may start with the same verb):
Scan all responsibilities across ALL roles. If two bullets start with the same verb, rewrite the second one to start with a different strong action verb.

PROBLEM 5 — MONOTONE BULLET RHYTHM (each role must MIX bullet lengths):
Within each role, count bullets by length band: punchy (8–14 words), standard (15–22 words), narrative (25–40 words, two sentences). The mix scales with the role's bullet count N:
  • N=3 → 1 punchy + 2 standard (narrative optional).
  • N=4–5 → 1 punchy + 2–3 standard + 1 narrative.
  • N=6–7 → 2 punchy + 3–4 standard + 1 narrative.
  • N=8–10 → 2 punchy + 4–5 standard + 2–3 narrative.
A role with ≥5 bullets that uses ONLY ONE band (e.g. eight bullets all in the standard band) = failure, regardless of how many bullets it has. If every bullet in a role is within 5 words of the role's average, that's also a failure. Fix by: shortening one bullet to the punchy band, OR expanding the strongest bullet to a two-sentence narrative (one short context sentence + one outcome sentence). Never make all bullets the same length.

PROBLEM 6 — AI TONE PHRASES IN SUMMARY (check professionalSummary field):
The professional summary must not contain: ${liveBannedSummary}.
Replace with specific factual claims: years of experience, industries served, measurable outcomes, or named skills.
The summary's first sentence MUST start with either the candidate's job title or their years of experience — never with "I", "A", or "An".

PROBLEM 7 — VERB TENSE CONSISTENCY (check every role's responsibilities array):
For each role: if endDate is "Present" or empty/null, ALL bullets in that role must use PRESENT TENSE (Manages, Leads, Coordinates).
For all other roles (past jobs), ALL bullets must use PAST TENSE (Managed, Led, Coordinated).
If you find tense mixing within a single role, rewrite the offending bullets to match the correct tense.

PROBLEM 8 — FIRST BULLET MUST BE A SCOPE ANCHOR:
The first bullet of EVERY role should describe the SCOPE of the role (team size, geographic coverage, client count, budget, project count) — not an achievement.
If the first bullet is currently an achievement bullet, keep it as bullet #2 and write a new scope anchor as bullet #1.
If the role already has 6 bullets, remove the weakest achievement bullet to make room for the scope anchor.
${mustFixBlock}

Here is the CV section to audit and correct (summary + experience only):
${JSON.stringify({ summary: cvData.summary, experience: cvData.experience })}

Return ONLY a JSON object with exactly two keys: "summary" (string) and "experience" (array). No markdown, no code fences, no other fields.
`.trim();

    // --- Prompt-size guard ---
    // Groq llama-3.3-70b-versatile has a 128K token context but the free tier
    // has a strict Tokens-Per-Minute limit. A large CV + long prompt can push a
    // single request over the TPM budget, causing a 413.
    // Approx 4 chars ≈ 1 token. We target <5 000 tokens total input (~20 000 chars).
    const HUMANIZER_CHAR_LIMIT = 20_000;
    const promptChars = auditPrompt.length;
    if (promptChars > HUMANIZER_CHAR_LIMIT) {
        console.warn(`[CV Humanizer] Prompt ${promptChars.toLocaleString()} chars > ${HUMANIZER_CHAR_LIMIT.toLocaleString()} — truncating CV experience to 3 roles to stay under Groq TPM limit.`);
        const slimExp = (cvData.experience ?? []).slice(0, 3);
        const slimJson = JSON.stringify({ summary: cvData.summary, experience: slimExp });
        auditPrompt = auditPrompt.replace(
            /Here is the CV section to audit.*$/s,
            `Here is the CV section to audit and correct (summary + top 3 experience roles only):\n${slimJson}\n\nReturn ONLY a JSON object with exactly two keys: "summary" (string) and "experience" (array). No markdown, no code fences, no other fields.`,
        );
    }

    const auditSystem = _auditSystem || 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON with keys: summary and experience.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Helper: merge the auditor's partial response (only summary + experience)
    // back into the full CV so nothing else is lost.
    // Attempt to recover truncated JSON by walking backwards to find the last
    // well-formed root closing brace. Mistral Small sometimes stops mid-string
    // when the output nears the token limit, leaving a JSON parse error at the
    // truncation point (e.g. "Expected ',' or '}' at position 2667").
    const repairJson = (s: string): string => {
        try { JSON.parse(s); return s; } catch {}
        for (let i = s.length - 1; i >= 0; i--) {
            if (s[i] === '}') {
                const candidate = s.slice(0, i + 1);
                try { JSON.parse(candidate); return candidate; } catch {}
            }
        }
        return s;
    };

    const mergePartial = (raw: string): CVData => {
        const partial = JSON.parse(repairJson(stripFences(raw)));
        const merged: CVData = { ...cvData };
        if (typeof partial.summary === 'string' && partial.summary.trim()) {
            merged.summary = partial.summary;
        }
        if (Array.isArray(partial.experience) && partial.experience.length > 0) {
            merged.experience = partial.experience;
        }
        // If the model returned the whole CV anyway, accept it wholesale.
        if (partial.skills || partial.education || partial.fullName) {
            return partial as CVData;
        }
        return merged;
    };

    // Use Cloudflare Workers AI only when it is the selected provider.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('cvAudit', auditPrompt, {
                system: auditSystem,
                temperature: 0.15,
                json: true,
                maxTokens: 8192,
            });
            if (cf) {
                try {
                    const merged = mergePartial(cf);
                    console.log('[CV Humanizer] Audit pass complete via Cloudflare Workers AI (tiered: cvAudit).');
                    return merged;
                } catch (parseErr) {
                    console.warn('[CV Humanizer] Worker JSON parse failed, falling back to selected provider:', parseErr);
                }
            }
        } catch (cfErr) {
            console.warn('[CV Humanizer] Worker call failed, falling back to selected provider:', cfErr);
        }
    }

    try {
        const result = await groqChat(GROQ_LARGE, auditSystem, auditPrompt, { temperature: 0.15, json: true, maxTokens: 8192, task: 'humanize' });
        const merged = mergePartial(result);
        console.log('[CV Humanizer] Audit pass complete.');
        return merged;
    } catch (e) {
        console.error('[CV Humanizer] Audit pass failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 8 — Deterministic Banned-Phrase Filter.
 *
 * This is a pure JavaScript pass — no AI call, no network, cannot fail.
 * It runs as the absolute last step before the CV is returned to the user,
 * acting as a guaranteed backstop regardless of what any prior AI pass did.
 *
 * Two tiers:
 *   TIER 1 — Standalone adjectives/adverbs: safe to remove word-only (won't break grammar).
 *   TIER 2 — Opener phrases ("responsible for X"): remove the opener, keep the rest of the sentence.
 */
function applyBannedPhraseFilter(cvData: CVData): CVData {
    // ── Tier 1 — single adjectives/adverbs. Pure deletion is grammatically
    //    safe (they modify the next word and removing them rarely breaks
    //    the sentence). Article agreement is repaired in tidy() below.
    const tier1Words = [
        'seamlessly', 'robust', 'holistic', 'proactive', 'groundbreaking',
        'transformative', 'dynamic', 'innovative', 'impactful',
    ];

    // ── Tier 2 — multi-word phrases. Each entry has a SUBSTITUTION rather
    //    than a hard strip. The previous version deleted the verb in
    //    phrases like "worked on payment systems", leaving " payment
    //    systems" — a broken sentence. Substitutions preserve grammar AND
    //    move the writing toward the concrete verbs the prompt rules
    //    require ("Built", "Led", "Drove", "Owned").
    //
    //    NOTE: contractions like "I've built" do NOT match any pattern
    //    here because \b boundaries treat the apostrophe as a word break,
    //    so "I've" is the token "I" + "ve" and never aligns with any
    //    multi-word pattern below. Tier 1 single words also have no
    //    overlap with contraction fragments.
    const tier2Subs: Array<{ pattern: string; replacement: string }> = [
        // Weak verbs / openers — keep the sentence with a stronger verb.
        { pattern: 'responsible for',         replacement: 'owned' },
        { pattern: 'tasked with',             replacement: 'led' },
        { pattern: 'helped with',             replacement: 'drove' },
        { pattern: 'assisted in',             replacement: 'supported' },
        { pattern: 'worked on',               replacement: 'built' },
        { pattern: 'was part of',             replacement: 'joined' },
        { pattern: 'participated in',         replacement: 'led' },
        { pattern: 'contributed to',          replacement: 'drove' },
        { pattern: 'played a key role in',    replacement: 'led' },
        { pattern: 'supported the',           replacement: 'led the' },
        { pattern: 'passionate about',        replacement: 'focused on' },
        // Pure filler — safe to delete.
        { pattern: 'results-driven',          replacement: '' },
        { pattern: 'detail-oriented',         replacement: '' },
        { pattern: 'team player',             replacement: '' },
        { pattern: 'go-getter',               replacement: '' },
        { pattern: 'thought leader',          replacement: '' },
        { pattern: 'game-changer',            replacement: '' },
        { pattern: 'best-in-class',           replacement: '' },
        { pattern: 'world-class',             replacement: '' },
        { pattern: 'cutting-edge',            replacement: '' },
        { pattern: 'state-of-the-art',        replacement: '' },
        { pattern: 'moving the needle',       replacement: '' },
        { pattern: 'navigate the landscape',  replacement: '' },
        { pattern: "in today's fast-paced world", replacement: '' },
        { pattern: 'excited to',              replacement: '' },
        { pattern: 'delve',                   replacement: 'dig into' },
        // Standalone 'passionate' only matches if 'passionate about'
        // didn't (longest-pattern-first ordering below).
        { pattern: 'passionate',              replacement: '' },
    ];

    // ── Tidy: repairs the inevitable artefacts (orphan punctuation,
    //    a/an disagreement, doubled "the the", leading commas, and
    //    sentence-start capitalization that substitutions can break —
    //    e.g. "Worked on X" → "built X" needs to become "Built X").
    function tidy(s: string, originalStartedUpper: boolean): string {
        let out = s;
        // Collapse runs of whitespace created by deletions.
        out = out.replace(/\s{2,}/g, ' ');
        // Pull punctuation back to the previous word: " ," " ." " ;" → ","
        out = out.replace(/\s+([,.;:!?])/g, '$1');
        // Strip leading punctuation/whitespace at sentence start.
        out = out.replace(/^[\s,;:.!?]+/, '');
        // Fix article disagreement after a Tier 1 deletion.
        // "an [consonant]" → "a [consonant]"
        out = out.replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxz])/g,
            (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`);
        // "a [vowel]" → "an [vowel]"
        out = out.replace(/\b([Aa])\s+([aeiou])/g,
            (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`);
        // Adjacent duplicate words ("the the", "and and").
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        // Re-capitalize first letter if the original was sentence-cased.
        // Substitutions like "Worked on" → "built" leave a lowercase opener.
        if (originalStartedUpper && out.length > 0) {
            out = out.charAt(0).toUpperCase() + out.slice(1);
        }
        // Re-capitalize after sentence-ending punctuation too: ". built" → ". Built"
        out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
        return out.trim();
    }

    const stripped: string[] = [];
    let revertedCount = 0;

    function cleanText(text: string): string {
        if (!text || typeof text !== 'string') return text;
        const original = text;
        const origLen = original.replace(/\s+/g, ' ').trim().length;
        let t = text;

        // Tier 2 substitutions, longest-pattern-first so "passionate about"
        // wins over "passionate" and "supported the" wins over "supported".
        const sortedSubs = [...tier2Subs].sort(
            (a, b) => b.pattern.length - a.pattern.length,
        );
        for (const { pattern, replacement } of sortedSubs) {
            const re = new RegExp(
                `\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
                'gi',
            );
            if (re.test(t)) {
                stripped.push(pattern);
                t = t.replace(re, replacement);
            }
        }

        // Tier 1 standalone words — pure deletion.
        for (const word of tier1Words) {
            const re = new RegExp(`\\b${word}\\b`, 'gi');
            if (re.test(t)) {
                stripped.push(word);
                t = t.replace(re, '');
            }
        }

        const originalStartedUpper = /^[A-Z]/.test(original.trim());
        t = tidy(t, originalStartedUpper);

        // ── Safety guard: never ship a text that the filter destroyed.
        //    If a substitution accidentally over-fires (e.g. an unforeseen
        //    pattern eats most of the bullet), revert to the original and
        //    log it so we can review. Skip the guard for very short fields
        //    where ratio math is noisy.
        if (origLen >= 30 && (t.length < 12 || t.length / origLen < 0.5)) {
            revertedCount++;
            console.warn(
                `[CV BannedPhraseFilter] Reverted destructive strip: ` +
                `"${original.slice(0, 60)}…" → "${t.slice(0, 60)}…"`,
            );
            return original;
        }

        return t;
    }

    // Apply to every text field in CVData
    const result: CVData = {
        ...cvData,
        summary: cleanText(cvData.summary),
        skills: (cvData.skills || []).map(cleanText),
        experience: (cvData.experience || []).map(exp => ({
            ...exp,
            responsibilities: (exp.responsibilities || []).map(cleanText),
        })),
        education: (cvData.education || []).map(edu => ({
            ...edu,
            description: cleanText(edu.description || ''),
        })),
        projects: (cvData.projects || []).map(proj => ({
            ...proj,
            description: cleanText(proj.description || ''),
        })),
    };

    if (stripped.length > 0) {
        const unique = [...new Set(stripped)];
        console.warn(
            `[CV BannedPhraseFilter] Substituted ${stripped.length} ` +
            `banned instance(s): ${unique.join(', ')}` +
            (revertedCount ? ` (${revertedCount} reverted as destructive)` : ''),
        );
    } else {
        console.log('[CV BannedPhraseFilter] Clean — no banned phrases detected.');
    }

    return result;
}

// --- System-Level Constants for AI Control ---

// ─── Pipeline Rules — loaded from CF Worker at runtime (not bundled) ──────────
// These variables are populated by loadRules() called from App.tsx at boot.
// The actual strings live inside the compiled Cloudflare Worker (index.ts) and
// are fetched once per session via rulesService.ts. This means DevTools will
// never show the proprietary prompt engineering in the JS bundle or source map.
// Until loadRules() resolves, these are empty — generation functions wait for
// the rules to be ready before assembling any prompts.
let HUMANIZATION_RULES = '';
let HUMANIZATION_CHECKLIST = '';
let SYSTEM_INSTRUCTION_PROFESSIONAL = '';
let SYSTEM_INSTRUCTION_PARSER = '';
let SYSTEM_INSTRUCTION_HUMANIZER = '';
let _validatorSystem = '';
let _auditSystem = '';
// Generation IP — scenario blocks, pivot template, humanization header,
// critical rules reminder, and CV data schema (all fetched from Worker).
let _scenarioA = '';
let _scenarioB = '';
let _scenarioC = '';
let _scenarioD = '';
let _scenarioModeOverride = '';
let _pivotBlockTemplate = '';
let _humanizationInstructionHeader = '';
let _criticalRulesReminder = '';
let _cvDataSchema = '';

/**
 * Fetches the CV pipeline rules from the CF Worker and populates the module-
 * level variables used by generateCV, humanizeCV, validateCV, etc.
 * Called once at app boot from App.tsx — safe to call multiple times (noop
 * after first successful load). Also exported so Settings modal can force a
 * reload after a worker URL change.
 */
export async function loadRules(): Promise<void> {
    const { fetchCVRules } = await import('./rulesService');
    const rules = await fetchCVRules();
    HUMANIZATION_RULES          = rules.humanizationRules;
    HUMANIZATION_CHECKLIST      = rules.humanizationChecklist;
    SYSTEM_INSTRUCTION_PROFESSIONAL = rules.systemProfessional;
    SYSTEM_INSTRUCTION_PARSER   = rules.systemParser;
    SYSTEM_INSTRUCTION_HUMANIZER = rules.systemHumanizer;

    // Prompt Vault — register templates so proxyLLMCall sends only the key
    // for Claude/Gemini calls instead of the full system prompt text.
    const { registerSystemTemplate } = await import('./groqService');
    registerSystemTemplate(rules.systemProfessional, 'professional');
    registerSystemTemplate(rules.systemHumanizer,    'humanizer');
    registerSystemTemplate(rules.systemParser,       'parser');
    _validatorSystem             = rules.systemValidator;
    _auditSystem                 = rules.systemAudit;
    // Generation IP
    _scenarioA                       = rules.scenarioA;
    _scenarioB                       = rules.scenarioB;
    _scenarioC                       = rules.scenarioC;
    _scenarioD                       = rules.scenarioD;
    _scenarioModeOverride            = rules.scenarioModeOverride;
    _pivotBlockTemplate              = rules.pivotBlockTemplate;
    _humanizationInstructionHeader   = rules.humanizationInstructionHeader;
    _criticalRulesReminder           = rules.criticalRulesReminder;
    _cvDataSchema                    = rules.cvDataSchema;
    CV_DATA_SCHEMA                   = rules.cvDataSchema;

    // Propagate humanization rules to cvDoctorService so every Doctor LLM
    // fix call (rewriteAllFlaggedBullets, rewriteBulletOptions) enforces the
    // same pipeline rules as CV generation — not ad-hoc prompts.
    const { setDoctorRules } = await import('./cvDoctorService');
    setDoctorRules(rules.humanizationRules);
}

// --- Gemini Client (multimodal only — PDF/image parsing) ---
function getGeminiClient(): GoogleGenAI {
    // 1. In-memory decrypted key (primary — populated by KeyVault on app start)
    let apiKey: string | undefined = _rtGemini() ?? undefined;

    // 2. Legacy plaintext fallback (migration path)
    if (!apiKey) {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            try {
                const settings = JSON.parse(settingsString);
                if (settings.apiKey && !settings.apiKey.startsWith('enc:v1:')) {
                    apiKey = settings.apiKey.replace(/^"|"$/g, '');
                }
            } catch { /* ignore */ }
        }
    }

    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys.gemini && !providerKeys.gemini.startsWith('enc:v1:')) {
                apiKey = providerKeys.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) throw new Error('Gemini API key not set. Please add it in Settings to enable file/image upload.');
    return new GoogleGenAI({ apiKey });
}

// ── Claude helpers for client-side CV import ─────────────────────────────────
function getClaudeApiKey(): string | null {
    const rt = _rtClaude();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.claudeApiKey && !p.claudeApiKey.startsWith('enc:v1:')) return p.claudeApiKey.replace(/^"|"$/g, '');
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * Call Claude for text-only CV parsing / structuring tasks via the CF Worker
 * proxy. Prompt Vault applies automatically: if `system` matches a registered
 * template only the key is sent. The `apiKey` param is kept for call-site
 * backward compatibility but routing is now fully server-side via proxy-llm.
 * Returns the raw response string.
 */
async function claudeTextCall(
    apiKey: string,
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
    const { callProviderViaProxy } = await import('./groqService');
    return callProviderViaProxy('claude', apiKey, system, user, {
        temperature: opts.temperature ?? 0.1,
        maxTokens:   opts.maxTokens  ?? 4096,
    });
}

/**
 * Call Claude with a file (image or PDF base64) + text prompt.
 * Routes through the CF Worker proxy to avoid the CORS block that occurs
 * when the browser calls api.anthropic.com directly.
 * Falls back to a direct browser call only when the worker is unreachable.
 */
async function claudeMultimodalCall(
    apiKey: string,
    base64Data: string,
    mimeType: string,
    textPrompt: string,
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
    // ── Primary path: CF Worker proxy (no CORS issues) ────────────────────────
    try {
        const { callProviderViaProxyMultimodal } = await import('./groqService');
        const result = await callProviderViaProxyMultimodal(apiKey, base64Data, mimeType, textPrompt, opts);
        if (result && result.trim().length > 0) return result;
    } catch (proxyErr: any) {
        // Re-throw auth / quota errors — no point hitting Anthropic directly with a bad key
        if (proxyErr?.status === 401 || proxyErr?.status === 403) throw proxyErr;
        console.warn('[claudeMultimodalCall] Worker proxy failed, falling back to direct call:', proxyErr?.message);
    }

    // ── Fallback: direct browser→Claude (only when worker unreachable) ────────
    const isPdf = mimeType === 'application/pdf';
    const filePart = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } };

    const headers: Record<string, string> = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    };
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: getClaudeModel(),
            max_tokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.1,
            messages: [{ role: 'user', content: [filePart, { type: 'text', text: textPrompt }] }],
        }),
    });
    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(raw)?.error?.message || ''; } catch {}
        const err: any = new Error(msg || `Claude multimodal error ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    return (data?.content?.[0]?.text as string) || '';
}

// --- Gemini Retry Logic (for multimodal calls) ---
async function retryGemini<T>(operation: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error?.message || '';
        const status = error?.status;
        const isTransient = status === 503 || status === 429 ||
            msg.includes('503') || msg.includes('Overloaded') ||
            msg.includes('429') || msg.includes('Rate Limit');
        if (retries > 0 && isTransient) {
            await new Promise(r => setTimeout(r, delayMs));
            return retryGemini(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

// --- Compact-serialize a profile for embedding in Groq prompts.
//     Aggressively strips empty fields, redundant IDs, and oversized text to
//     keep input tokens well under Groq's per-request limits while preserving
//     all information the LLM actually needs.
function compactProfile(profile: UserProfile, maxResponsibilityChars = 350): string {
    // Remove undefined/null/empty-string/empty-array values recursively
    function strip(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(strip).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
        }
        if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                // Skip internal IDs — LLM doesn't need them in the prompt
                if (k === 'id') continue;
                const stripped = strip(v);
                if (stripped !== null && stripped !== undefined && stripped !== '' && !(Array.isArray(stripped) && stripped.length === 0)) {
                    out[k] = stripped;
                }
            }
            return out;
        }
        return obj;
    }

    const p = strip({
        personalInfo: profile.personalInfo,
        // Cap skills to 20 most relevant — LLM doesn't benefit from 50+ skills
        skills: (profile.skills || []).slice(0, 20),
        // Cap projects to 6 most recent/relevant
        projects: (profile.projects || []).slice(0, 6).map(pr => ({
            name: pr.name,
            description: typeof pr.description === 'string'
                ? truncate(pr.description, 200) // LLM context budget; see textTruncate.ts for why display cap differs
                : pr.description,
            link: pr.link,
            startDate: pr.startDate,
            endDate: pr.endDate,
        })),
        workExperience: (profile.workExperience || []).map((exp, idx) => ({
            _role: `ROLE_${idx + 1}`,
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: exp.startDate,
            endDate: exp.endDate,
            pointCount: exp.pointCount,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, maxResponsibilityChars)
                : (Array.isArray(exp.responsibilities)
                    ? (exp.responsibilities as string[]).slice(0, 6).join('\n').substring(0, maxResponsibilityChars)
                    : ''),
        })),
        education: (profile.education || []).map(edu => ({
            degree: edu.degree,
            school: edu.school,
            graduationYear: edu.graduationYear,
            description: typeof (edu as any).description === 'string'
                ? (edu as any).description.substring(0, 150)
                : undefined,
        })),
        languages: profile.languages,
        customSections: profile.customSections,
        sectionOrder: profile.sectionOrder,
    });

    return JSON.stringify(p);
}

/**
 * Rebuilds a prompt that was assembled with `compactProfile(profile)` (default
 * 350 chars/role) by substituting a slimmer representation (120 chars/role).
 * Used as a second-chance retry when Groq returns 413 — the reduced profile
 * typically cuts 30–50 % off prompts for users with many detailed roles,
 * bringing the token count back inside Groq's 128K context window.
 *
 * Returns the original prompt unchanged when:
 * - the full-profile JSON is not found verbatim (safety guard)
 * - the slim version is identical (profile was already small)
 */
function slimPromptProfile(prompt: string, profile: UserProfile): string {
    const full = compactProfile(profile, 350);
    const slim = compactProfile(profile, 120);
    if (full === slim) return prompt;
    const idx = prompt.indexOf(full);
    if (idx === -1) return prompt;
    return prompt.slice(0, idx) + slim + prompt.slice(idx + full.length);
}

/**
 * Smartly truncate a job description to a target character limit while
 * preserving as much keyword signal as possible.
 * Strategy: keep the first block (role summary), then keyword-dense middle,
 * then requirements/skills section — discarding boilerplate filler.
 */
// Exported for the audit harness (`scripts/audit-jd-pipeline.ts`) — verifies
// that short JDs pass through unchanged, that high-signal chunks beat
// boilerplate when truncating, and that the safety-fallback head/tail keeps
// the result under maxChars even on adversarial inputs.
export function smartTruncateJD(jd: string, maxChars = 3200): string {
    const clean = (jd || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean || clean.length <= maxChars) return clean;

    // Break JD into meaningful chunks (headings, bullets, paragraphs).
    const chunks = clean
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(s => s.length > 420 ? s.split(/(?<=[.;])\s+/).map(x => x.trim()).filter(Boolean) : [s]);

    const weakBoilerplate = /\b(equal opportunity|eeo|accommodation|background check|drug test|benefits|perks|about us|our culture|privacy policy|cookie|applicants with disabilities|all qualified applicants|do not discriminat\w*|authorized to work|protected status|veteran status|gender identity|sexual orientation|paid time off|pto\b|401k|401\(k\))\b/i;
    const highSignal = /\b(requirements?|qualifications?|responsibilities?|must have|nice to have|key skills?|experience with|proficient|degree|certification|tools?|tech stack|kubernetes|python|java|sql|aws|gcp|azure)\b/i;

    const scored = chunks.map((c, idx) => {
        const lower = c.toLowerCase();
        const wordCount = lower.split(/\s+/).length;
        const keywordHits = (lower.match(/\b(requirements?|qualifications?|responsibilities?|must|experience|skills?|tools?|degree|certification)\b/g) || []).length;
        const techHits = (lower.match(/\b(python|java|sql|aws|gcp|azure|kubernetes|docker|react|node|ci\/cd|terraform)\b/g) || []).length;
        const numberHits = (lower.match(/\d+/g) || []).length;
        const isWeak = weakBoilerplate.test(lower);
        let score = keywordHits * 3 + techHits * 4 + numberHits;
        if (highSignal.test(lower)) score += 8;
        if (idx < 2) score += 6; // keep role-context intro
        if (wordCount < 3) score -= 4;
        if (isWeak) score -= 14;
        return { idx, text: c, score };
    });

    // Keep highest-signal chunks, then restore original order.
    const picked = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(8, Math.ceil(scored.length * 0.55)))
        .sort((a, b) => a.idx - b.idx);

    let out = '';
    for (const p of picked) {
        if ((out + '\n' + p.text).length > maxChars) continue;
        out += (out ? '\n' : '') + p.text;
    }

    // Safety fallback if scoring discarded too much.
    if (out.length < 800) {
        const head = clean.substring(0, Math.floor(maxChars * 0.7));
        const tail = clean.substring(clean.length - Math.floor(maxChars * 0.2));
        return `${head}\n…\n${tail}`.slice(0, maxChars + 3);
    }
    return out;
}

// Exported for the audit harness (`scripts/audit-jd-pipeline.ts`) — verifies
// that the routing similarity score correctly separates "rewrite from scratch"
// (low overlap) from "preserve & polish" (high overlap) cases.
export function jdProfileSimilarity(profile: UserProfile, jd: string): number {
    if (!jd.trim()) return 0;
    const jdTokens = new Set(
        jd.toLowerCase()
            .replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (jdTokens.size === 0) return 0;

    const profileText = [
        ...(profile.skills || []),
        ...(profile.workExperience || []).flatMap(e => [e.jobTitle, e.company, ...(typeof e.responsibilities === 'string' ? e.responsibilities.split('\n') : (e.responsibilities || []))]),
        ...(profile.education || []).flatMap(e => [e.degree, e.school]),
    ].join(' ').toLowerCase();

    const pTokens = new Set(
        profileText.replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (pTokens.size === 0) return 0;

    let overlap = 0;
    for (const t of pTokens) if (jdTokens.has(t)) overlap++;
    return overlap / Math.min(jdTokens.size, pTokens.size);
}

function buildStaleProfileRefreshInstruction(
    profile: UserProfile,
    marketResearch?: MarketResearchResult | null
): string {
    const roleText = (profile.workExperience || []).map(w =>
        `${w.jobTitle || ''} ${w.company || ''} ${
            typeof w.responsibilities === 'string'
                ? w.responsibilities
                : (w.responsibilities || []).join(' ')
        }`
    ).join(' ').toLowerCase();
    const roleSignals: Array<{ name: string; hits: number; keywords: string[] }> = ROLE_TRACKS.map(s => ({
        ...s,
        hits: s.keywords.reduce((n, kw) => n + ((roleText.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length), 0),
    }));
    const dominantSignals = roleSignals
        .filter(s => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);
    const detectedTracks = dominantSignals.map(s => `${s.name} (${s.hits})`).join(', ');

    const gaps = detectGaps(profile.workExperience || []).filter(g => g.gapMonths >= 4);
    const gapContext = gaps.length
        ? gaps.slice(0, 2).map(g => `${g.gapMonths}mo between "${g.fromRole}" → "${g.toRole}"`).join('; ')
        : 'none';

    const currentRole = (profile.workExperience || []).find(w => !w.endDate || /present/i.test(String(w.endDate)));
    if (!currentRole?.startDate) return '';
    const start = new Date(currentRole.startDate);
    if (isNaN(start.getTime())) return '';

    const monthsInRole = Math.max(0,
        (new Date().getFullYear() - start.getFullYear()) * 12 +
        (new Date().getMonth() - start.getMonth())
    );
    const bulletCount = typeof currentRole.responsibilities === 'string'
        ? currentRole.responsibilities.split('\n').filter(Boolean).length
        : (currentRole.responsibilities || []).length;
    const projectCount = (profile.projects || []).length;
    const likelyStale = monthsInRole >= 24 && (bulletCount <= 4 || projectCount <= 1);
    if (!likelyStale) return '';

    const toolHints = (marketResearch?.expectedTools || []).slice(0, 6).join(', ');
    const skillHints = (profile.skills || []).slice(0, 8).join(', ');
    return `
    **PROFILE RECENCY REFRESH MODE (stale-profile detected):**
    The candidate has been in the current role for ~${Math.round(monthsInRole / 12)} year(s) but has sparse recent evidence in the source CV.
    Refresh the narrative to reflect likely recent scope growth while staying faithful to known facts.

    DETECTION EVIDENCE (use this as the inference boundary):
    - Dominant work tracks from actual experience text: ${detectedTracks || 'insufficient signal'}.
    - Notable career gaps: ${gapContext}.

    HARD LIMITS (never violate):
    - Keep company names, job titles, and employment dates unchanged.
    - Do NOT invent new employers, degrees, or certifications.
    - DEGREE PRESERVATION (binding): The degree name AND institution MUST be
      copied verbatim from the candidate's profile. Never paraphrase, abbreviate,
      translate, "improve", or invent. "BSc Computer Science" stays "BSc Computer Science"
      — not "Bachelor of Science in Computing", not "BS Comp Sci", not "Bachelor's degree".
      The institution string is sacred too: "University of Nairobi" never becomes
      "Nairobi University". If you cannot fit the exact string, keep the exact string.
    - Do NOT fabricate impossible metrics; only use conservative, believable ranges.
    - Only infer activities that are consistent with the detected work tracks above.

    REFRESH RULES:
    - Expand current-role bullets to show progression in ownership, scope, and complexity since the role started.
    - Convert repeated maintenance-style bullets into higher-value outcomes (automation, efficiency, reliability, stakeholder impact) using the candidate's real domain.
    - Surface recent project-like deliverables inside experience bullets when standalone projects are missing.
    - Prioritise tools already known from profile skills (${skillHints || 'profile skills'}) and market expectations (${toolHints || 'no market hints available'}).
    `;
}

function applySourceFidelityRules(cvData: CVData, profile: UserProfile, reconciledSkills?: ReconciledSkills | null): CVData {
    const sourceRoles = profile.workExperience || [];

    // When JD-reconciled skills are available they are authoritative: only
    // reconciled skills are allowed on the CV (prevents JD-irrelevant profile
    // skills from leaking back after generation). For the no-JD path fall back
    // to the raw profile skill list as before.
    const sourceSkills = (reconciledSkills?.finalSkills?.length ?? 0) > 0
        ? reconciledSkills!.finalSkills
        : Array.from(new Set((profile.skills || []).map(s => String(s || '').trim()).filter(Boolean)));

    // Rule 1 + 5: never add unseen skills, never remove existing skills.
    const generatedSkills = Array.isArray(cvData.skills) ? cvData.skills.map(s => String(s || '').trim()).filter(Boolean) : [];
    const allowedSet = new Set(sourceSkills.map(s => s.toLowerCase()));
    const filtered = generatedSkills.filter(s => allowedSet.has(s.toLowerCase()));
    // JD path: reconciler's JD-priority ordering is authoritative — put it FIRST
    // so ATS-critical skills are not displaced by the LLM's arbitrary ordering.
    // No-JD path: merge filtered (LLM) + source as before.
    const mergedSkills = (reconciledSkills?.finalSkills?.length ?? 0) > 0
        ? Array.from(new Set([...reconciledSkills!.finalSkills, ...filtered]))
        : Array.from(new Set([...filtered, ...sourceSkills]));
    // Cap at 15 — consistent with skillsReconciler (MAX_SKILLS=15), the generation
    // instruction ("EXACTLY 15"), and cvValidationEngine (ruleSkillsCap). The old
    // value of 25 caused the validator to silently trim the list and discard the
    // reconciler's carefully ordered tail skills.
    cvData.skills = mergedSkills.slice(0, 15);

    // Rule 7 (summary): if the generated professional summary would come out
    // hollowed-out after the number strip, fall back to the user's own
    // profile summary instead of emitting garbage. Uses the union of all
    // numbers anywhere in the profile as the "grounded" set.
    if (typeof cvData.summary === 'string') {
        const profileNumberTokens = _collectSourceNumberTokens([], profile as any);
        cvData.summary = _repairTextAgainstSource(
            cvData.summary,
            String((profile as any).summary || ''),
            profileNumberTokens,
        );
        // Rule 8 (voice): CVs are written without first-person pronouns.
        // Strip "I", "I've", "my", "we", etc. from the summary and rewrite
        // the affected clause so it still reads naturally.
        cvData.summary = _stripFirstPersonPronouns(cvData.summary);
    }

    // Rule 3 + 4 + 6: preserve company/job-title/date identity from source.
    if (Array.isArray(cvData.experience)) {
        cvData.experience = cvData.experience.map((exp, idx) => {
            const src = sourceRoles[idx];
            if (!src) return exp;

            const sourceBullets = typeof src.responsibilities === 'string'
                ? src.responsibilities.split('\n').map(x => x.trim()).filter(Boolean)
                : (src.responsibilities || []);
            const sourceNumberTokens = _collectSourceNumberTokens(sourceBullets, profile as any);
            // Rule 2: strip generated metric-like claims not grounded in
            // source bullets. When a generated bullet would come out broken
            // (orphan punctuation, sentence stub, hollowed out), fall back
            // to the user's own profile bullet for this role rather than
            // emit garbage.
            const fixedResponsibilities = _repairBulletsAgainstSource(
                (exp.responsibilities || []).map(r => String(r || '')),
                sourceBullets,
                sourceNumberTokens,
            );

            // Rule 8 (voice): in the active role, normalise leading verbs
            // from third-person singular present ("Generates", "Delivers",
            // "Maintains") to base-form imperative ("Generate", "Deliver",
            // "Maintain"). This matches the convention used by bullet #1
            // ("Manage X") and reads consistently. Past roles are left in
            // their natural past tense ("Led", "Built", "Designed"). Also
            // strips any first-person pronouns the model leaked.
            const endDateLower = String(src.endDate || exp.endDate || '').trim().toLowerCase();
            const isCurrentRole = !endDateLower
                || endDateLower === 'present'
                || endDateLower === 'current'
                || endDateLower === 'now'
                || endDateLower === 'ongoing';
            const voiceFixed = fixedResponsibilities.map(b => {
                let next = _stripFirstPersonPronouns(b);
                if (isCurrentRole) next = _normalizePresentTenseToImperative(next);
                return next;
            });

            return {
                ...exp,
                company: src.company || exp.company,
                jobTitle: src.jobTitle || exp.jobTitle,
                startDate: src.startDate || exp.startDate,
                endDate: src.endDate || exp.endDate,
                dates: exp.dates || formatExpDateRange(exp.startDate, exp.endDate),
                responsibilities: voiceFixed.length ? voiceFixed : sourceBullets,
            };
        });
    }

    // Preserve existing user-owned custom sections (awards/certifications if stored there).
    if (Array.isArray(profile.customSections) && profile.customSections.length > 0) {
        // Promote certifications / achievements / awards from customSections into
        // the dedicated CVData fields so custom templates can render them properly.
        // NOTE: 'memberships' was previously included in certSectionTypes, which
        // meant e.g. a "Memberships" section containing language entries (a known
        // model mis-classification) got duplicated verbatim into cvData.certifications
        // — the same items then rendered under both "Memberships" AND
        // "Certifications" in the final CV. Memberships now stay memberships-only;
        // they are still preserved via cvData.customSections above, just not
        // duplicated into the certifications list.
        const certSectionTypes = new Set(['certifications', 'courses', 'presentations', 'patents']);
        const achieveSectionTypes = new Set(['achievements', 'awards', 'honors', 'volunteer']);

        // Build dedup sets — the AI import sometimes violates its own rules and puts
        // language names or skill names inside a certifications custom section.
        const languageNames = new Set(
            (profile.languages || []).map(l => String(l?.name || '').trim().toLowerCase()).filter(Boolean)
        );
        // Skills normalised for cert-section dedup (skills mis-labelled as certs is
        // the most common import artefact — same text appears in both sections).
        const skillNames = new Set(
            (profile.skills || []).map(s => String(s || '').trim().toLowerCase()).filter(Boolean)
        );

        // Clean the customSections BEFORE storing them so the template renderer
        // also sees filtered data (the promotion loop below iterates the cleaned copy).
        const cleanedSections = profile.customSections.map(section => {
            if (!certSectionTypes.has(section.type) && !achieveSectionTypes.has(section.type)) {
                return section;
            }
            const cleanedItems = (section.items || []).filter(item => {
                const titleNorm = String(item.title || '').trim().toLowerCase();
                if (!titleNorm) return false;
                // Drop language names that leaked into cert/achieve sections
                if (languageNames.has(titleNorm)) return false;
                // Drop skill items that were mis-classified as certifications
                if (certSectionTypes.has(section.type) && skillNames.has(titleNorm)) return false;
                return true;
            });
            return { ...section, items: cleanedItems };
        // Drop sections that are now empty after filtering
        }).filter(s => (s.items?.length ?? 0) > 0);

        cvData.customSections = cleanedSections;

        const certStrings: string[] = [];
        const achieveStrings: string[] = [];

        for (const section of cleanedSections) {
            const t = section.type;
            const isCert = certSectionTypes.has(t);
            const isAchieve = achieveSectionTypes.has(t);
            if (!isCert && !isAchieve) continue;
            for (const item of (section.items || [])) {
                const parts = [item.title, item.subtitle, item.year].filter(Boolean);
                const line = parts.join(' · ');
                if (isCert) certStrings.push(line);
                else achieveStrings.push(line);
            }
        }

        if (certStrings.length) cvData.certifications = certStrings;
        if (achieveStrings.length) cvData.achievements = achieveStrings;
    }

    return cvData;
}

function applyFidelityAgainstSourceCV(cvData: CVData, sourceCV: CVData): CVData {
    const pseudoProfile = {
        skills: sourceCV.skills || [],
        workExperience: (sourceCV.experience || []).map(exp => ({
            company: exp.company || '',
            jobTitle: exp.jobTitle || '',
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
            responsibilities: exp.responsibilities || [],
        })),
        customSections: sourceCV.customSections || [],
    } as unknown as UserProfile;
    return applySourceFidelityRules(cvData, pseudoProfile);
}

// ─── Silent Quality Guardian ──────────────────────────────────────────────────
// Runs after every polish pass to catch anything that slipped through.
// Applies all deterministic fixes silently — never surfaces to the user.
// AI-assisted fixes (gerund truncation) run on pass 1 only — no hallucination:
// the model is only allowed to insert the missing object noun using words
// implied by the job title, company, and verb. Every repair is validated
// before being applied (numbers unchanged, not >2× original length, regex
// no longer fires). Any failure falls back silently.

/**
 * Local copy of the gerund-no-object pattern (mirrors cvValidationEngine.ts)
 * so the guardian can re-validate repaired bullets without a cross-module import.
 */
const _GERUND_NO_OBJECT_RX =
    /\b(?:and|or)\s+(?:installing|implementing|deploying|designing|developing|building|integrating|delivering|commissioning|configuring|managing|operating)\s+(?:across|in|at|for|on|from|into|through|over|under|within)\b/gi;

/**
 * AI-assisted gerund-truncation repair.
 *
 * Fires when the validator flags `incomplete_gerund_phrase` — bullets like
 * "commissioning 12+ drip and installing across farms" where the LLM dropped
 * the direct-object noun ("systems", "units", "infrastructure", etc.).
 *
 * No-hallucination contract (enforced via prompt + post-validation):
 *  • The model may ONLY insert 1–3 words that are implied by the job title,
 *    company name, or the verb itself — never invented facts.
 *  • Numbers must be identical before and after repair.
 *  • Repaired bullet must not exceed 2× the original length.
 *  • The gerund-no-object regex must no longer fire on the repaired text.
 *  • Any violation of the above → the original bullet is kept as-is.
 *
 * Uses GROQ_FAST at temperature 0 for determinism and low cost.
 */
/**
 * Fix 6 — AI hollow-bullet expansion.
 *
 * Finds bullets that are too short (< 6 words) after all deterministic passes
 * and asks the LLM to expand them using only context from the job title,
 * company name, and the user's profile. Never invents metrics.
 *
 * Follows the same safety-gate pattern as _repairGerundTruncations (Fix 5):
 *   Gate A — numbers must be identical before/after repair.
 *   Gate B — repaired bullet must reach ≥ 6 words.
 *   Gate C — repaired bullet must not be > 3× the original length.
 *
 * Requires `carryProfile` to be threaded through from runQualityPolishPasses.
 * When `userProfile` is absent the function returns `cv` unchanged (no-op).
 */
async function _expandHollowBullets(
    cv: CVData,
    violations: Array<{ ruleId: string; location: string }>,
    userProfile?: UserProfile,
): Promise<CVData> {
    // Collect all genuinely short (not blank) bullets from flagged roles.
    const targets: Array<{
        roleIdx: number;
        bulletIdx: number;
        bullet: string;
        jobTitle: string;
        company: string;
    }> = [];

    for (const v of violations) {
        const m = v.location.match(/experience\[(\d+)\]/);
        if (!m) continue;
        const ri = parseInt(m[1], 10);
        const role = cv.experience?.[ri];
        if (!role) continue;
        ((role.responsibilities as string[]) ?? []).forEach((b, bi) => {
            const wc = b.trim().split(/\s+/).filter(Boolean).length;
            if (wc > 0 && wc < 6) {
                targets.push({
                    roleIdx: ri, bulletIdx: bi, bullet: b,
                    jobTitle: role.jobTitle || '', company: role.company || '',
                });
            }
        });
    }

    if (targets.length === 0) return cv;
    // Cap: don't burn tokens on a CV with systemic hollow-bullet problems
    // (that indicates a data issue, not individual truncated bullets).
    if (targets.length > 8) {
        console.debug('[Guardian/HollowExpand] Too many hollow bullets to repair in bulk — skipping.');
        return cv;
    }

    const profileContext = userProfile
        ? [
            userProfile.personalInfo?.summary,
            (userProfile.workExperience || []).slice(0, 2)
                .map(w => `${w.jobTitle} at ${w.company}`).join(', '),
          ].filter(Boolean).join(' | ')
        : '';

    const items = targets
        .map((t, idx) => `[${idx}] Role: ${t.jobTitle} at ${t.company}\nBullet: ${t.bullet}`)
        .join('\n\n');

    const systemMsg = 'You are a precise CV copy-editor. Return only valid JSON. Never add facts.';
    const userMsg =
        `Each bullet below is too short (under 6 words) for a professional CV. Expand it to 8–20 words ` +
        `using ONLY context from the job title, company name, and candidate background. ` +
        `Never invent metrics, percentages, or tools not already present.\n\n` +
        (profileContext ? `Candidate background: ${profileContext}\n\n` : '') +
        `HARD RULES:\n` +
        `1. Only use information directly inferable from the job title, company, or existing bullet text.\n` +
        `2. Never add, change, or remove any number, percentage, or currency figure.\n` +
        `3. If you cannot expand without inventing facts, return the bullet unchanged.\n\n` +
        `Return: JSON array of strings, one per input bullet, in the same order.\n\n` +
        `Input bullets:\n${items}`;

    let parsed: unknown;
    try {
        const raw = await groqChat(
            GROQ_FAST, systemMsg, userMsg,
            { temperature: 0, json: true, maxTokens: 800 },
        );
        parsed = JSON.parse(raw);
    } catch (e) {
        console.debug('[Guardian/HollowExpand] LLM call or parse failed (non-fatal):', e);
        return cv;
    }

    if (!Array.isArray(parsed) || parsed.length !== targets.length) {
        console.debug('[Guardian/HollowExpand] Unexpected response shape — skipping.');
        return cv;
    }

    const updatedExp = (cv.experience || []).map(r => ({
        ...r,
        responsibilities: [...((r.responsibilities as string[]) || [])],
    }));

    let applied = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const repaired = String((parsed as unknown[])[i] ?? '').trim();
        if (!repaired || repaired === t.bullet) continue;

        // Gate A: numbers must be identical
        const origNums = (t.bullet.match(/\d+/g) || []).slice().sort().join(',');
        const repNums  = (repaired.match(/\d+/g) || []).slice().sort().join(',');
        if (origNums !== repNums) {
            console.debug(`[Guardian/HollowExpand] Gate A (numbers changed) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }
        // Gate B: must reach ≥ 6 words to actually fix the violation
        if (repaired.trim().split(/\s+/).filter(Boolean).length < 6) continue;
        // Gate C: must not be more than 3× original + 30 chars (hallucination guard)
        if (repaired.length > t.bullet.length * 3 + 30) {
            console.debug(`[Guardian/HollowExpand] Gate C (too long) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        updatedExp[t.roleIdx].responsibilities[t.bulletIdx] = repaired;
        applied++;
        console.debug(`[Guardian/HollowExpand] ✓ [${t.roleIdx}][${t.bulletIdx}]: "${t.bullet}" → "${repaired}"`);
    }

    if (applied === 0) return cv;
    console.debug(`[Guardian/HollowExpand] Applied ${applied} hollow-bullet expansion(s).`);
    return { ...cv, experience: updatedExp };
}

async function _repairGerundTruncations(
    cv: CVData,
    violations: Array<{ ruleId: string; location: string }>,
): Promise<CVData> {
    // ── 1. Map violations to bullet positions ──────────────────────────────
    const targets: Array<{
        roleIdx: number;
        bulletIdx: number;
        bullet: string;
        jobTitle: string;
        company: string;
    }> = [];

    for (const v of violations) {
        const m = v.location.match(/experience\[(\d+)\]\.responsibilities\[(\d+)\]/);
        if (!m) continue;
        const ri = parseInt(m[1], 10);
        const bi = parseInt(m[2], 10);
        const role = cv.experience?.[ri];
        const bullet = (role?.responsibilities as string[] | undefined)?.[bi];
        if (!role || typeof bullet !== 'string' || !bullet.trim()) continue;
        targets.push({
            roleIdx: ri,
            bulletIdx: bi,
            bullet,
            jobTitle: role.jobTitle || '',
            company:  role.company  || '',
        });
    }

    if (targets.length === 0) return cv;

    // ── 2. Build tight batch prompt ────────────────────────────────────────
    const items = targets
        .map((t, idx) =>
            `[${idx}] Role: ${t.jobTitle} at ${t.company}\nBullet: ${t.bullet}`,
        )
        .join('\n\n');

    const systemMsg =
        'You are a precise CV copy-editor. Return only valid JSON. Never add facts.';

    const userMsg =
        `Each bullet below has a truncated gerund phrase — the direct-object noun was dropped by the AI that generated it (e.g. "installing across farms" instead of "installing irrigation systems across farms").

YOUR ONLY JOB: insert the missing 1–3 word object noun.

HARD RULES — any violation means you return the bullet unchanged:
1. You may ONLY use nouns that are directly implied by the job title, company name, or the gerund verb itself. No invented facts.
2. Never add, change, or remove any number, percentage, or currency figure.
3. Never rewrite the rest of the bullet. Only insert the missing object noun.
4. If you are not certain what the missing noun is, return the bullet exactly as given.

Return a JSON array of strings, one per input bullet, in the same order:
["repaired bullet 0", "repaired bullet 1", ...]

Input bullets:
${items}`;

    // ── 3. Call LLM ────────────────────────────────────────────────────────
    let parsed: unknown;
    try {
        const raw = await groqChat(
            GROQ_FAST,
            systemMsg,
            userMsg,
            { temperature: 0, json: true, maxTokens: 600 },
        );
        parsed = JSON.parse(raw);
    } catch (e) {
        console.debug('[Guardian/GerundRepair] LLM call or parse failed (non-fatal):', e);
        return cv;
    }

    if (!Array.isArray(parsed) || parsed.length !== targets.length) {
        console.debug('[Guardian/GerundRepair] Unexpected response shape — skipping.');
        return cv;
    }

    // ── 4. Apply with safety gates ─────────────────────────────────────────
    // Deep-clone experience so we can mutate safely.
    const updatedExp = (cv.experience || []).map(r => ({
        ...r,
        responsibilities: [...((r.responsibilities as string[]) || [])],
    }));

    let applied = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const repaired = String((parsed as unknown[])[i] ?? '').trim();
        if (!repaired || repaired === t.bullet) continue;

        // Gate A: numbers must be identical
        const origNums = (t.bullet.match(/\d+/g)  || []).slice().sort().join(',');
        const repNums  = (repaired.match(/\d+/g) || []).slice().sort().join(',');
        if (origNums !== repNums) {
            console.debug(`[Guardian/GerundRepair] Gate A failed (numbers changed) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        // Gate B: not more than 2× the original length
        if (repaired.length > t.bullet.length * 2) {
            console.debug(`[Guardian/GerundRepair] Gate B failed (too long) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        // Gate C: regex must no longer fire on the repaired text
        _GERUND_NO_OBJECT_RX.lastIndex = 0;
        if (_GERUND_NO_OBJECT_RX.test(repaired)) {
            console.debug(`[Guardian/GerundRepair] Gate C failed (pattern still fires) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        updatedExp[t.roleIdx].responsibilities[t.bulletIdx] = repaired;
        applied++;
        console.debug(
            `[Guardian/GerundRepair] ✓ [${t.roleIdx}][${t.bulletIdx}]: "${t.bullet}" → "${repaired}"`,
        );
    }

    if (applied === 0) return cv;

    console.debug(`[Guardian/GerundRepair] Applied ${applied} gerund repair(s).`);
    return { ...cv, experience: updatedExp };
}

/**
 * Trim an overlong bullet at the last clean sentence boundary (period or
 * semicolon) within `maxWords`. Returns the original string unchanged if no
 * clean cut point is found in the latter half — never chops mid-sentence.
 */
function _trimBulletAtBoundary(text: string, maxWords = 45): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text;
    const partial = words.slice(0, maxWords).join(' ');
    const lastPeriod = partial.lastIndexOf('.');
    const lastSemi   = partial.lastIndexOf(';');
    const cut = Math.max(lastPeriod, lastSemi);
    // Only accept cuts that fall in the latter half of the window — prevents
    // cutting at an early abbreviation period like "e.g. something very long".
    if (cut > partial.length * 0.5) return text.slice(0, cut + 1).trim();
    return text; // no clean boundary — leave as-is for telemetry
}

/**
 * Silent Quality Guardian — runs as the final step of runQualityPolishPasses,
 * after every humanizer/purify/voice/opener pass has completed.
 *
 * What it does:
 *  1. Re-runs the full validation engine (fresh eyes on the finished CV).
 *  2. Applies every deterministic fix available — up to MAX_PASSES times.
 *  3. Logs a debug summary; never shows anything to the user.
 *
 * Deterministic fixes (silent, zero AI cost):
 *  • empty_experience_bullets  → remove the empty role entirely
 *  • overlong_bullets          → trim at last sentence boundary within 45 words
 *  • current_role_tense        → enforceTenseConsistency (present imperatives)
 *  • hollow_bullets (empty str)→ strip truly blank bullets; genuinely short ones logged
 *
 * AI-assisted fixes (pass 1 only, no hallucination — see _repairGerundTruncations):
 *  • incomplete_gerund_phrase  → insert missing object noun via GROQ_FAST @ temp 0
 *
 * Still unfixable without more context (logged only):
 *  • hollow_bullets (< 6 words but non-empty) — need content expansion
 */
async function _runSilentQualityGuardian(
    cv: CVData,
    targetBulletCount?: number,
    userProfile?: UserProfile,
): Promise<CVData> {
    // Pre-load compromise.js NLP so flipLeadingVerb and detectTenseMismatch can
    // use it as a fallback for verbs not in VERB_TENSE_MAP (irregular + rare).
    // Awaiting here is safe — initNlp() is idempotent and resolves in < 300ms
    // on first call (dynamic import). Subsequent calls are instant (cache hit).
    await initNlp();

    const MAX_PASSES = 2;
    let out = cv;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
        const check = runValidationEngine(out, { targetBulletCount });
        if (check.repairApplied) out = check.cv; // apply block repairs (idempotent)

        const warns = check.violations.filter(v => v.severity === 'warn' && !v.repaired);
        if (warns.length === 0) {
            console.debug(`[Guardian pass ${pass}] Clean — no warn violations. ✓`);
            break;
        }

        let fixed = 0;
        const ruleIds = warns.map(v => v.ruleId);

        // ── Fix 1: Remove roles that have no bullets at all ────────────────
        if (ruleIds.includes('empty_experience_bullets')) {
            const before = out.experience?.length ?? 0;
            out = {
                ...out,
                experience: (out.experience ?? []).filter(
                    role => Array.isArray(role.responsibilities)
                         && (role.responsibilities as string[]).filter(Boolean).length > 0,
                ),
            };
            const removed = before - (out.experience?.length ?? 0);
            if (removed > 0) {
                fixed += removed;
                console.debug(`[Guardian pass ${pass}] Removed ${removed} empty role(s).`);
            }
        }

        // ── Fix 2: Trim overlong bullets at last sentence boundary ─────────
        if (ruleIds.includes('overlong_bullets')) {
            let trimmed = 0;
            out = {
                ...out,
                experience: (out.experience ?? []).map(role => ({
                    ...role,
                    responsibilities: (role.responsibilities as string[] ?? []).map((b: string) => {
                        const after = _trimBulletAtBoundary(b, 45);
                        if (after !== b) trimmed++;
                        return after;
                    }),
                })),
            };
            if (trimmed > 0) {
                fixed += trimmed;
                console.debug(`[Guardian pass ${pass}] Trimmed ${trimmed} overlong bullet(s) at sentence boundary.`);
            }
        }

        // ── Fix 3: Present-tense enforcement for current role ──────────────
        if (ruleIds.includes('current_role_tense')) {
            const { cv: tenseFixed, changes } = enforceTenseConsistency(out);
            if (changes.length > 0) {
                out = tenseFixed;
                fixed += changes.length;
                console.debug(`[Guardian pass ${pass}] Tense-corrected ${changes.length} bullet(s) in current role.`);
            }
        }

        // ── Fix 4: Strip truly blank bullets (hollow but empty string) ─────
        if (ruleIds.includes('hollow_bullets')) {
            let stripped = 0;
            out = {
                ...out,
                experience: (out.experience ?? []).map(role => {
                    const orig = role.responsibilities as string[] ?? [];
                    const cleaned = orig.filter((b: string) => b.trim().length > 0);
                    stripped += orig.length - cleaned.length;
                    return { ...role, responsibilities: cleaned };
                }),
            };
            if (stripped > 0) {
                fixed += stripped;
                console.debug(`[Guardian pass ${pass}] Stripped ${stripped} blank bullet(s).`);
            }
        }

        // ── Fix 6: AI hollow-bullet expansion (pass 1 only) ───────────────
        // Expands genuinely short bullets (< 6 words, non-empty) using LLM
        // with the user's profile as context. Only fires when carryProfile was
        // provided — without profile context the LLM has no safe material to
        // draw from, so we skip rather than risk hallucination.
        if (pass === 1 && ruleIds.includes('hollow_bullets') && userProfile) {
            try {
                const hollowViolations = warns.filter(v => v.ruleId === 'hollow_bullets');
                const preFix6: CVData = JSON.parse(JSON.stringify(out));
                out = await _expandHollowBullets(out, hollowViolations, userProfile);
                let hollowFixed = 0;
                for (const v of hollowViolations) {
                    const m = v.location.match(/experience\[(\d+)\]/);
                    if (!m) continue;
                    const ri = parseInt(m[1], 10);
                    const origBullets = (preFix6.experience?.[ri]?.responsibilities as string[] | undefined) ?? [];
                    const newBullets  = (out.experience?.[ri]?.responsibilities as string[] | undefined) ?? [];
                    for (let bi = 0; bi < origBullets.length; bi++) {
                        if (origBullets[bi] !== newBullets[bi]) hollowFixed++;
                    }
                }
                if (hollowFixed > 0) {
                    fixed += hollowFixed;
                    console.debug(`[Guardian pass ${pass}] Hollow-bullet expansion applied to ${hollowFixed} bullet(s).`);
                } else {
                    // Log for telemetry — short bullets that couldn't be safely expanded
                    console.debug(`[Guardian pass ${pass}] ${hollowViolations.length} role(s) still have short bullets after expansion attempt.`);
                }
            } catch (e) {
                console.debug('[Guardian pass 1] Hollow-bullet expansion skipped (non-fatal):', e);
            }
        } else if (ruleIds.includes('hollow_bullets') && !userProfile) {
            const hollowRemaining = warns.filter(v => v.ruleId === 'hollow_bullets');
            if (hollowRemaining.length > 0) {
                console.debug(`[Guardian pass ${pass}] ${hollowRemaining.length} role(s) have short bullets — profile context unavailable, skipping AI expansion.`);
            }
        }

        // ── Fix 5: AI gerund-truncation repair (pass 1 only) ──────────────
        // Fires for "installing across farms" → "installing irrigation systems
        // across farms". No-hallucination enforced: only the missing object noun,
        // numbers must be identical, length gate, regex must no longer fire.
        if (pass === 1 && ruleIds.includes('incomplete_gerund_phrase')) {
            try {
                const gerundViolations = warns.filter(v => v.ruleId === 'incomplete_gerund_phrase');
                const preFix: CVData = JSON.parse(JSON.stringify(out));
                out = await _repairGerundTruncations(out, gerundViolations);
                const repaired = revertCorruptedMetrics(out, preFix);
                if (repaired.reverted.length > 0) {
                    console.debug(`[Guardian pass ${pass}] Gerund repair reverted ${repaired.reverted.length} corrupted metric(s).`);
                    out = repaired.cv;
                }
                // Count ACTUAL bullet changes — not attempts. If the LLM was
                // uncertain and returned all bullets unchanged, fixed stays 0
                // and the early-break fires correctly (no wasted pass 2).
                let gerundFixed = 0;
                for (const v of gerundViolations) {
                    const m = v.location?.match(/experience\[(\d+)\]\.responsibilities\[(\d+)\]/);
                    if (!m) continue;
                    const ri = parseInt(m[1], 10);
                    const bi = parseInt(m[2], 10);
                    const origBullet = (preFix.experience?.[ri]?.responsibilities as string[] | undefined)?.[bi];
                    const newBullet  = (out.experience?.[ri]?.responsibilities as string[] | undefined)?.[bi];
                    if (origBullet !== undefined && newBullet !== undefined && newBullet !== origBullet) {
                        gerundFixed++;
                    }
                }
                if (gerundFixed > 0) {
                    fixed += gerundFixed;
                    console.debug(`[Guardian pass ${pass}] Gerund repair applied to ${gerundFixed}/${gerundViolations.length} bullet(s).`);
                } else {
                    console.debug(`[Guardian pass ${pass}] Gerund repair: LLM made no changes (${gerundViolations.length} violation(s) remain).`);
                }
            } catch (e) {
                console.debug('[Guardian pass 1] Gerund repair skipped (non-fatal):', e);
            }
        }

        if (fixed === 0) {
            console.debug(`[Guardian pass ${pass}] No deterministic fixes available for remaining violations: ${[...new Set(ruleIds)].join(', ')}`);
            break;
        }
    }

    // Final check — debug summary only, never shown to user
    const final = runValidationEngine(out, { targetBulletCount });
    if (final.repairApplied) out = final.cv;
    const remaining = final.violations.filter(v => !v.repaired);
    if (remaining.length > 0) {
        console.debug(`[Guardian final] ${remaining.length} issue(s) remain (need AI or are acceptable): ${[...new Set(remaining.map(v => v.ruleId))].join(', ')}`);
    } else {
        console.debug('[Guardian final] All violations resolved. CV is clean. ✓');
    }

    return out;
}

function finalizeCvData(
    cvData: CVData,
    opts: { profile?: UserProfile; sourceCv?: CVData; runPurify?: boolean; auditLabel?: string; purifierWarnings?: number; reconciledSkills?: ReconciledSkills | null } = {}
): CVData {
    const { profile, sourceCv, runPurify = true, auditLabel = 'finalizeCvData', purifierWarnings, reconciledSkills } = opts;
    let out = runPurify ? purifyCV(cvData).cv : cvData;
    if (profile) out = applySourceFidelityRules(out, profile, reconciledSkills);
    else if (sourceCv) out = applyFidelityAgainstSourceCV(out, sourceCv);
    // Cheap, deterministic post-flight quality audit. Pure regex, runs in
    // <5 ms on a typical CV, never mutates `out`. Logs a single line on
    // success and warnings only when issues are found, so it never spams
    // the console on a clean generation. Pass purifierWarnings so the score
    // is penalised for style leaks that couldn't be auto-fixed — this fixes
    // the "100/100 with 10 warnings" bug.
    try {
        _logCvQualityReport(out as any, auditLabel, { purifierWarnings });
    } catch {
        // Audit must never block generation.
    }
    return out;
}

/**
 * Returns an instruction string about the user's preferred section order and custom sections.
 * This is injected into the generateCV prompt so the AI honours the user's preferences.
 */
function buildSectionOrderInstruction(profile: UserProfile): string {
    const sectionLabels: Record<string, string> = {
        summary: 'Professional Summary',
        workExperience: 'Work Experience',
        education: 'Education',
        skills: 'Skills',
        projects: 'Projects',
        languages: 'Languages',
        references: 'References',
    };

    let instruction = '';

    if (profile.sectionOrder && profile.sectionOrder.length > 0) {
        const ordered = profile.sectionOrder
            .map((k, i) => `${i + 1}. ${sectionLabels[k] || k}`)
            .join(', ');
        instruction += `**SECTION ORDER PREFERENCE**: The user prefers sections in this order: ${ordered}. Please generate the CV with content prioritised and structured to reflect this ordering.\n`;
    }

    if (profile.customSections && profile.customSections.length > 0) {
        const names = profile.customSections.map(s => s.label).join(', ');
        instruction += `**ADDITIONAL SECTIONS**: The user has custom profile sections (${names}) which will be appended automatically after the template. You do not need to generate content for these — they are pre-filled by the user.\n`;
    }

    return instruction;
}

// --- UserProfile JSON schema description for Groq prompts ---
const USER_PROFILE_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema exactly:
{
  "personalInfo": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string (full URL if present)",
    "website": "string (portfolio / personal site URL)",
    "github": "string (GitHub URL if present)"
  },
  "summary": "string (professional summary or objective — copy verbatim if present, otherwise empty string)",
  "workExperience": [
    {
      "id": "string (unique, e.g. 'exp1')",
      "company": "string",
      "jobTitle": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": "string — every bullet point separated by \\n. Preserve ALL bullet points in full. Do NOT summarise or truncate."
    }
  ],
  "education": [
    {
      "id": "string",
      "degree": "string (full degree name and field of study)",
      "school": "string",
      "graduationYear": "string (YYYY or expected YYYY)"
    }
  ],
  "skills": ["string — include every technical skill, tool, language, framework, and soft skill listed"],
  "projects": [
    { "id": "string", "name": "string", "description": "string (full description, do not truncate)", "link": "string" }
  ],
  "languages": [
    { "id": "string", "name": "string (language name)", "proficiency": "string (e.g. Native, Fluent, Intermediate, Basic, or CEFR level)" }
  ],
  "customSections": [
    {
      "id": "string (unique, e.g. 'cs1')",
      "type": "certifications | awards | publications | volunteer | presentations | patents | courses | memberships | achievements | hobbies | interests | custom",
      "label": "string (exact section heading from the document, e.g. 'Certifications', 'Awards & Honours', 'Publications', 'Volunteer Experience')",
      "items": [
        {
          "id": "string (unique)",
          "title": "string (certification name / award name / publication title / role title)",
          "subtitle": "string (issuing body / journal / organisation — optional)",
          "year": "string (year or year range — optional)",
          "description": "string (any additional detail — optional)"
        }
      ]
    }
  ]
}

EXTRACTION RULES — follow these precisely. This is a verbatim transcription task, not a rewrite:
1. Extract EVERY section visible in the document, including but not limited to: certifications, licences, awards, honours, publications, patents, volunteer work, community service, professional memberships, conference presentations, courses, training programmes, hobbies, and interests.
2. Put each extra section into the customSections array with the correct type, using the section's exact original heading as its label.
3. Preserve ALL bullet points in responsibilities — do NOT summarise or drop any bullet.
4. Preserve ALL skills listed — do NOT drop any.
5. Do NOT invent data — only extract what is visibly present in the document. Do NOT paraphrase, summarise, or group items (e.g. skills) into a new label that does not literally appear in the source — a fabricated "certification" name built from skill text is strictly forbidden.
6. Languages belong ONLY in the dedicated "languages" field — never in customSections, and never duplicated anywhere else.
7. Never place the same real-world item (the same certification, language, project, membership, etc.) in more than one field or section.
8. If a section is absent, omit it from the output (do not include empty arrays or null values). Do not invent placeholder or example content to fill an apparently-missing section.
`;

// --- CVData JSON schema description for Groq prompts ---
let CV_DATA_SCHEMA = ``; // populated by loadRules() — text lives in CF Worker

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    // Use Cloudflare Workers AI only when it is the selected provider.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('humanize', prompt, {
                system: SYSTEM_INSTRUCTION_HUMANIZER,
                temperature: 0.8,
                maxTokens: 2500,
            });
            if (cf && cf.trim()) return cf;
        } catch (cfErr) {
            console.warn('[humanizeText] Worker call failed, falling back to selected provider:', cfErr);
        }
    }
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8, maxTokens: 2500 });
};

// --- Build scholarship format-specific instructions ---
function buildScholarshipFormatInstruction(format: ScholarshipFormat): string {
    switch (format) {
        case 'europass':
            return `
            **EUROPASS FORMAT REQUIREMENTS** (EU Standard):
            - Structure the summary as a 'Personal Statement' in first person, 2-3 sentences.
            - Include a 'Languages' section with proficiency levels using CEFR scale (A1/A2/B1/B2/C1/C2/Native).
            - List 'Digital Competencies' in skills (e.g., Microsoft Office, data analysis tools).
            - Note any voluntary/community work in the experience section if available.
            - Education descriptions should include ECTS credits or equivalent if known.
            - The tone should be formal European academic style.
            `;
        case 'eu-horizon':
            return `
            **EU HORIZON EUROPE / MARIE CURIE / ERC FORMAT REQUIREMENTS**:
            - Summary = 'Research Excellence Statement': Start with the impact of your research, then methodology, then future vision (3-4 sentences).
            - Highlight cross-border collaborations and international experience prominently.
            - Publications: Emphasize only last 5 years. Include impact factor or citation count if inferable.
            - Experience bullets should explicitly mention: research outputs, grants won, students supervised, and EU/international connections.
            - Skills: Lead with research methodologies, then domain expertise, then tools.
            - Include any 'Outreach & Dissemination' activities in projects.
            - Add a note about 'Commitment to Open Science' principles if relevant.
            `;
        case 'nih-nsf':
            return `
            **NIH/NSF BIOSKETCH FORMAT REQUIREMENTS** (US Government):
            - Summary = 'Personal Statement': 4 sentences max. Must state: (1) research area, (2) why uniquely qualified, (3) 1-2 key publications, (4) relevance to this grant.
            - Experience section = 'Positions, Scientific Appointments, and Honors'.
            - Publications must be listed with all authors, journal, year, PMID or DOI where possible.
            - Add 'Contributions to Science' section description in each experience bullet — describe scientific significance.
            - Skills should include lab techniques, analytical methods, and software (R, SPSS, etc.).
            - Follow NIH page limit spirit: be concise and specific, no filler.
            `;
        case 'chevening':
            return `
            **CHEVENING SCHOLARSHIP FORMAT REQUIREMENTS** (UK FCDO):
            - Summary = 'Leadership & Ambassadorial Potential Statement': Show clear leadership trajectory, influencing others, community impact (3-4 sentences).
            - Experience bullets must highlight: leadership moments, decisions made, people influenced/led, measurable outcomes.
            - Include any networking, professional associations, or convening roles prominently.
            - Projects should demonstrate UK-relevant connections or aspirations.
            - Add future career vision aligned with post-study return to home country.
            - Tone: Confident, aspirational, personal. Show a person who will be an ambassador.
            `;
        case 'commonwealth':
            return `
            **COMMONWEALTH SCHOLARSHIP FORMAT REQUIREMENTS** (CSC):
            - Summary: Lead with development impact and home country context. Explain how UK study supports national development goals (3-4 sentences).
            - Experience bullets: Show how work contributes to community/national development goals.
            - Include any government, NGO, or policy work prominently.
            - Projects: Frame around societal/development impact, not just technical achievement.
            - Add commitment to return to home country and apply learning.
            - Skills: Include languages, community engagement, and policy/advocacy skills.
            - Tone: Purpose-driven, development-focused, collaborative.
            `;
        default:
            return `
            **STANDARD ACADEMIC CV FORMAT**:
            - Summary = 'Research Statement' or 'Academic Objective' (2-4 sentences).
            - Emphasize research contributions, academic achievements, and teaching experience.
            - List publications prominently with full citation details.
            - Skills: Research methods, academic software, statistical tools, domain expertise.
            - Education: Include GPA/grade, thesis title, and key coursework where available.
            `;
    }
}

/**
 * Robustly strips markdown code fences and extracts the first valid JSON object
 * from LLM output. Falls back to bracket-depth scanning when the model emits
 * prose before/after the JSON block, then tries a backwards-walk repair for
 * truncated responses. Throws only if no valid JSON can be recovered.
 */
function parseProfileJson(raw: string): UserProfile {
    // Step 1: strip the outermost code fence (```json ... ``` or ``` ... ```)
    const stripped = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    // Step 2: try the stripped string as-is
    try { return JSON.parse(stripped) as UserProfile; } catch { /* fall through */ }

    // Step 3: bracket-depth scan — handles prose before/after the JSON block
    const start = stripped.indexOf('{');
    if (start !== -1) {
        let depth = 0, inString = false, escaping = false;
        for (let i = start; i < stripped.length; i++) {
            const ch = stripped[i];
            if (escaping) { escaping = false; continue; }
            if (ch === '\\' && inString) { escaping = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try { return JSON.parse(stripped.slice(start, i + 1)) as UserProfile; } catch { break; }
                }
            }
        }
        // Step 4: backwards-walk repair for truncated token-limit responses
        for (let i = stripped.lastIndexOf('}'); i >= start; i--) {
            if (stripped[i] === '}') {
                try { return JSON.parse(stripped.slice(start, i + 1)) as UserProfile; } catch { /* keep walking */ }
            }
        }
    }

    throw new SyntaxError(`Profile import: could not extract valid JSON from model response (${stripped.length} chars). The AI may have returned an unexpected format — please try again.`);
}

/**
 * Ensures every array item in an imported/extracted UserProfile has a unique
 * `id` field. The extraction AI sometimes omits IDs or returns empty strings,
 * which causes React key warnings and can make sections silently skip rendering
 * in templates that use `.map((item, i) => <div key={item.id}>`)`.
 */
function _normalizeProfileIds(profile: UserProfile): UserProfile {
    let counter = 1;
    const uid = () => `gen_${Date.now()}_${counter++}`;

    const fixIds = <T extends { id?: string }>(arr?: T[]): T[] | undefined => {
        if (!arr) return arr;
        return arr.map(item => (!item.id ? { ...item, id: uid() } : item));
    };

    const fixCustomSections = (sections?: any[]): any[] | undefined => {
        if (!sections) return sections;
        return sections.map(sec => ({
            ...sec,
            id: sec.id || uid(),
            items: (sec.items || []).map((item: any) =>
                (!item.id ? { ...item, id: uid() } : item)
            ),
        }));
    };

    return {
        ...profile,
        workExperience: fixIds(profile.workExperience) || [],
        education:      fixIds(profile.education)      || [],
        projects:       fixIds(profile.projects),
        languages:      fixIds(profile.languages),
        references:     fixIds(profile.references as any) as any,
        customSections: fixCustomSections(profile.customSections),
    };
}

export const generateProfile = async (rawText: string, githubUrl?: string): Promise<UserProfile> => {
    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. You must analyze the public data that would be available from this URL (e.g., repository names, primary languages, commit history insights) to significantly enrich the profile.
        - **Project Population**: Populate the 'projects' array with the *top 5 most impressive* public repositories.
        - **Project Details**: For each, use the repo name for 'name', generate a **concise, high-impact 'description'** detailing its function, and generate a valid repository 'link'.
        - **Skill Extraction**: Add ALL key programming languages, frameworks, and technical tools discovered from the repositories to the main 'skills' list.
        - **Profile Completion**: Infer missing personal details (like name, location, summary) from the GitHub profile if not present in the RAW TEXT.
        `;
    }

    const prompt = `
        Your goal is to perform a comprehensive data merge. Prioritize explicit data from the RAW TEXT, and use the GitHub profile to fill gaps, validate data, and significantly enhance the 'skills' and 'projects' sections.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}
        
        ${githubInstruction}

        ### INSTRUCTIONS FOR JSON CONSTRUCTION
        1. Date Standardization: Accurately parse all dates. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if a full date is missing. 'endDate' for current roles must be the string 'Present'.
        2. Unique IDs: Generate a unique, simple string 'id' (e.g., a timestamp-like string) for all array items (workExperience, education, projects, languages).
        3. Work Experience: Maintain the original 'responsibilities' text structure (use \\n for bullet points).
        4. Output: Return ONLY the JSON object that strictly adheres to the schema below.
        
        ${USER_PROFILE_SCHEMA}
    `;

    // Route to the user's configured provider — no silent fallback to a different one.
    let text: string | null = null;
    const provider = getSelectedProvider();

    if (provider === 'workers-ai') {
        // Workers AI explicitly selected — use it only, never fall back to Groq.
        // Parsing a full CV on the free tier's mistral-small model can take
        // 25-60s+ under load — give it real headroom (90s, matches the client
        // default) instead of aborting early and mislabeling a slow response
        // as an "empty" one.
        const parserOpts = {
            system: SYSTEM_INSTRUCTION_PARSER,
            temperature: 0.1,
            json: true,
            maxTokens: 4096,
            timeoutMs: 90_000,
        };
        let cf = await workerTieredLLM('parser', prompt, parserOpts);
        if (!cf?.trim()) {
            // One silent retry — a single cold/slow call shouldn't surface the
            // scary error immediately when a second attempt often succeeds.
            cf = await workerTieredLLM('parser', prompt, parserOpts);
        }
        if (!cf?.trim()) {
            throw new Error('Workers AI returned an empty response. The model may be warming up — please try again, or click "Wake AI models" in Settings.');
        }
        text = cf;
    } else {
        // All other providers: route strictly through the selected provider via groqChat.
        // No silent fallback to Claude or any other provider.
        text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 4096 });
    }
    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(text));
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);

    return profileData;
};

export const generateCV = async (
    profileInput: UserProfile,
    contextDescription: string,
    generationMode: CVGenerationMode,
    purpose: 'job' | 'academic' | 'general',
    scholarshipFormat: ScholarshipFormat = 'standard',
    marketResearch?: MarketResearchResult | null,
    targetLanguage?: string,
    callerOnPurifyReport?: (report: PurifyReport) => void,
    /**
     * Deterministic ATS gap-pins: keywords confirmed missing from the user's
     * *current* CV via `scoreAtsCoverage`. When provided, these are injected
     * into the prompt as a highest-priority "MUST APPEAR" list so the generated
     * CV specifically bridges the gap between the current draft and the JD.
     * Capped at 12 terms inside the function regardless of what is passed.
     */
    targetKeywords?: string[],
    /**
     * Optional streaming callback fired immediately when the raw Worker sections
     * arrive — before the quality polish pipeline. Lets the UI show the CV
     * progressively while polishing runs in the background.
     */
    onSectionsDraft?: (cv: Partial<CVData>) => void,
    /**
     * Active profile slot ID. When provided, the profile cache lookup is
     * scoped to THIS slot only — preventing cross-profile hash reuse when two
     * slots share the same compact profile JSON (e.g. a freshly-cloned room).
     */
    slotId?: string,
): Promise<CVData> => {

    // ── HOT FIRE (inbound) ── Scrub banned phrases out of the source profile
    // BEFORE any prompt is built, so the AI is never primed by buzzwords the
    // user typed manually or that survived from a non-Word import path.
    const profile = purifyProfile(profileInput);

    // Smart-truncate the JD before anything else to reduce token spend on every
    // downstream call (keyword analysis, mode prompt, market intel, etc.)
    const jd = smartTruncateJD(contextDescription.trim());

    // ── Cache check: return immediately if profile+JD+mode haven't changed ──
    const _pinnedKeywords = (targetKeywords || []).slice(0, 12);
    const cacheKey = cvCacheKey(profile, jd, generationMode, purpose, {
        targetLanguage,
        scholarshipFormat,
        marketResearch: marketResearch || null,
        targetKeywords: _pinnedKeywords.length ? _pinnedKeywords : undefined,
    });
    const cached = cvCacheGet(cacheKey);
    if (cached) {
        console.log('[CV Cache] Hit — returning cached result (no tokens used)');
        return cached;
    }

    // ── Narrative angle — selected once per generation, never cached ──────────
    // Different angle each run so the same profile produces different-feeling CVs.
    // Academic CVs always use 'impact' — most effective for scholarship/fellowship applications.
    const _narrativeAngle: NarrativeAngle = purpose === 'academic'
        ? 'impact'
        : selectFreshAngle();
    console.log(`[CV Gen] Narrative angle: ${_narrativeAngle}`);

    // ── Generation trace — lightweight audit trail for this generation ────────
    const _traceBuilder: TraceBuilder = startTrace(CV_RULES_VERSION, _narrativeAngle, _pinnedKeywords);

    // S4: fetch active prompt version numbers from cache (no network if pre-warmed)
    // and tag them into the trace so every CV is linked to the exact prompt versions
    // that produced it.  Fire-and-forget — failures silently produce an empty map.
    void getPromptVersions().then(versions => {
        if (Object.keys(versions).length > 0) {
            _traceBuilder.record({ promptVersions: versions });
        }
    }).catch(() => {/* graceful degradation */});

    // Compute total years of experience for the engine brief
    const totalYears = (profile.workExperience || []).reduce((sum, exp) => {
        const sy = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const ey = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        return sum + (sy ? Math.max(0, ey - sy) : 0);
    }, 0);
    const primaryTitle = profile.workExperience?.[0]?.jobTitle || '';
    const seniority = totalYears < 3 ? 'junior' : totalYears < 7 ? 'mid' : totalYears < 12 ? 'senior' : 'exec';

    // Start reference-example lookup in the background (parallel with brief + keywords).
    // Pool diversity: pass the CURRENT angle so the worker returns an example that
    // used a DIFFERENT angle — preventing the feedback loop from converging on one framing.
    // A fingerprint miss returns null quickly; a hit adds ~150 tokens that guide structure.
    const cvExamplePromise: Promise<{ fingerprint: string; example: Awaited<ReturnType<typeof fetchCVExample>> }> =
        computeExampleFingerprint(primaryTitle, totalYears, purpose, generationMode)
            .then(async fp => ({ fingerprint: fp, example: await fetchCVExample(fp, _narrativeAngle) }))
            .catch(() => ({ fingerprint: '', example: null }));

    // Run keyword extraction and CV-engine brief in parallel — both are best-effort.
    let keywordInstruction = '';
    let engineBrief: CVBrief | null = null;
    const [keywordRes, briefRes] = await Promise.allSettled([
        jd ? analyzeJobDescriptionForKeywords(jd) : Promise.resolve(null),
        buildBrief({
            jd: jd || undefined,
            // Worker-first enrichment: send a compact profile snapshot so the
            // Cloudflare brief builder can score field/voice with more context
            // than JD text alone (skills, title trajectory, project domains).
            profile: {
                headline: profile.summary || profile.personalInfo?.title || '',
                skills: (profile.skills || []).slice(0, 30),
                experience: (profile.workExperience || []).map(exp => ({
                    jobTitle: exp.jobTitle || '',
                    company: exp.company || '',
                    responsibilities: exp.responsibilities || '',
                    startDate: exp.startDate || '',
                    endDate: exp.endDate || '',
                })).slice(0, 12),
                projects: (profile.projects || []).map(p => ({
                    name: p.name || '',
                    description: p.description || '',
                    technologies: (p as any).technologies || [],
                })).slice(0, 10),
            },
            yearsExperience: totalYears,
            currentTitle: primaryTitle,
            section: 'current_role',
            bulletCount: profile.workExperience?.[0]?.pointCount ?? 5,
        }),
    ]);
    if (keywordRes.status === 'fulfilled' && keywordRes.value) {
        const allKeywords = [...(keywordRes.value.keywords || []), ...(keywordRes.value.skills || [])];
        if (allKeywords.length > 0) {
            keywordInstruction = `
                **CRITICAL REQUIREMENT: KEYWORD STRATEGY**: Strategically and naturally integrate the following keywords throughout the CV — in the summary, bullet points, and skills. Weave them in so they feel organic, not stuffed.
                **Must-Include Keywords**: ${allKeywords.join(', ')}
                `;
        }
    } else if (keywordRes.status === 'rejected') {
        console.error("Keyword analysis failed, proceeding without explicit keywords.", keywordRes.reason);
    }

    // ── JD-aware skill reconciliation ─────────────────────────────────────────
    // Run immediately after JD analysis so we know which profile skills are
    // actually relevant to this job. Result flows into three places:
    //   1. mainPromptInstruction — hint for the skills section prompt
    //   2. experience section instruction — per-role skill-demonstration directives
    //   3. applySourceFidelityRules — authoritative post-gen skills gate
    let _reconciledSkills: ReconciledSkills | null = null;
    if (jd && keywordRes.status === 'fulfilled' && keywordRes.value) {
        const jdAllSkills = [
            ...(keywordRes.value.keywords || []),
            ...(keywordRes.value.skills || []),
        ];
        if (jdAllSkills.length > 0) {
            try {
                const experienceEntries = (profile.workExperience || []).map((exp, idx) => {
                    const raw = exp.responsibilities;
                    const bullets: string[] = Array.isArray(raw)
                        ? raw as string[]
                        : typeof raw === 'string'
                            ? raw.split(/\n|•|–|-/).map((s: string) => s.trim()).filter(Boolean)
                            : [];
                    return { id: `role_${idx}`, bullets };
                });
                const flatBullets = experienceEntries.flatMap(e => e.bullets);
                _reconciledSkills = reconcileSkills(
                    profile.skills ?? [],
                    jdAllSkills,
                    flatBullets,
                    experienceEntries,
                    /* jdOnlyMode= */ true,
                );
                console.log(
                    `[SkillsReconcile] JD-aware: ${_reconciledSkills.finalSkills.length} skills ` +
                    `(promoted=${_reconciledSkills.promoted.length}, ` +
                    `+${_reconciledSkills.addedFromJD.length} evidenced JD, ` +
                    `-${_reconciledSkills.dropped.length} dropped). ` +
                    `Evidence map: ${_reconciledSkills.evidenceMap.size} skills role-anchored.`
                );
            } catch (err) {
                console.warn('[SkillsReconcile] Failed (non-fatal, using profile.skills):', err);
            }
        }
    }

    // ── Gap-pin block ──────────────────────────────────────────────────────────
    // Deterministic layer: keywords confirmed ABSENT from the user's current CV
    // via `scoreAtsCoverage`. Sits on top of `keywordInstruction` (which is
    // LLM-extracted and lists *all* JD keywords) — the gap-pin block is narrower
    // and higher-priority: it names only the terms that are actually missing so
    // the model knows exactly where to focus its integration effort.
    let gapPinBlock = '';
    if (_pinnedKeywords.length > 0) {
        const kwLines = _pinnedKeywords.map(k => `  - ${k}`).join('\n');
        gapPinBlock = `
**⚠ ATS GAP-PIN — VERIFIED MISSING FROM CURRENT CV (highest priority)**
An automated scan confirmed the following keywords appear in the job description but are ABSENT from the candidate's existing CV. Every term below MUST appear verbatim somewhere in the output. Find the most natural location for each in experience bullets or the skills section ONLY. Do NOT place gap-pin keywords in the professional summary — the summary must reflect the candidate's own value proposition, not keyword-stuffed JD terms. If a term cannot be worked naturally into a bullet given the candidate's actual experience, place it in the skills section instead. Do NOT invent achievements to shoehorn a keyword — use it only where the experience genuinely supports it.
Missing terms that must be incorporated (experience bullets or skills ONLY, never summary):
${kwLines}
`;
        console.log(`[CV Gen] Gap-pin: pinning ${_pinnedKeywords.length} missing ATS keywords: ${_pinnedKeywords.join(', ')}`);
    }

    if (briefRes.status === 'fulfilled' && briefRes.value) {
        engineBrief = briefRes.value;
        console.log(`[CV Engine] Brief: ${engineBrief.seniority?.level} / ${engineBrief.field?.field} / voice=${engineBrief.voice.primary?.name} / verbs=${engineBrief.verb_pool.length}`);
        _traceBuilder.record({
            seniority: engineBrief.seniority?.level ?? '',
            field: engineBrief.field?.field ?? '',
            voice: engineBrief.voice.primary?.name ?? '',
            verbPoolSample: engineBrief.verb_pool.slice(0, 12),
        });
        _traceBuilder.recordTimingMark('briefMs');
    }

    // Build the engine-driven instruction block (only when the brief is available).
    let engineInstruction = '';
    if (engineBrief) {
        // ── Priority 1: Verb pool — random 12 of the full pool per generation ──
        // Sending the same 24 every time creates recognisable verb fingerprints after
        // 50+ CVs. A shuffled 12 produces different verb energy each run.
        const verbList = shuffleArray(engineBrief.verb_pool)
            .slice(0, 12)
            .map(v => v.verb_past || v.verb)
            .join(', ');

        // ── Priority 3: Forbidden phrases — rotate 20 most relevant ──────────
        // Sending all 30 identical phrases every generation narrows the output
        // space the same way every time. Shuffling ensures different 20 each run.
        const forbidden = shuffleArray(engineBrief.forbidden_phrases).slice(0, 20).join(', ');

        const sen = engineBrief.seniority;
        const voice = engineBrief.voice.primary;
        const field = engineBrief.field;

        // ── Priority 6: Verbosity jitter ±0.2 so output feel varies slightly ─
        const verbosityJitter = (Math.random() * 0.4 - 0.2);
        const verbosityEffective = Math.min(5, Math.max(1, (voice?.verbosity_level ?? 3) + verbosityJitter));

        engineInstruction = `
        **CV ENGINE BRIEF (deterministic, overrides general guidance below)**
        - Seniority: ${sen?.level || 'unknown'} → bullet style "${sen?.bullet_style || 'balanced'}", metric density "${sen?.metric_density || 'medium'}", summary tone "${sen?.summary_tone || 'professional'}".
        - Field: ${field?.field || 'general'} → language style "${field?.language_style || 'neutral'}". Prefer metric types: ${(field?.metric_types || []).join(', ') || 'general business metrics'}. Avoid these verbs entirely: ${(field?.avoided_verbs || []).join(', ') || 'none'}.
        - Voice: primary "${voice?.name || 'neutral'}" (${voice?.tone || ''}), verbosity ${verbosityEffective.toFixed(1)}/5, opener frequency ${voice?.opener_frequency ?? 0.2}, metric preference "${voice?.metric_preference || 'medium'}".
        - APPROVED VERB POOL for this generation (use these for bullet starts; never repeat one): ${verbList}.
        - ABSOLUTELY FORBIDDEN PHRASES (zero tolerance): ${forbidden}.
        - ${buildNarrativeAngleBlock(_narrativeAngle)}
        `;
    }

    // ── Proactive slim-profile ────────────────────────────────────────────────
    // If the profile's total responsibility text exceeds ~12 K chars (roughly
    // 6+ roles with detailed bullet lists), use 120 chars/role instead of the
    // default 350 from the very start. This prevents 413s on large profiles
    // without ever needing the retry path — slim-retry remains as a safety net.
    const _totalRespChars = (profile.workExperience || []).reduce((sum: number, exp: any) => {
        const r = exp.responsibilities;
        if (!r) return sum;
        return sum + (typeof r === 'string' ? r.length : (r as string[]).join('\n').length);
    }, 0);
    const _profileMaxChars = _totalRespChars > 12_000 ? 120 : 350;
    if (_profileMaxChars === 120) {
        console.info(
            `[CV Gen] Large profile detected — ${_totalRespChars.toLocaleString()} resp. chars across ` +
            `${(profile.workExperience || []).length} roles. Using slim profile (120 chars/role) proactively.`,
        );
    }

    let mainPromptInstruction: string;
    let githubInstruction = '';

    // ─── Phase A anchor block ─────────────────────────────────────────────────
    // Pure-JS layer that gives Groq three things up-front:
    //   1. Locked real numbers / orgs / degrees (so it can never invent KES 8M
    //      when the profile says KES 800K, or swap "Biosystems Engineering"
    //      for "Agricultural Engineering").
    //   2. Field-aware good bullet examples (placeholder numbers — Groq cannot
    //      copy data out of them).
    //   3. Bad examples drawn from real production bugs we have seen.
    // Built once here, injected into both the job and general prompts below.
    const { field: _detectedField, source: _fieldSource } = detectFieldWithSource(jd, profile);
    _traceBuilder.record({ fieldSource: _fieldSource });
    const _lockedValues = lockRealNumbers(profile);
    const promptAnchorBlock = buildPromptAnchorBlock({
        locked: _lockedValues,
        field: _detectedField,
    });

    // Scenario classification — runs for ALL purposes (job, general, academic).
    // Detects the candidate's profile type so every mode generates the right CV structure.
    const scenario = detectScenario(profile.workExperience || [], profile.projects || []);
    const scenarioBlock = buildScenarioBlock(scenario, generationMode);
    if (scenario !== 'standard') {
        console.log(`[CV Gen] Scenario ${scenario} detected (purpose: ${purpose}) — applying targeted scenario rules.`);
    }

    // Career-pivot detection — orthogonal to A/B/C/D. Triggers when the candidate's
    // background and the JD belong to clearly different fields (e.g. agricultural
    // engineer applying to a software role). Adds a bridge-formula instruction block.
    const pivot = detectDomainPivot(profile, jd, undefined);
    const pivotBlock = buildPivotBlock(pivot);
    if (pivot) {
        console.log(`[CV Gen] Career pivot detected: ${pivot.from.join('/')} → ${pivot.to.join('/')} — applying bridge-formula rules.`);
    }

    // S1: Rule Registry — evaluate against cached registry configs (zero latency,
    // sync read from localStorage). Records the rule key and A/B group into the
    // generation trace so every generation is traceable to a specific rule version.
    let _ruleEval: import('./ruleRegistryClient').EvaluateResult | null = null;
    try {
        const { evaluateScenario: _evalScenario, getCachedRuleConfigsSync } = await import('./ruleRegistryClient');
        const _ruleConfigs = getCachedRuleConfigsSync();
        const _totalMonths = (profile.workExperience || []).reduce((acc: number, exp: any) => {
            const start = new Date(exp.startDate);
            const end = exp.endDate?.toLowerCase() === 'present' ? new Date() : new Date(exp.endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return acc;
            const mo = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            return acc + Math.max(0, mo);
        }, 0);
        _ruleEval = _evalScenario({
            hasExperience: (profile.workExperience || []).length > 0,
            hasProjects: (profile.projects || []).length > 0,
            totalMonths: _totalMonths,
            pivotDetected: Boolean(pivot),
        }, _ruleConfigs);
        if (_ruleEval.source === 'registry') {
            console.log(`[CV Gen] Rule Registry: ${_ruleEval.abGroup} (id=${_ruleEval.ruleId})`);
        }
    } catch { /* non-blocking — rule eval failure never aborts generation */ }

    // ── Record scenario + pivot + rule registry into trace ────────────────────
    _traceBuilder.record({
        scenario,
        scenarioEvidence: {
            hasExperience: (profile.workExperience || []).length > 0,
            hasProjects: (profile.projects || []).length > 0,
            pivotDetected: Boolean(pivot),
            pivotFrom: pivot?.from,
            pivotTo: pivot?.to,
        },
        gapKeywords: _pinnedKeywords,
        ...(_ruleEval ? {
            ruleKey:    _ruleEval.ruleKey,
            ruleId:     _ruleEval.ruleId,
            abGroup:    _ruleEval.abGroup,
            ruleSource: _ruleEval.source,
        } : {}),
    });

    if (profile.personalInfo.github) {
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Leverage this to validate and enrich the technical depth of the skills and projects sections.`;
    }

    const sectionOrderInstruction = buildSectionOrderInstruction(profile);
    const profileJdMatch = jdProfileSimilarity(profile, jd);
    const staleProfileInstruction = buildStaleProfileRefreshInstruction(profile, marketResearch);
    const preservationInstruction = profileJdMatch >= 0.58
        ? `
        **HIGH PROFILE↔JD MATCH DETECTED (${Math.round(profileJdMatch * 100)}%) — PRESERVATION MODE**:
        - Keep the candidate's existing career story, role ordering, and core responsibilities largely intact.
        - Prioritise light optimisation: stronger verbs, cleaner phrasing, better metrics framing, ATS keyword placement.
        - DO NOT rewrite every bullet from scratch when the original already demonstrates the same requirement.
        - Prefer synonym/precision upgrades over structural overhauls.
        `
        : profileJdMatch >= 0.4
            ? `
        **MEDIUM PROFILE↔JD MATCH (${Math.round(profileJdMatch * 100)}%) — BALANCED MODE**:
        - Keep proven relevant bullets and only transform low-signal bullets.
        - Preserve domain-equivalent backgrounds (e.g., Biosystems Engineering ↔ Agricultural Engineering) when responsibilities clearly overlap.
        - Focus edits on terminology alignment, evidence strength, and ATS clarity.
        `
            : '';

    const humanizationInstruction = `
    ${_humanizationInstructionHeader}

    ${HUMANIZATION_RULES}

    ${HUMANIZATION_CHECKLIST}
    `;

    // Build experience instruction — the user's per-role bullet count is BINDING.
    // This block overrides any general bullet-count guidance elsewhere in the prompt.
    const experienceInstructionLines = profile.workExperience.map((exp, idx) => {
        const count = exp.pointCount ?? 5;
        const startYear = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const endYear = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        const years = startYear ? Math.max(1, endYear - startYear) : null;
        const tenureNote = years ? ` (${years} year${years !== 1 ? 's' : ''} tenure)` : '';
        return `  • ROLE_${idx + 1}: ${exp.jobTitle} @ ${exp.company}${tenureNote} → EXACTLY ${count} bullet point${count === 1 ? '' : 's'} ⚠ CONTENT LOCK: bullets for ROLE_${idx + 1} may ONLY draw from ROLE_${idx + 1}'s responsibilities text.`;
    }).join('\n');
    const roleCount = profile.workExperience.length;
    const experienceInstruction = `
=== EXACT BULLET COUNT PER ROLE (USER-CHOSEN — BINDING, OVERRIDES EVERYTHING ELSE) ===
The user has explicitly set the number of bullets per role below. This count is non-negotiable.
- If you generate FEWER bullets than specified, the output will be rejected.
- If you generate MORE bullets than specified, the output will be rejected.
- The scope-anchor bullet counts as bullet #1 (it is included in the total, not added on top).
- Apply this rule to every role listed below, in every generation mode (general, job, academic, regenerate, optimize, improve).

${experienceInstructionLines}

=== TENURE-BASED METRIC GUIDANCE (per role) ===
The following tenure data tells you how long this candidate held each role. Use it to calibrate
the scope and scale of honest claims — longer tenure supports broader claims; shorter tenure
requires narrower, more specific ones. YOU MUST NOT invent specific numbers not present in the
profile, but you MAY infer reasonable scope language from the tenure duration below.
${((): string => {
    const hints = (profile.workExperience || []).map((exp: any, idx: number) => {
        const startDate = exp.startDate ? new Date(exp.startDate) : null;
        const endDate = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : new Date();
        const months = startDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4))) : null;
        if (!months) return '';
        const years = (months / 12).toFixed(1);
        let guidance = '';
        if (months >= 36) guidance = `Long tenure (${years}yrs). Appropriate to reference: repeated project cycles, client relationship depth, team growth over time, process improvements across multiple quarters.`;
        else if (months >= 18) guidance = `Established role (${years}yrs). Appropriate to reference: end-to-end project ownership, multi-phase delivery, growing responsibilities over the period.`;
        else if (months >= 9) guidance = `Medium tenure (${months}mo). Reference specific deliverables, named projects, and concrete outcomes from that period.`;
        else guidance = `Short tenure / attachment (${months}mo). Focus on specific tasks and concrete outputs — avoid broad organisational claims.`;
        return `  • ROLE_${idx + 1} (${exp.jobTitle} @ ${exp.company}): ${guidance}`;
    }).filter(Boolean);
    return hints.length ? hints.join('\n') : '  (No date information available — base scope claims only on explicit profile content.)';
})()}
=== END TENURE GUIDANCE ===

=== ROLE ISOLATION — CRITICAL, NO EXCEPTIONS ===
The profile contains ${roleCount} work experience role${roleCount !== 1 ? 's' : ''}, each labeled ROLE_1, ROLE_2, … up to ROLE_${roleCount}.
RULE: Bullets for any ROLE_N must draw EXCLUSIVELY from that role's own "_role": "ROLE_N" entry in the profile.
- Every fact, metric, project name, technology, or responsibility belongs to one role only — never copy it into a different role's bullets.
- Before writing each bullet, verify: "Is this fact in THIS role's responsibilities text?" If the answer is no, discard it.
- If a role's responsibilities are thin, write shorter or broader honest bullets — NEVER borrow content from another role to fill space.
- This rule applies equally to every role — ROLE_1, ROLE_2, ROLE_3, and so on, regardless of how many roles exist.
- Mixing content between any two roles is a critical failure that will cause the output to be REJECTED.
=== END EXACT BULLET COUNT BLOCK ===
`;

    if (purpose === 'general') {
        mainPromptInstruction = `
            You are a world-class CV writer. Create a powerful, general-purpose CV that presents the candidate at their absolute best across diverse job markets and industries.

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            ${promptAnchorBlock}

            === CV GENERATION RULES — Follow every rule, no exceptions ===

            ① SUMMARY — Versatile Value Proposition (3–4 sentences, 60–80 words):
               - Sentence 1 (WHO + SENIORITY): Job title + years of experience + primary domain. Specific, not generic. Start with the title or number, never "I" or "A".
               - Sentence 2 (PROOF): Single most impressive, quantified achievement. Must contain a real number or a specific named outcome.
               - Sentence 3 (RANGE): Breadth across functions, industries, or skills that makes them valuable across contexts.
               - Sentence 4 (PROMISE, optional): The type of value they consistently deliver — one concrete fact, never a cliché.
               - BANNED IN SUMMARY: "passionate about", "detail-oriented", "results-driven", "dynamic", "innovative", "go-getter", "team player", "seeking an opportunity", "seeking to use", "seeking to apply", "seeking to bring", "looking to", "looking for", "aiming to", "hoping to", "eager to join", "excited to contribute". The summary must state what the candidate DELIVERS, not what they WANT — write from the employer's perspective.
               - NEVER use invented verbs anywhere in the CV: "Greenfielded", "Scaffolded" (non-software), "Materialized" (as in "materialized solutions"), "Actioned", "Ideated", "Solutioned". Use standard strong verbs instead.
               - SUMMARY SOURCE RULE (non-negotiable): Every sentence in the summary must be built from the candidate's ACTUAL work experience and education listed in their profile. NEVER copy phrases, role requirements, objectives, or language from the job description into the summary. The target job title may appear once as an alignment signal — nothing else from the JD belongs in the summary.

            ② EXPERIENCE — Showcase Full Breadth and Growth:
               - FIRST BULLET of every role = SCOPE ANCHOR (team size, geographic reach, client count, budget, project count). Not an achievement.
               - Every subsequent bullet: [Strong Verb] + [Specific Action/Context] + [Measurable Outcome].
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on", "Assisted", "Participated in", "Tasked with", "Contributed to".
               - Career arc must be visible: scope and responsibility must grow role-to-role.
               - Verb tense: current role = present tense ("Manages", "Leads"). Past roles = past tense ("Managed", "Led").
               - No two bullets across the entire document may start with the same verb.
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS — EXACTLY 15 skills:
               Position 1–5: Core domain/technical expertise.
               Position 6–10: Tools, platforms, and methodologies.
               Position 11–13: Transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry or function-specific terminology that adds ATS value.
               Every skill at positions 1–5 must appear in at least one experience bullet — never list a skill with no evidence.

            ④ PROJECTS — Only include if the profile has real projects. Omit the section entirely if none exist:
               - [Problem or Goal] → [Tools/Approach] → [Measurable Outcome + Scale].
               - Each project description must name at least one specific technology, tool, or methodology.

            ⑤ SECTION OMISSION RULES:
               - Do NOT generate an empty section. An absent section is professional; an empty one is not.
               - If the profile has no work experience → omit the experience section.
               - If the profile has no projects → omit the projects section.

            ⑥ BULLET QUALITY & RHYTHM RULES (mix lengths PROPORTIONALLY by role bullet count N):
               - N=3 → 1 punchy + 2 standard. N=4–5 → 1 punchy + 2–3 standard + 1 narrative. N=6–7 → 2 punchy + 3–4 standard + 1 narrative. N=8–10 → 2 punchy + 4–5 standard + 2–3 narrative.
               - Bands: PUNCHY 8–14 words, STANDARD 15–22 words, NARRATIVE 25–40 words (two sentences).
               - A role with ≥5 bullets that uses only ONE band (e.g. all 8 bullets standard-length) = failure. Three bullets in a row of similar length = failure.
               - Hard floors and ceilings: under 8 words = stub (failure). Over 45 words = rambling (failure).
               - TARGET: At least 40% of bullets per role should carry a number. With 5 bullets, aim for 2–3 with metrics. With 8 bullets, 3–4.
               - Max 65% of bullets per role may contain a number — keep 1–2 per role purely qualitative.
               - Metric synthesis: when explicit numbers are absent, infer conservative estimates from context (tenure, scope words, role norms). Mark estimates with "~", "12+", "up to X". A conservative estimate beats a vague description every time.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else if (purpose === 'academic') {
        const scholarshipFormatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        mainPromptInstruction = `
            You are the world's leading academic CV specialist and grant-writing consultant. Create an outstanding academic CV that maximizes the candidate's chances for this specific scholarship, grant, or academic opportunity.

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            GRANT/SCHOLARSHIP/ACADEMIC PURPOSE:
            ${jd || 'General academic application'}

            ${scholarshipFormatInstruction}
            ${keywordInstruction}
            ${gapPinBlock}

            === ACADEMIC CV STRATEGY ===

            ① RESEARCH/ACADEMIC SUMMARY — "Scholar's Pitch" (3–4 sentences, 70–90 words):
               - Sentence 1 (IDENTITY): Research identity + discipline + career stage (e.g., "Doctoral researcher in computational epidemiology with 6 years of quantitative fieldwork across sub-Saharan Africa").
               - Sentence 2 (CONTRIBUTION): Their most significant scholarly contribution — name the publication, grant won, dataset created, or methodology developed. Include a number (citation count, sample size, grant value, etc.).
               - Sentence 3 (METHODOLOGY): Primary research methods/tools that make them uniquely qualified for this opportunity.
               - Sentence 4 (VISION): Future research trajectory and how this opportunity directly enables it. Be specific about what they will achieve, not just what they want to study.
               - RULE: Must not use "passionate about research" or generic academic filler. Every sentence must be checkable.

            ② EXPERIENCE — Scholarly Impact Focus:
               - Every bullet: [Research Verb] + [Methodology/Scope] + [Academic Output or Impact].
               - Strong academic verbs: Investigated, Designed, Analyzed, Published, Presented, Supervised, Secured, Collaborated, Validated, Implemented, Modeled, Synthesized, Contributed, Developed, Evaluated.
               - For publications: include journal name, year, and if possible impact factor or citation count.
               - For grants: include grant body, value in USD/GBP/EUR, and duration.
               - For supervision: include number of students supervised and their outcomes (graduated, papers published).
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS (15 total — academy-ordered):
               - Position 1–5: Research methods/methodologies (quantitative, qualitative, mixed-methods, specific software: R, Python/pandas, SPSS, NVivo, STATA, MATLAB, etc.).
               - Position 6–10: Domain-specific expertise and theoretical frameworks.
               - Position 11–15: Academic tools, platforms, languages (LaTeX, Mendeley, academic databases, languages spoken).

            ④ EDUCATION — Highlight Academic Distinction:
               - ALWAYS include: GPA if ≥3.5/4.0 or First Class/Distinction equivalent.
               - Thesis title (in full) + 1-sentence description of original contribution.
               - Most relevant honors, scholarships previously won, or fellowships held.
               - 2–3 key relevant courses only if they are directly relevant to the application.
               - GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, treat the degree as COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or equivalents for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Frame as Research Outputs:
               - Each project = a mini research paper abstract: Research Question → Methodology → Findings/Output.
               - Include collaborating institutions if applicable (adds credibility).
               - Link to published papers, repositories, or datasets where available.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else {
        // JOB purpose — run the full pre-generation pipeline (Blocks A, B, C, D)
        const currency = detectCurrency(jd, profile.personalInfo?.location || '');
        const seniority = detectSeniority(profile.workExperience || []);
        const market = detectMarket(currency);

        // Block D — company context from market research or JD signals
        let blockD = '';
        if (marketResearch) {
            blockD = buildMarketIntelligencePrompt(marketResearch);
        } else if (jd) {
            blockD = `Extracted from JD: ${jd.substring(0, 600)}`;
        }

        // Gap detection — pass employment gaps to the mode prompt for intelligent handling
        const gaps = detectGaps(profile.workExperience || []);
        if (gaps.length > 0) {
            console.log(`[CV Gen] Detected ${gaps.length} employment gap(s):`, gaps.map(g => `${g.gapMonths}mo between "${g.fromRole}" and "${g.toRole}"`));
        }

        const modeBlock = buildModePromptBlock(generationMode, currency, seniority, market, blockD, gaps);

        mainPromptInstruction = `
            You are the world's greatest CV strategist operating under strict market-calibrated rules.
            Your sole mission: generate the single highest-performing CV for this specific candidate targeting this specific role.

            ${modeBlock}

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            JOB DESCRIPTION / TARGET CONTEXT:
            ${jd}

            ${keywordInstruction}
            ${gapPinBlock}

            ${promptAnchorBlock}

            === CV GENERATION STRATEGY — Follow in order ===

            ① PROFESSIONAL SUMMARY — The "3P Formula" (55–75 words, 3–4 sentences):
               ATS NOTE: The summary is parsed FIRST by every ATS system — it carries the highest keyword weight of any section. The 3 most critical JD keywords MUST appear verbatim in this section.
               HOOK (Sentence 1): [Years of experience as a number] + [EXACT job title from JD] + [primary domain/industry]. Never start with "I" or "A". Start with the number or the role title.
                 Example: "Water Resources Engineer with 6 years delivering rural infrastructure projects across East Africa."
               PROOF (Sentence 2): Their single strongest, most-quantified achievement that DIRECTLY addresses what the JD needs. Must contain a number within the market metric ceilings stated above. Use XYZ formula: "Accomplished [X] as measured by [Y] by doing [Z]."
               PROMISE (Sentence 3): Why hiring them solves the employer's specific problem — connect their skills to the JD's explicit requirements. Name the company's context from Block D if available.
               BANNED IN SUMMARY: "passionate", "dynamic", "results-driven", "detail-oriented", "innovative", "seasoned professional", "proactive", "go-getter", "versatile", "seeking to", "looking to", "aiming to", "hoping to", "eager to join", "excited to contribute". The summary speaks from the employer's perspective — it states what value the candidate DELIVERS, never what the candidate WANTS.
               NEVER use invented verbs anywhere in the CV: "Greenfielded", "Scaffolded" (non-software), "Materialized" (as in "materialized solutions"), "Actioned", "Ideated", "Solutioned". Use plain strong verbs: Built, Led, Delivered, Managed, Developed, Implemented, Designed, Negotiated, etc.

            ② EXPERIENCE — Every bullet is proof of fit:
               BULLET FORMULA — choose per bullet:
                 WITH metrics → XYZ: "Grew [X] by [Y metric] by doing [Z]" — result first, method second.
                 WITHOUT metrics → CAR: "[Context/Challenge] — [Action taken] — [Change produced]."
                 NEVER start with "Responsible for", "Helped", "Assisted", "Worked on", "Was part of", "Participated in", "Tasked with".

               FIRST BULLET = SCOPE ANCHOR (mandatory for every role):
                 The very first bullet of EVERY role must establish the scope of that role — not an achievement.
                 Include one or more: team size, number of direct reports, geographic coverage, client portfolio size, budget managed, or project count.
                 Example: "Managed a portfolio of 14 enterprise client accounts across Nairobi and Central Kenya, coordinating with a 5-person field operations team."
                 This orients the recruiter before they read any achievement bullets below it.

               BULLET COUNT PER ROLE — USER-CHOSEN (binding, non-negotiable):
                 The user has explicitly set the number of bullets for each role (see "EXACT BULLET COUNT PER ROLE" block below).
                 Generate EXACTLY that number for each role — never more, never fewer, even if you think a role deserves more space.
                 The scope-anchor bullet IS included in that count (it counts as bullet #1 of the role).

               VERB TENSE (critical for ATS employment status detection):
                 Current role (endDate = "Present" or blank): ALL bullets in PRESENT TENSE — "Manages", "Leads", "Coordinates".
                 All previous roles: ALL bullets in PAST TENSE — "Managed", "Led", "Coordinated".
                 Mixing tenses within a single role breaks ATS parsing.

               JD MIRRORING: Mirror the JD's exact phrases in at least 3 bullets per role. Use the same acronyms and terminology the JD uses. Never paraphrase a keyword.
               VERB VARIETY: No two bullets across the entire document may start with the same verb.
               CAREER ARC: Scope, team size, and metric scale must visibly grow across roles — the current role must show the largest scope.
               GOLDEN RULES (apply always):
               - Company names provided by the user are SACRED — never change, invent, abbreviate, or replace them.
               - Dates are locked — never change any employment date.
               - Career must progress forward — never create a backwards timeline.
               - One currency only — the one detected in Block A.
               ${experienceInstruction}

            ③ SKILLS (EXACTLY 15 — ordered by JD priority for ATS):
               Position 1–5: EXACT tools/technologies named in the JD (verbatim — ATS keyword match).
               Position 6–10: Core technical/domain skills for the role, closest JD-adjacent skills first.
               Position 11–13: Soft/transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry/domain ATS keywords from the JD that did not fit elsewhere.
               NOTE: Every skill at positions 1–5 must also appear at least once in the experience bullets — skills mentioned nowhere else in the CV score very low on ATS.

            ④ EDUCATION:
               'description': 1 concise sentence — GPA if ≥3.5 (or equivalent distinction), thesis title if relevant, honors or distinction, or 2–3 directly relevant courses.
               Highlight scholarships or awards if present — they signal high achievement to recruiters.
               GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or any equivalent phrase for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Proof-of-Skill Snapshots:
               FORMAT: [Problem/Goal] → [Solution with named technologies or methods] → [Measurable outcome].
               Prioritize projects that demonstrate skills the JD specifically requires.
               Each project description must name at least one specific technology, tool, framework, or methodology.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;

    }

    // Prepend section order + custom section notes (if any) to the prompt
    if (sectionOrderInstruction) {
        mainPromptInstruction = `${sectionOrderInstruction}\n\n${mainPromptInstruction}`;
    }

    // Prepend live market intelligence for non-job modes only
    // (job mode already injects market research into Block D of the mode prompt)
    if (marketResearch && purpose !== 'job') {
        const marketBlock = buildMarketIntelligencePrompt(marketResearch);
        mainPromptInstruction = `${marketBlock}\n\n${mainPromptInstruction}`;
    }

    // Language instruction — append if a non-English language is requested
    if (targetLanguage && targetLanguage !== 'English') {
        mainPromptInstruction += `

**LANGUAGE REQUIREMENT (MANDATORY)**:
Write ALL content in ${targetLanguage}. This includes: the professional summary, all experience bullet points, skills list items, education descriptions, and project descriptions.
EXCEPTIONS — keep in original language:
- Proper nouns: company names, university names, product names, tool/technology names, programming language names (e.g. "Python", "React", "Google", "Stanford").
- Dates and numbers.
- The applicant's personal information (name, email, location).
- Any direct quotes or certifications.
Output must be fluent, professional-grade ${targetLanguage} — not a literal translation. Adapt idioms and phrasing to be natural for native ${targetLanguage} speakers in a professional context.
`;
    }

    // ── Structural reference injection (parallel lookup resolves here) ──────────
    // cvExamplePromise ran in parallel with buildBrief, so typically 0 added latency.
    // On a hit: prepend a ~150-token structural blueprint so the LLM mirrors a proven
    // bullet-rhythm pattern rather than inventing from scratch.
    const { fingerprint: exampleFingerprint, example: cvExample } = await cvExamplePromise;
    if (cvExample) {
        const referenceBlock = buildReferenceBlock(cvExample);
        mainPromptInstruction = `${referenceBlock}\n\n${mainPromptInstruction}`;
        console.log(`[CV Examples] Structural reference injected (${cvExample.seniority} ${cvExample.primaryTitle}, ${cvExample.experienceStructure.length} roles)`);
    }

    // ── Inject reconciled-skills hint into prompt ──────────────────────────────
    // Appended AFTER the full instruction is assembled so the model sees it near
    // the end of the context window (recency bias) just before the section call.
    // Only fires on the JD path — no-JD generation is unchanged.
    if (_reconciledSkills?.finalSkills?.length) {
        const promotedLine = _reconciledSkills.promoted.length
            ? `\nHighest priority (confirmed in profile AND JD): ${_reconciledSkills.promoted.join(', ')}.`
            : '';
        mainPromptInstruction += `\n\n=== JD-RECONCILED SKILLS (pre-computed — use as primary source for skills section) ===
The following ${_reconciledSkills.finalSkills.length} skills are BOTH relevant to the target job description AND evidenced in this candidate's profile or experience history. Use these as the starting point for the skills section — prefer this list over raw profile skills for the skills array output.${promotedLine}
Reconciled list (in priority order): ${_reconciledSkills.finalSkills.join(', ')}
If 15 slots remain unfilled after this list, draw from the general profile skills. Never add a skill absent from both this list and the profile.
=== END RECONCILED SKILLS ===`;
    }

    // ── Per-role skill-demonstration directives ────────────────────────────────
    // Built from the evidenceMap: skills anchored to specific experience entries
    // become soft directives injected into the experience section instruction.
    // "Demonstrate, don't just list" — never force or fabricate.
    let _skillDemonstrationBlock = '';
    if (_reconciledSkills?.evidenceMap?.size) {
        // Build role_idx → skills mapping; pick the most recent role per skill
        // to avoid the same skill directive appearing across multiple roles.
        const roleMap = new Map<number, string[]>();
        for (const [skill, roleIds] of _reconciledSkills.evidenceMap) {
            // Exclude profile-only evidence (no experience anchor)
            const entryIds = roleIds.filter(id => id !== 'profile');
            if (entryIds.length === 0) continue;
            // Prefer lowest index (most recent role — profile order is newest-first)
            const earliest = entryIds
                .map(id => parseInt(id.replace('role_', ''), 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b)[0];
            if (earliest === undefined) continue;
            if (!roleMap.has(earliest)) roleMap.set(earliest, []);
            roleMap.get(earliest)!.push(skill);
        }
        if (roleMap.size > 0) {
            const lines = Array.from(roleMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([idx, skills]) => {
                    const exp = profile.workExperience?.[idx];
                    const label = exp
                        ? `${exp.jobTitle || 'Role'} at ${exp.company || ''}`.trim()
                        : `Role ${idx + 1}`;
                    return `  ROLE_${idx + 1} (${label}): ${skills.slice(0, 5).join(', ')}`;
                })
                .join('\n');
            _skillDemonstrationBlock = `\n\n=== JD SKILL-DEMONSTRATION DIRECTIVES ===
For the roles listed below, where NATURAL, write bullets that DEMONSTRATE these skills in action — not merely list them. A skill-demonstration bullet MUST include a measurable outcome, scope, or result alongside the skill (e.g. "Built X using [Skill], reducing Y by Z%" or "Designed X with [Skill] across N clients"). A bullet that only names the skill without an outcome is no stronger than the skills list itself.
GUARDRAIL: Do NOT force a skill into a bullet if it distorts the achievement or requires inventing facts. When in doubt, leave it out.
${lines}
=== END SKILL-DEMONSTRATION DIRECTIVES ===`;
        }
    }

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    // Strip any markdown code fences the model may have wrapped the JSON in
    const stripFencesMain = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // CV-gen race tasks: kept for the LEGACY fallback path below. Fires
    // Llama 4 Scout (paid) AND GLM 4.7 Flash (free, 131K) in parallel
    // server-side and takes whichever lands first.
    // cvGenerateFast (Llama 3.1 8B) is a genuinely different model family from
    // cvGenerate (Mistral 24B). Racing different models means if Mistral is slow
    // or returning empty, Llama 8B can win and still deliver a generation.
    // cvGenerateLong was also Mistral — racing the same model twice was a no-op.
    const CV_GEN_RACE_TASKS = ['cvGenerate', 'cvGenerateFast'];

    // ── PRIMARY (Apr 27 2026): Section-parallel CV generation ───────────────
    // Only used when the user has selected Workers AI as their provider.
    // Claude / Gemini selections bypass this entirely and go straight to
    // groqChat (which routes to the selected provider with no cross-provider
    // fallback).
    let cvData: CVData;
    let cvDataFromSections: CVData | null = null;
    if (getSelectedProvider() === 'workers-ai') {
        const sectionsStart = Date.now();
        // Strip the full-CVData schema reference from the preamble — each
        // section call has its own narrower schema in its instruction tail.
        const stripCvSchema = (s: string) => s.split(CV_DATA_SCHEMA).join('').trim();
        let preamble = stripCvSchema(mainPromptInstruction);

        // ── Recency boost — CRITICAL RULES REMINDER ───────────────────────────
        // Appended to the END of the preamble (right before each section's
        // instruction) to exploit LLM recency bias. Rules placed last in the
        // context receive more attention than those buried in the middle of a
        // 20–40K char profile/JD prompt.
        preamble += _criticalRulesReminder;

        // ── Regenerate improvement — previous violation memory ─────────────────
        // If the quality gate found critical violations in the last generation,
        // inject a "DO NOT REPEAT" block at the very START of the preamble so
        // the LLM sees the failures via primacy bias before reading the profile.
        // consumePreviousViolationsBlock() clears the key after reading it, so
        // this block only fires once per cycle — not on every subsequent call.
        const _profileFp = profile?.personalInfo?.name
            ? btoa(unescape(encodeURIComponent(`${profile.personalInfo.name}::${profile.personalInfo?.email ?? ''}`)))
            : undefined;
        const prevViolationsBlock = consumePreviousViolationsBlock(_profileFp);
        if (prevViolationsBlock) {
            preamble = prevViolationsBlock + preamble;
            console.info('[CV Gen] Injected previous-violations block into preamble for regenerate improvement.');
        }

        // Profile cache optimisation — if the compact profile was previously
        // uploaded to D1, replace its text with {{PROFILE}} so the worker
        // fetches it server-side. This shrinks the HTTP request body significantly
        // and keeps the profile out of the network layer on every generation.
        //
        // ISOLATION RULE: When a slotId is provided we ONLY accept the hash that
        // is stored for THAT specific slot, and we re-verify the content hash
        // matches the currently stored hash. This prevents cross-slot contamination
        // where two rooms with identical compact-JSON (e.g. a freshly-cloned room)
        // would incorrectly share the other room's D1 profile cache entry — causing
        // the worker to generate the CV with the wrong room's profile data.
        //
        // Without a slotId we fall back to the old content-addressed scan (safe
        // for all legacy callers that don't pass slotId yet).
        //
        // Fully optional: if the lookup fails the full preamble is used as-is.
        let profileHashForWorker: string | null = null;
        try {
            const compactText = compactProfile(profile);
            let cachedHash: string | null = null;

            if (slotId) {
                // Slot-specific: only accept the hash stored for THIS slot
                const slotStoredHash = getProfileCacheHash(slotId);
                if (slotStoredHash) {
                    // Re-verify the current content still matches what was uploaded
                    const currentHash = await sha256Hex(compactText);
                    if (currentHash === slotStoredHash) {
                        cachedHash = slotStoredHash;
                    } else {
                        console.info(`[ProfileCache] Slot ${slotId.slice(0, 8)} hash mismatch — profile changed since last sync, sending full text`);
                    }
                }
            } else {
                // Fallback: content-addressed scan across all slots (legacy path)
                cachedHash = await getHashIfCached(compactText);
            }

            if (cachedHash && preamble.includes(compactText)) {
                preamble = preamble.replaceAll(compactText, '{{PROFILE}}');
                profileHashForWorker = cachedHash;
                console.info(`[ProfileCache] Using cached profile for slot ${slotId?.slice(0, 8) ?? 'unknown'} (hash ${cachedHash.substring(0, 12)}…) — profile text stripped from preamble`);
            }
        } catch { /* non-critical */ }

        // ⚠ IMPORTANT: Scout 17B silently returns empty responses when the
        // user prompt contains literal JSON example blobs like
        // {"experience":[{"jobTitle":"..."}]}. Describe the schema in plain
        // English instead — every model handles natural-language schemas
        // cleanly (verified Apr 27 2026).
        const sections: ParallelSectionRequest[] = [
            { name: 'summary',    task: 'cvSummary',    instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called summary whose value is the professional summary as a single string. The summary must be 60–90 words, 3–4 sentences, following the hook → proof → promise formula. Honor every rule above (banned phrases, sentence rhythm, length). CRITICAL BANS — the summary must NEVER include any seeking or aspiration language — not even mid-sentence. Absolutely banned: "Seeking to", "Looking to", "Aiming to", "Hoping to", "Eager to" (in any form — "eager to apply", "eager to contribute", "eager to join", etc.), "Excited to", "seeking an opportunity", "looking forward to", "keen to", or ANY clause that expresses what the candidate wants rather than what they deliver. The final sentence MUST state a concrete value delivered to future employers — never a job-seeking statement. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 500,  temperature, json: true },
            { name: 'skills',     task: 'cvSkills',     instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called skills whose value is an array of EXACTLY 15 string skills. Honor the position-1-5 / 6-10 / 11-13 / 14-15 ordering rule above (JD-priority order for ATS). Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 700,  temperature, json: true },
            { name: 'experience', task: 'cvExperience', instruction: `OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called experience whose value is an array. COMPLETENESS RULE (highest priority): your array MUST contain exactly ${(profile.workExperience || []).length} item(s) — one per role in the profile (ROLE_1 through ROLE_${(profile.workExperience || []).length}). Omitting any role is a critical failure. Each array item is an object with these string fields: company, jobTitle, dates (e.g. "Jan 2020 – Present"), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD or "Present"), and a responsibilities field that is an array of bullet-point strings. Honor the EXACT bullet count per role (binding) and verb-tense rules (current role = present tense bare form e.g. "Manage" not "Manages", past roles = past tense). FIRST bullet of every role is a SCOPE ANCHOR naming team size, budget, geographic coverage, or project count — not an achievement. No two bullets across the entire document may start with the same verb. OPENER ROTATION — use all 7 opener types across each role; no single type may appear more than twice per role: (1) verb "Manage/Build/Lead…"; (2) number "KES 800K in…", "3 counties…"; (3) scope "Across 5 regions…", "For 200+ clients…"; (4) context "As the sole engineer…", "After acquiring…"; (5) timeframe "In Q2 2024…", "Over 6 months…"; (6) collaboration "With the operations team…", "Partnering with…"; (7) outcome "Top performer in…", "Ranked #1…". Roles with 5+ bullets must use at least 3 different opener types. FORBIDDEN VERBS — never start any bullet with invented AI verbs: Greenfielded, Scaffolded (non-software), Materialized, Actioned, Ideated, Solutioned, Conceptualized, Operationalized — use real strong verbs (Built, Led, Delivered, Managed, Designed, Implemented, etc.). CRITICAL ROLE ISOLATION: each role in the profile is labeled ROLE_1, ROLE_2, etc. Bullets for ROLE_N must draw ONLY from ROLE_N's responsibilities text — never copy facts, metrics, project names, or technologies from a different role into another role's bullets. Cross-contamination between roles is a rejection-level failure. Do NOT include any other CVData fields. NO markdown fences, NO commentary.${_skillDemonstrationBlock}`, maxTokens: 5000, temperature, json: true },
            { name: 'education',  task: 'cvEducation',  instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called education whose value is an array. Each array item is an object with these string fields: degree, school, year, description. The description should be one concise sentence covering GPA / honors / thesis / 2–3 relevant courses where applicable. Honor the GRADUATION-STATUS RULE strictly — past or current-year graduation years mean the degree is COMPLETED; never write "currently pursuing" for a past degree. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 800, temperature, json: true },
        ];
        if (Array.isArray(profile.projects) && profile.projects.length > 0) {
            sections.push({ name: 'projects', task: 'cvProjects', instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called projects whose value is an array. Each array item is an object with these string fields: name, description, link (link may be empty if none exists), dates (copy exactly from the input project\'s startDate/endDate — format as "MMM YYYY – MMM YYYY" or "MMM YYYY – Present"; leave empty string if no dates given). Each project description must follow the format problem/goal → solution with named technologies → measurable outcome, and must name at least one specific technology, tool, framework, or methodology. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 1200, temperature, json: true });
        }

        const psResult = await workerParallelSections(sections, {
            system: SYSTEM_INSTRUCTION_PROFESSIONAL,
            preamble,
            fallbackTask: 'cvFallback',
            timeoutMs: 90000,
            profileHash: profileHashForWorker,
        });

        if (psResult) {
            // Tolerant parser: accepts {"field": value} OR raw value.
            const tolerantParse = (raw: string | undefined, field: string): any => {
                if (!raw) return null;
                try {
                    const obj = JSON.parse(stripFencesMain(raw));
                    if (obj && typeof obj === 'object' && !Array.isArray(obj) && field in obj) return obj[field];
                    return obj;
                } catch { return null; }
            };

            const sectionSummary = tolerantParse(psResult.results.summary?.text, 'summary');
            const sectionSkills  = tolerantParse(psResult.results.skills?.text,  'skills');
            const sectionEducation = tolerantParse(psResult.results.education?.text, 'education');

            // Parse experience then immediately patch any roles Workers AI dropped
            // due to token limits. We NEVER fail or fall back — missing roles are
            // restored from the raw profile so the user loses nothing.
            const sectionExperience = (() => {
                const aiRoles: any[] = Array.isArray(
                    tolerantParse(psResult.results.experience?.text, 'experience')
                ) ? tolerantParse(psResult.results.experience?.text, 'experience') : [];

                const profileRoles = profileToCV(profile).experience;
                if (aiRoles.length >= profileRoles.length) return aiRoles; // all present — nothing to do

                // Build a lookup of what the AI returned (by company + jobTitle)
                const aiKeys = new Set(aiRoles.map(e => `${e.company}|${e.jobTitle}`));
                const patched = [...aiRoles];
                for (const raw of profileRoles) {
                    if (!aiKeys.has(`${raw.company}|${raw.jobTitle}`)) {
                        // Role was dropped — restore it with profile bullets
                        patched.push(raw);
                        console.warn(
                            `[CV Gen] Workers AI truncated "${raw.jobTitle} @ ${raw.company}" — restored from profile.`
                        );
                    }
                }
                // Re-sort to match original profile order
                const order = new Map(profileRoles.map((e, i) => [`${e.company}|${e.jobTitle}`, i]));
                patched.sort((a, b) =>
                    (order.get(`${a.company}|${a.jobTitle}`) ?? 999) -
                    (order.get(`${b.company}|${b.jobTitle}`) ?? 999)
                );
                return patched;
            })();
            // Parse projects and merge in profile dates — the AI may return them
            // but as a safety net we always fall back to the profile's startDate/endDate
            // so project dates are never silently lost.
            const sectionProjects = (() => {
                const raw: any[] = psResult.results.projects
                    ? (Array.isArray(tolerantParse(psResult.results.projects.text, 'projects'))
                        ? tolerantParse(psResult.results.projects.text, 'projects')
                        : [])
                    : [];
                const profileProjects = (profile.projects || []).slice(0, 6);
                return raw.map((p: any, i: number) => {
                    const src = profileProjects[i];
                    if (!src) return p;
                    // Use AI-formatted dates if present; otherwise derive from profile fields
                    const dates = (typeof p.dates === 'string' && p.dates.trim())
                        ? p.dates.trim()
                        : formatExpDateRange(src.startDate, src.endDate === 'Present' || !src.endDate ? src.endDate : src.endDate);
                    const year = dates
                        ? dates.split(/[-–]/)[0].trim().replace(/^[A-Za-z]+\s+/, '') // extract start year
                        : undefined;
                    return { ...p, dates: dates || undefined, year: year || undefined };
                });
            })();

            const okSummary    = typeof sectionSummary === 'string' && sectionSummary.trim().length > 0;
            const okSkills     = Array.isArray(sectionSkills)     && sectionSkills.length > 0;
            // Require ALL experience roles to be present.
            // Previously used `profile?.experience?.length` which is always undefined on
            // UserProfile (the field is `workExperience`), so minExpected was always 0 and
            // a truncated 3-role response for a 7-role profile would silently pass.
            // Now we require sectionExperience.length === profile.workExperience.length so
            // that any Workers AI token-limit truncation triggers the Groq fallback instead
            // of silently serving an incomplete CV.
            const minExpected  = (profile?.workExperience?.length ?? 0);
            const okExperience = Array.isArray(sectionExperience) && sectionExperience.length >= minExpected;
            const okEducation  = Array.isArray(sectionEducation);

            // ── STREAMING DRAFT ── Fire the callback immediately so the UI can
            // show sections appearing while the quality gate + polishing run in
            // the background. Raw data only — not yet polished.
            if (okSummary && okSkills && okExperience && okEducation && onSectionsDraft) {
                try {
                    onSectionsDraft({
                        summary:    sectionSummary,
                        skills:     Array.isArray(sectionSkills)    ? sectionSkills    : [],
                        experience: Array.isArray(sectionExperience) ? sectionExperience : [],
                        education:  Array.isArray(sectionEducation)  ? sectionEducation  : [],
                        projects:   Array.isArray(sectionProjects) && sectionProjects.length > 0 ? sectionProjects : undefined,
                    });
                } catch (cbErr) {
                    console.debug('[CV Gen] onSectionsDraft callback threw (non-fatal):', cbErr);
                }
            }

            if (okSummary && okSkills && okExperience && okEducation) {
                // ── Quality Gate — Stage 1 (score) + Stage 2 (repair) ────────────
                // Runs on the RAW Worker AI output before purifyCV / humanizer so
                // that structural violations (seeking opener, all-metric roles) get
                // a targeted LLM repair call (300–600 tokens) instead of requiring
                // the user to hit Regenerate. Graceful: if repair fails the raw
                // sections flow into the existing polish pipeline unchanged.
                let gatedSummary    = sectionSummary;
                let gatedExperience = sectionExperience;
                try {
                    const gateResult = await runQualityGate(sectionSummary, sectionExperience, {
                        repair: true,
                        jd: jd || undefined,
                        skills:   Array.isArray(sectionSkills)   ? sectionSkills   : undefined,
                        projects: Array.isArray(sectionProjects) ? sectionProjects : undefined,
                        profileFingerprint: profile?.personalInfo?.name
                            ? btoa(unescape(encodeURIComponent(`${profile.personalInfo.name}::${profile.personalInfo?.email ?? ''}`)))
                            : undefined,
                    });
                    if (gateResult.repairedSummary)    gatedSummary    = gateResult.repairedSummary;
                    if (gateResult.repairedExperience) gatedExperience = gateResult.repairedExperience;
                } catch (gateErr) {
                    console.debug('[CV Gen] Quality gate threw (non-fatal, using raw sections):', gateErr);
                }

                cvDataFromSections = {
                    summary:    gatedSummary,
                    skills:     sectionSkills,
                    experience: gatedExperience,
                    education:  sectionEducation,
                    projects:   Array.isArray(sectionProjects) && sectionProjects.length > 0 ? sectionProjects : undefined,
                };
                const modelLog = Object.entries(psResult.results)
                    .map(([k, v]) => `${k}=${v.task}${v.fellBack ? '*fb' : ''}/${v.ms}ms`)
                    .join(' ');
                console.info(`[CV Gen] Section-parallel completed in ${Date.now() - sectionsStart}ms (worker totalMs=${psResult.totalMs}ms): ${modelLog}`);
            } else {
                console.warn('[CV Gen] Section-parallel returned but some required sections failed to parse — falling back to legacy race path.', { okSummary, okSkills, okExperience, okEducation, errors: psResult.errors });
            }
        } else {
            console.warn('[CV Gen] Section-parallel endpoint unavailable — falling back to legacy race path.');
        }
    }

    if (cvDataFromSections) {
        cvData = cvDataFromSections;
    } else {
        // ── SINGLE-PROMPT GENERATION ─────────────────────────────────────────
        // Routes strictly through the user's selected provider — no automatic
        // cross-provider fallback.
        //
        // Workers AI: keeps a size-aware race path (Workers AI handles large
        //   prompts better than BYOK providers) plus a slim-profile retry on 413.
        // Claude / Gemini: groqChat routes directly to the selected provider.
        //   If it fails, the error is surfaced to the user — no silent switch.
        let rawText: string;
        const _selectedProvider = getSelectedProvider();

        if (_selectedProvider === 'workers-ai') {
            // Workers AI — size-aware routing: large prompts go to the race
            // endpoint directly to avoid a wasted Groq round-trip that 413s.
            const PROMPT_SIZE_GROQ_413_THRESHOLD = 70_000;
            const totalPromptSize = SYSTEM_INSTRUCTION_PROFESSIONAL.length + mainPromptInstruction.length;
            const willGroq413 = totalPromptSize > PROMPT_SIZE_GROQ_413_THRESHOLD;

            if (willGroq413) {
                console.warn(`[CV Gen] Prompt size ${totalPromptSize.toLocaleString()} chars > ${PROMPT_SIZE_GROQ_413_THRESHOLD.toLocaleString()} — routing directly to Cloudflare Workers AI race.`);
                const cf = await workerRaceLLM(CV_GEN_RACE_TASKS, mainPromptInstruction, {
                    system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                    temperature,
                    json: true,
                    maxTokens: 6000,
                    timeoutMs: 90000,
                });
                if (!cf) {
                    const slimPrompt = slimPromptProfile(mainPromptInstruction, profile);
                    console.warn(`[CV Gen] Workers AI unavailable — retrying with slimmed profile (${slimPrompt.length.toLocaleString()} chars).`);
                    rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimPrompt, { temperature, json: true, maxTokens: 6000 });
                } else {
                    rawText = cf.text;
                    console.info(`[CV Gen] Main generation completed via Workers AI race (winner=${cf.task}, model=${cf.model}, ${cf.raceMs}ms, pre-sized).`);
                }
            } else {
                try {
                    rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, { temperature, json: true, maxTokens: 6000 });
                } catch (workerErr: any) {
                    const status = workerErr?.status;
                    const msg = (workerErr?.message || '').toLowerCase();
                    const isTooLarge = status === 413 || msg.includes('too large') || msg.includes('too long');
                    const isRateLimited = status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
                    if (isTooLarge || isRateLimited) {
                        let fallbackText: string | undefined;
                        if (isTooLarge) {
                            const slimPrompt = slimPromptProfile(mainPromptInstruction, profile);
                            if (slimPrompt.length < mainPromptInstruction.length) {
                                try {
                                    console.warn(`[CV Gen] 413 — retrying with slimmed profile (${slimPrompt.length.toLocaleString()} chars vs ${mainPromptInstruction.length.toLocaleString()})…`);
                                    fallbackText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimPrompt, { temperature, json: true, maxTokens: 6000 });
                                    console.info('[CV Gen] Slim-profile retry succeeded.');
                                } catch { /* fall through to race */ }
                            }
                        }
                        if (!fallbackText) {
                            console.warn(`[CV Gen] Workers AI ${status ?? '?'} — falling back to race endpoint.`);
                            const cf = await workerRaceLLM(CV_GEN_RACE_TASKS, mainPromptInstruction, {
                                system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                                temperature,
                                json: true,
                                maxTokens: 6000,
                                timeoutMs: 90000,
                            });
                            if (!cf) {
                                console.error('[CV Gen] Workers AI race also unavailable — re-throwing original error.');
                                throw workerErr;
                            }
                            fallbackText = cf.text;
                            console.info(`[CV Gen] Main generation completed via Workers AI race fallback (winner=${cf.task}, model=${cf.model}, ${cf.raceMs}ms).`);
                        }
                        rawText = fallbackText;
                    } else {
                        throw workerErr;
                    }
                }
            }
        } else {
            // Claude or Gemini — route strictly through groqChat (which enforces
            // the selected provider). No Workers AI race, no cross-provider switch.
            // Pre-emptively slim when the prompt is over the proxy hard limit so the
            // CF edge never sees an oversized body (mirror of the Workers AI path above).
            const BYOK_PROXY_MAX_CHARS = 95_000; // slightly under PROXY_MAX_PROMPT_CHARS to account for JSON envelope
            const promptForByok = mainPromptInstruction.length > BYOK_PROXY_MAX_CHARS
                ? slimPromptProfile(mainPromptInstruction, profile)
                : mainPromptInstruction;
            if (promptForByok.length < mainPromptInstruction.length) {
                console.warn(`[CV Gen] Prompt (${mainPromptInstruction.length.toLocaleString()} chars) exceeds proxy limit — pre-slimmed to ${promptForByok.length.toLocaleString()} chars before sending.`);
            }
            try {
                rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, promptForByok, { temperature, json: true, maxTokens: 6000 });
            } catch (byokErr: any) {
                const status = byokErr?.status;
                const msg = (byokErr?.message || '').toLowerCase();
                const isTooLarge = status === 413 || msg.includes('too large') || msg.includes('too long') || msg.includes('request entity');
                if (isTooLarge) {
                    // Last resort — slim even further and retry once
                    const slimmedFurther = slimPromptProfile(promptForByok, profile);
                    if (slimmedFurther.length < promptForByok.length) {
                        console.warn(`[CV Gen] 413 on BYOK path — retrying with further-slimmed prompt (${slimmedFurther.length.toLocaleString()} chars).`);
                        rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimmedFurther, { temperature, json: true, maxTokens: 6000 });
                    } else {
                        throw byokErr;
                    }
                } else {
                    throw byokErr;
                }
            }
        }

        const cleanText = stripFencesMain(rawText);
        cvData = JSON.parse(cleanText);
    }

    // ── PART 6 — Groq Validator: runs for job AND general CVs ──────────────────
    // For job mode: uses JD + location for currency/market detection.
    // For general mode: uses profile location only (no JD available).
    // Academic mode is excluded — different quality criteria apply.
    if (purpose === 'job' || purpose === 'general') {
        try {
            // For general mode there is no JD — detect currency from profile location only
            const valCurrency = detectCurrency(
                purpose === 'job' ? jd : '',
                profile.personalInfo?.location || ''
            );
            const valSeniority = detectSeniority(profile.workExperience || []);
            const valMarket = detectMarket(valCurrency);
            const rawExperience = JSON.stringify((profile.workExperience || []).map(e => ({
                company: e.company,
                jobTitle: e.jobTitle,
                startDate: e.startDate,
                endDate: e.endDate,
            })));
            const hasSourceProjects = Array.isArray(profile.projects) && profile.projects.length > 0;
            // Snapshot pre-validator CV so we can revert any field that the
            // validator (especially the small CF Workers AI fallback) corrupts
            // while trying to "reduce" overshoot metrics — e.g. "KES 8,000,000"
            // → "KES ,000".
            const preValidatorCV: CVData = JSON.parse(JSON.stringify(cvData));
            cvData = await runGroqValidator(
                cvData, rawExperience, valCurrency, valSeniority, valMarket,
                scenario, hasSourceProjects
            );
            const validatorRevert = revertCorruptedMetrics(cvData, preValidatorCV);
            if (validatorRevert.reverted.length > 0) {
                console.warn(`[CV Validator] Reverted ${validatorRevert.reverted.length} corrupted-metric field(s):`, validatorRevert.reverted);
                cvData = validatorRevert.cv;
            }
        } catch (validatorError) {
            console.error('[CV Validator] Skipped due to error:', validatorError);
        }
    }

    // ── PART 7 — Shared Quality Polish ────────────────────────────────────────
    // Single call into the unified polish helper so Generate, Auto Optimize,
    // and JD Optimize all share the exact same chain. The helper runs:
    //   humanizer → bullet-count (profile.pointCount) → banned-phrase →
    //   carry profile.customSections + sectionOrder → sort →
    //   purify (with telemetry hook) → voice enforcement (engine brief) →
    //   finalize (source-fidelity vs profile) → pronoun fix.
    // Telemetry + worker leak-queue feed run inside the onPurifyReport hook.
    if (purpose === 'job' || purpose === 'general') {
        // Detect currency for the normalisation pass (cheap pure-regex, same
        // logic as the Groq validator above — re-detected here so valCurrency
        // scope stays inside its own try/catch block).
        const _polishCurrency = detectCurrency(
            purpose === 'job' ? jd : '',
            profile.personalInfo?.location || '',
        );
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: true,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief,
            finalize: { profile },
            reconciledSkills: _reconciledSkills,
            detectedCurrency: _polishCurrency,
            onPurifyReport: (report) => {
                // ── TELEMETRY — fire-and-forget. ──
                try {
                    const wordCount = JSON.stringify(cvData).split(/\s+/).length;
                    const briefStatus: 'present' | 'missing_empty' | 'missing_error' =
                        engineBrief
                            ? 'present'
                            : briefRes.status === 'rejected'
                                ? 'missing_error'
                                : 'missing_empty';
                    logGeneration({
                        cvHash: quickHash(JSON.stringify({
                            sum: cvData.summary,
                            exp: (cvData.experience || []).map(e => e.jobTitle + e.company).join('|'),
                        })),
                        model: 'groq+gemini',
                        promptVersion: 'v2.1',
                        generationMode,
                        briefPresent: Boolean(engineBrief),
                        briefStatus,
                        outputWordCount: wordCount,
                        roundNumberRatio:    report.roundNumberRatio,
                        repeatedPhraseCount: report.repeatedPhrases.length,
                        tenseIssueCount:     report.tenseIssues.length,
                        bulletsTenseFlipped: report.bulletsTenseFlipped,
                        metricsJittered:     report.metricsJittered,
                        substitutionsMade:
                            report.substitutionsMade +
                            report.polishFixes +
                            report.skillsCanonicalised +
                            report.skillsDeduped,
                        // Tag every leak with the AI engine that produced the
                        // raw text. The leaks-summary endpoint groups by this
                        // so we can spot a model that regresses (e.g. a CF
                        // Workers AI tier emitting full-width digits or an
                        // Together.ai model leaking `%` orphans). Falls back
                        // to 'Workers AI' which is the default chain entry.
                        leaks: (report.leaks || []).map(l => ({
                            ...l,
                            aiEngine: l.aiEngine || getLastAiEngine(),
                        })),
                    });
                } catch (e) {
                    console.debug('[CV Gen] telemetry post failed (non-fatal):', e);
                }

                // ── Phase I: feed the worker's leak queue (fire-and-forget). ──
                try {
                    const leakPhrases = Array.from(new Set(
                        (report.leaks || [])
                            .map(l => String(l.phrase || '').toLowerCase().trim())
                            .filter(p => p.length >= 3 && p.length <= 80)
                    ));
                    if (leakPhrases.length) {
                        const sample = (report.leaks?.[0]?.contextSnippet || '').slice(0, 500);
                        void reportLeaks(leakPhrases, sample).catch(() => {/* swallow */});
                    }
                } catch (e) {
                    console.debug('[CV Gen] leak-report post failed (non-fatal):', e);
                }

                // ── Forward to caller hook (e.g. CVGenerator quality panel). ──
                if (callerOnPurifyReport) {
                    try { callerOnPurifyReport(report); }
                    catch (e) { console.debug('[CV Gen] callerOnPurifyReport hook failed (non-fatal):', e); }
                }
            },
        });
    } else {
        // Non-job/general purposes (e.g. academic) — skip humanizer + voice
        // enforcement (those tune for professional-CV voice) but still run
        // the deterministic passes via the helper for consistency.
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: false,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief: null,
            finalize: { profile },
            reconciledSkills: _reconciledSkills,
            ...(callerOnPurifyReport ? { onPurifyReport: callerOnPurifyReport } : {}),
        });
    }

    // ── Store structural example in D1 (fire-and-forget, best-effort) ──────────
    // Only store for job/general purpose with full pipeline — not academic or
    // scholarship variants, which have unusual structural requirements.
    if (exampleFingerprint && (purpose === 'job' || purpose === 'general')) {
        storeCVExample(
            exampleFingerprint,
            primaryTitle,
            seniority,
            generationMode,
            purpose,
            cvData,
            _narrativeAngle,
            engineBrief?.voice?.primary?.name,
        );
        console.log(`[CV Examples] Stored structural blueprint (fingerprint=${exampleFingerprint.substring(0, 8)}… angle=${_narrativeAngle})`);
    }

    // ── Record angle used so next generation picks a different one ────────────
    if (purpose !== 'academic') recordAngleUsed(_narrativeAngle);
    console.log(`[CV Gen] Angle "${_narrativeAngle}" recorded — next run will prefer a different angle.`);

    // ── Validation Engine — hard structural rules, post-purification ──────────
    // Runs synchronously on the final CV before caching or returning.
    // Block violations with a repair strategy are auto-fixed (e.g. skills cap,
    // duplicate skills, seeking phrases). Warn violations are recorded in the
    // trace for telemetry but do not block the user.
    _traceBuilder.recordTimingMark('generationMs');
    const _targetBulletCount = engineBrief?.rhythm?.bullet_count as number | undefined;
    const _validation = runValidationEngine(cvData, {
        targetBulletCount: _targetBulletCount,
        certifications: _lockedValues.certifications, // S3: pass user-supplied certs for hallucination detection
    });
    if (_validation.repairApplied) {
        cvData = _validation.cv;
        console.log(`[CV Validation] ${_validation.violations.filter(v => v.repaired).length} block violation(s) auto-repaired.`);
    }
    if (_validation.violations.length > 0) {
        console.log(`[CV Validation] ${_validation.violations.length} violation(s): ${_validation.violations.map(v => v.ruleId).join(', ')}`);
    }
    _traceBuilder.recordTimingMark('validationMs');

    // ── Finalize + store trace ────────────────────────────────────────────────
    const _finalTrace = _traceBuilder.finalize(
        _validation.violations,
        _validation.repairApplied,
        _validation.passed,
    );
    storeTrace(_finalTrace);
    cvData = attachTrace(cvData, _finalTrace);
    console.log(`[CV Trace] Generation trace stored (id=${_finalTrace.traceId.slice(0, 8)}…, total=${_finalTrace.timings.totalMs}ms, violations=${_validation.violations.length})`);

    // ── Final CV guard: comprehensive last-mile quality gate ─────────────────
    // Layer 1 (deterministic): skill dedup, summary opener, seeking language,
    //   placeholders, double-words, project bullets, free-text fields.
    // Layer 2 (AI, GROQ_FAST, 5s timeout): grammar & coherence on summary +
    //   project descriptions. Graceful fallback — never blocks the CV return.
    const _guard = await runFinalCVGuard(cvData);
    if (_guard.changed) cvData = _guard.cvData;

    // ── Store result in cache ──
    cvCacheSet(cacheKey, cvData);

    return cvData;
};

// ─────────────────────────────────────────────────────────────────────────────
// Voice consistency enforcement — validates generated bullets against the
// brief and rewrites failing ones via a single targeted Groq call per role.
// ─────────────────────────────────────────────────────────────────────────────

// Verbs that are technically valid English but read as obviously off-key on a
// professional CV. The CV-engine seed contains them (Critiques→Critiqued,
// Bylines→Bylined, Synthesises→Synthesised, Mobilises→Mobilised, …). When the
// voice-rewriter receives them in the verb pool, it sometimes builds bullets
// like "Critiqued rigorous testing protocols" or "Bylined technical reports".
// Filter them out client-side so the rewriter can only choose tasteful options.
const OBSCURE_CV_VERBS = new Set([
    'critiqued', 'critique', 'critiques',
    'bylined', 'byline', 'bylines',
    'synthesised', 'synthesized', 'synthesises', 'synthesizes',
    'mobilised', 'mobilized', 'mobilises', 'mobilizes',
    're-emphasised', 're-emphasized', 're-emphasises', 're-emphasizes',
    'reemphasised', 'reemphasized',
    'enlisted', 'enlist', 'enlists',
    'galvanised', 'galvanized', 'galvanises', 'galvanizes',
    'rallied', 'rally', 'rallies',
    'op-edded', 'opedded',
    'ghost-wrote', 'ghostwrote',
    'box-plotted', 'boxplotted',
    'histogrammed',
    'wireframed', 'mocked',
    'composed', 'compose', 'composes',
    're-articulated', 'rearticulated', 're-articulates', 'rearticulates',
    'debriefed', 'debrief', 'debriefs',
    'taught',
]);

function filterTastefulVerbs(verbs: string[]): string[] {
    return verbs.filter(v => v && !OBSCURE_CV_VERBS.has(v.trim().toLowerCase()));
}

async function enforceVoiceConsistency(cvData: CVData, brief: CVBrief): Promise<void> {
    const roles = cvData.experience || [];
    // ── Priority 1: Verb pool — shuffle + take 16 for enforcement ────────────
    // Voice enforcement needs slightly more verbs than generation (16 vs 12)
    // because it fixes EXISTING bullets that already used some verbs, so we
    // need headroom for non-repeating replacements across multiple roles.
    // Still shuffled so the enforcement verb set differs from the generation set.
    const rawVerbs = shuffleArray(brief.verb_pool.slice(0, 40)).map(v => v.verb_past || v.verb);
    const tastefulVerbs = filterTastefulVerbs(rawVerbs).slice(0, 16);
    const verbList = tastefulVerbs.join(', ');
    const droppedVerbs = rawVerbs.filter(v => !tastefulVerbs.includes(v));
    if (droppedVerbs.length > 0) {
        console.log(`[CV Engine] Voice enforcement: filtered ${droppedVerbs.length} obscure verb(s) from pool:`, droppedVerbs);
    }
    // ── Priority 3: Rotate forbidden phrases — different 20 per enforcement run
    const forbidden = shuffleArray(brief.forbidden_phrases).slice(0, 20).join(', ');
    const avoidedVerbs = (brief.field?.avoided_verbs || []).join(', ') || 'none';
    const voice = brief.voice.primary;
    const rhythm = brief.rhythm;

    // ── Phase B speed: per-role validate+fix is now PARALLEL ──
    // Each role mutates a different `role.responsibilities` array, so there's
    // no shared state to race. Going from sequential to Promise.all turns
    // 3 roles × ~30 s each → ~30 s total instead of ~90 s.
    const processRole = async (role: typeof roles[number]): Promise<{ fixed: number; ran: boolean }> => {
        const bullets = role.responsibilities || [];
        if (bullets.length < 2) return { fixed: 0, ran: false };

        const result: ValidateVoiceResult | null = await validateVoice(bullets, brief);

        // ── Local repeated-word check (architecture doc Fix 5) ──
        const overused = findOverusedWords(bullets, 5);
        const overusedByBullet: Record<number, string[]> = {};
        for (const w of overused) {
            for (const idx of (w.bulletIndices || [])) {
                (overusedByBullet[idx] = overusedByBullet[idx] || []).push(
                    `replace overused word "${w.word}" (used ${w.count}× in this role) with a synonym or restructure the sentence to drop it`
                );
            }
        }
        const overusedFailing = Object.keys(overusedByBullet).map(n => Number(n));

        if ((!result || result.passed) && overusedFailing.length === 0) return { fixed: 0, ran: false };

        const remoteFailing = result?.failing_bullets || [];
        const failing = Array.from(new Set([...remoteFailing, ...overusedFailing])).sort((a, b) => a - b);
        if (failing.length === 0) return { fixed: 0, ran: false };

        const issuesByBullet: Record<number, string[]> = {};
        for (const issue of (result?.issues || [])) {
            if (issue.bullet === undefined) continue;
            const key = issue.bullet as number;
            const note =
                issue.issue === 'forbidden_phrase' ? `remove forbidden phrase "${(issue as any).phrase}"` :
                issue.issue === 'avoided_verb_for_field' ? `verb "${(issue as any).verb}" is wrong for this field — replace it` :
                issue.issue === 'verb_outside_pool' ? `verb "${(issue as any).verb}" is not in the approved pool — pick from the pool` :
                issue.issue === 'repeated_verb' ? `verb "${(issue as any).verb}" is repeated — pick a different approved verb` :
                // ── Priority 2: rhythm_drift is now advisory only ──────────
                // We switched to constraint-mode rhythm (≥1 punchy + ≥1 narrative,
                // no 3 same in a row) so individual bullet length mismatches against
                // the old fixed sequence are expected and valid. The purification
                // pipeline's bullet_band_imbalance check still catches gross
                // imbalance (all same length). Skip per-bullet rewrites here.
                issue.issue === 'rhythm_drift' ? null :
                issue.issue;
            // Skip null notes (rhythm_drift is advisory-only now)
            if (note !== null) {
                (issuesByBullet[key] = issuesByBullet[key] || []).push(note);
            }
        }
        for (const [idxStr, notes] of Object.entries(overusedByBullet)) {
            const idx = Number(idxStr);
            (issuesByBullet[idx] = issuesByBullet[idx] || []).push(...notes);
        }

        const fixList = failing.map(i => `  ${i + 1}. ORIGINAL: "${bullets[i]}"\n     FIX: ${(issuesByBullet[i] || ['general voice mismatch']).join('; ')}`).join('\n');

        const fixPrompt = `You are rewriting CV bullet points to match a strict voice brief. Return ONLY a JSON object: {"fixes": [{"index": <number>, "bullet": "<rewritten>"}]}.

ROLE: ${role.jobTitle} @ ${role.company}

VOICE BRIEF:
- Voice: ${voice?.name || 'neutral'} (${voice?.tone || ''}), verbosity ${voice?.verbosity_level ?? 3}/5, metric preference ${voice?.metric_preference || 'medium'}.
- Rhythm constraints: each role must have ≥1 punchy bullet (≤14 words) and ≥1 narrative bullet (≥25 words); avoid 3+ consecutive bullets of the same length class. The exact sequence is your choice — vary it.
- APPROVED VERB POOL (must start each fixed bullet with one of these, never repeating across the role): ${verbList}.
- FIELD-AVOIDED VERBS (never use): ${avoidedVerbs}.
- FORBIDDEN PHRASES (zero tolerance): ${forbidden}.

ALL BULLETS IN THIS ROLE (for context, do not duplicate other verbs):
${bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}

REWRITE THESE BULLETS (return them in the fixes array, indexed from 1):
${fixList}

Rules: keep the original meaning and any real metrics, fix the listed issues, do not add fabricated data, match the voice & rhythm targets, return only the listed indices.
- OPENER DIVERSITY (enforce while rewriting): if this role currently has ≥3 consecutive verb-led bullets or >70% verb-led bullets, vary at least 1 rewritten bullet to open with a non-verb frame — scope ("For N clients,…"), context ("As the [role],…"), collaboration ("With the [team/department],…"), timeframe ("Over the [period],…"), or a leading number ("N projects…"). Do NOT invent facts to do this — reshape the existing content.`;

        try {
            const voiceFixSystem = 'You are a precise CV editor that returns only valid JSON.';
            const stripFencesVoice = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            let raw: string | null = null;
            if (getSelectedProvider() === 'workers-ai') {
                try {
                    raw = await workerTieredLLM('voiceConsistency', fixPrompt, {
                        system: voiceFixSystem,
                        temperature: 0.4,
                        json: true,
                        maxTokens: 1200,
                        timeoutMs: 30000,
                    });
                    if (raw && import.meta.env.DEV) console.log(`[CV Engine] Voice fix via Workers AI — ${role.jobTitle}.`);
                } catch (cfErr) {
                    console.warn('[CV Engine] Workers AI voice fix failed, falling back to selected provider:', cfErr);
                }
            }
            if (!raw) raw = await groqChat(GROQ_FAST, voiceFixSystem, fixPrompt, { temperature: 0.4, json: true, maxTokens: 1200, task: 'voiceConsistency' });
            const parsed = JSON.parse(stripFencesVoice(raw ?? '{}'));
            const fixes: Array<{ index: number; bullet: string }> = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
            let fixed = 0;
            for (const f of fixes) {
                const idx = (f.index ?? 0) - 1;
                if (idx >= 0 && idx < bullets.length && typeof f.bullet === 'string' && f.bullet.trim()) {
                    bullets[idx] = f.bullet.trim();
                    fixed++;
                }
            }
            role.responsibilities = bullets;
            return { fixed, ran: true };
        } catch (e) {
            if (import.meta.env.DEV) console.warn(`[CV Engine] Voice fix failed for role ${role.jobTitle}:`, e);
            return { fixed: 0, ran: false };
        }
    };

    const t0 = performance.now();
    const results = await Promise.all(roles.map(processRole));
    const totalFixed = results.reduce((s, r) => s + r.fixed, 0);
    const totalRoles = results.filter(r => r.ran).length;
    const elapsed = Math.round(performance.now() - t0);

    if (totalFixed > 0) {
        console.log(`[CV Engine] Voice enforcement: rewrote ${totalFixed} bullet(s) across ${totalRoles} role(s) in ${elapsed} ms (parallel).`);
    }
}

// --- Multimodal: Extract text from PDF/image ---
// Routes strictly to the selected provider — no silent cross-provider fallback.
// Groq handles images via its vision model (llama-3.2-11b-vision-preview).
// PDFs + Groq: caller should use workerExtractDoc (text extraction) then generateProfile.
export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const prompt = "This file is a resume, CV, or professional profile. Extract ALL text content from it. Return only the raw, complete text, preserving original line breaks and structure as much as possible. DO NOT add any commentary, summaries, or markdown formatting.";

    const provider = getSelectedProvider();
    const claudeKey = getClaudeApiKey();
    const isImage = /^image\//i.test(mimeType);

    const viaClaude = async () => {
        const text = await claudeMultimodalCall(claudeKey!, base64Data, mimeType, prompt, { maxTokens: 4096 });
        if (!text || text.trim().length < 20) throw new Error('Claude returned an empty response. Please try again.');
        return text;
    };
    const viaGemini = async () => {
        const ai = getGeminiClient();
        const filePart = { inlineData: { data: base64Data, mimeType } };
        const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [filePart, { text: prompt }] },
            config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
        }));
        if (!response.text || response.text.trim().length < 20) throw new Error('Gemini returned an empty response. Please try again.');
        return response.text;
    };
    const viaGroq = async () => {
        const groqKey = getGroqApiKey();
        if (!groqKey) throw new Error('No Groq API key configured. Go to Settings → AI Keys to add your Groq API key.');
        if (!isImage) throw new Error('Groq vision only supports images. For PDFs, paste your CV text instead.');
        const { workerProxyMultimodal } = await import('./cvEngineClient');
        const text = await workerProxyMultimodal(groqKey, base64Data, mimeType, prompt, { maxTokens: 4096, provider: 'groq' });
        if (!text || text.trim().length < 20) throw new Error('Groq returned an empty response. Please try again.');
        return text;
    };
    const viaWorkersAi = async () => {
        if (!isImage) throw new Error('Workers AI does not support PDF extraction. Please paste your CV text, or add a Claude/Gemini key in Settings.');
        const text = await workerVisionExtract(base64Data, mimeType, prompt, { maxTokens: 4096 });
        if (!text || text.trim().length < 20) throw new Error('Workers AI could not extract text from this image. Please paste your CV text instead.');
        return text;
    };

    // Route strictly to the selected provider first.
    if (provider === 'groq') return viaGroq();
    if (provider === 'claude' && claudeKey) return viaClaude();
    if (provider === 'gemini') { try { return await viaGemini(); } catch (e) { if (!claudeKey) throw e; /* fall through to Claude below */ } }
    if (provider === 'workers-ai' && isImage) return viaWorkersAi();

    // Gemini failed + Claude available — use Claude as same-tier fallback.
    if (claudeKey) return viaClaude();
    try { return await viaGemini(); } catch (e) {
        if (isImage) return viaWorkersAi();
        throw new Error('This file needs a vision-capable key. Add a Claude, Gemini, or Groq key in Settings, or paste your CV text instead.');
    }
};

/**
 * Shared extraction rule #1 used by all three file-import prompts below.
 *
 * IMPORTANT: languages must be called out as going to the dedicated `languages`
 * field, not to customSections. The original single-sentence form lumped
 * "languages" in with the extras list, causing the model to map it to the
 * nearest CustomSectionType — which is 'memberships'.
 */
const EXTRACTION_RULE_LANGUAGES =
    '1. Extract work experience, education, skills, projects, and personal info.' +
    ' Languages go in the dedicated `languages` field — NEVER in customSections.' +
    ' Also extract any extras such as certifications, licences, awards, honours,' +
    ' publications, patents, volunteer work, memberships, presentations, courses,' +
    ' training, hobbies, and interests — map those extras to customSections.';

/**
 * Parse a UserProfile from a file (PDF/image).
 * Priority: Claude (multimodal, 200 K ctx) → Gemini 2.5 Flash.
 * Named "WithGemini" for backward-compat; Claude is now the primary path.
 */
export const generateProfileFromFileWithGemini = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
    ` : '';

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        ${githubInstruction}
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no preamble of any kind.

        ${USER_PROFILE_SCHEMA}
    `;

    // ── Gemini 2.5 Flash — selected provider is Gemini, use only Gemini ─────────
    const ai = getGeminiClient();
    const filePart = { inlineData: { data: base64Data, mimeType } };
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(response.text || ''));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Parse a UserProfile from a file (PDF/image) using Claude ONLY.
 * No fallback to any other provider.
 */
export const generateProfileFromFileClaude = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const claudeKey = getClaudeApiKey();
    if (!claudeKey) throw new Error('Claude API key is not set. Please add your Claude API key in Settings.');

    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
    ` : '';

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        ${githubInstruction}
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no "I'm ready" or any other preamble.

        ${USER_PROFILE_SCHEMA}
    `;

    const raw = await claudeMultimodalCall(claudeKey, base64Data, mimeType, prompt, { maxTokens: 8192, temperature: 0.1 });
    if (!raw || raw.trim().length < 20) throw new Error('Claude returned an empty response. Please try again.');

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(raw));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Parse a UserProfile from an image file using Groq vision ONLY.
 * Uses llama-3.2-11b-vision-preview routed through the CF Worker proxy.
 * For PDFs, use workerExtractDoc (text extraction) + generateProfile instead.
 */
export const generateProfileFromFileWithGroq = async (
    base64Data: string,
    mimeType: string,
): Promise<UserProfile> => {
    const groqKey = getGroqApiKey();
    if (!groqKey) throw new Error('Groq API key is not set. Please add your Groq API key in Settings.');
    if (!/^image\//i.test(mimeType)) throw new Error('Groq vision only supports image files. For PDFs, the text will be extracted automatically.');

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no preamble of any kind.

        ${USER_PROFILE_SCHEMA}
    `;

    const { workerProxyMultimodal } = await import('./cvEngineClient');
    const raw = await workerProxyMultimodal(groqKey, base64Data, mimeType, prompt, {
        maxTokens: 8192,
        temperature: 0.1,
        provider: 'groq',
        timeoutMs: 90_000,
    });
    if (!raw || raw.trim().length < 20) throw new Error('Groq returned an empty response. Please try again.');

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(raw));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Structure plain text into a UserProfile JSON.
 * Priority: Claude (200 K ctx, text-only) → Gemini 2.5 Flash.
 * Named "WithGemini" for backward-compat; Claude is now the primary path.
 */
export const generateProfileFromTextWithGemini = async (
    rawText: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. Analyse the public repositories, languages, and commit history to enrich the profile.
        - Populate 'projects' with the top 5 most impressive public repositories.
        - Add all key languages, frameworks, and tools to 'skills'.
        - Infer any missing personal details from the GitHub profile.
    ` : '';

    const prompt = `
        You are a professional CV data extractor. Your goal is to convert the following resume/career text into a complete structured JSON profile — extracting EVERY piece of information present.

        ### SOURCE TEXT
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}

        ${githubInstruction}

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. Current roles: endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item.
        6. Do NOT invent data not present in the text.
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    // ── Gemini 2.5 Flash (this function is the Gemini-specific text import path) ─
    const ai = getGeminiClient();
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(response.text || ''));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const prompt = "Analyze this image, which contains text (likely a job description). Extract ALL of the visible text. Return ONLY the raw text, with no additional commentary, summary, or formatting.";

    // ── Route strictly by selected provider — no cross-provider fallbacks ─────
    const provider = getSelectedProvider();

    if (provider === 'workers-ai') {
        const cf = await workerVisionExtract(base64Image, mimeType, prompt, { maxTokens: 2048 });
        if (!cf || cf.trim().length < 10) throw new Error('Workers AI could not extract text from this image. Please paste the job description text manually.');
        return cf;
    }

    if (provider === 'claude') {
        const claudeKey = getClaudeApiKey();
        if (!claudeKey) throw new Error('Claude API key is not set. Please add it in Settings.');
        const text = await claudeMultimodalCall(claudeKey, base64Image, mimeType, prompt, { maxTokens: 2048 });
        if (!text || text.trim().length < 10) throw new Error('Claude returned an empty response. Please paste the text manually.');
        return text;
    }

    // Gemini
    const ai = getGeminiClient();
    const imagePart = { inlineData: { data: base64Image, mimeType } };
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    if (!response.text || response.text.trim().length < 10) throw new Error('Gemini returned an empty response. Please paste the text manually.');
    return response.text;
};

export const generateCoverLetter = async (
    profileInput: UserProfile,
    jobDescription: string,
    onChunk?: (delta: string) => void,
): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const name = profile.personalInfo?.name || 'Applicant';

    // 3.5 — Cover letter brief injection.
    // Fire buildBrief in parallel with prompt construction (zero added latency on
    // a miss). If the worker is unreachable, briefResult stays null and we fall
    // back to the prompt-only path with no degradation.
    const briefPromise = buildBrief({
        jd: jobDescription,
        profile: profile as unknown,
        section: 'summary',
    }).catch(() => null);

    // Build the base prompt while the brief fetches concurrently.
    const [brief] = await Promise.all([briefPromise]);

    // Compose a voice block only when the brief resolved successfully.
    let voiceBriefBlock = '';
    if (brief?.voice?.primary) {
        const v = brief.voice.primary;
        const extraForbidden = (brief.forbidden_phrases || []).slice(0, 10).join(', ');
        voiceBriefBlock = `
### VOICE BRIEF (match this throughout the letter)
- Voice profile: ${v.name} — ${v.tone}
- Verbosity target: ${v.verbosity_level <= 2 ? 'terse and punchy' : v.verbosity_level >= 4 ? 'expansive and narrative' : 'balanced'} (level ${v.verbosity_level}/5)
- Metric preference: ${v.metric_preference}${extraForbidden ? `\n- Additional banned phrases (same list used for the CV): ${extraForbidden}` : ''}

This voice must be consistent with the candidate's CV — they should read like the same person wrote both documents.
`;
    }

    const prompt = `
You are a professional ghostwriter who writes winning cover letters for competitive roles. Your output is always polished, specific, and human — never generic or AI-sounding.

### APPLICANT
Name: ${name}
${voiceBriefBlock}
### PROFILE (for content and achievements only)
${compactProfile(profile)}

### JOB DESCRIPTION
${jobDescription || 'General application — highlight the strongest transferable skills and most recent impactful achievement.'}

### MANDATORY OUTPUT RULES — EVERY RULE IS NON-NEGOTIABLE

1. **WORD COUNT**: Write EXACTLY 200–240 words for the ENTIRE letter body (from salutation to the applicant's name on the last line). Count every word carefully. This must fit on one A4 page — precision matters.

2. **NO LETTERHEAD OR HEADERS**: Do NOT include name, address, date, or contact info. The template handles this. Start DIRECTLY with the salutation.

3. **SALUTATION**: "Dear Hiring Manager," — use a specific name only if clearly stated in the JD.

4. **FOUR TIGHT PARAGRAPHS**:
   - **Opening** (~45 words): Lead with a bold hook — a specific result, a scoped claim, or a compelling value statement. Name the role and company. DO NOT open with "I", "I am writing", or any cliché.
   - **Body 1** (~55 words): One specific achievement with a concrete metric (number, %, $ amount, team size, or measurable outcome) that directly addresses a top JD requirement.
   - **Body 2** (~55 words): A second accomplishment or skill that demonstrates cultural or technical fit. Weave in JD keywords naturally — no forced stuffing.
   - **Closing** (~45 words): One sentence restating fit, then a clear CTA: "I would welcome the opportunity to discuss how I can contribute to [Company/Team]." Never use "I look forward to hearing from you" as a standalone closer.

5. **SIGN-OFF**: End with exactly:
   Sincerely,
   ${name}

6. **BANNED — NEVER USE ANY OF THESE**:
   "I am writing to apply", "I am passionate about", "excited to leverage", "team player", "self-starter", "results-driven", "detail-oriented", "dynamic professional", "proven track record", "fast learner", "go-getter", "synergize", "utilize", "delve", "please find attached", "to whom it may concern", "I look forward to hearing from you" (as a standalone sentence)

7. **TONE**: Confident, direct, human. Vary sentence length. Maximum one "I" per sentence. No filler words. No sycophancy.

8. **METRIC REQUIREMENT**: The letter MUST contain at least one specific number, percentage, dollar figure, or concrete measurable outcome in the body paragraphs.

9. **RETURN FORMAT**: Plain text ONLY. No markdown, no bold, no bullet points, no headers, no commentary. Start with "Dear Hiring Manager," and end with the applicant's name.
    `;

    let letter: string | null = null;
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('coverLetter', prompt, {
                system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                temperature: 0.65,
                maxTokens: 1200,
            });
            if (cf && cf.trim()) letter = cf;
        } catch (cfErr) {
            console.warn('[generateCoverLetter] Worker call failed, falling back to selected provider:', cfErr);
        }
    }
    if (!letter) {
        letter = onChunk
            ? await groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, onChunk, { temperature: 0.65, maxTokens: 1200 })
            : await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.65, maxTokens: 1200 });
    }
    return purifyText(letter);
};

/**
 * Token-efficient targeted CV optimizer.
 * Rewrites only summary + skills + experience bullets to fill identified JD gaps.
 * ~60% fewer tokens than a full CV regeneration.
 */
export const optimizeCVForJob = async (
    cvInput: CVData,
    jd: string,
    gaps: Array<{ requirement: string; isBlocker: boolean }>,
    missingKeywords: string[]
): Promise<Partial<CVData>> => {
    // ── HOT FIRE (inbound) ── purge banned phrases from the source CV before
    // it's serialized into the prompt, so the optimizer rewrites from clean
    // anchors instead of pattern-matching the original buzzwords.
    const cv = purifyInboundCV(cvInput);
    const jdCapped = jd.substring(0, 2500);
    const gapList = gaps.map(g => `- ${g.isBlocker ? '[BLOCKER] ' : ''}${g.requirement}`).join('\n');
    const keywordList = missingKeywords.join(', ');

    const currentSummary = cv.summary || '';
    const currentSkills = (cv.skills || []).join(', ');
    const currentExperience = (cv.experience || []).map(e =>
        `### ${e.jobTitle} @ ${e.company}\n${(e.responsibilities || []).join('\n')}`
    ).join('\n\n');

    const prompt = `
You are an expert CV optimizer. The candidate's CV has been analyzed against the job description and has identified GAPS and MISSING KEYWORDS. Your job is to perform a TARGETED rewrite of ONLY the affected sections — do NOT change names, companies, dates, or invent new experiences.

JOB DESCRIPTION:
${jdCapped}

IDENTIFIED GAPS:
${gapList || 'None identified.'}

MISSING KEYWORDS TO WEAVE IN NATURALLY:
${keywordList || 'None identified.'}

CURRENT CV SECTIONS TO REWRITE:

SUMMARY:
${currentSummary}

SKILLS (current):
${currentSkills}

EXPERIENCE BULLETS (current):
${currentExperience}

STRICT RULES:
1. Rewrite the summary to incorporate the 3 most critical missing keywords naturally. Keep it 55–75 words.
2. Update the skills list: add missing keywords that are genuine skills. Keep total at ≤18 skills. Put JD-matching skills first.
3. Rewrite experience bullets to naturally include missing keywords where plausible. DO NOT change job titles, company names, or invent new experiences. Just reframe existing bullets using JD language.
4. Every rewritten bullet must still have a strong action verb. Metrics are encouraged but only on ~50–60% of bullets — never force a number that isn't supported by the original.
5. Preserve the exact number of bullets per role.
6. Return ONLY a JSON object with keys: "summary" (string), "skills" (string[]), "experience" (array of {jobTitle, company, responsibilities: string[]}).

${HUMANIZATION_CHECKLIST}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5, json: true, maxTokens: 2500 });
    const _stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(_stripped);

    // Merge back into full experience array preserving dates etc.
    const updatedExperience = (cv.experience || []).map(exp => {
        const updated = (result.experience || []).find((e: any) =>
            e.jobTitle === exp.jobTitle && e.company === exp.company
        );
        if (updated && Array.isArray(updated.responsibilities)) {
            return { ...exp, responsibilities: updated.responsibilities };
        }
        return exp;
    });

    // ── PIN tier-1 keywords ── ensure the top-3 missing keywords actually
    // landed somewhere in the rewritten output. If not, append them to skills
    // (deterministic safety net so optimize never silently drops a JD-critical
    // term during paraphrase).
    const tier1 = (missingKeywords || []).slice(0, 3);
    let finalSkills: string[] = Array.isArray(result.skills) ? [...result.skills] : [...(cv.skills || [])];
    const finalSummary: string = result.summary || cv.summary || '';
    const allText = (finalSummary + ' ' + finalSkills.join(' ') + ' ' +
        updatedExperience.map(e => (e.responsibilities || []).join(' ')).join(' ')).toLowerCase();
    for (const kw of tier1) {
        if (!kw) continue;
        if (!allText.includes(kw.toLowerCase()) &&
            !finalSkills.some(s => s.toLowerCase() === kw.toLowerCase())) {
            finalSkills.push(kw);
        }
    }

    // ── HOT FIRE ── run the same polish chain Generate uses (humanizer +
    // bullet-count + banned-phrase filter + purify + pronoun fix) so a JD
    // optimization is at parity with a fresh Generate.
    const merged: CVData = {
        ...cv,
        summary: finalSummary,
        skills: finalSkills,
        experience: updatedExperience,
    };
    const finalized = await runQualityPolishPasses(merged, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvInput },
        finalize: { sourceCv: cvInput },
    });

    // ── Final guard (partial) — skill dedup + summary opener on optimized output ─
    const _guardedSummary = purgeSummarySeekingLanguage(fixSummaryOpener(finalized.summary || ''));
    const _guardedSkills  = deduplicateSkills(finalized.skills || []);

    return {
        summary:    _guardedSummary,
        skills:     _guardedSkills,
        experience: finalized.experience,
    };
};

/**
 * Generates tailored interview Q&A pairs from the CV + JD.
 * Uses GROQ_FAST for token efficiency (≈60% cheaper than GROQ_LARGE).
 */
export const generateInterviewQA = async (
    profile: UserProfile,
    jd: string,
    companyName?: string,
    count: number = 10
): Promise<Array<{ question: string; answer: string; category: string }>> => {
    const jdCapped = jd.substring(0, 2000);
    const company = companyName || 'the company';
    const n = Math.max(5, Math.min(20, count));
    // Distribute categories proportionally
    const behav = Math.max(1, Math.round(n * 0.2));
    const tech   = Math.max(1, Math.round(n * 0.2));
    const sit    = Math.max(1, Math.round(n * 0.2));
    const cult   = Math.max(1, Math.round(n * 0.2));
    const str    = n - behav - tech - sit - cult;
    const prompt = `
You are an expert interview coach preparing a candidate for a specific job interview.

CANDIDATE PROFILE (compact):
${compactProfile(profile)}

JOB DESCRIPTION:
${jdCapped}

TARGET COMPANY: ${company}

Generate exactly ${n} tailored interview questions with model answers. Questions must be specific to this role and company — NOT generic. Mix these categories:
- ${behav} Behavioural (STAR format — "Tell me about a time when...")
- ${tech} Technical / Role-specific (test core skills from JD)
- ${sit} Situational (hypothetical scenarios from the JD)
- ${cult} Culture / Motivation (why this company, role, why now)
- ${str} Strength / Weakness probes (digging into the CV)

For each question, write a TAILORED model answer based on the candidate's ACTUAL experience. Reference real companies, skills, and achievements from their profile. Model answers should be 3–5 sentences.

Return ONLY a JSON array of ${n} objects:
[{ "question": "string", "answer": "string", "category": "Behavioural|Technical|Situational|Culture|Strength" }]
`;
    const tokens = Math.min(4000, n * 350);
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { task: 'coaching', temperature: 0.6, json: true, maxTokens: tokens });
    return JSON.parse(text.trim());
};

// ─── D1 JD analysis cache ─────────────────────────────────────────────────────

const _JD_CACHE_ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
const _JD_CACHE_TIMEOUT_MS = 3500;

/**
 * Collision-resistant SHA-256 hash for D1 cache keys.
 * Returns the first 16 hex chars of the digest — 64-bit key space, negligible
 * collision risk vs the 32-bit djb2 quickHash previously used here.
 * Falls back to quickHash if SubtleCrypto is unavailable (SSR / very old browsers).
 */
async function sha256CacheKey(input: string): Promise<string> {
    try {
        const encoded = new TextEncoder().encode(input);
        const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
        const hex = Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return hex.slice(0, 16);
    } catch {
        return quickHash(input);
    }
}

/** Check D1 cache for a prior JD analysis result. Returns null on miss or any error. */
async function checkJdAnalysisCache(jdHash: string): Promise<JobAnalysisResult | null> {
    if (!_JD_CACHE_ENGINE_URL) return null;
    try {
        const res = await fetch(
            `${_JD_CACHE_ENGINE_URL}/api/cv/jd-analysis?key=${encodeURIComponent(jdHash)}`,
            { signal: AbortSignal.timeout(_JD_CACHE_TIMEOUT_MS) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { found?: boolean; result?: JobAnalysisResult };
        if (!data.found || !data.result) return null;
        console.log('[JD Analysis Cache] Hit — skipping AI call');
        return data.result;
    } catch {
        return null;
    }
}

/** Store a JD analysis result in D1 — fire-and-forget, never blocks generation. */
function storeJdAnalysisCache(jdHash: string, result: JobAnalysisResult): void {
    if (!_JD_CACHE_ENGINE_URL) return;
    fetch(`${_JD_CACHE_ENGINE_URL}/api/cv/jd-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: jdHash, result_json: JSON.stringify(result) }),
        signal: AbortSignal.timeout(5000),
    }).catch(() => {});
}

// ── HR-compliant application email generator ────────────────────────────────
// Rules based on recruiter research:
// • 150-200 word body — recruiters spend ~7 seconds scanning
// • Never open with "I am writing to apply" or any cliché
// • One concrete metric / achievement in the body
// • Reference the specific role and company
// • Clear CTA in the closing line
// • No banned phrases (same list as cover letter)
// Curated tone presets for the email composer.
// Each maps a user-facing label to a tone instruction injected into the prompt.
export const EMAIL_TONE_PRESETS = [
    {
        id:    'confident',
        label: 'Confident',
        icon:  '⚡',
        desc:  'Direct, bold, results-focused — mirrors a startup / delivery voice',
        instruction: 'Write with lean, direct energy. Lead with impact. Short declarative sentences. Bias towards action verbs. Confident without arrogance.',
    },
    {
        id:    'professional',
        label: 'Professional',
        icon:  '🎯',
        desc:  'Measured, formal and precise — suited to finance, consulting, corporate',
        instruction: 'Write with measured formality. Precise language, no contractions. Senior but not stiff. Every claim anchored to an outcome.',
    },
    {
        id:    'warm',
        label: 'Warm',
        icon:  '🤝',
        desc:  'Personable and collaborative — good for people-facing or creative roles',
        instruction: 'Write with warmth and authenticity. Slightly conversational but still polished. Show genuine interest in the team and mission. Human, not robotic.',
    },
    {
        id:    'executive',
        label: 'Executive',
        icon:  '🏛️',
        desc:  'Strategic, board-facing — for senior / leadership applications',
        instruction: 'Write at board-deck level. Strategic framing, not task-listing. Speak to vision and organisational impact. Authoritative and concise.',
    },
] as const;
export type EmailToneId = typeof EMAIL_TONE_PRESETS[number]['id'];

export const generateApplicationEmail = async (
    profileInput: UserProfile,
    jobTitle: string,
    companyName: string,
    keywords: string[],
    jobDescription: string,
    toneId: EmailToneId = 'confident',
    workerVoiceTone?: string,             // auto-detected tone string from /api/cv/brief
    onChunk?: (delta: string) => void,    // optional streaming callback
): Promise<{ subject: string; body: string }> => {
    const profile = purifyProfile(profileInput);
    const name     = profile.personalInfo?.name  || 'Applicant';
    const email    = profile.personalInfo?.email || '';
    const phone    = profile.personalInfo?.phone || '';

    const topSkills  = (profile.skills || []).slice(0, 5).join(', ');
    const topKeywords = keywords.slice(0, 6).join(', ');
    const recentRole  = profile.workExperience?.[0]
        ? `${profile.workExperience[0].jobTitle} at ${profile.workExperience[0].company}`
        : '';
    const achievements = (profile.workExperience || [])
        .flatMap(e => (e.responsibilities || []).slice(0, 2))
        .slice(0, 4)
        .join(' | ');

    const roleRef    = jobTitle  || 'the advertised position';
    const companyRef = companyName && companyName !== 'Unknown' ? companyName : 'your organisation';

    // Tone instruction — worker voice takes precedence if detected, else use preset
    const preset = EMAIL_TONE_PRESETS.find(t => t.id === toneId) ?? EMAIL_TONE_PRESETS[0];
    const toneInstruction = workerVoiceTone
        ? `TONE (auto-detected from job description — worker voice: "${workerVoiceTone}"): ${preset.instruction}`
        : `TONE: ${preset.instruction}`;

    const prompt = `You are a career coach writing a SHORT, HIGH-IMPACT job application email for ${name}.

ROLE: ${roleRef} at ${companyRef}
APPLICANT BACKGROUND: ${recentRole || topSkills}
KEY ACHIEVEMENTS (use ONE with a metric): ${achievements || 'Strong delivery track record'}
TOP JD KEYWORDS (weave in naturally): ${topKeywords}
SIGN-OFF NAME: ${name}${email ? `\n${email}` : ''}${phone ? `\n${phone}` : ''}
${toneInstruction}

MANDATORY RULES — every rule is non-negotiable:
1. SUBJECT LINE: Return it on the very first line as exactly: Subject: <text>
2. Leave one blank line, then write the email body.
3. Body MUST be 150-200 words (salutation to sign-off name). Count carefully.
4. Open with "Dear Hiring Manager," (or specific name if in JD).
5. NEVER open the first paragraph with "I". Lead with a bold 1-sentence value claim or hook.
6. THREE short paragraphs:
   - Para 1 (~40 words): Value hook + role + company name.
   - Para 2 (~80 words): One specific achievement with a real metric, then bridge to 2 JD keywords.
   - Para 3 (~40 words): "Please find my CV attached." + a confident single-sentence CTA for a call/meeting.
7. Sign off: "Best regards," then the applicant's name and contact info on separate lines.
8. BANNED PHRASES — never use: "I am writing to apply", "I am writing to express", "please find attached my resume", "I look forward to hearing from you" (standalone), "passionate about", "proven track record", "team player", "self-starter", "detail-oriented", "excited to leverage", "results-driven", "synergize", "utilize".
9. Honour the TONE instruction above — it shapes sentence length, formality, and vocabulary.
10. Return ONLY the subject line + blank line + email body. No commentary.`;

    const raw = onChunk
        ? await groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, onChunk, { temperature: 0.6, maxTokens: 600 })
        : await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.6, maxTokens: 600 });
    const text = purifyText(raw);

    // Parse subject from first line
    const lines   = text.split('\n');
    const subjectLine = lines.find(l => /^subject:/i.test(l.trim()));
    const subject = subjectLine
        ? subjectLine.replace(/^subject:\s*/i, '').trim()
        : `Application for ${roleRef} at ${companyRef} — ${name}`;
    const bodyStart = subjectLine ? lines.indexOf(subjectLine) + 1 : 0;
    const body = lines.slice(bodyStart).join('\n').trimStart();

    return { subject, body };
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    // Check D1 cache first — same JD text always produces the same result so
    // we can skip the AI call entirely on repeated generations.
    // SHA-256 (first 16 hex chars) is used instead of quickHash (djb2 32-bit)
    // to eliminate collision risk — two different JDs mapping to the same key
    // would return a cached analysis for the wrong job.
    const jdSnippet = jobDescription.substring(0, 1500);
    const jdHash = await sha256CacheKey(jdSnippet.replace(/\s+/g, ' ').trim());
    const cached = await checkJdAnalysisCache(jdHash);
    if (cached) return cached;

    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 1500)}

        Return ONLY a JSON object with this structure:
        {
          "keywords": ["string"],
          "skills": ["string"],
          "companyName": "string",
          "jobTitle": "string"
        }
    `;

    const stripFencesJd = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // Route through the selected provider only — no internal fallback.
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 512 });
    const result = JSON.parse(stripFencesJd(text));
    storeJdAnalysisCache(jdHash, result);
    return result;
};

export const generateEnhancedSummary = async (profileInput: UserProfile): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      **BANNED PHRASES — never use any of these:** ${banned}
      Write in confident, direct third-person. No first-person pronouns. No clichés.
      Return only the summary text.
      USER PROFILE:
      ${compactProfile(profile)}
    `;
    const summary = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    const purified = purifyText(summary);
    // Final guard: strip any generic opener the AI snuck in despite instructions
    return purgeSummarySeekingLanguage(fixSummaryOpener(purified));
};

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string, pointCount: number = 5): Promise<string> => {
    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
      You are an expert resume writer and career coach specializing in creating HIGH-IMPACT, ATS-OPTIMIZED bullet points.
      
      **Goal:** Transform the user's responsibilities into strong, credible achievement bullets grounded in the draft provided. Keep all real numbers, dates, and specifics exactly as given.

      **Input Context:**
      - **Role:** ${jobTitle} at ${company}
      - **Duration/Tenure:** ${duration || "Not specified"}
      - **Target Job Description (JD):** ${jobDescription ? jobDescription.substring(0, 500) + '...' : "None provided"}
      - **Current Draft:** "${currentResponsibilities}"
      - **REQUIRED BULLET COUNT: EXACTLY ${pointCount} bullet points** — no more, no fewer.

      **Instructions:**
      1. **Reframe from the draft:** Use only facts, numbers, and scope present in the draft. Do NOT invent metrics, percentages, team sizes, or figures not in the draft.
      2. **Tailor to JD:** If a JD is provided, weave in relevant keywords naturally — never force them.
      3. **Metrics:** Surface any numbers already in the draft prominently. If no numbers are present, describe observable scope (e.g. "across 3 regions", "for 200-seat deployment") without inventing figures.
      4. **Action Verbs:** Start each bullet with a strong past-tense verb. Good examples: Led, Built, Delivered, Improved, Deployed, Designed, Managed, Reduced, Launched, Negotiated.
      5. **STRICT COUNT:** Output EXACTLY ${pointCount} bullet points.
      6. **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.

      **BANNED PHRASES — never use any of these:** ${banned}
      Never use approximation markers like "~", "approx.", or "roughly X%".
    `;
    const result = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, maxTokens: 900 });
    return purifyText(result.trim().replace(/^- /gm, '• '));
};

export const generateQuantifiedAchievements = async (
    responsibilities: string,
    jobTitle: string,
    company: string,
): Promise<Array<{ original: string; quantified: string; hasMetric: boolean }>> => {
    const bullets = responsibilities
        .split('\n')
        .map(l => l.replace(/^[\u2022\-\*]|\d+\.\s*/, '').trim())
        .filter(b => b.length > 4);

    if (bullets.length === 0) throw new Error('No bullet points found. Add some responsibilities first.');

    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
You are a career coach who specialises in surfacing impact from resume bullet points.

For each bullet point from a ${jobTitle} at ${company}, do the following:
- Determine if it already contains a quantifiable metric (%, a number, $, timeframe, team size, etc.).
- If it already HAS a clear metric, return it unchanged and mark hasMetric as true.
- If it does NOT have a metric, reframe it to surface observable scope or output using ONLY language and context already in the bullet — e.g. "across 3 sites", "for the flagship product line". Do NOT invent or estimate any figure, percentage, or count.
- Keep rewrites under 25 words. Preserve the original action verb.
- Do not add commentary. Do not change facts. Never use "~", "approx.", or hedged estimates like "approximately 30%".
- BANNED PHRASES — never use any of these: ${banned}

Bullet points to analyse:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  { "original": "exact original text", "quantified": "improved version", "hasMetric": false }
]
`;
    const raw = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.55 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse AI response. Please try again.');

    const parsed = JSON.parse(match[0]) as Array<{ original: string; quantified: string; hasMetric: boolean }>;

    // Ensure count matches input + purify each rewrite
    const out = bullets.map((b, i) => {
        const item = parsed[i] ?? { original: b, quantified: b, hasMetric: true };
        return { ...item, quantified: purifyText(item.quantified || b) };
    });
    return out;
};

export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const prompt = `
      You are a tech portfolio expert. Rewrite and enhance the provided project description into a single, concise, professional paragraph for a technical resume.

      **Instructions:**
      1. **Strict Adherence:** Describe ONLY the project provided. Do not invent features or technologies not implied by the description.
      2. **Structure:** Clearly state the project's purpose, the core technologies used, and the key features/outcomes.
      3. **Specificity:** Mention specific frameworks, languages, or tools.
      4. **Highlight Impact:** Briefly explain the problem solved or the project's main achievement.
      5. **Format:** Return ONLY a single, professional paragraph.

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"
    `;
    const desc = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    return purifyText(desc);
};

// ─── Scholarship intelligence ──────────────────────────────────────────────────

/** Per-essay-type section blueprints — injected verbatim into the prompt */
const ESSAY_STRUCTURES: Record<string, string> = {
    'personal-statement': `1. Opening Hook — a specific vivid moment or experience that defines who you are (NEVER open with "I have always been passionate about…" or any variant)
2. Academic & Professional Journey — concrete achievements, roles, and what you learned from them
3. Connection to This Scholarship — precise alignment between YOUR goals and THIS scholarship's mission and values (use details from the description)
4. Future Vision & Impact — what you will do with the funding/knowledge, with measurable specificity
5. Conclusion — forward-looking close that reinforces your fit without repeating what was already said`,

    'research-proposal': `1. Research Question — state the problem clearly and explain why it is urgent and unresolved now
2. Literature Gap — what is unknown or under-studied; why existing work is insufficient
3. Methodology — specific research design, data sources, analytical approach, and why this method is appropriate
4. Expected Contribution — what new knowledge this produces and who specifically benefits from it
5. Timeline — phased plan with realistic milestones (Phase 1 / Phase 2 / Phase 3 with approximate durations)
6. Broader Impact — societal, policy, or field-level implications beyond the immediate findings`,

    'statement-of-purpose': `1. Academic Background — relevant degrees, thesis/dissertation topic, and key research or professional experience
2. Specific Research or Professional Interests — precise intellectual questions driving you and why they matter
3. Why This Program — specific faculty members, labs, courses, or research groups by name and why they fit your work exactly
4. Career Goals — concrete next steps after the program and longer-term professional trajectory
5. Fit & Contribution — what you bring to the cohort and how your presence will benefit the institution`,

    'leadership-essay': `1. Situation — set the scene with a SPECIFIC challenge or opportunity (name the organisation, the stakes, the gap — no generic setups)
2. Your Initiative — what YOU personally decided and did — use "I", not "we"; show you initiated, not just participated
3. Actions Taken — concrete steps, decisions, and how you mobilised or influenced others
4. Measurable Outcomes — numbers, scale, recognition, or demonstrable lasting change
5. Reflection & Growth — what this taught you about leadership and how it shapes your approach today`,

    'diversity-inclusion': `1. Personal Context — your background, identity, or defining experience (be specific and authentic, not abstract or generic)
2. Challenges & How They Shaped You — honest, vulnerable account of obstacles; specificity is strength here
3. Unique Perspective — what you see or understand that others might miss, and why it matters in your field
4. Action & Advocacy — concrete things you have actually done to advance equity, inclusion, or belonging
5. Forward Commitment — specific ways you will continue and deepen this work during and after the program`,

    'why-scholarship': `1. Deep Knowledge of This Scholarship — demonstrate you understand its history, mission, and alumni impact (no generic flattery)
2. Specific Alignment — precise links between the scholarship's stated values and YOUR specific goals and experiences
3. Why Now, Why This — why this scholarship at this exact point in your career or study path
4. What You Will Contribute — to the cohort, the alumni network, and the scholarship's broader mission
5. Commitment — concrete evidence you are serious about what this scholarship stands for, beyond the financial support`,

    'academic-cover-letter': `1. Professional Introduction — who you are, current position or institution, and what you are applying for (named specifically)
2. Top Qualifications — your 3 most relevant credentials matched directly to the stated selection criteria
3. Specific Interest — why this opportunity, institution, or programme — reference real details from the description
4. Criteria Alignment — address each key selection criterion briefly but directly (one sentence per criterion)
5. Professional Close — confident call to action with contact information`,
};

/** Named scholarship intelligence packs — injected when detected in description */
const SCHOLARSHIP_VALUE_PACKS: Record<string, { label: string; values: string[]; rules: string[]; tone: string }> = {
    chevening: {
        label: 'Chevening',
        values: ['demonstrated leadership that influenced and changed others', 'concrete plan to build a lasting UK network', 'clear commitment to returning home and applying UK-gained skills', 'specific post-study career plan in home country'],
        rules: [
            'Leadership must show influence over others — not just personal achievement or participation',
            'Explicitly address what UK connections you will build and why they are essential for your goals at home',
            'The return-home commitment must be explicit, credible, and tied to a specific career goal',
            'Chevening writes four separate essays — each must stand completely alone with NO repeated anecdotes across them',
        ],
        tone: 'Confident, leadership-focused, UK-specific — strong on return-home narrative',
    },
    commonwealth: {
        label: 'Commonwealth',
        values: ['development impact in home country or region', 'commitment to returning home after study', 'community and societal benefit over personal career gain', 'contribution to sustainable development goals'],
        rules: [
            'Return-of-service is the central value — Commonwealth funds people to bring knowledge home, not to emigrate',
            'Connect the study plan to a specific, named development challenge or community need in your country',
            'Emphasise collective benefit and grassroots impact; individual ambition is secondary to community impact',
        ],
        tone: 'Service-oriented, development-focused, humble and community-centred',
    },
    fulbright: {
        label: 'Fulbright',
        values: ['US-host country cultural exchange and mutual understanding', 'project-based research or study with clear deliverables', 'role as a cultural ambassador between your country and the US'],
        rules: [
            'Cultural diplomacy matters as much as academic excellence — the essay must show you as an ambassador',
            'Explain specifically how you will share your home country\'s perspective in the US, and what knowledge you will bring back',
            'Centre a concrete, specific project or research question — Fulbright funds doers with clear plans and outputs',
        ],
        tone: 'Intellectually curious, culturally aware, diplomatically minded and project-driven',
    },
    'gates cambridge': {
        label: 'Gates Cambridge',
        values: ['outstanding intellectual ability and research potential', 'leadership that has demonstrably improved the lives of others', 'commitment to improving lives at Cambridge and beyond', 'specific fit with Cambridge\'s research environment'],
        rules: [
            'Intellect AND character are weighted equally — both must be present and concrete',
            'Must reference Cambridge specifically — a named faculty member, lab, centre, or research group',
            'The "improving lives" element must be concrete and specific — name what you did, for whom, and the measurable impact',
        ],
        tone: 'Academically rigorous, intellectually confident, socially committed and appropriately humble',
    },
    rhodes: {
        label: 'Rhodes',
        values: ['academic excellence at the highest level', 'truth, courage, and devotion to duty as demonstrated through actions', 'sustained leadership over time', 'genuine and ongoing commitment to service to the world'],
        rules: [
            'Academic achievement alone will not win Rhodes — character and service are weighted equally',
            'Let achievements speak through what you did, not how exceptional you are — avoid self-promotion',
            'Service must be genuine, sustained, and ongoing — not a one-off project or headline achievement',
            'Oxford must be genuinely essential to your specific research or leadership development — explain exactly why',
        ],
        tone: 'Understated, principled, service-first — achievements speak without boasting',
    },
    daad: {
        label: 'DAAD',
        values: ['academic merit and research excellence', 'specific institutional connection to Germany', 'structured and realistic study or research plan', 'contribution to international academic exchange'],
        rules: [
            'A concrete study plan with a specific named supervisor, German institute, or particular courses is essential',
            'Justify why Germany and this specific institution — generic praise of German universities is insufficient',
            'Emphasise the academic and methodological fit between your research and the German institution\'s known strengths',
        ],
        tone: 'Academic, structured, precise — less narrative-driven than UK or US scholarships',
    },
    erasmus: {
        label: 'Erasmus+',
        values: ['European values and intercultural competence', 'commitment to academic mobility and cross-border learning', 'cross-cultural cooperation and dialogue', 'practical contribution to European integration'],
        rules: [
            'Frame mobility itself as the value — learning to work and study across European cultures is the central point',
            'Reference specific partner institutions and name exactly what they offer that your home institution cannot',
            'Keep tone professional and practical — Erasmus panels respond to concrete plans, not grand personal narratives',
        ],
        tone: 'Professional, cooperative, practically and structurally focused',
    },
};

/** Cliché phrases that scholarship reviewers penalise — exported for client-side highlighting */
export const SCHOLARSHIP_FORBIDDEN_PHRASES = [
    'passionate about', 'always dreamed of', 'make a difference', 'since childhood',
    'truly believe', 'it would be an honor', 'i am excited to', 'hardworking and dedicated',
    'team player', 'think outside the box', 'unique opportunity', 'i am writing to express',
    'ever since i was young', 'from a young age', 'it has always been my dream',
    'i have always been', 'needless to say', 'in conclusion', 'to summarize',
    'it goes without saying', 'given the opportunity', 'i am confident that',
    'i am passionate', 'deeply passionate', 'lifelong passion',
];

/** Returns the display label of the matched scholarship, or null */
export function detectScholarshipName(description: string): string | null {
    const lower = description.toLowerCase();
    for (const [key, pack] of Object.entries(SCHOLARSHIP_VALUE_PACKS)) {
        if (lower.includes(key)) return pack.label;
    }
    return null;
}

function getScholarshipValuePack(description: string) {
    const lower = description.toLowerCase();
    for (const [key, pack] of Object.entries(SCHOLARSHIP_VALUE_PACKS)) {
        if (lower.includes(key)) return pack;
    }
    return null;
}

/** Extended profile for scholarship prompts — includes awards, publications, volunteer work from customSections */
function compactProfileForScholarship(profile: UserProfile): string {
    const awardItems = (profile.customSections ?? [])
        .filter(s => /award|honor|honour|prize|scholar|recognit|certif/i.test(s.title))
        .flatMap(s => s.items.slice(0, 6).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const volunteerItems = (profile.customSections ?? [])
        .filter(s => /volunteer|community|civic|ngo|charity|service|social impact/i.test(s.title))
        .flatMap(s => s.items.slice(0, 6).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const publicationItems = (profile.customSections ?? [])
        .filter(s => /publicat|research|paper|journal|thesis|dissert|conference|proceedings/i.test(s.title))
        .flatMap(s => s.items.slice(0, 8).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const p: Record<string, unknown> = {
        personalInfo: profile.personalInfo,
        summary: profile.summary || undefined,
        education: (profile.education ?? []).map(edu => ({
            degree: edu.degree,
            school: edu.school,
            graduationYear: edu.graduationYear,
            // Extra room for thesis/dissertation titles
            description: typeof (edu as any).description === 'string'
                ? (edu as any).description.substring(0, 400) : undefined,
        })),
        workExperience: (profile.workExperience ?? []).map((exp, idx) => ({
            _role: `ROLE_${idx + 1}`,
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: exp.startDate,
            endDate: exp.endDate,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, 500)
                : (Array.isArray(exp.responsibilities)
                    ? (exp.responsibilities as string[]).slice(0, 8).join('\n').substring(0, 500)
                    : ''),
        })),
        skills: (profile.skills ?? []).slice(0, 30),
        projects: (profile.projects ?? []).slice(0, 8).map(pr => ({
            name: pr.name,
            description: typeof pr.description === 'string' ? pr.description.substring(0, 350) : pr.description,
            link: pr.link,
        })),
        languages: profile.languages,
        awardsAndHonors: awardItems.length ? awardItems : undefined,
        publications: publicationItems.length ? publicationItems : undefined,
        volunteerAndCommunity: volunteerItems.length ? volunteerItems : undefined,
    };

    const clean = Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''
            && !(Array.isArray(v) && v.length === 0))
    );
    return JSON.stringify(clean);
}

export const generateScholarshipEssay = async (params: {
    profile: UserProfile;
    essayType: string;
    essayLabel: string;
    scholarshipDescription: string;
    additionalContext: string;
    wordCount: number;
    promptHint: string;
    onStep?: (step: string) => void;
}): Promise<string> => {
    const { onStep } = params;
    const valuePack = getScholarshipValuePack(params.scholarshipDescription);
    const essayStructure = ESSAY_STRUCTURES[params.essayType] ?? ESSAY_STRUCTURES['personal-statement'];
    const forbiddenList = SCHOLARSHIP_FORBIDDEN_PHRASES.map(p => `"${p}"`).join(', ');
    const wLow  = Math.round(params.wordCount * 0.92);
    const wHigh = Math.round(params.wordCount * 1.08);

    const scholarshipBlock = valuePack ? `
### SCHOLARSHIP-SPECIFIC INTELLIGENCE: ${valuePack.label.toUpperCase()}
Core values to demonstrate: ${valuePack.values.join('; ')}
Critical rules for this scholarship:
${valuePack.rules.map(r => `  - ${r}`).join('\n')}
Tone: ${valuePack.tone}
` : '';

    const prompt = `
You are an elite academic consultant and scholarship writer with a 95% success rate for international grants (Commonwealth, Chevening, Fulbright, ERASMUS+, Rhodes, Gates Cambridge, DAAD).

### YOUR GOAL
Write a compelling, high-stakes ${params.essayLabel} for the scholarship/program described below.
The essay must be deeply personal, professionally authoritative, and precisely aligned with this scholarship's values.

### INPUT DATA
USER PROFILE — use ONLY real details from here. Never invent facts, numbers, or experiences not present:
${compactProfileForScholarship(params.profile)}

SCHOLARSHIP / PROGRAM DESCRIPTION:
${params.scholarshipDescription || '(No description provided — write a strong general essay using the profile.)'}

ADDITIONAL PERSONAL CONTEXT:
${params.additionalContext || 'None provided. Rely entirely on the profile above.'}

${scholarshipBlock}
### ESSAY REQUIREMENTS
- Essay type: ${params.essayLabel}
- STRICT word count: between ${wLow} and ${wHigh} words. Count every word. Do not exceed or fall short of this range.
- Specific instruction: ${params.promptHint}
- Tone: Academic yet personal. Enthusiastic but never gushing. Visionary AND grounded in past achievements.
- Do NOT open the essay with the word "I" as the first word of the first sentence.
- Do NOT use any placeholder text such as [Your Name], [Scholarship Name], [University] — use real names from the profile and description.

### ESSAY STRUCTURE — follow this section order exactly:
${essayStructure}

### FORBIDDEN PHRASES — scholarship reviewers penalise these; NEVER use any of them:
${forbiddenList}
When tempted to use one, replace it with a SPECIFIC named anecdote, number, or concrete experience instead.

### QUALITY RULES
- Every claim must be grounded in a real detail from the profile — no invented facts
- Prefer specificity: "increased retention by 23% across 8 months" beats "improved performance significantly"
- The essay must read as if a real, thoughtful human wrote it about their actual life
- No AI-sounding phrases: no "delve into", "multifaceted", "testament to", "in conclusion", "it is worth noting"

Return ONLY the essay text. No title, no preamble, no sign-off, no word count annotation.
`;

    onStep?.('Writing your essay…');
    let essay = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.78, maxTokens: 4096 });

    // ── Always humanize — not gated on word count ─────────────────────────────
    onStep?.('Humanizing voice…');
    try {
        const humanized = await humanizeText(essay);
        if (humanized && humanized.trim().length > 100) essay = humanized;
    } catch { /* fall back to original */ }

    // ── Word count enforcement — trim or expand if >20% off target ────────────
    const actual = essay.split(/\s+/).filter(Boolean).length;
    const ratio  = actual / params.wordCount;
    if (ratio > 1.22 || ratio < 0.78) {
        const direction = ratio > 1.22 ? 'trim' : 'expand';
        onStep?.(direction === 'trim' ? 'Trimming to target length…' : 'Expanding to target length…');
        const enforcePrompt = direction === 'trim'
            ? `This essay is ${actual} words but must be between ${wLow} and ${wHigh} words. Trim it to fit. Remove the least important sentences while preserving all named achievements, numbers, and the essay structure. Return ONLY the essay text.\n\n${essay}`
            : `This essay is ${actual} words but must be between ${wLow} and ${wHigh} words. Expand it by deepening arguments and adding specific examples from the profile. Return ONLY the essay text.\n\n${essay}`;
        try {
            const enforced = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, enforcePrompt, { temperature: 0.45, maxTokens: 4096 });
            if (enforced && enforced.trim().length > 100) essay = enforced;
        } catch { /* keep existing */ }
    }

    return essay;
};

// ─── CV Checker: Score CV against JD ──────────────────────────────────────────

export interface CVCheckResult {
    overallScore: number;
    atsScore: number;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    matchedKeywords: string[];
    suggestions: string[];
    summary: string;
}

export const checkCVAgainstJob = async (
    profile: UserProfile,
    jobDescription: string,
    rawCVText?: string,
): Promise<CVCheckResult> => {
    const profileText = rawCVText
        ? rawCVText.substring(0, 3000)
        : JSON.stringify(profile, null, 2).substring(0, 2000);
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${profileText}

        ### JOB DESCRIPTION
        ${jobDescription.substring(0, 1500)}

        ### ANALYSIS INSTRUCTIONS
        1. **overallScore** (0-100): How well does this CV match the JD?
        2. **atsScore** (0-100): How likely is this CV to pass ATS screening?
        3. **strengths** (3-5 items): What the CV does well relative to this JD.
        4. **weaknesses** (3-5 items): Critical gaps, mismatches, or problems.
        5. **missingKeywords** (5-15 items): Important keywords/skills from the JD that are NOT in the CV.
        6. **matchedKeywords** (5-15 items): Keywords/skills that appear in BOTH the CV and JD.
        7. **suggestions** (3-6 items): Specific, actionable suggestions to improve the CV for this role.
        8. **summary** (2-3 sentences): Overall assessment in plain language.

        Be brutally honest. A 100 score should be near-impossible. Most CVs score 40-70.

        Return ONLY a JSON object with this structure:
        {
          "overallScore": number,
          "atsScore": number,
          "strengths": ["string"],
          "weaknesses": ["string"],
          "missingKeywords": ["string"],
          "matchedKeywords": ["string"],
          "suggestions": ["string"],
          "summary": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 1024, task: 'cvAudit' });
    const parsed = JSON.parse(text.trim());
    return {
        overallScore:    parsed.overallScore    ?? 0,
        atsScore:        parsed.atsScore        ?? 0,
        strengths:       Array.isArray(parsed.strengths)       ? parsed.strengths       : [],
        weaknesses:      Array.isArray(parsed.weaknesses)      ? parsed.weaknesses      : [],
        missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
        matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords : [],
        suggestions:     Array.isArray(parsed.suggestions)     ? parsed.suggestions     : [],
        summary:         parsed.summary ?? '',
    };
};

// ─── LinkedIn Profile Generator ──────────────────────────────────────────────

export interface LinkedInProfileResult {
    headline: string;
    about: string;
    summaryBullets: string[];
    skills: string[];
    featuredPost: string;
    connectionMessage: string;
    profileTips: string[];
}

export const generateLinkedInProfile = async (
    profile: UserProfile,
    targetRole?: string
): Promise<LinkedInProfileResult> => {
    const roleContext = targetRole ? `Target role/industry: ${targetRole}` : '';
    const prompt = `
You are an elite LinkedIn profile writer and personal branding strategist who has helped thousands of professionals land jobs at Google, Amazon, McKinsey, and top startups. You write profiles that get 10x more recruiter messages.

CANDIDATE PROFILE:
${compactProfile(profile)}
${roleContext}

Generate a complete, world-class LinkedIn profile package. Everything must sound like a real, accomplished human wrote it — NOT a template. Be specific, use real details from the profile.

Return ONLY a JSON object:
{
  "headline": "string (120 chars max — NOT just job title. Formula: [What you do] | [Who you help] | [Key achievement or USP]. Make it irresistible to click. Include 2-3 JD keywords if target role provided. NEVER just 'Software Engineer at Company'.)",
  "about": "string (2,000 chars max — the 'About' section. Structure: Hook sentence (fascinating fact or bold claim about them, 1-2 sentences). Core value prop (what they do and who they do it for, 2 sentences). Career highlight reel (3-4 specific achievements with numbers from their profile). Current focus (what they are working on and excited about, 1-2 sentences). Call to action (how to reach them and what for). Write in first person. Vary sentence length — mix punchy 5-word sentences with longer elaborative ones. NO AI clichés: no 'passionate', 'leverage', 'synergy', 'results-driven', 'dynamic', 'innovative'.)",
  "summaryBullets": ["string array of 5 achievement bullets for the 'Featured' bullet summary style — each under 150 chars, starts with an emoji, has a metric"],
  "skills": ["string array of 20 LinkedIn skills to add — ordered by endorsability and searchability for their role"],
  "featuredPost": "string (a ready-to-post LinkedIn update, 150-200 words, announcing something impressive — a project, milestone, lesson learned. Professional but personal. Not 'excited to announce'. End with 3 relevant hashtags.)",
  "connectionMessage": "string (a 300-char LinkedIn connection request message template — warm, specific, not salesy. Use [NAME] as placeholder.)",
  "profileTips": ["string array of 5 specific, actionable tips to improve their LinkedIn presence based on their actual profile gaps — be specific about what to add/change"]
}
`;
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 3000 });
    return JSON.parse(text.trim()) as LinkedInProfileResult;
};

// ─── Thank-You Letter Generator ───────────────────────────────────────────────

export const generateThankYouLetter = async (
    profile: UserProfile,
    jobDescription: string,
    interviewerName?: string,
    interviewType?: string
): Promise<string> => {
    const interviewer = interviewerName?.trim() || 'the hiring team';
    const type = interviewType || 'interview';
    const name = profile.personalInfo?.name || 'Candidate';

    const prompt = `
You are a top executive career coach. Write a compelling, human-sounding post-${type} thank-you letter that stands out and reinforces the candidate's candidacy.

CANDIDATE NAME: ${name}
INTERVIEWER: ${interviewer}

CANDIDATE PROFILE:
${compactProfile(profile)}

JOB DESCRIPTION:
${jobDescription.substring(0, 1500)}

STRICT INSTRUCTIONS:
1. Start DIRECTLY with "Dear ${interviewer}," — no header block.
2. Opening (1 sentence): Thank them warmly and reference something specific from the ${type}.
3. Reinforcement paragraph: Tie one specific thing discussed to a concrete achievement from the profile. Show you were listening and thinking.
4. Value-add paragraph: Briefly mention one additional reason you are the right fit that didn't come up, or expand on something that was covered too briefly.
5. Closing (1 sentence): Express genuine enthusiasm, confirm interest, offer next steps.
6. Sign-off: "Warm regards," then the candidate's name on the next line: ${name}
7. Length: 180-250 words. Concise, human, specific.
8. Tone: Professional, warm, confident. NOT generic or gushing.
9. NO AI clichés: no "excited", "thrilled", "leverage", "passionate".
10. Return ONLY the letter text. No commentary.
`;
    return groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Smart Cover Letter: JD + Company Research ───────────────────────────────

export const generateSmartCoverLetter = async (
    profile: UserProfile,
    jobDescription: string,
    companyResearch: string = '',
    onChunk?: (delta: string) => void,
): Promise<string> => {
    const companySection = companyResearch
        ? `\n### COMPANY RESEARCH (use this to show you know the company)\n${companyResearch}\n`
        : '';

    const prompt = `
        You are a world-class career coach writing a WINNING cover letter.

        ### CV DATA
        ${compactProfile(profile)}

        ### JOB DESCRIPTION
        ${jobDescription}
        ${companySection}
        ### COVER LETTER INSTRUCTIONS
        1. **Opening**: Name the exact role. If company research is available, mention something specific about the company (recent news, values, product) that excites you.
        2. **Body (2-3 paragraphs)**:
           - Match your 2-3 strongest experiences to the JD's top requirements.
           - Use STAR method briefly (Situation, Task, Action, Result) for at least one example.
           - Include specific metrics/numbers from your CV where possible.
           - If company research is available, connect your values/experience to the company's mission/culture.
        3. **Closing**: Confident call-to-action. Express genuine enthusiasm.
        4. **Tone**: Professional, warm, confident — NOT generic or sycophantic.
        5. **Length**: 250-350 words. Concise is king.
        6. **Format**: Plain text with proper letter formatting. Address to "Dear Hiring Manager" unless a name is known.

        CRITICAL: This letter must feel unique to THIS job at THIS company. No generic templates.
        Return ONLY the cover letter text. No commentary.
    `;

    return onChunk
        ? groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, onChunk, { temperature: 0.7 })
        : groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Paraphrase: Rewrite text in different tones ──────────────────────────────

export type ParaphraseTone = 'professional' | 'concise' | 'creative' | 'ats-friendly';

export const paraphraseText = async (
    text: string,
    tone: ParaphraseTone = 'professional',
    context: string = ''
): Promise<string> => {
    const banned = await _getBannedPhrasesForPrompt();
    const toneInstructions: Record<ParaphraseTone, string> = {
        professional: 'Rewrite in a polished, professional tone. Use strong past-tense action verbs (e.g. Led, Built, Delivered, Reduced, Launched). Keep formal language but sound human — not robotic.',
        concise: 'Rewrite to be as concise as possible. Cut filler words, reduce length by 30-40%, but preserve ALL key information and impact. Each bullet should be one powerful line.',
        creative: 'Rewrite with more engaging, dynamic language. Use vivid descriptions and compelling narrative while staying professional. Make it memorable.',
        'ats-friendly': 'Rewrite to maximise ATS compatibility. Use standard industry keywords from the job description context where provided. Keep it keyword-rich but human-readable. Avoid jargon and buzzwords.',
    };

    const prompt = `
        ${toneInstructions[tone]}

        ${context ? `CONTEXT (job description this text is being tailored for):\n${context}\n` : ''}

        TEXT TO REWRITE:
        ${text}

        RULES:
        - Preserve ALL factual details: dates, numbers, company names, job titles, metrics. Do NOT invent new figures.
        - Never use approximation markers like "~", "approx.", or hedged estimates.
        - BANNED PHRASES — never use any of these: ${banned}
        - Return ONLY the rewritten text, no commentary or explanation.
        - Maintain the same general structure (if it's bullets, return bullets; if paragraphs, return paragraphs).
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: tone === 'ats-friendly' ? 0.3 : 0.7 });
};

// ── Verb-Saturation One-Click Fix ─────────────────────────────────────────────
/**
 * Rewrites verb-led bullets to diversify openers.
 * Targets only bullets starting with action verbs; leaves all other bullets untouched.
 * Rewrites ~40% of verb-led bullets (the first N to stay within prompt budget).
 * Returns the full bullets array with rewrites applied in place.
 */
export const fixVerbSaturation = async (bullets: string[]): Promise<string[]> => {
    // Identify verb-led indices (reuse the same logic as hrDetectorSimulation)
    const COMMON_VERBS = new Set([
        'led','built','created','developed','designed','managed','delivered','launched','drove',
        'implemented','established','improved','reduced','increased','deployed','architected',
        'engineered','optimised','optimized','transformed','spearheaded','coordinated','executed',
        'oversaw','directed','streamlined','accelerated','automated','negotiated','secured',
        'generated','achieved','exceeded','mentored','trained','hired','grew','scaled','shipped',
        'maintained','operated','monitored','analysed','analyzed','evaluated','assessed','audited',
        'collaborated','partnered','supported','enabled','facilitated','introduced','pioneered',
        'revamped','consolidated','migrated','integrated','configured','provisioned','resolved',
    ]);
    const firstWord = (b: string) => b.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
    const verbLedIdxs = bullets
        .map((b, i) => ({ i, isVerb: COMMON_VERBS.has(firstWord(b)) }))
        .filter(x => x.isVerb)
        .map(x => x.i);

    if (verbLedIdxs.length === 0) return bullets;

    // Rewrite at most 8 of them to stay within a fast prompt budget
    const toRewrite = verbLedIdxs.slice(0, 8);
    const subset    = toRewrite.map(i => `[${i}] ${bullets[i]}`).join('\n');

    const banned = await _getBannedPhrasesForPrompt();

    const prompt = `You are rewriting CV bullet points to fix verb-led opener saturation.
Each bullet currently STARTS WITH AN ACTION VERB. Rewrite ONLY the opener so it no longer starts with a verb.
Use one of these three opener patterns (vary them):
  • Number/scope-led: "3 engineers mentored…", "Across 5 teams,…", "£2.1M programme delivered…"
  • Context-led: "As sole engineer,…", "In partnership with X,…", "Under tight deadline,…"  
  • Result-first: "Zero-downtime migration achieved by…", "40% cost reduction realised through…"

RULES:
- Preserve ALL facts: numbers, company names, dates, exact metrics. Do NOT invent figures.
- Do NOT use these banned phrases: ${banned.slice(0, 80)}
- Return ONLY a JSON object: { "rewrites": { "<index>": "<rewritten bullet>", ... } }
- Indices correspond to the [N] prefix in the input.
- Only rewrite the opener — keep the body of each bullet as close as possible.

BULLETS TO REWRITE:
${subset}`;

    try {
        const raw = await groqChat(GROQ_FAST, '', prompt, { temperature: 0.6, json: true, maxTokens: 1500 });
        const _rawStripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_rawStripped || '{}') as { rewrites?: Record<string, string> };
        const rewrites = parsed.rewrites ?? {};
        const result = [...bullets];
        for (const [idxStr, text] of Object.entries(rewrites)) {
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx) && idx >= 0 && idx < result.length && typeof text === 'string' && text.trim()) {
                result[idx] = text.trim();
            }
        }
        return result;
    } catch {
        return bullets; // fallback: return unchanged
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// One-click bullet/summary fixers keyed by HR signal ID
// ─────────────────────────────────────────────────────────────────────────────

const BULLET_FIX_INSTRUCTIONS: Record<string, string> = {
    banned_opener: `Identify bullets that START with these banned AI-sounding words/phrases: Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed, Harnessed, Synergized, Responsible for, Helped to, Worked on, Assisted with, Tasked with.
Rewrite ONLY those bullets — change the opener to a direct strong action verb (Led, Built, Cut, Grew, Delivered, Launched, Reduced, Drove, Shipped, Designed, Managed, Deployed, etc.).
Preserve ALL facts, numbers, dates, and the rest of the bullet. Only change the opening word/phrase.`,

    repeated_opener: `Identify which opening verb appears 3 or more times across all bullets. Rewrite those duplicate-opener bullets so each uses a DIFFERENT verb from a different family:
• Technical: Built, Configured, Deployed, Architected, Engineered, Integrated
• Management: Led, Directed, Oversaw, Coordinated, Supervised, Mentored  
• Analysis: Assessed, Evaluated, Diagnosed, Audited, Reviewed, Benchmarked
• Delivery: Launched, Shipped, Executed, Rolled out, Produced, Released
Preserve ALL facts and numbers. Only change the opener verb.`,

    pronoun_leak: `Identify bullets containing first-person pronouns: I, I've, my, me, we, we've, our, ourselves.
Rewrite those bullets removing the pronoun — CVs use implied subject:
• "I managed a team of 5" → "Managed a team of 5 engineers"
• "My approach reduced costs by 30%" → "Reduced costs by 30% through…"
• "We delivered the project" → "Delivered the project with a cross-functional team of N"
Preserve ALL facts. Restructure the sentence naturally — do not just delete the pronoun word.`,

    passive_voice: `Identify bullets that use passive voice constructions (was, were, been, being + past participle — e.g. "was managed", "were delivered", "been responsible for").
Rewrite those bullets as active voice starting with a strong past-tense action verb:
• "The project was delivered by the team" → "Delivered the project with a cross-functional team of 6"
• "Costs were reduced by 25%" → "Reduced costs by 25% through process automation"
Preserve ALL facts and numbers.`,

    length_uniformity: `These bullets are too uniform in length. Vary them deliberately:
• Short punchy (8–12 words): strip filler, keep the core metric  
• Standard (13–18 words): one action + one result
• Detailed (18–24 words): action + method + result + scale
Aim for a mix where at least 30% of bullets are short and 30% are detailed.
Extend short bullets with context or method; trim verbose ones to the core win.
Preserve ALL facts and numbers.`,

    no_metric: `Identify bullets that describe activities or outcomes WITHOUT any measurable figures (no %, no £/$, no headcount, no timeframe, no scale indicator).

Rewrite each flagged bullet to include a clearly-marked placeholder — use [X%], [£X], [X users], [X months], [X engineers] etc. — showing EXACTLY where a real number belongs and in what unit. Also restructure the bullet around the placeholder so it reads naturally once a real number is filled in.

Keep ALL existing specific facts and numbers unchanged.

Example:
Before: "Managed relationships with enterprise clients and improved satisfaction"
After:  "Managed [X] enterprise accounts (£[X]M ARR), lifting client satisfaction scores by [X]% over [X] months"`,

    achievement_density: `Identify bullets that describe duties/responsibilities ("responsible for", "managed the", "worked on", "oversaw", "helped") rather than outcomes or achievements.

Rewrite each flagged bullet using Result → Action → Context format:
  "[Result achieved] by [specific action], enabling [context/impact]"

If the real result isn't in the bullet, add a placeholder like [X% improvement], [£X saved], [X faster].
Do NOT invent facts — use bracketed placeholders for unknowns, keep all real numbers and company names exactly.
Preserve bullets that already contain a clear outcome or metric — do not rewrite those.`,

    tense_mismatch: `Fix verb tense consistency across all experience bullets.
- Bullets for the FIRST (current/most recent) experience entry → present tense ("Manage", "Lead", "Build")
- ALL other experience entries (past roles) → past tense ("Managed", "Led", "Built")

Rewrite ONLY the bullets that have the wrong tense. Change the opening verb form only; preserve everything else exactly.`,

    weak_verb: `Identify bullets starting with weak or vague verbs: helped, worked, assisted, supported, participated, involved, contributed, was part of, played a role.

Rewrite each to start with a strong, specific ownership verb:
• Leading/managing: Led, Directed, Oversaw, Managed, Coordinated
• Building/engineering: Built, Engineered, Developed, Architected, Designed
• Delivering: Delivered, Launched, Shipped, Executed, Deployed
• Improving: Improved, Optimised, Streamlined, Accelerated, Reduced
• Growing: Grew, Scaled, Expanded, Increased, Drove

Choose the verb that best reflects what the person actually did — don't just swap in a random strong verb.
Preserve ALL facts, numbers, and the rest of the bullet content.`,
};

const SUMMARY_FIX_INSTRUCTIONS: Record<string, string> = {
    summary_cliches: `Remove AI-ism cliché phrases from this summary paragraph. The phrases to eliminate include: results-driven, highly motivated, detail-oriented, team player, hard-working, self-starter, go-getter, dynamic professional, proven track record, passionate about, excellent communication skills, strong work ethic, dedicated professional, innovative thinker, forward-thinking, well-rounded, value-add, thought leader, best-in-class.
Replace each removed phrase with a SPECIFIC achievement, domain fact, or concrete skill. Keep approximately the same length. Return only the rewritten summary text.`,

    generic_opener: `This summary opens with a generic AI phrase ("I am a…", "An experienced…", "Seeking…", "A dedicated…", "A results-driven…", "A highly motivated…").
Rewrite ONLY the opening sentence to follow this pattern:
[Job title] with [X] years of [specific domain] experience[, strongest concrete achievement OR key specialisation].
Example: "Senior product manager with 9 years of B2B SaaS experience, having shipped 3 platform products reaching $12M ARR."
Keep the rest of the summary unchanged. Return only the full rewritten summary paragraph.`,

    summary_too_short: `This professional summary is too brief. Expand it to 60–90 words while preserving everything already there.

Structure to follow:
1. Open: [Current job title] with [X] years of [domain/specialty] experience
2. Specialisation: mention 2 core strengths or domains
3. Highlight: one concrete achievement — use [metric placeholder] if no real figure is available
4. Direction (optional): "Seeking [type of role] in [sector]" — only add if it fits naturally

Build on what is already written — do not contradict or replace existing facts.
Return ONLY the expanded summary text with no labels or explanation.`,

    summary_too_long: `This professional summary is too long. Trim it to 60–90 words.

Rules:
- Remove filler phrases that add no information: "results-driven", "passionate about", "team player", "strong communicator"
- Cut anything that repeats information already clear from the job titles/bullets
- Every remaining sentence must earn its place: fact, skill, or concrete achievement only
- Keep all specific metrics, job titles, and company names

Return ONLY the trimmed summary text with no labels or explanation.`,
};

// ── ProCV pipeline voice rules injected into every coaching fix ──────────────
const _COACHING_VOICE_RULES = `
PROCV VOICE RULES (non-negotiable — same rules as the main CV generation pipeline):
1. No first-person pronouns — never write I, I've, I've, my, me, we, we've, our
2. No AI-sounding openers — never start a bullet with: Spearheaded, Orchestrated, Leveraged,
   Utilized, Facilitated, Empowered, Championed, Harnessed, Synergized, Transformed, Revolutionized
3. No cliché adjectives — never use: results-driven, highly motivated, detail-oriented, proven,
   dynamic, innovative, forward-thinking, passionate, value-add, best-in-class
4. Start every bullet with a strong past-tense action verb (e.g. Led, Built, Delivered, Reduced,
   Grew, Launched, Designed, Managed, Deployed, Analysed, Negotiated)
5. Be concrete — no vague descriptors like "various", "multiple", "different types of"
6. Preserve every existing number, company name, date, and proper noun exactly as written`.trim();

/**
 * Fix bullet points for a given signal — returns the full corrected array.
 * Uses the full Worker-fetched HUMANIZATION_RULES (same as CV generation) with
 * _COACHING_VOICE_RULES as a static fallback. Each rewrite passes through
 * purifiedCompletion so banned phrases are scrubbed before reaching the user.
 */
export const fixBulletsForSignal = async (
    bullets: string[],
    signalId: string,
): Promise<string[]> => {
    const instruction = BULLET_FIX_INSTRUCTIONS[signalId];
    if (!instruction || bullets.length === 0) return bullets;

    const banned = await _getBannedPhrasesForPrompt();
    const numbered = bullets.map((b, i) => `[${i}] ${b}`).join('\n');

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor applying a targeted fix to a set of CV bullet points.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 80)}
- Do NOT invent new metrics or facts — only change wording or structure
- Return ONLY a valid JSON object: { "rewrites": { "<index>": "<rewritten bullet>", ... } }
- Include ONLY bullets you actually changed — omit unchanged ones
- Indices correspond to the [N] prefix in the input

BULLETS:
${numbered}`;

    try {
        const { purifiedCompletion } = await import('./purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 2400 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { rewrites?: Record<string, string> };
        const rewrites = parsed.rewrites ?? {};
        const result = [...bullets];
        // Run each rewrite through purifiedCompletion to strip any surviving banned phrases
        await Promise.all(
            Object.entries(rewrites).map(async ([idxStr, text]) => {
                const idx = parseInt(idxStr, 10);
                if (!isNaN(idx) && idx >= 0 && idx < result.length && typeof text === 'string' && text.trim()) {
                    const { text: clean } = await purifiedCompletion(() => Promise.resolve(text.trim()));
                    result[idx] = clean;
                }
            })
        );
        return result;
    } catch {
        return bullets;
    }
};

/**
 * Fix summary for a given signal — returns the corrected summary string.
 * Uses the full Worker-fetched HUMANIZATION_RULES (same as CV generation) and
 * passes the result through purifiedCompletion so banned phrases are scrubbed.
 */
export const fixSummaryForSignal = async (
    summary: string,
    signalId: string,
): Promise<string> => {
    const instruction = SUMMARY_FIX_INSTRUCTIONS[signalId];
    if (!instruction || !summary.trim()) return summary;

    const banned = await _getBannedPhrasesForPrompt();

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor improving a professional summary section.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 60)}
- Do NOT invent new facts or metrics
- Return ONLY a valid JSON object: { "summary": "<rewritten summary>" }

SUMMARY TO FIX:
${summary}`;

    try {
        const { purifiedCompletion } = await import('./purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 600 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { summary?: string };
        const rawSummary = parsed.summary?.trim();
        if (!rawSummary) return summary;
        const { text: clean } = await purifiedCompletion(() => Promise.resolve(rawSummary));
        return clean;
    } catch {
        return summary;
    }
};

// ── CV Score / Match Analysis ─────────────────────────────────────────────────
export interface CVScore {
    overall: number;
    ats: number;
    impact: number;
    relevance: number;
    clarity: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    verdict: string;
}

export const scoreCV = async (cvData: CVData, jobDescription: string): Promise<CVScore> => {
    const cvText = [
        cvData.summary,
        ...cvData.experience.flatMap(e => [e.jobTitle, e.company, ...e.responsibilities]),
        ...cvData.skills,
        ...cvData.education.map(e => `${e.degree} ${e.school}`),
        ...(cvData.projects || []).map(p => p.description),
    ].join(' ').substring(0, 2000);

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription.substring(0, 1200)}

Scoring rubric:
- "ats" (0-100): How many of the JD's key terms/phrases appear in the CV?
- "impact" (0-100): What % of bullet points have a quantified result?
- "relevance" (0-100): How closely does the candidate's experience/skills match the role requirements?
- "clarity" (0-100): Is the writing concise, free of clichés, and easy to skim?
- "overall" (0-100): Weighted average — ats×0.35 + impact×0.25 + relevance×0.30 + clarity×0.10.
- "missingKeywords": List up to 8 important JD keywords/phrases NOT found in the CV.
- "strengths": Exactly 2 specific things this CV does well.
- "improvements": Exactly 3 specific, immediately actionable fixes.
- "verdict": One punchy sentence a recruiter would say about this CV.

Return ONLY a JSON object:
{
  "overall": number,
  "ats": number,
  "impact": number,
  "relevance": number,
  "clarity": number,
  "missingKeywords": ["string"],
  "strengths": ["string"],
  "improvements": ["string"],
  "verdict": "string"
}
`;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 900 });
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let raw: CVScore;
    try {
        raw = JSON.parse(stripped) as CVScore;
    } catch {
        // Attempt basic repair: close open strings, strip trailing commas, close brackets
        const repaired = stripped
            .replace(/,\s*"[^"]*$/, '')
            .replace(/[,:\s]+$/, '')
            .replace(/\}\s*$/, '') + '}';
        try { raw = JSON.parse(repaired) as CVScore; }
        catch { throw new Error('Could not parse score response — please try again.'); }
    }

    // Sanitize: ensure no field contains a raw JSON string (LLM sometimes wraps a
    // value in {} or []) — strip anything that looks like a JSON object/array dump
    const cleanStr = (v: unknown): string => {
        if (typeof v !== 'string') return '';
        const t = v.trim();
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) return '';
        return t;
    };
    const cleanArr = (arr: unknown[]): string[] =>
        (arr || []).map(cleanStr).filter(Boolean);

    return {
        ...raw,
        verdict: cleanStr(raw.verdict) || 'Score computed.',
        strengths:       cleanArr(raw.strengths),
        improvements:    cleanArr(raw.improvements),
        missingKeywords: cleanArr(raw.missingKeywords),
    } as CVScore;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared post-generation quality polish.
//
// THE single place where post-Groq CV polish lives. Used by every generation
// path (generateCV, improveCV / Auto Optimize, optimizeCVForJob) so all three
// flows produce CVs at parity. Tune CV quality here — nowhere else.
//
// Pipeline (in order):
//   1. Humanizer pass (Workers AI / Groq, with corrupt-metric revert).
//   2. Bullet-count enforcer — either:
//        - 'profile-pointcount': honour user's pointCount per role (Generate path).
//        - 'preserve-cv':        match the source CV's bullet counts exactly
//                                (Improve / Optimize paths — never silently
//                                changes structure).
//   3. Deterministic banned-phrase filter (pure JS, cannot fail).
//   4. Carry profile customSections + sectionOrder if `carryProfile` is given.
//   5. Sort experience by end date desc (most recent first).
//   6. purifyCV — banned subs, tense, jitter, dedup; returns a report.
//   7. `onPurifyReport` callback (for telemetry / leak reporting).
//   8. Voice-consistency enforcement (only when `engineBrief` is provided,
//      with corrupt-metric revert).
//   9. finalizeCvData — fidelity rules vs profile or source CV (no AI).
//  10. Pronoun safety net.
//
// Every AI step is wrapped so a worker / Groq hiccup never aborts the polish:
// the deterministic passes still run and the user gets a finished CV.
// ─────────────────────────────────────────────────────────────────────────────
type BulletCountStrategy =
    | { type: 'profile-pointcount'; profile: UserProfile }
    | { type: 'preserve-cv'; sourceCv: CVData };

type FinalizeStrategy =
    | { profile: UserProfile }
    | { sourceCv: CVData };

// ── Public type so UI components can display what the pipeline caught ────────
export interface LeakSummaryPayload {
    totalFixed: number;
    totalFlagged: number;
    instructionLeaksStripped: number;
    duplicateBulletsRemoved: number;
    bannedPhrasesFixed: number;
    tenseFixed: number;
    polishFixes: number;
    flaggedItems: Array<{ leakType: string; phrase: string; fieldLocation?: string }>;
}

function buildLeakSummaryPayload(report: PurifyReport): LeakSummaryPayload {
    const leaks = report.leaks ?? [];
    const fixed   = leaks.filter(l => l.fixedBy && l.fixedBy !== 'none');
    const flagged = leaks.filter(l => !l.fixedBy || l.fixedBy === 'none');
    return {
        totalFixed:               fixed.length,
        totalFlagged:             flagged.length,
        instructionLeaksStripped: fixed.filter(l => l.leakType === 'instruction_leak').length,
        duplicateBulletsRemoved:  fixed.filter(l => l.leakType === 'duplicate_bullet').length,
        bannedPhrasesFixed:       fixed.filter(l => l.leakType === 'banned_phrase').length,
        tenseFixed:               fixed.filter(l => l.leakType === 'tense_mismatch').length,
        polishFixes:              report.polishFixes ?? 0,
        flaggedItems:             flagged.slice(0, 10).map(l => ({
            leakType:      l.leakType,
            phrase:        l.phrase ?? '',
            fieldLocation: l.fieldLocation,
        })),
    };
}

interface QualityPolishOpts {
    bulletCount: BulletCountStrategy;
    finalize: FinalizeStrategy;
    runHumanizer?: boolean;
    carryProfile?: UserProfile;
    engineBrief?: CVBrief | null;
    onPurifyReport?: (report: PurifyReport) => void | Promise<void>;
    onLeakSummary?: (summary: LeakSummaryPayload) => void;
    /** JD-reconciled skill set from reconcileSkills(). When present, used as
     *  the authoritative allowed-skills list in applySourceFidelityRules so
     *  JD-irrelevant profile skills cannot leak back after generation. */
    reconciledSkills?: ReconciledSkills | null;
    /** Detected market currency (e.g. 'KES', 'NGN', 'GBP'). When set, the
     *  silent guardian normalizes any wrong currency symbols to this value —
     *  e.g. "$2M" → "KES 2M" for a Kenyan profile. */
    detectedCurrency?: string;
}

async function runQualityPolishPasses(
    cvData: CVData,
    opts: QualityPolishOpts,
): Promise<CVData> {
    const { runHumanizer = true, bulletCount, carryProfile, engineBrief, finalize, onPurifyReport, onLeakSummary, reconciledSkills, detectedCurrency } = opts;
    let out = cvData;

    // 1. Humanizer pass — fixes short bullets, banned phrases in summary,
    //    duplicate verb starters, scope-anchor first bullet, etc.
    //
    //    Apr 29 2026 — feedback loop: run a deterministic purify pre-scan on a
    //    deep CLONE of the CV first, harvest the high-leverage leak types
    //    (round_number, orphan_metric, bullet_band_imbalance) the regex layer
    //    cannot safely auto-fix, and forward them to the humanizer as an
    //    explicit must-fix list with concrete contexts. The clone ensures the
    //    real `out` reaches the humanizer untouched — the authoritative
    //    purifyCV pass still runs at step 6 after the LLM rewrite.
    if (runHumanizer) {
        try {
            _dispatchPolishStage('humanizing');
            const preAudit: CVData = JSON.parse(JSON.stringify(out));
            let scanLeaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }> = [];
            try {
                const scanCopy: CVData = JSON.parse(JSON.stringify(out));
                const scan = purifyCV(scanCopy);
                scanLeaks = scan.report.leaks || [];
            } catch (scanErr) {
                console.debug('[Polish] Pre-humanizer leak scan failed (non-fatal):', scanErr);
            }
            out = await runHumanizationAudit(out, scanLeaks);
            const auditRevert = revertCorruptedMetrics(out, preAudit);
            if (auditRevert.reverted.length > 0) {
                console.warn(`[Polish] Humanizer reverted ${auditRevert.reverted.length} corrupted metric(s):`, auditRevert.reverted);
                out = auditRevert.cv;
            }
        } catch (e) {
            console.warn('[Polish] Humanizer pass skipped:', e);
        }
    }

    // 2. Bullet-count enforcer.
    out.experience = (out.experience || []).map(role => {
        let desired: number;
        let sourceBullets: string[] = [];

        if (bulletCount.type === 'profile-pointcount') {
            const normalize = (s: string) => (s || '').toLowerCase().trim();
            const sourceRole = (bulletCount.profile.workExperience || []).find(
                we => normalize(we.jobTitle) === normalize(role.jobTitle) && normalize(we.company) === normalize(role.company)
            ) ?? (bulletCount.profile.workExperience || []).find(
                we => normalize(we.company) === normalize(role.company)
            ) ?? (bulletCount.profile.workExperience || []).find(
                we => normalize(role.jobTitle).includes(normalize(we.jobTitle).split(' ')[0] || '__') ||
                      normalize(we.jobTitle).includes(normalize(role.jobTitle).split(' ')[0] || '__')
            );
            desired = sourceRole?.pointCount ?? role.responsibilities?.length ?? 5;
            sourceBullets = (sourceRole?.responsibilities || '')
                .split('\n').map(s => s.replace(/^[\u2022\-\*]\s*/, '').trim()).filter(Boolean);
        } else {
            const sourceRole = (bulletCount.sourceCv.experience || []).find(
                r => r.jobTitle === role.jobTitle && r.company === role.company
            );
            desired = sourceRole?.responsibilities?.length ?? role.responsibilities?.length ?? 5;
            sourceBullets = sourceRole?.responsibilities || [];
        }

        const current = role.responsibilities || [];
        if (current.length === desired) return role;
        if (current.length > desired) {
            if (import.meta.env.DEV) console.warn(`[Polish BulletCount] Trimmed "${role.jobTitle} @ ${role.company}" from ${current.length} → ${desired} bullets.`);
            return { ...role, responsibilities: current.slice(0, desired) };
        }
        // Pad from source bullets — never invent text.
        const padded = [...current];
        for (const b of sourceBullets) {
            if (padded.length >= desired) break;
            if (!padded.some(p => p.toLowerCase().includes(b.toLowerCase().slice(0, 20)))) {
                padded.push(b);
            }
        }
        if (padded.length !== current.length) {
            if (import.meta.env.DEV) console.warn(`[Polish BulletCount] Padded "${role.jobTitle} @ ${role.company}" from ${current.length} → ${padded.length} bullets.`);
        }
        return { ...role, responsibilities: padded };
    });

    // 3. Deterministic banned-phrase filter (cannot fail, no AI).
    out = applyBannedPhraseFilter(out);

    // 4. Carry through profile-level user-pre-filled content (Generate path).
    if (carryProfile) {
        if (carryProfile.customSections && carryProfile.customSections.length > 0) {
            out.customSections = carryProfile.customSections.filter(
                s => s.items.some(i => i.title.trim().length > 0)
            );
        }
        if (carryProfile.sectionOrder && carryProfile.sectionOrder.length > 0) {
            out.sectionOrder = carryProfile.sectionOrder;
        }
    }

    // 5. Sort experience by end date descending (most recent first).
    out.experience.sort((a, b) => {
        const getEnd = (s: string) => s?.toLowerCase() === 'present'
            ? new Date()
            : (isNaN(new Date(s).getTime()) ? new Date(0) : new Date(s));
        const ea = getEnd(a.endDate).getTime();
        const eb = getEnd(b.endDate).getTime();
        if (eb !== ea) return eb - ea;
        const sa = isNaN(new Date(a.startDate).getTime()) ? 0 : new Date(a.startDate).getTime();
        const sb = isNaN(new Date(b.startDate).getTime()) ? 0 : new Date(b.startDate).getTime();
        return sb - sa;
    });

    // 6a. Worker pre-purify — server-side IP rules (substitutions, tense, voice).
    //     Runs BEFORE the local purifyCV so the Worker's rules are applied first.
    //     Falls back silently if the Worker is unreachable.
    //     Also runs the final visible-text gate; if the gate finds critical issues,
    //     a targeted LLM repair is triggered for the affected sections (summary /
    //     experience) before the local pipeline continues.
    // Tracks whether the Worker's purify-cv pass ran successfully AND no
    // fresh LLM text was written afterward (gate repair). Only in that case
    // is it safe to skip the local substitution/tense passes in step 6 below
    // — they'd just be re-applying the exact same rule set the Worker already
    // applied. If the Worker was unreachable, or a gate repair introduced new
    // unvetted text, the local pass must run so nothing ships uncleaned.
    let workerPurifiedCleanly = false;
    _dispatchPolishStage('purifying');
    try {
        const pre = await remotePrePurify(out);
        out = pre.cv;
        workerPurifiedCleanly = pre.fromWorker;

        // ── Gate-triggered repair ────────────────────────────────────────────
        // The worker gate scans every visible field AFTER all server-side
        // cleaning passes. Critical findings (jobseeker openers, weak bullet
        // verbs, AI-ism openers, first-person bullets, placeholder text) are
        // issues that need rewriting, not just substitution. We route them
        // through the existing runQualityGate Stage 2 LLM repair.
        const gate = pre.gate;
        if (gate && gate.quality_mode === 'degraded' && gate.counts.critical > 0) {
            try {
                console.info(
                    `[Polish/Gate] ${gate.counts.critical} critical issue(s) detected by server gate — ` +
                    `triggering targeted repair. Issues: ${gate.issues.filter(i => i.severity === 'critical').map(i => i.issue).join(', ')}`,
                );
                const gateRepair = await runQualityGate(
                    String(out.summary ?? ''),
                    Array.isArray(out.experience) ? out.experience : [],
                    { repair: true, skills: Array.isArray(out.skills) ? out.skills : [] },
                );
                if (gateRepair.repairedSummary) {
                    out = { ...out, summary: gateRepair.repairedSummary };
                    // Fresh LLM text — hasn't been through substitution/tense yet.
                    workerPurifiedCleanly = false;
                }
                if (gateRepair.repairedExperience) {
                    out = { ...out, experience: gateRepair.repairedExperience };
                    workerPurifiedCleanly = false;
                }
            } catch (repairErr) {
                console.debug('[Polish/Gate] Targeted repair after server gate failed (non-fatal):', repairErr);
            }
        }
    } catch { /* non-fatal — local purifyCV handles the rest */ }

    // 6. Hot Fire — deterministic purification (banned subs, tense, jitter, dedup).
    //    Substitution + tense passes are skipped when the Worker already ran
    //    them cleanly (workerPurifiedCleanly) to avoid double-processing the
    //    same identical rule tables; every other pass here (word-overuse,
    //    semantic dedup, polish, skill normalisation) is local-only logic the
    //    Worker doesn't perform, so it always runs regardless.
    const purified = purifyCV(out, { skipWorkerDuplicatePasses: workerPurifiedCleanly });
    out = purified.cv;
    // Accumulate purifier warning count for quality score penalty at step 9.
    const _purifyWarnings = (purified.report.leaks ?? []).filter(l => !l.fixedBy || l.fixedBy === 'none').length;

    // 6b. Currency normalisation — swap wrong currency symbols/codes to the
    //     detected market currency. The first bullet of each role (scope-anchor)
    //     is always exempt so a pinned "$2M exactly" value is never overwritten
    //     by the general "use KES" rule (anchor wins).
    if (detectedCurrency && detectedCurrency !== 'NONE') {
        try {
            out = _normalizeCurrencyInCV(out, detectedCurrency);
            console.debug(`[Polish 6b] Currency normalisation applied (target: ${detectedCurrency}).`);
        } catch (e) {
            console.debug('[Polish 6b] Currency normalisation skipped (non-fatal):', e);
        }
    }

    // 7. Telemetry / leak reporting hook (caller owns what to do with the report).
    if (onPurifyReport) {
        try {
            await onPurifyReport(purified.report);
        } catch (e) {
            console.debug('[Polish] onPurifyReport hook failed (non-fatal):', e);
        }
    }
    // 7b. UI leak-summary callback — called once with a digest so the UI can
    //     show the user exactly what was caught and fixed without needing the
    //     full raw PurifyReport.
    if (onLeakSummary) {
        try { onLeakSummary(buildLeakSummaryPayload(purified.report)); }
        catch (e) { console.debug('[Polish] onLeakSummary hook failed (non-fatal):', e); }
    }

    // 8. Phase E — Voice consistency enforcement (only when an engine brief
    //    is available; mutates `out` in place, with corrupt-metric revert).
    if (engineBrief && out.experience?.length) {
        try {
            _dispatchPolishStage('voice');
            const preVoiceCV: CVData = JSON.parse(JSON.stringify(out));
            await enforceVoiceConsistency(out, engineBrief);
            const voiceRevert = revertCorruptedMetrics(out, preVoiceCV);
            if (voiceRevert.reverted.length > 0) {
                console.warn(`[Polish] Voice enforcement reverted ${voiceRevert.reverted.length} corrupted-metric bullet(s):`, voiceRevert.reverted);
                out = voiceRevert.cv;
            }
            // ROOT-CAUSE FIX for the user's "KES ,000" / "% retention" /
            // "Re-framed" bullets: the voice-consistency LLM (worker AND its
            // Groq fallback) can introduce orphan-metric placeholders and
            // weird "Re-<verb>" openers when it rewrites bullets. The earlier
            // purifyCV call (step 6) already ran, so without a second purify
            // pass those new defects ship straight to the user. Re-running
            // purifyCV here is cheap (deterministic regex only) and idempotent.
            const repurified = purifyCV(out);
            out = repurified.cv;
            if (onPurifyReport && repurified.report.polishFixes > 0) {
                try { await onPurifyReport(repurified.report); }
                catch (e) { console.debug('[Polish] post-voice onPurifyReport hook failed (non-fatal):', e); }
            }
        } catch (e) {
            console.warn('[Polish] Voice enforcement skipped:', e);
        }
    }

    // 9. Final source-fidelity lock (no AI, deterministic).
    // Pass accumulated purifier warning count so logCvQualityReport can
    // include the style-issue penalty in the quality score (fixes 100/100
    // even when purifier flagged warnings that couldn't be auto-fixed).
    _dispatchPolishStage('finalizing');
    if ('profile' in finalize) {
        out = finalizeCvData(out, { profile: finalize.profile, runPurify: false, purifierWarnings: _purifyWarnings, reconciledSkills });
    } else {
        out = finalizeCvData(out, { sourceCv: finalize.sourceCv, runPurify: false, purifierWarnings: _purifyWarnings });
    }

    // 9.1. Remote KV banned-phrase deterministic strip.
    // Closes the gap between prompt-instruction enforcement (LLM is told to avoid
    // these phrases) and guaranteed cleanup (deterministic strip regardless of LLM
    // compliance). getCachedBannedPhrases() is already warm from the humanizer pass
    // so this adds ~0 ms latency. Wrapped in try/catch — never blocks generation.
    try {
        const remoteBanned = await getCachedBannedPhrases();
        if (remoteBanned && remoteBanned.length > 0) {
            const stripped = applyRemoteBannedPhrasesToCV(out, remoteBanned);
            out = stripped;
            console.debug(`[Polish 9.1] Remote banned-phrase strip applied (${remoteBanned.length} entries).`);
        }
    } catch (e) {
        console.debug('[Polish 9.1] Remote banned-phrase strip skipped (non-fatal):', e);
    }

    // 9.5. Universal AI summary repair — runs ONLY when the deterministic
    // audit at step 9 still flags issues in the professional summary (e.g.
    // an orphan stub that even tidyOrphanRemnants couldn't safely repair
    // without inventing facts). The model gets a locked whitelist of the
    // user's own numbers, so it cannot hallucinate figures. On any failure
    // (no profile, network down, model returns garbage) we silently keep
    // whatever finalizeCvData already produced — never blocks generation.
    try {
        const profileForRepair = ('profile' in finalize) ? finalize.profile : undefined;
        const auditedSummary = String((out as any).summary ?? '');
        if (auditedSummary) {
            const audit = _auditCvQuality(out as any);
            const hasSummaryIssues = audit.issues.some(i => i.where === 'summary');
            if (hasSummaryIssues) {
                const repaired = await _repairCvSummaryWithAi(out, profileForRepair);
                if (repaired && repaired.trim() && repaired.trim() !== auditedSummary.trim()) {
                    out = { ...out, summary: repaired.trim() } as CVData;
                    if (typeof console !== 'undefined') {
                        console.info('[Summary Repair] Applied AI rewrite to resolve audit-flagged issues.');
                    }
                }
            }
        }
    } catch (e) {
        if (typeof console !== 'undefined') {
            console.debug('[Summary Repair] step 9.5 skipped (non-fatal):', e);
        }
    }

    // 10. Pronoun safety net.
    out = fixPronounsInCV(out);

    // 10.5. Opener diversity enforcement — deterministic reshape (no AI cost).
    // Runs AFTER pronoun pass so it never interferes with verb-tense fixes.
    // Only restructures bullet bodies — never invents new facts.
    try {
        out = enforceOpenerDiversity(out);
    } catch (e) {
        console.debug('[Polish] Opener diversity pass skipped (non-fatal):', e);
    }

    // 11. Silent Quality Guardian — final sweep after all polish stages.
    // Re-runs the full validation engine and applies every deterministic fix
    // available. Unfixable issues (hollow bullets needing AI) are debug-logged
    // for telemetry only. Never surfaces anything to the user.
    try {
        const guardianBulletCount = engineBrief?.rhythm?.bullet_count as number | undefined;
        out = await _runSilentQualityGuardian(out, guardianBulletCount, carryProfile);
    } catch (e) {
        console.debug('[Guardian] Silent quality sweep skipped (non-fatal):', e);
    }

    return out;
}

// ── Leak-summary console reporter ──────────────────────────────────────────
// Called from improveCV and polishExistingCV via onPurifyReport so every
// auto-optimize run prints a structured summary of what was caught and fixed.
function logLeakSummary(report: PurifyReport, label: string): void {
    const leaks = report.leaks ?? [];
    const fixed   = leaks.filter(l => l.fixedBy && l.fixedBy !== 'none');
    const flagged = leaks.filter(l => !l.fixedBy || l.fixedBy === 'none');

    const instructionLeaks = fixed.filter(l => l.leakType === 'instruction_leak');
    const bannedFixed      = fixed.filter(l => l.leakType === 'banned_phrase');
    const tenseFixed       = fixed.filter(l => l.leakType === 'tense_mismatch');
    const polishFixed      = report.polishFixes ?? 0;
    const subsFixed        = report.substitutionsMade ?? 0;

    const totalFixed   = fixed.length;
    const totalFlagged = flagged.length;

    const hasAnything = totalFixed > 0 || totalFlagged > 0 || subsFixed > 0;
    if (!hasAnything) {
        console.info(`%c[ProCV Leak Guard — ${label}]%c No leaks detected ✓`, 'color:#16a34a;font-weight:bold', 'color:inherit');
        return;
    }

    console.groupCollapsed(
        `%c[ProCV Leak Guard — ${label}]%c ${totalFixed} fixed · ${totalFlagged} flagged`,
        'color:#d97706;font-weight:bold', 'color:inherit',
    );

    if (instructionLeaks.length > 0) {
        console.warn(`🚫 Instruction-leak preambles stripped (${instructionLeaks.length}):`);
        instructionLeaks.forEach(l =>
            console.warn(`   [${l.fieldLocation ?? 'unknown'}] pattern="${l.phrase}" → snippet: "${(l.contextSnippet ?? '').slice(0, 80)}…"`),
        );
    }
    if (bannedFixed.length > 0)
        console.info(`🔤 Banned-phrase substitutions: ${bannedFixed.length}`);
    if (tenseFixed.length > 0)
        console.info(`⏩ Tense corrections: ${tenseFixed.length}`);
    if (polishFixed > 0)
        console.info(`✨ Polish fixes (weak openers, first-person, etc.): ${polishFixed}`);
    if (subsFixed > 0 && subsFixed !== bannedFixed.length)
        console.info(`🔡 Total text substitutions: ${subsFixed}`);
    if (totalFlagged > 0) {
        console.warn(`⚠️ Flagged (not auto-fixed, review manually): ${totalFlagged}`);
        flagged.slice(0, 5).forEach(l =>
            console.warn(`   [${l.leakType}] ${l.phrase ?? ''} @ ${l.fieldLocation ?? 'unknown'}`),
        );
        if (totalFlagged > 5) console.warn(`   … and ${totalFlagged - 5} more`);
    }

    console.groupEnd();
}

// --- Polish-only (no Groq rewrite) -----------------------------------------
// Runs the shared post-generation polish chain on an existing CV WITHOUT
// re-asking Groq to rewrite anything. Useful when the user already likes
// the wording but wants the latest banned-phrase rules, humanizer, and
// deterministic purification re-applied. Costs ~one CF Workers AI call
// (the humanizer) — no Groq tokens.
export const polishExistingCV = async (
    cvDataInput: CVData,
    onLeakSummary?: (s: LeakSummaryPayload) => void,
): Promise<CVData> => {
    const cvData = purifyInboundCV(cvDataInput);
    return runQualityPolishPasses(cvData, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvDataInput },
        finalize: { sourceCv: cvDataInput },
        onPurifyReport: (report) => logLeakSummary(report, 'Polish'),
        ...(onLeakSummary ? { onLeakSummary } : {}),
    });
};

// --- AI CV Improvement ---
export const improveCV = async (
    cvDataInput: CVData,
    personalInfo: PersonalInfo,
    instruction: string,
    jobDescription?: string,
    onLeakSummary?: (s: LeakSummaryPayload) => void,
    onProgress?: (stage: 'analysing' | 'improving' | 'polishing') => void,
): Promise<CVData> => {
    onProgress?.('analysing');
    // ── HOT FIRE (inbound) ── scrub before serializing into the prompt
    const cvData = purifyInboundCV(cvDataInput);
    const cvJson = JSON.stringify(cvData, null, 2);

    const prompt = `
You are an elite CV writer. The user wants to improve their CV. Apply the instruction below and return the COMPLETE improved CVData JSON.

INSTRUCTION: "${instruction}"

CURRENT CV DATA (JSON):
${cvJson}

CANDIDATE NAME: ${personalInfo.name}
${jobDescription ? `TARGET JOB DESCRIPTION:\n${jobDescription}` : ''}

Rules:
1. Apply the instruction precisely.
2. Keep all factual details accurate — don't change company names, job titles, or invent new roles. You MAY add missing dates where a role has an empty or blank "dates" field; infer the approximate period from surrounding roles or education year.
3. Return the COMPLETE CVData object with ALL fields, not just the modified parts.
4. Bullets follow "Strong Verb → Scope → Result". Only ~50–60% should carry a metric — leave some qualitative.
5. LANGUAGE: Write like a confident working professional, not an AI. Use plain, direct language. Do NOT upgrade vocabulary to formal or academic register. Do NOT use words like "spearheaded", "leveraged", "synergized", "utilized", "facilitated", "orchestrated", "catalyzed", "ideated", or any elevated corporate-speak. The final text should sound like a real person wrote it in their own voice.
6. NEVER output reasoning, notes, or internal commentary into any CV field. CV fields must contain ONLY professional CV content a human would write themselves. Forbidden outputs in any field: "Years is not present", "Note:", "Based on the profile", "The candidate has/lacks", "As instructed", "Since no dates are provided", "[Internal]", or any other reasoning/assessment. If information is missing, simply write the best CV content you can from what is available — do NOT annotate the absence.
7. TENSE: current role (endDate "Present") bullets use bare present tense verbs (Manage, Lead, Build — NOT "Manages", "Leads", "Builds"). All past roles use past tense (Managed, Led, Built).
8. SCOPE ANCHOR: the FIRST bullet of every role must state team size, budget, geographic scope, or project count — not an achievement. Use only real numbers from the candidate's profile. Example structure (not literal values): "Oversee a portfolio of [N] projects across [region], coordinating a [N]-person field team." ← replace [N]/[region] with REAL profile data.
9. OPENER ROTATION: Use all 7 opener types across each role — no single type may appear more than twice per role. The 7 types: (1) verb — "Manage a team…", "Built a pipeline…"; (2) number — "[N] projects delivered…"; (3) scope — "Across [N] regions…"; (4) context — "As the sole engineer…"; (5) timeframe — "In [quarter/year]…"; (6) collaboration — "With the operations team…"; (7) outcome — "Top performer in…". Replace [N] with REAL profile values. Roles with 5+ bullets must include at least 3 different opener types.
10. NO EM DASH AS SEPARATOR: never write "verb X—noun Y" inside a bullet. Use a comma or semicolon instead.
11. NO DUPLICATE VERB STARTERS: no two bullets across the entire document may begin with the same verb stem.
12. EDUCATION — degree, school, and year are LOCKED (return them exactly as received, character for character). You MAY rewrite the description field as one concise sentence — but do NOT exaggerate, invent modules, or claim qualifications not in the source data. If no JD is provided, keep the description exactly as received.
13. REPEATED PHRASES: Scan all bullets across all roles. If the same phrase of 4+ words appears in more than one bullet, rewrite the second occurrence to use different wording while preserving the meaning. No phrase should appear twice in the experience section.
14. SUMMARY ECHO: If a phrase from the professional summary is also used verbatim in a bullet, rephrase the bullet. The summary and bullets must complement each other, not repeat the same words.
15. EXAMPLE DATA: Any [N], [region], or example structures in these rules are placeholder templates. Do NOT copy them into the output. Every number and claim must come from the candidate's actual profile data.

${HUMANIZATION_CHECKLIST}

${CV_DATA_SCHEMA}
`;

    onProgress?.('improving');
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.4, json: true });
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as CVData;

    onProgress?.('polishing');
    // Run the quality polish chain (deterministic passes only — no humanizer).
    // The main groqChat prompt above already applies every humanizer fix
    // (banned phrases, tense, verb starters, rhythm, scope anchors, etc.)
    // so running the humanizer again is redundant and adds 20-40 s of latency.
    // The fast deterministic passes (purifyCV, bullet count, finalize, pronoun fix)
    // still run to catch anything slipping through.
    return runQualityPolishPasses(parsed, {
        runHumanizer: false,
        bulletCount: { type: 'preserve-cv', sourceCv: cvDataInput },
        finalize: { sourceCv: cvDataInput },
        onPurifyReport: (report) => logLeakSummary(report, 'Auto Optimize'),
        ...(onLeakSummary ? { onLeakSummary } : {}),
    });
};

// --- GitHub-Powered CV Generation ---

export interface GitHubRepoForCV {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    homepage: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    topics: string[];
    updated_at: string;
}

export const generateCVFromGitHub = async (
    repos: GitHubRepoForCV[],
    profileInput: UserProfile,
    githubUsername: string,
    jobDescription?: string
): Promise<CVData> => {
    // ── HOT FIRE (inbound) ── scrub profile before prompt assembly
    const profile = purifyProfile(profileInput);
    const repoSummaries = repos.map(r => ({
        name: r.name,
        description: r.description || '',
        url: r.html_url,
        live: r.homepage || '',
        language: r.language || '',
        topics: r.topics,
        stars: r.stargazers_count,
        forks: r.forks_count,
        updated: r.updated_at.split('T')[0],
    }));

    const allLanguages = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[];
    const allTopics = [...new Set(repos.flatMap(r => r.topics))];

    const jdSection = jobDescription?.trim()
        ? `\nTARGET JOB DESCRIPTION:\n${jobDescription.trim()}\n\nTailor every bullet, skill, and project description to this role. Mirror the exact language from the JD.`
        : '\nNo specific JD provided. Write a strong general-purpose software engineering CV.';

    const prompt = `
You are an elite CV strategist specializing in software engineers. Your task is to generate the absolute best CV for a developer whose actual work is visible on GitHub.

GITHUB USERNAME: ${githubUsername}
GITHUB PROFILE URL: https://github.com/${githubUsername}

GITHUB REPOSITORIES (${repos.length} repos — these are the candidate's REAL projects):
${JSON.stringify(repoSummaries, null, 2)}

DETECTED LANGUAGES: ${allLanguages.join(', ')}
DETECTED TOPICS/FRAMEWORKS: ${allTopics.join(', ')}

USER PROFILE (existing data):
${compactProfile(profile)}
${jdSection}

=== INSTRUCTIONS ===

1. **SUMMARY (3 sentences)**:
   - Position the candidate as a skilled developer based on what their GitHub actually shows.
   - Reference their strongest languages and most impressive projects by name.

2. **EXPERIENCE**: Transform each work experience into high-impact bullets.
   - Use EXACTLY ${profile.workExperience.map(we => `${we.pointCount ?? 5} bullets for ${we.jobTitle} at ${we.company}`).join(', ')}.
   - Start every bullet with a power verb. Quantify impact.

3. **PROJECTS** — CRITICAL: Use ONLY projects from the GitHub repos above.
   - For each selected repo, write a 1–2 sentence description: WHAT it does, WHY it matters, WHAT tech stack.
   - ALWAYS include the real GitHub URL (html_url) or live URL (homepage if available) as the link.
   - Prioritize repos by: stars, recency, complexity, and relevance to the JD.
   - Include at least ${Math.min(repos.length, 6)} projects.
   - DO NOT invent project links — use the exact URLs provided.

4. **SKILLS**: Extract EXACTLY 15 skills from the actual repo languages and topics.

5. **EDUCATION**: Use the profile's education data.

HUMANIZATION RULES:
- Every bullet: Strong Verb → Specific Action → Measurable Result.
- Mix sentence lengths. No AI clichés. Be concrete and specific.

${CV_DATA_SCHEMA}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 8192 });
    const parsed = JSON.parse(text.trim()) as CVData;
    // Unified post-gen pipeline + deterministic source lock
    return finalizeCvData(parsed, { profile });
};

// --- Enhanced 6-Block Job Analysis (career-ops inspired) ---
// Strips markdown fences, uses bracket-depth scanning to find the exact closing
// brace of the outermost JSON object (handles prose/extra-content after the JSON,
// even when that prose contains its own `}` characters), and falls back to a
// backwards-walk repair for truncated responses.
const extractAndRepairJson = (raw: string): string => {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Step 1: try the whole stripped string as-is
    try { JSON.parse(stripped); return stripped; } catch {}

    const start = stripped.indexOf('{');
    if (start === -1) return stripped;

    // Step 2: bracket-depth scan — correctly handles nested objects AND extra
    // text after the JSON that happens to contain `}` characters
    let depth = 0;
    let inString = false;
    let escaping = false;
    let matchEnd = -1;
    for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i];
        if (escaping) { escaping = false; continue; }
        if (ch === '\\' && inString) { escaping = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { matchEnd = i; break; } }
    }
    if (matchEnd !== -1) {
        const candidate = stripped.slice(start, matchEnd + 1);
        try { JSON.parse(candidate); return candidate; } catch {}
    }

    // Step 3: backwards-walk repair — handles truncated responses where the
    // model hit the token limit mid-object
    const lastEnd = stripped.lastIndexOf('}');
    if (lastEnd > start) {
        for (let i = lastEnd; i >= start; i--) {
            if (stripped[i] === '}') {
                const repaired = stripped.slice(start, i + 1);
                try { JSON.parse(repaired); return repaired; } catch {}
            }
        }
    }

    return stripped;
};

export const analyzeJobEnhanced = async (
    jobDescription: string,
    cvText: string,
): Promise<EnhancedJobAnalysis> => {
    // ── Compact prompt — reduced from ~900 to ~500 tokens input ──────────────
    // JD capped at 2000 chars, CV at 1800. Array caps reduce output by ~55%.
    const prompt = `You are a career strategist. Analyze this job description vs the candidate CV and return a JSON evaluation.

JOB DESCRIPTION:
${jobDescription.substring(0, 2000)}

CANDIDATE CV:
${cvText.substring(0, 1800)}

Return ONLY valid JSON (no markdown, no prose):
{
  "companyName": "string or 'Unknown'",
  "jobTitle": "string",
  "archetype": "Full-Stack / Dev Engineer | Solutions Architect | Product Manager | LLMOps / MLOps | Agentic AI | Digital Transformation | Data Scientist | DevOps / Platform | General Engineering | Other",
  "domain": "e.g. 'Cloud Infrastructure'",
  "seniority": "e.g. 'Senior'",
  "remote": "Remote | Hybrid | On-site | Unknown",
  "tldr": "1-sentence role summary",
  "matchedRequirements": ["up to 6 JD requirements clearly met by the CV"],
  "gaps": [{"requirement":"string","isBlocker":true/false,"mitigation":"actionable advice"} — up to 4 items],
  "matchScore": 0-100,
  "grade": "A|B|C|D|F",
  "levelStrategy": "2 sentences on seniority positioning",
  "seniorPositioningTips": ["3 specific phrases to appear more senior"],
  "salaryRange": "e.g. '$120k–$160k USD'",
  "salaryNotes": "brief comp/negotiation note",
  "personalizationChanges": [{"section":"Summary|Skills|Experience|Projects","currentState":"string","proposedChange":"string","reason":"string"} — up to 3 items],
  "topKeywords": ["10-12 ATS keywords from the JD"],
  "starStories": [{"jobRequirement":"string","linkedCompany":"string","linkedRole":"string","situation":"string","task":"string","action":"string","result":"string","reflection":"seniority signal"} — up to 3 items]
}

Grade: 85-100=A, 70-84=B, 55-69=C, 40-54=D, 0-39=F. Only use experience present in the CV.`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.3, json: true, maxTokens: 3500 });

    try {
        return JSON.parse(extractAndRepairJson(text)) as EnhancedJobAnalysis;
    } catch (firstErr) {
        console.warn('[Deep Job Analysis] JSON parse failed on first attempt, retrying…', firstErr);
        const retry = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 3500 });
        return JSON.parse(extractAndRepairJson(retry)) as EnhancedJobAnalysis;
    }
};
