#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXTS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.md', '.json']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git']);
const PATTERN = /\bRULES?\b/gi;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walk(full, out);
      continue;
    }
    if (!EXTS.has(path.extname(name))) continue;
    out.push({ full, rel });
  }
  return out;
}

const files = walk(ROOT);
const counts = [];
let total = 0;
for (const f of files) {
  const txt = fs.readFileSync(f.full, 'utf8');
  const n = (txt.match(PATTERN) || []).length;
  if (!n) continue;
  counts.push([n, f.rel]);
  total += n;
}
counts.sort((a, b) => b[0] - a[0]);

console.log(`Total RULE/RULES occurrences: ${total}`);
for (const [n, rel] of counts.slice(0, 25)) {
  console.log(`${String(n).padStart(4, ' ')}  ${rel}`);
}
