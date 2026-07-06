/**
 * importPipeline.ts
 * Zero-token import pipeline — Stage 1 (deterministic) + Stage 2 (AI, background).
 * All three format paths (PDF, DOCX, JSON) converge here after their extraction step.
 */

import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { ROLE_TRACKS } from '../data/roleTracks';
import { detectField } from './cvPromptHelpers';
import { workerTieredLLM, workerProxyLLM } from './cvEngineClient';
import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { cleanImportedText } from './cvPurificationPipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  profile:       UserProfile;
  confidence:    Record<string, number>;
  detectedField: string | null;
  detectedTrack: string | null;
  unknownRoles:  string[];
  aiVerified:    boolean;
  stage1Ms:      number;
  stage2Ms:      number | null;
}

export interface OntologyResult {
  detectedField: string | null;
  detectedTrack: string | null;
  unknownRoles:  string[];
}

interface RawSection {
  name: string;
  lines: string[];
}

type ImportFormat = 'pdf' | 'docx' | 'json' | 'text';

// ─── Key detection ────────────────────────────────────────────────────────────

function getGeminiKey(): string | null {
  const rt = _rtGemini();
  if (rt) return rt;
  try {
    const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (s) { const p = JSON.parse(s); if (p.apiKey && !p.apiKey.startsWith('enc:v1:')) return p.apiKey.replace(/^"|"$/g, ''); }
    const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
    if (pk.gemini && !pk.gemini.startsWith('enc:v1:')) return pk.gemini.replace(/^"|"$/g, '');
  } catch { /* ignore */ }
  return null;
}

function getClaudeKey(): string | null {
  const rt = _rtClaude();
  if (rt) return rt;
  try {
    const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (s) { const p = JSON.parse(s); if (p.claudeApiKey && !p.claudeApiKey.startsWith('enc:v1:')) return p.claudeApiKey.replace(/^"|"$/g, ''); }
  } catch { /* ignore */ }
  return null;
}

/**
 * Returns true if any AI provider is available for Stage 2 verification.
 * Workers AI (via cv-engine-worker) is always available when the engine URL is set.
 */
export function hasAnyAiKey(): boolean {
  return !!import.meta.env.VITE_CV_ENGINE_URL;
}

/** Returns 'claude' | 'gemini' | 'workers-ai' based on what keys are available. */
function bestAvailableProvider(): 'claude' | 'gemini' | 'workers-ai' {
  if (getClaudeKey()) return 'claude';
  if (getGeminiKey()) return 'gemini';
  return 'workers-ai';
}

// ─── Section header detection ─────────────────────────────────────────────────

const SECTION_PATTERNS: Record<string, RegExp> = {
  experience:     /^(WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT\s+HISTORY|EMPLOYMENT|CAREER\s+HISTORY|PROFESSIONAL\s+EXPERIENCE|WORK\s+HISTORY)/i,
  education:      /^(EDUCATION|ACADEMIC\s+BACKGROUND|ACADEMIC\s+QUALIFICATIONS?|QUALIFICATIONS?|TRAINING\s+&\s+EDUCATION|TRAINING)/i,
  skills:         /^(SKILLS?|CORE\s+SKILLS?|TECHNICAL\s+SKILLS?|KEY\s+SKILLS?|COMPETENCIES|EXPERTISE|AREAS?\s+OF\s+EXPERTISE|TECHNICAL\s+COMPETENCIES)/i,
  summary:        /^(SUMMARY|PROFESSIONAL\s+SUMMARY|CAREER\s+SUMMARY|EXECUTIVE\s+SUMMARY|PROFILE|PROFESSIONAL\s+PROFILE|ABOUT\s+ME|ABOUT|OBJECTIVE|CAREER\s+OBJECTIVE|PERSONAL\s+STATEMENT|OVERVIEW|CAREER\s+OVERVIEW|INTRODUCTION|BIO|PERSONAL\s+PROFILE|PROFESSIONAL\s+BACKGROUND|PROFESSIONAL\s+STATEMENT|CAREER\s+PROFILE|PERSONAL\s+SUMMARY)/i,
  projects:       /^(PROJECTS?|PERSONAL\s+PROJECTS?|KEY\s+PROJECTS?|SELECTED\s+PROJECTS?|NOTABLE\s+PROJECTS?)/i,
  languages:      /^(LANGUAGES?|LANGUAGE\s+SKILLS?|SPOKEN\s+LANGUAGES?)/i,
  certifications: /^(CERTIFICATIONS?|CERTIFICATES?|LICENCES?|LICENSES?|ACCREDITATIONS?|PROFESSIONAL\s+CERTIFICATIONS?|PROFESSIONAL\s+DEVELOPMENT|CREDENTIALS?)/i,
  awards:         /^(AWARDS?|HONOURS?|HONORS?|ACHIEVEMENTS?|ACCOMPLISHMENTS?|AWARDS?\s+(&|AND)\s+HONOURS?|AWARDS?\s+(&|AND)\s+RECOGNITIONS?)/i,
  references:     /^(REFERENCES?|REFEREES?)/i,
  volunteer:      /^(VOLUNTEER(ING)?|VOLUNTARY\s+WORK|COMMUNITY\s+(SERVICE|INVOLVEMENT)|SOCIAL\s+WORK|CIVIC\s+ENGAGEMENT|NON-?PROFIT\s+WORK)/i,
  publications:   /^(PUBLICATIONS?|PAPERS?|RESEARCH\s+PAPERS?|JOURNAL\s+ARTICLES?|CONFERENCE\s+PAPERS?|PEER.REVIEWED|ARTICLES?\s+(&|AND)\s+PUBLICATIONS?)/i,
  hobbies:        /^(HOBBIES?\s+(&|AND)\s+INTERESTS?|HOBBIES?|PERSONAL\s+INTERESTS?|EXTRACURRICULAR\s+ACTIVITIES|INTERESTS\s+(&|AND)\s+HOBBIES?)/i,
  courses:        /^(COURSES?|ONLINE\s+COURSES?|TRAINING\s+COURSES?|PROFESSIONAL\s+COURSES?|CONTINUING\s+EDUCATION)/i,
};

/**
 * Returns { section, remainder } where remainder is any prose text that
 * appeared on the same line after the heading keyword (e.g. "Summary: I am…").
 * Returns null when the line is not a section heading.
 */
function detectSectionHeader(line: string): { section: string; remainder: string } | null {
  const trimmed = line.trim();
  if (trimmed.length < 3) return null;
  for (const [section, rx] of Object.entries(SECTION_PATTERNS)) {
    const m = trimmed.match(rx);
    if (m) {
      // Everything after the matched keyword (strip leading colon/dash/space)
      const remainder = trimmed.slice(m[0].length).replace(/^[\s:–—-]+/, '').trim();
      return { section, remainder };
    }
  }
  return null;
}

