/**
 * profileIntelligenceAudit.ts
 *
 * Profile Intelligence Audit — zero LLM, pure deterministic.
 *
 * The orchestration layer that was missing.
 *
 * Runs immediately after:
 *   - CV import
 *   - Manual profile creation
 *   - LinkedIn import
 *   - Profile edit (debounced, ~2s after last keystroke)
 *
 * Calls all existing scoring services in parallel and produces a
 * unified ProfileIntelligenceReport with reusable signals:
 *
 *   career_stage          — inferred seniority tier + total months
 *   profile_completeness  — 0–100 field coverage score
 *   achievement_density   — 0–100 bullet quality score
 *   leadership_score      — 0–100 leadership evidence score
 *   skill_evidence_score  — 0–100 skills-vs-bullets match
 *   underselling_risk     — 'high' | 'medium' | 'low' | 'none'
 *   employment_gap        — detected gaps > 3 months
 *   career_progression    — 'strong' | 'steady' | 'lateral' | 'unclear'
 *   career_track          — ontology-aware track detection (uses careerTrackClassifier)
 *   recommendations       — prioritised list of actionable nudges
 *
 * Design rules:
 *   - Pure, synchronous, zero AI cost, zero network calls.
 *   - Never modifies the profile or CV. Detect-only.
 *   - Never throws — full try/catch at the top level.
 *   - Results are cacheable in localStorage (30 min TTL).
 *
 * Core philosophy: Discover → Reveal → Strengthen. Never Invent.
 */

import type { CVData, UserProfile, WorkExperience } from '../types';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import type { CompletenessResult } from '../utils/cvCompleteness';
import { scoreAchievementDensity } from './cvAchievementDensity';
import type { AchievementDensityReport } from './cvAchievementDensity';
import { scoreEvidenceStrength } from './cvEvidenceScore';
import type { EvidenceScoreReport } from './cvEvidenceScore';
import { auditSeniorityCoherence, inferCareerProfile } from './cvSeniorityCoherence';
import type { SeniorityCoherenceReport, CareerProfile, SeniorityTier } from './cvSeniorityCoherence';
import { scoreMetricStrength } from './cvMetricStrength';
import type { MetricStrengthReport } from './cvMetricStrength';
import { buildCareerTrack, getFieldDistance, describeTrack, trackRoomRecommendation } from './careerTrackClassifier';
import type { CareerTrack, FieldDistance } from './careerTrackClassifier';

export type { CareerTrack, FieldDistance };

// ─── Public types ─────────────────────────────────────────────────────────────

export type UndersellRisk = 'high' | 'medium' | 'low' | 'none';
export type CareerProgressionKind = 'strong' | 'steady' | 'lateral' | 'unclear';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationCategory =
  | 'achievement_density'
  | 'leadership_evidence'
  | 'skill_evidence'
  | 'profile_completeness'
  | 'career_room'
  | 'employment_gap'
  | 'metric_quality'
  | 'underselling';

export interface EmploymentGap {
  fromRole: string;
  toRole: string;
  gapMonths: number;
  startApprox: string;
  endApprox: string;
}

export interface LeadershipReport {
  score: number;
  signalCount: number;
  managerialTitleWithoutEvidence: boolean;
  signals: Array<{ signal: string; context: string }>;
}

export interface Recommendation {
  id: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  title: string;
  detail: string;
  action: string;
  targetView?: string;
}

export interface ProfileIntelligenceReport {
  career_stage:             SeniorityTier;
  total_experience_months:  number;
  profile_completeness:     number;
  achievement_density:      number;
  leadership_score:         number;
  skill_evidence_score:     number;
  metric_strength:          number;
  underselling_risk:        UndersellRisk;
  employment_gap_detected:  boolean;
  career_progression:       CareerProgressionKind;

  completeness:  CompletenessResult;
  density:       AchievementDensityReport;
  evidence:      EvidenceScoreReport;
  seniority:     SeniorityCoherenceReport;
  metrics:       MetricStrengthReport;
  leadership:    LeadershipReport;
  gaps:          EmploymentGap[];
  career_track:  CareerTrack;

  recommendations: Recommendation[];

  durationMs:   number;
  generatedAt:  number;
}

// ─── Leadership score ─────────────────────────────────────────────────────────

