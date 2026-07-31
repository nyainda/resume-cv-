/**
 * vaultAnalysis.ts — Structured extraction of job description fields.
 *
 * Two-tier approach:
 *   1. LLM via workerTieredLLM (when CF Worker is available) — accurate, handles
 *      any format (screenshot OCR, PDF, plain paste, URL dump).
 *   2. Heuristic fallback — regex + line-scanning, works offline / without auth.
 *
 * The result is patched back onto the VaultJob record asynchronously so the
 * card renders immediately with partial data and enriches in the background.
 */

import { workerTieredLLM } from './cvEngineClient';

export interface VaultJobInsights {
  company:      string;
  title:        string;
  email:        string | null;
  website:      string | null;
  tldr:         string;
  requirements: string[];
  salary:       string | null;
}

// ─── LLM extraction ───────────────────────────────────────────────────────────

const SYSTEM = 'You are a job description parser. Return only valid JSON, no markdown.';

function buildPrompt(rawJd: string): string {
  const truncated = rawJd.slice(0, 4000);
  return `Parse this job description and return a JSON object with exactly these keys:
{
  "company":      "<company name, never null>",
  "title":        "<job title / role, never null>",
  "email":        "<application or HR email address if present, else null>",
  "website":      "<direct application URL or company careers page if present, else null>",
  "tldr":         "<2–3 sentence plain-English summary: what the company does, what the role involves, and the single most important thing they want>",
  "requirements": ["<5–7 most important requirements as short phrases, each under 10 words>"],
  "salary":       "<salary range exactly as written if mentioned (e.g. '$80,000–$100,000'), else null>"
}

Job description:
${truncated}`;
}

async function tryLLM(rawJd: string): Promise<VaultJobInsights | null> {
  try {
    const raw = await workerTieredLLM('vaultAnalyse', buildPrompt(rawJd), {
      system: SYSTEM,
      json: true,
      temperature: 0.1,
      maxTokens: 600,
      timeoutMs: 15_000,
    });
    if (!raw) return null;

    // Strip markdown fences if model wrapped it anyway
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'').trim();
    const parsed = JSON.parse(cleaned) as Partial<VaultJobInsights>;

    // Validate minimal shape
    if (!parsed || typeof parsed !== 'object') return null;
    const company = typeof parsed.company === 'string' && parsed.company.trim()
      ? parsed.company.trim() : '';
    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim() : '';
    if (!company && !title) return null;

    return {
      company:      company || heuristicCompany(rawJd),
      title:        title  || heuristicTitle(rawJd),
      email:        typeof parsed.email    === 'string' ? parsed.email    : null,
      website:      typeof parsed.website  === 'string' ? parsed.website  : null,
      tldr:         typeof parsed.tldr     === 'string' ? parsed.tldr     : '',
      requirements: Array.isArray(parsed.requirements)
        ? parsed.requirements.filter(r => typeof r === 'string').slice(0, 8)
        : [],
      salary:       typeof parsed.salary   === 'string' ? parsed.salary   : null,
    };
  } catch {
    return null;
  }
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

/** All the ways a JD might label the company. */
const COMPANY_LABEL_RE = /^(?:company|organisation|organization|employer|hiring company|about)\s*[:\-–]\s*(.+)/im;
/** "Join Acme" / "at Acme" / "@ Acme" — common in screenshot OCR output. */
const COMPANY_INLINE_RE = /(?:join|hiring\s+at|position\s+at|role\s+at|work\s+at|join\s+us\s+at|@\s*)([A-Z][a-zA-Z0-9\s&.,'-]{2,40}?)(?:[.,!]|$)/m;
const AT_RE = /\bat\s+([A-Z][a-zA-Z0-9\s&.,'-]{2,40}?)(?:[.,!]|$)/m;

const JOB_TITLE_LABEL_RE = /^(?:job\s+title|position|role|vacancy|opening|title)\s*[:\-–]\s*(.+)/im;
const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;
/** Prefer apply/careers URLs; fall back to any https link. */
const APPLY_URL_RE = /https?:\/\/(?:jobs\.|careers\.|apply\.|talent\.)?[^\s"'<>]{8,120}/;
const SALARY_RE = /(?:salary|compensation|pay|remuneration|total\s+comp)[^.\n]{0,30}?(\$|£|€|USD|GBP|EUR|AUD)[^\n.;]{2,40}|(\$|£|€)[\d,.]+ ?\-? ?(\$|£|€)?[\d,.]+[kKmM]?/i;

function heuristicCompany(rawJd: string): string {
  // 1. Explicit label
  const labelled = rawJd.match(COMPANY_LABEL_RE);
  if (labelled) return labelled[1].trim().slice(0, 60);
  // 2. "Join/at <Company>" inline mention
  const inline = rawJd.match(COMPANY_INLINE_RE);
  if (inline) return inline[1].trim().slice(0, 60);
  // 3. Plain "at <Company>"
  const atMatch = rawJd.match(AT_RE);
  if (atMatch) return atMatch[1].trim().slice(0, 60);
  return '';
}

function heuristicTitle(rawJd: string): string {
  // 1. Explicit label
  const labelled = rawJd.match(JOB_TITLE_LABEL_RE);
  if (labelled) return labelled[1].trim().slice(0, 80);
  // 2. First non-empty line under 80 chars (typical for pasted JDs)
  const lines = rawJd.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.find(l => l.length > 3 && l.length < 80) ?? '';
}

function heuristicRequirements(rawJd: string): string[] {
  // Find bulleted / numbered list items that look like requirements
  const bulletRe = /^[\s]*(?:[•\-*–►▶]|\d+[.)]\s)\s*(.{10,120})$/gm;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = bulletRe.exec(rawJd)) !== null && results.length < 8) {
    const item = m[1].trim();
    // Skip items that are clearly metadata (dates, locations, URLs)
    if (/^\d{4}|^https?:|salary|location|remote|hybrid|full.time/i.test(item)) continue;
    results.push(item.slice(0, 100));
  }
  return results.slice(0, 7);
}

function heuristicTldr(rawJd: string): string {
  // Try to find the first substantive paragraph (> 60 chars, < 500 chars)
  const paras = rawJd.split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const para  = paras.find(p => p.length > 60 && p.length < 500 && !p.startsWith('http'));
  return para ? para.slice(0, 300) : '';
}

function heuristicFallback(rawJd: string): VaultJobInsights {
  const emailMatch   = rawJd.match(EMAIL_RE);
  const urlMatch     = rawJd.match(APPLY_URL_RE);
  const salaryMatch  = rawJd.match(SALARY_RE);
  return {
    company:      heuristicCompany(rawJd),
    title:        heuristicTitle(rawJd),
    email:        emailMatch  ? emailMatch[0]  : null,
    website:      urlMatch    ? urlMatch[0]    : null,
    tldr:         heuristicTldr(rawJd),
    requirements: heuristicRequirements(rawJd),
    salary:       salaryMatch ? salaryMatch[0].trim() : null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse a raw job description and return structured fields.
 * Tries LLM first; falls back to heuristics if LLM is unavailable or fails.
 */
export async function analyseVaultJob(rawJd: string): Promise<VaultJobInsights> {
  const llm = await tryLLM(rawJd);
  if (llm) return llm;
  return heuristicFallback(rawJd);
}