/** Split text into named sections. */
function splitIntoSections(lines: string[]): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection = { name: 'header', lines: [] };

  for (const line of lines) {
    const hit = detectSectionHeader(line);
    if (hit) {
      if (current.lines.length) sections.push(current);
      current = { name: hit.section, lines: [] };
      // Preserve text on the same line as the heading ("Summary: I am a…")
      if (hit.remainder) current.lines.push(hit.remainder);
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

// ─── Field extraction helpers ─────────────────────────────────────────────────

// Matches month-name dates AND year-ranges AND ISO dates (YYYY-MM-DD).
const DATE_PATTERN   = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s.]*\d{4}|\b\d{4}\s*[-–—]\s*(\d{4}|present|current|now)|\b\d{4}-\d{2}-\d{2}/i;
const BULLET_PATTERN = /^[\•\-\*\u2022\u25CF\u2013\u2014]\s+/;
// Match past-tense / gerund action verbs common in CVs (-ed, -ied, -ing) and
// Re-prefixed verbs.  Deliberately excludes -es / -e endings which falsely match
// proper nouns like "Accenture", "Software", "Deloitte".
const ACTION_VERB    = /^[A-Z][a-z]+(ed|ied|ing)\b|^Re-[a-z]+(ed|ied|ing)\b/;
// Matches common job-title keywords so inline-date text can be correctly identified
// as a role title rather than a company name.
const JOB_TITLE_RX   = /\b(engineer|manager|analyst|developer|intern|director|officer|specialist|coordinator|consultant|assistant|executive|architect|designer|lead|senior|junior|associate|attachment|supervisor|technician|scientist|researcher|strategist|advisor|head|vp|president|founder|ceo|cto|cfo|coo|accountant|administrator|representative|agent|officer|planner|programmer|writer|editor|nurse|doctor|therapist|auditor|controller)\b/i;

function extractEmail(text: string): string {
  const m = text.match(/[\w.+%-]+@[\w-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

function extractPhone(text: string): string {
  const m = text.match(/(\+?[\d][\d\s\-().]{6,14}\d)/);
  return m ? m[1].trim() : '';
}

function extractLinkedIn(text: string): string {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([\w-]+)\/?/i);
  return m ? `https://linkedin.com/in/${m[1]}` : '';
}

function extractGitHub(text: string): string {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/?/i);
  return m ? `https://github.com/${m[1]}` : '';
}

function extractWebsite(text: string): string {
  const m = text.match(/https?:\/\/(?!linkedin|github)[\w.-]+\.[a-z]{2,}[^\s]*/i);
  return m ? m[0] : '';
}

/** Extract a name from the first few lines of the header section. */
function extractName(lines: string[]): { name: string; confidence: number } {
  for (const line of lines.slice(0, 8)) {
    const clean = line.trim().replace(/[^\w\s'-]/g, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 &&
        !/@/.test(line) &&
        !DATE_PATTERN.test(line) &&
        !/\d{5}/.test(line) &&
        words.every(w => /^[A-Za-z'-]+$/.test(w))) {
      const titleCased = words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { name: titleCased, confidence: 75 };
    }
  }
  return { name: '', confidence: 0 };
}

/** Extract location from first 15 lines (City, STATE or City, Country patterns). */
function extractLocation(lines: string[]): string {
  for (const line of lines.slice(0, 15)) {
    const m = line.trim().match(/^([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,15})?),?\s+([A-Z]{2}|[A-Z][a-z]{2,20})\b/);
    if (m && !DATE_PATTERN.test(line)) return m[0].trim();
  }
  return '';
}

/**
 * Extract a date range string from a line, returning { startDate, endDate }.
 * Handles: "Jan 2020 – Present", "2020 – 2023", "Jan 2020 - Dec 2022",
 *          "2024-01-01 – Present" (ISO), "2021-02-01 – 2021-05-01".
 */
function extractDateRange(line: string): { startDate: string; endDate: string } {
  // ISO date range: "2024-01-01 – Present" or "2021-02-01 – 2021-05-01"
  const isoRangeRx = /(\d{4}-\d{2}-\d{2})\s*[-–—]+\s*(\d{4}-\d{2}-\d{2}|present|current|now)/i;
  const isoM = line.match(isoRangeRx);
  if (isoM) return { startDate: isoM[1].trim(), endDate: isoM[2].trim() };

  // ISO single date followed by "– Present"
  const isoPresRx = /(\d{4}-\d{2}-\d{2})\s*[-–—]+\s*(present|current|now)/i;
  const isoPresM = line.match(isoPresRx);
  if (isoPresM) return { startDate: isoPresM[1].trim(), endDate: isoPresM[2].trim() };

  // Month-name or year range: "Jan 2020 – Present", "2020 – 2023"
  const rangeRx = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|\b\d{4})\s*[-–—]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|present|current|now|\d{4})/i;
  const m = line.match(rangeRx);
  if (m) return { startDate: m[1].trim(), endDate: m[2].trim() };

  // ISO single date (no range)
  const isoSingle = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoSingle) return { startDate: isoSingle[1].trim(), endDate: 'Present' };

  // Month-name or plain year single date
  const single = line.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|\b(19|20)\d{2}\b)/i);
  return { startDate: single ? single[1].trim() : '', endDate: 'Present' };
}

/**
 * Strip all date tokens from a line and return the remaining text.
 * Handles ISO dates (YYYY-MM-DD), month-name dates, and year-ranges.
 * Used to find company/title when they share a line with the date.
 */
function stripDatesFromLine(line: string): string {
  return line
    .replace(/\d{4}-\d{2}-\d{2}/g, '')                                    // ISO dates
    .replace(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4})/ig, '') // month-name dates
    .replace(/\b(19|20)\d{2}\b/g, '')                                      // bare years
    .replace(/\b(present|current|now)\b/gi, '')                            // end-date keywords
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|,–—•]+|[\s|,–—•]+$/g, '')
    .trim();
}

/**
 * Parse work experience entries from section lines.
 *
 * Handles the most common CV formats:
 *   A) Company / Title / Date / Bullets  (most common, blank lines between entries)
 *   B) Company | Title | Date (all inline on one line)
 *   C) Date first → Company → Title → Bullets  (date-first)
 *   D) Contiguous entries (no blank lines, new date signals new entry)
 *   E) "Title at Company (2020–2023)" single-line header
 *
 * ALL non-bullet post-date lines are included as responsibilities so plain
 * paragraph descriptions are never silently dropped.
 */
