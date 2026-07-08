import React, { useEffect, useState, useRef, useCallback } from 'react';
import { listAuthLogs, AuthLog } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader } from './OverviewTab';

// Note: new_signup / new_signin / signin_spike Discord/Slack notifications are
// now fired server-side, directly from the worker at the moment the real auth
// event happens (see backend handlers/notifications.ts). This tab used to also
// fire those webhooks client-side from its polling loop, but that only worked
// while an admin happened to have this tab open — real events were silently
// dropped otherwise. The client-side firing was removed to avoid duplicates
// and to make delivery reliable regardless of who has the panel open.

function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function parseUA(ua: string | null) {
  if (!ua) return 'Unknown';
  if (/Mobile/i.test(ua)) return 'Mobile';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Edg/i.test(ua)) return 'Edge';
  return 'Browser';
}

type LogLine = AuthLog & { _new?: boolean };

const EVENT_META: Record<string, { color: string; icon: string; label: string }> = {
  signin_google: { color: '#60A5FA', icon: '●', label: 'GOOGLE' },
  signin_magic:  { color: '#C084FC', icon: '●', label: 'MAGIC' },
  signout:       { color: '#94A3B8', icon: '○', label: 'SIGNOUT' },
};

function getEventMeta(event: string, isDark: boolean) {
  return EVENT_META[event] || { color: isDark ? '#FBBF24' : '#E65100', icon: '⚠', label: event.toUpperCase() };
}

