'use strict';

const { getPool, handlePreflight } = require('../_lib/pg');

module.exports = async function handler(req, res) {
    if (handlePreflight(req, res)) return;

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const pool = getPool();
    if (!pool) {
        return res.status(200).json({ ok: true, skipped: 'no-db' });
    }

    const b = req.body || {};
    if (!b.cvHash) return res.status(400).json({ error: 'cvHash required' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ins = await client.query(
            `INSERT INTO generation_log
              (cv_hash, user_label, model, prompt_version, generation_mode,
               output_word_count, round_number_ratio, repeated_phrase_count,
               tense_issue_count, bullets_tense_flipped, metrics_jittered, substitutions_made)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id`,
            [
                b.cvHash, b.userLabel || null, b.model || null, b.promptVersion || null,
                b.generationMode || null, b.outputWordCount || null,
                b.roundNumberRatio ?? null, b.repeatedPhraseCount ?? null,
                b.tenseIssueCount ?? null, b.bulletsTenseFlipped ?? 0,
                b.metricsJittered ?? 0, b.substitutionsMade ?? 0,
            ]
        );
        const generationId = ins.rows[0].id;

        if (Array.isArray(b.leaks) && b.leaks.length) {
            for (const leak of b.leaks) {
                if (!leak || !leak.leakType || !leak.phrase) continue;
                await client.query(
                    `INSERT INTO detected_leaks
                      (generation_id, cv_hash, leak_type, phrase, occurrences,
                       field_location, fixed_by, context_snippet)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        generationId, b.cvHash, leak.leakType,
                        String(leak.phrase).slice(0, 500),
                        leak.occurrences || 1,
                        leak.fieldLocation || null,
                        leak.fixedBy || null,
                        leak.contextSnippet ? String(leak.contextSnippet).slice(0, 1000) : null,
                    ]
                );
                if (leak.leakType === 'banned_phrase') {
                    await client.query(
                        `UPDATE banned_phrases
                            SET hits = hits + 1, last_seen = NOW()
                          WHERE LOWER(pattern) LIKE '%' || LOWER($1) || '%'
                             OR LOWER(replacement) = LOWER($1)`,
                        [leak.phrase]
                    );
                }
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ ok: true, generationId });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[telemetry] /log-generation failed:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