function parseExperienceSection(lines: string[]): WorkExperience[] {
  // ── Phase 1: split into entry blocks ─────────────────────────────────────
  //
  // Two boundary conditions (either triggers a new block):
  //   1. Blank line + block already has date/bullets + next line is a header
  //   2. New date line when current block already has responsibilities bullets
  //      (handles contiguous entries — no blank lines between them)
  interface Block { lines: string[] }
  const blocks: Block[] = [];
  let cur: string[] = [];
  let curHasDate = false;
  let curHasResponsibilities = false;
  let lastWasBlank = false;

  const flushBlock = () => {
    if (cur.length) { blocks.push({ lines: cur }); cur = []; }
    curHasDate = false;
    curHasResponsibilities = false;
  };

  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) {
      if (cur.length) cur.push('');
      lastWasBlank = true;
      continue;
    }

    const isDate   = DATE_PATTERN.test(ln);
    const isBullet = BULLET_PATTERN.test(ln) || ACTION_VERB.test(ln);

    // Boundary 1: blank line separator after we have a complete entry
    if ((curHasDate || curHasResponsibilities) && lastWasBlank && !isDate && !isBullet && cur.length) {
      flushBlock();
    }

    // Boundary 2: new date line when current entry already has responsibilities.
    // "Clean" = after stripping dates, remaining text is short (< 40 chars) AND
    // doesn't contain sentence-glue words that indicate mid-sentence prose.
    // This avoids false splits on lines like "Grew sales since Dec 2023".
    const SENTENCE_WORDS = /\b(since|during|through|using|with|from|because|while|until|after|before|including|across|achieving|generating|exceeding|surpassing|resulting|contributing)\b/i;
    const isCleanDateLine = isDate
      && stripDatesFromLine(ln).length < 40
      && !SENTENCE_WORDS.test(ln);
    if (isCleanDateLine && curHasResponsibilities && cur.length) {
      flushBlock();
    }

    if (isDate) curHasDate = true;
    // Track ANY post-date content (not just bullet lines) so plain-text
    // responsibility paragraphs also trigger the contiguous-entry boundary.
    if (curHasDate && !isDate) curHasResponsibilities = true;

    cur.push(ln);
    lastWasBlank = false;
  }
  if (cur.length) blocks.push({ lines: cur });

  // ── Phase 2: parse each block into a WorkExperience ──────────────────────
  const experiences: WorkExperience[] = [];

  for (const block of blocks) {
    const nonEmpty = block.lines.filter(l => l.trim());
    if (!nonEmpty.length) continue;

    let company  = '';
    let jobTitle = '';
    let startDate = '';
    let endDate   = 'Present';
    const responsibilities: string[] = [];
    let dateFound = false;
    // How many post-date non-bullet lines have we already promoted to header fields.
    // Date-first CVs put company/title AFTER the date; allow up to 2 promotions.
    let postDateHeadersUsed = 0;

    for (const line of nonEmpty) {
      const isDate   = DATE_PATTERN.test(line);
      const isBullet = BULLET_PATTERN.test(line);

      // ── Date line ──────────────────────────────────────────────────────
      if (isDate && !dateFound) {
        dateFound = true;
        const dr = extractDateRange(line);
        startDate = dr.startDate;
        endDate   = dr.endDate;

        // Inline company/title on the same line: "Google | Engineer | Jan 2020 – Present"
        // or with comma: "Google, Engineer, Jan 2020 – Present"
        // or title-only: "Field & Sales Engineer - Irrigation Dept   2024-01-01 – Present"
        const withoutDate = stripDatesFromLine(line);
        if (withoutDate) {
          const pipeParts = withoutDate.split(/\s*\|\s*/);
          const commaParts = withoutDate.split(/\s*,\s*/);
          if (pipeParts.length >= 2) {
            if (!company)  company  = pipeParts[0].trim();
            if (!jobTitle) jobTitle = pipeParts[1].trim();
          } else if (commaParts.length >= 2 && commaParts[0].length < 50) {
            if (!company)  company  = commaParts[0].trim();
            if (!jobTitle) jobTitle = commaParts[1].trim();
          } else {
            // Single value inline — if it looks like a job title assign to jobTitle
            // (very common: "Software Engineer   Jan 2020 – Present" then company below)
            if (!jobTitle && JOB_TITLE_RX.test(withoutDate)) {
              jobTitle = withoutDate;
            } else if (!company) {
              company = withoutDate;
            }
          }
        }
        continue;
      }

      // ── Post-date lines ────────────────────────────────────────────────
      if (dateFound) {
        // Date-first format: allow up to 2 short, non-bullet, non-action-verb
        // post-date lines to become company/title when those slots are still empty.
        // ACTION_VERB lines (e.g. "Built API integrations…") must never be promoted.
        const isShortNonBullet = !isBullet && !ACTION_VERB.test(line) && line.length <= 80 && postDateHeadersUsed < 2;
        if (isShortNonBullet && (!company || !jobTitle)) {
          // Prioritise filling whichever header slot is still empty.
          // When jobTitle was already extracted from an inline date line (e.g.
          // "Field & Sales Engineer   2024-01-01 – Present"), the next post-date
          // short line is the company name, so fill company first.
          if (!company) {
            company = line;
            postDateHeadersUsed++;
          } else {
            jobTitle = line;
            postDateHeadersUsed++;
          }
          continue;
        }
        // Everything else is a responsibility (bullet, action verb, or plain desc)
        const clean = line.replace(BULLET_PATTERN, '').trim();
        if (clean) responsibilities.push(clean);
        continue;
      }

      // ── Pre-date header lines → company / title ───────────────────────
      if (!isBullet) {
        const pipeIdx = line.indexOf('|');
        if (pipeIdx > 0) {
          if (!company)  company  = line.slice(0, pipeIdx).trim();
          if (!jobTitle) jobTitle = line.slice(pipeIdx + 1).trim();
        } else if (!company) {
          company = line;
        } else if (!jobTitle) {
          jobTitle = line;
        }
      } else {
        // Bullet before date (capture it — some CVs list bullets without a header date)
        const clean = line.replace(BULLET_PATTERN, '').trim();
        if (clean) responsibilities.push(clean);
      }
    }

    // ── "Title at Company" or "Title — Company" decomposition ────────────
    // Handles both directions: text may have ended up in company OR jobTitle.
    const candidateForDecomp = (company && !jobTitle) ? 'company'
                             : (jobTitle && !company)  ? 'jobTitle'
                             : null;
    if (candidateForDecomp) {
      const src = candidateForDecomp === 'company' ? company : jobTitle;
      const atM  = src.match(/^(.+?)\s+at\s+(.+)$/i);
      const dashM = src.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (atM) {
        jobTitle = atM[1].trim();
        company  = atM[2].trim();
      } else if (dashM && dashM[1].split(/\s+/).length <= 5) {
        jobTitle = dashM[1].trim();
        company  = dashM[2].trim();
      }
    }

    if (company || jobTitle || startDate || responsibilities.length) {
      experiences.push({
        id:               `exp_${experiences.length + 1}_${Date.now()}`,
        company:          company.trim(),
        jobTitle:         jobTitle.trim(),
        startDate,
        endDate: endDate || 'Present',
        responsibilities: responsibilities.join('\n• '),
      });
    }
  }

  return experiences;
}

