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
  skills:         /^(SKILLS?|CORE\s+SKILLS?|TECHNICAL\s+SKILLS?|KEY\s+SKILLS?|COMPETENCIES|EXPERTISE|AREAS?\s+OF\s+EXPERTISE)/i,
  summary:        /^(SUMMARY|PROFESSIONAL\s+SUMMARY|CAREER\s+SUMMARY|EXECUTIVE\s+SUMMARY|PROFILE|PROFESSIONAL\s+PROFILE|ABOUT\s+ME|ABOUT|OBJECTIVE|CAREER\s+OBJECTIVE)/i,
  projects:       /^(PROJECTS?|PERSONAL\s+PROJECTS?|KEY\s+PROJECTS?|SELECTED\s+PROJECTS?|RESEARCH\s+PROJECTS?|RESEARCH)/i,
  languages:      /^(LANGUAGES?|LANGUAGE\s+SKILLS?|SPOKEN\s+LANGUAGES?)/i,
  certifications: /^(CERTIFICATIONS?|CERTIFICATES?|LICENCES?|LICENSES?|ACCREDITATIONS?|PROFESSIONAL\s+CERTIFICATIONS?)/i,
  awards:         /^(AWARDS?|HONOURS?|HONORS?|ACHIEVEMENTS?|ACCOMPLISHMENTS?)/i,
  references:     /^(REFERENCES?|REFEREES?)/i,
};

function detectSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return null;
  for (const [section, rx] of Object.entries(SECTION_PATTERNS)) {
    if (rx.test(trimmed)) return section;
  }
  return null;
}

/** Split text into named sections. */
function splitIntoSections(lines: string[]): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection = { name: 'header', lines: [] };

  for (const line of lines) {
    const section = detectSectionHeader(line);
    if (section) {
      if (current.lines.length) sections.push(current);
      current = { name: section, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);
  return sections;
}

// ─── Field extraction helpers ─────────────────────────────────────────────────

const DATE_PATTERN   = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s.]*\d{4}|\b\d{4}\s*[-–—]\s*(\d{4}|present|current|now)/i;
const BULLET_PATTERN = /^[\•\-\*\u2022\u25CF\u2013\u2014]\s+/;
const ACTION_VERB    = /^[A-Z][a-z]+(ed|ing|es?)\b/;

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

/** Parse work experience entries from section lines. */
function parseExperienceSection(lines: string[]): WorkExperience[] {
  const experiences: WorkExperience[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Look for a date line — marks the start of an entry or the date for an entry
    let company = '';
    let jobTitle = '';
    let startDate = '';
    let endDate = '';
    const bullets: string[] = [];

    // Try to find company/title above the date
    if (DATE_PATTERN.test(line)) {
      // date is on this line — look back for company/title
      const dateMatch = line.match(/(.*?)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\w.]*[\s.]*\d{4}[\s\-–—]*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\w.]*[\s.]*\d{4}|present|current|now|\d{4}))/i);
      if (dateMatch) {
        const datePart = dateMatch[2] || line;
        const rangeParts = datePart.split(/[\-–—]+/);
        startDate = rangeParts[0]?.trim() || '';
        endDate   = rangeParts[1]?.trim() || 'Present';
      }
      // Peek backwards for company/title (already consumed as previous lines)
      // peek forwards for responsibilities
      i++;
      while (i < lines.length) {
        const bLine = lines[i].trim();
        if (!bLine) { i++; break; }
        if (DATE_PATTERN.test(bLine) && !BULLET_PATTERN.test(bLine)) break;
        if (BULLET_PATTERN.test(bLine) || ACTION_VERB.test(bLine)) {
          bullets.push(bLine.replace(BULLET_PATTERN, '').trim());
        }
        i++;
      }
    } else {
      // Non-date line: could be company or job title
      company = line;
      i++;
      // Next non-empty line: likely job title or date
      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length) {
        const nextLine = lines[i].trim();
        if (DATE_PATTERN.test(nextLine)) {
          // date is on next line — no explicit job title
          const rangeParts = nextLine.split(/[\-–—]+/);
          startDate = rangeParts[0]?.trim() || '';
          endDate   = rangeParts[1]?.trim() || 'Present';
          i++;
        } else if (!BULLET_PATTERN.test(nextLine) && !ACTION_VERB.test(nextLine)) {
          // likely job title
          jobTitle = nextLine;
          i++;
          // Look for date next
          while (i < lines.length && !lines[i].trim()) i++;
          if (i < lines.length && DATE_PATTERN.test(lines[i].trim())) {
            const dateLine = lines[i].trim();
            const rangeParts = dateLine.split(/[\-–—]+/);
            startDate = rangeParts[0]?.trim() || '';
            endDate   = rangeParts[1]?.trim() || 'Present';
            i++;
          }
        }
      }
      // Collect bullets
      while (i < lines.length) {
        const bLine = lines[i].trim();
        if (!bLine) { i++; if (i < lines.length && !lines[i]?.trim()) break; continue; }
        if (DATE_PATTERN.test(bLine) && !BULLET_PATTERN.test(bLine) && bullets.length > 0) break;
        if (bLine.length > 5 && bLine === bLine.toUpperCase() && bLine.length < 60) break;
        if (BULLET_PATTERN.test(bLine) || ACTION_VERB.test(bLine)) {
          bullets.push(bLine.replace(BULLET_PATTERN, '').trim());
        }
        i++;
      }
    }

    if (company || jobTitle || bullets.length) {
      experiences.push({
        id:               `exp_${experiences.length + 1}_${Date.now()}`,
        company:          company,
        jobTitle:         jobTitle,
        startDate:        startDate,
        endDate:          endDate || 'Present',
        responsibilities: bullets.join('\n• '),
      });
    }
  }

  return experiences;
}