export default function LiveFeedTab() {
  const { theme, isDark } = useAdminTheme();
  const [lines, setLines]       = useState<LogLine[]>([]);
  const [auto, setAuto]         = useState(true);
  const [paused, setPaused]     = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [loading, setLoading]   = useState(true);
  const [errMsg, setErrMsg]     = useState('');
  const [filter, setFilter]     = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds   = useRef<Set<number>>(new Set());
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async (silent = false) => {
    if (paused) return;
    if (!silent) setLoading(true);
    setErrMsg('');
    const res = await listAuthLogs({ limit: 50, offset: 0 });
    if (res) {
      const fresh = res.logs.filter(l => !seenIds.current.has(l.id));
      fresh.forEach(l => seenIds.current.add(l.id));
      if (fresh.length > 0) {
        setLines(prev => {
          const updated = [
            ...fresh.map(l => ({ ...l, _new: true })),
            ...prev,
          ].slice(0, 300);
          return updated;
        });
        setTimeout(() => setLines(prev => prev.map(l => ({ ...l, _new: false }))), 1200);
      }
      setLastPoll(new Date());
    } else {
      setErrMsg('Poll failed — worker unreachable?');
    }
    if (!silent) setLoading(false);
  }, [paused]);

  // Initial load
  useEffect(() => { void poll(); }, []);

  // Auto-poll every 10s — pause when browser tab is hidden to avoid wasting requests
  useEffect(() => {
    const startTimers = () => {
      if (!auto) return;
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
      setCountdown(10);
      timerRef.current = setInterval(() => { void poll(true); setCountdown(10); }, 10_000);
      countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1_000);
    };
    const stopTimers = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (countRef.current) { clearInterval(countRef.current); countRef.current = null; }
    };

    if (!auto) { stopTimers(); return; }

    startTimers();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll(true);
        startTimers();
      } else {
        stopTimers();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopTimers();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [auto, poll]);

  // Scroll to top on new lines
  useEffect(() => {
    if (!paused && lines.length > 0) bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [lines.length]);

  const displayed = filter
    ? lines.filter(l => l.email.toLowerCase().includes(filter.toLowerCase()) || l.event.includes(filter) || (l.ip || '').includes(filter))
    : lines;

  const termBg    = isDark ? '#080F18' : '#0F1A28';
  const termText  = isDark ? '#C8D8E8' : '#B8CCE0';
  const termBdr   = isDark ? '#1A2535' : '#1A2535';

  return (
    <div>
      <PageHeader title="Live Feed" subtitle="Real-time activity stream — auto-polls every 10 s" onRefresh={() => poll()} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setAuto(a => !a)}
          style={{ padding: '8px 14px', background: auto ? '#1B5E20' : theme.card, border: `1px solid ${auto ? '#2E7D32' : theme.border}`, borderRadius: 8, color: auto ? '#4ADE80' : theme.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {auto ? `⏵ Auto (${countdown}s)` : '⏸ Manual'}
        </button>
        <button onClick={() => setPaused(p => !p)}
          style={{ padding: '8px 14px', background: paused ? '#7C1A1A' : theme.card, border: `1px solid ${paused ? '#B91C1C' : theme.border}`, borderRadius: 8, color: paused ? '#FCA5A5' : theme.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <input type="search" placeholder="Filter by email / IP / event…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: `1px solid ${theme.inputBorder}`, borderRadius: 8, background: theme.input, color: theme.text, fontSize: 13, outline: 'none' }} />
        <button onClick={() => { seenIds.current.clear(); setLines([]); }}
          style={{ padding: '8px 12px', background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.muted, fontSize: 13, cursor: 'pointer' }}>
          Clear
        </button>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {(['signin_google','signin_magic','signout'] as const).map(ev => {
            const count = lines.filter(l => l.event === ev).length;
            const meta = getEventMeta(ev, isDark);
            return (
              <span key={ev} style={{ fontSize: 12, color: meta.color, fontFamily: 'monospace', background: termBg, padding: '4px 10px', borderRadius: 6, border: `1px solid ${termBdr}` }}>
                {meta.icon} {meta.label} {count}
              </span>
            );
          })}
        </div>
      </div>

      {errMsg && (
        <div style={{ marginBottom: 10, padding: '8px 14px', background: theme.badge.err.bg, border: `1px solid ${isDark ? '#4A1010' : '#FFCDD2'}`, borderRadius: 8, color: theme.badge.err.text, fontSize: 12 }}>
          ⚠ {errMsg}
        </div>
      )}

      {/* Terminal log */}
      <div style={{ background: termBg, border: `1px solid ${termBdr}`, borderRadius: 12, overflow: 'hidden', fontFamily: 'ui-monospace, "Cascadia Mono", "Fira Code", monospace' }}>
        {/* Terminal header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${termBdr}`, background: isDark ? '#060C14' : '#0A1220' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: 11, color: '#4A6070', marginLeft: 8, letterSpacing: '0.05em' }}>procv-admin / live-feed</span>
          {lastPoll && <span style={{ fontSize: 10, color: '#2E4058', marginLeft: 'auto' }}>Last polled: {lastPoll.toLocaleTimeString()}</span>}
        </div>

        {/* Log lines */}
        <div style={{ height: 520, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading && lines.length === 0 && (
            <div style={{ color: '#4A6070', fontSize: 13, padding: '20px 0' }}>Polling…</div>
          )}
          {displayed.length === 0 && !loading && (
            <div style={{ color: '#2E4058', fontSize: 13, padding: '20px 0' }}>No events yet. Waiting for activity…</div>
          )}
          {displayed.map((log, i) => {
            const meta = getEventMeta(log.event, isDark);
            const isNew = log._new;
            return (
              <div key={log.id ?? i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12, lineHeight: 1.5, borderRadius: 4, padding: '2px 6px', background: isNew ? 'rgba(201,168,76,0.08)' : 'transparent', transition: 'background 1s' }}>
                {/* Timestamp */}
                <span style={{ color: '#3A5570', flexShrink: 0, fontSize: 11 }}>{fmtTime(log.created_at)}</span>
                {/* Event badge */}
                <span style={{ color: meta.color, flexShrink: 0, minWidth: 80, fontWeight: 600, fontSize: 11 }}>{meta.icon} {meta.label}</span>
                {/* Email */}
                <span style={{ color: termText, flexShrink: 0, minWidth: 180, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.email}</span>
                {/* IP */}
                <span style={{ color: '#3A6080', flexShrink: 0, minWidth: 100, fontSize: 11 }}>{log.ip || '—'}</span>
                {/* Browser */}
                <span style={{ color: '#2E4A60', fontSize: 11 }}>{parseUA(log.user_agent)}</span>
                {isNew && <span style={{ color: '#C9A84C', fontSize: 10, marginLeft: 'auto' }}>NEW</span>}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${termBdr}`, background: isDark ? '#060C14' : '#0A1220', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#2E4058' }}>
            {displayed.length} event{displayed.length !== 1 ? 's' : ''} · {lines.length} total buffered
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: auto ? '#22C55E' : '#4A6070', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: auto ? '#22C55E' : '#4A6070', display: 'inline-block', animation: auto ? 'pulse 1.5s infinite' : 'none' }} />
            {auto ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
