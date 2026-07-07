import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section } from './OverviewTab';

// ── Storage keys ──────────────────────────────────────────────────────────────
const LS_WEBHOOK_URL     = 'procv_admin_webhook_url';
const LS_WEBHOOK_EVENTS  = 'procv_admin_webhook_events';

export interface WebhookConfig {
  url: string;
  events: {
    new_signup: boolean;
    new_signin: boolean;
    signin_spike: boolean;
    worker_error: boolean;
  };
}

const DEFAULT_EVENTS: WebhookConfig['events'] = {
  new_signup:   true,
  new_signin:   false,
  signin_spike: true,
  worker_error: true,
};

export function loadWebhookConfig(): WebhookConfig {
  const url = localStorage.getItem(LS_WEBHOOK_URL) ?? '';
  let events = DEFAULT_EVENTS;
  try {
    const raw = localStorage.getItem(LS_WEBHOOK_EVENTS);
    if (raw) events = { ...DEFAULT_EVENTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { url, events };
}

export function saveWebhookConfig(cfg: WebhookConfig) {
  try {
    localStorage.setItem(LS_WEBHOOK_URL, cfg.url);
    localStorage.setItem(LS_WEBHOOK_EVENTS, JSON.stringify(cfg.events));
  } catch { /* quota */ }
}

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(url: string): 'slack' | 'discord' | 'unknown' {
  if (!url) return 'unknown';
  if (url.includes('hooks.slack.com')) return 'slack';
  if (url.includes('discord.com') || url.includes('discordapp.com')) return 'discord';
  return 'unknown';
}

// ── Build payload ─────────────────────────────────────────────────────────────
export function buildWebhookPayload(
  platform: 'slack' | 'discord' | 'unknown',
  eventType: string,
  title: string,
  body: string,
  color?: string,
): object {
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
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${emoji} ${title}*\n${body}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `ProCV Admin · ${new Date().toUTCString()}` }],
        },
      ],
    };
  }

  return { text: `${emoji} **${title}**\n${body}` };
}