/** Parse education entries from section lines. */
function parseEducationSection(lines: string[]): Education[] {
  const DEGREE_RX = /\b(b\.?sc|b\.?a\.?|b\.?eng|b\.?tech|m\.?sc|m\.?a\.?|m\.?eng|m\.?b\.?a\.?|ph\.?d\.?|phd|doctorate|diploma|certificate|hnd|llb|llm|bcom|mcom|bachelor|master|degree|associate|a\.?s\.?|a\.?a\.?)\b/i;
  const INSTITUTION_RX = /\b(university|college|school|institute|academy|polytechnic|faculty|campus)\b/i;
  const entries: Education[] = [];

  // Split into blocks by blank lines — each block is one qualification
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      if (cur.length) { blocks.push(cur); cur = []; }
    } else {
      cur.push(t);
    }
  }
  if (cur.length) blocks.push(cur);

  for (const block of blocks) {
    let degree = ''; let school = ''; let year = '';

    // ── Single-line decomposition ────────────────────────────────────────
    // Handle: "BSc Computer Science, University of X, 2022"
    //         "University of X | BSc Computer Science (2022)"
    if (block.length === 1) {
      const line = block[0];
      // Extract year first
      const yearMatches = line.match(/\b((19|20)\d{2})\b/g);
      if (yearMatches) year = yearMatches[yearMatches.length - 1];

      const stripped = line
        .replace(/\b(19|20)\d{2}\b[\s\-–—]*((19|20)\d{2})?\b/g, '')
        .replace(/[()]/g, '')
        .trim();

      const parts = stripped.split(/\s*[,|]\s*/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (DEGREE_RX.test(part) && !degree) degree = part;
        else if ((INSTITUTION_RX.test(part) || !DEGREE_RX.test(part)) && !school && part.length > 2) school = part;
      }
      // If no institution keyword found in parts, treat non-degree part as school
      if (!school && parts.length > 1) {
        school = parts.find(p => !DEGREE_RX.test(p)) || '';
      }

      if (degree || school) {
        entries.push({ id: `edu_${entries.length + 1}_${Date.now()}`, degree: degree.trim(), school: school.trim(), graduationYear: year });
      }
      continue;
    }

    // ── Multi-line block parsing ──────────────────────────────────────────
    for (const trimmed of block) {
      // Year: prefer the latest year in the block
      const yearMatch = trimmed.match(/\b((19|20)\d{2})\b/g);
      if (yearMatch) year = yearMatch[yearMatch.length - 1];

      // Pure date-only line → skip (year already captured)
      const isDateOnly = DATE_PATTERN.test(trimmed) && stripDatesFromLine(trimmed) === '';
      if (isDateOnly) continue;

      const cleanLine = trimmed
        .replace(/\b(19|20)\d{2}\b[\s\-–—]*((19|20)\d{2})?\b/g, '')
        .replace(/[()]/g, '')
        .replace(/\s*[|\-–—,]\s*$/g, '')
        .trim();

      if (!cleanLine) continue;

      // Pipe-separated inline on one line: "School | Program" or "Program | School"
      if (cleanLine.includes('|')) {
        const [left, right] = cleanLine.split(/\s*\|\s*/);
        const leftIsInst = INSTITUTION_RX.test(left);
        const rightIsInst = INSTITUTION_RX.test(right);
        const leftIsDeg  = DEGREE_RX.test(left);
        const rightIsDeg = DEGREE_RX.test(right);
        // Prefer explicit keyword signals; fall back to left=school, right=degree
        if (!school) school = leftIsInst ? left : (rightIsInst ? right : (leftIsDeg ? right : left));
        if (!degree) degree = rightIsDeg ? right : (leftIsDeg  ? left  : (rightIsInst ? left : right));
        continue;
      }

      if (DEGREE_RX.test(cleanLine)) {
        if (!degree) degree = cleanLine;
      } else if (!school && cleanLine.length > 2) {
        school = cleanLine;
      } else if (school && !degree && cleanLine.length > 2) {
        degree = cleanLine;
      }
    }

    if (degree || school) {
      entries.push({ id: `edu_${entries.length + 1}_${Date.now()}`, degree: degree.trim(), school: school.trim(), graduationYear: year.trim() });
    }
  }

  return entries;
}

/** Extract skills from section lines (comma/pipe/newline separated). */
function parseSkillsSection(lines: string[]): string[] {
  const raw = lines.join(', ');
  const skills = raw.split(/[,|•\n]/).map(s => s.replace(BULLET_PATTERN, '').trim()).filter(s => s.length > 1 && s.length < 60);
  return [...new Set(skills)].slice(0, 40);
}

/** Extract summary paragraph — joins all non-empty, non-bullet lines. */
function parseSummarySection(lines: string[]): string {
  return lines
    .map(l => l.trim())
    .filter(l => l.length > 5 && !BULLET_PATTERN.test(l))
    .join(' ')
    .trim();
}

/** Parse certifications/licenses into a CustomSection. */
function parseCertificationsSection(lines: string[]): import('../types').CustomSection | null {
  const items: import('../types').CustomSectionItem[] = [];
  let title = ''; let subtitle = ''; let year = '';

  const flush = () => {
    const t = title.trim();
    if (t) items.push({ id: `cert_${items.length + 1}_${Date.now()}`, title: t, subtitle: subtitle.trim() || undefined, year: year || undefined });
    title = ''; subtitle = ''; year = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    const yearMatch = trimmed.match(/\b((19|20)\d{2})\b/);
    if (yearMatch) year = year || yearMatch[1];
    const stripped = trimmed.replace(/\b(19|20)\d{2}\b.*$/, '').replace(/[|\-–]+$/, '').trim();
    if (BULLET_PATTERN.test(trimmed)) {
      // bullet line — treat as a cert title
      if (!title) { title = stripped.replace(BULLET_PATTERN, '').trim(); }
      else { flush(); title = stripped.replace(BULLET_PATTERN, '').trim(); }
    } else if (!title) {
      title = stripped;
    } else if (!subtitle && stripped && stripped !== title) {
      subtitle = stripped;
    } else if (stripped && stripped !== title && stripped !== subtitle) {
      // extra line — likely another cert on same block; flush first
      flush(); title = stripped;
    }
  }
  flush();

  if (!items.length) return null;
  return { id: `custom_cert_${Date.now()}`, type: 'certifications', label: 'Certifications', items };
}

/** Parse awards/achievements into a CustomSection. */
function parseAwardsSection(lines: string[]): import('../types').CustomSection | null {
  const items: import('../types').CustomSectionItem[] = [];
  let title = ''; let subtitle = ''; let year = '';

  const flush = () => {
    const t = title.trim();
    if (t) items.push({ id: `award_${items.length + 1}_${Date.now()}`, title: t, subtitle: subtitle.trim() || undefined, year: year || undefined });
    title = ''; subtitle = ''; year = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    const yearMatch = trimmed.match(/\b((19|20)\d{2})\b/);
    if (yearMatch) year = year || yearMatch[1];
    const stripped = trimmed.replace(/\b(19|20)\d{2}\b.*$/, '').replace(/[|\-–]+$/, '').replace(BULLET_PATTERN, '').trim();
    if (!stripped) continue;
    if (!title) { title = stripped; }
    else if (!subtitle) { subtitle = stripped; }
    else { flush(); title = stripped; }
  }
  flush();

  if (!items.length) return null;
  return { id: `custom_awards_${Date.now()}`, type: 'awards', label: 'Awards & Honours', items };
}

