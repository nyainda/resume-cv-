/**
 * cvCompareDiagnostic — runs the SAME A/B comparison as
 * `scripts/test-worker-vs-groq.mjs` but inside the browser, so the Settings
 * "Compare worker vs Groq" panel can show users an apples-to-apples quality
 * snapshot of the two providers using the live engine brief.
 *
 * Key design rules (mirrors the script — keep both in sync):
 *   • One shared fixture (mid-career water-resources engineer) so every run
 *     is reproducible and comparable across users.
 *   • Engine brief is fetched fresh from /api/cv/brief — same call the
 *     production CV engine makes — so verb pool, voice, rhythm and
 *     forbidden phrases are identical for both providers.
 *   • The user prompt describes the JSON schema in PLAIN ENGLISH (never as
 *     a literal {"key":[...]} blob). Llama 4 Scout 17B on Workers AI
 *     silently returns empty when it sees a JSON literal in the prompt;
 *     the production section-parallel path works around this exactly the
 *     same way (services/geminiService.ts:2515-2524).
 *   • Groq leg fires raw against api.groq.com — NOT through groqChat()
 *     which routes worker-first. We need a clean side-by-side comparison.
 *   • Scoring is deterministic (no LLM): JSON validity, banned-phrase hits,
 *     verb-pool adherence, opener variety, rhythm-sequence match, latency.
 *   • All network failures degrade gracefully — we always return a
 *     structured result; we never throw out to the UI.
 */

import { buildBrief, workerTieredLLM, isCVEngineConfigured, type CVBrief } from './cvEngineClient';
import { hasGroqKey, getGroqApiKey, GROQ_LARGE } from './groqService';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type CompareCheckLevel = 'pass' | 'warn' | 'fail';

export interface CompareCheck {
  label:   string;
  level:   CompareCheckLevel;
  detail?: string;
}

export interface CompareScore {
  jsonValid:       boolean;
  bulletCount:     number;
  bullets:         string[];
  bannedHits:      string[];
  aiismHits:       string[];
  openers:         string[];
  distinctOpeners: number;
  inPoolOpeners:   number;
  poolAdherence:   number;       // 0..1
  variety:         number;       // 0..1
  avgWords:        number;
  rhythmActual:    string[];     // 'short' | 'medium' | 'long' | 'personality'
  rhythmExpected:  string[];
  rhythmMatch:     number;       // 0..1
  checks:          CompareCheck[];
  verdict:         CompareCheckLevel;
  passCount:       number;
  warnCount:       number;
  failCount:       number;
  parseError?:     string;
}

export interface CompareLeg {
  provider: 'worker' | 'groq';
  ok:       boolean;
  ms:       number;
  model?:   string;
  text?:    string;
  error?:   string;
  skipped?: boolean;
  score?:   CompareScore;
}