/** Parse education entries from section lines. */
function parseEducationSection(lines: string[]): Education[] {
  const DEGREE_RX = /\b(b\.?sc|b\.?a|b\.?eng|b\.?tech|m\.?sc|m\.?a|m\.?eng|m\.?b\.?a|ph\.?d|phd|doctorate|diploma|certificate|hnd|llb|llm|bcom|mcom|bachelor|master|degree|associate)\b/i;
  const entries: Education[] = [];
  let degree = ''; let school = ''; let year = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (degree || school) {
        entries.push({ id: `edu_${entries.length + 1}_${Date.now()}`, degree, school, graduationYear: year });
        degree = ''; school = ''; year = '';
      }
      continue;
    }
    const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) year = yearMatch[0];
    if (DEGREE_RX.test(trimmed)) {
      degree = trimmed.replace(/\b(19|20)\d{2}\b/, '').trim();
    } else if (!school && trimmed.length > 3 && !DATE_PATTERN.test(trimmed)) {
      school = trimmed;
    }
  }
  if (degree || school) {
    entries.push({ id: `edu_${entries.length + 1}_${Date.now()}`, degree, school, graduationYear: year });
  }
  return entries;
}

/** Extract skills from section lines (comma/pipe/newline separated). */
function parseSkillsSection(lines: string[]): string[] {
  const raw = lines.join(', ');
  const skills = raw.split(/[,|•\n]/).map(s => s.replace(BULLET_PATTERN, '').trim()).filter(s => s.length > 1 && s.length < 60);
  return [...new Set(skills)].slice(0, 40);
}

/** Extract summary paragraph. */
function parseSummarySection(lines: string[]): string {
  return lines
    .map(l => l.trim())
    .filter(l => l.length > 20 && !BULLET_PATTERN.test(l))
    .slice(0, 5)
    .join(' ');
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
  const summarySection = sections.find(s => s.name === 'summary');
  const summary = summarySection ? parseSummarySection(summarySection.lines) : '';
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

  const profile: UserProfile = {
    personalInfo: { name, email, phone, location, linkedin, website, github },
    summary,
    workExperience,
    education,
    skills,
    projects: projects.length ? projects : undefined,
    languages: languages.length ? languages : undefined,
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
  "languages": [{ "id": "", "name": "", "proficiency": "" }]
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
