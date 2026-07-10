/**
 * profileIntelligenceScore.ts
 *
 * Composite 0-100 "Profile Intelligence Score" that surfaces how production-
 * ready a CV is across five dimensions:
 *
 *   Completeness      (25%) — key fields are filled in
 *   Achievement Density (25%) — bullets have measurable wins
 *   Number Fidelity   (20%) — metrics are grounded, not hallucinated
 *   Voice Quality     (15%) — no first-person, no AI tells
 *   ATS Coverage      (15%) — JD keyword / skills overlap
 *
 * All computation is deterministic + synchronous (zero LLM calls).
 */

import type { CVData, UserProfile } from '../types';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import { auditCvQuality } from './cvNumberFidelity';
import { auditCvVoice } from './cvVoiceFidelity';
import { scoreAtsCoverage } from './cvAtsKeywords';

export type IntelligenceGrade = 'weak' | 'fair' | 'good' | 'strong' | 'excellent';

export interface IntelligenceComponent {
  label: string;
  score: number;    // 0-100
  weight: number;   // display weight (not the decimal multiplier)
  tip: string;
  color: 'red' | 'amber' | 'yellow' | 'blue' | 'emerald' | 'gold';
}

export interface IntelligenceScore {
  total: number;          // 0-100 final weighted score
  grade: IntelligenceGrade;
  hasJd: boolean;         // true = ATS component used real JD keywords
  components: [
    IntelligenceComponent,  // completeness
    IntelligenceComponent,  // achievement density
    IntelligenceComponent,  // number fidelity
    IntelligenceComponent,  // voice quality
    IntelligenceComponent,  // ats coverage
  ];
  improvements: string[];  // up to 4 prioritised actions
  strengths: string[];     // what's already good
}

function componentColor(score: number): IntelligenceComponent['color'] {
  if (score >= 85) return 'emerald';
  if (score >= 70) return 'blue';
  if (score >= 55) return 'yellow';
  if (score >= 35) return 'amber';
  return 'red';
}

