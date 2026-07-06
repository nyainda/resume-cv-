---
name: CV purification pipeline migration gap
description: Frontend purification/voice-fidelity data tables were emptied during a "moved to Worker" migration but the worker call was never wired in — silent no-ops. How this was found and the tradeoff made when fixing it.
---

## The bug pattern

Several `frontend/services/*.ts` files (`cvPurificationPipeline.ts`, `cvStyleGovernance.ts`, `cvVoiceFidelity.ts`) had core data tables (`SUBSTITUTIONS`, `GOVERNANCE_SUBSTITUTIONS`, `VERB_TENSE_MAP`, `TPS_TO_BASE`) reduced to empty arrays/objects with a comment "moved to Worker /api/cv/purify-cv". The Worker (`backend/cv-engine-worker/src/handlers/purify.ts`) does have the real, complete versions of these tables — but the frontend functions that reference the emptied local constants are still called synchronously and directly (not routed through the Worker). Result: the functions ran, returned no changes, and callers had no way to know the pass was a no-op.

**Why this matters:** "moved to X" comments are not proof that a call site was actually rewired to call X. Always grep for actual call sites before trusting a comment claiming logic moved elsewhere.

## How to apply

- Treat any local data table that looks suspiciously empty (`= []` / `= {}`) with a comment claiming external ownership as a red flag — check whether the consuming function is actually calling out anywhere, or just silently iterating zero entries.
- The pragmatic fix used here: copy the exact table verbatim from the Worker's live source (`backend/cv-engine-worker/src/handlers/purify.ts`) back into the frontend files, since these are pure synchronous regex passes and adding a network round-trip would add latency/failure modes for no benefit. This creates a manual-sync duplication risk between frontend and worker copies — documented via comments at each table pointing at the Worker source of truth. No shared package was introduced because the frontend (Vite) and Worker (separate Cloudflare deploy) aren't wired into a shared build.
- When restoring a stale allow-list table (e.g. TPS 3rd-person-verb → imperative maps), watch for verb/noun ambiguity on words that are also common plural job titles (e.g. "Engineers", "Leads", "Reports") — a bullet that starts with "Engineers across 3 squads…" is a noun phrase, not a verb. Guard with a next-word preposition check before firing the conversion.
