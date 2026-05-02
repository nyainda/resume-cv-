#!/usr/bin/env node
/* Bulk-insert seeds.json into cv-engine-db. Idempotent — uses INSERT OR IGNORE. */
'use strict';

const fs = require('fs');
const path = require('path');
const { d1Query, runConcurrent } = require('./_lib.cjs');

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');
const SEED_FILES = ['seeds.json', 'seeds-expansion.json', 'custom-pack.json'];

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

const UNIQUE_KEY_BY_TABLE = {
    cv_verbs:              ['verb_present', 'category'],
    cv_openers:            ['opener'],
    cv_context_connectors: ['connector'],
    cv_result_connectors:  ['connector'],
    cv_sentence_structures:['pattern_label', 'pattern', 'section'],
    cv_rhythm_patterns:    ['pattern_name'],
    cv_paragraph_structures:['section', 'pattern'],
    cv_banned_phrases:     ['phrase'],
    cv_subjects:           ['subject', 'usage'],
    cv_seniority_levels:   ['level'],
    cv_field_profiles:     ['field'],
    cv_seniority_field_combos: ['seniority', 'field'],
    cv_voice_profiles:     ['name'],
};

function dedupeRows(table, rows) {
    const keys = UNIQUE_KEY_BY_TABLE[table];
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const sig = keys
            ? keys.map(k => String(row?.[k] ?? '').trim().toLowerCase()).join('||')
            : JSON.stringify(row);
        if (!sig || sig === '||') continue;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(row);
    }
    return out;
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
    for (const [table, rowsRaw] of Object.entries(SEEDS)) {
        if (table.startsWith('_') || !Array.isArray(rowsRaw)) continue;
        const rows = dedupeRows(table, rowsRaw);
        process.stdout.write(`Seeding ${table.padEnd(28)} (${rows.length} unique rows)… `);
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