// ── Send notification helper (exported for LiveFeedTab use) ───────────────────
export async function sendWebhookNotification(
  eventType: string,
  title: string,
  body: string,
  color?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadWebhookConfig();
  if (!cfg.url) return { ok: false, error: 'No webhook configured' };
  const evKey = eventType as keyof WebhookConfig['events'];
  if (evKey in cfg.events && !cfg.events[evKey]) return { ok: false, error: 'Event type disabled' };

  const platform = detectPlatform(cfg.url);
  const payload = buildWebhookPayload(platform, eventType, title, body, color);

  try {
    const res = await fetch('/api/notify-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cfg.url, payload }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json().catch(() => ({})) as any;
    return { ok: data.ok ?? res.ok, error: data.error };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Network error' };
  }
}

// ── In-session notification log ───────────────────────────────────────────────
export interface NotificationRecord {
  id: number;
  ts: Date;
  eventType: string;
  title: string;
  body: string;
  ok: boolean;
  error?: string;
}

let _notifLog: NotificationRecord[] = [];
let _notifId = 0;
const _notifListeners: Array<(log: NotificationRecord[]) => void> = [];

export function addNotificationRecord(rec: Omit<NotificationRecord, 'id' | 'ts'>) {
  _notifId++;
  _notifLog = [{ ...rec, id: _notifId, ts: new Date() }, ..._notifLog].slice(0, 100);
  _notifListeners.forEach(fn => fn([..._notifLog]));
}

export function subscribeNotifLog(fn: (log: NotificationRecord[]) => void): () => void {
  _notifListeners.push(fn);
  fn([..._notifLog]);
  return () => { const i = _notifListeners.indexOf(fn); if (i >= 0) _notifListeners.splice(i, 1); };
}

// ── Wrapped send that also logs ───────────────────────────────────────────────
export async function sendAndLog(
  eventType: string,
  title: string,
  body: string,
  color?: string,
) {
  const result = await sendWebhookNotification(eventType, title, body, color);
  addNotificationRecord({ eventType, title, body, ok: result.ok, error: result.error });
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  new_signup:   { label: 'New Signup',        desc: 'Fire when a brand-new user account is created',       color: '#22C55E' },
  new_signin:   { label: 'Every Sign-in',     desc: 'Fire on every Google or magic-link sign-in (noisy)', color: '#60A5FA' },
  signin_spike: { label: 'Sign-in Spike',     desc: 'Fire when >5 sign-ins occur within 60 seconds',      color: '#F59E0B' },
  worker_error: { label: 'Worker Error',      desc: 'Fire when a health-check endpoint returns an error',  color: '#EF4444' },
};

export default function NotificationsTab() {
  const { theme, isDark } = useAdminTheme();

  const [urlInput, setUrlInput]   = useState('');
  const [events, setEvents]       = useState<WebhookConfig['events']>(DEFAULT_EVENTS);
  const [saved, setSaved]         = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [log, setLog]             = useState<NotificationRecord[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load saved config on mount
  useEffect(() => {
    const cfg = loadWebhookConfig();
    setUrlInput(cfg.url);
    setEvents(cfg.events);
  }, []);

  // Subscribe to notification log
  useEffect(() => {
    return subscribeNotifLog(setLog);
  }, []);

  const platform = detectPlatform(urlInput);

  const handleSave = useCallback(() => {
    saveWebhookConfig({ url: urlInput.trim(), events });
    setSaved(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 2200);
  }, [urlInput, events]);

  const handleTest = useCallback(async () => {
    if (!urlInput.trim()) return;
    setTesting(true);
    setTestResult(null);
    saveWebhookConfig({ url: urlInput.trim(), events });
    const result = await sendAndLog(
      'test',
      'ProCV Admin — Test Notification',
      'Your webhook is connected! You will receive alerts here based on the events you selected.',
    );
    setTestResult({ ok: result.ok, msg: result.ok ? 'Delivered successfully ✓' : (result.error ?? 'Delivery failed') });
    setTesting(false);
  }, [urlInput, events]);

  const toggleEvent = (key: keyof WebhookConfig['events']) => {
    setEvents(e => ({ ...e, [key]: !e[key] }));
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    border: `1.5px solid ${theme.inputBorder}`,
    borderRadius: 8,
    background: theme.input,
    color: theme.text,
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const btnPrimary: React.CSSProperties = {
    padding: '9px 18px',
    background: '#1B2B4B',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  };

  const eventBadgeColor = (ok: boolean | undefined, type: string) => {
    if (ok === undefined) return theme.muted;
    return ok ? '#22C55E' : '#EF4444';
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Send real-time alerts to Slack or Discord via webhook"
      />

      {/* ── Webhook Config ── */}
      <Section title="Webhook Configuration">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              Webhook URL
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://hooks.slack.com/… or https://discord.com/api/webhooks/…"
                  style={inputStyle}
                />
                {platform !== 'unknown' && (
                  <div style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, fontWeight: 700,
                    color: platform === 'slack' ? '#4A154B' : '#5865F2',
                    background: platform === 'slack' ? (isDark ? '#2A0A2A' : '#F4E6F7') : (isDark ? '#0D1020' : '#EEF0FE'),
                    padding: '2px 8px', borderRadius: 6,
                  }}>
                    {platform === 'slack' ? 'Slack' : 'Discord'}
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                style={{ ...btnPrimary, background: saved ? '#166534' : '#1B2B4B', minWidth: 80 }}
              >
                {saved ? '✓ Saved' : 'Save'}
              </button>
              <button
                onClick={handleTest}
                disabled={!urlInput.trim() || testing}
                style={{ ...btnPrimary, background: testing ? theme.muted : theme.gold, color: testing ? 'white' : '#1B2B4B', minWidth: 80, opacity: !urlInput.trim() ? 0.5 : 1 }}
              >
                {testing ? 'Sending…' : 'Test'}
              </button>
            </div>

            {testResult && (
              <div style={{
                marginTop: 10, padding: '9px 14px',
                background: testResult.ok ? (isDark ? '#0D2E1E' : '#F0FAF4') : (isDark ? '#2A0E0E' : '#FFF5F5'),
                border: `1px solid ${testResult.ok ? (isDark ? '#1A3A1A' : '#A8D5B5') : (isDark ? '#4A1010' : '#FFCDD2')}`,
                borderRadius: 8, fontSize: 13,
                color: testResult.ok ? (isDark ? '#4ADE80' : '#1B5E20') : (isDark ? '#F87171' : '#C62828'),
              }}>
                {testResult.ok ? '✓' : '✗'} {testResult.msg}
              </div>
            )}
          </div>

          {/* Setup guides */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              {
                platform: 'Slack',
                color: '#4A154B',
                lightBg: '#F4E6F7',
                darkBg: '#1A0620',
                steps: [
                  'Go to api.slack.com/apps → Create New App',
                  'Add "Incoming Webhooks" feature',
                  'Activate & click "Add New Webhook to Workspace"',
                  'Choose a channel and copy the Webhook URL',
                ],
              },
              {
                platform: 'Discord',
                color: '#5865F2',
                lightBg: '#EEF0FE',
                darkBg: '#0D0F2A',
                steps: [
                  'Open the Discord channel → Edit Channel',
                  'Go to Integrations → Webhooks → New Webhook',
                  'Name it, optionally set an avatar',
                  'Click "Copy Webhook URL" and paste it above',
                ],
              },
            ] as const).map(({ platform: p, color, lightBg, darkBg, steps }) => (
              <div key={p} style={{
                padding: '14px 16px',
                background: isDark ? darkBg : lightBg,
                borderRadius: 10,
                border: `1px solid ${color}30`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 10 }}>
                  How to get a {p} webhook
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {steps.map((s, i) => (
                    <li key={i} style={{ fontSize: 12, color: theme.sub, lineHeight: 1.5 }}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Event Toggles ── */}
      <div style={{ marginTop: 16 }}>
        <Section title="Events to Notify">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(Object.entries(EVENT_LABELS) as [keyof WebhookConfig['events'], typeof EVENT_LABELS[string]][]).map(([key, meta]) => {
              const on = events[key];
              return (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px',
                  background: on ? (isDark ? '#0D1E30' : '#F0F5FF') : theme.bg,
                  border: `1.5px solid ${on ? (isDark ? '#1E3A60' : '#C7D8F8') : theme.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  userSelect: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: on ? meta.color : theme.border,
                      flexShrink: 0,
                      boxShadow: on ? `0 0 6px ${meta.color}70` : 'none',
                      transition: 'all 0.2s',
                    }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{meta.label}</div>
                      <div style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{meta.desc}</div>
                    </div>
                  </div>

                  {/* Toggle */}
                  <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleEvent(key)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: on ? '#1B2B4B' : theme.border,
                      borderRadius: 11,
                      transition: 'background 0.2s',
                    }} />
                    <div style={{
                      position: 'absolute',
                      top: 3, left: on ? 21 : 3,
                      width: 16, height: 16,
                      background: on ? theme.gold : 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s, background 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} style={{ ...btnPrimary, background: saved ? '#166534' : '#1B2B4B' }}>
              {saved ? '✓ Settings Saved' : 'Save Event Settings'}
            </button>
          </div>
        </Section>
      </div>

      {/* ── Notification Log ── */}
      <div style={{ marginTop: 16 }}>
        <Section title="Session Notification Log" action={
          log.length > 0
            ? <button onClick={() => { _notifLog.splice(0); setLog([]); }}
                style={{ fontSize: 12, color: theme.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                Clear
              </button>
            : undefined
        }>
          {log.length === 0 ? (
            <div style={{ fontSize: 13, color: theme.muted, padding: '12px 0' }}>
              No notifications sent this session yet. Configure a webhook URL above and click <strong style={{ color: theme.sub }}>Test</strong> to try it.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {log.map(rec => (
                <div key={rec.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px',
                  background: rec.ok
                    ? (isDark ? '#0A1E10' : '#F3FBF5')
                    : (isDark ? '#1A0A0A' : '#FFF5F5'),
                  border: `1px solid ${rec.ok ? (isDark ? '#1A3A20' : '#BBF0CC') : (isDark ? '#3A1010' : '#FFCDD2')}`,
                  borderRadius: 8,
                }}>
                  <div style={{ marginTop: 1, fontSize: 16, flexShrink: 0 }}>
                    {rec.ok ? '✓' : '✗'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{rec.title}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6,
                        background: (EVENT_LABELS[rec.eventType]?.color ?? theme.gold) + '20',
                        color: EVENT_LABELS[rec.eventType]?.color ?? theme.gold,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        {rec.eventType.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.sub, marginTop: 3, lineHeight: 1.5 }}>{rec.body}</div>
                    {rec.error && !rec.ok && (
                      <div style={{ fontSize: 12, color: isDark ? '#F87171' : '#C62828', marginTop: 4 }}>
                        Error: {rec.error}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: theme.muted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {rec.ts.toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Status summary ── */}
      <div style={{ marginTop: 16, padding: '14px 18px', background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }}>
          <div>
            <span style={{ color: theme.muted }}>Webhook: </span>
            <span style={{ fontWeight: 600, color: urlInput ? (platform !== 'unknown' ? (platform === 'discord' ? '#5865F2' : '#4A154B') : theme.text) : theme.muted }}>
              {urlInput ? (platform !== 'unknown' ? platform.charAt(0).toUpperCase() + platform.slice(1) + ' connected' : 'Custom URL set') : 'Not configured'}
            </span>
          </div>
          <div>
            <span style={{ color: theme.muted }}>Active events: </span>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {Object.values(events).filter(Boolean).length} / {Object.keys(events).length}
            </span>
          </div>
          <div>
            <span style={{ color: theme.muted }}>Sent this session: </span>
            <span style={{ fontWeight: 600, color: theme.text }}>{log.length}</span>
          </div>
          <div>
            <span style={{ color: theme.muted }}>Success rate: </span>
            <span style={{ fontWeight: 600, color: log.length === 0 ? theme.muted : log.filter(r => r.ok).length === log.length ? '#22C55E' : '#F59E0B' }}>
              {log.length === 0 ? '—' : `${log.filter(r => r.ok).length}/${log.length}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