export function computeIntelligenceScore(
  cv: CVData | null,
  profile: UserProfile | null,
  jobDescription?: string,
): IntelligenceScore {

  // ── 0. Empty-CV guard ──────────────────────────────────────────────────────
  // A CV with no summary, no experience, no skills, and no education has
  // nothing for the fidelity/voice/ATS auditors to actually assess. The
  // components below used to fall back to "neutral" defaults (75/100/15+) in
  // that case, which made an entirely empty CV show a deceptively high,
  // seemingly hard-coded score (e.g. ~55-60%) instead of ~0%. Those defaults
  // are appropriate for "has some content but nothing flagged as bad" — they
  // are wrong for "there is no content to judge at all". Detect that case
  // explicitly and score every content-dependent component as 0 so the total
  // collapses to (approximately) the completeness score, which correctly
  // reflects "nothing filled in yet".
  // Semantic (not just length) checks — an array of blank/placeholder entries
  // (e.g. `experience: [{ responsibilities: [] }]`, `skills: ["   "]`) must
  // NOT count as content, or the same "hardcoded-looking score" bug reappears
  // for CVs that are structurally non-empty but have nothing real in them.
  const hasAnyContent = !!(
    cv?.summary?.trim() ||
    cv?.experience?.some(e =>
      e.jobTitle?.trim() || e.company?.trim() ||
      e.responsibilities?.some(r => r?.trim())
    ) ||
    cv?.skills?.some(s => s?.trim()) ||
    cv?.education?.some(e => e.school?.trim() || e.degree?.trim()) ||
    cv?.projects?.some(p => p.name?.trim() || p.description?.trim())
  );

  // ── 1. Profile Completeness (25%) ─────────────────────────────────────────
  const completeness = scoreCVCompleteness(cv, profile);
  const completenessScore = completeness.percent;

  // ── 2. Achievement Density (25%) ──────────────────────────────────────────
  // % of experience bullets that contain at least one numeric metric.
  let achievementDensity = 0;
  let fidelityScore = hasAnyContent ? 75 : 0; // 75 = neutral "no bullets to audit yet"; 0 = truly empty CV
  try {
    if (cv && hasAnyContent) {
      const report = auditCvQuality(cv as Parameters<typeof auditCvQuality>[0]);
      fidelityScore = report.score;
      achievementDensity = report.achievementDensity.percent;
    }
  } catch { /* non-fatal — use defaults */ }

  // ── 3. Number Fidelity (20%) ───────────────────────────────────────────────
  // Already computed above via auditCvQuality.

  // ── 4. Voice Quality (15%) ────────────────────────────────────────────────
  // Penalise each voice issue found (first-person, tense drift, etc.).
  let voiceScore = hasAnyContent ? 100 : 0; // no text at all = nothing to grade as "professional voice"
  try {
    if (cv && hasAnyContent) {
      const issues = auditCvVoice(cv as Parameters<typeof auditCvVoice>[0]);
      // 8 points per issue; floors at 0.
      voiceScore = Math.max(0, 100 - issues.length * 8);
    }
  } catch { /* non-fatal */ }

  // ── 5. ATS Coverage (15%) ─────────────────────────────────────────────────
  let atsScore = 0;
  let hasJd = false;
  if (jobDescription?.trim() && cv && hasAnyContent) {
    try {
      const atsReport = scoreAtsCoverage(cv, jobDescription);
      // Use the richer semantic score if available, otherwise fall back to
      // the keyword-only score field.
      atsScore = ('semanticScore' in atsReport && typeof (atsReport as { semanticScore?: number }).semanticScore === 'number')
        ? (atsReport as { semanticScore: number }).semanticScore
        : atsReport.score;
      hasJd = true;
    } catch { /* non-fatal */ }
  } else if (hasAnyContent) {
    // No JD, but there IS some content — estimate from skills richness and bullet count.
    const skillCount = cv?.skills?.length ?? 0;
    const bulletCount = (cv?.experience ?? []).reduce(
      (n, e) => n + (e.responsibilities?.length ?? 0), 0
    );
    atsScore = Math.min(100,
      (skillCount >= 12 ? 60 : skillCount >= 6 ? 45 : skillCount >= 3 ? 30 : 15) +
      (bulletCount >= 10 ? 20 : bulletCount >= 5 ? 10 : 0)
    );
  }
  // else: no content at all → atsScore stays 0 (nothing to match against, JD or not)

  // ── Weighted composite ────────────────────────────────────────────────────
  const total = Math.round(
    completenessScore * 0.25 +
    achievementDensity * 0.25 +
    fidelityScore      * 0.20 +
    voiceScore         * 0.15 +
    atsScore           * 0.15
  );

  const grade: IntelligenceGrade =
    total >= 88 ? 'excellent' :
    total >= 74 ? 'strong' :
    total >= 58 ? 'good' :
    total >= 38 ? 'fair' : 'weak';

  // ── Improvements ─────────────────────────────────────────────────────────
  const improvements: string[] = [];
  if (completenessScore < 70) {
    const first = completeness.missing[0];
    improvements.push(first ? `Add your ${first.toLowerCase()}` : 'Complete your profile');
  }
  if (achievementDensity < 50) {
    improvements.push('Add numbers/metrics to your bullets ("grew X by Y%")');
  }
  if (fidelityScore < 70) {
    improvements.push('Remove unsupported numbers — only use metrics from your actual experience');
  }
  if (voiceScore < 80) {
    improvements.push('Remove first-person language ("I", "my") from your CV');
  }
  if (hasJd && atsScore < 60) {
    improvements.push('Include more keywords from the job description in your skills and bullets');
  } else if (!hasJd && atsScore < 55) {
    improvements.push('Add more relevant skills to your profile (aim for 10+)');
  }

  // ── Strengths ─────────────────────────────────────────────────────────────
  const strengths: string[] = [];
  if (completenessScore >= 85) strengths.push('Complete profile');
  if (achievementDensity >= 60) strengths.push('Strong metric density');
  if (fidelityScore >= 85) strengths.push('Accurate, grounded numbers');
  if (voiceScore >= 90) strengths.push('Professional voice');
  if (atsScore >= 70) strengths.push(hasJd ? 'Strong JD keyword coverage' : 'Broad skill coverage');

  return {
    total,
    grade,
    hasJd,
    improvements: improvements.slice(0, 4),
    strengths,
    components: [
      {
        label: 'Profile Completeness',
        score: completenessScore,
        weight: 25,
        tip: completeness.missing.length > 0
          ? `Missing: ${completeness.missing.slice(0, 2).join(', ')}`
          : 'All key fields filled in',
        color: componentColor(completenessScore),
      },
      {
        label: 'Achievement Density',
        score: achievementDensity,
        weight: 25,
        tip: `${achievementDensity}% of bullets have measurable wins`,
        color: componentColor(achievementDensity),
      },
      {
        label: 'Number Fidelity',
        score: fidelityScore,
        weight: 20,
        tip: fidelityScore >= 85 ? 'Metrics are well-grounded' : 'Some metrics may be unsupported',
        color: componentColor(fidelityScore),
      },
      {
        label: 'Voice Quality',
        score: voiceScore,
        weight: 15,
        tip: voiceScore >= 90 ? 'Clean, resume-conventional language' : 'Remove first-person pronouns',
        color: componentColor(voiceScore),
      },
      {
        label: hasJd ? 'ATS Keyword Match' : 'Skills Coverage',
        score: atsScore,
        weight: 15,
        tip: hasJd ? 'Coverage of JD keywords' : 'Estimated from your skill count',
        color: componentColor(atsScore),
      },
    ],
  };
}
