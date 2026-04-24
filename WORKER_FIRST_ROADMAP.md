# Worker-First CV Pipeline Roadmap

Goal: move as much deterministic logic as possible into Cloudflare worker (D1+KV), then let Groq perform final natural-language generation.

## Already implemented

- Worker brief endpoint (`/api/cv/brief`) returns:
  - seniority
  - field
  - voice
  - rhythm
  - verb pool
  - forbidden phrases
- Frontend generation calls `buildBrief(...)` and injects worker brief into LLM prompt.
- Leak-report loop feeds candidate phrases back to worker for promotion workflows.

## Gaps still worth closing

1. **Strict worker-first mode**
   - Optional env flag to require worker brief when configured.
   - If worker is down, show explicit "engine unavailable" warning instead of silent fallback.

2. **Source ingestion pipeline**
   - Automated collector for curated sources (job posts / high-quality CV corpora / GitHub profile signals).
   - Normalize + dedupe + quality score before D1 insertion.

3. **Staging tables**
   - Add `pending_*` review tables (verbs, banned phrases, keywords) before promotion to production tables.

4. **A/B evaluation loop**
   - Track brief version + output quality metrics.
   - Promote only profile packs that improve score/interview conversion.

5. **Per-field confidence thresholds**
   - If JD keyword score is weak, fall back to safer generalized profiles.

6. **Versioned packs**
   - Add pack IDs/version tags so rollbacks are instant.

## Immediate next step (recommended)

Implement strict mode + UI warning first. It gives operational clarity while keeping current fallback path for normal users.
