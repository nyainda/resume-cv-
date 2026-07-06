---
name: LLM model resilience pattern (BYOK Claude/Gemini)
description: How the worker proxy handles provider model deprecation/renames and mid-generation truncation for Claude/Gemini BYOK calls.
---

Provider "model not found" errors (deprecated/renamed models) and mid-generation truncation are handled server-side in the worker proxy, not left to the frontend to guess about.

**Fallback chain on model-not-found:** the worker tries the user's requested/selected model first, then walks a hardcoded fallback chain of newer→older models for that provider. It only advances the chain when the error looks like "model not found" (`isModelNotFoundError`) — auth, quota, and content-policy errors fail fast immediately instead of wasting a chain-walk.

**Why:** BYOK users pick a model in Settings and providers periodically retire/rename models without notice; a hard failure on every stale model reference would be a bad, opaque UX. Fast-failing on non-model errors avoids masking real problems (bad key, no quota) behind a slow, pointless retry loop.

**Truncation retry:** the worker reads Claude's `stop_reason` / Gemini's `finishReason` on every successful response. If it indicates the output was cut off by the token ceiling, the worker automatically retries the *same* model once with `maxTokens*2` (capped at a hard ceiling) before returning — so a truncated CV never reaches the client silently incomplete.

**How to apply:** any new provider integration (or new BYOK provider) added to the worker proxy should follow the same shape: (1) candidate list = requested model + fallback chain, (2) classify errors before deciding whether to advance the chain, (3) check the provider's own truncation signal and bump-retry once before falling back to any client-side "looks incomplete" heuristics — those heuristics are a secondary safety net, not the primary fix.

Frontend model selection lives in `groqService.ts` (per-provider catalogs + localStorage getters/setters) and must be plumbed into every call site (chat, streaming, connection test) — a hardcoded model string anywhere else in the codebase (e.g. a direct-fetch fallback path) silently ignores the user's Settings choice.
