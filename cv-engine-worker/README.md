# cv-engine-worker

Cloudflare Worker that serves the ProCV human-like CV generation engine.
Source of truth for word pools, banned phrases, voice/seniority/field profiles.

## Architecture

- **D1 (`cv-engine-db`)** — source of truth for 13 word-pool tables
- **KV (`CV_WORD_POOLS`)** — hot cache rebuilt on every D1 write
- **Workers AI** — voice scoring, JD keyword extraction (Phase C)

No R2 bucket — seed data lives in `seeds/seeds.json` in this repo and is
imported by `scripts/seed.cjs` straight into D1 via the Cloudflare API.

## Resource IDs

| Resource | Name | ID |
|---|---|---|
| D1 database | `cv-engine-db` | `5193fa77-54c8-4e49-bf3a-c615af170191` |
| KV namespace | `CV_WORD_POOLS` | `8e1722f00d9641b7a8f611b76dac8361` |
| KV preview | `CV_WORD_POOLS_PREVIEW` | `d9bc7d2a01f94e619b3054c19b8dc44f` |

## Setup (one-shot)

```bash
# From repo root
cd cv-engine-worker
npm run schema:apply        # creates the 13 tables
npm run seed                # bulk-inserts the seed JSON
npm run kv:sync             # rebuilds every CV_KV cache key
npm run stats               # row counts per table
```

All scripts use the Cloudflare REST API directly via the
`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` env vars — no `wrangler login`
required, works headless in Replit.

## Routes (Phase B+)

| Route | Purpose |
|---|---|
| `GET  /api/cv/words?category=&tense=&exclude=&count=` | Verb pool from KV/D1 |
| `POST /api/cv/validate` | Run validator, return score 0-10 |
| `POST /api/cv/clean` | Run cleaning pipeline on imported text |
| `POST /api/cv/brief` | Build pre-generation brief for Groq (Phase C) |
| `POST /api/cv/sync` | Manual KV cache rebuild after D1 writes |
