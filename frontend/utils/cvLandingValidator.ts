/**
 * cvLandingValidator.ts
 * Shared CV validation + text-to-CVData parser for the landing page scorer.
 * Extracted here so it can be unit-tested independently of the React component.
 */

import type { CVData } from '../types';

/* ─── CV Validator ───────────────────────────────────────────────────────── */

/**
 * Returns null if the text looks like a real CV, or an error string to show
 * the user. Two-stage: JD rejection first, then CV signal check.
 */
export function isLikelyCv(text: string): string | null {
  const t = text.trim();

  if (t.length < 200) {
    return 'Please paste more of your CV — we need at least a summary and one experience section (200+ characters).';
  }

  // ── Stage 1: Detect job descriptions first (they share signals with CVs) ─
  const JD_HEADERS  = /^#{0,3}\s*(job\s+description|position\s+overview|about\s+(the\s+)?(role|position|company|us)|we\s+are\s+(seeking|looking\s+for)|the\s+successful\s+candidate|job\s+posting|vacancy|what\s+we\s+offer|our\s+client)\b/im;
  const JD_SECTIONS = /^#{0,3}\s*(responsibilities|requirements|qualifications|preferred\s+skills?|desired\s+skills?|nice\s+to\s+have|benefits|compensation|salary)\s*[:\-–]?\s*$/im;
  const JD_PHRASES  = /\b(we\s+are\s+(seeking|looking\s+for)|you\s+will\s+be\s+(responsible|expected)|the\s+(ideal|successful)\s+candidate|apply\s+(now|by|before)|equal\s+opportunity\s+(employer)?|to\s+apply\s+(please|send|email)|must\s+have\s+a\s+(degree|bachelor|master)|salary\s+(range|package)|closing\s+date)\b/i;

  if (JD_HEADERS.test(t) || JD_SECTIONS.test(t) || JD_PHRASES.test(t)) {
    return 'This looks like a job description, not a CV. Please paste your own CV text — your personal experience, education, and skills.';
  }

  // ── Stage 2: Check for CV-specific signals ────────────────────────────────
  const hasPersonalSections = /\b(professional\s+summary|career\s+summary|work\s+experience|work\s+history|employment\s+history|education|key\s+skills|core\s+competencies|profile|objective)\b/i.test(t);
  const hasDateRanges       = /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now|to\s+date)\b/i.test(t);
  const hasBullets          = /^[\s]*[•·›➤▸]\s/m.test(t);
  const hasContact          = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/.test(t) || /\+?\d[\d\s\-(). ]{7,}\d/.test(t);
  const hasName             = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}\s*$/.test(t.split('\n')[0]?.trim() ?? '');
  const hasJobTitle         = /\b(manager|engineer|analyst|developer|designer|director|officer|specialist|consultant|lead|head\s+of|chief|vice\s+president|associate|coordinator)\b/i.test(t.split('\n').slice(0, 4).join(' '));

  const signals = [hasPersonalSections, hasDateRanges, hasBullets, hasContact, hasName, hasJobTitle].filter(Boolean).length;

  if (signals < 2) {
    return "This doesn't look like a CV. Please paste your actual CV — it should include your work experience with dates, education, skills, and contact details.";
  }
  return null;
}

/* ─── Text → CVData parser ───────────────────────────────────────────────── */

/**
 * Parses raw pasted CV text into a minimal CVData structure so the full
 * scoring pipeline (HR detector, seniority coherence, ATS coverage) can run
 * without needing an actual filled-in profile form.
 */
export function parseLandingCvText(text: string): CVData {
  const lines      = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletRx   = /^[•\-\*·›➤▸]\s*(.+)$|^\d+\.\s+(.+)$/;
  const dateLineRx = /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now|to\s+date)\b/i;
  const sectionRx  = /^(EXPERIENCE|EMPLOYMENT|WORK|EDUCATION|SKILLS|SUMMARY|PROFILE|CERTIFICATIONS?|QUALIFICATIONS?|ACHIEVEMENTS?|PROJECTS?)\s*:?\s*$/i;

  const name = lines[0] ?? '';

  // Summary — non-bullet lines before first section header or date
  const summaryLines: string[] = [];
  for (let i = 1; i < lines.length && summaryLines.length < 6; i++) {
    const l = lines[i];
    if (sectionRx.test(l) || dateLineRx.test(l)) break;
    if (!bulletRx.test(l) && l.length > 20) summaryLines.push(l);
  }
  const summary = summaryLines.join(' ');

  // Experience roles — keyed by date lines
  type Role = { company: string; jobTitle: string; responsibilities: string[] };
  const roles: Role[] = [];
  let cur: Role | null = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hasDate     = dateLineRx.test(l);
    const nextHasDate = i + 1 < lines.length && dateLineRx.test(lines[i + 1]);

    if (hasDate || nextHasDate) {
      if (cur) roles.push(cur);
      const titleLine = hasDate ? l.replace(dateLineRx, '').trim() : l;
      const parts     = titleLine.split(/[|·—\-,@]/);
      cur = {
        jobTitle: (parts[0] ?? titleLine).trim().slice(0, 60) || 'Role',
        company:  (parts[1] ?? '').trim().slice(0, 40) || 'Company',
        responsibilities: [],
      };
    } else if (cur && bulletRx.test(l)) {
      const m = bulletRx.exec(l);
      if (m) cur.responsibilities.push((m[1] || m[2]).trim());
    }
  }
  if (cur) roles.push(cur);

  // Fallback — gather all bullets under one pseudo-role
  if (roles.length === 0) {
    const allBullets = lines.flatMap(l => {
      const m = bulletRx.exec(l);
      return m ? [(m[1] || m[2]).trim()] : [];
    });
    if (allBullets.length > 0) {
      roles.push({ company: 'Previous Employer', jobTitle: 'Professional', responsibilities: allBullets });
    }
  }

  // Skills section
  const sm     = text.match(/(?:skills?|technologies|tools|competenc(?:y|ies))[\s:]+([^\n]{20,}(?:\n[^\n]{0,80}){0,4})/i);
  const skills = sm
    ? sm[1].split(/[,|•\n·]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 35).slice(0, 20)
    : [];

  return {
    name,
    summary,
    experience: roles,
    skills,
    education: [],
    certifications: [],
    languages: [],
  } as unknown as CVData;
}
