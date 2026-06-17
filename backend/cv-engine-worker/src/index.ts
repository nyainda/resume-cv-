/// <reference types="@cloudflare/workers-types" />
/**
 * cv-engine-worker — slim dispatcher.
 *
 * All handler logic lives under handlers/:
 *   data.ts        — KV/D1 data, health, words, banned, clean, sync
 *   validation.ts  — validate, validate-voice, semantic-match
 *   brief.ts       — brief builder
 *   leak.ts        — leak-report, leak-candidates, crons
 *   cache.ts       — llm-cache, cv-examples, profile-cache, market-research, jd-analysis
 *   purify.ts      — purify-cv, get-rules, CV system prompt constants
 *   llm.ts         — llm, vision-extract, tiered-llm, race-llm, parallel-sections, proxy-llm, account-tier
 *   admin.ts       — admin stats/CRUD, ai-audit, voice-test, tokens
 *   user.ts        — share, job-cache, events, custom-templates, user-slots, user-prefs
 */

import { Env } from './types';
import { corsHeaders, json, rateLimitRequest, rateLimitResponse } from './utils';

// ── Handler imports ───────────────────────────────────────────────────────────
import {
    handleHealth, handleWords, handleBanned,
    handleStructures, handleRhythm, handleSync,
} from './handlers/data';

import {
    handleClean, handleValidate, handleValidateVoice, handleSemanticMatch,
} from './handlers/validation';

import { handleBrief } from './handlers/brief';

import {
    handleLeakReport, handleLeakCandidatesList, handleLeakCandidatesDecide,
    runLeakPromotionCron, runDbCleanupCron,
} from './handlers/leak';

import {
    handleLLMCacheGet, handleLLMCachePost,
    handleCVExamplesGet, handleCVExamplesPost,
    handleProfileCacheGet, handleProfileCachePost,
    handleJdAnalysisCacheGet, handleJdAnalysisCachePost,
    handleMarketResearchCacheGet, handleMarketResearchCachePost,
} from './handlers/cache';

import { handlePurifyCv, handleGetRules } from './handlers/purify';

import {
    handleLLM, handleVisionExtract, handleTieredLLM,
    handleRaceLLM, handleParallelSections,
    handleProxyLLM, handleAccountTier,
} from './handlers/llm';

import {
    handleAdminStats, handleBulkAdd, handleAdminList,
    handleBulkUpdate, handleAdminDelete, handleVoiceTest, handleAiAudit,
    handleTokensList, handleTokensCreate, handleTokensRevoke,
    handleDashboardStats, handleUsersList, handleUsersUpdatePlan,
    handleUsersRevokeSessions, handleUsersDetail, handleAuthLogsList, handleDbBrowse,
} from './handlers/admin';

import {
    handleShareGet, handleSharePost,
    handleJobCacheGet, handleJobCachePost,
    handleEventPost,
    handleCustomTemplatesGet, handleCustomTemplatesPost,
    handleCustomTemplatesDelete, handleCustomTemplatesPatch,
    handleUserSlotsPost, handleUserSlotsDelete, handleUserPrefsPost, handleUserDataGet,
} from './handlers/user';

import {
    handleAuthGoogle, handleAuthMagicSend, handleAuthMagicVerify,
    handleAuthSession, handleAuthSignout, handleAuthDeleteAccount,
} from './handlers/auth';

import {
    handlePublicProfileGet, handlePublicProfilePost, handlePublicProfileDelete,
} from './handlers/publicProfile';

import {
    handlePromptRegistryList, handlePromptRegistryGet,
    handlePromptRegistryPost, handlePromptRegistryRollback,
    handlePromptRegistryHistory,
} from './handlers/promptRegistry';

import {
    handleRuleRegistryList, handleRuleRegistryEvaluate,
    handleRuleRegistryGetKey, handleRuleRegistryPost,
    handleRuleRegistryRollback,
} from './handlers/ruleRegistry';

// ─────────────────────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        // Nuclear CORS guarantee: _dispatch is awaited so any thrown error is
        // caught here rather than escaping as an unhandled rejection (which
        // would produce a raw 500 with no CORS headers from the edge). After we
        // have a response we also force-inject CORS headers so even a raw
        // `new Response(...)` inside a handler can't bypass CORS.
        const response = await _dispatch(request, env, ctx, url).catch((err: any) =>
            json({ error: 'internal_error', message: String(err?.message || err) }, request, env, 500)
        );
        const cors = corsHeaders(request, env);
        const h = new Headers(response.headers);
        for (const [k, v] of Object.entries(cors as Record<string, string>)) h.set(k, v);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
    },

    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runLeakPromotionCron(env));
        ctx.waitUntil(runDbCleanupCron(env));
    },
} satisfies ExportedHandler<Env>;

