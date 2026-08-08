/**
 * Source fidelity + finalizeCvData.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile, CVData, ReconciledSkills } from '../types';
import { purifyCV } from './cvPurificationPipeline';
import { logCvQualityReport as _logCvQualityReport } from './cvNumberFidelity';


export function applySourceFidelityRules(cvData: CVData, profile: UserProfile, reconciledSkills?: ReconciledSkills | null): CVData {
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

export function applyFidelityAgainstSourceCV(cvData: CVData, sourceCV: CVData): CVData {
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


export function finalizeCvData(
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