const LEADERSHIP_TITLE_RX =
  /\b(manager|director|head|lead|supervisor|vp|vice president|chief|coo|ceo|cto|cfo|president|principal|team lead|people manager)\b/i;

const LEADERSHIP_EVIDENCE_RX =
  /\b(managed|led|supervised|directed|mentored|coached|hired|built.*team|grew.*team|team of \d|staff of \d|\d+\s*(?:direct\s*reports?|FTEs?|staff)|oversee|oversaw|reported to|line managed|performance review|developed talent|trained staff)\b/i;

function scoreLeadership(
  profile: UserProfile,
  lockedSignals: Array<{ signal: string; context: string }>,
): LeadershipReport {
  const signals = [...lockedSignals];
  let signalCount = signals.length;
  let managerialTitleWithoutEvidence = false;

  for (const role of profile.workExperience ?? []) {
    const isManagerialTitle      = LEADERSHIP_TITLE_RX.test(role.jobTitle);
    const hasLeadershipEvidence  = LEADERSHIP_EVIDENCE_RX.test(role.responsibilities || '');

    const evidenceMatches = (role.responsibilities || '').match(LEADERSHIP_EVIDENCE_RX);
    if (evidenceMatches) {
      evidenceMatches.forEach(match => {
        const key = match.toLowerCase().slice(0, 30);
        if (!signals.some(s => s.signal.toLowerCase().includes(key))) {
          signalCount++;
          signals.push({ signal: match.trim(), context: `${role.jobTitle} @ ${role.company}` });
        }
      });
    }

    if (isManagerialTitle && !hasLeadershipEvidence && !lockedSignals.length) {
      managerialTitleWithoutEvidence = true;
    }
  }

  const lockedWeight = Math.min(lockedSignals.length * 25, 75);
  const rawWeight    = Math.min((signalCount - lockedSignals.length) * 10, 25);
  const score        = Math.min(100, lockedWeight + rawWeight);

  return { score, signalCount, managerialTitleWithoutEvidence, signals };
}

// ─── Employment gap detector ──────────────────────────────────────────────────

function parseToDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const lower = dateStr.toLowerCase().trim();
  if (lower === 'present' || lower === 'current' || lower === '') return new Date();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function approximateMonth(date: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function detectEmploymentGaps(experience: WorkExperience[]): EmploymentGap[] {
  if (!experience || experience.length < 2) return [];

  const parsed = experience
    .map(e => ({
      title: `${e.jobTitle}${e.company ? ` @ ${e.company}` : ''}`,
      start: parseToDate(e.startDate),
      end:   parseToDate(e.endDate || 'Present'),
    }))
    .filter(e => e.start !== null)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());

  const gaps: EmploymentGap[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const curr = parsed[i];
    if (!prev.end || !curr.start) continue;

    const gapMs     = curr.start.getTime() - prev.end.getTime();
    const gapMonths = Math.round(gapMs / (1000 * 60 * 60 * 24 * 30.44));

    if (gapMonths >= 3) {
      gaps.push({
        fromRole:    prev.title,
        toRole:      curr.title,
        gapMonths,
        startApprox: approximateMonth(prev.end),
        endApprox:   approximateMonth(curr.start),
      });
    }
  }

  return gaps;
}

// ─── Career progression classifier ───────────────────────────────────────────

function classifyCareerProgression(careerProfile: CareerProfile): CareerProgressionKind {
  const { roles, totalMonths } = careerProfile;
  if (!roles || roles.length === 0) return 'unclear';

  const tierRank: Record<string, number> = {
    intern: 1, junior: 2, mid: 3, senior: 4, lead: 5, executive: 6,
  };

  const tiers = roles.map((r: any) => r.tier);
  let ascending = 0;
  let lateral   = 0;

  for (let i = 1; i < tiers.length; i++) {
    const prev = tierRank[tiers[i - 1]] ?? 3;
    const curr = tierRank[tiers[i]] ?? 3;
    if (curr > prev) ascending++;
    else if (curr === prev) lateral++;
  }

  const totalTransitions = roles.length - 1;
  if (totalTransitions === 0) return 'unclear';

  const ascendingRatio = ascending / totalTransitions;
  if (ascendingRatio >= 0.6) return 'strong';
  if (ascendingRatio >= 0.3 || totalMonths >= 60) return 'steady';
  if (lateral / totalTransitions >= 0.5) return 'lateral';
  return 'unclear';
}

