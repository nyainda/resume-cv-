#!/usr/bin/env node
/* Row counts for every cv_* table, plus a sample of cv_verbs. */
'use strict';

const { d1Query } = require('./_lib.cjs');

const TABLES = [
    'cv_verbs', 'cv_openers', 'cv_context_connectors', 'cv_result_connectors',
    'cv_sentence_structures', 'cv_rhythm_patterns', 'cv_paragraph_structures',
    'cv_banned_phrases', 'cv_subjects', 'cv_seniority_levels', 'cv_field_profiles',
    'cv_seniority_field_combos', 'cv_voice_profiles',
];

(async () => {
    console.log('cv-engine-db row counts:\n');
    for (const t of TABLES) {
        try {
            const r = await d1Query(`SELECT COUNT(*) AS n FROM ${t}`);
            const n = r[0]?.results?.[0]?.n ?? 0;
            console.log(`  ${t.padEnd(28)} ${String(n).padStart(5)}`);
        } catch (e) {
            console.log(`  ${t.padEnd(28)}  ERROR: ${e.message}`);
        }
    }

    console.log('\nSample cv_verbs by category:');
    const cats = await d1Query(`SELECT category, COUNT(*) AS n FROM cv_verbs GROUP BY category ORDER BY n DESC`);
    for (const row of (cats[0]?.results || [])) {
        console.log(`  ${row.category.padEnd(15)} ${row.n}`);
    }
})();
