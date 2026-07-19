/**
 * autoRepairEngine.ts — Feature 1: Autonomous Repair Engine (ARE).
 *
 * Single orchestrator that runs all quality passes in the correct order,
 * assigns findings to tiers, and returns a RepairResult ready for the
 * BuildCompletePanel and onUpdateCV injection.
 *
 * Called by CVGenerator.tsx immediately after generation succeeds.
 * The repaired CV is injected into state BEFORE the panel opens.
 */

import { CVData, UserProfile } from '../types';
import { runFinalCVGuard } from './cvFinalGuard';
import { purifyCV } from './cvPurificationPipeline';
import { classifyBullets } from './cvDoctorService';
import { applyTier1Fixes } from './tier1Fixes';
import { reconcileSkills } from './skillsReconciler';
import { extractJdKeywords, scoreAtsCoverage } from './cvAtsKeywords';
import type { CVBuildReport, PipelineEvent, ReviewItem, ManualFlag } from '../types/buildReport';

export interface RepairResult {
  /** The fully repaired CV — inject into state immediately. */
  cv: CVData;
  /** Structured report for the BuildCompletePanel. */
  report: CVBuildReport;
}

// ─── Tier 0 event builders ────────────────────────────────────────────────────

function eventsFromGuardFixes(fixes: string[]): PipelineEvent[] {
  const events: PipelineEvent[] = [];
  const voiceFixes = fixes.filter(f => f.includes('summary') && (f.includes('opener') || f.includes('seeking')));
  const bulletFixes = fixes.filter(f => f.includes('bullet') || f.includes('exp'));
  const skillFixes = fixes.filter(f => f.includes('skill'));
  const otherFixes = fixes.filter(f => !voiceFixes.includes(f) && !bulletFixes.includes(f) && !skillFixes.includes(f));

  if (voiceFixes.length > 0) {
    events.push({ tier: 0, category: 'voice_tense', description: 'Cleaned summary opener and seeking language', count: voiceFixes.length });
  }
  if (skillFixes.length > 0) {
    events.push({ tier: 0, category: 'skills', description: `Deduplicated ${skillFixes.length} skill${skillFixes.length > 1 ? 's' : ''}`, count: skillFixes.length });
  }
  if (bulletFixes.length > 0) {
    events.push({ tier: 0, category: 'language', description: `Cleaned ${bulletFixes.length} bullet${bulletFixes.length > 1 ? 's' : ''} (placeholders, markdown leaks)`, count: bulletFixes.length });
  }
  if (otherFixes.length > 0) {
    events.push({ tier: 0, category: 'structure', description: `Applied ${otherFixes.length} structural fix${otherFixes.length > 1 ? 'es' : ''}`, count: otherFixes.length });
  }
  return events;
}

function eventsFromPurifyLeaks(leaks: Array<{ fixedBy?: string; original?: string }>): PipelineEvent[] {
  const substitutions = leaks.filter(l => l.fixedBy === 'synonym_sub' || l.fixedBy === 'substitution');
  const voiceLeaks = leaks.filter(l => l.fixedBy === 'instruction_leak_strip');
  const metricLeaks = leaks.filter(l => l.fixedBy === 'tense_flip' || l.fixedBy === 'jitter');

  const events: PipelineEvent[] = [];
  if (substitutions.length > 0) {
    events.push({ tier: 0, category: 'language', description: `Substituted ${substitutions.length} banned phrase${substitutions.length > 1 ? 's' : ''}`, count: substitutions.length });
  }
  if (voiceLeaks.length > 0) {
    events.push({ tier: 0, category: 'voice_tense', description: `Removed ${voiceLeaks.length} first-person pronoun${voiceLeaks.length > 1 ? 's' : ''}`, count: voiceLeaks.length });
  }
  if (metricLeaks.length > 0) {
    events.push({ tier: 0, category: 'metrics', description: `Grounded ${metricLeaks.length} unverified metric${metricLeaks.length > 1 ? 's' : ''}`, count: metricLeaks.length });
  }
  return events;
}

// ─── Tier 3 review item builders ─────────────────────────────────────────────

