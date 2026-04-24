#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 5000;
const cwd = process.cwd();

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

const envLocal = loadDotEnv(path.join(cwd, '.env.local'));
const envFile = loadDotEnv(path.join(cwd, '.env'));

function parseCliOverrides(argv) {
  const out = {};
  for (const token of argv) {
    const eqIdx = token.indexOf('=');
    const colonIdx = token.indexOf(':');
    const sepIdx =
      eqIdx > 0
        ? eqIdx
        : (colonIdx > 0 && !token.startsWith('http') ? colonIdx : -1);
    if (sepIdx <= 0) continue;
    const key = token.slice(0, sepIdx).trim();
    const value = token.slice(sepIdx + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

const cliOverrides = parseCliOverrides(process.argv.slice(2));
const getEnv = (key) => cliOverrides[key] || process.env[key] || envLocal[key] || envFile[key] || '';

const PDF_WORKER_URL = getEnv('VITE_PDF_WORKER_URL');
const CV_ENGINE_URL = getEnv('VITE_CV_ENGINE_URL');

async function fetchJsonWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (error) {
    return { ok: false, status: 0, json: null, text: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBaseUrl(rawUrl) {
  return rawUrl.replace(/\/$/, '');
}

async function checkPdfWorker(baseUrl) {
  const url = `${normalizeBaseUrl(baseUrl)}/health`;
  const result = await fetchJsonWithTimeout(url);
  const healthy = result.ok && result.json && (result.json.ok === true || result.json.status === 'ok');
  return {
    name: 'PDF Worker',
    url,
    healthy,
    details: healthy
      ? `healthy (HTTP ${result.status})`
      : `unhealthy (HTTP ${result.status}) ${result.text?.slice(0, 180) || ''}`,
  };
}

async function checkCvEngine(baseUrl) {
  const url = `${normalizeBaseUrl(baseUrl)}/health`;
  const result = await fetchJsonWithTimeout(url);
  const d1 = result.json?.d1;
  const hasD1Counts = d1 && typeof d1 === 'object' && ['verbs', 'banned', 'voices', 'rhythms'].every((k) => Number.isFinite(Number(d1[k])));
  const healthy = result.ok && result.json?.ok === true && hasD1Counts;
  const d1Summary = hasD1Counts
    ? `D1 rows — verbs:${d1.verbs}, banned:${d1.banned}, voices:${d1.voices}, rhythms:${d1.rhythms}`
    : 'D1 counts missing';
  return {
    name: 'CV Engine Worker + D1',
    url,
    healthy,
    details: healthy
      ? `healthy (HTTP ${result.status}) | ${d1Summary}`
      : `unhealthy (HTTP ${result.status}) | ${d1Summary} | ${result.text?.slice(0, 180) || ''}`,
  };
}

async function main() {
  const checks = [];
  if (Object.keys(cliOverrides).length > 0) {
    console.log(`ℹ️  Using CLI overrides: ${Object.keys(cliOverrides).join(', ')}`);
  }

  if (!PDF_WORKER_URL) {
    console.log('⚠️  VITE_PDF_WORKER_URL is not configured (.env.local/.env/process env).');
  } else {
    checks.push(checkPdfWorker(PDF_WORKER_URL));
  }

  if (!CV_ENGINE_URL) {
    console.log('⚠️  VITE_CV_ENGINE_URL is not configured (.env.local/.env/process env).');
  } else {
    checks.push(checkCvEngine(CV_ENGINE_URL));
  }

  if (checks.length === 0) {
    console.log('❌ No Cloudflare endpoints configured to test.');
    process.exit(2);
  }

  const results = await Promise.all(checks);
  let failed = 0;
  for (const result of results) {
    if (result.healthy) {
      console.log(`✅ ${result.name}: ${result.details}`);
    } else {
      failed += 1;
      console.log(`❌ ${result.name}: ${result.details}`);
    }
    console.log(`   ↳ ${result.url}`);
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log('✅ Cloudflare connectivity checks passed.');
}

main();