/** Parse references section. */
function parseReferencesSection(lines: string[]): import('../types').Reference[] {
  const refs: import('../types').Reference[] = [];
  let name = ''; let title = ''; let company = ''; let email = ''; let phone = ''; let relationship = '';

  const flush = () => {
    if (name.trim()) {
      refs.push({ id: `ref_${refs.length + 1}_${Date.now()}`, name: name.trim(), title: title.trim(), company: company.trim(), email: email.trim(), phone: phone.trim(), relationship: relationship.trim() });
    }
    name = ''; title = ''; company = ''; email = ''; phone = ''; relationship = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    if (/available\s+on\s+request|upon\s+request/i.test(trimmed)) continue;
    const emailMatch = trimmed.match(/[\w.+%-]+@[\w-]+\.[a-z]{2,}/i);
    if (emailMatch) { email = email || emailMatch[0]; continue; }
    const phoneMatch = trimmed.match(/(\+?[\d][\d\s\-().]{5,14}\d)/);
    if (phoneMatch && !name) { phone = phone || phoneMatch[1]; continue; }
    if (phoneMatch && name) { phone = phone || phoneMatch[1]; continue; }
    const stripped = trimmed.replace(BULLET_PATTERN, '').trim();
    if (!name) { name = stripped; }
    else if (!title) { title = stripped; }
    else if (!company) { company = stripped; }
    else if (!relationship) { relationship = stripped; }
  }
  flush();

  return refs.slice(0, 5);
}

/** Parse volunteer / community service into a CustomSection. */
function parseVolunteerSection(lines: string[]): import('../types').CustomSection | null {
  // Reuse experience-style parsing, then wrap in a CustomSection
  const experiences = parseExperienceSection(lines);
  if (!experiences.length) {
    // Fall back: treat each non-empty block as an item
    const items: import('../types').CustomSectionItem[] = [];
    let title = ''; let desc = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (title) { items.push({ id: `vol_${items.length + 1}_${Date.now()}`, title, description: desc || undefined }); title = ''; desc = ''; }
        continue;
      }
      if (!title) title = trimmed.replace(BULLET_PATTERN, '').trim();
      else desc += (desc ? ' ' : '') + trimmed.replace(BULLET_PATTERN, '').trim();
    }
    if (title) items.push({ id: `vol_${items.length + 1}_${Date.now()}`, title, description: desc || undefined });
    if (!items.length) return null;
    return { id: `custom_vol_${Date.now()}`, type: 'volunteer', label: 'Volunteer Work', items };
  }
  const items: import('../types').CustomSectionItem[] = experiences.map((e, i) => ({
    id: `vol_${i + 1}_${Date.now()}`,
    title: [e.jobTitle, e.company].filter(Boolean).join(' — '),
    subtitle: e.company && e.jobTitle ? e.company : undefined,
    year: e.startDate ? `${e.startDate}${e.endDate ? ' – ' + e.endDate : ''}` : undefined,
    description: e.responsibilities || undefined,
  }));
  return { id: `custom_vol_${Date.now()}`, type: 'volunteer', label: 'Volunteer Work', items };
}

/** Parse publications into a CustomSection. */
function parsePublicationsSection(lines: string[]): import('../types').CustomSection | null {
  const items: import('../types').CustomSectionItem[] = [];
  let title = ''; let subtitle = ''; let year = ''; let link = '';

  const flush = () => {
    const t = title.trim();
    if (t) items.push({ id: `pub_${items.length + 1}_${Date.now()}`, title: t, subtitle: subtitle.trim() || undefined, year: year || undefined, link: link || undefined });
    title = ''; subtitle = ''; year = ''; link = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    const urlMatch = trimmed.match(/https?:\/\/[\w./%-]+/);
    if (urlMatch) { link = link || urlMatch[0]; continue; }
    const yearMatch = trimmed.match(/\b((19|20)\d{2})\b/);
    if (yearMatch) year = year || yearMatch[1];
    const stripped = trimmed.replace(BULLET_PATTERN, '').trim();
    if (!title) { title = stripped; }
    else if (!subtitle) { subtitle = stripped; }
    else { flush(); title = stripped; }
  }
  flush();

  if (!items.length) return null;
  return { id: `custom_pub_${Date.now()}`, type: 'publications', label: 'Publications', items };
}

/** Parse hobbies/interests into a CustomSection. */
function parseHobbiesSection(lines: string[]): import('../types').CustomSection | null {
  const raw = lines.join(', ');
  const interests = raw.split(/[,|•\n]/).map(s => s.replace(BULLET_PATTERN, '').trim()).filter(s => s.length > 1 && s.length < 60);
  if (!interests.length) return null;
  const items: import('../types').CustomSectionItem[] = interests.map((t, i) => ({ id: `hobby_${i}_${Date.now()}`, title: t }));
  return { id: `custom_hobbies_${Date.now()}`, type: 'hobbies', label: 'Interests', items };
}

/** Parse short training/online course lines into a CustomSection. */
function parseCoursesSection(lines: string[]): import('../types').CustomSection | null {
  return parseCertificationsSection(lines)
    ? { ...(parseCertificationsSection(lines) as import('../types').CustomSection), id: `custom_courses_${Date.now()}`, type: 'courses', label: 'Courses & Training' }
    : null;
}

/** Extract projects. */
function parseProjectsSection(lines: string[]): Project[] {
  const projects: Project[] = [];
  let name = ''; let desc = ''; let link = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (name) { projects.push({ id: `proj_${projects.length + 1}_${Date.now()}`, name, description: desc, link }); name = ''; desc = ''; link = ''; }
      continue;
    }
    const urlMatch = trimmed.match(/https?:\/\/[\w./%-]+/);
    if (urlMatch) { link = urlMatch[0]; continue; }
    if (!name) { name = trimmed; }
    else if (BULLET_PATTERN.test(trimmed) || trimmed.length > 30) { desc += (desc ? ' ' : '') + trimmed.replace(BULLET_PATTERN, '').trim(); }
  }
  if (name) projects.push({ id: `proj_${projects.length + 1}_${Date.now()}`, name, description: desc, link });
  return projects.slice(0, 6);
}

// ─── Stage 1: Heuristic parse ─────────────────────────────────────────────────

export interface HeuristicResult {
  profile:    UserProfile;
  confidence: Record<string, number>;
  rawSections: Record<string, string>;
}

