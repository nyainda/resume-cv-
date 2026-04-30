#!/usr/bin/env node
/**
 * Strict A/B test — Cloudflare cv-engine-worker vs Groq
 *
 * Generates the SAME CV twice:
 *   1) via the worker's /api/cv/tiered-llm  (task: cvGenerate)
 *   2) via Groq's chat-completions endpoint (llama-3.3-70b-versatile)
 *
 * Both calls receive the IDENTICAL system + user prompt — including the
 * engine brief (verb pool, voice, rhythm, forbidden phrases) freshly
 * fetched from the worker's /api/cv/brief endpoint.
 *
 * After generation, each output is scored deterministically (no LLM):
 *   • JSON validity              (parses + has required keys)
 *   • Banned phrase hits         (brief.forbidden_phrases + canonical AI-isms)
 *   • Verb-pool adherence        (% of bullet openers found in brief.verb_pool)
 *   • Verb variety               (distinct openers / total bullets)
 *   • Rhythm adherence           (length sequence match vs brief.rhythm)
 *   • Generation latency
 *
 * Each metric gets PASS / WARN / FAIL and a final verdict per provider.
 *
 * Usage:
 *   node scripts/test-worker-vs-groq.mjs
 *   GROQ_API_KEY=gsk_xxx node scripts/test-worker-vs-groq.mjs    # enable Groq leg
 *   CV_ENGINE_URL=https://... node scripts/test-worker-vs-groq.mjs
 *
 * Without GROQ_API_KEY the script runs worker-only and reports a single-side
 * quality assessment instead of an A/B comparison.
 */

const WORKER     = process.env.CV_ENGINE_URL || 'https://cv-engine-worker.dripstech.workers.dev';
const GROQ_KEY   = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL   || 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 60000;

// Canonical AI-ism list — supplements brief.forbidden_phrases. These are the
// phrases that mark text as obviously LLM-written regardless of field. Kept
// short on purpose; the heavy enforcement comes from the brief.
const CANONICAL_AI_ISMS = [
  'seamlessly', 'robustly', 'holistic', 'proactive', 'groundbreaking',
  'transformative', 'dynamic', 'innovative', 'impactful', 'cutting-edge',
  'leveraged', 'leveraging', 'leverage', 'spearheaded', 'orchestrated',
  'synergize', 'synergies', 'synergy', 'results-driven', 'go-getter',
  'passionate about', 'in today', 'fast-paced', 'thought leader',
  'paradigm shift', 'best-in-class', 'world-class', 'mission-critical',
];

