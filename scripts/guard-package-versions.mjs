#!/usr/bin/env node
/**
 * guard-package-versions.mjs
 *
 * CI hard gate: fails the build if a protected package has been downgraded
 * below the known-working minimum version, OR completely removed.
 *
 * The protected list captures the packages where a downgrade has bitten us
 * before — most notably @cloudflare/puppeteer, where the 0.0.5 → 1.x jump
 * was required to fix a server-side protocol change at Cloudflare.
 *
 * Usage:
 *   node scripts/guard-package-versions.mjs            # checks main app
 *   node scripts/guard-package-versions.mjs --worker   # checks resume-pdf-worker
 *
 * To raise a floor, just bump the `min` field below; comments document why.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const isWorker = args.has('--worker');

// ─── Protected versions ─────────────────────────────────────────────────
// Each entry: {pkg, min, where, why}.
// `where` is 'app' or 'worker', controlling which run picks it up.
const PROTECTED = [
  // ── Main app ──
  {
    pkg: 'react',
    min: '19.0.0',
    where: 'app',
    why: 'App is built on React 19 hooks (useActionState etc.).',
  },
  {
    pkg: 'vite',
    min: '6.0.0',
    where: 'app',
    why: 'Vite 6 needed for the /__pdf proxy config used in dev.',
  },
  {
    pkg: '@react-pdf/renderer',
    min: '4.0.0',
    where: 'app',
    why: 'PDF fallback engine — earlier versions render Unicode incorrectly.',
  },
  {
    pkg: '@google/genai',
    min: '1.0.0',
    where: 'app',
    why: 'Gemini SDK API changed in 1.x; older versions break vision calls.',
  },

  // ── Cloudflare PDF worker ──
  {
    pkg: '@cloudflare/puppeteer',
    min: '1.0.0',
    where: 'worker',
    why: 'Cloudflare changed the Browser Rendering session URL contract; ' +
         '0.0.x SDKs hit "Invalid URL: /v1/acquire" in production.',
  },
  {
    pkg: 'wrangler',
    min: '3.100.0',
    where: 'worker',
    why: 'Earlier Wranglers cannot deploy compatibility_date 2025-01-01.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Compares two semver strings (no pre-release support — we never pin to RCs).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Strips ^/~/>= from a semver range and returns just the version string. */
function bareVersion(rangeOrVersion) {
  return rangeOrVersion.replace(/^[\^~>=<]+\s*/, '').trim();
}

function loadPkg(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ─── Main ───────────────────────────────────────────────────────────────

const targetPath = isWorker
  ? resolve(REPO_ROOT, 'resume-pdf-worker/package.json')
  : resolve(REPO_ROOT, 'package.json');

const targetLabel = isWorker ? 'resume-pdf-worker' : 'main app';
const pkg = loadPkg(targetPath);
const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const scope = isWorker ? 'worker' : 'app';
const protections = PROTECTED.filter(p => p.where === scope);

console.log(`[guard] Checking ${protections.length} protected package(s) in ${targetLabel}…`);

const failures = [];
for (const { pkg: name, min, why } of protections) {
  const declaredRange = declared[name];
  if (!declaredRange) {
    failures.push({
      name,
      reason: `MISSING — package was removed entirely. Minimum required: ${min}.`,
      why,
    });
    continue;
  }
  const declaredVersion = bareVersion(declaredRange);
  if (semverCompare(declaredVersion, min) < 0) {
    failures.push({
      name,
      reason: `DOWNGRADED — package.json declares ${declaredRange}, minimum allowed is ${min}.`,
      why,
    });
    continue;
  }
  console.log(`  ✓ ${name} ${declaredRange} (>= ${min})`);
}

if (failures.length === 0) {
  console.log(`[guard] All ${protections.length} protected package(s) OK.`);
  process.exit(0);
}

console.error('');
console.error(`[guard] ${failures.length} protected package(s) failed the gate:`);
for (const f of failures) {
  console.error('');
  console.error(`  ✗ ${f.name}`);
  console.error(`    ${f.reason}`);
  console.error(`    Why this matters: ${f.why}`);
}
console.error('');
console.error('[guard] To intentionally lower the floor, edit the PROTECTED list in');
console.error('        scripts/guard-package-versions.mjs and document the reason.');
process.exit(1);
