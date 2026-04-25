'use strict';

const { Pool } = require('pg');

let cachedPool = null;

function getPool() {
    if (cachedPool) return cachedPool;
    if (!process.env.DATABASE_URL) return null;
    cachedPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
    cachedPool.on('error', (err) => {
        console.warn('[telemetry pg] pool error:', err.message);
    });
    return cachedPool;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function handlePreflight(req, res) {
    if (req.method === 'OPTIONS') {
        setCors(res);
        res.status(204).end();
        return true;
    }
    setCors(res);
    return false;
}

module.exports = { getPool, setCors, handlePreflight };