// ── Test fixture (mid-career water resources engineer) ──────────────────────
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
      {
        jobTitle:  'Water Resources Engineer',
        company:   'Davis & Shirtliff Engineering',
        location:  'Mombasa, Kenya',
        startDate: '2020-01',
        endDate:   '2022-02',
        description: 'Designed bulk-water transmission for coastal county water utilities. Sized 14 booster stations, modelled chlorine residuals across 86 km of mains, drafted 9 sets of FIDIC tender documents.',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper with hard timeout
// ─────────────────────────────────────────────────────────────────────────────
async function fetchTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Fetch the engine brief (same call services/cvEngineClient.ts makes)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchBrief() {
  const r = await fetchTimeout(`${WORKER}/api/cv/brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jd:              FIXTURE.jd,
      profile:         FIXTURE.profile,
      field:           FIXTURE.field,
      yearsExperience: FIXTURE.yearsExperience,
      bulletCount:     FIXTURE.bulletCount,
      section:         'current_role',
    }),
  }, 20000);
  if (!r.ok) throw new Error(`brief HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data?.verb_pool) || data.verb_pool.length < 6) {
    throw new Error('brief looks empty (verb_pool < 6)');
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Build the SAME system + user prompt that geminiService.ts builds
//          (mirrors lines 2093-2110 + the cvGenerate prompt shape)
// ─────────────────────────────────────────────────────────────────────────────
function buildPrompts(brief) {
  const verbList = brief.verb_pool.slice(0, 24).map(v => v.verb_past || v.verb).join(', ');
  const forbidden = brief.forbidden_phrases.slice(0, 30).join(', ');
  const sen   = brief.seniority || {};
  const voice = brief.voice?.primary || {};
  const field = brief.field || {};
  const rhythm = brief.rhythm || {};

  const engineInstruction = `
**CV ENGINE BRIEF (deterministic, overrides general guidance below)**
- Seniority: ${sen.level || 'unknown'} → bullet style "${sen.bullet_style || 'balanced'}", metric density "${sen.metric_density || 'medium'}", summary tone "${sen.summary_tone || 'professional'}".
- Field: ${field.field || 'general'} → language style "${field.language_style || 'neutral'}". Prefer metric types: ${(field.metric_types || []).join(', ') || 'general business metrics'}.
- Voice: primary "${voice.name || 'neutral'}" (${voice.tone || ''}), verbosity ${voice.verbosity_level ?? 3}/5, opener frequency ${voice.opener_frequency ?? 0.2}, metric preference "${voice.metric_preference || 'medium'}".
- Rhythm pattern "${rhythm.pattern_name || 'classic'}": follow this bullet-length sequence in order — ${(rhythm.sequence || []).join(' → ') || 'short, long, short, medium, long, personality'}.
- APPROVED VERB POOL (use these for bullet starts; never repeat one across the document): ${verbList}.
- ABSOLUTELY FORBIDDEN PHRASES (zero tolerance): ${forbidden}.
`.trim();

  const system = `You are a professional CV writer. Reply with valid raw JSON only — no markdown fences, no commentary.

${engineInstruction}`;

  // ⚠ IMPORTANT: Scout 17B silently returns empty when the user prompt
  // contains a literal JSON example blob like {"bullets":["..."]}. The
  // production section-parallel path (services/geminiService.ts:2515-2524)
  // works around this by describing the schema in plain English. We do the
  // SAME here so the A/B test exercises the real production code path —
  // not a contrived legacy-fallback shape that no production user hits.
  const user = `Rewrite the following work experience as exactly ${FIXTURE.bulletCount} achievement bullets for a CV. Tailor the wording to the job description below.

JOB DESCRIPTION:
${FIXTURE.jd}

CURRENT ROLE:
Title: ${FIXTURE.profile.workExperience[0].jobTitle}
Company: ${FIXTURE.profile.workExperience[0].company}
Description: ${FIXTURE.profile.workExperience[0].description}

OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called bullets whose value is an array of exactly ${FIXTURE.bulletCount} strings. Each string is one achievement bullet. Honor every rule above (verb pool, banned phrases, rhythm sequence, length). Do NOT include any other keys. NO markdown fences, NO commentary.`;

  return { system, user, engineInstruction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Call provider A: cv-engine-worker (cvGenerate task)
// ─────────────────────────────────────────────────────────────────────────────
async function callWorker(system, user) {
  const t0 = Date.now();
  const r = await fetchTimeout(`${WORKER}/api/cv/tiered-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:        'cvGenerate',
      system,
      prompt:      user,
      maxTokens:   1024,
      temperature: 0.3,
      json:        true,    // mirrors production cvEngineClient calls
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    return { provider: 'worker', ok: false, ms, error: `HTTP ${r.status} ${body.slice(0, 160)}` };
  }
  const data = await r.json();
  return {
    provider: 'worker',
    ok: true,
    ms,
    text: data?.text || '',
    model: data?.model || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Call provider B: Groq direct (only if GROQ_API_KEY present)
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(system, user) {
  if (!GROQ_KEY) return { provider: 'groq', ok: false, ms: 0, skipped: true };
  const t0 = Date.now();
  const r = await fetchTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model:           GROQ_MODEL,
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
  const data = await r.json();
  return {
    provider: 'groq',
    ok: true,
    ms,
    text:  data?.choices?.[0]?.message?.content || '',
    model: data?.model || GROQ_MODEL,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Deterministic scoring (no LLM)
// ─────────────────────────────────────────────────────────────────────────────
function stripFences(t) {
  return String(t || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractBullets(rawText) {
  const cleaned = stripFences(rawText);
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    // Fallback — pluck JSON between first { and last }
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON object found');
    parsed = JSON.parse(m[0]);
  }
  const bullets = parsed?.bullets;
  if (!Array.isArray(bullets) || !bullets.every(b => typeof b === 'string')) {
    throw new Error('parsed JSON missing string[] "bullets"');
  }
  return { parsed, bullets };
}

function score(rawText, brief) {
  const out = {
    jsonValid:    false,
    bulletCount:  0,
    bullets:      [],
    bannedHits:   [],
    aiismHits:    [],
    openers:      [],
    distinctOpeners: 0,
    inPoolOpeners:   0,
    poolAdherence:   0,
    variety:         0,
    avgWords:        0,
    rhythmActual:    [],
    rhythmExpected:  brief.rhythm?.sequence || [],
    rhythmMatch:     0,
    error: null,
  };

  let bullets;
  try {
    const ex = extractBullets(rawText);
    bullets = ex.bullets;
    out.jsonValid   = true;
    out.bulletCount = bullets.length;
    out.bullets     = bullets;
  } catch (e) {
    out.error = e.message;
    return out;
  }

  // Banned-phrase hits — brief.forbidden_phrases (case-insensitive substring)
  const briefBans = (brief.forbidden_phrases || []).map(p => p.toLowerCase());
  const lowerJoined = bullets.join(' \n ').toLowerCase();
  out.bannedHits = briefBans.filter(p => p && lowerJoined.includes(p));
  out.aiismHits  = CANONICAL_AI_ISMS.filter(p => lowerJoined.includes(p));

  // Opening verbs — first word of each bullet, stripped of punctuation/bullets
  const opener = b => {
    const m = b.replace(/^[\s•\-–\d.)]+/, '').trim().split(/\s+/)[0] || '';
    return m.replace(/[^\w]/g, '');
  };
  out.openers = bullets.map(opener);
  const distinct = new Set(out.openers.map(o => o.toLowerCase()));
  out.distinctOpeners = distinct.size;
  out.variety = bullets.length === 0 ? 0 : distinct.size / bullets.length;

  // Verb-pool adherence — case-insensitive match on past-tense or base form
  const poolWords = new Set();
  for (const v of brief.verb_pool || []) {
    if (v.verb)      poolWords.add(String(v.verb).toLowerCase());
    if (v.verb_past) poolWords.add(String(v.verb_past).toLowerCase());
  }
  out.inPoolOpeners = out.openers.filter(o => poolWords.has(o.toLowerCase())).length;
  out.poolAdherence = bullets.length === 0 ? 0 : out.inPoolOpeners / bullets.length;

  // Word counts + rhythm bucket
  const wc = b => b.replace(/^[\s•\-–\d.)]+/, '').trim().split(/\s+/).filter(Boolean).length;
  const wordCounts = bullets.map(wc);
  out.avgWords = wordCounts.length ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
  const bucket = n => n <= 10 ? 'short' : n <= 18 ? 'medium' : 'long';
  out.rhythmActual = wordCounts.map(bucket);

  if (out.rhythmExpected.length && out.rhythmActual.length) {
    const compareLen = Math.min(out.rhythmExpected.length, out.rhythmActual.length);
    let matches = 0;
    for (let i = 0; i < compareLen; i++) {
      const exp = out.rhythmExpected[i];
      // 'personality' = anything goes
      if (exp === 'personality' || exp === out.rhythmActual[i]) matches++;
    }
    out.rhythmMatch = matches / compareLen;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Verdicts with thresholds
// ─────────────────────────────────────────────────────────────────────────────
function verdict(s) {
  const checks = [
    { name: 'JSON valid',         pass: s.jsonValid,                         warn: false },
    { name: 'Bullet count == 5',  pass: s.bulletCount === 5,                 warn: s.bulletCount >= 3 && s.bulletCount <= 7 },
    { name: 'Zero brief-banned',  pass: s.bannedHits.length === 0,           warn: s.bannedHits.length <= 1 },
    { name: 'Zero AI-isms',       pass: s.aiismHits.length === 0,            warn: s.aiismHits.length <= 1 },
    { name: 'Verb variety ≥ 0.8', pass: s.variety >= 0.8,                    warn: s.variety >= 0.6 },
    { name: 'Pool adherence ≥ 0.4', pass: s.poolAdherence >= 0.4,            warn: s.poolAdherence >= 0.2 },
    { name: 'Rhythm match ≥ 0.5', pass: s.rhythmMatch >= 0.5,                warn: s.rhythmMatch >= 0.3 },
  ];
  const passes = checks.filter(c => c.pass).length;
  const warns  = checks.filter(c => !c.pass && c.warn).length;
  const fails  = checks.length - passes - warns;
  const overall = fails > 0 ? 'FAIL' : warns > 0 ? 'WARN' : 'PASS';
  return { checks, passes, warns, fails, overall };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Reporting
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const tag = v =>
  v === 'PASS' ? `${C.green}${C.bold}PASS${C.reset}` :
  v === 'WARN' ? `${C.yellow}${C.bold}WARN${C.reset}` :
                 `${C.red}${C.bold}FAIL${C.reset}`;
const hr = (ch = '─', n = 78) => ch.repeat(n);

function printSide(name, call, score, vd, brief) {
  console.log();
  console.log(C.bold + C.cyan + `┌${hr('─', 76)}┐` + C.reset);
  console.log(C.bold + C.cyan + `│ ${name.padEnd(74)} │` + C.reset);
  console.log(C.bold + C.cyan + `└${hr('─', 76)}┘` + C.reset);

  if (!call.ok) {
    if (call.skipped) {
      console.log(`  ${C.dim}skipped — set GROQ_API_KEY env var to enable this leg${C.reset}`);
    } else {
      console.log(`  ${C.red}call failed: ${call.error}${C.reset}`);
    }
    return;
  }
  console.log(`  model         : ${call.model}`);
  console.log(`  latency       : ${call.ms} ms`);
  console.log(`  raw text      : ${(call.text || '').length} chars`);

  if (score.error) {
    console.log(`  ${C.red}parse error: ${score.error}${C.reset}`);
    console.log(`  raw output (first 300 chars):\n    ${C.dim}${(call.text || '').slice(0, 300).replace(/\n/g, '\n    ')}${C.reset}`);
    return;
  }

  console.log(`  bullets       : ${score.bulletCount}  (avg ${score.avgWords} words)`);
  console.log(`  openers       : ${score.openers.join(', ')}`);
  console.log(`  distinct      : ${score.distinctOpeners}/${score.bulletCount}  (variety ${(score.variety * 100).toFixed(0)}%)`);
  console.log(`  in verb pool  : ${score.inPoolOpeners}/${score.bulletCount}  (adherence ${(score.poolAdherence * 100).toFixed(0)}%)`);
  console.log(`  rhythm actual : ${score.rhythmActual.join(' → ')}`);
  console.log(`  rhythm expect : ${score.rhythmExpected.join(' → ')}  (match ${(score.rhythmMatch * 100).toFixed(0)}%)`);
  console.log(`  brief-banned  : ${score.bannedHits.length === 0 ? C.green + 'none' + C.reset : C.red + score.bannedHits.join(', ') + C.reset}`);
  console.log(`  AI-isms       : ${score.aiismHits.length === 0 ? C.green + 'none' + C.reset : C.yellow + score.aiismHits.join(', ') + C.reset}`);
  console.log();
  console.log(`  ${C.bold}checks:${C.reset}`);
  for (const c of vd.checks) {
    const t = c.pass ? C.green + '✓' + C.reset : c.warn ? C.yellow + '~' + C.reset : C.red + '✗' + C.reset;
    console.log(`    ${t}  ${c.name}`);
  }
  console.log(`  ${C.bold}verdict      : ${tag(vd.overall)}${C.reset}  (${vd.passes} pass / ${vd.warns} warn / ${vd.fails} fail)`);

  console.log(`\n  ${C.dim}sample bullets:${C.reset}`);
  score.bullets.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`${C.bold}Worker vs Groq — strict A/B test${C.reset}`);
  console.log(`worker  : ${WORKER}`);
  console.log(`groq    : ${GROQ_KEY ? `${GROQ_MODEL} (key set, ${GROQ_KEY.length} chars)` : C.dim + 'skipped (no GROQ_API_KEY)' + C.reset}`);
  console.log(hr());

  console.log(`\n[1/5] fetching engine brief from /api/cv/brief …`);
  let brief;
  try {
    brief = await fetchBrief();
    console.log(`      ${C.green}✓${C.reset} seniority=${brief.seniority?.level} field=${brief.field?.field || brief.field} voice=${brief.voice?.primary?.name}`);
    console.log(`        verbs=${brief.verb_pool.length}  forbidden=${brief.forbidden_phrases.length}  rhythm=${brief.rhythm?.pattern_name}`);
  } catch (e) {
    console.error(`      ${C.red}✗ brief fetch failed: ${e.message}${C.reset}`);
    process.exit(2);
  }

  console.log(`\n[2/5] building system + user prompt with engine brief injected …`);
  const { system, user, engineInstruction } = buildPrompts(brief);
  console.log(`      ${C.green}✓${C.reset} system=${system.length} chars  user=${user.length} chars  brief=${engineInstruction.length} chars`);

  console.log(`\n[3/5] firing both providers in parallel …`);
  const [workerCall, groqCall] = await Promise.all([callWorker(system, user), callGroq(system, user)]);
  console.log(`      worker: ${workerCall.ok ? C.green + 'OK' + C.reset + ' ' + workerCall.ms + 'ms' : C.red + 'FAIL' + C.reset}`);
  console.log(`      groq  : ${groqCall.ok ? C.green + 'OK' + C.reset + ' ' + groqCall.ms + 'ms' : groqCall.skipped ? C.dim + 'skipped' + C.reset : C.red + 'FAIL' + C.reset}`);

  console.log(`\n[4/5] scoring outputs against the brief …`);
  const workerScore = workerCall.ok ? score(workerCall.text, brief) : null;
  const groqScore   = groqCall.ok   ? score(groqCall.text, brief)   : null;
  const workerVerdict = workerScore ? verdict(workerScore) : null;
  const groqVerdict   = groqScore   ? verdict(groqScore)   : null;

  console.log(`\n[5/5] report:`);
  printSide('PROVIDER A — Cloudflare cv-engine-worker (cvGenerate)', workerCall, workerScore || {}, workerVerdict || {}, brief);
  printSide('PROVIDER B — Groq direct (' + GROQ_MODEL + ')',          groqCall,   groqScore   || {}, groqVerdict   || {}, brief);

  // ── Comparative summary ───────────────────────────────────────────────────
  if (workerVerdict && groqVerdict) {
    console.log();
    console.log(C.bold + hr('═') + C.reset);
    console.log(C.bold + ' COMPARATIVE SUMMARY' + C.reset);
    console.log(C.bold + hr('═') + C.reset);
    const row = (label, a, b) => console.log(`  ${label.padEnd(24)}  worker: ${String(a).padEnd(20)}  groq: ${b}`);
    row('latency (ms)',         workerCall.ms,                          groqCall.ms);
    row('JSON valid',            workerScore.jsonValid,                  groqScore.jsonValid);
    row('bullet count',          workerScore.bulletCount,                groqScore.bulletCount);
    row('verb variety',          (workerScore.variety   * 100).toFixed(0) + '%', (groqScore.variety   * 100).toFixed(0) + '%');
    row('verb-pool adherence',   (workerScore.poolAdherence * 100).toFixed(0) + '%', (groqScore.poolAdherence * 100).toFixed(0) + '%');
    row('rhythm match',          (workerScore.rhythmMatch * 100).toFixed(0) + '%', (groqScore.rhythmMatch * 100).toFixed(0) + '%');
    row('brief-banned hits',     workerScore.bannedHits.length,          groqScore.bannedHits.length);
    row('AI-ism hits',           workerScore.aiismHits.length,           groqScore.aiismHits.length);
    row('verdict',               workerVerdict.overall,                  groqVerdict.overall);
    console.log();
    console.log(`  ${C.bold}interpretation:${C.reset}`);
    console.log(`    • Both providers receive the IDENTICAL prompt with the engine brief injected.`);
    console.log(`    • Differences therefore reflect raw model behaviour, NOT a bypass of your engine rules.`);
    console.log(`    • Whichever path the user lands on, the client-side runQualityPolishPasses runs after this`);
    console.log(`      with banned-phrase filter, voice enforcement, finalizeCvData, etc — so production output`);
    console.log(`      is generally cleaner than what you see here.`);
  }

  // ── Exit code: fail process if worker leg failed or scored FAIL ─────────
  console.log();
  if (!workerCall.ok) {
    console.error(`${C.red}${C.bold}EXIT 1 — worker call failed${C.reset}`);
    process.exit(1);
  }
  if (workerVerdict && workerVerdict.overall === 'FAIL') {
    console.error(`${C.red}${C.bold}EXIT 1 — worker output graded FAIL${C.reset}`);
    process.exit(1);
  }
  console.log(`${C.green}${C.bold}EXIT 0 — worker leg passed${C.reset}`);
  process.exit(0);
})().catch(err => {
  console.error(`\n${C.red}${C.bold}UNCAUGHT:${C.reset}`, err);
  process.exit(2);
});
