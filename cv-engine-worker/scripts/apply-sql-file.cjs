#!/usr/bin/env node
/* Apply an arbitrary .sql file to cv-engine-db over the Cloudflare REST API.
 *
 *   node scripts/apply-sql-file.cjs sql/expanded-seed-v2.sql
 *
 * Why this exists:
 *   - `npm run schema:apply` and `npm run seed` are bound to specific files.
 *   - For ad-hoc seed packs we just want a tiny, generic runner that:
 *       · splits multi-statement SQL on `;` (respecting quoted strings)
 *       · groups statements into chunks of N (D1 REST has a per-call payload
 *         cap, and chunking keeps per-batch error reporting useful)
 *       · runs each chunk via the existing d1Query helper
 *
 * Idempotent — every statement in the file should already use `CREATE … IF NOT
 * EXISTS` or `INSERT OR IGNORE`, so re-runs are safe.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { d1Query } = require('./_lib.cjs');

const arg = process.argv[2];
if (!arg) {
    console.error('Usage: node scripts/apply-sql-file.cjs <path-to-sql>');
    process.exit(1);
}
const SQL_PATH = path.isAbsolute(arg) ? arg : path.join(__dirname, '..', arg);
if (!fs.existsSync(SQL_PATH)) {
    console.error(`SQL file not found: ${SQL_PATH}`);
    process.exit(1);
}

const raw = fs.readFileSync(SQL_PATH, 'utf8');

/** Strip leading `-- line comments` and blank lines from a statement. */
function stripLeadingComments(stmt) {
    return stmt
        .replace(/^(?:\s*--[^\n]*\n)+/g, '')   // leading line-comment block
        .replace(/^\s+/, '');
}

/** Split SQL on `;` while respecting single-quoted strings (with '' escaping). */
function splitStatements(sql) {
    const out = [];
    let buf = '';
    let inStr = false;
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        if (inStr) {
            buf += c;
            if (c === "'") {
                // '' is an escaped quote, stay in string
                if (sql[i + 1] === "'") { buf += "'"; i++; }
                else inStr = false;
            }
        } else {
            if (c === "'") { inStr = true; buf += c; continue; }
            if (c === ';') {
                buf = stripLeadingComments(buf);
                if (buf) out.push(buf);
                buf = '';
                continue;
            }
            buf += c;
        }
    }
    const tail = stripLeadingComments(buf);
    if (tail) out.push(tail);
    // Final pass: drop anything that, after stripping inline comments, has no
    // SQL keyword left (pure comment chunks).
    return out.filter(s => /\b(?:CREATE|INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|PRAGMA|BEGIN|COMMIT)\b/i.test(s));
}

const statements = splitStatements(raw);
if (statements.length === 0) {
    console.log('No statements found.');
    process.exit(0);
}

const CHUNK_SIZE = 20;
const chunks = [];
for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    chunks.push(statements.slice(i, i + CHUNK_SIZE));
}

console.log(`Applying ${statements.length} statements in ${chunks.length} chunks → ${path.basename(SQL_PATH)}`);

(async () => {
    let ok = 0, fail = 0;
    for (let i = 0; i < chunks.length; i++) {
        const sql = chunks[i].join(';\n') + ';';
        try {
            await d1Query(sql);
            ok += chunks[i].length;
            process.stdout.write(`  chunk ${String(i + 1).padStart(3)}/${chunks.length} · +${chunks[i].length} ok\n`);
        } catch (err) {
            fail += chunks[i].length;
            console.error(`  chunk ${i + 1}/${chunks.length} FAILED — ${err.message}`);
            // Re-run statement-by-statement to find the bad one and isolate it.
            for (const stmt of chunks[i]) {
                try { await d1Query(stmt); }
                catch (e) { console.error(`    · ${stmt.slice(0, 100)}…  →  ${e.message.slice(0, 120)}`); }
            }
        }
    }
    console.log(`\nDone. ${ok} ok, ${fail} failed.`);
    process.exit(fail ? 1 : 0);
})();
