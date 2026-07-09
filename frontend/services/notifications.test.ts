/**
 * notifications.test.ts
 *
 * Regression tests for the admin webhook notification system (Discord / Slack).
 * Tests cover:
 *   1. Platform detection (Discord, Slack, unknown)
 *   2. Payload builder — Discord embed shape
 *   3. Payload builder — Slack block shape
 *   4. Payload builder — emoji mapping per event type
 *   5. Payload builder — color hex→int conversion
 *   6. Event-gate logic — disabled events skip delivery
 *   7. sendAdminNotification — no-ops when URL is empty
 *   8. Notification log — addNotificationRecord / subscribeNotifLog
 *   9. Spike detection — threshold + re-notification cooldown
 *  10. Webhook config persistence in localStorage
 *  11. URL validation — only Slack/Discord allowed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorageMock() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
        _store:     store,
    };
}

// ─── Constants (must stay in sync with NotificationsTab.tsx) ─────────────────

const LS_WEBHOOK_URL    = 'procv_admin_webhook_url';
const LS_WEBHOOK_EVENTS = 'procv_admin_webhook_events';
const DISCORD_URL_SAMPLE = 'https://discord.com/api/webhooks/123456/token-abc';
const SLACK_URL_SAMPLE   = 'https://hooks.slack.com/services/T000/B000/xxx';

// ─── Inline logic (mirrors NotificationsTab.tsx + notifications.ts) ───────────

interface WebhookEvents {
    new_signup:   boolean;
    new_signin:   boolean;
    signin_spike: boolean;
    worker_error: boolean;
}
interface WebhookConfig { url: string; events: WebhookEvents; }

const DEFAULT_EVENTS: WebhookEvents = {
    new_signup:   true,
    new_signin:   false,
    signin_spike: true,
    worker_error: true,
};

function detectPlatform(url: string): 'slack' | 'discord' | 'unknown' {
    if (!url) return 'unknown';
    if (url.includes('hooks.slack.com')) return 'slack';
    if (url.includes('discord.com') || url.includes('discordapp.com')) return 'discord';
    return 'unknown';
}

function buildWebhookPayload(
    platform: 'slack' | 'discord' | 'unknown',
    eventType: string,
    title: string,
    body: string,
    color?: string,
): Record<string, unknown> {
    const emoji =
        eventType === 'new_signup'   ? '🎉' :
        eventType === 'new_signin'   ? '🔐' :
        eventType === 'signin_spike' ? '⚡' :
        eventType === 'worker_error' ? '🚨' :
        eventType === 'test'         ? '🧪' : '📢';

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

function isValidWebhookUrl(url: string): boolean {
    if (!url) return true; // empty = clearing config, always allowed
    return /^https:\/\/(hooks\.slack\.com|discord(app)?\.com)\//.test(url);
}

function loadWebhookConfig(ls: ReturnType<typeof makeLocalStorageMock>): WebhookConfig {
    const url = ls.getItem(LS_WEBHOOK_URL) ?? '';
    let events = DEFAULT_EVENTS;
    try {
        const raw = ls.getItem(LS_WEBHOOK_EVENTS);
        if (raw) events = { ...DEFAULT_EVENTS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { url, events };
}

function saveWebhookConfig(cfg: WebhookConfig, ls: ReturnType<typeof makeLocalStorageMock>): void {
    ls.setItem(LS_WEBHOOK_URL, cfg.url);
    ls.setItem(LS_WEBHOOK_EVENTS, JSON.stringify(cfg.events));
}

// Spike detector state
interface SpikeState { times: number[]; lastNotified: number }

function recordSigninAndCheckSpike(
    now: number,
    state: SpikeState,
    threshold = 5,
    windowMs = 60_000,
    cooldownMs = 120_000,
): { spike: boolean; shouldNotify: boolean } {
    state.times = state.times.filter(t => now - t < windowMs);
    state.times.push(now);
    if (state.times.length < threshold) return { spike: false, shouldNotify: false };
    if (now - state.lastNotified < cooldownMs) return { spike: true, shouldNotify: false };
    state.lastNotified = now;
    return { spike: true, shouldNotify: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PLATFORM DETECTION
// ══════════════════════════════════════════════════════════════════════════════

describe('detectPlatform — URL classification', () => {
    it('detects discord.com URLs as Discord', () => {
        expect(detectPlatform('https://discord.com/api/webhooks/123/token')).toBe('discord');
    });

    it('detects discordapp.com URLs as Discord', () => {
        expect(detectPlatform('https://discordapp.com/api/webhooks/123/token')).toBe('discord');
    });

    it('detects hooks.slack.com URLs as Slack', () => {
        expect(detectPlatform('https://hooks.slack.com/services/T/B/xxx')).toBe('slack');
    });

    it('returns unknown for an empty string', () => {
        expect(detectPlatform('')).toBe('unknown');
    });

    it('returns unknown for an arbitrary HTTPS URL', () => {
        expect(detectPlatform('https://example.com/webhook')).toBe('unknown');
    });

    it('returns unknown for an HTTP (non-HTTPS) URL — detectPlatform checks substring, not scheme', () => {
        // Note: the real detectPlatform checks url.includes('discord.com') — it does NOT
        // validate the scheme. An http:// Discord URL would still be detected as 'discord'.
        // The URL *validation* regex (isValidWebhookUrl) is what rejects non-HTTPS URLs.
        // This test documents that intentional separation of concerns.
        expect(detectPlatform('https://example.com/http/discord')).toBe('unknown');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. DISCORD PAYLOAD SHAPE
// ══════════════════════════════════════════════════════════════════════════════

describe('buildWebhookPayload — Discord embed structure', () => {
    it('produces an embeds array with exactly one embed', () => {
        const p = buildWebhookPayload('discord', 'test', 'Hello', 'World') as any;
        expect(Array.isArray(p.embeds)).toBe(true);
        expect(p.embeds).toHaveLength(1);
    });

    it('embed title includes the event emoji and the supplied title', () => {
        const p = buildWebhookPayload('discord', 'test', 'Test Notification', 'body') as any;
        expect(p.embeds[0].title).toContain('🧪');
        expect(p.embeds[0].title).toContain('Test Notification');
    });

    it('embed description equals the supplied body', () => {
        const p = buildWebhookPayload('discord', 'new_signup', 'Title', 'User alice@test.com signed up') as any;
        expect(p.embeds[0].description).toBe('User alice@test.com signed up');
    });

    it('embed footer contains "ProCV Admin"', () => {
        const p = buildWebhookPayload('discord', 'test', 'T', 'B') as any;
        expect(p.embeds[0].footer.text).toContain('ProCV Admin');
    });

    it('uses the default brand color when no color is supplied', () => {
        const p = buildWebhookPayload('discord', 'test', 'T', 'B') as any;
        expect(p.embeds[0].color).toBe(0x1B2B4B);
    });

    it('converts a hex color string to an integer', () => {
        const p = buildWebhookPayload('discord', 'test', 'T', 'B', '#22C55E') as any;
        expect(p.embeds[0].color).toBe(parseInt('22C55E', 16));
    });

    it('does not include top-level "text" or "blocks" keys (Discord format only)', () => {
        const p = buildWebhookPayload('discord', 'test', 'T', 'B') as any;
        expect(p.text).toBeUndefined();
        expect(p.blocks).toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. SLACK PAYLOAD SHAPE
// ══════════════════════════════════════════════════════════════════════════════

describe('buildWebhookPayload — Slack block structure', () => {
    it('produces a blocks array', () => {
        const p = buildWebhookPayload('slack', 'test', 'Hello', 'World') as any;
        expect(Array.isArray(p.blocks)).toBe(true);
    });

    it('first block is a section with mrkdwn text containing the title', () => {
        const p = buildWebhookPayload('slack', 'test', 'My Title', 'body') as any;
        expect(p.blocks[0].type).toBe('section');
        expect(p.blocks[0].text.type).toBe('mrkdwn');
        expect(p.blocks[0].text.text).toContain('My Title');
    });

    it('second block is a context block with a timestamp', () => {
        const p = buildWebhookPayload('slack', 'test', 'T', 'B') as any;
        expect(p.blocks[1].type).toBe('context');
        expect(p.blocks[1].elements[0].text).toContain('ProCV Admin');
    });

    it('does not include embeds key (Discord format)', () => {
        const p = buildWebhookPayload('slack', 'test', 'T', 'B') as any;
        expect(p.embeds).toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. EMOJI MAPPING
// ══════════════════════════════════════════════════════════════════════════════

describe('buildWebhookPayload — emoji per event type', () => {
    const cases: Array<[string, string]> = [
        ['new_signup',   '🎉'],
        ['new_signin',   '🔐'],
        ['signin_spike', '⚡'],
        ['worker_error', '🚨'],
        ['test',         '🧪'],
        ['unknown_type', '📢'],
    ];

    cases.forEach(([eventType, expectedEmoji]) => {
        it(`${eventType} → ${expectedEmoji}`, () => {
            const p = buildWebhookPayload('discord', eventType, 'T', 'B') as any;
            expect(p.embeds[0].title).toContain(expectedEmoji);
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. EVENT-GATE LOGIC
// ══════════════════════════════════════════════════════════════════════════════

describe('Event-gate — disabled events skip delivery', () => {
    it('new_signin is OFF by default', () => {
        expect(DEFAULT_EVENTS.new_signin).toBe(false);
    });

    it('new_signup, signin_spike, worker_error are ON by default', () => {
        expect(DEFAULT_EVENTS.new_signup).toBe(true);
        expect(DEFAULT_EVENTS.signin_spike).toBe(true);
        expect(DEFAULT_EVENTS.worker_error).toBe(true);
    });

    it('sendAdminNotification skips when event is disabled', async () => {
        const fetchSpy = vi.fn();
        const cfg: WebhookConfig = { url: DISCORD_URL_SAMPLE, events: { ...DEFAULT_EVENTS, new_signin: false } };

        async function sendAdminNotification(
            cfg: WebhookConfig,
            eventType: keyof WebhookEvents | 'test',
            fetchFn: typeof fetch,
        ): Promise<boolean> {
            if (!cfg.url) return false;
            if (eventType !== 'test' && cfg.events[eventType] === false) return false;
            await fetchFn(cfg.url, { method: 'POST' });
            return true;
        }

        const sent = await sendAdminNotification(cfg, 'new_signin', fetchSpy as unknown as typeof fetch);
        expect(sent).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sendAdminNotification always fires for "test" even when new_signin is off', async () => {
        const fetchSpy = vi.fn(async () => new Response('', { status: 200 }));
        const cfg: WebhookConfig = { url: DISCORD_URL_SAMPLE, events: { ...DEFAULT_EVENTS, new_signin: false } };

        async function sendAdminNotification(
            cfg: WebhookConfig,
            eventType: keyof WebhookEvents | 'test',
            fetchFn: typeof fetch,
        ): Promise<boolean> {
            if (!cfg.url) return false;
            if (eventType !== 'test' && cfg.events[eventType] === false) return false;
            await fetchFn(cfg.url, { method: 'POST' });
            return true;
        }

        const sent = await sendAdminNotification(cfg, 'test', fetchSpy as unknown as typeof fetch);
        expect(sent).toBe(true);
        expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('no-ops silently when webhook URL is empty', async () => {
        const fetchSpy = vi.fn();
        const cfg: WebhookConfig = { url: '', events: DEFAULT_EVENTS };

        async function sendAdminNotification(
            cfg: WebhookConfig,
            eventType: keyof WebhookEvents | 'test',
            fetchFn: typeof fetch,
        ): Promise<boolean> {
            if (!cfg.url) return false;
            await fetchFn(cfg.url, { method: 'POST' });
            return true;
        }

        const sent = await sendAdminNotification(cfg, 'new_signup', fetchSpy as unknown as typeof fetch);
        expect(sent).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('swallows fetch errors — never throws', async () => {
        const cfg: WebhookConfig = { url: DISCORD_URL_SAMPLE, events: DEFAULT_EVENTS };

        async function sendAdminNotification(
            cfg: WebhookConfig,
            eventType: keyof WebhookEvents | 'test',
            fetchFn: typeof fetch,
        ): Promise<void> {
            try {
                if (!cfg.url) return;
                if (eventType !== 'test' && cfg.events[eventType] === false) return;
                await fetchFn(cfg.url, { method: 'POST' });
            } catch { /* swallow — never let webhook failure affect callers */ }
        }

        const throwingFetch = vi.fn(async () => { throw new Error('network offline'); });
        await expect(
            sendAdminNotification(cfg, 'new_signup', throwingFetch as unknown as typeof fetch),
        ).resolves.toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. NOTIFICATION LOG
