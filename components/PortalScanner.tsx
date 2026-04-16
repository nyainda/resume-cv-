import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  PRESET_COMPANIES, COMPANY_CATEGORIES, scanMultipleCompanies, scanCustomUrl,
  PortalJob, CompanyCategory,
} from '../services/portalScannerService';
import { useLocalStorage } from '../hooks/useLocalStorage';

// ── Portal badge config ────────────────────────────────────────────────────────
const PORTAL_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  greenhouse: { label: 'Greenhouse', bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  lever:      { label: 'Lever',      bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  ashby:      { label: 'Ashby',      bg: '#ede9fe', text: '#7c3aed', dot: '#8b5cf6' },
  workday:    { label: 'Workday',    bg: '#ffedd5', text: '#c2410c', dot: '#f97316' },
  custom:     { label: 'Direct',     bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
  web:        { label: 'Web',        bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};
const PORTAL_META_DARK: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  greenhouse: { label: 'Greenhouse', bg: '#052e16', text: '#4ade80', dot: '#22c55e' },
  lever:      { label: 'Lever',      bg: '#1e3a5f', text: '#60a5fa', dot: '#3b82f6' },
  ashby:      { label: 'Ashby',      bg: '#2e1065', text: '#a78bfa', dot: '#8b5cf6' },
  workday:    { label: 'Workday',    bg: '#431407', text: '#fb923c', dot: '#f97316' },
  custom:     { label: 'Direct',     bg: '#1f2937', text: '#9ca3af', dot: '#6b7280' },
  web:        { label: 'Web',        bg: '#1f2937', text: '#9ca3af', dot: '#6b7280' },
};

const CATEGORY_ICONS: Record<string, string> = {
  'AI & ML': '🤖', 'Big Tech': '🏢', 'Cloud & DevOps': '☁️', 'Finance & Fintech': '💳',
  'SaaS & Productivity': '⚡', 'Security': '🔒', 'Data & Analytics': '📊',
  'E-Commerce & Marketplace': '🛍️', 'Gaming & Media': '🎮', 'Automotive & Hardware': '🚗',
  'Healthcare & Biotech': '🧬', 'Crypto & Web3': '🔗', 'Social & Consumer': '💬',
  'Startups & Unicorns': '🦄',
};

const COMPANY_COLORS = [
  ['#4f46e5', '#7c3aed'], ['#0ea5e9', '#0284c7'], ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'], ['#ef4444', '#dc2626'], ['#ec4899', '#db2777'],
  ['#8b5cf6', '#6d28d9'], ['#06b6d4', '#0891b2'],
];
const companyColor = (name: string) => COMPANY_COLORS[name.charCodeAt(0) % COMPANY_COLORS.length];

interface Props {
  tavilyApiKey: string | null;
  openSettings: () => void;
  darkMode?: boolean;
}

type SortKey = 'default' | 'company' | 'title';

const PortalScanner: React.FC<Props> = ({ tavilyApiKey, openSettings, darkMode = false }) => {
  // ── Persistent state ──────────────────────────────────────────────────────
  const [role, setRole]             = useLocalStorage<string>('scanner:role', '');
  const [customUrl, setCustomUrl]   = useLocalStorage<string>('scanner:customUrl', '');
  const [selectedArr, setSelectedArr] = useLocalStorage<string[]>('scanner:selected', PRESET_COMPANIES.slice(0, 10).map(c => c.company));
  const [results, setResults]       = useLocalStorage<PortalJob[]>('scanner:results', []);
  const [lastScanRole, setLastScanRole] = useLocalStorage<string>('scanner:lastRole', '');
  const [lastScanTime, setLastScanTime] = useLocalStorage<string>('scanner:lastTime', '');
  const [savedIds, setSavedIds]     = useLocalStorage<string[]>('scanner:saved', []);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<CompanyCategory | 'All'>('All');
  const [companySearch, setCompanySearch]   = useState('');
  const [resultSearch, setResultSearch]     = useState('');
  const [scanning, setScanning]             = useState(false);
  const [progress, setProgress]             = useState<{ company: string; done: number; total: number } | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [sortKey, setSortKey]               = useState<SortKey>('default');
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [portalFilter, setPortalFilter]     = useState<string>('all');
  const [showSaved, setShowSaved]           = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [mobileConfigOpen, setMobileConfigOpen] = useState(true);
  const [showScrollTop, setShowScrollTop]   = useState(false);

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selected  = useMemo(() => new Set(selectedArr), [selectedArr]);
  const savedSet  = useMemo(() => new Set(savedIds), [savedIds]);
  const pm        = (source: string) => darkMode ? (PORTAL_META_DARK[source] || PORTAL_META_DARK['custom']) : (PORTAL_META[source] || PORTAL_META['custom']);

  // Window scroll for back-to-top
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Company filtering ─────────────────────────────────────────────────────
  const visibleCompanies = useMemo(() => {
    let list = PRESET_COMPANIES;
    if (activeCategory !== 'All') list = list.filter(c => c.category === activeCategory);
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase();
      list = list.filter(c => c.company.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, companySearch]);

  const toggleCompany   = useCallback((company: string) => setSelectedArr(prev => { const s = new Set(prev); if (s.has(company)) s.delete(company); else s.add(company); return Array.from(s); }), [setSelectedArr]);
  const selectAll       = () => setSelectedArr(PRESET_COMPANIES.map(c => c.company));
  const selectNone      = () => setSelectedArr([]);
  const selectVisible   = () => setSelectedArr(prev => { const s = new Set(prev); visibleCompanies.forEach(c => s.add(c.company)); return Array.from(s); });
  const deselectVisible = () => setSelectedArr(prev => { const s = new Set(prev); visibleCompanies.forEach(c => s.delete(c.company)); return Array.from(s); });
  const toggleSave      = (id: string) => setSavedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return Array.from(s); });

  // ── Scan ─────────────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (!role.trim())  { setError('Enter a role title to search for.'); return; }
    if (!tavilyApiKey) { openSettings(); return; }
    if (selected.size === 0 && !customUrl) { setError('Select at least one company or enter a custom URL.'); return; }

    setScanning(true); setError(null); setResults([]);
    setPortalFilter('all'); setSortKey('default'); setGroupByCompany(false);

    try {
      const all: PortalJob[] = [];
      if (customUrl) {
        try { all.push(...await scanCustomUrl(customUrl, role, tavilyApiKey)); } catch {}
      }
      const targets = PRESET_COMPANIES.filter(c => selected.has(c.company));
      if (targets.length > 0) {
        all.push(...await scanMultipleCompanies(targets, role, tavilyApiKey, (company, done, total) => setProgress({ company, done, total })));
      }
      setResults(all);
      setLastScanRole(role);
      setLastScanTime(new Date().toLocaleString());
      setExpandedGroups(new Set([...new Set(all.map(j => j.company))]));
      setMobileConfigOpen(false);
    } catch (e: any) {
      setError(e.message || 'Scan failed.');
    } finally {
      setScanning(false); setProgress(null);
    }
  };

  // ── Filtered results ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = showSaved ? results.filter(j => savedSet.has(j.id)) : results;
    if (portalFilter !== 'all') list = list.filter(j => j.source === portalFilter);
    if (resultSearch.trim()) {
      const q = resultSearch.toLowerCase();
      list = list.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q));
    }
    if (sortKey === 'company') list = [...list].sort((a, b) => a.company.localeCompare(b.company));
    if (sortKey === 'title')   list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [results, resultSearch, portalFilter, sortKey, showSaved, savedSet]);

  const portalCounts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    results.forEach(j => { c[j.source] = (c[j.source] || 0) + 1; });
    return c;
  }, [results]);

  const grouped = useMemo(() => {
    const map: Record<string, PortalJob[]> = {};
    filtered.forEach(j => { (map[j.company] = map[j.company] || []).push(j); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = { All: PRESET_COMPANIES.length };
    PRESET_COMPANIES.forEach(c => { m[c.category] = (m[c.category] || 0) + 1; });
    return m;
  }, []);

  const selectedInView = visibleCompanies.filter(c => selected.has(c.company)).length;

  // ── Style helpers ─────────────────────────────────────────────────────────
  const surfaceBg   = darkMode ? '#1a1a1a' : '#ffffff';
  const surfaceBord = darkMode ? '#2a2a2a' : '#e5e7eb';
  const pageBg      = darkMode ? '#111'    : '#f8fafc';
  const textPri     = darkMode ? '#f3f4f6' : '#111827';
  const textMuted   = darkMode ? '#6b7280' : '#6b7280';
  const textSub     = darkMode ? '#4b5563' : '#9ca3af';
  const inputBg     = darkMode ? '#0c0c0c' : '#f9fafb';
  const inputBord   = darkMode ? '#333'    : '#e5e7eb';
  const hoverBg     = darkMode ? '#222'    : '#f3f4f6';
  const Y           = '#EBFF38';

  const chipStyle = (active: boolean, accentBg?: string, accentText?: string) => ({
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    border: `1px solid ${active ? (accentBg ? 'transparent' : '#333') : surfaceBord}`,
    background: active ? (accentBg ?? '#111') : (darkMode ? '#1f1f1f' : '#f3f4f6'),
    color: active ? (accentText ?? Y) : textMuted,
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.15s',
  });

  return (
    <div style={{ background: pageBg }}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-5 flex flex-wrap items-end justify-between gap-3"
        style={{ borderBottom: `1px solid ${surfaceBord}`, background: surfaceBg }}>
        <div>
          <h2 className="text-xl sm:text-2xl font-black" style={{ color: textPri, letterSpacing: '-0.03em' }}>
            Job Portal Scanner
          </h2>
          <p className="text-sm mt-0.5" style={{ color: textMuted }}>
            Scan <span className="font-bold" style={{ color: darkMode ? Y : '#111' }}>{PRESET_COMPANIES.length}+</span> company
            portals across Greenhouse, Ashby, Lever &amp; more.
          </p>
        </div>
        {lastScanTime && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Last scan</p>
            <p className="text-xs font-bold" style={{ color: textPri }}>{lastScanRole}</p>
            <p className="text-[11px]" style={{ color: textMuted }}>{lastScanTime}</p>
          </div>
        )}
      </div>

      {/* ── Body: sidebar + results ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 lg:sticky lg:top-0"
          style={{
            borderRight: `1px solid ${surfaceBord}`,
            maxHeight: 'calc(100vh - 0px)',
            overflowY: 'auto',
          }}>

          {/* Mobile: collapsible toggle */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 lg:hidden"
            style={{ background: surfaceBg, borderBottom: `1px solid ${surfaceBord}` }}
            onClick={() => setMobileConfigOpen(v => !v)}
          >
            <span className="text-sm font-black" style={{ color: textPri }}>
              {mobileConfigOpen ? '▲ Scan Configuration' : '▼ Configure Scan'}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#111', color: Y }}>
              {selected.size} companies
            </span>
          </button>

          <div className={`${mobileConfigOpen ? 'block' : 'hidden'} lg:block`}>

            {/* ── Scan config ─────────────────────────────────────────────── */}
            <div className="p-4 space-y-3" style={{ borderBottom: `1px solid ${surfaceBord}`, background: surfaceBg }}>
              {/* Role */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: textMuted }}>
                  Target Role *
                </label>
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScan()}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2"
                  style={{ background: inputBg, border: `1.5px solid ${inputBord}`, color: textPri }}
                />
              </div>

              {/* Custom URL */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: textMuted }}>
                  Custom Career Page
                </label>
                <input
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://company.com/careers"
                  className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none"
                  style={{ background: inputBg, border: `1.5px solid ${inputBord}`, color: textPri }}
                />
              </div>

              {/* API key warning */}
              {!tavilyApiKey && (
                <div className="flex items-start gap-2.5 rounded-xl p-3"
                  style={{ background: '#fefce8', border: '1px solid #fde047' }}>
                  <span className="text-sm">🔑</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#92400e' }}>Tavily API key required</p>
                    <button onClick={openSettings} className="text-xs underline mt-0.5" style={{ color: '#b45309' }}>Add in Settings →</button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}>
                  <span className="text-sm flex-shrink-0">⚠️</span>
                  <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>
                </div>
              )}

              {/* Progress */}
              {scanning && progress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-xs truncate max-w-[160px] font-medium" style={{ color: textPri }}>{progress.company}</span>
                    <span className="text-xs font-black font-mono" style={{ color: textPri }}>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: inputBg }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(progress.done / progress.total) * 100}%`, background: Y }} />
                  </div>
                  <p className="text-[10px] text-center" style={{ color: textMuted }}>{results.length} jobs found so far…</p>
                </div>
              )}

              {/* Scan button */}
              <button
                onClick={handleScan}
                disabled={scanning}
                className="w-full py-3 font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all"
                style={{
                  background: scanning ? (darkMode ? '#222' : '#e5e7eb') : '#111',
                  color: scanning ? textMuted : Y,
                  cursor: scanning ? 'not-allowed' : 'pointer',
                  border: '2px solid #222',
                }}
              >
                {scanning ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Scanning {progress?.done ?? 0}/{selected.size}…</>
                ) : (
                  <>🔍 Scan {selected.size} {selected.size === 1 ? 'Company' : 'Companies'}</>
                )}
              </button>
            </div>

            {/* ── Company selector ────────────────────────────────────────── */}
            <div style={{ background: surfaceBg }}>
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${surfaceBord}` }}>
                <div>
                  <p className="text-xs font-black" style={{ color: textPri }}>Companies</p>
                  <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>{selected.size}/{PRESET_COMPANIES.length} selected</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={selectAll} style={chipStyle(false)}>All</button>
                  <button onClick={selectNone} style={chipStyle(false)}>None</button>
                </div>
              </div>

              {/* Search */}
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${surfaceBord}` }}>
                <div className="relative">
                  <svg className="absolute left-2.5 top-2 h-3.5 w-3.5" style={{ color: textMuted }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input value={companySearch} onChange={e => setCompanySearch(e.target.value)}
                    placeholder="Search companies…" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg focus:outline-none"
                    style={{ background: inputBg, border: `1px solid ${inputBord}`, color: textPri }} />
                </div>
              </div>

              {/* Category pills */}
              <div className="px-3 py-2" style={{ borderBottom: `1px solid ${surfaceBord}` }}>
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  <button onClick={() => setActiveCategory('All')} style={chipStyle(activeCategory === 'All')}>
                    All ({categoryCounts['All']})
                  </button>
                  {COMPANY_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)} style={chipStyle(activeCategory === cat)}>
                      {CATEGORY_ICONS[cat]} {cat.split(' & ')[0]} ({categoryCounts[cat] || 0})
                    </button>
                  ))}
                </div>
              </div>

              {/* Select visible row */}
              {activeCategory !== 'All' && (
                <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${surfaceBord}` }}>
                  <span className="text-[10px]" style={{ color: textMuted }}>{selectedInView}/{visibleCompanies.length} in view</span>
                  <div className="flex gap-3">
                    <button onClick={selectVisible} className="text-[10px] font-bold hover:underline" style={{ color: darkMode ? Y : '#111' }}>+ Select all</button>
                    <button onClick={deselectVisible} className="text-[10px] font-bold hover:underline" style={{ color: textMuted }}>− Deselect</button>
                  </div>
                </div>
              )}

              {/* Company list — scrollable within sidebar */}
              <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                {visibleCompanies.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: textMuted }}>No companies match.</p>
                ) : visibleCompanies.map(c => {
                  const isSelected = selected.has(c.company);
                  const meta = PORTAL_META[c.portal || 'custom'];
                  return (
                    <label key={c.company} className="flex items-center gap-2.5 py-2 px-4 cursor-pointer"
                      style={{
                        background: isSelected ? (darkMode ? '#1a1a00' : '#fafff0') : 'transparent',
                        borderLeft: isSelected ? `2px solid ${Y}` : '2px solid transparent',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                        style={{ background: isSelected ? Y : 'transparent', border: `1.5px solid ${isSelected ? Y : (darkMode ? '#444' : '#d1d5db')}` }}>
                        {isSelected && <svg className="w-2.5 h-2.5" viewBox="0 0 10 8" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 5-6" /></svg>}
                      </div>
                      <input type="checkbox" className="sr-only" checked={isSelected} onChange={() => toggleCompany(c.company)} />
                      <span className="text-xs flex-1 font-medium truncate" style={{ color: isSelected ? textPri : textMuted }}>{c.company}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: meta?.bg, color: meta?.text }}>{meta?.label}</span>
                    </label>
                  );
                })}
              </div>

              {/* Quick preset buttons */}
              <div className="px-4 py-3 flex flex-wrap gap-1.5" style={{ borderTop: `1px solid ${surfaceBord}` }}>
                <p className="w-full text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>Quick presets</p>
                {['AI & ML', 'Big Tech', 'Finance & Fintech', 'SaaS & Productivity', 'Security', 'Data & Analytics'].map(cat => (
                  <button key={cat} onClick={() => { setSelectedArr(PRESET_COMPANIES.filter(c => c.category === cat).map(c => c.company)); setActiveCategory(cat as CompanyCategory); }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all hover:scale-105"
                    style={{ background: darkMode ? '#1f1f1f' : '#f3f4f6', color: textMuted, border: `1px solid ${surfaceBord}` }}>
                    {CATEGORY_ICONS[cat]} {cat.split(' & ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: RESULTS AREA ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {results.length > 0 ? (
            <>
              {/* ── Sticky results toolbar ──────────────────────────────── */}
              <div className="sticky top-0 z-10 px-4 sm:px-5 py-3 space-y-3"
                style={{ background: surfaceBg, borderBottom: `1px solid ${surfaceBord}` }}>

                {/* Row 1: search + count + controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <svg className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: textMuted }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input value={resultSearch} onChange={e => setResultSearch(e.target.value)}
                      placeholder="Search title, company, location…"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl focus:outline-none"
                      style={{ background: inputBg, border: `1.5px solid ${inputBord}`, color: textPri }} />
                  </div>

                  {/* Job count */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-black text-2xl" style={{ color: textPri, letterSpacing: '-0.04em' }}>{filtered.length}</span>
                    <span className="text-xs leading-tight" style={{ color: textMuted }}>jobs<br />found</span>
                  </div>

                  {/* Sort */}
                  <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                    className="text-xs font-bold rounded-lg py-2 px-2.5 focus:outline-none cursor-pointer"
                    style={{ background: inputBg, border: `1px solid ${inputBord}`, color: textPri }}>
                    <option value="default">Default</option>
                    <option value="company">Company A–Z</option>
                    <option value="title">Title A–Z</option>
                  </select>

                  {/* Group toggle */}
                  <button onClick={() => setGroupByCompany(g => !g)} style={chipStyle(groupByCompany)}>⊞ Group</button>

                  {/* Saved toggle */}
                  <button onClick={() => setShowSaved(s => !s)} style={chipStyle(showSaved)}>
                    {savedSet.size > 0 ? `★ ${savedSet.size}` : '☆ Saved'}
                  </button>

                  {/* Clear */}
                  <button onClick={() => { setResults([]); setLastScanRole(''); setLastScanTime(''); }}
                    className="text-xs font-bold px-2.5 py-2 rounded-lg"
                    style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fca5a5' }}>✕</button>
                </div>

                {/* Row 2: Portal filter chips */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-wrap sm:flex-nowrap" style={{ scrollbarWidth: 'none' }}>
                  <button onClick={() => setPortalFilter('all')} style={chipStyle(portalFilter === 'all')}>All ({results.length})</button>
                  {Object.entries(portalCounts).filter(([k]) => k !== 'all').map(([source, count]) => {
                    const meta = pm(source);
                    return (
                      <button key={source} onClick={() => setPortalFilter(source === portalFilter ? 'all' : source)}
                        style={{
                          ...chipStyle(portalFilter === source, meta.bg, meta.text),
                          border: `1px solid ${portalFilter === source ? meta.dot : surfaceBord}`,
                        }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: meta.dot }} />
                        {meta.label} {count}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Company jump nav (when grouped) ─────────────────────── */}
              {groupByCompany && grouped.length > 1 && (
                <div className="px-4 sm:px-5 py-2.5 flex gap-2 overflow-x-auto flex-wrap"
                  style={{ borderBottom: `1px solid ${surfaceBord}`, background: pageBg, scrollbarWidth: 'none' }}>
                  <span className="text-[10px] font-black uppercase tracking-widest self-center mr-1" style={{ color: textMuted }}>Jump:</span>
                  {grouped.map(([company, jobs]) => {
                    const [c1] = companyColor(company);
                    return (
                      <button key={company} onClick={() => groupRefs.current[company]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                        style={{ background: c1 + '22', color: c1, border: `1px solid ${c1}44` }}>
                        {company.split(' ')[0]} <span className="font-black">{jobs.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Results list ─────────────────────────────────────────── */}
              <div className="p-4 sm:p-5 space-y-3">
                {filtered.length === 0 ? (
                  <div className="py-16 flex flex-col items-center text-center">
                    <div className="text-4xl mb-4">🔍</div>
                    <p className="font-bold text-sm" style={{ color: textPri }}>No results match your filter</p>
                    <p className="text-xs mt-1" style={{ color: textMuted }}>Try clearing the search or changing the portal filter</p>
                  </div>
                ) : groupByCompany ? (
                  grouped.map(([company, jobs]) => {
                    const [c1] = companyColor(company);
                    const isExpanded = expandedGroups.has(company);
                    return (
                      <div key={company} ref={el => { groupRefs.current[company] = el; }}>
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all text-left"
                          style={{ background: c1 + '15', border: `1px solid ${c1}30` }}
                          onClick={() => setExpandedGroups(prev => { const s = new Set(prev); if (s.has(company)) s.delete(company); else s.add(company); return s; })}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: c1 }}>
                            {company.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-left" style={{ color: textPri }}>{company}</p>
                          </div>
                          <span className="text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: c1 }}>
                            {jobs.length} job{jobs.length > 1 ? 's' : ''}
                          </span>
                          <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: textMuted, transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="space-y-2 ml-0 sm:ml-4 mb-4">
                            {jobs.map(job => <JobCard key={job.id} job={job} saved={savedSet.has(job.id)} onToggleSave={toggleSave} pm={pm} darkMode={darkMode} textPri={textPri} textMuted={textMuted} textSub={textSub} surfaceBg={surfaceBg} surfaceBord={surfaceBord} Y={Y} compact />)}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  filtered.map(job => <JobCard key={job.id} job={job} saved={savedSet.has(job.id)} onToggleSave={toggleSave} pm={pm} darkMode={darkMode} textPri={textPri} textMuted={textMuted} textSub={textSub} surfaceBg={surfaceBg} surfaceBord={surfaceBord} Y={Y} />)
                )}
              </div>
            </>
          ) : (
            /* ── Empty / scanning ─────────────────────────────────────────── */
            <div className="px-4 sm:px-8 py-12 sm:py-20 flex flex-col items-center text-center">
              {scanning ? (
                <>
                  <div className="relative mb-8">
                    <div className="w-20 h-20 rounded-full border-4 animate-spin"
                      style={{ borderColor: `${Y}33`, borderTopColor: Y }} />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">🔍</div>
                  </div>
                  <p className="text-xl font-black mb-2" style={{ color: textPri, letterSpacing: '-0.02em' }}>
                    {progress ? `Scanning ${progress.company}` : 'Starting scan…'}
                  </p>
                  {progress && (
                    <>
                      <p className="text-sm mb-6" style={{ color: textMuted }}>{progress.done} of {progress.total} portals checked</p>
                      <div className="w-56 sm:w-72 h-2 rounded-full overflow-hidden mb-2" style={{ background: darkMode ? '#222' : '#e5e7eb' }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(progress.done / progress.total) * 100}%`, background: Y }} />
                      </div>
                      <p className="text-sm font-black" style={{ color: textPri }}>{results.length} jobs found so far</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5"
                    style={{ background: darkMode ? '#1a1a00' : '#fafff0', border: `2px solid ${Y}44` }}>🔭</div>
                  <h3 className="text-lg sm:text-xl font-black mb-2" style={{ color: textPri, letterSpacing: '-0.02em' }}>
                    Ready to scan {PRESET_COMPANIES.length}+ portals
                  </h3>
                  <p className="text-sm max-w-sm leading-relaxed mb-8" style={{ color: textMuted }}>
                    Select companies on the left, enter your target role, and hit Scan. Results are saved automatically.
                  </p>
                  {/* Portal badges */}
                  <div className="flex flex-wrap gap-2 justify-center mb-6">
                    {Object.entries(PORTAL_META).slice(0, 5).map(([key, meta]) => (
                      <span key={key} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.dot}44` }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: meta.dot }} />{meta.label}
                      </span>
                    ))}
                  </div>
                  {/* Sample stats */}
                  <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                    {[['150+', 'portals'], ['14', 'industries'], ['0€', 'cost']].map(([v, l]) => (
                      <div key={l} className="rounded-xl p-3 text-center"
                        style={{ background: surfaceBg, border: `1px solid ${surfaceBord}` }}>
                        <p className="font-black text-lg" style={{ color: textPri, letterSpacing: '-0.03em' }}>{v}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>{l}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed scroll-to-top button ──────────────────────────────────────── */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-50"
          style={{ background: '#111', color: Y, border: `2px solid ${Y}` }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
};

// ── Job Card ───────────────────────────────────────────────────────────────────
interface JobCardProps {
  job: PortalJob;
  saved: boolean;
  onToggleSave: (id: string) => void;
  pm: (source: string) => { label: string; bg: string; text: string; dot: string };
  darkMode: boolean;
  textPri: string;
  textMuted: string;
  textSub: string;
  surfaceBg: string;
  surfaceBord: string;
  Y: string;
  compact?: boolean;
}

const JobCard: React.FC<JobCardProps> = ({ job, saved, onToggleSave, pm, darkMode, textPri, textMuted, textSub, surfaceBg, surfaceBord, Y, compact }) => {
  const [hovered, setHovered] = useState(false);
  const badge = pm(job.source);
  const [c1, c2] = companyColor(job.company);

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className="rounded-xl transition-all"
      style={{
        background: surfaceBg,
        border: `1px solid ${hovered ? Y + '66' : surfaceBord}`,
        boxShadow: hovered ? `0 2px 12px ${Y}18` : 'none',
        transition: 'all 0.15s ease',
      }}>
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Avatar — hidden in compact mode */}
          {!compact && (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0 hidden sm:flex"
              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              {job.company.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* Title + actions row */}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black leading-snug" style={{ color: textPri, letterSpacing: '-0.01em' }}>
                  {job.title}
                </h4>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {!compact && <span className="text-xs font-bold" style={{ color: c1 }}>{job.company}</span>}
                  {job.location && (
                    <span className="text-xs flex items-center gap-0.5" style={{ color: textMuted }}>
                      {!compact && <span style={{ color: darkMode ? '#444' : '#d1d5db' }}>·</span>}
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {job.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: badge.bg, color: badge.text }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.dot }} />{badge.label}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onToggleSave(job.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all"
                  style={{ background: saved ? '#fefce8' : 'transparent', color: saved ? '#d97706' : textMuted, border: `1px solid ${saved ? '#fde68a' : surfaceBord}` }}>
                  {saved ? '★' : '☆'}
                </button>
                <a href={job.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 font-black text-xs rounded-lg transition-all hover:scale-105"
                  style={{ background: '#111', color: Y, letterSpacing: '-0.01em' }}>
                  Apply
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Snippet */}
            {job.snippet && (
              <p className="text-xs leading-relaxed mt-1.5 line-clamp-2" style={{ color: textMuted }}>{job.snippet}</p>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: textSub }}>Found {job.dateFound}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalScanner;