// ─── Underselling risk ────────────────────────────────────────────────────────

function computeUndersellRisk(
  totalMonths:    number,
  densityScore:   number,
  totalBullets:   number,
  roleCount:      number,
  leadership:     LeadershipReport,
  careerStage:    SeniorityTier,
): UndersellRisk {
  let riskPoints = 0;

  const yearsExp = totalMonths / 12;

  if (yearsExp >= 8 && densityScore < 30)      riskPoints += 4;
  else if (yearsExp >= 5 && densityScore < 40)  riskPoints += 3;
  else if (yearsExp >= 3 && densityScore < 25)  riskPoints += 2;
  else if (yearsExp >= 2 && densityScore < 20)  riskPoints += 1;

  const avgBulletsPerRole = roleCount > 0 ? totalBullets / roleCount : 0;
  if (avgBulletsPerRole < 2 && yearsExp >= 3)  riskPoints += 2;
  else if (avgBulletsPerRole < 3 && yearsExp >= 5) riskPoints += 1;

  if (leadership.managerialTitleWithoutEvidence) riskPoints += 2;

  const seniorTiers: SeniorityTier[] = ['senior', 'lead', 'executive'];
  if (seniorTiers.includes(careerStage) && leadership.score < 25) riskPoints += 2;

  if (riskPoints >= 5) return 'high';
  if (riskPoints >= 3) return 'medium';
  if (riskPoints >= 1) return 'low';
  return 'none';
}

// ─── Recommendation builder ───────────────────────────────────────────────────

