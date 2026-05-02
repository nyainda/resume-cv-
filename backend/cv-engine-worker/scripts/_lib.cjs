/* Shared helpers for D1 + KV management scripts.
   Uses fetch + the Cloudflare REST API directly (no wrangler login required). */
'use strict';

const ACCOUNT_ID = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const TOKEN = (process.env.CLOUDFLARE_API_TOKEN || '').trim();

if (!ACCOUNT_ID || !TOKEN) {
    console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN env var.');
    process.exit(1);
}

const D1_DB_ID = '5193fa77-54c8-4e49-bf3a-c615af170191';
const KV_ID    = '8e1722f00d9641b7a8f611b76dac8361';

const ACCOUNT_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;
const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
};

/** Execute a single SQL statement (or batch of params) against cv-engine-db. */
async function d1Query(sql, params = []) {
    const r = await fetch(`${ACCOUNT_BASE}/d1/database/${D1_DB_ID}/query`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ sql, params }),
    });
    const j = await r.json();
    if (!j.success) {
        const err = (j.errors || []).map(e => `${e.code}: ${e.message}`).join('; ');
        throw new Error(`D1 query failed — ${err}\nSQL: ${sql.slice(0, 160)}…`);
    }
    return j.result;
}

/** Write a JSON value to a CV_KV key. */
async function kvPut(key, value) {
    const r = await fetch(
        `${ACCOUNT_BASE}/storage/kv/namespaces/${KV_ID}/values/${encodeURIComponent(key)}`,
        {
            method: 'PUT',
            headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
            body: typeof value === 'string' ? value : JSON.stringify(value),
        }
    );
    const j = await r.json().catch(() => ({}));
    if (!j.success) {
        throw new Error(`KV PUT ${key} failed: ${JSON.stringify(j.errors || j)}`);
    }
}

/** Run an array of async tasks with a fixed concurrency limit. */
async function runConcurrent(items, limit, worker) {
    const results = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const i = cursor++;
            results[i] = await worker(items[i], i);
        }
    });
    await Promise.all(runners);
    return results;
}

module.exports = { d1Query, kvPut, runConcurrent, ACCOUNT_ID, D1_DB_ID, KV_ID };
