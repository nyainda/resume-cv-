import React, { useState, useEffect, useCallback } from 'react';
import { useAdminTheme } from './AdminContext';
import { PageHeader, Section } from './OverviewTab';

const SEO_PROXY_URL = 'https://procv-seo-proxy.dripstech.workers.dev';
const ORIGIN_URL    = 'https://resume-cv-gold.vercel.app';

// ── Country coverage data (mirrors geo.ts) ────────────────────────────────────

interface GeoMarket {
  code: string; flag: string; label: string; tier: 1|2|3|4|5; locale: string;
}

const MARKETS: GeoMarket[] = [
  // Tier 1
  { code:'US', flag:'🇺🇸', label:'United States',   tier:1, locale:'en_US' },
  { code:'GB', flag:'🇬🇧', label:'United Kingdom',  tier:1, locale:'en_GB' },
  { code:'CA', flag:'🇨🇦', label:'Canada',          tier:1, locale:'en_CA' },
  { code:'AU', flag:'🇦🇺', label:'Australia',       tier:1, locale:'en_AU' },
  { code:'NZ', flag:'🇳🇿', label:'New Zealand',     tier:1, locale:'en_NZ' },
  { code:'IE', flag:'🇮🇪', label:'Ireland',         tier:1, locale:'en_IE' },
  // Tier 2
  { code:'DE', flag:'🇩🇪', label:'Germany',         tier:2, locale:'de_DE' },
  { code:'NL', flag:'🇳🇱', label:'Netherlands',     tier:2, locale:'nl_NL' },
  { code:'SE', flag:'🇸🇪', label:'Sweden',          tier:2, locale:'sv_SE' },
  { code:'NO', flag:'🇳🇴', label:'Norway',          tier:2, locale:'nb_NO' },
  { code:'CH', flag:'🇨🇭', label:'Switzerland',     tier:2, locale:'de_CH' },
  { code:'DK', flag:'🇩🇰', label:'Denmark',         tier:2, locale:'da_DK' },
  { code:'FI', flag:'🇫🇮', label:'Finland',         tier:2, locale:'fi_FI' },
  { code:'AT', flag:'🇦🇹', label:'Austria',         tier:2, locale:'de_AT' },
  { code:'BE', flag:'🇧🇪', label:'Belgium',         tier:2, locale:'fr_BE' },
  { code:'FR', flag:'🇫🇷', label:'France',          tier:2, locale:'fr_FR' },
  // Tier 3
  { code:'AE', flag:'🇦🇪', label:'UAE',             tier:3, locale:'ar_AE' },
  { code:'SA', flag:'🇸🇦', label:'Saudi Arabia',    tier:3, locale:'ar_SA' },
  { code:'QA', flag:'🇶🇦', label:'Qatar',           tier:3, locale:'ar_QA' },
  { code:'KW', flag:'🇰🇼', label:'Kuwait',          tier:3, locale:'ar_KW' },
  { code:'BH', flag:'🇧🇭', label:'Bahrain',         tier:3, locale:'ar_BH' },
  { code:'OM', flag:'🇴🇲', label:'Oman',            tier:3, locale:'ar_OM' },
  // Tier 4
  { code:'SG', flag:'🇸🇬', label:'Singapore',       tier:4, locale:'en_SG' },
  { code:'HK', flag:'🇭🇰', label:'Hong Kong',       tier:4, locale:'zh_HK' },
  { code:'MY', flag:'🇲🇾', label:'Malaysia',        tier:4, locale:'ms_MY' },
  { code:'TW', flag:'🇹🇼', label:'Taiwan',          tier:4, locale:'zh_TW' },
  { code:'JP', flag:'🇯🇵', label:'Japan',           tier:4, locale:'ja_JP' },
  { code:'KR', flag:'🇰🇷', label:'South Korea',     tier:4, locale:'ko_KR' },
  // Tier 5
  { code:'IN', flag:'🇮🇳', label:'India',           tier:5, locale:'en_IN' },
  { code:'NG', flag:'🇳🇬', label:'Nigeria',         tier:5, locale:'en_NG' },
  { code:'ZA', flag:'🇿🇦', label:'South Africa',    tier:5, locale:'en_ZA' },
  { code:'PH', flag:'🇵🇭', label:'Philippines',     tier:5, locale:'en_PH' },
  { code:'GH', flag:'🇬🇭', label:'Ghana',           tier:5, locale:'en_GH' },
  { code:'KE', flag:'🇰🇪', label:'Kenya',           tier:5, locale:'en_KE' },
];