function buildNoMetricReviewItems(cv: CVData): ReviewItem[] {
  const items: ReviewItem[] = [];
  let id = 0;

  // Only flag the top 3 high-impact roles' bullets with no metric
  const topRoles = cv.experience.slice(0, 3);
  topRoles.forEach((role, roleIndex) => {
    const noMetricBullets = (role.responsibilities || [])
      .map((bullet, bulletIndex) => ({ bullet, bulletIndex }))
      .filter(({ bullet }) => !/\d/.test(bullet))
      .slice(0, 2); // max 2 per role

    for (const { bullet, bulletIndex } of noMetricBullets) {
      items.push({
        id: `no_metric_${id++}`,
        location: { kind: 'bullet', roleIndex, bulletIndex, roleTitle: role.jobTitle },
        issueType: 'no_metric',
        original: bullet,
        suggested: '', // populated by AI on demand — shown as "Add a number to quantify impact"
        confidence: 0,
        applied: false,
        skipped: false,
      });
      if (items.length >= 5) break; // cap total review items from this source
    }
    if (items.length >= 5) return;
  });

  return items;
}

// ─── Tier 4 manual flag builders ─────────────────────────────────────────────

function collectManualFlags(cv: CVData): ManualFlag[] {
  const flags: ManualFlag[] = [];
  let id = 0;

  // Certifications without evidence in bullets
  const bulletText = cv.experience
    .flatMap(r => r.responsibilities || [])
    .join(' ')
    .toLowerCase();

  (cv.certifications || []).forEach(cert => {
    const certName = typeof cert === 'string' ? cert : cert.name;
    const certWords = certName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const evidenced = certWords.some(word => bulletText.includes(word));
    if (!evidenced) {
      flags.push({
        id: `cert_${id++}`,
        location: { kind: 'cert', certName },
        issueType: 'ungrounded_cert',
        description: `"${certName}" isn't evidenced in any of your roles.`,
        ctaLabel: 'Add evidence →',
        ctaAction: 'edit_profile',
      });
    }
  });

  // Empty bullets (became empty after purification)
  cv.experience.forEach((role, roleIndex) => {
    (role.responsibilities || []).forEach((bullet, bulletIndex) => {
      if (bullet.trim().length < 5) {
        flags.push({
          id: `empty_${id++}`,
          location: { kind: 'bullet', roleIndex, bulletIndex },
          issueType: 'empty_bullet',
          description: `A bullet in "${role.jobTitle}" became empty after cleaning.`,
          ctaLabel: 'Edit bullet →',
          ctaAction: 'edit_bullet',
        });
      }
    });
  });

  return flags;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Run the full autonomous repair pipeline on a generated CV.
 *
 * Execution order (per spec):
 *   1. runFinalCVGuard  — tier 0 structural fixes
 *   2. purifyCV         — tier 0 phrase/voice/metric fixes
 *   3. classifyBullets  — bullet annotation for tier assignment
 *   4. applyTier1Fixes  — deterministic verb/passive/ensuring rewrites
 *   5. (tier 2 AI rewrites deferred — called on demand in BuildCompletePanel)
 *   6. reconcileSkills  — evidence-based skills merge
 *   7. scoreAtsCoverage — ATS report
 *   8. collectManualFlags
 *   9. build + return
 */
export async function runAutoRepair(
  cv: CVData,
  profile: UserProfile,
  jobDescription?: string,
): Promise<RepairResult> {
  const allEvents: PipelineEvent[] = [];
  let workingCV = cv;

  // Step 1 — Final guard (tier 0)
  let guardResult = null;
  try {
    const guardOut = await runFinalCVGuard(workingCV);
    if (guardOut.changed) {
      workingCV = guardOut.cvData;
      const guardEvents = eventsFromGuardFixes(guardOut.fixes);
      allEvents.push(...guardEvents);
    }
    guardResult = guardOut;
  } catch (err) {
    console.warn('[ARE] runFinalCVGuard failed:', err);
  }

  // Step 2 — Purify (tier 0)
  let purifyLeaks: Array<{ fixedBy?: string; original?: string }> = [];
  try {
    const purifyOut = purifyCV(workingCV);
    workingCV = purifyOut.cv;
    purifyLeaks = purifyOut.report?.leaks ?? [];
    const purifyEvents = eventsFromPurifyLeaks(purifyLeaks);
    allEvents.push(...purifyEvents);
  } catch (err) {
    console.warn('[ARE] purifyCV failed:', err);
  }

  // Step 3 — Classify bullets (for tier assignment + Doctor panel reuse)
  let annotations = [];
  try {
    annotations = classifyBullets(workingCV);
  } catch (err) {
    console.warn('[ARE] classifyBullets failed:', err);
  }

  // Step 4 — Tier 1 fixes
  try {
    const tier1Out = applyTier1Fixes(workingCV);
    workingCV = tier1Out.cv;
    allEvents.push(...tier1Out.events);
  } catch (err) {
    console.warn('[ARE] applyTier1Fixes failed:', err);
  }

  // Step 6 — Skills reconciliation
  let reconciledSkills = null;
  try {
    if (jobDescription?.trim()) {
      const jdSkills = extractJdKeywords(jobDescription);
      const bullets = workingCV.experience.flatMap(r => r.responsibilities || []);
      reconciledSkills = reconcileSkills(
        profile.skills ?? [],
        jdSkills,
        bullets,
      );
      // Apply reconciled skills to the CV if there's meaningful change
      if (reconciledSkills.finalSkills.length > 0) {
        const before = workingCV.skills.join(',');
        const after = reconciledSkills.finalSkills.join(',');
        if (before !== after) {
          workingCV = { ...workingCV, skills: reconciledSkills.finalSkills };
          if (reconciledSkills.addedFromJD.length > 0) {
            allEvents.push({
              tier: 0,
              category: 'skills',
              description: `Added ${reconciledSkills.addedFromJD.length} evidenced JD skill${reconciledSkills.addedFromJD.length > 1 ? 's' : ''}`,
              count: reconciledSkills.addedFromJD.length,
            });
          }
          if (reconciledSkills.dropped.length > 0) {
            allEvents.push({
              tier: 0,
              category: 'skills',
              description: `Dropped ${reconciledSkills.dropped.length} unevidenced JD skill${reconciledSkills.dropped.length > 1 ? 's' : ''}`,
              count: reconciledSkills.dropped.length,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ARE] reconcileSkills failed:', err);
  }

  // Step 7 — ATS coverage
  let atsReport = null;
  try {
    if (jobDescription?.trim()) {
      atsReport = scoreAtsCoverage(workingCV, jobDescription);
    }
  } catch (err) {
    console.warn('[ARE] scoreAtsCoverage failed:', err);
  }

  // Step 8 — Tier 3 review items
  const reviewItems: ReviewItem[] = buildNoMetricReviewItems(workingCV);

  // Step 8b — Tier 4 manual flags
  const manualFlags: ManualFlag[] = collectManualFlags(workingCV);

  // Deduplicate + consolidate events: merge events of same category+tier
  const consolidatedEvents = consolidateEvents(allEvents);
  const appliedCount = consolidatedEvents.reduce((sum, e) => sum + (e.tier <= 1 ? e.count : 0), 0);

  const report: CVBuildReport = {
    events: consolidatedEvents,
    appliedCount,
    reviewItems,
    manualFlags,
    atsReport,
    reconciledSkills,
    annotations,
    guardResult,
    generatedAt: new Date().toISOString(),
  };

  return { cv: workingCV, report };
}

/** Merge events of the same category (keep separate tiers distinct). */
function consolidateEvents(events: PipelineEvent[]): PipelineEvent[] {
  const map = new Map<string, PipelineEvent>();
  for (const event of events) {
    const key = `${event.tier}_${event.category}`;
    const existing = map.get(key);
    if (existing) {
      // Merge: keep last description (more specific), add count
      map.set(key, { ...event, count: existing.count + event.count });
    } else {
      map.set(key, { ...event });
    }
  }
  return Array.from(map.values());
}
