#!/usr/bin/env bash
# Deploy cv-engine-worker to Cloudflare, automatically appending the current
# Replit dev domain to ALLOWED_ORIGINS so CORS works without manual toml edits.

set -e

BASE_ORIGINS="https://resume-cv-gold.vercel.app,https://834955d1-1e37-4e3f-869f-5ee38d5d7b9c-00-7yu8z6k9iyvv.spock.replit.dev,https://404d5348-5ab4-4320-abe1-1e7e2111307a-00-2msd3az7h5qjm.spock.replit.dev"

if [ -n "$REPLIT_DEV_DOMAIN" ]; then
  ORIGINS="${BASE_ORIGINS},https://${REPLIT_DEV_DOMAIN}"
  echo "➕ Appending Replit dev domain: https://${REPLIT_DEV_DOMAIN}"
else
  ORIGINS="$BASE_ORIGINS"
  echo "ℹ️  REPLIT_DEV_DOMAIN not set — deploying with stable origins only"
fi

echo "🚀 Deploying cv-engine-worker..."
npx wrangler deploy --env="" --var "ALLOWED_ORIGINS:${ORIGINS}"