const TIER_COLORS: Record<number, { bg: string; text: string; darkBg: string; darkText: string }> = {
  1: { bg:'#F0FAF4', text:'#166534', darkBg:'#0A2010', darkText:'#4ADE80' },
  2: { bg:'#EEF0FE', text:'#3730A3', darkBg:'#0D0F2A', darkText:'#818CF8' },
  3: { bg:'#FFF7E6', text:'#92400E', darkBg:'#1A1000', darkText:'#FBBF24' },
  4: { bg:'#F5F3FF', text:'#6D28D9', darkBg:'#110A2A', darkText:'#C084FC' },
  5: { bg:'#FFF5F5', text:'#9B1C1C', darkBg:'#1A0808', darkText:'#F87171' },
};

const TIER_LABELS: Record<number, string> = {
  1:'Tier 1 — English', 2:'Tier 2 — Europe', 3:'Tier 3 — Gulf/MENA',
  4:'Tier 4 — APAC', 5:'Tier 5 — Emerging',
};

// ── Programmatic pages ────────────────────────────────────────────────────────

const JOB_SLUGS = [
  { slug:'software-engineer',  label:'Software Engineer',  cat:'Technology' },
  { slug:'frontend-developer', label:'Frontend Developer', cat:'Technology' },
  { slug:'data-scientist',     label:'Data Scientist',     cat:'Technology' },
  { slug:'product-manager',    label:'Product Manager',    cat:'Technology' },
  { slug:'marketing-manager',  label:'Marketing Manager',  cat:'Business' },
  { slug:'financial-analyst',  label:'Financial Analyst',  cat:'Business' },
  { slug:'accountant',         label:'Accountant',         cat:'Business' },
  { slug:'project-manager',    label:'Project Manager',    cat:'Business' },
  { slug:'lawyer',             label:'Lawyer',             cat:'Business' },
  { slug:'hr-manager',         label:'HR Manager',         cat:'Business' },
  { slug:'nurse',              label:'Nurse',              cat:'Healthcare' },
  { slug:'teacher',            label:'Teacher',            cat:'Education' },
];

// ── Proxy health check ────────────────────────────────────────────────────────

interface ProxyStatus {
  ok: boolean;
  latencyMs: number;
  hasTitle: boolean;
  hasCanonical: boolean;
  hasJsonLd: boolean;
  hasHreflang: boolean;
  titleText: string;
  error?: string;
}

async function checkProxyHealth(): Promise<ProxyStatus> {
  const t0 = Date.now();
  try {
    const resp = await fetch(SEO_PROXY_URL + '/', { signal: AbortSignal.timeout(10_000) });
    const latencyMs = Date.now() - t0;
    if (!resp.ok) return { ok: false, latencyMs, hasTitle: false, hasCanonical: false, hasJsonLd: false, hasHreflang: false, titleText: '', error: `HTTP ${resp.status}` };
    const html = await resp.text();
    const hasTitle     = /<title[^>]*>/.test(html);
    const hasCanonical = /rel="canonical"/.test(html);
    const hasJsonLd    = /application\/ld\+json/.test(html);
    const hasHreflang  = /hreflang/.test(html);
    const titleMatch   = html.match(/<title[^>]*>([^<]+)<\/title>/);
    const titleText    = titleMatch ? titleMatch[1].replace(/&amp;/g, '&') : '';
    return { ok: true, latencyMs, hasTitle, hasCanonical, hasJsonLd, hasHreflang, titleText };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, hasTitle: false, hasCanonical: false, hasJsonLd: false, hasHreflang: false, titleText: '', error: e?.message ?? 'Network error' };
  }
}

