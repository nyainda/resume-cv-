/**
 * CV Validation Engine — hard deterministic rules enforced post-generation.
 *
 * Each rule is self-contained: it receives CVData, checks one invariant,
 * optionally repairs it, and returns a ValidationViolation.
 *
 * Architecture:
 *   LLM Output → runValidationEngine() → {cv, violations, repairApplied, passed}
 *
 * Severity levels:
 *   'block' = must not reach the user; repaired automatically where possible
 *   'warn'  = flagged for telemetry; not auto-repaired (would require AI)
 */

import type { CVData, CVExperience } from '../types';
import type { ValidationViolation } from './generationTrace';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  cv: CVData;
  violations: ValidationViolation[];
  repairApplied: boolean;
  passed: boolean;
}

export interface ValidationRule {
  id: string;
  severity: 'block' | 'warn';
  check: (cv: CVData, opts: ValidationOpts) => ValidationViolation[];
  repair?: (cv: CVData, violations: ValidationViolation[], opts?: ValidationOpts) => CVData;
}

export interface ValidationOpts {
  targetBulletCount?: number;
  /** S3: user-supplied certifications list from lockRealNumbers().certifications.
   *  When provided, any well-known credential pattern found in bullets that is
   *  NOT in this list is flagged as a warn violation. */
  certifications?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILLS_MAX = 15;
const BULLET_MIN_WORDS = 6;
const BULLET_MAX_WORDS = 50;

const SEEKING_PATTERNS: RegExp[] = [
  /\b(currently\s+)?(seeking|looking\s+for|searching\s+for|hoping\s+to\s+(?:find|join|work))\b/gi,
  /\bI\s+am\s+(?:a|an)\b/gi,
  /\bmy\s+goal\s+is\b/gi,
  /\bI\s+am\s+passionate\s+about\b/gi,
  /\bI\s+am\s+eager\s+to\b/gi,
];

const FIRST_PERSON_SUMMARY_PATTERN = /^\s*(I\s+am|I'm|I've|I\s+have|My\s+name|I\s+)/i;

// ─── Utilities ────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function firstWord(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

function isCurrentRole(exp: CVExperience): boolean {
  const end = (exp.endDate ?? '').toLowerCase().trim();
  return end === '' || end === 'present' || end === 'current' || end === 'now';
}

function cloneCV(cv: CVData): CVData {
  return JSON.parse(JSON.stringify(cv)) as CVData;
}

// ─── Individual rules ─────────────────────────────────────────────────────────

const ruleSkillsCap: ValidationRule = {
  id: 'skills_cap',
  severity: 'block',
  check(cv) {
    if (cv.skills.length <= SKILLS_MAX) return [];
    return [{
      ruleId: 'skills_cap',
      severity: 'block',
      location: 'skills',
      message: `${cv.skills.length} skills found — exceeds max of ${SKILLS_MAX}`,
      repaired: false,
    }];
  },
  repair(cv) {
    const out = cloneCV(cv);
    out.skills = out.skills.slice(0, SKILLS_MAX);
    return out;
  },
};

const ruleSkillsDedup: ValidationRule = {
  id: 'skills_deduplication',
  severity: 'block',
  check(cv) {
    const seen = new Set<string>();
    let dupes = 0;
    for (const s of cv.skills) {
      const key = s.toLowerCase().trim();
      if (seen.has(key)) dupes++;
      else seen.add(key);
    }
    if (dupes === 0) return [];
    return [{
      ruleId: 'skills_deduplication',
      severity: 'block',
      location: 'skills',
      message: `${dupes} duplicate skill(s) detected`,
      repaired: false,
    }];
  },
  repair(cv) {
    const out = cloneCV(cv);
    const seen = new Set<string>();
    out.skills = out.skills.filter(s => {
      const key = s.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return out;
  },
};

const ruleNoSeekingPhrases: ValidationRule = {
  id: 'no_seeking_phrases',
  severity: 'block',
  check(cv) {
    for (const pattern of SEEKING_PATTERNS) {
      if (pattern.test(cv.summary)) {
        return [{
          ruleId: 'no_seeking_phrases',
          severity: 'block',
          location: 'summary',
          message: `Summary contains a seeking/first-person phrase`,
          repaired: false,
        }];
      }
    }
    return [];
  },
  repair(cv) {
    const out = cloneCV(cv);
    let s = out.summary;
    for (const pattern of SEEKING_PATTERNS) {
      s = s.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
    }
    // Clean up leading punctuation or connective words left over
    s = s.replace(/^[,;:.–—]\s*/, '').trim();
    out.summary = s;
    return out;
  },
};

const ruleNoFirstPersonSummary: ValidationRule = {
  id: 'no_first_person_summary',
  severity: 'warn',
  check(cv) {
    if (!FIRST_PERSON_SUMMARY_PATTERN.test(cv.summary)) return [];
    return [{
      ruleId: 'no_first_person_summary',
      severity: 'warn',
      location: 'summary',
      message: 'Summary opens with a first-person pronoun',
      repaired: false,
    }];
  },
};

const ruleEmptyRoles: ValidationRule = {
  id: 'empty_experience_bullets',
  severity: 'warn',
  check(cv) {
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      if (!role.responsibilities || role.responsibilities.length === 0) {
        violations.push({
          ruleId: 'empty_experience_bullets',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `"${role.jobTitle}" at "${role.company}" has no bullets`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

const ruleHollowBullets: ValidationRule = {
  id: 'hollow_bullets',
  severity: 'warn',
  check(cv) {
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      const hollow = (role.responsibilities ?? []).filter(b => wordCount(b) < BULLET_MIN_WORDS);
      if (hollow.length > 0) {
        violations.push({
          ruleId: 'hollow_bullets',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `${hollow.length} bullet(s) under ${BULLET_MIN_WORDS} words at "${role.jobTitle}"`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

const ruleOverlongBullets: ValidationRule = {
  id: 'overlong_bullets',
  severity: 'warn',
  check(cv) {
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      const long = (role.responsibilities ?? []).filter(b => wordCount(b) > BULLET_MAX_WORDS);
      if (long.length > 0) {
        violations.push({
          ruleId: 'overlong_bullets',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `${long.length} bullet(s) over ${BULLET_MAX_WORDS} words at "${role.jobTitle}"`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

const ruleDuplicateOpeners: ValidationRule = {
  id: 'duplicate_openers',
  severity: 'warn',
  check(cv) {
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      const bullets = role.responsibilities ?? [];
      const freq: Record<string, number> = {};
      for (const b of bullets) {
        const w = firstWord(b);
        if (w) freq[w] = (freq[w] ?? 0) + 1;
      }
      const dupes = Object.entries(freq)
        .filter(([, n]) => n > 1)
        .map(([v]) => v);
      if (dupes.length > 0) {
        violations.push({
          ruleId: 'duplicate_openers',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `Duplicate opening verb(s) in "${role.jobTitle}": ${dupes.join(', ')}`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

const ruleExcessBullets: ValidationRule = {
  id: 'excess_bullets',
  severity: 'warn',
  check(cv, opts) {
    if (!opts.targetBulletCount) return [];
    const cap = opts.targetBulletCount + 2;
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      const count = role.responsibilities?.length ?? 0;
      if (count > cap) {
        violations.push({
          ruleId: 'excess_bullets',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `${count} bullets in "${role.jobTitle}" — expected ~${opts.targetBulletCount}`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

/**
 * Bullet Count Enforcer — BLOCK rule (auto-repaired).
 *
 * If the LLM returns significantly more bullets than requested (more than
 * targetBulletCount + 3), trims the excess so the user never sees an
 * overloaded role. Keeps the first N bullets (most important come first
 * by convention in the generation prompt).
 *
 * Hard cap: only fires when count > targetBulletCount + 3 to avoid
 * aggressively trimming roles where the LLM added one or two extras for
 * legitimate reasons (e.g. a scope-anchor bullet prepended).
 */
const ruleBulletCountEnforcer: ValidationRule = {
  id: 'bullet_count_enforcer',
  severity: 'block',
  check(cv, opts) {
    if (!opts.targetBulletCount) return [];
    const hardCap = opts.targetBulletCount + 3;
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      const count = role.responsibilities?.length ?? 0;
      if (count > hardCap) {
        violations.push({
          ruleId: 'bullet_count_enforcer',
          severity: 'block',
          location: `experience[${i}]`,
          message: `${count} bullets in "${role.jobTitle}" — hard cap is ${hardCap} (target ${opts.targetBulletCount})`,
          repaired: false,
        });
      }
    });
    return violations;
  },
  repair(cv, _violations, opts) {
    if (!opts?.targetBulletCount) return cv;
    const hardCap = opts.targetBulletCount + 3;
    const out = cloneCV(cv);
    out.experience = out.experience.map(role => {
      const bullets = role.responsibilities ?? [];
      if (bullets.length > hardCap) {
        return { ...role, responsibilities: bullets.slice(0, opts.targetBulletCount) };
      }
      return role;
    });
    return out;
  },
};

/**
 * Current-Role Tense Consistency — WARN rule (not auto-repaired; needs AI).
 *
 * Flags bullets in the current (most-recent, open-ended) role that open with
 * a clearly past-tense verb ending in "-ed". The generation prompt instructs
 * the LLM to use present-tense imperatives for current roles — this catches
 * the cases where that instruction leaked through.
 *
 * Only catches the clearest violations (first-word "-ed" endings) to keep
 * false-positive rate low. Complex tense detection requires a verb DB.
 */
const ruleCurrentRoleTense: ValidationRule = {
  id: 'current_role_tense',
  severity: 'warn',
  check(cv) {
    const violations: ValidationViolation[] = [];
    cv.experience.forEach((role, i) => {
      if (!isCurrentRole(role)) return;
      const bullets = role.responsibilities ?? [];
      const pastTenseBullets = bullets.filter(b => {
        const firstW = b.trim().split(/\s+/)[0] ?? '';
        // Word ends in "-ed" and is at least 4 chars (avoids "red", "bed", etc.)
        return firstW.length >= 4 && /[^aeiou]ed$/i.test(firstW);
      });
      if (pastTenseBullets.length > 0) {
        violations.push({
          ruleId: 'current_role_tense',
          severity: 'warn',
          location: `experience[${i}]`,
          message: `${pastTenseBullets.length} bullet(s) in current role "${role.jobTitle}" open with past-tense verbs — should use present imperative`,
          repaired: false,
        });
      }
    });
    return violations;
  },
};

// ─── S3: Ungrounded certification detection ───────────────────────────────────

/**
 * Patterns that match well-known credential names likely to be hallucinated.
 * Each regex is tested against every bullet; a match that isn't backed by the
 * user's certifications list (opts.certifications) raises a warn violation.
 */
const CREDENTIAL_MENTION_RX: RegExp[] = [
  // Cloud platforms
  /\bAWS\s+Certified\b/gi,
  /\bAzure\s+(?:Certified|Administrator|Developer|Architect|Expert|Solutions\s+Architect)\b/gi,
  /\bGoogle\s+(?:Professional\s+Cloud|Associate\s+Cloud|Certified\s+Professional)\b/gi,
  /\bGCP\s+(?:Professional|Associate|Certified)\b/gi,
  // Project / Agile
  /\bPMP\s*(?:Certified|Certification)?\b/g,
  /\bPRINCE2\s*(?:Certified|Practitioner|Foundation)?\b/gi,
  /\bCertified\s+Scrum\s+Master\b/gi,
  /\bCSM\s+Certified\b/gi,
  /\bSAFe\s+(?:Agilist|Practitioner|SPC|Architect)\b/gi,
  // Cyber / Security
  /\bCISSP\b/g,
  /\bCISM\b/g,
  /\bCEH\b/g,
  /\bCompTIA\s+(?:Security\+|Network\+|A\+|CySA\+|CASP\+)\b/gi,
  // Finance / Accounting
  /\bCPA\s+Certified\b/gi,
  /\bACCA\s+(?:Qualified|Certified|Member)?\b/gi,
  /\bCFA\s+(?:Charterholder|Level\s+[123])?\b/gi,
  /\bCIMA\s+(?:Qualified|Certified)?\b/gi,
  // HR
  /\bSHRM-(?:CP|SCP)\b/gi,
  /\bCIPD\s+(?:Level\s+\d|Qualified)?\b/gi,
  // Lean / Quality
  /\b(?:Lean\s+)?Six\s+Sigma\s+(?:Black|Green|Yellow)\s+Belt\b/gi,
  // General "Certified X" catch-all (requires capital letter after "Certified")
  /\bCertified\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\b/g,
];

/** Normalise a string for fuzzy matching — lower-case, collapse whitespace. */
function normCert(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Return true if the credential mention is backed by at least one cert in the list. */
function certIsGrounded(mention: string, certList: string[]): boolean {
  const mentionNorm = normCert(mention);
  return certList.some(c => {
    const certNorm = normCert(c);
    return certNorm.includes(mentionNorm) || mentionNorm.includes(certNorm);
  });
}

const ruleUngroundedCertifications: ValidationRule = {
  id: 'ungrounded_certifications',
  severity: 'warn',
  check(cv, opts) {
    if (!opts.certifications) return [];
    const certList = opts.certifications;
    const violations: ValidationViolation[] = [];

    const checkText = (text: string, location: string) => {
      for (const rx of CREDENTIAL_MENTION_RX) {
        rx.lastIndex = 0;
        for (const m of text.matchAll(rx)) {
          const mention = m[0].trim();
          if (!certIsGrounded(mention, certList)) {
            violations.push({
              ruleId: 'ungrounded_certifications',
              severity: 'warn',
              location,
              message: `Credential "${mention}" mentioned but not found in user's certifications list — possible hallucination`,
              repaired: false,
            });
          }
        }
      }
    };

    checkText(cv.summary ?? '', 'summary');
    cv.experience?.forEach((role, i) => {
      (role.responsibilities ?? []).forEach((b, j) => checkText(b, `experience[${i}].bullet[${j}]`));
    });
    cv.projects?.forEach((p, i) => checkText(p.description ?? '', `projects[${i}]`));

    return violations;
  },
};

/**
 * Incomplete Gerund Phrase — WARN rule.
 *
 * Detects the common LLM truncation pattern where a gerund is immediately
 * followed by a preposition with no intervening direct object:
 *   "designing and installing across farms"  (missing "systems")
 *   "managing in Nairobi"                    (ambiguous — may be fine)
 *
 * Uses a conservative pattern requiring the AND-conjunction form to reduce
 * false positives. Cannot be auto-repaired without AI (object is unknown).
 */
const GERUND_NO_OBJECT_RX =
    /\b(?:and|or)\s+(?:installing|implementing|deploying|designing|developing|building|integrating|delivering|commissioning|configuring|managing|operating)\s+(?:across|in|at|for|on|from|into|through|over|under|within)\b/gi;

const ruleIncompleteGerundPhrase: ValidationRule = {
    id: 'incomplete_gerund_phrase',
    severity: 'warn',
    check(cv) {
        const violations: ValidationViolation[] = [];
        cv.experience.forEach((role, i) => {
            (role.responsibilities ?? []).forEach((b, j) => {
                GERUND_NO_OBJECT_RX.lastIndex = 0;
                if (GERUND_NO_OBJECT_RX.test(b)) {
                    violations.push({
                        ruleId: 'incomplete_gerund_phrase',
                        severity: 'warn',
                        location: `experience[${i}].responsibilities[${j}]`,
                        message: `Gerund without direct object before preposition: "${b.slice(0, 80)}"`,
                        repaired: false,
                    });
                }
            });
        });
        return violations;
    },
};

// ─── Rule registry (ordered — block rules run before warn rules) ──────────────

const RULES: ValidationRule[] = [
  // Block rules first (auto-repaired, must not reach the user)
  ruleSkillsCap,
  ruleSkillsDedup,
  ruleNoSeekingPhrases,
  ruleBulletCountEnforcer,          // trims excess bullets to targetBulletCount
  // Warn rules (collected for telemetry / trace, not auto-repaired)
  ruleNoFirstPersonSummary,
  ruleEmptyRoles,
  ruleHollowBullets,
  ruleOverlongBullets,
  ruleDuplicateOpeners,
  ruleExcessBullets,
  ruleCurrentRoleTense,             // flags past-tense openers in current role
  ruleUngroundedCertifications,     // S3: flags credential mentions not in user's profile
  ruleIncompleteGerundPhrase,       // flags "installing across" / "managing in" with no object
];

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all validation rules against a generated CVData.
 * Block-severity violations with a repair strategy are fixed automatically.
 * Warn-severity violations are collected for telemetry/trace but do not block.
 *
 * Returns the (possibly repaired) CVData, the full violations list, and whether
 * any repair was applied. A second validation pass is run after repairs to
 * confirm the block violations are resolved.
 */
export function runValidationEngine(cv: CVData, opts: ValidationOpts = {}): ValidationResult {
  let current = cv;
  const allViolations: ValidationViolation[] = [];
  let repairApplied = false;

  // Pass 1 — check and repair
  for (const rule of RULES) {
    const violations = rule.check(current, opts);
    if (violations.length === 0) continue;

    if (rule.repair) {
      const repaired = rule.repair(current, violations, opts);
      current = repaired;
      repairApplied = true;
      allViolations.push(...violations.map(v => ({ ...v, repaired: true })));
    } else {
      allViolations.push(...violations);
    }
  }

  // Pass 2 — verify block violations are gone after repair
  if (repairApplied) {
    for (const rule of RULES) {
      if (!rule.repair) continue;
      const remaining = rule.check(current, opts);
      if (remaining.length > 0) {
        allViolations.push(...remaining.map(v => ({
          ...v,
          ruleId: v.ruleId + '_post_repair',
          message: `[After repair] ${v.message}`,
          repaired: false,
        })));
      }
    }
  }

  const unrepairedBlocks = allViolations.filter(
    v => v.severity === 'block' && !v.repaired
  );

  return {
    cv: current,
    violations: allViolations,
    repairApplied,
    passed: unrepairedBlocks.length === 0,
  };
}

// ─── Convenience export for use outside generation pipeline ──────────────────

export { RULES as VALIDATION_RULES };
export type { ValidationViolation };
