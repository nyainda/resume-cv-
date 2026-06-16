#!/usr/bin/env node
/**
 * scrub-lockfile.mjs
 *
 * Replaces any Replit-internal package-firewall.replit.local resolved URLs
 * in package-lock.json with their public https://registry.npmjs.org equivalents.
 *
 * Why this exists:
 *   npm inside Replit is transparently proxied through package-firewall.replit.local
 *   for supply-chain security scanning. That proxy URL gets written into the
 *   `resolved` field of package-lock.json for every package fetched inside Replit.
 *   When Vercel (or GitHub Actions) runs `npm ci`, it tries to fetch packages
 *   from those internal URLs — which don't resolve outside Replit — and the build
 *   fails with ENOTFOUND package-firewall.replit.local.
 *
 * Usage:
 *   node backend/scripts/scrub-lockfile.mjs          # fix in-place (default)
 *   node backend/scripts/scrub-lockfile.mjs --check  # fail if any found (CI mode)
 *   node backend/scripts/scrub-lockfile.mjs --dry    # print what would change, no write
 *
 * Add to your pre-push / pre-commit workflow to keep the lockfile clean.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const LOCKFILE = resolve(REPO_ROOT, 'package-lock.json');

const REPLIT_RE = /http:\/\/package-firewall\.replit\.local\/npm\//g;
const NPM_REGISTRY = 'https://registry.npmjs.org/';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const dryRun   = args.has('--dry');

let content;
try {
  content = readFileSync(LOCKFILE, 'utf8');
} catch {
  console.error(`[scrub-lockfile] Could not read ${LOCKFILE}`);
  process.exit(1);
}

const matches = [...content.matchAll(REPLIT_RE)];

if (matches.length === 0) {
  console.log('[scrub-lockfile] ✓ No Replit proxy URLs found in package-lock.json.');
  process.exit(0);
}

// Show what was found
const affectedLines = content.split('\n')
  .map((line, i) => ({ line, num: i + 1 }))
  .filter(({ line }) => line.includes('package-firewall.replit.local'));

console.warn(`[scrub-lockfile] Found ${matches.length} Replit proxy URL(s) in package-lock.json:`);
for (const { line, num } of affectedLines) {
  console.warn(`  line ${num}: ${line.trim()}`);
}

if (checkOnly) {
  console.error('');
  console.error('[scrub-lockfile] ✗ --check mode: Replit proxy URLs must not be committed.');
  console.error('  Run:  npm run scrub-lockfile  (or: node backend/scripts/scrub-lockfile.mjs)');
  console.error('  Then commit the updated package-lock.json.');
  process.exit(1);
}

const fixed = content.replace(REPLIT_RE, NPM_REGISTRY);

if (dryRun) {
  console.log('[scrub-lockfile] --dry mode: would replace the above URLs. No file written.');
  process.exit(0);
}

writeFileSync(LOCKFILE, fixed, 'utf8');
console.log(`[scrub-lockfile] ✓ Replaced ${matches.length} URL(s). package-lock.json updated.`);
console.log('  Remember to commit the updated lockfile before pushing.');
