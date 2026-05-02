# CV Engine Population Guide (D1 + KV)

This is the practical place to add the "gold" language assets that shape CV output quality.

## Important reality check

No platform can honestly guarantee **"100% interview, no mistakes"** for all users and all jobs.

What this system can do reliably:
- maximize ATS compatibility,
- improve role-language matching,
- reduce weak/cliche phrasing,
- keep tone/structure consistent.

## Where to put your words and rules

You have 3 supported input paths:

1. **Curated seed files (recommended for versioned data):**
   - `cv-engine-worker/seeds/seeds.json`
   - `cv-engine-worker/seeds/seeds-expansion.json`
   - `cv-engine-worker/seeds/custom-pack.json` (optional, team-specific)

2. **Template for custom pack:**
   - `cv-engine-worker/seeds/custom-pack.template.json`
   - Copy it to `custom-pack.json`, then fill your curated words/rules.
   - Template now includes starter blocks for all major `cv_*` tables, including voice/rhythm/structures.

3. **Admin UI (live edits):**
   - `Admin CV Engine` page can bulk add/update/delete and sync KV.

4. **Cloudflare D1 SQL Editor (manual SQL path):**
   - Open your D1 database in Cloudflare dashboard and run SQL directly.
   - Use `cv-engine-worker/sql/custom-pack.upsert.sql` as a starter.
   - After SQL writes, run KV sync (`npm run kv:sync` or the Admin UI "Sync KV" button).

## Fast workflow to populate from GitHub/job data

1. Collect raw phrases/sentences/verbs from trusted sources.
2. Normalize/dedupe (lowercase comparison, trim punctuation).
3. Classify into the right table:
   - action verbs -> `cv_verbs`
   - anti-patterns/cliches -> `cv_banned_phrases`
   - field intents + jd terms -> `cv_field_profiles.jd_keywords`
   - tone styles -> `cv_voice_profiles`
4. Put curated rows in `custom-pack.json`.
   - You can keep every table present; empty arrays are allowed.
   - Duplicate rows are auto-filtered by `seed.cjs` using table-specific unique keys.
5. Run seed script (idempotent insert-or-ignore):
   - `cd cv-engine-worker`
   - `npm run seed`
6. Rebuild KV cache:
   - `npm run kv:sync`

## Why this works in your pipeline

- Frontend `generateCV` calls worker brief builder (`/api/cv/brief`) as best-effort guidance.
- Worker scores JD against `jd_keywords` and returns field/voice/rhythm/verb pool.
- That brief is injected into LLM prompt before Groq writes the final CV.

So: your DB is the steering layer; Groq is the writer.

## Quality guardrails (highly recommended)

- Keep `human_score >= 7` for verbs.
- Avoid generic soft-skill junk in `jd_keywords`.
- Keep banned phrases concise and explicit.
- Track leak phrases and promote only after repeated evidence.
- Review output weekly by field and adjust profiles.

## Minimal custom-pack starter

Use this command:

```bash
cp cv-engine-worker/seeds/custom-pack.template.json cv-engine-worker/seeds/custom-pack.json
```

Then edit `custom-pack.json`, seed, and sync KV.

## SQL editor starter

If you prefer manual SQL in Cloudflare dashboard:

```sql
-- see full template:
-- cv-engine-worker/sql/custom-pack.upsert.sql
```

Run the statements, then immediately refresh KV so the worker reads latest values.