function buildRecommendations(
  report: Omit<ProfileIntelligenceReport, 'recommendations' | 'durationMs' | 'generatedAt'>,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (report.underselling_risk === 'high') {
    recs.push({
      id: 'undersell_high', priority: 'critical', category: 'underselling',
      title: 'Your profile significantly under-represents your experience',
      detail: `You have ${Math.round(report.total_experience_months / 12)} years of experience but your bullets don't reflect it. Recruiters may assume you're more junior than you are.`,
      action: 'Expand your experience bullets', targetView: 'profile',
    });
  } else if (report.underselling_risk === 'medium') {
    recs.push({
      id: 'undersell_medium', priority: 'high', category: 'underselling',
      title: 'Your profile may be under-selling your experience',
      detail: `Your ${Math.round(report.total_experience_months / 12)} years of experience deserves stronger evidence. Add measurable outcomes to your key roles.`,
      action: 'Add achievements to experience', targetView: 'profile',
    });
  }

  if (report.leadership.managerialTitleWithoutEvidence) {
    recs.push({
      id: 'leadership_no_evidence', priority: 'critical', category: 'leadership_evidence',
      title: 'Managerial title with no leadership evidence',
      detail: 'Your job title suggests leadership responsibilities, but your bullets contain no team sizes, reporting lines, or management outcomes. Recruiters will question the title.',
      action: 'Add team size and leadership outcomes', targetView: 'profile',
    });
  } else if (report.leadership_score < 30 && ['lead', 'executive', 'senior'].includes(report.career_stage)) {
    recs.push({
      id: 'leadership_weak', priority: 'high', category: 'leadership_evidence',
      title: 'Leadership evidence is thin for your career level',
      detail: 'Senior profiles need leadership signals — team sizes, mentoring, decision scope, budget ownership. Add at least 2 specific examples.',
      action: 'Add leadership examples', targetView: 'profile',
    });
  }

  if (report.achievement_density < 30) {
    recs.push({
      id: 'density_weak', priority: 'high', category: 'achievement_density',
      title: 'Most bullets describe duties, not achievements',
      detail: `Only ${report.density.achievementCount} of ${report.density.totalBullets} bullets show measurable outcomes. Recruiters expect proof of impact, not lists of responsibilities.`,
      action: 'Rewrite duty bullets as achievements', targetView: 'score',
    });
  } else if (report.achievement_density < 50) {
    recs.push({
      id: 'density_moderate', priority: 'medium', category: 'achievement_density',
      title: 'Achievement density could be stronger',
      detail: `${report.density.dutyCount} of your bullets still read as responsibilities. Target 60%+ achievement bullets for senior applications.`,
      action: 'Improve bullet quality', targetView: 'score',
    });
  }

  if (report.skill_evidence_score < 40) {
    const mentionedOnly = report.evidence.skills.filter(s => s.level === 'mentioned').length;
    recs.push({
      id: 'skill_evidence_weak', priority: 'high', category: 'skill_evidence',
      title: `${mentionedOnly} skills are listed but not demonstrated`,
      detail: 'Skills that never appear in your experience bullets look like padding to recruiters and ATS systems. Show where you actually used them.',
      action: 'Add skills to experience bullets', targetView: 'profile',
    });
  }

  if (report.profile_completeness < 50) {
    recs.push({
      id: 'completeness_low', priority: 'high', category: 'profile_completeness',
      title: 'Profile is incomplete — CV quality will suffer',
      detail: `Missing: ${report.completeness.missing.slice(0, 4).join(', ')}${report.completeness.missing.length > 4 ? ` and ${report.completeness.missing.length - 4} more` : ''}.`,
      action: 'Complete your profile', targetView: 'profile',
    });
  } else if (report.profile_completeness < 75) {
    recs.push({
      id: 'completeness_partial', priority: 'medium', category: 'profile_completeness',
      title: 'Profile has gaps that limit CV quality',
      detail: `Still missing: ${report.completeness.missing.slice(0, 3).join(', ')}.`,
      action: 'Fill missing profile fields', targetView: 'profile',
    });
  }

  if (report.gaps.length > 0) {
    const largest = report.gaps.reduce((max, g) => g.gapMonths > max.gapMonths ? g : max, report.gaps[0]);
    recs.push({
      id: 'gap_detected', priority: 'medium', category: 'employment_gap',
      title: `Employment gap detected (${largest.gapMonths} months)`,
      detail: `There's a ${largest.gapMonths}-month gap between "${largest.fromRole}" and "${largest.toRole}" (${largest.startApprox} – ${largest.endApprox}). ProCV can help frame this in your CV summary.`,
      action: 'Address in your CV summary', targetView: 'generate',
    });
  }

  const roomRec = trackRoomRecommendation(report.career_track);
  if (roomRec.shouldRecommend) {
    const targetLabel = report.career_track.segments
      .filter(s => s.field !== null)
      .at(-1)?.fieldLabel ?? 'target field';
    recs.push({
      id: 'career_room_new', priority: 'medium', category: 'career_room',
      title: `Consider a dedicated career room for ${targetLabel}`,
      detail: roomRec.reason,
      action: 'Create a new career room', targetView: 'profile',
    });
  }

  if (report.career_track.hasUnclassifiedRoles && report.career_track.unclassifiedTitles.length > 0) {
    const examples = report.career_track.unclassifiedTitles.slice(0, 2).join(', ');
    recs.push({
      id: 'unclassified_roles', priority: 'low', category: 'profile_completeness',
      title: `We couldn't classify ${report.career_track.unclassifiedTitles.length} role(s)`,
      detail: `Titles like "${examples}" didn't match our field ontology. Select your field manually in Profile settings to get better analysis.`,
      action: 'Set your field manually', targetView: 'profile',
    });
  }

  if (report.metric_strength < 30 && report.achievement_density > 40) {
    recs.push({
      id: 'metric_weak', priority: 'low', category: 'metric_quality',
      title: 'Your numbers are there but could be stronger',
      detail: 'Before/after comparisons (e.g. "from 3 days to 4 hours") and revenue/cost figures score highest with recruiters.',
      action: 'Strengthen your metrics', targetView: 'score',
    });
  }

  const priorityOrder: Record<RecommendationPriority, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}

// ─── Empty fallbacks ──────────────────────────────────────────────────────────

const EMPTY_CV: CVData = {
  summary: '', experience: [], education: [], skills: [], projects: [], languages: [],
} as unknown as CVData;

