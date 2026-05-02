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
| `POST /api/cv/semantic-match` | Workers AI embeddings (BGE-large) → per-keyword `matched`/`partial`/`missing` against profile texts. Stateless, no PII stored. |
| `POST /api/cv/llm` | Workers AI Llama-3.3-70B chat proxy. Used by the CV validator + humanizer audit passes (Parts 6 & 7) so they don't burn the user's Groq quota. Stateless. |
| `POST /api/cv/vision-extract` | Workers AI Llama-3.2-11B Vision. Image-only OCR/text extraction for CV uploads + JD screenshots. PDFs return 415 (caller must fall back to Gemini). One-time license acceptance required per Cloudflare account. Stateless. |

## /api/cv/llm

Powers the CV **validator** and **humanizer audit** passes. Saves Groq quota by serving the two heaviest post-generation passes from Cloudflare's free tier.

```jsonc
// Request
{
  "system":      "You are a strict CV editor. Return only valid JSON.",
  "prompt":      "<long prompt with the CV JSON to fix>",
  "json":        true,        // requests JSON-mode response
  "temperature": 0.15,
  "maxTokens":   10000
}

// Response
{
  "text":  "<raw model output — caller is responsible for JSON.parse + fence stripping>",
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
}
```

Caps: system ≤ 4 000 chars, prompt ≤ 60 000 chars, maxTokens ≤ 12 000. Returns 400 on missing prompt, 502 on model failure or empty completion.

**Privacy** — prompt is forwarded to Workers AI and discarded. Nothing is written to D1, KV, R2, or Vectorize. The client (`services/geminiService.ts` → `runGroqValidator`, `runHumanizationAudit`) tries this endpoint first and falls back to Groq Llama-3.3-70B on any failure.

## /api/cv/semantic-match

Powers the **CV Checker → Personalization** AI keyword panel.

```jsonc
// Request
{
  "keywords":     ["systems thinking", "kafka", "team mentorship"],
  "profileTexts": ["Led the migration to event-driven architecture using RabbitMQ",
                   "Mentored 4 junior engineers across two squads"]
}

// Response
{
  "results": [
    { "keyword": "systems thinking",  "score": 0.71, "bestMatch": "Led the migration…", "status": "partial" },
    { "keyword": "kafka",             "score": 0.55, "bestMatch": "Led the migration…", "status": "missing" },
    { "keyword": "team mentorship",   "score": 0.84, "bestMatch": "Mentored 4 junior…",   "status": "matched" }
  ],
  "model": "@cf/baai/bge-large-en-v1.5",
  "thresholds": { "matched": 0.78, "partial": 0.62 }
}
```

**Privacy** — embeddings are computed per request inside the worker and discarded.
Nothing is written to D1, KV, R2, or Vectorize. Caps: 60 keywords, 250 profile texts per call.

## Deploying changes

```bash
cd cv-engine-worker
npm run deploy   # uses CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
```