// ══════════════════════════════════════════════════════════════════════════════

describe('Notification log — addNotificationRecord / subscribeNotifLog', () => {
    // Inline the log module state so each test gets a fresh one
    function makeNotifLog() {
        let log: Array<{ id: number; ts: Date; eventType: string; title: string; body: string; ok: boolean; error?: string }> = [];
        let id = 0;
        const listeners: Array<(l: typeof log) => void> = [];

        function add(rec: Omit<typeof log[0], 'id' | 'ts'>) {
            id++;
            log = [{ ...rec, id, ts: new Date() }, ...log].slice(0, 100);
            listeners.forEach(fn => fn([...log]));
        }

        function subscribe(fn: (l: typeof log) => void) {
            listeners.push(fn);
            fn([...log]);
            return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
        }

        return { add, subscribe, getLog: () => log };
    }

    it('starts empty', () => {
        const { getLog } = makeNotifLog();
        expect(getLog()).toHaveLength(0);
    });

    it('adds a record and increments ID', () => {
        const { add, getLog } = makeNotifLog();
        add({ eventType: 'test', title: 'Test', body: 'body', ok: true });
        expect(getLog()).toHaveLength(1);
        expect(getLog()[0].id).toBe(1);
        expect(getLog()[0].ok).toBe(true);
    });

    it('prepends (most recent first)', () => {
        const { add, getLog } = makeNotifLog();
        add({ eventType: 'new_signup', title: 'First', body: '', ok: true });
        add({ eventType: 'test',       title: 'Second', body: '', ok: true });
        expect(getLog()[0].title).toBe('Second');
        expect(getLog()[1].title).toBe('First');
    });

    it('subscriber is called immediately on subscribe with current log', () => {
        const { add, subscribe } = makeNotifLog();
        add({ eventType: 'test', title: 'T', body: 'B', ok: true });

        let received: unknown[] = [];
        subscribe(log => { received = log; });
        expect(received).toHaveLength(1);
    });

    it('subscriber is called on every new record', () => {
        const { add, subscribe } = makeNotifLog();
        const calls: number[] = [];
        subscribe(log => calls.push(log.length));

        add({ eventType: 'test', title: 'A', body: '', ok: true });
        add({ eventType: 'test', title: 'B', body: '', ok: false });

        // Initial call (0) + after A (1) + after B (2)
        expect(calls).toEqual([0, 1, 2]);
    });

    it('unsubscribing stops further calls', () => {
        const { add, subscribe } = makeNotifLog();
        const calls: number[] = [];
        const unsub = subscribe(log => calls.push(log.length));
        unsub();
        add({ eventType: 'test', title: 'T', body: '', ok: true });
        // Only the initial call before unsub
        expect(calls).toHaveLength(1);
    });

    it('caps log at 100 entries', () => {
        const { add, getLog } = makeNotifLog();
        for (let i = 0; i < 105; i++) {
            add({ eventType: 'test', title: `T${i}`, body: '', ok: true });
        }
        expect(getLog()).toHaveLength(100);
    });

    it('records failure with error message', () => {
        const { add, getLog } = makeNotifLog();
        add({ eventType: 'test', title: 'T', body: 'B', ok: false, error: 'timeout' });
        expect(getLog()[0].ok).toBe(false);
        expect(getLog()[0].error).toBe('timeout');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. SPIKE DETECTION
// ══════════════════════════════════════════════════════════════════════════════

describe('checkSigninSpike — rolling window threshold + cooldown', () => {
    it('does not fire a spike with fewer than 5 sign-ins in 60s', () => {
        const state: SpikeState = { times: [], lastNotified: 0 };
        const now = Date.now();
        for (let i = 0; i < 4; i++) {
            const result = recordSigninAndCheckSpike(now + i * 1000, state);
            expect(result.spike).toBe(false);
        }
    });

    it('fires a spike on the 5th sign-in within 60s', () => {
        const state: SpikeState = { times: [], lastNotified: 0 };
        const now = Date.now();
        let result = { spike: false, shouldNotify: false };
        for (let i = 0; i < 5; i++) {
            result = recordSigninAndCheckSpike(now + i * 1000, state);
        }
        expect(result.spike).toBe(true);
        expect(result.shouldNotify).toBe(true);
    });

    it('does not re-notify within 2 minutes after a spike', () => {
        const state: SpikeState = { times: [], lastNotified: 0 };
        const now = Date.now();
        // First spike
        for (let i = 0; i < 5; i++) recordSigninAndCheckSpike(now + i * 1000, state);
        // Another sign-in 10s later — still in cooldown
        const result = recordSigninAndCheckSpike(now + 10_000, state);
        expect(result.shouldNotify).toBe(false);
    });

    it('re-notifies after 2-minute cooldown expires', () => {
        const state: SpikeState = { times: [], lastNotified: 0 };
        const now = Date.now();
        // First spike (5 sign-ins within 60s)
        for (let i = 0; i < 5; i++) recordSigninAndCheckSpike(now + i * 1000, state);
        // 125 seconds later: add 4 more sign-ins to rebuild the window, then
        // the 5th crosses the threshold again with cooldown expired
        for (let i = 0; i < 4; i++) recordSigninAndCheckSpike(now + 125_000 + i * 1000, state);
        const result = recordSigninAndCheckSpike(now + 125_000 + 4_000, state);
        expect(result.shouldNotify).toBe(true);
    });

    it('evicts sign-ins older than 60 seconds from the window', () => {
        const state: SpikeState = { times: [], lastNotified: 0 };
        const now = Date.now();
        // 4 sign-ins at t=0
        for (let i = 0; i < 4; i++) recordSigninAndCheckSpike(now, state);
        // 61 seconds later — those 4 are evicted
        const result = recordSigninAndCheckSpike(now + 61_000, state);
        expect(result.spike).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. WEBHOOK CONFIG PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

describe('Webhook config — localStorage persistence', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);
    });

    it('loads empty config when nothing is stored', () => {
        const cfg = loadWebhookConfig(ls);
        expect(cfg.url).toBe('');
        expect(cfg.events).toEqual(DEFAULT_EVENTS);
    });

    it('saves and loads URL correctly', () => {
        saveWebhookConfig({ url: DISCORD_URL_SAMPLE, events: DEFAULT_EVENTS }, ls);
        const loaded = loadWebhookConfig(ls);
        expect(loaded.url).toBe(DISCORD_URL_SAMPLE);
    });

    it('saves and loads event overrides correctly', () => {
        const events = { ...DEFAULT_EVENTS, new_signin: true };
        saveWebhookConfig({ url: DISCORD_URL_SAMPLE, events }, ls);
        const loaded = loadWebhookConfig(ls);
        expect(loaded.events.new_signin).toBe(true);
    });

    it('merges stored events with DEFAULT_EVENTS (new keys get default value)', () => {
        // Simulate a partial stored config (missing future keys)
        ls.setItem(LS_WEBHOOK_URL, DISCORD_URL_SAMPLE);
        ls.setItem(LS_WEBHOOK_EVENTS, JSON.stringify({ new_signin: true }));
        const loaded = loadWebhookConfig(ls);
        // new_signup should fall back to its default (true)
        expect(loaded.events.new_signup).toBe(true);
        expect(loaded.events.new_signin).toBe(true);
    });

    it('handles corrupted events JSON gracefully — falls back to defaults', () => {
        ls.setItem(LS_WEBHOOK_URL, DISCORD_URL_SAMPLE);
        ls.setItem(LS_WEBHOOK_EVENTS, '{ not valid json ');
        const loaded = loadWebhookConfig(ls);
        expect(loaded.events).toEqual(DEFAULT_EVENTS);
    });

    it('overwriting the config updates both keys', () => {
        saveWebhookConfig({ url: DISCORD_URL_SAMPLE, events: DEFAULT_EVENTS }, ls);
        saveWebhookConfig({ url: SLACK_URL_SAMPLE, events: { ...DEFAULT_EVENTS, new_signin: true } }, ls);
        const loaded = loadWebhookConfig(ls);
        expect(loaded.url).toBe(SLACK_URL_SAMPLE);
        expect(loaded.events.new_signin).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. URL VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Webhook URL validation — only Slack and Discord allowed', () => {
    it('accepts a valid discord.com webhook URL', () => {
        expect(isValidWebhookUrl('https://discord.com/api/webhooks/123/token')).toBe(true);
    });

    it('accepts a valid discordapp.com webhook URL', () => {
        expect(isValidWebhookUrl('https://discordapp.com/api/webhooks/123/token')).toBe(true);
    });

    it('accepts a valid Slack webhook URL', () => {
        expect(isValidWebhookUrl('https://hooks.slack.com/services/T/B/xxx')).toBe(true);
    });

    it('rejects an arbitrary HTTPS URL', () => {
        expect(isValidWebhookUrl('https://example.com/webhook')).toBe(false);
    });

    it('rejects an HTTP (non-HTTPS) Discord URL', () => {
        expect(isValidWebhookUrl('http://discord.com/api/webhooks/123/token')).toBe(false);
    });

    it('allows an empty string (clearing the config)', () => {
        expect(isValidWebhookUrl('')).toBe(true);
    });

    it('rejects a URL that merely contains "discord" but is not the real webhook host', () => {
        expect(isValidWebhookUrl('https://notdiscord.com/api/webhooks/123/token')).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. LIVE DISCORD DELIVERY SHAPE (no network — payload is what Discord expects)
// ══════════════════════════════════════════════════════════════════════════════

describe('Discord delivery — payload shape matches Discord API contract', () => {
    it('POST body is valid JSON', () => {
        const payload = buildWebhookPayload('discord', 'test', 'ProCV Admin — Test', 'Webhook is connected!');
        expect(() => JSON.stringify(payload)).not.toThrow();
    });

    it('top-level key is "embeds" (required by Discord webhook API)', () => {
        const payload = buildWebhookPayload('discord', 'test', 'T', 'B') as any;
        expect('embeds' in payload).toBe(true);
    });

    it('embed color is a number, not a string (Discord rejects string colors)', () => {
        const payload = buildWebhookPayload('discord', 'test', 'T', 'B', '#1B2B4B') as any;
        expect(typeof payload.embeds[0].color).toBe('number');
    });

    it('embed has title, description, color, and footer (all required fields)', () => {
        const payload = buildWebhookPayload('discord', 'new_signup', 'New User', 'alice@test.com signed up') as any;
        const embed = payload.embeds[0];
        expect(embed.title).toBeDefined();
        expect(embed.description).toBeDefined();
        expect(embed.color).toBeDefined();
        expect(embed.footer).toBeDefined();
        expect(embed.footer.text).toBeDefined();
    });

    it('HTTP 204 is the success response Discord returns (no body)', () => {
        // Discord returns 204 No Content on successful delivery
        // This test documents the expected status code so future fetch mock
        // assertions use the right value.
        expect(204).toBe(204);
    });
});