export interface CompareResult {
  startedAt:       number;
  finishedAt:      number;
  briefOk:         boolean;
  briefError?:     string;
  systemChars:     number;
  userChars:       number;
  briefSummary?:   {
    seniority:  string;
    field:      string;
    voice:      string;
    rhythm:     string;
    verbCount:  number;
    forbiddenCount: number;
  };
  worker:          CompareLeg;
  groq:            CompareLeg;
  winner?:         'worker' | 'groq' | 'tie' | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture — mid-career water-resources engineer (same as the .mjs script)
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE = {
  jd: `Senior Water Resources Engineer to lead irrigation and rural water-supply projects in East Africa.
       Required: 5+ years EPANET/HEC-RAS, AutoCAD Civil 3D, contract administration under FIDIC,
       community engagement, donor reporting (USAID/AfDB/World Bank), team leadership of 6-12 people.
       Will design irrigation networks serving 50,000+ smallholder farmers, manage USD 5-15M budgets,
       and present to county governments. Field-based, 60% travel.`,
  field: 'engineering',
  yearsExperience: 6,
  bulletCount: 5,
  profile: {
    personalInfo: {
      name: 'Amani Otieno',
      title: 'Senior Water Resources Engineer',
      email: 'amani.otieno@example.com',
      location: 'Nairobi, Kenya',
    },
    summary: 'Water Resources Engineer with 6 years across rural infrastructure projects in East Africa. Delivered KES 480M in irrigation works covering 12 counties.',
    workExperience: [
      {
        jobTitle:  'Senior Water Resources Engineer',
        company:   'Trans-Sahara Engineering Consultants',
        location:  'Nairobi, Kenya',
        startDate: '2022-03',
        endDate:   'Present',
        description: 'Lead engineer on AfDB-funded smallholder irrigation programme: 4 county schemes, USD 8.2M total, 38,000 beneficiaries. Designed gravity-fed networks in EPANET, ran community baseline surveys, supervised contractor mobilisation.',
      },
    ],
  },
};

const CANONICAL_AI_ISMS = [
  'seamlessly', 'robustly', 'holistic', 'proactive', 'groundbreaking',
  'transformative', 'dynamic', 'innovative', 'impactful', 'cutting-edge',
  'leveraged', 'leveraging', 'leverage', 'spearheaded', 'orchestrated',
  'synergize', 'synergies', 'synergy', 'results-driven', 'go-getter',
  'passionate about', 'in today', 'fast-paced', 'thought leader',
  'paradigm shift', 'best-in-class', 'world-class', 'mission-critical',
];

// ─────────────────────────────────────────────────────────────────────────────
// Prompt construction — IDENTICAL between the two providers
// ─────────────────────────────────────────────────────────────────────────────

interface BuiltPrompts {
  system: string;
  user:   string;
}

function buildPrompts(brief: CVBrief): BuiltPrompts {
  const verbList = brief.verb_pool.slice(0, 24).map(v => v.verb_past || v.verb).join(', ');
  const forbidden = brief.forbidden_phrases.slice(0, 30).join(', ');
  const sen    = (brief as any).seniority || {};
  const voice  = (brief as any).voice?.primary || {};
  const field  = (brief as any).field || {};
  const rhythm = (brief as any).rhythm || {};

  const engineInstruction = `**CV ENGINE BRIEF (deterministic, overrides general guidance below)**
- Seniority: ${sen.level || 'unknown'} → bullet style "${sen.bullet_style || 'balanced'}", metric density "${sen.metric_density || 'medium'}", summary tone "${sen.summary_tone || 'professional'}".
- Field: ${field.field || 'general'} → language style "${field.language_style || 'neutral'}". Prefer metric types: ${(field.metric_types || []).join(', ') || 'general business metrics'}.
- Voice: primary "${voice.name || 'neutral'}" (${voice.tone || ''}), verbosity ${voice.verbosity_level ?? 3}/5, opener frequency ${voice.opener_frequency ?? 0.2}, metric preference "${voice.metric_preference || 'medium'}".
- Rhythm pattern "${rhythm.pattern_name || 'classic'}": follow this bullet-length sequence in order — ${(rhythm.sequence || []).join(' → ') || 'short, long, short, medium, long, personality'}.
- APPROVED VERB POOL (use these for bullet starts; never repeat one across the document): ${verbList}.
- ABSOLUTELY FORBIDDEN PHRASES (zero tolerance): ${forbidden}.`;

  const system = `You are a professional CV writer. Reply with valid raw JSON only — no markdown fences, no commentary.

${engineInstruction}`;

  const user = `Rewrite the following work experience as exactly ${FIXTURE.bulletCount} achievement bullets for a CV. Tailor the wording to the job description below.

JOB DESCRIPTION:
${FIXTURE.jd}

CURRENT ROLE:
Title: ${FIXTURE.profile.workExperience[0].jobTitle}
Company: ${FIXTURE.profile.workExperience[0].company}
Description: ${FIXTURE.profile.workExperience[0].description}

OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called bullets whose value is an array of exactly ${FIXTURE.bulletCount} strings. Each string is one achievement bullet. Honor every rule above (verb pool, banned phrases, rhythm sequence, length). Do NOT include any other keys. NO markdown fences, NO commentary.`;

  return { system, user };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider calls
// ─────────────────────────────────────────────────────────────────────────────

async function callWorker(system: string, user: string): Promise<CompareLeg> {
  const t0 = Date.now();
  if (!isCVEngineConfigured()) {
    return { provider: 'worker', ok: false, ms: 0, error: 'CV Engine URL not configured', skipped: true };
  }
  try {
    const text = await workerTieredLLM('cvGenerate', user, {
      system,
      json: true,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 45000,
    });
    const ms = Date.now() - t0;
    if (!text) return { provider: 'worker', ok: false, ms, error: 'worker returned empty / unreachable' };
    return { provider: 'worker', ok: true, ms, text, model: '@cf/meta/llama-4-scout-17b-16e-instruct' };
  } catch (e: any) {
    return { provider: 'worker', ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

async function callGroq(system: string, user: string): Promise<CompareLeg> {
  if (!hasGroqKey()) {
    return { provider: 'groq', ok: false, ms: 0, skipped: true, error: 'no Groq API key set' };
  }
  const key = getGroqApiKey();
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:           GROQ_LARGE,
        temperature:     0.3,
        max_tokens:      1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
      }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { provider: 'groq', ok: false, ms, error: `HTTP ${r.status} ${body.slice(0, 160)}` };
    }
    const data = await r.json() as { choices?: { message?: { content?: string } }[]; model?: string };
    const text = data?.choices?.[0]?.message?.content || '';
    return { provider: 'groq', ok: true, ms, text, model: data?.model || GROQ_LARGE };
  } catch (e: any) {
    return { provider: 'groq', ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring (deterministic — same logic as test-worker-vs-groq.mjs)
// ─────────────────────────────────────────────────────────────────────────────

function stripFences(s: string): string {
  return String(s || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractBullets(rawText: string): { bullets: string[] } {
  const cleaned = stripFences(rawText);
  let parsed: any;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON object found');
    parsed = JSON.parse(m[0]);
  }
  const bullets = parsed?.bullets;
  if (!Array.isArray(bullets) || !bullets.every(b => typeof b === 'string')) {
    throw new Error('parsed JSON missing string[] "bullets"');
  }
  return { bullets };
}

function classifyLength(words: number): string {
  if (words <= 12) return 'short';
  if (words <= 18) return 'medium';
  if (words <= 28) return 'long';
  return 'personality';
}

function firstWord(b: string): string {
  const m = b.trim().match(/^[•\-–—\s]*([A-Za-z][A-Za-z'-]*)/);
  return m ? m[1] : '';
}

function score(rawText: string, brief: CVBrief): CompareScore {
  const checks: CompareCheck[] = [];
  const out: CompareScore = {
    jsonValid:       false,
    bulletCount:     0,
    bullets:         [],
    bannedHits:      [],
    aiismHits:       [],
    openers:         [],
    distinctOpeners: 0,
    inPoolOpeners:   0,
    poolAdherence:   0,
    variety:         0,
    avgWords:        0,
    rhythmActual:    [],
    rhythmExpected:  ((brief as any).rhythm?.sequence as string[]) || [],
    rhythmMatch:     0,
    checks,
    verdict:         'fail',
    passCount:       0,
    warnCount:       0,
    failCount:       0,
  };

  let bullets: string[];
  try {
    bullets = extractBullets(rawText).bullets;
    out.jsonValid   = true;
    out.bulletCount = bullets.length;
    out.bullets     = bullets;
  } catch (e: any) {
    out.parseError = e?.message || String(e);
    checks.push({ label: 'JSON valid', level: 'fail', detail: out.parseError });
    out.failCount = 1;
    return out;
  }

  checks.push({ label: 'JSON valid', level: 'pass' });
  checks.push({
    label: `Bullet count == ${FIXTURE.bulletCount}`,
    level: bullets.length === FIXTURE.bulletCount ? 'pass'
         : Math.abs(bullets.length - FIXTURE.bulletCount) <= 1 ? 'warn'
         : 'fail',
    detail: `got ${bullets.length}`,
  });

  const wordCounts = bullets.map(b => b.trim().split(/\s+/).filter(Boolean).length);
  out.avgWords    = wordCounts.length ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
  out.rhythmActual = wordCounts.map(classifyLength);

  const lower = bullets.map(b => b.toLowerCase());

  const briefBanned = (brief.forbidden_phrases || []).map(p => p.toLowerCase());
  for (const phrase of briefBanned) {
    if (lower.some(b => b.includes(phrase))) out.bannedHits.push(phrase);
  }
  for (const phrase of CANONICAL_AI_ISMS) {
    if (lower.some(b => b.includes(phrase))) out.aiismHits.push(phrase);
  }

  out.openers = bullets.map(firstWord);
  const distinct = new Set(out.openers.map(o => o.toLowerCase()));
  out.distinctOpeners = distinct.size;
  out.variety = bullets.length ? distinct.size / bullets.length : 0;

  const pool = new Set(brief.verb_pool.map(v => (v.verb_past || v.verb).toLowerCase()));
  out.inPoolOpeners = out.openers.filter(o => pool.has(o.toLowerCase())).length;
  out.poolAdherence = bullets.length ? out.inPoolOpeners / bullets.length : 0;

  const expected = out.rhythmExpected;
  if (expected.length && out.rhythmActual.length) {
    const n = Math.min(expected.length, out.rhythmActual.length);
    let hits = 0;
    for (let i = 0; i < n; i++) if (expected[i] === out.rhythmActual[i]) hits++;
    out.rhythmMatch = n ? hits / n : 0;
  }

  checks.push({
    label: 'Zero brief-banned',
    level: out.bannedHits.length === 0 ? 'pass' : 'fail',
    detail: out.bannedHits.length ? out.bannedHits.join(', ') : undefined,
  });
  checks.push({
    label: 'Zero AI-isms',
    level: out.aiismHits.length === 0 ? 'pass' : out.aiismHits.length <= 1 ? 'warn' : 'fail',
    detail: out.aiismHits.length ? out.aiismHits.join(', ') : undefined,
  });
  checks.push({
    label: 'Verb variety ≥ 80%',
    level: out.variety >= 0.8 ? 'pass' : out.variety >= 0.6 ? 'warn' : 'fail',
    detail: `${Math.round(out.variety * 100)}%`,
  });
  checks.push({
    label: 'Pool adherence ≥ 40%',
    level: out.poolAdherence >= 0.4 ? 'pass' : out.poolAdherence >= 0.2 ? 'warn' : 'fail',
    detail: `${Math.round(out.poolAdherence * 100)}%`,
  });
  checks.push({
    label: 'Rhythm match ≥ 50%',
    level: out.rhythmMatch >= 0.5 ? 'pass' : out.rhythmMatch >= 0.3 ? 'warn' : 'fail',
    detail: `${Math.round(out.rhythmMatch * 100)}%`,
  });

  out.passCount = checks.filter(c => c.level === 'pass').length;
  out.warnCount = checks.filter(c => c.level === 'warn').length;
  out.failCount = checks.filter(c => c.level === 'fail').length;
  out.verdict =
    out.failCount > 0 ? 'fail' :
    out.warnCount > 0 ? 'warn' :
    'pass';

  return out;
}

function decideWinner(w: CompareLeg, g: CompareLeg): CompareResult['winner'] {
  // Both must have actually run.
  if (!w.ok || !g.ok || !w.score || !g.score) return null;

  const verdictRank = (v: CompareCheckLevel) => v === 'pass' ? 2 : v === 'warn' ? 1 : 0;
  const wv = verdictRank(w.score.verdict);
  const gv = verdictRank(g.score.verdict);
  if (wv !== gv) return wv > gv ? 'worker' : 'groq';

  // Same verdict tier — compare composite quality score.
  const composite = (s: CompareScore) =>
    (s.poolAdherence * 0.30)
    + (s.variety       * 0.20)
    + (s.rhythmMatch   * 0.30)
    + ((s.bannedHits.length === 0 ? 1 : 0) * 0.10)
    + ((s.aiismHits.length  === 0 ? 1 : 0) * 0.10);

  const wc = composite(w.score);
  const gc = composite(g.score);
  if (Math.abs(wc - gc) < 0.05) return 'tie';
  return wc > gc ? 'worker' : 'groq';
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry — used by SettingsModal "Compare worker vs Groq" button
// ─────────────────────────────────────────────────────────────────────────────

export async function runCompareDiagnostic(): Promise<CompareResult> {
  const startedAt = Date.now();
  const result: CompareResult = {
    startedAt,
    finishedAt:  startedAt,
    briefOk:     false,
    systemChars: 0,
    userChars:   0,
    worker:      { provider: 'worker', ok: false, ms: 0 },
    groq:        { provider: 'groq',   ok: false, ms: 0 },
    winner:      null,
  };

  // 1) Brief
  let brief: CVBrief | null = null;
  try {
    brief = await buildBrief({
      jd:              FIXTURE.jd,
      profile:         FIXTURE.profile as any,
      field:           FIXTURE.field,
      yearsExperience: FIXTURE.yearsExperience,
      bulletCount:     FIXTURE.bulletCount,
      section:         'current_role',
    });
  } catch (e: any) {
    result.briefError = e?.message || String(e);
  }
  if (!brief) {
    result.briefError = result.briefError || 'brief endpoint returned no usable data';
    result.finishedAt = Date.now();
    return result;
  }
  result.briefOk = true;
  result.briefSummary = {
    seniority:      (brief as any).seniority?.level || 'unknown',
    field:          (brief as any).field?.field || 'general',
    voice:          (brief as any).voice?.primary?.name || 'neutral',
    rhythm:         (brief as any).rhythm?.pattern_name || 'classic',
    verbCount:      brief.verb_pool.length,
    forbiddenCount: brief.forbidden_phrases.length,
  };

  // 2) Build prompts
  const { system, user } = buildPrompts(brief);
  result.systemChars = system.length;
  result.userChars   = user.length;

  // 3) Fire both legs in parallel
  const [worker, groq] = await Promise.all([
    callWorker(system, user),
    callGroq(system, user),
  ]);
  result.worker = worker;
  result.groq   = groq;

  // 4) Score whichever legs returned text
  if (worker.ok && worker.text) {
    try { worker.score = score(worker.text, brief); }
    catch (e: any) { worker.error = `scoring failed: ${e?.message || String(e)}`; }
  }
  if (groq.ok && groq.text) {
    try { groq.score = score(groq.text, brief); }
    catch (e: any) { groq.error = `scoring failed: ${e?.message || String(e)}`; }
  }

  // 5) Pick winner
  result.winner = decideWinner(worker, groq);
  result.finishedAt = Date.now();
  return result;
}