const EMPTY_PROFILE: UserProfile = {
  personalInfo: { name: '', email: '', phone: '', location: '' } as any,
  summary: '', workExperience: [], education: [], skills: [],
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function runProfileIntelligenceAudit(
  profile:       UserProfile | null,
  cv:            CVData | null,
  lockedSignals: Array<{ signal: string; context: string }> = [],
): ProfileIntelligenceReport {
  const t0 = Date.now();

  const safeProfile = profile ?? EMPTY_PROFILE;
  const safeCV      = cv      ?? EMPTY_CV;

  try {
    const completeness  = scoreCVCompleteness(safeCV, safeProfile);
    const density       = scoreAchievementDensity(safeCV);
    const evidence      = scoreEvidenceStrength(safeCV);
    const seniority     = auditSeniorityCoherence(safeCV);
    const careerProfile = inferCareerProfile(safeCV);
    const metrics       = scoreMetricStrength(safeCV);
    const leadership    = scoreLeadership(safeProfile, lockedSignals);
    const gaps          = detectEmploymentGaps(safeProfile.workExperience ?? []);
    const career_track  = buildCareerTrack(safeProfile.workExperience ?? []);
    const progression   = classifyCareerProgression(careerProfile);

    const underselling = computeUndersellRisk(
      careerProfile.totalMonths,
      density.score,
      density.totalBullets,
      safeProfile.workExperience?.length ?? 0,
      leadership,
      careerProfile.tier,
    );

    const partial = {
      career_stage:            careerProfile.tier,
      total_experience_months: careerProfile.totalMonths,
      profile_completeness:    completeness.percent,
      achievement_density:     density.score,
      leadership_score:        leadership.score,
      skill_evidence_score:    evidence.score,
      metric_strength:         metrics.score,
      underselling_risk:       underselling,
      employment_gap_detected: gaps.length > 0,
      career_progression:      progression,
      completeness,
      density,
      evidence,
      seniority,
      metrics,
      leadership,
      gaps,
      career_track,
    };

    const recommendations = buildRecommendations(partial);

    return {
      ...partial,
      recommendations,
      durationMs:  Date.now() - t0,
      generatedAt: Math.floor(Date.now() / 1000),
    };

  } catch (err) {
    console.error('[ProfileIntelligenceAudit] Audit failed:', err);

    const fallback = scoreCVCompleteness(safeCV, safeProfile);
    return {
      career_stage:            'mid',
      total_experience_months: 0,
      profile_completeness:    fallback.percent,
      achievement_density:     0,
      leadership_score:        0,
      skill_evidence_score:    0,
      metric_strength:         0,
      underselling_risk:       'none',
      employment_gap_detected: false,
      career_progression:      'unclear',
      completeness:            fallback,
      density:                 scoreAchievementDensity(EMPTY_CV),
      evidence:                scoreEvidenceStrength(EMPTY_CV),
      seniority:               auditSeniorityCoherence(EMPTY_CV),
      metrics:                 scoreMetricStrength(EMPTY_CV),
      leadership:              { score: 0, signalCount: 0, managerialTitleWithoutEvidence: false, signals: [] },
      gaps:                    [],
      career_track:            buildCareerTrack([]),
      recommendations:         [],
      durationMs:              Date.now() - t0,
      generatedAt:             Math.floor(Date.now() / 1000),
    };
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const AUDIT_CACHE_TTL_S = 60 * 30;

export function getAuditCacheKey(slotId: string): string {
  return `procv:profile_audit:${slotId}`;
}

export function saveAuditToLocalStorage(slotId: string, report: ProfileIntelligenceReport): void {
  try { localStorage.setItem(getAuditCacheKey(slotId), JSON.stringify(report)); }
  catch { /* storage full — non-fatal */ }
}

export function loadAuditFromLocalStorage(slotId: string): ProfileIntelligenceReport | null {
  try {
    const raw = localStorage.getItem(getAuditCacheKey(slotId));
    if (!raw) return null;
    const report = JSON.parse(raw) as ProfileIntelligenceReport;
    if (Math.floor(Date.now() / 1000) - report.generatedAt > AUDIT_CACHE_TTL_S) return null;
    return report;
  } catch { return null; }
}

export function clearAuditCache(slotId: string): void {
  try { localStorage.removeItem(getAuditCacheKey(slotId)); } catch { /* non-fatal */ }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function undersellRiskLabel(risk: UndersellRisk): string {
  switch (risk) {
    case 'high':   return 'Under-selling your experience';
    case 'medium': return 'Could present stronger';
    case 'low':    return 'Profile well-represented';
    case 'none':   return 'Presenting at full strength';
  }
}

export function undersellRiskColor(risk: UndersellRisk): string {
  switch (risk) {
    case 'high':   return '#dc2626';
    case 'medium': return '#d97706';
    case 'low':    return '#16a34a';
    case 'none':   return '#16a34a';
  }
}

export { describeTrack, trackRoomRecommendation, getFieldDistance };
