#!/usr/bin/env node
/* Apply schema.sql to cv-engine-db. Splits on `;`, runs each statement. */
'use strict';

const fs = require('fs');
const path = require('path');
const { d1Query } = require('./_lib.cjs');

(async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    // Split on `;` at end of line (safer than blind split).
    const statements = sql
        .split(/;\s*\n/)
        .map(s => s.trim())
        .filter(s => s && !/^--/.test(s.split('\n')[0]) || /CREATE/i.test(s));

    console.log(`Applying ${statements.length} statements to cv-engine-db…`);

    let ok = 0, fail = 0;
    for (const stmt of statements) {
        if (!stmt) continue;
        try {
            await d1Query(stmt);
            ok++;
            const head = stmt.replace(/\s+/g, ' ').slice(0, 70);
            process.stdout.write(`  ✓ ${head}…\n`);
        } catch (e) {
            fail++;
            console.error(`  ✗ ${stmt.slice(0, 80)}…\n    ${e.message}`);
        }
    }

    console.log(`\nDone. ${ok} ok, ${fail} failed.`);
    process.exit(fail ? 1 : 0);
})();
