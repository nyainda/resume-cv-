#!/usr/bin/env node
/**
 * test-worker-endpoints.mjs
 *
 * Smoke-tests every public endpoint on the cv-engine-worker.
 * Checks: HTTP status, CORS headers, valid JSON body.
 * Optionally tests the Claude proxy if ANTHROPIC_API_KEY is set.
 *
 * Usage:
 *   node backend/scripts/test-worker-endpoints.mjs
 *   WORKER_URL=https://cv-engine-worker.dripstech.workers.dev node backend/scripts/test-worker-endpoints.mjs
 *   ANTHROPIC_API_KEY=sk-ant-xxx node backend/scripts/test-worker-endpoints.mjs
 */

const WORKER_URL  = process.env.WORKER_URL  || 'https://cv-engine-worker.dripstech.workers.dev';
const ORIGIN      = process.env.TEST_ORIGIN || 'https://resume-cv-gold.vercel.app';
const CLAUDE_KEY  = process.env.ANTHROPIC_API_KEY || '';
const GROQ_KEY    = process.env.GROQ_API_KEY || '';

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

let passed = 0;
let failed = 0;
let skipped = 0;

async function req(method, path, body, extraHeaders = {}) {
  const url = `${WORKER_URL}${path}`;
  const headers = {
    'Origin': ORIGIN,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const t0 = Date.now();
  const res = await fetch(url, opts);
  const ms = Date.now() - t0;
  let json = null;
  try { json = await res.json(); } catch {}
  return { res, json, ms };
}

function pass(name, detail = '') {
  passed++;
  console.log(`  ${GREEN}✓${RESET} ${name}${detail ? ` ${DIM}(${detail})${RESET}` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  console.log(`  ${RED}✗${RESET} ${BOLD}${name}${RESET}${detail ? `\n    ${RED}${detail}${RESET}` : ''}`);
}
function skip(name, reason = '') {
  skipped++;
  console.log(`  ${YELLOW}–${RESET} ${name}${reason ? ` ${DIM}(${reason})${RESET}` : ''}`);
}

function checkCors(res, name) {
  const acao = res.headers.get('access-control-allow-origin');
  if (!acao) {
    fail(`${name} — CORS header missing`, `No Access-Control-Allow-Origin on HTTP ${res.status}`);
    return false;
  }
  if (acao !== ORIGIN && acao !== '*') {
    fail(`${name} — wrong CORS origin`, `Got "${acao}", expected "${ORIGIN}" or "*"`);
    return false;
  }
  return true;
}

function checkStatus(res, name, expected = 200) {
  if (res.status !== expected) {
    fail(`${name} — HTTP ${res.status}`, `Expected ${expected}`);
    return false;
  }
  return true;
}

function checkJson(json, name, keys = []) {
  if (!json) { fail(`${name} — not JSON`); return false; }
  for (const k of keys) {
    if (!(k in json)) { fail(`${name} — missing key "${k}"`, JSON.stringify(json).slice(0, 200)); return false; }
  }
  return true;
}

// ── Section header ────────────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${CYAN}${BOLD}▸ ${title}${RESET}`);
}

// ── OPTIONS preflight ─────────────────────────────────────────────────────────
async function testPreflight() {
  section('OPTIONS preflight (CORS)');
  const { res } = await req('OPTIONS', '/api/cv/banned');
  if (res.status === 204 || res.status === 200) {
    const acao = res.headers.get('access-control-allow-origin');
    if (acao) {
      pass(`OPTIONS /api/cv/banned → ${res.status}`, `ACAO: ${acao}`);
    } else {
      fail('OPTIONS /api/cv/banned — no CORS header');
    }
  } else {
    fail(`OPTIONS /api/cv/banned → HTTP ${res.status}`);
  }
}

// ── Health ────────────────────────────────────────────────────────────────────
async function testHealth() {
  section('GET /health');
  const { res, json, ms } = await req('GET', '/health');
  if (checkCors(res, 'GET /health') && checkStatus(res, 'GET /health') && checkJson(json, 'GET /health', ['ok', 'd1'])) {
    pass(`GET /health → ok`, `${ms}ms | verbs:${json.d1?.verbs} banned:${json.d1?.banned}`);
  }
}

// ── KV lookups ────────────────────────────────────────────────────────────────
async function testKV() {
  section('KV endpoints (words / banned / structures / rhythm)');

  {
    const { res, json, ms } = await req('GET', '/api/cv/words?category=technical&tense=past&count=5');
    if (checkCors(res, 'GET /api/cv/words') && checkStatus(res, 'GET /api/cv/words') && checkJson(json, 'GET /api/cv/words', ['words'])) {
      pass(`GET /api/cv/words`, `${ms}ms | ${json.words?.length} words`);
    }
  }
  {
    const { res, json, ms } = await req('GET', '/api/cv/banned');
    if (checkCors(res, 'GET /api/cv/banned') && checkStatus(res, 'GET /api/cv/banned') && checkJson(json, 'GET /api/cv/banned', ['banned'])) {
      pass(`GET /api/cv/banned`, `${ms}ms | ${json.banned?.length} entries`);
    }
  }
  {
    const { res, json, ms } = await req('GET', '/api/cv/structures?label=short');
    if (checkCors(res, 'GET /api/cv/structures') && checkStatus(res, 'GET /api/cv/structures')) {
      pass(`GET /api/cv/structures`, `${ms}ms | ${json.count ?? '?'} entries`);
    }
  }
  {
    const { res, json, ms } = await req('GET', '/api/cv/rhythm');
    if (checkCors(res, 'GET /api/cv/rhythm') && checkStatus(res, 'GET /api/cv/rhythm')) {
      pass(`GET /api/cv/rhythm`, `${ms}ms`);
    }
  }
}

// ── Deterministic endpoints ───────────────────────────────────────────────────
async function testDeterministic() {
  section('Deterministic endpoints (clean / validate / purify-cv)');

  {
    const { res, json, ms } = await req('POST', '/api/cv/clean', {
      rawText: 'I am passionate and enthusiastic. I leverage synergies to drive results.',
    });
    if (checkCors(res, 'POST /api/cv/clean') && checkStatus(res, 'POST /api/cv/clean') && checkJson(json, 'POST /api/cv/clean', ['cleaned'])) {
      pass(`POST /api/cv/clean`, `${ms}ms | ${json.change_count} changes`);
    }
  }

  {
    const bullets = ['Managed a team of 5 engineers across 3 projects.', 'Built a CI/CD pipeline reducing deploy time by 40%.'];
    const { res, json, ms } = await req('POST', '/api/cv/validate', { bullets });
    if (checkCors(res, 'POST /api/cv/validate') && checkStatus(res, 'POST /api/cv/validate') && checkJson(json, 'POST /api/cv/validate', ['score'])) {
      pass(`POST /api/cv/validate`, `${ms}ms | score:${json.score}`);
    }
  }

  {
    // purify-cv expects { cvData: CVData } — include all required fields
    const cvData = {
      personalInfo: { name: 'Test User', email: 'test@example.com', phone: '', location: '', linkedin: '', website: '' },
      summary: 'Experienced engineer seeking to leverage skills.',
      skills: ['Python', 'Node.js'],
      experience: [{
        company: 'ACME Corp', jobTitle: 'Software Engineer', dates: 'Jan 2022 – Present',
        startDate: '2022-01-01', endDate: 'Present',
        responsibilities: ['Manages a team of 4 engineers.', 'Deploys microservices weekly.'],
      }],
      education: [{ degree: 'B.Sc. Computer Science', school: 'State University', year: '2021', description: '' }],
      projects: [],
    };
    const { res, json, ms } = await req('POST', '/api/cv/purify-cv', { cv: cvData });
    if (checkCors(res, 'POST /api/cv/purify-cv') && checkStatus(res, 'POST /api/cv/purify-cv') && checkJson(json, 'POST /api/cv/purify-cv', ['cv'])) {
      const changes = json.report?.changes?.length ?? 0;
      pass(`POST /api/cv/purify-cv`, `${ms}ms | total changes:${changes}`);
    }
  }
}

// ── D1 cache endpoints ────────────────────────────────────────────────────────
async function testD1Cache() {
  section('D1 cache endpoints (llm-cache / examples / profile / market-research / jd-analysis)');

  // LLM cache key must be 64-char hex (SHA-256). Examples fingerprint must also be 64-char hex.
  const sha256Key = 'a'.repeat(64);
  const shortKey = 'test1234';

  {
    const { res, json, ms } = await req('GET', `/api/cv/llm-cache?key=${sha256Key}`);
    if (checkCors(res, 'GET /api/cv/llm-cache')) {
      if (res.status === 404 || res.status === 200) pass(`GET /api/cv/llm-cache (${res.status === 404 ? 'miss' : 'hit'})`, `${ms}ms`);
      else fail(`GET /api/cv/llm-cache → HTTP ${res.status}`, JSON.stringify(json));
    }
  }

  {
    const { res, json, ms } = await req('GET', `/api/cv/examples?fingerprint=${sha256Key}`);
    if (checkCors(res, 'GET /api/cv/examples')) {
      if (res.status === 404 || res.status === 200) pass(`GET /api/cv/examples (${res.status})`, `${ms}ms`);
      else fail(`GET /api/cv/examples → HTTP ${res.status}`, JSON.stringify(json));
    }
  }

  {
    const { res, json, ms } = await req('GET', `/api/cv/profile?hash=${sha256Key}`);
    if (checkCors(res, 'GET /api/cv/profile')) {
      if (res.status === 404 || res.status === 200) pass(`GET /api/cv/profile (${res.status})`, `${ms}ms`);
      else fail(`GET /api/cv/profile → HTTP ${res.status}`, JSON.stringify(json));
    }
  }

  {
    const { res, json, ms } = await req('GET', `/api/cv/market-research?key=${sha256Key}`);
    if (checkCors(res, 'GET /api/cv/market-research')) {
      if (res.status === 404 || res.status === 200) pass(`GET /api/cv/market-research (${res.status})`, `${ms}ms`);
      else fail(`GET /api/cv/market-research → HTTP ${res.status}`, JSON.stringify(json));
    }
  }

  {
    const { res, json, ms } = await req('GET', `/api/cv/jd-analysis?key=${shortKey}`);
    if (checkCors(res, 'GET /api/cv/jd-analysis')) {
      if (res.status === 404 || res.status === 200) pass(`GET /api/cv/jd-analysis (${res.status})`, `${ms}ms`);
      else fail(`GET /api/cv/jd-analysis → HTTP ${res.status}`, JSON.stringify(json));
    }
  }
}

// ── Account tier ──────────────────────────────────────────────────────────────
async function testAccountTier() {
  section('GET /api/cv/account-tier');
  const { res, json, ms } = await req('GET', '/api/cv/account-tier');
  if (checkCors(res, 'GET /api/cv/account-tier') && checkStatus(res, 'GET /api/cv/account-tier') && checkJson(json, 'GET /api/cv/account-tier', ['tier'])) {
    pass(`GET /api/cv/account-tier`, `${ms}ms | tier:${json.tier} model:${json.model}`);
  }
}

// ── Tiered LLM ────────────────────────────────────────────────────────────────
async function testTieredLLM() {
  section('POST /api/cv/tiered-llm (Workers AI)');
  const { res, json, ms } = await req('POST', '/api/cv/tiered-llm', {
    task: 'cvAudit',
    prompt: 'Reply with exactly: {"ok":true}',
    temperature: 0.1,
    maxTokens: 20,
  });
  if (checkCors(res, 'POST /api/cv/tiered-llm')) {
    if (res.status === 200 && json?.text) {
      pass(`POST /api/cv/tiered-llm`, `${ms}ms | model:${json.model} | text:"${json.text.slice(0,40)}"`);
    } else if (res.status === 502) {
      skip(`POST /api/cv/tiered-llm`, `HTTP 502 — CF daily quota likely exhausted (${json?.error})`);
    } else {
      fail(`POST /api/cv/tiered-llm → HTTP ${res.status}`, JSON.stringify(json).slice(0, 200));
    }
  }
}

// ── Proxy LLM (Claude) ────────────────────────────────────────────────────────
async function testProxyLLM() {
  section('POST /api/cv/proxy-llm (Claude via proxy)');
  if (!CLAUDE_KEY) {
    skip('POST /api/cv/proxy-llm (claude)', 'Set ANTHROPIC_API_KEY env var to test');
    return;
  }
  const { res, json, ms } = await req('POST', '/api/cv/proxy-llm', {
    provider: 'claude',
    apiKey: CLAUDE_KEY,
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a test assistant. Reply only with valid JSON.',
    userPrompt: 'Reply with exactly: {"test":"ok","source":"claude"}',
    temperature: 0.0,
    maxTokens: 50,
    json: true,
  });
  if (checkCors(res, 'POST /api/cv/proxy-llm (claude)') && checkStatus(res, 'POST /api/cv/proxy-llm (claude)') && checkJson(json, 'POST /api/cv/proxy-llm (claude)', ['text'])) {
    pass(`POST /api/cv/proxy-llm (claude)`, `${ms}ms | response: "${json.text?.slice(0, 60)}" cached:${json.cached}`);
  }
}

// ── Proxy LLM (Groq) ──────────────────────────────────────────────────────────
async function testProxyGroq() {
  section('POST /api/cv/proxy-llm (Groq via proxy)');
  if (!GROQ_KEY) {
    skip('POST /api/cv/proxy-llm (groq)', 'Set GROQ_API_KEY env var to test');
    return;
  }
  const { res, json, ms } = await req('POST', '/api/cv/proxy-llm', {
    provider: 'groq',
    apiKey: GROQ_KEY,
    model: 'llama-3.1-8b-instant',
    systemPrompt: 'Reply only with JSON.',
    userPrompt: 'Reply with exactly: {"test":"ok","source":"groq"}',
    temperature: 0.0,
    maxTokens: 50,
    json: true,
  });
  if (checkCors(res, 'POST /api/cv/proxy-llm (groq)') && checkStatus(res, 'POST /api/cv/proxy-llm (groq)') && checkJson(json, 'POST /api/cv/proxy-llm (groq)', ['text'])) {
    pass(`POST /api/cv/proxy-llm (groq)`, `${ms}ms | response: "${json.text?.slice(0, 60)}" cached:${json.cached}`);
  }
}

// ── Rules endpoint ────────────────────────────────────────────────────────────
async function testRules() {
  section('GET /api/cv/rules');
  const { res, json, ms } = await req('GET', '/api/cv/rules');
  if (checkCors(res, 'GET /api/cv/rules') && checkStatus(res, 'GET /api/cv/rules') && checkJson(json, 'GET /api/cv/rules', ['version'])) {
    pass(`GET /api/cv/rules`, `${ms}ms | version:${json.version}`);
  }
}

// ── Not found ─────────────────────────────────────────────────────────────────
async function testNotFound() {
  section('404 and CORS on unknown path');
  const { res, json, ms } = await req('GET', '/api/cv/does-not-exist-xyz');
  if (checkCors(res, 'GET /api/cv/does-not-exist-xyz') && checkStatus(res, 'GET /api/cv/does-not-exist-xyz', 404) && checkJson(json, 'GET /api/cv/does-not-exist-xyz', ['error'])) {
    pass(`GET /unknown → 404 with CORS`, `${ms}ms`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}ProCV Worker Endpoint Test${RESET}`);
console.log(`${DIM}Worker: ${WORKER_URL}`);
console.log(`Origin:  ${ORIGIN}${RESET}`);

try {
  await testPreflight();
  await testHealth();
  await testKV();
  await testDeterministic();
  await testD1Cache();
  await testAccountTier();
  await testTieredLLM();
  await testProxyLLM();
  await testProxyGroq();
  await testRules();
  await testNotFound();
} catch (err) {
  console.error(`\n${RED}Fatal error:${RESET}`, err);
}

const total = passed + failed + skipped;
console.log(`\n${'─'.repeat(50)}`);
console.log(`${BOLD}Results: ${GREEN}${passed} passed${RESET}  ${failed > 0 ? RED : ''}${failed} failed${RESET}  ${YELLOW}${skipped} skipped${RESET}  ${DIM}(${total} total)${RESET}`);
if (failed > 0) {
  console.log(`${RED}${BOLD}✗ Some tests failed — check output above.${RESET}\n`);
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}✓ All tests passed.${RESET}\n`);
  process.exit(0);
}
