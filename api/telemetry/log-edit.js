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

    const { cvHash, field, originalText, editedText } = req.body || {};
    if (!cvHash || !field || originalText == null || editedText == null) {
        return res.status(400).json({ error: 'cvHash, field, originalText, editedText required' });
    }
    if (originalText === editedText) {
        return res.status(200).json({ ok: true, skipped: 'no-change' });
    }

    const aTokens = String(originalText).split(/\s+/).filter(Boolean);
    const bTokens = String(editedText).split(/\s+/).filter(Boolean);
    const aSet = new Set(aTokens.map((t) => t.toLowerCase()));
    const bSet = new Set(bTokens.map((t) => t.toLowerCase()));
    const removed = Array.from(aSet).filter((t) => !bSet.has(t)).slice(0, 50);
    const added = Array.from(bSet).filter((t) => !aSet.has(t)).slice(0, 50);
    const editDistance = Math.abs(aTokens.length - bTokens.length) + removed.length + added.length;

    try {
        await pool.query(
            `INSERT INTO user_edits
              (cv_hash, field, original_text, edited_text, edit_distance, removed_tokens, added_tokens)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
                cvHash, field,
                String(originalText).slice(0, 4000),
                String(editedText).slice(0, 4000),
                editDistance, removed, added,
            ]
        );
        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[telemetry] /log-edit failed:', err.message);
        res.status(500).json({ error: err.message });
    }
};
