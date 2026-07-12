/**
 * mergeProfileIntoCV.ts
 *
 * Shared utility used by profile-save AND every import path (Word, PDF, JSON).
 *
 * MERGE RULE: a field in currentCV is only overwritten by the incoming profile
 * value when the user demonstrably changed that field. Unchanged fields keep
 * the AI-generated value so saving/importing never silently discards built CV
 * content.
 *
 * Two helpers are also exported:
 *  - isSameProfileIdentity  — detects whether two profiles describe the same
 *    person (used by import paths to decide merge vs. full-replace).
 *  - fullReplaceCV          — returns a fresh profileToCV() result; used when
 *    a genuinely different CV is imported.
 */

import { CVData, UserProfile } from '../types';
import { profileToCV } from './profileToCV';

// ─── Same-person heuristic ────────────────────────────────────────────────────

/**
 * Returns true when `imported` appears to describe the same person as
 * `existing`, based on work-experience role overlap (≥ 50% matching
 * company + jobTitle pairs).  Falls back to name comparison when neither
 * profile has any work experience.
 *
 * This lets import handlers decide: same profile → merge (preserve AI work),
 * different profile → full replace (fresh start).
 */
export function isSameProfileIdentity(
  existing: UserProfile | null | undefined,
  imported: UserProfile,
): boolean {
  if (!existing) return false;

  const existingRoles =
    existing.workExperience?.map((e) => `${e.company}|${e.jobTitle}`) ?? [];
  const importedRoles =
    imported.workExperience?.map((e) => `${e.company}|${e.jobTitle}`) ?? [];

  if (existingRoles.length === 0 && importedRoles.length === 0) {
    return (
      (existing.personalInfo?.name ?? '').trim().toLowerCase() ===
      (imported.personalInfo?.name ?? '').trim().toLowerCase()
    );
  }

  const existingSet = new Set(existingRoles);
  const matching = importedRoles.filter((r) => existingSet.has(r)).length;
  const total = Math.max(existingRoles.length, importedRoles.length);
  return total > 0 && matching / total >= 0.5;
}

// ─── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merges `newProfile` into `currentCV`, preserving AI-generated content for
 * any field the user did not actually change.
 *
 * @param newProfile   The profile as submitted/imported.
 * @param oldProfile   The profile as it was BEFORE the change (used to detect
 *                     which fields were actually edited). Pass null/undefined
 *                     when there is no prior profile (first save / new slot).
 * @param currentCV    The current AI-generated CV to merge into.
 */
export function mergeProfileIntoCV(
  newProfile: UserProfile,
  oldProfile: UserProfile | null | undefined,
  currentCV: CVData,
): CVData {
  const fromProfile    = profileToCV(newProfile);
  const oldFromProfile = profileToCV(oldProfile ?? ({} as UserProfile));

  // ── Per-field change detection ──────────────────────────────────────────
  const ser = (v: unknown) => JSON.stringify(v ?? []);
  const summaryChanged        = newProfile.summary       !== (oldProfile?.summary       ?? '');
  const skillsChanged         = ser(newProfile.skills)         !== ser(oldProfile?.skills);
  const educationChanged      = ser(newProfile.education)      !== ser(oldProfile?.education);
  const projectsChanged       = ser(newProfile.projects)       !== ser(oldProfile?.projects);
  const languagesChanged      = ser(newProfile.languages)      !== ser(oldProfile?.languages);
  const referencesChanged     = ser(newProfile.references)     !== ser(oldProfile?.references);
  const customSectionsChanged = ser(newProfile.customSections) !== ser(oldProfile?.customSections);

  // ── Experience: per-role bullet change detection ────────────────────────
  // Roles present in the new profile that match an AI-polished role in
  // currentCV keep the AI bullets unless the user specifically edited them
  // in the form/import.  New roles (no match) get their raw profile bullets.
  const mergedExperience = fromProfile.experience.map((newExp) => {
    const prevCVExp = currentCV.experience.find(
      (e) =>
        e.company   === newExp.company   &&
        e.jobTitle  === newExp.jobTitle  &&
        (e.responsibilities ?? []).length > 0,
    );
    if (!prevCVExp) return newExp; // new role — use as-is

    const oldExp = oldFromProfile.experience.find(
      (e) => e.company === newExp.company && e.jobTitle === newExp.jobTitle,
    );
    const bulletsChangedInForm =
      JSON.stringify(oldExp?.responsibilities ?? []) !==
      JSON.stringify(newExp.responsibilities);

    if (bulletsChangedInForm) {
      return {
        ...prevCVExp,
        responsibilities: newExp.responsibilities,
        dates:     newExp.dates,
        startDate: newExp.startDate,
        endDate:   newExp.endDate,
        location:  newExp.location,
      };
    }
    // Bullets unchanged — keep AI version, but sync all factual metadata
    // (dates, location) so profile edits to those fields are never silently
    // dropped even when the AI-polished bullets are preserved.
    return {
      ...prevCVExp,
      dates:     newExp.dates,
      startDate: newExp.startDate,
      endDate:   newExp.endDate,
      location:  newExp.location,
    };
  });

  return {
    ...currentCV,
    // personalInfo always updates — contact details are never AI-generated.
    personalInfo: newProfile.personalInfo ?? currentCV.personalInfo,
    summary: summaryChanged
      ? (newProfile.summary || currentCV.summary)
      : currentCV.summary,
    experience:
      mergedExperience.length > 0 ? mergedExperience : currentCV.experience,
    education: educationChanged && (fromProfile.education ?? []).length > 0
      ? fromProfile.education
      : currentCV.education,
    skills: skillsChanged && (newProfile.skills ?? []).length > 0
      ? newProfile.skills
      : currentCV.skills,
    projects: projectsChanged && (fromProfile.projects ?? []).length > 0
      ? fromProfile.projects
      : currentCV.projects,
    languages: languagesChanged && (fromProfile.languages ?? []).length > 0
      ? fromProfile.languages
      : currentCV.languages,
    references: referencesChanged && (fromProfile.references ?? []).length > 0
      ? fromProfile.references
      : currentCV.references,
    customSections: customSectionsChanged
      ? (newProfile.customSections ?? []).filter((s) =>
          s.items.some((i) => i.title.trim().length > 0),
        )
      : currentCV.customSections,
    // certifications, achievements, and publications are all derived from
    // customSections in the profile (profileToCV promotes them). Follow the
    // same "only update when changed" rule as every other field: if the user
    // edited the relevant custom sections → take the new profile value; if
    // they didn't → keep currentCV so inline CV edits (e.g. correcting a cert
    // name directly in the template) survive a profile save that touched
    // unrelated fields.
    certifications: customSectionsChanged
      ? fromProfile.certifications
      : currentCV.certifications,
    achievements: customSectionsChanged
      ? fromProfile.achievements
      : currentCV.achievements,
    publications: customSectionsChanged
      ? fromProfile.publications
      : currentCV.publications,
    sectionOrder: newProfile.sectionOrder,
  };
}
