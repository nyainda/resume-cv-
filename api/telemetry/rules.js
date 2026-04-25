import { getPool, handlePreflight } from '../_lib/pg.js';

export default async function handler(req, res) {
    if (handlePreflight(req, res)) return;

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const pool = getPool();
    if (!pool) {
        return res.status(200).json({
            bannedPhrases: [],
            verbPairs: [],
            pursuingPatterns: [],
            fetchedAt: new Date().toISOString(),
            skipped: 'no-db',
        });
    }

    try {
        const [bp, vp, pp] = await Promise.all([
            pool.query(
                `SELECT pattern, replacement, category, severity, flags
                   FROM banned_phrases WHERE enabled = TRUE ORDER BY id`
            ),
            pool.query(
                `SELECT present_form, past_form FROM verb_pairs
                   WHERE enabled = TRUE ORDER BY id`
            ),
            pool.query(
                `SELECT pattern FROM pursuing_patterns WHERE enabled = TRUE ORDER BY id`
            ),
        ]);
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        res.status(200).json({
            bannedPhrases: bp.rows,
            verbPairs: vp.rows,
            pursuingPatterns: pp.rows.map((r) => r.pattern),
            fetchedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[telemetry] /rules failed:', err.message);
        res.status(500).json({ error: err.message });
    }
}