export function heuristicParse(text: string): HeuristicResult {
  const lines   = text.split(/\r?\n/).map(l => l.trimEnd());
  const sections = splitIntoSections(lines);
  const confidence: Record<string, number> = {};
  const rawSections: Record<string, string> = {};

  // Build raw section text map for Stage 2 targeted AI
  for (const sec of sections) {
    rawSections[sec.name] = sec.lines.join('\n');
  }

  const headerSection = sections.find(s => s.name === 'header');
  const headerLines   = headerSection?.lines || lines.slice(0, 20);
  const fullText      = lines.join('\n');

  // ── Personal info ──
  const { name, confidence: nameConf } = extractName(headerLines);
  const email    = extractEmail(fullText);
  const phone    = extractPhone(fullText);
  const linkedin = extractLinkedIn(fullText);
  const github   = extractGitHub(fullText);
  const website  = extractWebsite(fullText);
  const location = extractLocation(headerLines);

  confidence['personalInfo.name']     = nameConf;
  confidence['personalInfo.email']    = email    ? 95 : 0;
  confidence['personalInfo.phone']    = phone    ? 88 : 0;
  confidence['personalInfo.linkedin'] = linkedin ? 95 : 50;
  confidence['personalInfo.github']   = github   ? 95 : 50;
  confidence['personalInfo.website']  = website  ? 80 : 50;
  confidence['personalInfo.location'] = location ? 70 : 40;

  // ── Summary ──
  let summarySection = sections.find(s => s.name === 'summary');
  let summary = summarySection ? parseSummarySection(summarySection.lines) : '';

  // Fallback: many CVs place a summary paragraph directly after contact info
  // with no section heading.  If we found nothing above, scan the header
  // section for prose lines that look like a summary (long, not contact info).
  if (!summary && headerSection) {
    const CONTACT_LINE = /[@+\d().\-]{4,}|linkedin|github|http|www\./i;
    const proseLines = headerSection.lines.filter(l => {
      const t = l.trim();
      return t.length > 40 && !CONTACT_LINE.test(t) && !/^\d/.test(t);
    });
    if (proseLines.length) {
      summary = parseSummarySection(proseLines);
    }
  }
  confidence['summary'] = summary ? 65 : 0;

  // ── Experience ──
  const expSection = sections.find(s => s.name === 'experience');
  const workExperience = expSection ? parseExperienceSection(expSection.lines) : [];
  confidence['workExperience'] = workExperience.length > 0 ? 70 : 30;

  // ── Education ──
  const eduSection = sections.find(s => s.name === 'education');
  const education = eduSection ? parseEducationSection(eduSection.lines) : [];
  confidence['education'] = education.length > 0 ? 78 : 0;

  // ── Skills ──
  const skillSection = sections.find(s => s.name === 'skills');
  const skills = skillSection ? parseSkillsSection(skillSection.lines) : [];
  confidence['skills'] = skills.length > 0 ? 75 : 0;

  // ── Projects ──
  const projSection = sections.find(s => s.name === 'projects');
  const projects = projSection ? parseProjectsSection(projSection.lines) : [];
  confidence['projects'] = projects.length > 0 ? 68 : 50;

  // ── Languages ──
  const langSection = sections.find(s => s.name === 'languages');
  const languages: Language[] = langSection
    ? langSection.lines
        .map(l => l.trim()).filter(Boolean)
        .map((l, i) => {
          const parts = l.split(/[-–:,]/);
          return { id: `lang_${i}_${Date.now()}`, name: parts[0]?.trim() || l, proficiency: parts[1]?.trim() || '' };
        })
    : [];

  // ── Certifications ──
  const certSection = sections.find(s => s.name === 'certifications');
  const certCustom = certSection ? parseCertificationsSection(certSection.lines) : null;
  confidence['certifications'] = certCustom ? 75 : 50;

  // ── Awards ──
  const awardsSection = sections.find(s => s.name === 'awards');
  const awardsCustom = awardsSection ? parseAwardsSection(awardsSection.lines) : null;
  confidence['awards'] = awardsCustom ? 72 : 50;

  // ── References ──
  const refSection = sections.find(s => s.name === 'references');
  const references = refSection ? parseReferencesSection(refSection.lines) : [];
  confidence['references'] = references.length > 0 ? 70 : 50;

  // ── Volunteer ──
  const volSection = sections.find(s => s.name === 'volunteer');
  const volCustom = volSection ? parseVolunteerSection(volSection.lines) : null;
  confidence['volunteer'] = volCustom ? 70 : 50;

  // ── Publications ──
  const pubSection = sections.find(s => s.name === 'publications');
  const pubCustom = pubSection ? parsePublicationsSection(pubSection.lines) : null;
  confidence['publications'] = pubCustom ? 70 : 50;

  // ── Hobbies / Interests ──
  const hobbiesSection = sections.find(s => s.name === 'hobbies');
  const hobbiesCustom = hobbiesSection ? parseHobbiesSection(hobbiesSection.lines) : null;

  // ── Courses ──
  const coursesSection = sections.find(s => s.name === 'courses');
  const coursesCustom = coursesSection ? parseCoursesSection(coursesSection.lines) : null;

  // Build ordered customSections — only include non-null ones
  const customSections = [certCustom, awardsCustom, volCustom, pubCustom, hobbiesCustom, coursesCustom].filter(Boolean) as import('../types').CustomSection[];

  const profile: UserProfile = {
    personalInfo: { name, email, phone, location, linkedin, website, github },
    summary,
    workExperience,
    education,
    skills,
    projects: projects.length ? projects : undefined,
    languages: languages.length ? languages : undefined,
    references: references.length ? references : undefined,
    customSections: customSections.length ? customSections : undefined,
  };

  return { profile, confidence, rawSections };
}

// ─── Stage 1: Ontology classification ────────────────────────────────────────

