/**
 * buildReport.ts — Shared types for the Autonomous Repair Engine pipeline.
 *
 * CVBuildReport is the single output contract that all panels consume:
 *   - BuildCompletePanel  (Feature 1 UI)
 *   - ScoreMyCVPage       (reads atsScore)
 *   - CVDoctorPanel       (reads annotations)
 *   - QualityIssuesPanel  (reads guardResult)
 */

import type { BulletAnnotation } from '../services/cvDoctorService';
import type { FinalGuardResult } from '../services/cvFinalGuard';
import type { AtsKeywordReport } from '../services/cvAtsKeywords';
import type { ReconciledSkills } from '../services/skillsReconciler';
import type { CVScore } from '../services/geminiService';

// ─── Tier classification ──────────────────────────────────────────────────────

export type RepairTier = 0 | 1 | 2 | 3 | 4;

// ─── Pipeline events (tier 0–2 applied fixes) ────────────────────────────────

export interface PipelineEvent {
  tier: 0 | 1 | 2;
  category: 'voice_tense' | 'language' | 'verbs' | 'skills' | 'metrics' | 'structure';
  description: string;  // human-readable "Removed 2 weak verbs"
  count: number;
}

// ─── Tier 3 — one-click review items ─────────────────────────────────────────

export type ReviewItemLocation =
  | { kind: 'bullet'; roleIndex: number; bulletIndex: number; roleTitle: string }
  | { kind: 'summary' }
  | { kind: 'skills' };

export interface ReviewItem {
  id: string;
  location: ReviewItemLocation;
  issueType: string;
  original: string;
  suggested: string;
  confidence: number;
  applied: boolean;
  skipped: boolean;
}

// ─── Tier 4 — manual flags ────────────────────────────────────────────────────

export type ManualFlagLocation =
  | { kind: 'cert'; certName: string }
  | { kind: 'gap'; roleIndex: number; description: string }
  | { kind: 'bullet'; roleIndex: number; bulletIndex: number }
  | { kind: 'seniority' };

export interface ManualFlag {
  id: string;
  location: ManualFlagLocation;
  issueType: 'ungrounded_cert' | 'role_gap' | 'empty_bullet' | 'seniority_mismatch' | 'third_person_name';
  description: string;
  ctaLabel: string;
  ctaAction: 'edit_profile' | 'edit_bullet' | 'remove_cert';
}

// ─── Full build report ────────────────────────────────────────────────────────

export interface CVBuildReport {
  /** All applied fixes (tiers 0–2), grouped for display. */
  events: PipelineEvent[];
  /** Total count of auto-applied fixes. */
  appliedCount: number;
  /** Tier 3 suggestions awaiting user action. */
  reviewItems: ReviewItem[];
  /** Tier 4 items requiring user knowledge. */
  manualFlags: ManualFlag[];
  /** Pre-computed ATS report (reused by ScoreMyCVPage). */
  atsReport: AtsKeywordReport | null;
  /** Reconciled skills (reused by skills tab + Doctor). */
  reconciledSkills: ReconciledSkills | null;
  /** Raw bullet annotations from classifyBullets (reused by Doctor). */
  annotations: BulletAnnotation[];
  /** Raw guard result (reused by QualityIssuesPanel). */
  guardResult: FinalGuardResult | null;
  /** AI-generated CV Match Score (overall, ats, impact, relevance, clarity, verdict,
   *  strengths, improvements, missingKeywords). Set whenever scoreCV() runs — persisted
   *  so the Build Report Score tab shows it across sessions and devices. */
  cvMatchScore?: CVScore | null;
  /** ISO timestamp of when this report was generated. */
  generatedAt: string;
}
