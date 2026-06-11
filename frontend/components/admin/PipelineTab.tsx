import React, { useEffect, useState, useCallback } from 'react';
import { getAdminDashboardStats, DashboardData } from '../../services/cvEngineClient';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section, LoadingBar } from './OverviewTab';

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

// ── Pipeline stages definition ────────────────────────────────────────────────
const STAGES = [
  {
    id: 'research',
    label: 'Market Research',
    model: 'Gemini 2.0 Flash',
    desc: 'Google Search grounding · industry signals · salary range · role expectations',
    color: '#3B82F6',
    icon: '🔍',
    tasks: ['JD parsing', 'Keyword extraction', 'ATS gap analysis', 'Industry detection'],
  },
  {
    id: 'brief',
    label: 'Brief Builder',
    model: 'D1 + KV lookup',
    desc: 'Verb pools · banned phrases · voice profiles · seniority rules — loaded from Cloudflare KV',
    color: '#8B5CF6',
    icon: '📋',
    tasks: ['Fetch verb pool', 'Load banned phrases', 'Select voice profile', 'Build engine brief'],
  },
  {
    id: 'sections',
    label: 'Parallel Sections',
    model: 'Mistral Small 3.1 24B',
    desc: 'Summary · Skills · Experience bullets · Projects — 4–6 worker calls in parallel',
    color: '#10B981',
    icon: '⚡',
    tasks: ['Summary generation', 'Skills curation', 'Experience bullets', 'Projects section'],
  },
  {
    id: 'quality',
    label: 'Quality Pipeline',
    model: 'Hermes-2 Pro 7B / rules',
    desc: 'Purify → Humanize → Number fidelity → Voice audit → Validator',
    color: '#F59E0B',
    icon: '✨',
    tasks: ['Banned phrase purge', 'Humanization pass', 'Number fidelity', 'Voice audit', 'Validator'],
  },
  {
    id: 'output',
    label: 'Final CV',
    model: 'Client render',
    desc: 'Structured JSON → React template → PDF via headless Chrome',
    color: '#EF4444',
    icon: '📄',
    tasks: ['JSON assembly', 'Template render', 'PDF generation'],
  },
];

async function pingEndpoint(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; latency: number; status: number; detail?: string }> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const latency = Math.round(performance.now() - t0);
    let detail: string | undefined;
    try { const j = await r.json(); detail = j?.error || j?.message; } catch {}
    return { ok: r.status < 500, latency, status: r.status, detail };
  } catch (e: any) {
    return { ok: false, latency: Math.round(performance.now() - t0), status: 0, detail: e?.message || 'Network error' };
  }
}

interface ModelStatus { name: string; task: string; ok: boolean | null; latency: number | null; detail?: string }

const AI_MODELS: { name: string; task: string; stage: string }[] = [
  { name: 'Mistral Small 3.1 24B', task: 'cvGenerate',  stage: 'sections' },
  { name: 'Mistral Small 3.1 24B', task: 'cvAudit',     stage: 'quality' },
  { name: 'Hermes-2 Pro 7B',       task: 'humanize',    stage: 'quality' },
  { name: 'Llama 3.2-11B Vision',  task: 'vision',      stage: 'brief' },
];

