/**
 * StorageMapPage.tsx
 *
 * Live audit of ALL browser storage (localStorage, IndexedDB) and the
 * Cloudflare D1 tables that data can be synced to.
 *
 * Sections:
 *   1. localStorage — every key, grouped by category, with size + sync destination
 *   2. IndexedDB    — the 3 databases the app uses and what lives in each
 *   3. CF D1 Tables — existing tables + the 6 new ones from migration 019
 *   4. Sync legend  — explains what's local-only vs. syncable
 */
import React, { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LSEntry {
  key: string;
  rawKey: string;
  sizeBytes: number;
  preview: string;
  category: Category;
  syncDest: SyncDest;
  isLegacy?: boolean;
  isSensitive?: boolean;
}

type Category =
  | 'core-user'
  | 'api-settings'
  | 'auth'
  | 'generation'
  | 'cloud-sync'
  | 'quality'
  | 'ui-prefs'
  | 'temp-cache'
  | 'other';

type SyncDest =
  | 'cf-d1-exists'    // already in CF D1 (profile_cache, custom_templates)
  | 'cf-d1-new'       // can go to CF D1 via migration 019
  | 'drive-only'      // synced to Google Drive only
  | 'device-only'     // stays on this device (e.g. encrypted keys, OAuth tokens)
  | 'evictable';      // pure cache — safe to clear

interface D1TableRow {
  name: string;
  description: string;
  key: string;
  isNew: boolean;
  rowEstimate?: string;
  lsKey?: string;
}

// ─── Key classification map ───────────────────────────────────────────────────

function classify(rawKey: string, val: string): { category: Category; syncDest: SyncDest; isSensitive?: boolean; isLegacy?: boolean } {
  const k = rawKey;

  // Core user data
  if (k === 'cv_builder:profiles')        return { category: 'core-user', syncDest: 'cf-d1-new' };
  if (k === 'cv_builder:activeProfileId') return { category: 'core-user', syncDest: 'cf-d1-new' };

  // Legacy migrated keys
  if (['cv_builder:currentCV','currentCV','cv_builder:savedCVs','savedCVs',
       'cv_builder:savedCoverLetters','savedCoverLetters','cv_builder:trackedApps',
       'trackedApps','cv_builder:starStories','starStories','cv_builder:userProfile',
       'userProfile'].includes(k))
    return { category: 'core-user', syncDest: 'cf-d1-new', isLegacy: true };

  // API settings (encrypted)
  if (k === 'cv_builder:apiSettings')     return { category: 'api-settings', syncDest: 'device-only', isSensitive: true };
  if (k === 'cv_builder:provider_keys')   return { category: 'api-settings', syncDest: 'device-only', isSensitive: true };
  if (k === 'cv_builder:aiProvider')      return { category: 'api-settings', syncDest: 'cf-d1-new' };

  // Google OAuth
  if (k === 'cv_gdrive_token')            return { category: 'auth', syncDest: 'device-only', isSensitive: true };
  if (k === 'cv_gdrive_expiry')           return { category: 'auth', syncDest: 'device-only' };
  if (k === 'cv_gdrive_user')             return { category: 'auth', syncDest: 'device-only' };
  if (k === 'cv_builder:gdrive_migrated') return { category: 'auth', syncDest: 'device-only' };

  // Microsoft OAuth
  if (k === 'cv_builder:ms_access_token') return { category: 'auth', syncDest: 'device-only', isSensitive: true };
  if (k === 'cv_builder:ms_sync_url')     return { category: 'auth', syncDest: 'device-only' };
  if (k === 'cv_builder:ms_user')         return { category: 'auth', syncDest: 'device-only' };

  // Profile cache hashes (D1 sync bookkeeping)
  if (k.startsWith('cv_builder:profile_cache_hash:'))
    return { category: 'cloud-sync', syncDest: 'cf-d1-exists' };

  // Generation preferences
  if (['cv:purpose','cv:jdKeywords','cv:targetCompany','cv:targetJobTitle',
       'cv:angleHistory','cv:last_snapshot','cv_builder:sidebarSections'].includes(k))
    return { category: 'generation', syncDest: 'cf-d1-new' };

  // Tavily (evictable cache, no prefix)
  if (['tavily_usage_v2','tavily_cache_v2','tavily_refresh'].includes(k))
    return { category: 'temp-cache', syncDest: 'evictable' };

  // GitHub config
  if (k === 'cv_builder:githubConfig')    return { category: 'cloud-sync', syncDest: 'device-only', isSensitive: true };
  if (k === 'cv_builder:githubLastSync')  return { category: 'cloud-sync', syncDest: 'device-only' };

  // Drive sync metadata
  if (k.startsWith('cv_drive_mtime:') || k === 'cv_drive_last_sync')
    return { category: 'cloud-sync', syncDest: 'drive-only' };

  // Quality gate
  if (k === 'cv:lastRunIssues')           return { category: 'quality', syncDest: 'evictable' };

  // Account tier cache
  if (k === 'procv:cf_account_tier')      return { category: 'temp-cache', syncDest: 'evictable' };

  // Custom templates (already synced to D1 via custom_templates table)
  if (k === 'cv_builder:customTemplates') return { category: 'core-user', syncDest: 'cf-d1-exists' };

  // Device ID
  if (k === 'cv_builder:deviceId')        return { category: 'cloud-sync', syncDest: 'cf-d1-exists' };

  // PDF merger queue
  if (k === 'cv_builder:merger_queue')    return { category: 'temp-cache', syncDest: 'evictable' };

  // Worker banner dismiss
  if (k === 'procv:worker-status-banner:dismissed-utc-day')
    return { category: 'ui-prefs', syncDest: 'evictable' };

  // Dark mode
  if (k === 'cv_builder:darkMode' || k === 'darkMode')
    return { category: 'ui-prefs', syncDest: 'cf-d1-new' };

  return { category: 'other', syncDest: 'evictable' };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function previewVal(raw: string, isSensitive: boolean): string {
  if (isSensitive) return '••••••••••••••••••';
  if (raw.length <= 80) return raw;
  return raw.slice(0, 77) + '…';
}

// ─── D1 table definitions ─────────────────────────────────────────────────────

const D1_EXISTING: D1TableRow[] = [
  { name: 'verb_pools',           description: 'Action verb pools by category (technical, management, analysis…)',     key: 'verb_pools',           isNew: false, rowEstimate: '~200' },
  { name: 'banned_phrases',       description: 'Banned AI phrases the engine strips from generated output',            key: 'banned_phrases',       isNew: false, rowEstimate: '~150' },
  { name: 'sentence_structures',  description: 'Bullet sentence patterns for rhythm variation',                        key: 'sentence_structures',  isNew: false, rowEstimate: '~80' },
  { name: 'rhythm_patterns',      description: 'Bullet rhythm sequences (short→long→short) by section',                key: 'rhythm_patterns',      isNew: false, rowEstimate: '~40' },
  { name: 'leak_candidates',      description: 'Detected AI-isms that might promote to banned_phrases',                key: 'leak_candidates',      isNew: false, rowEstimate: 'varies' },
  { name: 'telemetry',            description: 'Anonymous generation events (model, latency, quality scores)',          key: 'telemetry',            isNew: false, rowEstimate: 'grows' },
  { name: 'jd_keywords',          description: 'JD keyword frequency data used for ATS gap analysis',                  key: 'jd_keywords',          isNew: false, rowEstimate: 'varies' },
  { name: 'admin_tokens',         description: 'Admin-only API tokens for sync/bulk-add endpoints',                    key: 'admin_tokens',         isNew: false, rowEstimate: '1–5' },
  { name: 'llm_cache',            description: 'SHA-256 keyed LLM response cache (30-day TTL, ≤200KB per entry)',     key: 'llm_cache',            isNew: false, rowEstimate: 'grows', lsKey: '(D1-side only)' },
  { name: 'cv_examples',          description: 'Structural CV blueprints by role fingerprint (bullet rhythm, sizes)',   key: 'cv_examples',          isNew: false, rowEstimate: 'grows' },
  { name: 'profile_cache',        description: 'Compact profile JSON by hash — eliminates profile from prompt payload', key: 'profile_cache',        isNew: false, rowEstimate: 'grows', lsKey: 'cv_builder:profile_cache_hash:<slotId>' },
  { name: 'market_research_cache',description: 'Market research results cached by role+location fingerprint',           key: 'market_research_cache',isNew: false, rowEstimate: 'grows' },
  { name: 'jd_analysis_cache',    description: 'Parsed JD analysis results cached by JD hash',                         key: 'jd_analysis_cache',    isNew: false, rowEstimate: 'grows' },
  { name: 'cv_shares',            description: 'Shareable CV links (short-code → compressed payload)',                  key: 'cv_shares',            isNew: false, rowEstimate: 'grows' },
  { name: 'job_search_cache',     description: 'Job search API results cached by query hash',                           key: 'job_search_cache',     isNew: false, rowEstimate: 'grows' },
  { name: 'cv_events',            description: 'CV generation event stream for analytics dashboard',                    key: 'cv_events',            isNew: false, rowEstimate: 'grows' },
  { name: 'custom_templates',     description: 'User-created custom CV templates (per device_id)',                       key: 'custom_templates',     isNew: false, rowEstimate: 'varies', lsKey: 'cv_builder:customTemplates' },
];

const D1_NEW: D1TableRow[] = [
  { name: 'user_slots',           description: 'Full UserProfile JSON per (device_id, slot_id) — cross-device backup', key: 'user_slots',           isNew: true,  lsKey: 'cv_builder:profiles' },
  { name: 'saved_cvs',            description: 'Individual SavedCV objects with ATS score + job context',               key: 'saved_cvs',            isNew: true,  lsKey: 'cv_builder:profiles[].savedCVs' },
  { name: 'tracked_applications', description: 'Job application tracker rows with status, salary, notes',               key: 'tracked_applications', isNew: true,  lsKey: 'cv_builder:profiles[].trackedApps' },
  { name: 'star_stories',         description: 'STAR interview stories (Situation, Task, Action, Result)',               key: 'star_stories',         isNew: true,  lsKey: 'cv_builder:profiles[].starStories' },
  { name: 'saved_cover_letters',  description: 'Drafted cover letters per slot with tone and target company',            key: 'saved_cover_letters',  isNew: true,  lsKey: 'cv_builder:profiles[].savedCoverLetters' },
  { name: 'user_preferences',     description: 'AI provider, sidebar prefs, CV purpose, target role — one row/device',  key: 'user_preferences',     isNew: true,  lsKey: 'cv_builder:aiProvider + cv:purpose + cv:jdKeywords + …' },
];

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<Category, { label: string; icon: string; color: string }> = {
  'core-user':    { label: 'Core User Data',         icon: '👤', color: '#1B2B4B' },
  'api-settings': { label: 'API Keys & Settings',    icon: '🔑', color: '#92400e' },
  'auth':         { label: 'OAuth / Auth Tokens',    icon: '🔒', color: '#6d28d9' },
  'generation':   { label: 'CV Generation Prefs',   icon: '⚡', color: '#0891b2' },
  'cloud-sync':   { label: 'Cloud Sync Metadata',    icon: '☁️', color: '#374151' },
  'quality':      { label: 'Quality Gate',            icon: '✅', color: '#166534' },
  'ui-prefs':     { label: 'UI Preferences',         icon: '🎨', color: '#9333ea' },
  'temp-cache':   { label: 'Temp Cache (Evictable)', icon: '🗑️', color: '#64748b' },
  'other':        { label: 'Other',                  icon: '📦', color: '#6b7280' },
};

const DEST_META: Record<SyncDest, { label: string; color: string; bg: string }> = {
  'cf-d1-new':    { label: 'CF D1 (new table)',  color: '#15803d', bg: '#f0fdf4' },
  'cf-d1-exists': { label: 'CF D1 (active)',     color: '#1d4ed8', bg: '#eff6ff' },
  'drive-only':   { label: 'Google Drive',       color: '#b45309', bg: '#fffbeb' },
  'device-only':  { label: 'Device only',        color: '#6b7280', bg: '#f9fafb' },
  'evictable':    { label: 'Evictable cache',    color: '#dc2626', bg: '#fef2f2' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StorageMapPage: React.FC = () => {
  const [entries, setEntries] = useState<LSEntry[]>([]);
  const [totalLS, setTotalLS] = useState(0);
  const [expandedCat, setExpandedCat] = useState<Category | null>('core-user');
  const [idbCounts, setIdbCounts] = useState<Record<string, number>>({});
  const [expandedD1, setExpandedD1] = useState(false);

  const scan = useCallback(() => {
    const out: LSEntry[] = [];
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const rawKey = localStorage.key(i);
      if (!rawKey) continue;
      const raw = localStorage.getItem(rawKey) ?? '';
      const sizeBytes = (rawKey.length + raw.length) * 2; // UTF-16 estimate
      total += sizeBytes;
      const { category, syncDest, isSensitive, isLegacy } = classify(rawKey, raw);
      const shortKey = rawKey.startsWith('cv_builder:')
        ? rawKey.slice('cv_builder:'.length)
        : rawKey;
      out.push({
        key: shortKey,
        rawKey,
        sizeBytes,
        preview: previewVal(raw, !!isSensitive),
        category,
        syncDest,
        isSensitive,
        isLegacy,
      });
    }
    out.sort((a, b) => b.sizeBytes - a.sizeBytes);
    setEntries(out);
    setTotalLS(total);
  }, []);

  // Scan IDB record counts (best-effort)
  const scanIdb = useCallback(async () => {
    const counts: Record<string, number> = {};
    const scanDb = (dbName: string, store: string): Promise<number> =>
      new Promise(res => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(store, 'readonly');
            const r2 = tx.objectStore(store).count();
            r2.onsuccess = () => { db.close(); res(r2.result); };
            r2.onerror  = () => { db.close(); res(-1); };
          } catch { db.close(); res(-1); }
        };
        req.onerror = () => res(-1);
      });

    counts['cv_builder_appdata:kv']          = await scanDb('cv_builder_appdata', 'kv');
    counts['cv_builder_keyvault:master']      = await scanDb('cv_builder_keyvault', 'master');
    counts['cv_builder_auth:auth_store']      = await scanDb('cv_builder_auth', 'auth_store');
    setIdbCounts(counts);
  }, []);

  useEffect(() => {
    scan();
    scanIdb();
  }, [scan, scanIdb]);

  // Group entries by category
  const grouped = entries.reduce<Record<Category, LSEntry[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {} as Record<Category, LSEntry[]>);

  const categoryOrder: Category[] = [
    'core-user','api-settings','auth','generation','cloud-sync','quality','ui-prefs','temp-cache','other',
  ];

  const syncStats = {
    d1New:    entries.filter(e => e.syncDest === 'cf-d1-new').length,
    d1Active: entries.filter(e => e.syncDest === 'cf-d1-exists').length,
    driveOnly:entries.filter(e => e.syncDest === 'drive-only').length,
    devOnly:  entries.filter(e => e.syncDest === 'device-only').length,
    evict:    entries.filter(e => e.syncDest === 'evictable').length,
  };
  const sizeD1New = entries.filter(e => e.syncDest === 'cf-d1-new').reduce((s,e) => s + e.sizeBytes, 0);

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#111827', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#1B2B4B', color: '#fff', padding: '24px 32px', borderRadius: '16px 16px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>🗄️</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
            Storage Map
          </h1>
          <span style={{ fontSize: 12, padding: '3px 8px', background: 'rgba(255,255,255,0.12)', borderRadius: 6, fontWeight: 600 }}>
            Live audit
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', maxWidth: 640 }}>
          Every key in localStorage and IndexedDB, their sizes, and where the data can be synced.
          New CF D1 tables (migration 019) add cross-device backup for all user-owned data.
        </p>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'localStorage keys', value: entries.length, color: '#60a5fa' },
            { label: 'Total size', value: fmtBytes(totalLS), color: '#34d399' },
            { label: 'Can sync → CF D1', value: `${syncStats.d1New} keys`, color: '#a78bfa' },
            { label: 'CF D1 active now', value: `${syncStats.d1Active} keys`, color: '#38bdf8' },
            { label: 'Device-only (sensitive)', value: `${syncStats.devOnly} keys`, color: '#fb923c' },
            { label: 'Evictable cache', value: `${syncStats.evict} keys`, color: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ─── Legend ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.entries(DEST_META) as [SyncDest, typeof DEST_META[SyncDest]][]).map(([k,m]) => (
            <span key={k} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: m.bg, color: m.color, border: `1px solid ${m.color}40`, fontWeight: 600 }}>
              {m.label}
            </span>
          ))}
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', fontWeight: 600 }}>
            ⚠ Legacy (migrated)
          </span>
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#fdf2f8', color: '#86198f', border: '1px solid #f0abfc', fontWeight: 600 }}>
            🔒 Sensitive (not shown)
          </span>
        </div>

        {/* ─── localStorage ────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>📦 localStorage</h2>
            <span style={{ fontSize: 13, color: '#64748b' }}>{entries.length} keys · {fmtBytes(totalLS)} used</span>
            <button
              onClick={scan}
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
            >
              ↻ Refresh
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categoryOrder.map(cat => {
              const list = grouped[cat] ?? [];
              if (list.length === 0) return null;
              const meta = CAT_META[cat];
              const catBytes = list.reduce((s,e) => s + e.sizeBytes, 0);
              const isOpen = expandedCat === cat;
              return (
                <div key={cat} style={{ borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
                  {/* Category header */}
                  <button
                    onClick={() => setExpandedCat(isOpen ? null : cat)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px', background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: meta.color }}>{meta.label}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4 }}>
                      {list.length} key{list.length !== 1 ? 's' : ''} · {fmtBytes(catBytes)}
                    </span>
                    {list.some(e => e.syncDest === 'cf-d1-new') && (
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 600, marginLeft: 4 }}>
                        → CF D1
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 18, color: '#9ca3af' }}>{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {/* Expanded rows */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f1f5f9' }}>
                      {list.map(entry => {
                        const destMeta = DEST_META[entry.syncDest];
                        return (
                          <div
                            key={entry.rawKey}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2fr 90px 130px 1fr',
                              gap: 12,
                              padding: '10px 16px',
                              borderBottom: '1px solid #f8fafc',
                              alignItems: 'start',
                              fontSize: 12,
                            }}
                          >
                            {/* Key name */}
                            <div>
                              <code style={{ fontSize: 11.5, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#1e40af', wordBreak: 'break-all' }}>
                                {entry.rawKey}
                              </code>
                              {entry.isLegacy && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: '#fef9c3', color: '#854d0e', borderRadius: 4, fontWeight: 600 }}>legacy</span>
                              )}
                              {entry.isSensitive && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: '#fdf4ff', color: '#7c3aed', borderRadius: 4, fontWeight: 600 }}>encrypted</span>
                              )}
                            </div>
                            {/* Size */}
                            <div style={{ color: '#6b7280', textAlign: 'right', paddingTop: 2 }}>{fmtBytes(entry.sizeBytes)}</div>
                            {/* Sync dest */}
                            <div>
                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: destMeta.bg, color: destMeta.color, border: `1px solid ${destMeta.color}40`, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {destMeta.label}
                              </span>
                            </div>
                            {/* Preview */}
                            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: '#9ca3af', wordBreak: 'break-all', lineHeight: 1.5, paddingTop: 2, maxHeight: 48, overflow: 'hidden' }}>
                              {entry.preview}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── IndexedDB ───────────────────────────────────────────────────── */}
        <section>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>🗃️ IndexedDB Databases</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                db: 'cv_builder_appdata',
                store: 'kv',
                description: 'Mirrors every cv_builder:* localStorage key. Survives "Clear cache" — only wiped by "Clear cookies & site data".',
                syncDest: 'cf-d1-new',
                sensitive: false,
                countKey: 'cv_builder_appdata:kv',
                note: 'Same data as localStorage — backs up all categories above.',
              },
              {
                db: 'cv_builder_keyvault',
                store: 'master',
                description: 'Holds ONE entry: the AES-GCM-256 master CryptoKey JWK used to encrypt API keys at rest. Never synced anywhere by design.',
                syncDest: 'device-only',
                sensitive: true,
                countKey: 'cv_builder_keyvault:master',
                note: 'If this is lost (clear cookies) all encrypted API keys become unreadable — user must re-enter them.',
              },
              {
                db: 'cv_builder_auth',
                store: 'auth_store',
                description: 'Google OAuth PersistedAuthState: accessToken, expiresAt, email, name, picture. Survives "Clear cache".',
                syncDest: 'device-only',
                sensitive: true,
                countKey: 'cv_builder_auth:auth_store',
                note: 'Also mirrored to localStorage as cv_gdrive_token / cv_gdrive_user for fast reads.',
              },
            ].map(idb => {
              const count = idbCounts[idb.countKey];
              const destMeta = DEST_META[idb.syncDest as SyncDest];
              return (
                <div key={idb.db} style={{ borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <code style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13, color: '#1e40af' }}>{idb.db}</code>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>→ store: <code style={{ fontFamily: 'ui-monospace, monospace' }}>{idb.store}</code></span>
                        {count !== undefined && count >= 0 && (
                          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                            {count} record{count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{idb.description}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#f59e0b', fontStyle: 'italic' }}>ℹ {idb.note}</p>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, background: destMeta.bg, color: destMeta.color, border: `1px solid ${destMeta.color}40`, fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start' }}>
                      {destMeta.label}
                    </span>
                    {idb.sensitive && (
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, background: '#fdf4ff', color: '#7c3aed', border: '1px solid #f0abfc', fontWeight: 600, flexShrink: 0, alignSelf: 'flex-start' }}>
                        🔒 Sensitive
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── CF D1 Tables ────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>☁️ Cloudflare D1 Tables</h2>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {D1_EXISTING.length} existing · <span style={{ color: '#15803d', fontWeight: 700 }}>+{D1_NEW.length} new (migration 019)</span>
            </span>
          </div>

          {/* New tables summary box */}
          <div style={{ borderRadius: 10, border: '1.5px solid #bbf7d0', background: '#f0fdf4', padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>🆕</span>
              <strong style={{ color: '#15803d', fontSize: 14 }}>Migration 019 — 6 new tables for user data sync</strong>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#166534' }}>
              File: <code style={{ fontFamily: 'ui-monospace, monospace', background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>backend/cv-engine-worker/migrations/019_user_sync_tables.sql</code>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {D1_NEW.map(t => (
                <span key={t.key} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#fff', border: '1px solid #86efac', color: '#15803d', fontWeight: 600 }}>
                  {t.name}
                </span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#166534' }}>
              Estimated upload: <strong>{fmtBytes(sizeD1New)}</strong> — all data keyed by <code style={{ fontFamily: 'ui-monospace, monospace', background: '#dcfce7', padding: '1px 5px', borderRadius: 3 }}>cv_builder:deviceId</code> as anonymous user identifier.
            </p>
          </div>

          {/* New tables detail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {D1_NEW.map(t => (
              <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, padding: '12px 16px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f9fefb', alignItems: 'start' }}>
                <div>
                  <code style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 12.5, color: '#065f46' }}>{t.name}</code>
                  <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                    ← <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5 }}>{t.lsKey}</code>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{t.description}</div>
              </div>
            ))}
          </div>

          {/* Existing tables (collapsible) */}
          <div style={{ borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedD1(p => !p)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontWeight: 700, fontSize: 13 }}>Existing {D1_EXISTING.length} tables (engine data, caches, analytics)</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, color: '#9ca3af' }}>{expandedD1 ? '▾' : '▸'}</span>
            </button>
            {expandedD1 && (
              <div style={{ borderTop: '1px solid #f1f5f9' }}>
                {D1_EXISTING.map((t, i) => (
                  <div key={t.key} style={{
                    display: 'grid', gridTemplateColumns: '200px 60px 1fr', gap: 12,
                    padding: '10px 16px', borderBottom: i < D1_EXISTING.length - 1 ? '1px solid #f8fafc' : 'none',
                    alignItems: 'start', fontSize: 12,
                  }}>
                    <code style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 11.5, color: '#1e40af' }}>{t.name}</code>
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>{t.rowEstimate}</span>
                    <div>
                      <div style={{ color: '#374151', lineHeight: 1.5 }}>{t.description}</div>
                      {t.lsKey && (
                        <div style={{ marginTop: 3, fontSize: 10.5, color: '#6b7280' }}>
                          ← localStorage: <code style={{ fontFamily: 'ui-monospace, monospace' }}>{t.lsKey}</code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ─── Key insights ─────────────────────────────────────────────────── */}
        <section>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>💡 Key Insights</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {[
              {
                icon: '⚠️',
                title: 'Biggest risk: "Clear cookies & site data"',
                body: 'This wipes BOTH localStorage AND IndexedDB. Without CF D1 sync, all user profiles, CVs, and tracked applications are permanently lost. Migration 019 is the recovery path.',
                bg: '#fef9c3', border: '#fde68a', heading: '#92400e',
              },
              {
                icon: '🔐',
                title: 'API keys are safe from sync',
                body: 'cv_builder:apiSettings is encrypted with AES-GCM-256 via KeyVault (IDB). The master key never leaves the device. Even if CF D1 were breached, API keys would be unreadable.',
                bg: '#fdf4ff', border: '#f0abfc', heading: '#6d28d9',
              },
              {
                icon: '🆔',
                title: 'Anonymous by design',
                body: 'All CF D1 rows use cv_builder:deviceId (a random UUID) as the user identifier — no email, no login required. The same UUID is used by custom_templates and profile_cache already.',
                bg: '#eff6ff', border: '#bfdbfe', heading: '#1d4ed8',
              },
              {
                icon: '🔄',
                title: 'Profile cache is the key enabler',
                body: 'profile_cache (migration 010) already hashes and stores compact profiles in D1, reducing generation prompt size. The new user_slots table stores the full profile for disaster recovery.',
                bg: '#f0fdf4', border: '#bbf7d0', heading: '#15803d',
              },
            ].map(c => (
              <div key={c.title} style={{ borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{c.icon}</span>
                  <strong style={{ fontSize: 13, color: c.heading }}>{c.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
          Storage Map — live read of this browser's storage at page load · Sensitive values are masked · Sizes are UTF-16 estimates
        </div>
      </div>
    </div>
  );
};

export default StorageMapPage;
