#!/usr/bin/env node
/* Extracts the six INSERT blocks from the attached "Expanded Seed Data v2"
 * markdown file and emits a single, idempotent SQL file that:
 *   - keeps every existing row (NO `DELETE FROM`)
 *   - rewrites every `INSERT INTO X (...) VALUES` as `INSERT OR IGNORE INTO X (...) VALUES`
 *   - preserves the original column lists from the seed doc verbatim
 *
 * Output: cv-engine-worker/sql/expanded-seed-v2.sql
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(
    __dirname, '..', '..', 'attached_assets',
    'Pasted--CV-Engine-EXPANDED-Seed-Data-v2-500-Verbs-Full-Sentenc_1777107886368.txt',
);
const OUT = path.join(__dirname, '..', 'sql', 'expanded-seed-v2.sql');

if (!fs.existsSync(SRC)) {
    console.error(`Seed source not found at ${SRC}`);
    process.exit(1);
}

const raw = fs.readFileSync(SRC, 'utf8');

// Pull every fenced ```sql … ``` block.
const fences = [...raw.matchAll(/```sql\s*\n([\s\S]*?)\n```/g)].map(m => m[1]);

// Of those, keep only the ones that actually contain an INSERT statement
// (skip the prose-only "production bugs seen" blocks).
const sqlBlocks = fences.filter(b => /INSERT\s+INTO\s+cv_/i.test(b));

if (sqlBlocks.length === 0) {
    console.error('No INSERT blocks found in seed source.');
    process.exit(1);
}

const headerComment = `-- ============================================================================
--  cv-engine-worker / sql / expanded-seed-v2.sql
--  AUTO-GENERATED from attached_assets/Pasted--CV-Engine-EXPANDED-Seed-Data-v2-…
--  Do NOT edit by hand — re-run scripts/extract-expanded-seed-v2.cjs instead.
--
--  Idempotent:
--    • every INSERT is rewritten as INSERT OR IGNORE
--    • DELETE FROM lines from the source are stripped (we never wipe existing data)
--    • SQL-level UNIQUE indexes on each cv_* table dedupe re-runs
--
--  Apply with: node cv-engine-worker/scripts/apply-sql-file.cjs sql/expanded-seed-v2.sql
--  Then KV-sync with: npm --prefix cv-engine-worker run kv:sync
-- ============================================================================
`;

const cleaned = sqlBlocks.map((block, i) => {
    let sql = block;

    // Drop "DELETE FROM cv_*;" — we never wipe existing seed data.
    sql = sql.replace(/^\s*DELETE\s+FROM\s+cv_\w+\s*;\s*$/gim, '');

    // Rewrite every INSERT INTO → INSERT OR IGNORE INTO so re-runs are no-ops.
    sql = sql.replace(/\bINSERT\s+INTO\s+(cv_\w+)/gi, 'INSERT OR IGNORE INTO $1');

    // Squash any leading blank lines.
    sql = sql.replace(/^\s*\n+/, '');

    return `-- ─── block ${i + 1}/${sqlBlocks.length} ────────────────────────────────\n${sql.trim()}\n`;
}).join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, headerComment + '\n' + cleaned);

const lineCount = (headerComment + cleaned).split('\n').length;
console.log(`✓ wrote ${OUT}`);
console.log(`  ${sqlBlocks.length} INSERT blocks · ${lineCount} lines`);