export default function PipelineTab() {
  const { theme, isDark } = useAdminTheme();
  const [dbData, setDbData]     = useState<DashboardData | null>(null);
  const [models, setModels]     = useState<ModelStatus[]>(AI_MODELS.map(m => ({ name: m.name, task: m.task, ok: null, latency: null })));
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const adminTok = sessionStorage.getItem('procv_admin_tok') || '';

  const loadDb = useCallback(async () => {
    const d = await getAdminDashboardStats();
    if (d) setDbData(d);
  }, []);

  const checkModels = useCallback(async () => {
    setChecking(true);
    setModels(AI_MODELS.map(m => ({ name: m.name, task: m.task, ok: null, latency: null })));
    await Promise.all(AI_MODELS.map(async (m, i) => {
      const url = `${ENGINE_URL}/api/cv/tiered-llm`;
      const t0 = performance.now();
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: m.task, system: 'respond ok', user: 'say ok', max_tokens: 8, temperature: 0 }),
          signal: AbortSignal.timeout(12000),
        });
        const latency = Math.round(performance.now() - t0);
        const json = await r.json().catch(() => ({}));
        const hasText = !!json?.text;
        setModels(prev => {
          const next = [...prev];
          next[i] = { name: m.name, task: m.task, ok: r.ok && hasText, latency, detail: !hasText ? 'empty response (cold model?)' : undefined };
          return next;
        });
      } catch (e: any) {
        const latency = Math.round(performance.now() - t0);
        setModels(prev => { const n = [...prev]; n[i] = { name: m.name, task: m.task, ok: false, latency, detail: e?.message }; return n; });
      }
    }));
    setLastCheck(new Date());
    setChecking(false);
  }, [adminTok]);

  useEffect(() => { void loadDb(); void checkModels(); }, []);

  const tableCounts = dbData?.table_counts ?? [];
  const cacheRow    = tableCounts.find(t => t.table === 'llm_cache');
  const examplesRow = tableCounts.find(t => t.table === 'cv_examples');
  const profileRow  = tableCounts.find(t => t.table === 'profile_cache');
  const okCount     = models.filter(m => m.ok === true).length;
  const failCount   = models.filter(m => m.ok === false).length;

  return (
    <div>
      <PageHeader title="Pipeline Monitor" subtitle="CV generation flow · AI model health · cache stats" onRefresh={() => { void loadDb(); void checkModels(); }} />

      {/* ── Pipeline flow ─────────────────────────────────────────────────── */}
      <Section title="CV Generation Pipeline">
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
          {STAGES.map((stage, idx) => (
            <React.Fragment key={stage.id}>
              <div style={{ flex: '1 1 0', minWidth: 160, background: isDark ? `${stage.color}12` : `${stage.color}0D`, border: `1px solid ${stage.color}40`, borderRadius: 10, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18 }}>{stage.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage {idx + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{stage.label}</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: theme.sub, fontFamily: 'monospace', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)', borderRadius: 5, padding: '4px 7px', wordBreak: 'break-word' }}>{stage.model}</div>
                <div style={{ fontSize: 11, color: theme.sub, lineHeight: 1.4 }}>{stage.desc}</div>
                <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {stage.tasks.map(t => <li key={t} style={{ fontSize: 11, color: theme.muted }}>{t}</li>)}
                </ul>
              </div>
              {idx < STAGES.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px', flexShrink: 0 }}>
                  <span style={{ fontSize: 18, color: theme.muted }}>→</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* ── AI Model health ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <Section title="AI Model Health"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {lastCheck && <span style={{ fontSize: 11, color: theme.muted }}>Checked {lastCheck.toLocaleTimeString()}</span>}
              <button onClick={checkModels} disabled={checking}
                style={{ padding: '5px 12px', background: theme.navy, color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer', opacity: checking ? 0.6 : 1 }}>
                {checking ? 'Checking…' : '↻ Probe'}
              </button>
            </div>
          }>
          {/* Summary bar */}
          {!checking && (okCount + failCount > 0) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 12px', background: theme.badge.ok.bg, borderRadius: 99, fontSize: 12, color: theme.badge.ok.text, fontWeight: 600 }}>✓ {okCount} model{okCount !== 1 ? 's' : ''} healthy</span>
              {failCount > 0 && <span style={{ padding: '4px 12px', background: theme.badge.err.bg, borderRadius: 99, fontSize: 12, color: theme.badge.err.text, fontWeight: 600 }}>✗ {failCount} failing</span>}
              {models.some(m => m.ok === null) && <span style={{ padding: '4px 12px', background: theme.badge.warn.bg, borderRadius: 99, fontSize: 12, color: theme.badge.warn.text, fontWeight: 600 }}>⏳ {models.filter(m => m.ok === null).length} probing…</span>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {models.map((m, i) => {
              const stage = AI_MODELS[i]?.stage ?? '';
              const stageColor = STAGES.find(s => s.id === stage)?.color ?? '#888';
              return (
                <div key={i} style={{ padding: '12px 14px', background: theme.bg, border: `1px solid ${m.ok === null ? theme.border : m.ok ? (isDark ? '#1A3A1A' : '#C8E6C9') : (isDark ? '#3A1A1A' : '#FFCDD2')}`, borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: m.ok === null ? theme.muted : m.ok ? '#22C55E' : '#EF4444', boxShadow: m.ok === true ? '0 0 6px #22C55E80' : m.ok === false ? '0 0 6px #EF444480' : 'none', animation: m.ok === null && checking ? 'pulse 1s infinite' : 'none' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: stageColor, fontFamily: 'monospace', fontWeight: 600 }}>task:{m.task}</div>
                    </div>
                    {m.latency !== null && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace', color: m.latency > 5000 ? (isDark ? '#FBBF24' : '#B45309') : theme.sub }}>
                        {m.latency}ms
                      </span>
                    )}
                  </div>
                  {m.detail && <div style={{ fontSize: 11, color: isDark ? '#F87171' : '#C62828', background: theme.badge.err.bg, padding: '3px 8px', borderRadius: 5 }}>⚠ {m.detail}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* ── Cache & DB stats ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
        <CacheCard
          title="LLM Response Cache"
          icon="💾"
          value={cacheRow && cacheRow.count >= 0 ? cacheRow.count.toLocaleString() : '—'}
          sub="Cached AI responses in D1 (30-day TTL)"
          color="#3B82F6"
        />
        <CacheCard
          title="CV Examples Pool"
          icon="📚"
          value={examplesRow && examplesRow.count >= 0 ? examplesRow.count.toLocaleString() : '—'}
          sub="Structural blueprints for reference-guided generation"
          color="#8B5CF6"
        />
        <CacheCard
          title="Profile Cache"
          icon="👤"
          value={profileRow && profileRow.count >= 0 ? profileRow.count.toLocaleString() : '—'}
          sub="Compact profile snapshots (reduces prompt size)"
          color="#10B981"
        />
      </div>

      {/* ── Provider fallback chain ──────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <Section title="Provider Fallback Chain">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: '1st — Cloudflare Workers AI', model: 'Mistral Small 3.1 24B (FREE)', desc: 'Primary — always tried first', color: '#F97316' },
              { label: '2nd — Groq API', model: 'llama-3.3-70b-versatile', desc: 'Fast fallback — BYOK or platform key', color: '#8B5CF6' },
              { label: '3rd — Cerebras (parallel race)', model: 'llama-3.3-70b', desc: 'Raced with Groq for speed', color: '#06B6D4' },
              { label: '4th — OpenRouter / Together.ai', model: 'Various free-tier models', desc: 'Free tier when Groq quota exhausted', color: '#10B981' },
              { label: '5th — Claude (Anthropic)', model: 'claude-3-haiku (user BYOK)', desc: 'User supplies key in Settings', color: '#EC4899' },
              { label: '6th — Gemini (Google)', model: 'gemini-2.0-flash (user BYOK)', desc: 'Final fallback — user supplies key', color: '#3B82F6' },
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: theme.sub }}>{p.desc}</div>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.muted, background: isDark ? 'rgba(0,0,0,0.3)' : '#F5F3EF', padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>{p.model}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

function CacheCard({ title, icon, value, sub, color }: { title: string; icon: string; value: string; sub: string; color: string }) {
  const { theme, isDark } = useAdminTheme();
  return (
    <div style={{ padding: '16px 18px', background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: theme.text, letterSpacing: '-1px' }}>{value}</div>
      <div style={{ fontSize: 11, color: theme.muted, marginTop: 5, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}
