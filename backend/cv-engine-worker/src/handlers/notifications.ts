/**
 * notifications.ts — server-side admin webhook notifications (Slack / Discord).
 *
 * WHY SERVER-SIDE: the original implementation only fired webhooks from the
 * admin frontend (LiveFeedTab/HealthTab polling), which meant a real signup
 * or sign-in only reached Discord if an admin happened to have that tab open
 * in their browser at that exact moment. The "Test" button worked because it
 * calls the same code path directly and immediately — but real production
 * events were silently dropped whenever no admin panel was open.
 *
 * This module stores the webhook config in CV_KV (shared across every admin,
 * not per-browser localStorage) and fires the notification directly from the
 * worker at the moment the real event happens (see handlers/auth.ts), so
 * delivery no longer depends on anyone watching the admin panel.
 */

import { Env } from '../types';
import { json, safeJson, verifyAdminAuth, unauthorized } from '../utils';

const CONFIG_KV_KEY = 'admin:webhook_config';
const SPIKE_KV_KEY = 'admin:signin_spike_window';
const SPIKE_NOTIFIED_KV_KEY = 'admin:signin_spike_last_notified';

export interface WebhookEvents {
    new_signup: boolean;
    new_signin: boolean;
    signin_spike: boolean;
    worker_error: boolean;
}

export interface WebhookConfig {
    url: string;
    events: WebhookEvents;
}

const DEFAULT_EVENTS: WebhookEvents = {
    new_signup: true,
    new_signin: false,
    signin_spike: true,
    worker_error: true,
};

export async function getWebhookConfig(env: Env): Promise<WebhookConfig> {
    try {
        const raw = await env.CV_KV.get<WebhookConfig>(CONFIG_KV_KEY, { type: 'json' });
        if (raw && typeof raw.url === 'string') {
            return { url: raw.url, events: { ...DEFAULT_EVENTS, ...(raw.events || {}) } };
        }
    } catch { /* fall through to default */ }
    return { url: '', events: DEFAULT_EVENTS };
}

async function setWebhookConfig(env: Env, cfg: WebhookConfig): Promise<void> {
    await env.CV_KV.put(CONFIG_KV_KEY, JSON.stringify(cfg));
}

function detectPlatform(url: string): 'slack' | 'discord' | 'unknown' {
    if (!url) return 'unknown';
    if (url.includes('hooks.slack.com')) return 'slack';
    if (url.includes('discord.com') || url.includes('discordapp.com')) return 'discord';
    return 'unknown';
}

function buildPayload(
    platform: 'slack' | 'discord' | 'unknown',
    eventType: string,
    title: string,
    body: string,
    color?: string,
): object {
    const emoji =
        eventType === 'new_signup' ? '🎉' :
        eventType === 'new_signin' ? '🔐' :
        eventType === 'signin_spike' ? '⚡' :
        eventType === 'worker_error' ? '🚨' :
        eventType === 'test' ? '🧪' : '📢';

    if (platform === 'discord') {
        return {
            embeds: [{
                title: `${emoji} ${title}`,
                description: body,
                color: color ? parseInt(color.replace('#', ''), 16) : 0x1B2B4B,
                footer: { text: 'ProCV Admin · ' + new Date().toUTCString() },
            }],
        };
    }

    if (platform === 'slack') {
        return {
            blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: `*${emoji} ${title}*\n${body}` } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `ProCV Admin · ${new Date().toUTCString()}` }] },
            ],
        };
    }

    return { text: `${emoji} **${title}**\n${body}` };
}

/**
 * Fire an admin notification directly from the worker (server → Discord/Slack,
 * no browser involved). Safe to call unconditionally — it no-ops if no webhook
 * is configured or the event type is disabled. Never throws; failures are
 * swallowed so a Discord outage can never break signup/sign-in.
 */
export async function sendAdminNotification(
    env: Env,
    eventType: keyof WebhookEvents | 'test',
    title: string,
    body: string,
    color?: string,
): Promise<void> {
    try {
        const cfg = await getWebhookConfig(env);
        if (!cfg.url) return;
        if (eventType !== 'test' && cfg.events[eventType] === false) return;

        const platform = detectPlatform(cfg.url);
        const payload = buildPayload(platform, eventType, title, body, color);

        await fetch(cfg.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
        });
    } catch {
        // Never let a webhook failure affect the calling flow (auth, etc.)
    }
}

/**
 * Tracks sign-ins in a short rolling window (KV, ~90s TTL) and fires a
 * "signin_spike" notification when 5+ sign-ins land within 60 seconds.
 * Re-notifies at most once every 2 minutes to avoid Discord spam.
 */
export async function checkSigninSpike(env: Env): Promise<void> {
    try {
        const cfg = await getWebhookConfig(env);
        if (!cfg.url || !cfg.events.signin_spike) return;

        const now = Date.now();
        const raw = await env.CV_KV.get<number[]>(SPIKE_KV_KEY, { type: 'json' });
        const times = (Array.isArray(raw) ? raw : []).filter(t => now - t < 60_000);
        times.push(now);
        await env.CV_KV.put(SPIKE_KV_KEY, JSON.stringify(times), { expirationTtl: 90 });

        if (times.length < 5) return;

        const lastNotified = Number((await env.CV_KV.get(SPIKE_NOTIFIED_KV_KEY)) || '0');
        if (now - lastNotified < 120_000) return;

        await env.CV_KV.put(SPIKE_NOTIFIED_KV_KEY, String(now), { expirationTtl: 300 });
        await sendAdminNotification(
            env,
            'signin_spike',
            'Sign-in Spike Detected',
            `${times.length} sign-ins in the last 60 seconds — possible viral traffic or bot activity.`,
            '#F59E0B',
        );
    } catch { /* never block sign-in on spike detection */ }
}

// ─── Admin endpoints — GET/POST /api/cv/admin/webhook-config ─────────────────

/** GET /api/cv/admin/webhook-config */
export async function handleWebhookConfigGet(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    const cfg = await getWebhookConfig(env);
    return json({ ok: true, config: cfg }, request, env);
}

/** POST /api/cv/admin/webhook-config  { url, events } */
export async function handleWebhookConfigSet(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    const body = await safeJson(request);
    const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 500) : '';
    const events: WebhookEvents = {
        new_signup: !!body?.events?.new_signup,
        new_signin: !!body?.events?.new_signin,
        signin_spike: !!body?.events?.signin_spike,
        worker_error: !!body?.events?.worker_error,
    };

    if (url && !/^https:\/\/(hooks\.slack\.com|discord(app)?\.com)\//.test(url)) {
        return json({ error: 'invalid_webhook_url', message: 'Only Slack and Discord webhook URLs are supported.' }, request, env, 400);
    }

    const cfg: WebhookConfig = { url, events };
    await setWebhookConfig(env, cfg);
    return json({ ok: true, config: cfg }, request, env);
}
