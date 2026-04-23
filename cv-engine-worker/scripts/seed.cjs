#!/usr/bin/env node
/* Bulk-insert seeds.json into cv-engine-db. Idempotent — uses INSERT OR IGNORE. */
'use strict';

const fs = require('fs');
const path = require('path');
const { d1Query, runConcurrent } = require('./_lib.cjs');

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');
const SEED_FILES = ['seeds.json', 'seeds-expansion.json'];

// Merge all seed files; arrays are concatenated, scalars from the first file win.
const SEEDS = {};
for (const f of SEED_FILES) {
    const p = path.join(SEEDS_DIR, f);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('_')) { if (!(k in SEEDS)) SEEDS[k] = v; continue; }
        if (Array.isArray(v)) {
            SEEDS[k] = (SEEDS[k] || []).concat(v);
        } else if (!(k in SEEDS)) {
            SEEDS[k] = v;
        }
    }
    console.log(`Loaded ${f}`);
}

/** Convert any array/object value to a JSON string for storage in TEXT columns. */
function flatten(v) {
    if (Array.isArray(v) || (v !== null && typeof v === 'object')) return JSON.stringify(v);
    return v;
}

/** Insert one row using INSERT OR IGNORE (skips on UNIQUE conflict). */
async function insertRow(table, row) {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
    const params = cols.map(c => flatten(row[c]));
    await d1Query(sql, params);
}

(async () => {
    let totalOk = 0, totalFail = 0;
    for (const [table, rows] of Object.entries(SEEDS)) {
        if (table.startsWith('_') || !Array.isArray(rows)) continue;
        process.stdout.write(`Seeding ${table.padEnd(28)} (${rows.length} rows)… `);
        let ok = 0, fail = 0;
        // D1 limits concurrent connections — keep it modest.
        await runConcurrent(rows, 4, async (row) => {
            try { await insertRow(table, row); ok++; }
            catch (e) { fail++; console.error(`\n  ✗ ${table}: ${e.message}`); }
        });
        console.log(`${ok} ok, ${fail} failed`);
        totalOk += ok; totalFail += fail;
    }
    console.log(`\nDone. ${totalOk} rows inserted, ${totalFail} failed.`);
    process.exit(totalFail ? 1 : 0);
})();