// ── Route dispatcher ──────────────────────────────────────────────────────────

async function _dispatch(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
    const m = request.method;
    const p = url.pathname;

    // ── Rate limiting ─────────────────────────────────────────────────────────
    //
    // Must run BEFORE route handlers so every matched path is protected.
    // Three tiers, keyed by device ID (preferred) or CF IP:
    //
    //   llm    — heavy AI generation (tiered-llm, race-llm, parallel-sections)
    //            20 req / 60 s  — costs real money per call
    //
    //   medium — lighter AI passes (purify-cv, validate, validate-voice,
    //            semantic-match, brief, clean)
    //            40 req / 60 s  — each still spins up an LLM
    //
    //   cache  — cheap KV/D1 reads & writes (llm-cache, profile, examples,
    //            jd-analysis, market-research, share, job-cache)
    //            120 req / 60 s — pure storage; token-free
    //
    // Fails open on KV error — a KV outage must never block generation.
    // /health, /api/cv/banned, admin routes, and cron handlers are excluded.
    if (m === 'POST' && (
        p === '/api/cv/tiered-llm'        ||
        p === '/api/cv/race-llm'          ||
        p === '/api/cv/parallel-sections'
    )) {
        const rl = await rateLimitRequest(env, request, 'llm', 20, 60);
        if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);
    }

    if (m === 'POST' && (
        p === '/api/cv/purify-cv'      ||
        p === '/api/cv/validate'       ||
        p === '/api/cv/validate-voice' ||
        p === '/api/cv/semantic-match' ||
        p === '/api/cv/brief'          ||
        p === '/api/cv/clean'
    )) {
        const rl = await rateLimitRequest(env, request, 'medium', 40, 60);
        if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);
    }

    if (
        (p === '/api/cv/llm-cache'       && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/profile'         && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/examples'        && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/jd-analysis'     && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/market-research' && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/share'           && (m === 'GET' || m === 'POST')) ||
        (p === '/api/cv/job-cache'       && (m === 'GET' || m === 'POST'))
    ) {
        const rl = await rateLimitRequest(env, request, 'cache', 120, 60);
        if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);
    }

    // ── Data / KV reads ───────────────────────────────────────────────────────
    if (p === '/health')                                                    return handleHealth(request, env);
    if (p === '/api/cv/words')                                              return handleWords(request, env, url);
    if (p === '/api/cv/banned')                                             return handleBanned(request, env);
    if (p === '/api/cv/structures')                                         return handleStructures(request, env, url);
    if (p === '/api/cv/rhythm')                                             return handleRhythm(request, env, url);
    if (p === '/api/cv/clean'          && m === 'POST')                     return handleClean(request, env);
    if (p === '/api/cv/sync'           && m === 'POST')                     return handleSync(request, env);

    // ── Validation ────────────────────────────────────────────────────────────
    if (p === '/api/cv/validate'       && m === 'POST')                     return handleValidate(request, env);
    if (p === '/api/cv/validate-voice' && m === 'POST')                     return handleValidateVoice(request, env);
    if (p === '/api/cv/semantic-match' && m === 'POST')                     return handleSemanticMatch(request, env);

    // ── Brief builder ─────────────────────────────────────────────────────────
    if (p === '/api/cv/brief'          && m === 'POST')                     return handleBrief(request, env, ctx);

    // ── Purify + rules ────────────────────────────────────────────────────────
    if (p === '/api/cv/purify-cv'      && m === 'POST')                     return handlePurifyCv(request, env);
    if (p === '/api/cv/rules'          && m === 'GET')                      return handleGetRules(request, env);

    if (p === '/api/cv/llm'            && m === 'POST')                     return handleLLM(request, env);
    if (p === '/api/cv/vision-extract' && m === 'POST')                     return handleVisionExtract(request, env);
    if (p === '/api/cv/tiered-llm'     && m === 'POST')                     return handleTieredLLM(request, env);
    if (p === '/api/cv/account-tier'   && m === 'GET')                      return handleAccountTier(request, env);
    if (p === '/api/cv/race-llm'       && m === 'POST')                     return handleRaceLLM(request, env);
    if (p === '/api/cv/parallel-sections' && m === 'POST')                  return handleParallelSections(request, env);
    if (p === '/api/cv/proxy-llm'      && m === 'POST')                     return handleProxyLLM(request, env);

    // ── Caches ────────────────────────────────────────────────────────────────
    if (p === '/api/cv/llm-cache'      && m === 'GET')                      return handleLLMCacheGet(request, env, url);
    if (p === '/api/cv/llm-cache'      && m === 'POST')                     return handleLLMCachePost(request, env, ctx);
    if (p === '/api/cv/examples'       && m === 'GET')                      return handleCVExamplesGet(request, env, url);
    if (p === '/api/cv/examples'       && m === 'POST')                     return handleCVExamplesPost(request, env);
    if (p === '/api/cv/profile'        && m === 'GET')                      return handleProfileCacheGet(request, env, url);
    if (p === '/api/cv/profile'        && m === 'POST')                     return handleProfileCachePost(request, env, ctx);
    if (p === '/api/cv/jd-analysis'    && m === 'GET')                      return handleJdAnalysisCacheGet(request, env, url);
    if (p === '/api/cv/jd-analysis'    && m === 'POST')                     return handleJdAnalysisCachePost(request, env, ctx);
    if (p === '/api/cv/market-research'&& m === 'GET')                      return handleMarketResearchCacheGet(request, env, url);
    if (p === '/api/cv/market-research'&& m === 'POST')                     return handleMarketResearchCachePost(request, env, ctx);

    // ── Leak pipeline ─────────────────────────────────────────────────────────
    if (p === '/api/cv/leak-report'    && m === 'POST')                     return handleLeakReport(request, env);
    if (p === '/api/cv/admin/leak-candidates')                              return handleLeakCandidatesList(request, env, url);
    if (p === '/api/cv/admin/leak-candidates/decide' && m === 'POST')       return handleLeakCandidatesDecide(request, env);

    // ── Admin ─────────────────────────────────────────────────────────────────
    if (p === '/api/cv/admin/stats')                                        return handleAdminStats(request, env);
    if (p === '/api/cv/admin/bulk-add'    && m === 'POST')                  return handleBulkAdd(request, env);
    if (p === '/api/cv/admin/list')                                         return handleAdminList(request, env, url);
    if (p === '/api/cv/admin/bulk-update' && m === 'POST')                  return handleBulkUpdate(request, env);
    if (p === '/api/cv/admin/delete'      && m === 'POST')                  return handleAdminDelete(request, env);
    if (p === '/api/cv/admin/voice-test'  && m === 'POST')                  return handleVoiceTest(request, env);
    if (p === '/api/cv/admin/ai-audit'    && m === 'POST')                  return handleAiAudit(request, env);
    if (p === '/api/cv/admin/tokens'      && m === 'GET')                   return handleTokensList(request, env);
    if (p === '/api/cv/admin/tokens'      && m === 'POST')                  return handleTokensCreate(request, env);
    if (p === '/api/cv/admin/tokens/revoke' && m === 'POST')                return handleTokensRevoke(request, env);
    if (p === '/api/cv/admin/dashboard-stats')                              return handleDashboardStats(request, env);
    if (p === '/api/cv/admin/users'       && m === 'GET')                   return handleUsersList(request, env, url);
    if (p === '/api/cv/admin/users/plan'  && m === 'PATCH')                 return handleUsersUpdatePlan(request, env);
    if (p === '/api/cv/admin/users/sessions' && m === 'DELETE')             return handleUsersRevokeSessions(request, env);
    if (/^\/api\/cv\/admin\/users\/\d+\/detail$/.test(p) && m === 'GET')    return handleUsersDetail(request, env, url);
    if (p === '/api/cv/admin/auth-logs'   && m === 'GET')                   return handleAuthLogsList(request, env, url);
    if (p === '/api/cv/admin/db-browse'   && m === 'GET')                   return handleDbBrowse(request, env, url);

    // ── Share links ───────────────────────────────────────────────────────────
    if (p === '/api/cv/share'          && m === 'GET')                      return handleShareGet(request, env, url);
    if (p === '/api/cv/share'          && m === 'POST')                     return handleSharePost(request, env, ctx);

    // ── Job search cache ──────────────────────────────────────────────────────
    if (p === '/api/cv/job-cache'      && m === 'GET')                      return handleJobCacheGet(request, env, url);
    if (p === '/api/cv/job-cache'      && m === 'POST')                     return handleJobCachePost(request, env, ctx);

    // ── Anonymous events ──────────────────────────────────────────────────────
    if (p === '/api/cv/event'          && m === 'POST')                     return handleEventPost(request, env, ctx);

    // ── Custom templates ──────────────────────────────────────────────────────
    if (p === '/api/cv/custom-templates'    && m === 'GET')                 return handleCustomTemplatesGet(request, env, url);
    if (p === '/api/cv/custom-templates'    && m === 'POST')                return handleCustomTemplatesPost(request, env, ctx);
    if (/^\/api\/cv\/custom-templates\/[^/]+$/.test(p) && m === 'DELETE')   return handleCustomTemplatesDelete(request, env, url);
    if (/^\/api\/cv\/custom-templates\/[^/]+$/.test(p) && m === 'PATCH')    return handleCustomTemplatesPatch(request, env, url);

    // ── User data sync ────────────────────────────────────────────────────────
    if (p === '/api/cv/user-slots'     && m === 'POST')                     return handleUserSlotsPost(request, env, ctx);
    if (p === '/api/cv/user-slots'     && m === 'DELETE')                   return handleUserSlotsDelete(request, env);
    if (p === '/api/cv/user-prefs'     && m === 'POST')                     return handleUserPrefsPost(request, env);
    if (p === '/api/cv/user-data'      && m === 'GET')                      return handleUserDataGet(request, env, url);

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (p === '/api/auth/google'              && m === 'POST')   return handleAuthGoogle(request, env);
    if (p === '/api/auth/magic-link/send'     && m === 'POST')   return handleAuthMagicSend(request, env);
    if (p === '/api/auth/magic-link/verify'   && m === 'GET')    return handleAuthMagicVerify(request, env, url);
    if (p === '/api/auth/session'             && m === 'GET')    return handleAuthSession(request, env);
    if (p === '/api/auth/signout'             && m === 'POST')   return handleAuthSignout(request, env);
    if (p === '/api/auth/account'             && m === 'DELETE') return handleAuthDeleteAccount(request, env);

    // ── Public profile pages ──────────────────────────────────────────────────
    if (p === '/api/cv/public-profile' && m === 'GET')    return handlePublicProfileGet(request, env, url);
    if (p === '/api/cv/public-profile' && m === 'POST')   return handlePublicProfilePost(request, env);
    if (p === '/api/cv/public-profile' && m === 'DELETE') return handlePublicProfileDelete(request, env);

    // ── S1 Rule Registry ──────────────────────────────────────────────────────
    if (p === '/api/cv/rule-registry'             && m === 'GET')  return handleRuleRegistryList(request, env);
    if (p === '/api/cv/rule-registry/evaluate'    && m === 'GET')  return handleRuleRegistryEvaluate(request, env, url);
    if (p === '/api/cv/rule-registry/rollback'    && m === 'POST') return handleRuleRegistryRollback(request, env);
    if (p === '/api/cv/rule-registry'             && m === 'POST') return handleRuleRegistryPost(request, env);
    const ruleKeyMatch = /^\/api\/cv\/rule-registry\/([^/]+)$/.exec(p);
    if (ruleKeyMatch && m === 'GET') return handleRuleRegistryGetKey(request, env, decodeURIComponent(ruleKeyMatch[1]));

    // ── S4 Prompt Registry ────────────────────────────────────────────────────
    if (p === '/api/cv/prompt-registry'           && m === 'GET')  return handlePromptRegistryList(request, env, url);
    if (p === '/api/cv/prompt-registry/rollback'  && m === 'POST') return handlePromptRegistryRollback(request, env);
    if (p === '/api/cv/prompt-registry'           && m === 'POST') return handlePromptRegistryPost(request, env);
    // /api/cv/prompt-registry/history/:section  (admin — full history)
    const histMatch = /^\/api\/cv\/prompt-registry\/history\/([^/]+)$/.exec(p);
    if (histMatch && m === 'GET') return handlePromptRegistryHistory(request, env, decodeURIComponent(histMatch[1]));
    // /api/cv/prompt-registry/:section  (public — active prompt)
    const sectionMatch = /^\/api\/cv\/prompt-registry\/([^/]+)$/.exec(p);
    if (sectionMatch && m === 'GET') return handlePromptRegistryGet(request, env, decodeURIComponent(sectionMatch[1]));

    return json({ error: 'not_found', path: p }, request, env, 404);
}
