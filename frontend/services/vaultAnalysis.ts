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
  remote:       'Remote' | 'Hybrid' | 'On-site' | null;
  location:     string | null;
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
  "salary":       "<salary range exactly as written if mentioned (e.g. '$80,000–$100,000'), else null>",
  "remote":       "<'Remote', 'Hybrid', or 'On-site' — pick the closest fit based on the JD wording, else null>",
  "location":     "<city / region / country if mentioned (e.g. 'London, UK'), else null>"
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

    const remoteRaw = typeof parsed.remote === 'string' ? parsed.remote.trim() : null;
    const remoteVal: VaultJobInsights['remote'] =
      remoteRaw === 'Remote' || remoteRaw === 'Hybrid' || remoteRaw === 'On-site'
        ? remoteRaw : null;

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
      remote:       remoteVal,
      location:     typeof parsed.location === 'string' ? parsed.location.slice(0, 80) : null,
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

const REMOTE_RE  = /\b(fully[\s-]?remote|remote[\s-]?first|work[\s-]?from[\s-]?home|100%\s*remote)\b/i;
const HYBRID_RE  = /\bhybrid\b/i;
const ONSITE_RE  = /\b(on[\s-]?site|in[\s-]?office|office[\s-]?based|in[\s-]?person)\b/i;
const LOCATION_RE = /\b(?:location|based in|office(?:s)? in|located in)\s*[:\-–]?\s*([A-Z][a-zA-Z,.\s]{3,50}?)(?:\.|,|\n|$)/im;

function heuristicRemote(rawJd: string): VaultJobInsights['remote'] {
  if (REMOTE_RE.test(rawJd)) return 'Remote';
  if (HYBRID_RE.test(rawJd)) return 'Hybrid';
  if (ONSITE_RE.test(rawJd)) return 'On-site';
  return null;
}

function heuristicLocation(rawJd: string): string | null {
  const m = rawJd.match(LOCATION_RE);
  return m ? m[1].trim().slice(0, 80) : null;
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
    remote:       heuristicRemote(rawJd),
    location:     heuristicLocation(rawJd),
  };
}

// ─── Multi-position detection ─────────────────────────────────────────────────

export interface PositionChunk {
  /** Structured insights for this position. */
  insights: VaultJobInsights;
  /** The slice of raw JD text that belongs to this position. */
  rawChunk: string;
}

/**
 * Heuristic pre-filter — cheap check before spending an LLM call.
 * Returns true if the text is plausibly multi-position.
 */
function looksMultiPosition(rawJd: string): boolean {
  // Multiple explicit "Job Title:" or "Position:" labels
  const titleLabels = (rawJd.match(/\b(?:job\s+title|position|vacancy|opening|role)\s*[:\-–]/gi) || []).length;
  if (titleLabels >= 2) return true;
  // Section dividers like "Role 1 / Role 2" or "Position 1:"
  if (/(?:role|position|job)\s*[12345]\b/i.test(rawJd)) return true;
  // Multiple occurrence of "reports to" / "you will" / "we are looking for" — each signals a new posting
  const postingAnchors = (rawJd.match(/\b(?:reports\s+to|you\s+will|we\s+are\s+looking\s+for|about\s+the\s+role|the\s+role)\b/gi) || []).length;
  if (postingAnchors >= 3) return true;
  // Multiple salary / compensation mentions
  const salaryCount = (rawJd.match(/\b(?:salary|compensation|pay\s+range)\b/gi) || []).length;
  if (salaryCount >= 2) return true;
  return false;
}

const MULTI_SYSTEM = 'You are a job-description parser. Return only valid JSON, no markdown.';

function buildMultiPrompt(rawJd: string): string {
  const truncated = rawJd.slice(0, 6000);
  return `Analyse this text and determine if it contains ONE job posting or MULTIPLE distinct job postings (i.e. different roles, possibly at the same or different companies).

Return ONLY a JSON object in one of these two shapes:

Shape A — single position:
{ "multi": false }

Shape B — multiple positions (2+):
{
  "multi": true,
  "positions": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "snippet": "<the first ~120 chars that uniquely appear in this position's section>"
    }
  ]
}

Rules:
- Use Shape A unless you are confident there are 2 or more DISTINCT roles described.
- Each position object must have a "snippet" that is a verbatim substring from the original text — this will be used to locate and slice the position's section.
- If positions share the same company, still list them separately.
- Maximum 8 positions.

Text:
${truncated}`;
}

/**
 * Uses LLM to detect whether the raw JD contains multiple distinct positions.
 * Returns the individual chunks + insights when multi-position is confirmed,
 * or null when it is a single position (or detection fails).
 */
async function tryDetectMultiPosition(rawJd: string): Promise<PositionChunk[] | null> {
  try {
    const raw = await workerTieredLLM('vaultMultiDetect', buildMultiPrompt(rawJd), {
      system: MULTI_SYSTEM,
      json: true,
      temperature: 0.1,
      maxTokens: 800,
      timeoutMs: 18_000,
    });
    if (!raw) return null;
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed?.multi || !Array.isArray(parsed.positions) || parsed.positions.length < 2) {
      return null;
    }

    // Slice the original JD text around each position's snippet
    const positions: Array<{ title: string; company: string; snippet: string }> = parsed.positions
      .filter((p: any) => p && typeof p.title === 'string' && typeof p.snippet === 'string')
      .slice(0, 8);

    if (positions.length < 2) return null;

    // Build chunks by finding each snippet's start index and slicing between them
    const indices: number[] = positions.map(p => {
      const idx = rawJd.indexOf(p.snippet.trim().slice(0, 80));
      return idx === -1 ? -1 : idx;
    }).filter(i => i !== -1);

    // Need at least 2 valid anchor points
    if (indices.length < 2) return null;

    // Sort by position in text
    const anchored = positions
      .map((p, i) => ({ ...p, idx: rawJd.indexOf(p.snippet.trim().slice(0, 80)) }))
      .filter(p => p.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (anchored.length < 2) return null;

    // Slice raw text for each position
    const chunks: PositionChunk[] = await Promise.all(
      anchored.map(async (p, i) => {
        const start = p.idx;
        const end   = anchored[i + 1]?.idx ?? rawJd.length;
        const rawChunk = rawJd.slice(start, end).trim();

        // Run full LLM analysis on each individual chunk (with fallback)
        const insights = await analyseVaultJob(rawChunk.length > 100 ? rawChunk : rawJd);
        // Override title/company with what the detector already knows
        return {
          insights: {
            ...insights,
            title:   p.title   || insights.title,
            company: p.company || insights.company,
          },
          rawChunk,
        };
      })
    );

    return chunks.length >= 2 ? chunks : null;
  } catch {
    return null;
  }
}

/**
 * Entry point for multi-position detection.
 * Returns an array of chunks when multiple positions are found (length ≥ 2),
 * or null when the JD appears to be a single posting.
 *
 * Cheap heuristic guard prevents unnecessary LLM calls for the common case.
 */
export async function detectAndSplitPositions(rawJd: string): Promise<PositionChunk[] | null> {
  if (!looksMultiPosition(rawJd)) return null;
  return tryDetectMultiPosition(rawJd);
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