export function classifyImportedRoles(workExperience: WorkExperience[]): OntologyResult {
  if (!workExperience.length) return { detectedField: null, detectedTrack: null, unknownRoles: [] };

  // Layer 1 — ROLE_TRACKS keyword scoring
  const corpus = workExperience.map(e => `${e.jobTitle} ${e.responsibilities}`).join(' ').toLowerCase();
  let bestTrack = '';
  let bestScore = 0;
  for (const track of ROLE_TRACKS) {
    const score = track.keywords.filter(kw => corpus.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestTrack = track.name; }
  }

  // Layer 2 — detectField using profile titles
  const partialProfile: Pick<UserProfile, 'workExperience' | 'personalInfo' | 'summary' | 'education' | 'skills'> = {
    personalInfo:   { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
    summary:        '',
    workExperience,
    education:      [],
    skills:         [],
  };
  const detectedField = detectField(undefined, partialProfile as UserProfile);
  const fieldSlug = detectedField !== 'general' ? detectedField : null;

  // Layer 3 — unknown roles (titles not matched by TITLE_FIELD_MAP, i.e. field stayed 'general')
  const unknownRoles = detectedField === 'general'
    ? workExperience.map(e => e.jobTitle).filter(Boolean).slice(0, 5)
    : [];

  return {
    detectedField: fieldSlug,
    detectedTrack: bestScore > 0 ? bestTrack : null,
    unknownRoles,
  };
}

/** Fire-and-forget unknown role titles to the D1 ontology queue. */
function queueUnknownRoles(roles: string[]): void {
  if (!roles.length) return;
  const engineUrl = import.meta.env.VITE_CV_ENGINE_URL;
  if (!engineUrl) return;
  const seen: string[] = JSON.parse(sessionStorage.getItem('_unknownRolesQueued') || '[]');
  const newRoles = roles.filter(r => !seen.includes(r));
  if (!newRoles.length) return;
  sessionStorage.setItem('_unknownRolesQueued', JSON.stringify([...seen, ...newRoles]));
  fetch(`${engineUrl}/api/ontology/unknown-roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: newRoles }),
  }).catch(() => { /* fire-and-forget */ });
}

// ─── Stage 2: AI verification ─────────────────────────────────────────────────

const PARSE_SCHEMA = `{
  "personalInfo": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "", "github": "" },
  "summary": "",
  "workExperience": [{ "id": "", "company": "", "jobTitle": "", "startDate": "", "endDate": "", "responsibilities": "" }],
  "education": [{ "id": "", "degree": "", "school": "", "graduationYear": "" }],
  "skills": [],
  "projects": [{ "id": "", "name": "", "description": "", "link": "" }],
  "languages": [{ "id": "", "name": "", "proficiency": "" }],
  "references": [{ "id": "", "name": "", "title": "", "company": "", "email": "", "phone": "", "relationship": "" }],
  "customSections": [{ "id": "", "type": "", "label": "", "items": [{ "id": "", "title": "", "subtitle": "", "year": "", "description": "", "link": "" }] }]
}`;

function buildAiVerifyPrompt(profile: UserProfile, lowConfFields: string[], rawSections: Record<string, string>): string {
  const lowSections: Record<string, string> = {};
  for (const field of lowConfFields) {
    const section = field.split('.')[0];
    if (rawSections[section]) lowSections[section] = rawSections[section].slice(0, 2000);
  }

  return [
    `You are a CV parser. The heuristic parser already extracted a partial profile below.`,
    `Low-confidence fields: ${lowConfFields.join(', ')}.`,
    `Patch ONLY those fields using the raw CV text sections provided. Keep all other fields exactly as-is.`,
    `Return ONLY a raw JSON object matching this schema:\n${PARSE_SCHEMA}`,
    `\n=== CURRENT PARTIAL PROFILE ===\n${JSON.stringify(profile, null, 2).slice(0, 4000)}`,
    Object.keys(lowSections).length
      ? `\n=== RAW CV SECTIONS FOR LOW-CONFIDENCE FIELDS ===\n${Object.entries(lowSections).map(([k, v]) => `[${k.toUpperCase()}]\n${v}`).join('\n\n')}`
      : '',
  ].join('\n');
}

function mergeAiPatch(base: UserProfile, aiResult: Partial<UserProfile>, lowConfFields: string[]): UserProfile {
  const merged: UserProfile = { ...base };
  for (const field of lowConfFields) {
    const top = field.split('.')[0] as keyof UserProfile;
    if (top === 'personalInfo' && aiResult.personalInfo) {
      const subField = field.split('.')[1] as keyof typeof aiResult.personalInfo;
      if (subField && aiResult.personalInfo[subField]) {
        merged.personalInfo = { ...merged.personalInfo, [subField]: aiResult.personalInfo[subField] };
      }
    } else if (top === 'summary' && aiResult.summary) {
      merged.summary = aiResult.summary;
    } else if (top === 'workExperience' && aiResult.workExperience?.length) {
      // AI may have better parsed structure — use if it found more entries or filled gaps
      if (aiResult.workExperience.length >= base.workExperience.length) {
        merged.workExperience = aiResult.workExperience.map((e, i) => ({
          id: base.workExperience[i]?.id || e.id || `exp_${i + 1}_${Date.now()}`,
          company:  e.company || base.workExperience[i]?.company || '',
          jobTitle: e.jobTitle || base.workExperience[i]?.jobTitle || '',
          startDate: e.startDate || base.workExperience[i]?.startDate || '',
          endDate:   e.endDate || base.workExperience[i]?.endDate || 'Present',
          responsibilities: e.responsibilities || base.workExperience[i]?.responsibilities || '',
        }));
      }
    } else if (top === 'education' && aiResult.education?.length) {
      merged.education = aiResult.education.map((e, i) => ({
        id: base.education[i]?.id || e.id || `edu_${i + 1}_${Date.now()}`,
        degree: e.degree || base.education[i]?.degree || '',
        school: e.school || base.education[i]?.school || '',
        graduationYear: e.graduationYear || base.education[i]?.graduationYear || '',
      }));
    } else if (top === 'skills' && aiResult.skills?.length) {
      merged.skills = aiResult.skills;
    } else if (top === 'references' && aiResult.references?.length) {
      merged.references = aiResult.references;
    } else if (['certifications', 'awards', 'volunteer', 'publications', 'hobbies', 'courses', 'customSections'].includes(top) && aiResult.customSections?.length) {
      // Merge: AI result wins for section types it returns (overrides weak Stage 1 items),
      // and keeps Stage 1 sections for types AI didn't touch.
      const existing = merged.customSections ?? [];
      const aiByType = new Map(aiResult.customSections.map(s => [s.type, s]));
      const merged1 = existing.map(s => {
        const aiVersion = aiByType.get(s.type);
        if (aiVersion && aiVersion.items.length > 0) {
          // AI has a version for this type — use it if it has more/better items
          return aiVersion.items.length >= s.items.length ? aiVersion : s;
        }
        return s;
      });
      // Also add types that only AI found (not in Stage 1 at all)
      const existingTypes = new Set(existing.map(s => s.type));
      const aiOnly = aiResult.customSections.filter(s => !existingTypes.has(s.type));
      merged.customSections = [...merged1, ...aiOnly];
    }
  }
  return merged;
}

export async function aiVerifyImport(
  profile:     UserProfile,
  confidence:  Record<string, number>,
  rawSections: Record<string, string>,
): Promise<UserProfile> {
  const lowConfFields = Object.entries(confidence)
    .filter(([, v]) => v < 70)
    .map(([k]) => k);

  if (!lowConfFields.length) return profile;

  const prompt = buildAiVerifyPrompt(profile, lowConfFields, rawSections);
  const provider = bestAvailableProvider();
  let raw = '';

  if (provider === 'claude') {
    const apiKey = getClaudeKey()!;
    raw = await workerProxyLLM('parser', prompt, { provider: 'claude', apiKey, maxTokens: 3000, temperature: 0.1, json: true, timeoutMs: 30_000 }) || '';
  } else if (provider === 'gemini') {
    const apiKey = getGeminiKey()!;
    raw = await workerProxyLLM('parser', prompt, { provider: 'gemini', apiKey, maxTokens: 3000, temperature: 0.1, json: true, timeoutMs: 30_000 }) || '';
  } else {
    raw = await workerTieredLLM('parser', prompt, { temperature: 0.1, json: true }) || '';
  }

  if (!raw) return profile;

  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed  = JSON.parse(cleaned);
    return mergeAiPatch(profile, parsed, lowConfFields);
  } catch {
    return profile;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface RunImportPipelineOpts {
  /** Called immediately when Stage 1 finishes — lets UI update before Stage 2 runs. */
  onStage1Complete?: (result: Pick<ImportResult, 'profile' | 'confidence' | 'detectedField' | 'detectedTrack'>) => void;
  /** Called when Stage 2 AI verification finishes. */
  onStage2Complete?: (verified: UserProfile, provider: string) => void;
  /** If true, skip Stage 2 even if a key is available. */
  skipAi?: boolean;
}

/**
 * Main orchestrator. Call after format-specific text extraction.
 *
 * For JSON format, pass the already-parsed UserProfile object as `input`.
 * For PDF/DOCX/text, pass the extracted text string.
 */
export async function runImportPipeline(
  input:   string | UserProfile,
  format:  ImportFormat,
  opts:    RunImportPipelineOpts = {},
): Promise<ImportResult> {
  const t0 = performance.now();

  // ── Stage 1 ──────────────────────────────────────────────────────────────
  let profile:    UserProfile;
  let confidence: Record<string, number>;
  let rawSections: Record<string, string> = {};

  if (format === 'json') {
    // JSON is already structured — high confidence by default
    profile    = input as UserProfile;
    confidence = {
      'personalInfo.name':     profile.personalInfo?.name     ? 92 : 0,
      'personalInfo.email':    profile.personalInfo?.email    ? 95 : 0,
      'personalInfo.phone':    profile.personalInfo?.phone    ? 90 : 0,
      'personalInfo.location': profile.personalInfo?.location ? 88 : 0,
      'personalInfo.linkedin': profile.personalInfo?.linkedin ? 95 : 50,
      'personalInfo.github':   profile.personalInfo?.github   ? 95 : 50,
      'personalInfo.website':  profile.personalInfo?.website  ? 90 : 50,
      'summary':               profile.summary ? 85 : 0,
      'workExperience':        profile.workExperience?.length ? 90 : 0,
      'education':             profile.education?.length      ? 90 : 0,
      'skills':                profile.skills?.length         ? 88 : 0,
      'projects':              profile.projects?.length       ? 85 : 50,
    };
  } else {
    const text = input as string;
    const { cleaned } = cleanImportedText(text);
    const parsed = heuristicParse(cleaned);
    profile    = parsed.profile;
    confidence = parsed.confidence;
    rawSections = parsed.rawSections;
  }

  const stage1Ms = performance.now() - t0;

  // ── Ontology ──────────────────────────────────────────────────────────────
  const ontology = classifyImportedRoles(profile.workExperience || []);
  if (ontology.unknownRoles.length) queueUnknownRoles(ontology.unknownRoles);

  // Stamp ontology + import source on the profile
  profile = {
    ...profile,
    detectedField: ontology.detectedField ?? undefined,
    detectedTrack: ontology.detectedTrack ?? undefined,
    importSource:  format,
  };

  // Notify UI that Stage 1 is done
  opts.onStage1Complete?.({
    profile,
    confidence,
    detectedField: ontology.detectedField,
    detectedTrack: ontology.detectedTrack,
  });

  // ── Stage 1 monitoring ────────────────────────────────────────────────────
  const lowConf  = Object.entries(confidence).filter(([, v]) => v < 70).map(([k]) => k);
  const highConf = Object.entries(confidence).filter(([, v]) => v >= 70).map(([k]) => k);
  const avgConf  = Object.values(confidence).length
    ? Math.round(Object.values(confidence).reduce((a, b) => a + b, 0) / Object.values(confidence).length)
    : 0;
  console.group(`[ImportPipeline] Stage 1 — ${format.toUpperCase()} | ${Math.round(stage1Ms)}ms | avg confidence ${avgConf}%`);
  console.log(`  ✓ High confidence (≥70%): ${highConf.join(', ') || 'none'}`);
  if (lowConf.length) console.warn(`  ⚠ Low confidence (<70%): ${lowConf.join(', ')}`);
  console.log(`  Field: ${ontology.detectedField ?? '(undetected)'} | Track: ${ontology.detectedTrack ?? '(undetected)'}`);
  console.log(`  Experience entries: ${profile.workExperience?.length ?? 0} | Education: ${profile.education?.length ?? 0} | Skills: ${profile.skills?.length ?? 0}`);
  console.groupEnd();

  // ── Stage 2 (background AI verification) ─────────────────────────────────
  const runAi = !opts.skipAi && hasAnyAiKey();
  const anyLowConf = lowConf.length > 0;

  if (!runAi || (format === 'json' && !anyLowConf)) {
    console.log(`[ImportPipeline] Stage 2 skipped — ${!runAi ? 'no AI available' : 'all fields high-confidence'}`);
    return {
      profile,
      confidence,
      detectedField: ontology.detectedField,
      detectedTrack: ontology.detectedTrack,
      unknownRoles:  ontology.unknownRoles,
      aiVerified:    false,
      stage1Ms,
      stage2Ms:      null,
    };
  }

  const t2 = performance.now();
  const provider = bestAvailableProvider();
  let verifiedProfile = profile;
  let stage2Succeeded = false;

  console.log(`[ImportPipeline] Stage 2 starting — provider: ${provider} | patching ${lowConf.length} low-confidence field(s): ${lowConf.join(', ')}`);

  try {
    verifiedProfile = await Promise.race([
      aiVerifyImport(profile, confidence, rawSections),
      new Promise<UserProfile>((_, reject) => setTimeout(() => reject(new Error('stage2_timeout_20s')), 20_000)),
    ]);
    stage2Succeeded = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[ImportPipeline] Stage 2 failed — provider: ${provider} | reason: ${msg} | using Stage 1 result`);
    verifiedProfile = profile;
  }

  const stage2Ms = performance.now() - t2;
  console.log(`[ImportPipeline] Stage 2 ${stage2Succeeded ? '✓ complete' : '✗ fell back to Stage 1'} — ${Math.round(stage2Ms)}ms via ${provider}`);
  opts.onStage2Complete?.(verifiedProfile, provider);

  return {
    profile:      verifiedProfile,
    confidence,
    detectedField: ontology.detectedField,
    detectedTrack: ontology.detectedTrack,
    unknownRoles:  ontology.unknownRoles,
    aiVerified:    stage2Succeeded,
    stage1Ms,
    stage2Ms,
  };
}
