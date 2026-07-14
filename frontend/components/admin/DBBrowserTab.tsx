import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminTheme } from './AdminContext';
import { fetchDbBrowse, DB_BROWSABLE_TABLES, DbBrowseResult } from '../../services/cvEngineClient';
import { LoadingBar, ErrorBlock } from './OverviewTab';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtCell(val: any, col: string): { display: string; full: string; isTs: boolean } {
  if (val === null || val === undefined) return { display: '—', full: 'null', isTs: false };
  const s = String(val);
  // Unix timestamp columns
  const isTs = /(_at|_time|created|updated|expires|last_hit|last_seen|last_used|revoked)/.test(col) && typeof val === 'number' && val > 1_000_000_000;
  if (isTs) {
    const d = new Date(val * 1000);
    return { display: d.toISOString().replace('T', ' ').slice(0, 19), full: d.toUTCString(), isTs: true };
  }
  if (typeof val === 'number') return { display: s, full: s, isTs: false };
  if (typeof val === 'boolean' || val === 0 || val === 1) {
    const bool = val === true || val === 1;
    return { display: bool ? '✓' : '✗', full: String(val), isTs: false };
  }
  return { display: s.length > 60 ? s.slice(0, 58) + '…' : s, full: s, isTs: false };
}

const TABLE_ICONS: Record<string, string> = {
  user_identities: '👥',
  user_sessions:   '🔐',
  auth_audit_log:  '📋',
  llm_cache:       '⚡',
  cv_examples:     '📄',
  profile_cache:   '💾',
  cv_admin_tokens: '🗝️',
};

const TABLE_DESCRIPTIONS: Record<string, string> = {
  user_identities: 'Registered users',
  user_sessions:   'Active auth sessions',
  auth_audit_log:  'Sign-in / sign-out events',
  llm_cache:       'Cached AI responses',
  cv_examples:     'CV structural blueprints',
  profile_cache:   'Cached user profiles',
  cv_admin_tokens: 'Admin API tokens',
};

// ── Tooltip cell ─────────────────────────────────────────────────────────────

