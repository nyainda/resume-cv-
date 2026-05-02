#!/usr/bin/env node
/* Rebuild every CV_KV cache key from D1.  Run once after a seed. */
'use strict';

const { d1Query, kvPut } = require('./_lib.cjs');

const VERB_CATEGORIES = ['technical', 'management', 'analysis', 'communication', 'financial', 'creative'];

(async () => {
    const tasks = [];

    /* Banned phrases — single hot key */
    tasks.push(async () => {
        const r = await d1Query(`SELECT phrase, replacement, severity FROM cv_banned_phrases ORDER BY LENGTH(phrase) DESC`);
        const rows = r[0]?.results || [];
        await kvPut('cv:banned:all', rows);
        return ['cv:banned:all', rows.length];
    });

    /* Verbs — by category and tense */
    for (const cat of VERB_CATEGORIES) {
        for (const tense of ['present', 'past']) {
            tasks.push(async () => {
                const r = await d1Query(
                    `SELECT verb_present, verb_past, energy_level, human_score
                     FROM cv_verbs
                     WHERE category = ? AND human_score >= 7
                     ORDER BY human_score DESC`,
                    [cat]
                );
                const rows = r[0]?.results || [];
                const key = `cv:verbs:${cat}:${tense}`;
                await kvPut(key, rows);
                return [key, rows.length];
            });
        }
    }

    /* Structures — grouped by length label */
    for (const label of ['short', 'medium', 'long', 'personality']) {
        tasks.push(async () => {
            const r = await d1Query(
                `SELECT pattern_label, pattern, word_count_min, word_count_max, example, use_frequency
                 FROM cv_sentence_structures WHERE pattern_label = ?`,
                [label]
            );
            const rows = r[0]?.results || [];
            const key = `cv:structures:${label}`;
            await kvPut(key, rows);
            return [key, rows.length];
        });
    }

    /* Rhythm patterns — by section */
    tasks.push(async () => {
        const r = await d1Query(`SELECT pattern_name, sequence, section, bullet_count, description, human_score FROM cv_rhythm_patterns`);
        const rows = (r[0]?.results || []).map(row => ({ ...row, sequence: JSON.parse(row.sequence) }));
        await kvPut('cv:rhythm:all', rows);
        // also bucket by section
        const bySection = {};
        for (const row of rows) (bySection[row.section] ||= []).push(row);
        for (const [sec, list] of Object.entries(bySection)) {
            await kvPut(`cv:rhythm:${sec}`, list);
        }
        return ['cv:rhythm:*', rows.length];
    });

    /* Result connectors — single hot key, plus by type */
    tasks.push(async () => {
        const r = await d1Query(`SELECT connector, type, example, human_score FROM cv_result_connectors ORDER BY human_score DESC`);
        const rows = r[0]?.results || [];
        await kvPut('cv:results:all', rows);
        const byType = {};
        for (const row of rows) (byType[row.type] ||= []).push(row);
        for (const [t, list] of Object.entries(byType)) {
            await kvPut(`cv:results:${t}`, list);
        }
        return ['cv:results:*', rows.length];
    });

    /* Context connectors */
    tasks.push(async () => {
        const r = await d1Query(`SELECT connector, type, example FROM cv_context_connectors`);
        const rows = r[0]?.results || [];
        await kvPut('cv:contexts:all', rows);
        const byType = {};
        for (const row of rows) (byType[row.type] ||= []).push(row);
        for (const [t, list] of Object.entries(byType)) {
            await kvPut(`cv:contexts:${t}`, list);
        }
        return ['cv:contexts:*', rows.length];
    });

    /* Openers */
    tasks.push(async () => {
        const r = await d1Query(`SELECT opener, type, triggers_comma, example, length_type FROM cv_openers`);
        const rows = r[0]?.results || [];
        await kvPut('cv:openers:all', rows);
        return ['cv:openers:all', rows.length];
    });

    /* Voices */
    tasks.push(async () => {
        const r = await d1Query(`SELECT * FROM cv_voice_profiles`);
        const rows = (r[0]?.results || []).map(row => {
            const out = { ...row };
            for (const f of ['compatible_fields', 'compatible_seniority', 'incompatible_with', 'verb_bias', 'structure_bias']) {
                if (typeof out[f] === 'string') { try { out[f] = JSON.parse(out[f]); } catch {} }
            }
            return out;
        });
        await kvPut('cv:voices:all', rows);
        return ['cv:voices:all', rows.length];
    });

    /* Seniority levels */
    tasks.push(async () => {
        const r = await d1Query(`SELECT * FROM cv_seniority_levels`);
        const rows = (r[0]?.results || []).map(row => {
            const out = { ...row };
            if (typeof out.forbidden_phrases === 'string') {
                try { out.forbidden_phrases = JSON.parse(out.forbidden_phrases); } catch {}
            }
            return out;
        });
        await kvPut('cv:seniority:all', rows);
        return ['cv:seniority:all', rows.length];
    });

    /* Fields */
    tasks.push(async () => {
        const r = await d1Query(`SELECT * FROM cv_field_profiles`);
        const rows = (r[0]?.results || []).map(row => {
            const out = { ...row };
            for (const f of ['preferred_verbs', 'avoided_verbs', 'metric_types', 'jd_keywords']) {
                if (typeof out[f] === 'string') { try { out[f] = JSON.parse(out[f]); } catch {} }
            }
            return out;
        });
        await kvPut('cv:fields:all', rows);
        return ['cv:fields:all', rows.length];
    });

    /* Forbidden combos */
    tasks.push(async () => {
        const r = await d1Query(`SELECT * FROM cv_seniority_field_combos`);
        const rows = (r[0]?.results || []).map(row => {
            const out = { ...row };
            if (typeof out.forbidden_phrases === 'string') {
                try { out.forbidden_phrases = JSON.parse(out.forbidden_phrases); } catch {}
            }
            return out;
        });
        await kvPut('cv:combos:all', rows);
        return ['cv:combos:all', rows.length];
    });

    /* Paragraph structures */
    tasks.push(async () => {
        const r = await d1Query(`SELECT * FROM cv_paragraph_structures`);
        const rows = (r[0]?.results || []).map(row => {
            const out = { ...row };
            if (typeof out.rules === 'string') {
                try { out.rules = JSON.parse(out.rules); } catch {}
            }
            return out;
        });
        await kvPut('cv:paragraphs:all', rows);
        return ['cv:paragraphs:all', rows.length];
    });

    console.log(`Rebuilding ${tasks.length} CV_KV cache keys…`);
    const results = await Promise.all(tasks.map(t => t().catch(e => ({ err: e.message }))));
    let ok = 0, fail = 0;
    for (const r of results) {
        if (Array.isArray(r)) { console.log(`  ✓ ${r[0].padEnd(30)} (${r[1]} rows)`); ok++; }
        else { console.error(`  ✗ ${JSON.stringify(r)}`); fail++; }
    }
    console.log(`\nDone. ${ok} keys rebuilt, ${fail} failed.`);
    process.exit(fail ? 1 : 0);
})();
