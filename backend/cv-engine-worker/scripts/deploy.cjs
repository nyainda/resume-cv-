#!/usr/bin/env node
/**
 * Wrapper around `wrangler deploy` that trims whitespace from the
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN env vars before invoking
 * wrangler. Replit secret values can include trailing newlines which
 * cause wrangler to send a malformed Cloudflare API URL.
 */
const { spawnSync } = require('child_process');

const env = { ...process.env };
for (const k of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    if (env[k]) env[k] = String(env[k]).replace(/\s+/g, '');
}

const r = spawnSync('npx', ['wrangler', 'deploy', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
});
process.exit(r.status ?? 1);