function Cell({ val, col, theme }: { val: any; col: string; theme: any }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { display, full, isTs } = fmtCell(val, col);
  const truncated = display !== full && display.endsWith('…');

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      <span
        onClick={() => truncated && setOpen(o => !o)}
        style={{
          fontFamily: isTs ? 'inherit' : /id|hash|key|fingerprint/.test(col) ? 'monospace' : 'inherit',
          fontSize: /hash|key|fingerprint/.test(col) ? 10 : 12,
          color: val === null || val === undefined ? theme.muted
               : display === '✓' ? '#4ADE80'
               : display === '✗' ? '#F87171'
               : col === 'plan' ? (val === 'premium' ? theme.gold : theme.text)
               : theme.text,
          cursor: truncated ? 'pointer' : 'default',
          textDecoration: truncated ? 'underline dotted' : 'none',
          whiteSpace: 'nowrap',
        }}
        title={truncated ? 'Click to expand' : full !== display ? full : undefined}
      >
        {display}
      </span>
      {open && (
        <div style={{
          position: 'fixed', zIndex: 9999, background: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: 8, padding: '10px 14px', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          fontSize: 11, fontFamily: 'monospace', color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          top: (ref.current?.getBoundingClientRect().bottom ?? 0) + 6,
          left: (ref.current?.getBoundingClientRect().left ?? 0),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: theme.muted, fontFamily: 'inherit' }}>{col}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          {full}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DBBrowserTab() {
  const { theme } = useAdminTheme();

  const [activeTable, setActiveTable]   = useState<string>(DB_BROWSABLE_TABLES[0]);
  const [data, setData]                 = useState<DbBrowseResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState('');
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [sortCol, setSortCol]           = useState('');
  const [sortOrder, setSortOrder]       = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset]             = useState(0);
  const limit                           = 50;
  const [tableCounts, setTableCounts]   = useState<Record<string, number>>({});
  const searchTimer                     = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (table: string, opts: { search?: string; sort_col?: string; sort_order?: 'asc'|'desc'; offset?: number } = {}) => {
    setLoading(true); setErr('');
    const res = await fetchDbBrowse({
      table,
      limit,
      offset:     opts.offset ?? 0,
      search:     opts.search ?? '',
      sort_col:   opts.sort_col  || undefined,
      sort_order: opts.sort_order || 'desc',
    });
    if (res?.ok) {
      setData(res);
    } else {
      setErr('Failed to load table data.');
    }
    setLoading(false);
  }, []);

  // Load counts for sidebar badges
  useEffect(() => {
    (async () => {
      const counts: Record<string, number> = {};
      await Promise.all(DB_BROWSABLE_TABLES.map(async t => {
        const r = await fetchDbBrowse({ table: t, limit: 1, offset: 0 });
        if (r?.ok) counts[t] = r.total;
      }));
      setTableCounts(counts);
    })();
  }, []);

  // Reload when table changes
  useEffect(() => {
    setSearch(''); setSearchInput(''); setSortCol(''); setSortOrder('desc'); setOffset(0);
    load(activeTable, { offset: 0 });
  }, [activeTable]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setOffset(0);
      load(activeTable, { search, sort_col: sortCol || undefined, sort_order: sortOrder, offset: 0 });
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const handleSort = (col: string) => {
    const nextOrder = col === sortCol && sortOrder === 'desc' ? 'asc' : 'desc';
    setSortCol(col); setSortOrder(nextOrder); setOffset(0);
    load(activeTable, { search, sort_col: col, sort_order: nextOrder, offset: 0 });
  };

  const handlePage = (dir: 'prev' | 'next') => {
    const newOffset = dir === 'next' ? offset + limit : Math.max(0, offset - limit);
    setOffset(newOffset);
    load(activeTable, { search, sort_col: sortCol || undefined, sort_order: sortOrder, offset: newOffset });
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 0 }}>

      {/* ── Left sidebar — table list ─────────────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: `1px solid ${theme.border}`,
        overflowY: 'auto', padding: '20px 0',
        background: theme.sidebarBg ?? theme.card,
      }}>
        <div style={{ padding: '0 16px 12px', fontSize: 10, fontWeight: 700, color: theme.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          D1 Tables
        </div>
        {DB_BROWSABLE_TABLES.map(t => {
          const active = t === activeTable;
          return (
            <button key={t} onClick={() => setActiveTable(t)} style={{
              width: '100%', textAlign: 'left', padding: '9px 16px',
              background: active ? (theme.sidebarBg ? 'rgba(255,255,255,0.08)' : theme.bg) : 'transparent',
              border: 'none', borderLeft: active ? `3px solid ${theme.gold}` : '3px solid transparent',
              cursor: 'pointer', transition: 'background 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div>
                  <span style={{ marginRight: 6 }}>{TABLE_ICONS[t] || '📊'}</span>
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? theme.gold : theme.text }}>
                    {t.replace(/_/g, '_\u200B')}
                  </span>
                </div>
                {tableCounts[t] != null && (
                  <span style={{ fontSize: 10, color: theme.muted, background: theme.bg, padding: '1px 5px', borderRadius: 10, border: `1px solid ${theme.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {tableCounts[t].toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: theme.muted, marginTop: 2, paddingLeft: 22 }}>
                {TABLE_DESCRIPTIONS[t]}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Right panel — table contents ──────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px 12px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
              {TABLE_ICONS[activeTable]} {activeTable}
            </div>
            <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>
              {data ? `${data.total.toLocaleString()} rows` : '—'}
              {data?.redacted.length ? ` · ${data.redacted.join(', ')} redacted` : ''}
              {data?.truncated.length ? ` · ${data.truncated.join(', ')} truncated` : ''}
            </div>
          </div>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearch(e.target.value); }}
              placeholder={`Search ${activeTable}…`}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: 12, width: 220, outline: 'none' }}
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.card, color: theme.muted, fontSize: 11, cursor: 'pointer' }}>
                Clear
              </button>
            )}
            <button onClick={() => load(activeTable, { search, sort_col: sortCol || undefined, sort_order: sortOrder, offset })}
              style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.card, color: theme.text, fontSize: 11, cursor: 'pointer' }}>
              ↺ Refresh
            </button>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && <LoadingBar />}
        {err && !loading && <div style={{ padding: '12px 24px' }}><ErrorBlock msg={err} /></div>}

        {/* Table */}
        {data && !loading && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: theme.card, position: 'sticky', top: 0, zIndex: 2 }}>
                  {data.columns.map(col => {
                    const isSorted = col === sortCol;
                    const isRedacted = data.redacted.includes(col);
                    return (
                      <th key={col}
                        onClick={() => !isRedacted && handleSort(col)}
                        style={{
                          padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                          color: isSorted ? theme.gold : theme.sub,
                          letterSpacing: '0.07em', textTransform: 'uppercase',
                          borderBottom: `2px solid ${theme.border}`,
                          cursor: isRedacted ? 'default' : 'pointer',
                          whiteSpace: 'nowrap', userSelect: 'none',
                          background: theme.card,
                        }}
                      >
                        {col}
                        {isSorted && <span style={{ marginLeft: 4 }}>{sortOrder === 'desc' ? '↓' : '↑'}</span>}
                        {isRedacted && <span style={{ marginLeft: 4, fontSize: 9, color: '#F87171' }}>🔒</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={data.columns.length} style={{ padding: '40px', textAlign: 'center', color: theme.muted, fontSize: 13 }}>
                    No rows{search ? ` matching "${search}"` : ''}.
                  </td></tr>
                )}
                {data.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.border}`, background: i % 2 === 0 ? 'transparent' : (theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') }}>
                    {data.columns.map(col => (
                      <td key={col} style={{ padding: '7px 14px', verticalAlign: 'top', maxWidth: 260, overflow: 'hidden' }}>
                        <Cell val={row[col]} col={col} theme={{ ...theme, isDark: theme.bg === '#0C1420' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {data && data.total > limit && (
          <div style={{ padding: '10px 24px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: theme.card }}>
            <button onClick={() => handlePage('prev')} disabled={offset === 0}
              style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.bg, color: offset === 0 ? theme.muted : theme.text, cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: 12 }}>
              ← Prev
            </button>
            <span style={{ fontSize: 12, color: theme.sub }}>
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; rows {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total.toLocaleString()}
            </span>
            <button onClick={() => handlePage('next')} disabled={offset + limit >= data.total}
              style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.bg, color: offset + limit >= data.total ? theme.muted : theme.text, cursor: offset + limit >= data.total ? 'not-allowed' : 'pointer', fontSize: 12 }}>
              Next →
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: theme.muted }}>
              {data.redacted.length > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)', fontSize: 10, fontWeight: 600 }}>
                  🔒 {data.redacted.join(', ')} hidden
                </span>
              )}
              {data.truncated.length > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(201,168,76,0.12)', color: theme.gold, border: `1px solid rgba(201,168,76,0.25)`, fontSize: 10, fontWeight: 600 }}>
                  ✂ {data.truncated.join(', ')} truncated
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