async function testJobPage(slug: string): Promise<{ ok: boolean; latencyMs: number; title: string; error?: string }> {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${SEO_PROXY_URL}/cv-templates/${slug}`, { signal: AbortSignal.timeout(10_000) });
    const latencyMs = Date.now() - t0;
    const text = await resp.text();
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/);
    return { ok: resp.ok, latencyMs, title: titleMatch?.[1]?.replace(/&amp;/g, '&') ?? '' };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, title: '', error: e?.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SeoTab() {
  const { theme, isDark } = useAdminTheme();

  const [proxyStatus, setProxyStatus]   = useState<ProxyStatus | null>(null);
  const [checking, setChecking]         = useState(false);
  const [testedSlug, setTestedSlug]     = useState<string | null>(null);
  const [slugResult, setSlugResult]     = useState<{ ok: boolean; latencyMs: number; title: string; error?: string } | null>(null);
  const [activeTier, setActiveTier]     = useState<number | null>(null);

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    const result = await checkProxyHealth();
    setProxyStatus(result);
    setChecking(false);
  }, []);

  useEffect(() => { void runHealthCheck(); }, [runHealthCheck]);

  const handleTestSlug = useCallback(async (slug: string) => {
    setTestedSlug(slug);
    setSlugResult(null);
    const result = await testJobPage(slug);
    setSlugResult(result);
  }, []);

  const tierGroups = [1,2,3,4,5].map(tier => ({
    tier,
    markets: MARKETS.filter(m => m.tier === tier),
  }));

  const card: React.CSSProperties = {
    background: theme.card, border: `1px solid ${theme.border}`,
    borderRadius: 12, padding: '18px 20px',
  };

  const badge = (ok: boolean | null): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
    background: ok == null ? theme.bg : ok ? (isDark ? '#0A2010' : '#F0FAF4') : (isDark ? '#2A0808' : '#FFF5F5'),
    color: ok == null ? theme.muted : ok ? (isDark ? '#4ADE80' : '#166534') : (isDark ? '#F87171' : '#9B1C1C'),
  });

  return (
    <div>
      <PageHeader
        title="SEO Performance"
        subtitle="Cloudflare edge proxy status, geo coverage, and programmatic landing pages"
      />

      {/* ── Proxy Status Card ─────────────────────────────────────────────── */}
      <Section title="Edge Proxy Status">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          {/* Worker URL */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Proxy Worker</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.gold, wordBreak: 'break-all' }}>procv-seo-proxy</div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>dripstech.workers.dev</div>
          </div>

          {/* Origin */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Origin App</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, wordBreak: 'break-all' }}>resume-cv-gold</div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>vercel.app</div>
          </div>

          {/* Status */}
          <div style={{ ...card, border: `1px solid ${proxyStatus?.ok ? (isDark ? '#1A3A20' : '#A8D5B5') : theme.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Status</div>
            {proxyStatus ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: proxyStatus.ok ? '#22C55E' : '#EF4444' }}>
                  {proxyStatus.ok ? '● Online' : '● Error'}
                </div>
                <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>{proxyStatus.latencyMs}ms response</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: theme.muted }}>{checking ? 'Checking…' : '—'}</div>
            )}
          </div>

          {/* Cache TTL */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>HTML Cache TTL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>5<span style={{ fontSize: 13 }}> min</span></div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>Per country, CF edge</div>
          </div>

          {/* Asset Cache */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Asset Cache TTL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>1<span style={{ fontSize: 13 }}> year</span></div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>JS/CSS/images</div>
          </div>

          {/* Markets */}
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Markets</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.gold }}>{MARKETS.length}</div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>countries, 5 tiers</div>
          </div>
        </div>

        {/* Meta injection checks */}
        {proxyStatus && (
          <div style={{ padding: '14px 16px', background: proxyStatus.ok ? (isDark ? '#081810' : '#F0FAF4') : (isDark ? '#1A0808' : '#FFF5F5'), border: `1px solid ${proxyStatus.ok ? (isDark ? '#1A3A20' : '#BBF0CC') : (isDark ? '#3A1010' : '#FFCDD2')}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: proxyStatus.titleText ? 10 : 0 }}>
              <span style={badge(proxyStatus.hasTitle)}>      {proxyStatus.hasTitle      ? '✓' : '✗'} &lt;title&gt;</span>
              <span style={badge(proxyStatus.hasCanonical)}>  {proxyStatus.hasCanonical  ? '✓' : '✗'} canonical</span>
              <span style={badge(proxyStatus.hasJsonLd)}>     {proxyStatus.hasJsonLd     ? '✓' : '✗'} JSON-LD</span>
              <span style={badge(proxyStatus.hasHreflang)}>   {proxyStatus.hasHreflang   ? '✓' : '✗'} hreflang</span>
              {proxyStatus.error && <span style={badge(false)}>{proxyStatus.error}</span>}
            </div>
            {proxyStatus.titleText && (
              <div style={{ fontSize: 12, color: theme.sub, fontStyle: 'italic' }}>
                Current title: <strong style={{ color: theme.text }}>{proxyStatus.titleText}</strong>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <button onClick={runHealthCheck} disabled={checking}
            style={{ padding: '8px 16px', background: '#1B2B4B', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer', opacity: checking ? 0.6 : 1 }}>
            {checking ? 'Checking…' : '↺ Re-check proxy'}
          </button>
          <a href={SEO_PROXY_URL} target="_blank" rel="noopener noreferrer"
            style={{ padding: '8px 16px', background: theme.bg, color: theme.sub, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            ↗ Open proxy
          </a>
          <a href={`${SEO_PROXY_URL}/cv-templates`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '8px 16px', background: theme.bg, color: theme.sub, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            ↗ /cv-templates
          </a>
        </div>
      </Section>

      {/* ── Programmatic Pages ────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Section title={`Programmatic Landing Pages (${JOB_SLUGS.length})`}>
          <div style={{ fontSize: 12, color: theme.muted, marginBottom: 12 }}>
            Each page is fully server-rendered at the CF edge — no JS required for Google to index. Click a page to test its live response.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {JOB_SLUGS.map(({ slug, label, cat }) => {
              const isActive = testedSlug === slug;
              const catColor = cat === 'Technology' ? theme.gold : cat === 'Business' ? '#60A5FA' : cat === 'Healthcare' ? '#4ADE80' : '#C084FC';
              return (
                <div key={slug}
                  onClick={() => handleTestSlug(slug)}
                  style={{ padding: '10px 12px', background: isActive ? (isDark ? '#0D1E30' : '#EEF4FF') : theme.bg, border: `1.5px solid ${isActive ? (isDark ? '#1E3A60' : '#C7D8F8') : theme.border}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{label}</div>
                      <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>/cv-templates/{slug}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: catColor + '20', color: catColor, flexShrink: 0 }}>{cat}</span>
                  </div>
                  {isActive && slugResult && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ color: slugResult.ok ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{slugResult.ok ? '✓' : '✗'}</span>
                        <span style={{ color: theme.muted }}>{slugResult.latencyMs}ms</span>
                        {slugResult.error && <span style={{ color: '#EF4444' }}>{slugResult.error}</span>}
                      </div>
                      {slugResult.title && (
                        <div style={{ fontSize: 11, color: theme.sub, marginTop: 3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slugResult.title}>
                          {slugResult.title}
                        </div>
                      )}
                      <a href={`${SEO_PROXY_URL}/cv-templates/${slug}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-block', marginTop: 4, fontSize: 11, color: theme.gold, textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>
                        ↗ Open page
                      </a>
                    </div>
                  )}
                  {isActive && !slugResult && (
                    <div style={{ marginTop: 6, fontSize: 11, color: theme.muted }}>Testing…</div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* ── Geo Coverage ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Section title={`Geo Coverage — ${MARKETS.length} Markets`}>
          <div style={{ fontSize: 12, color: theme.muted, marginBottom: 14 }}>
            Each market gets its own country-specific title, description, and keywords injected at the CF edge. Click a tier to filter.
          </div>

          {/* Tier filter */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={() => setActiveTier(null)}
              style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${activeTier === null ? theme.gold : theme.border}`, background: activeTier === null ? theme.gold + '20' : theme.bg, color: activeTier === null ? theme.gold : theme.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              All ({MARKETS.length})
            </button>
            {[1,2,3,4,5].map(t => {
              const col = TIER_COLORS[t];
              const count = MARKETS.filter(m => m.tier === t).length;
              const active = activeTier === t;
              return (
                <button key={t} onClick={() => setActiveTier(active ? null : t)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? (isDark ? col.darkText : col.text) : theme.border}`, background: active ? (isDark ? col.darkBg : col.bg) : theme.bg, color: active ? (isDark ? col.darkText : col.text) : theme.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  T{t} ({count})
                </button>
              );
            })}
          </div>

          {/* Tier groups */}
          {tierGroups.filter(g => activeTier === null || g.tier === activeTier).map(({ tier, markets }) => {
            const col = TIER_COLORS[tier];
            return (
              <div key={tier} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? col.darkText : col.text, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: isDark ? col.darkText : col.text }} />
                  {TIER_LABELS[tier]} — {markets.length} countries
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {markets.map(m => (
                    <div key={m.code}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: isDark ? col.darkBg : col.bg, border: `1px solid ${(isDark ? col.darkText : col.text)}25`, borderRadius: 20, fontSize: 12, color: isDark ? col.darkText : col.text }}>
                      <span style={{ fontSize: 14 }}>{m.flag}</span>
                      <span style={{ fontWeight: 600 }}>{m.code}</span>
                      <span style={{ opacity: 0.7 }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Section>
      </div>

      {/* ── Domain Setup Guide ────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Section title="Domain Plug-in Guide">
          <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.7, marginBottom: 14 }}>
            The proxy is live on <code style={{ background: theme.bg, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>procv-seo-proxy.dripstech.workers.dev</code>. Once you have a domain, plug it in with zero code changes:
          </div>
          <div style={{ background: isDark ? '#0A1018' : '#F8F7F4', borderRadius: 10, padding: '16px 18px', fontFamily: 'monospace', fontSize: 12, color: theme.sub, lineHeight: 1.8, border: `1px solid ${theme.border}` }}>
            <div style={{ color: theme.muted, marginBottom: 4 }}># 1. Add to backend/seo-proxy-worker/wrangler.toml:</div>
            <div style={{ color: theme.gold }}>{'[[routes]]'}</div>
            <div>{'pattern = "procv.com/*"'}</div>
            <div>{'zone_name = "procv.com"'}</div>
            <div style={{ marginTop: 8 }}>{'[[routes]]'}</div>
            <div>{'pattern = "www.procv.com/*"'}</div>
            <div>{'zone_name = "procv.com"'}</div>
            <div style={{ color: theme.muted, marginTop: 12, marginBottom: 4 }}># 2. Deploy:</div>
            <div>{'cd backend/seo-proxy-worker'}</div>
            <div>{'npx wrangler deploy'}</div>
            <div style={{ color: theme.muted, marginTop: 8 }}># CF handles SSL automatically — no cert management needed.</div>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Edge PoPs', value: '300+', sub: 'Cloudflare global network' },
              { label: 'SSL', value: 'Auto', sub: 'CF manages certs' },
              { label: 'Indexed pages', value: `${JOB_SLUGS.length + 1}`, sub: `${JOB_SLUGS.length} job pages + index` },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: theme.gold }}>{value}</div>
                <div style={{ fontSize: 11, color: theme.muted, marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
