import { getPool, handlePreflight, setCors } from './_lib/pg.js';

const MAX_PROMPT_SIZE = 100_000;
const MAX_RESPONSE_SIZE = 500_000;

export default async function handler(req, res) {
    if (handlePreflight(req, res)) return;
    setCors(res);

    const pool = getPool();
    if (!pool) {
        return res.status(503).json({ ok: false, error: 'cache_unavailable' });
    }

    try {
        if (req.method === 'GET') {
            const key = (req.query.key || '').toString().trim();
            if (!/^[a-f0-9]{64}$/i.test(key)) {
                return res.status(400).json({ ok: false, error: 'invalid_key' });
            }

            const r = await pool.query(
                `UPDATE groq_cache
                    SET hit_count = hit_count + 1,
                        last_hit_at = NOW()
                    WHERE key = $1
                      AND expires_at > NOW()
                    RETURNING response, model, hit_count`,
                [key]
            );
            if (r.rows.length === 0) {
                return res.status(404).json({ ok: false, hit: false });
            }
            return res.status(200).json({
                ok: true,
                hit: true,
                response: r.rows[0].response,
                model: r.rows[0].model,
                hitCount: r.rows[0].hit_count,
            });
        }

        if (req.method === 'POST') {
            const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
            const { key, model, temperature, response, promptSize } = body || {};

            if (!/^[a-f0-9]{64}$/i.test(String(key || ''))) {
                return res.status(400).json({ ok: false, error: 'invalid_key' });
            }
            if (typeof model !== 'string' || !model) {
                return res.status(400).json({ ok: false, error: 'missing_model' });
            }
            if (typeof response !== 'string' || !response) {
                return res.status(400).json({ ok: false, error: 'missing_response' });
            }
            const temp = Number(temperature ?? 0.2);
            if (!Number.isFinite(temp) || temp > 0.5) {
                return res.status(400).json({ ok: false, error: 'temperature_too_high' });
            }
            if (response.length > MAX_RESPONSE_SIZE) {
                return res.status(413).json({ ok: false, error: 'response_too_large' });
            }
            const ps = Number(promptSize ?? 0);
            if (ps > MAX_PROMPT_SIZE) {
                return res.status(413).json({ ok: false, error: 'prompt_too_large' });
            }

            await pool.query(
                `INSERT INTO groq_cache (key, model, temperature, response, prompt_size, response_size)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (key) DO UPDATE
                    SET response = EXCLUDED.response,
                        last_hit_at = NOW(),
                        expires_at = NOW() + INTERVAL '7 days'`,
                [key, model, temp, response, ps, response.length]
            );
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    } catch (e) {
        console.error('[groq-cache] error:', e?.message || e);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
}
