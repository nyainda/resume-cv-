import React, { useState, useMemo, useCallback } from 'react';
import {
  PRESET_COMPANIES, COMPANY_CATEGORIES, scanMultipleCompanies, scanCustomUrl,
  PortalJob, CompanyCategory,
} from '../services/portalScannerService';
import { useLocalStorage } from '../hooks/useLocalStorage';

// ── Portal badge config ───────────────────────────────────────────────────────
const PORTAL_META: Record<string, { label: string; color: string; dot: string }> = {
  greenhouse: { label: 'Greenhouse', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800', dot: 'bg-emerald-500' },
  lever:      { label: 'Lever',      color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',           dot: 'bg-blue-500' },
  ashby:      { label: 'Ashby',      color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800', dot: 'bg-violet-500' },
  workday:    { label: 'Workday',    color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800', dot: 'bg-orange-500' },
  custom:     { label: 'Direct',     color: 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-neutral-700 dark:text-zinc-400 dark:border-neutral-600',          dot: 'bg-zinc-400' },
  web:        { label: 'Web',        color: 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-neutral-700 dark:text-zinc-400 dark:border-neutral-600',          dot: 'bg-zinc-400' },
};

const CATEGORY_ICONS: Record<string, string> = {
  'AI & ML': '🤖', 'Big Tech': '🏢', 'Cloud & DevOps': '☁️', 'Finance & Fintech': '💳',
  'SaaS & Productivity': '⚡', 'Security': '🔒', 'Data & Analytics': '📊',
  'E-Commerce & Marketplace': '🛍️', 'Gaming & Media': '🎮', 'Automotive & Hardware': '🚗',
  'Healthcare & Biotech': '🧬', 'Crypto & Web3': '🔗', 'Social & Consumer': '💬',
  'Startups & Unicorns': '🦄',
};

interface Props {
  tavilyApiKey: string | null;
  openSettings: () => void;
}

const PortalScanner: React.FC<Props> = ({ tavilyApiKey, openSettings }) => {
  // ── Persistent state ──────────────────────────────────────────────────────
  const [role, setRole]             = useLocalStorage<string>('scanner:role', '');
  const [customUrl, setCustomUrl]   = useLocalStorage<string>('scanner:customUrl', '');
  const [selectedArr, setSelectedArr] = useLocalStorage<string[]>(
    'scanner:selected',
    PRESET_COMPANIES.slice(0, 10).map(c => c.company)
  );
  const [results, setResults]       = useLocalStorage<PortalJob[]>('scanner:results', []);
  const [lastScanRole, setLastScanRole] = useLocalStorage<string>('scanner:lastRole', '');
  const [lastScanTime, setLastScanTime] = useLocalStorage<string>('scanner:lastTime', '');

  // ── Ephemeral UI state ────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<CompanyCategory | 'All'>('All');
  const [companySearch, setCompanySearch]   = useState('');
  const [resultSearch, setResultSearch]     = useState('');
  const [scanning, setScanning]             = useState(false);
  const [progress, setProgress]             = useState<{ company: string; done: number; total: number } | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const selected = useMemo(() => new Set(selectedArr), [selectedArr]);

  // ── Company list filtering ────────────────────────────────────────────────
  const visibleCompanies = useMemo(() => {
    let list = PRESET_COMPANIES;
    if (activeCategory !== 'All') list = list.filter(c => c.category === activeCategory);
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase();
      list = list.filter(c => c.company.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, companySearch]);

  const toggleCompany = useCallback((company: string) => {
    setSelectedArr(prev => {
      const s = new Set(prev);
      if (s.has(company)) s.delete(company); else s.add(company);
      return Array.from(s);
    });
  }, [setSelectedArr]);

  const selectAll     = () => setSelectedArr(PRESET_COMPANIES.map(c => c.company));
  const selectNone    = () => setSelectedArr([]);
  const selectVisible = () => setSelectedArr(prev => {
    const s = new Set(prev);
    visibleCompanies.forEach(c => s.add(c.company));
    return Array.from(s);
  });
  const deselectVisible = () => setSelectedArr(prev => {
    const s = new Set(prev);
    visibleCompanies.forEach(c => s.delete(c.company));
    return Array.from(s);
  });

  // ── Scan ─────────────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (!role.trim())   { setError('Enter a role title to search for.'); return; }
    if (!tavilyApiKey)  { openSettings(); return; }
    if (selected.size === 0 && !customUrl) { setError('Select at least one company or enter a custom URL.'); return; }

    setScanning(true);
    setError(null);
    setResults([]);

    try {
      const allResults: PortalJob[] = [];

      if (customUrl) {
        try {
          const custom = await scanCustomUrl(customUrl, role, tavilyApiKey);
          allResults.push(...custom);
        } catch (e: any) { console.warn('Custom URL scan failed:', e.message); }
      }

      const targets = PRESET_COMPANIES.filter(c => selected.has(c.company));
      if (targets.length > 0) {
        const jobs = await scanMultipleCompanies(
          targets, role, tavilyApiKey,
          (company, done, total) => setProgress({ company, done, total })
        );
        allResults.push(...jobs);
      }

      setResults(allResults);
      setLastScanRole(role);
      setLastScanTime(new Date().toLocaleString());
    } catch (e: any) {
      setError(e.message || 'Scan failed.');
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  // ── Filtered results ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!resultSearch.trim()) return results;
    const q = resultSearch.toLowerCase();
    return results.filter(j =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
    );
  }, [results, resultSearch]);

  // ── Portal breakdown ──────────────────────────────────────────────────────
  const portalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(j => { counts[j.source] = (counts[j.source] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { All: PRESET_COMPANIES.length };
    PRESET_COMPANIES.forEach(c => { map[c.category] = (map[c.category] || 0) + 1; });
    return map;
  }, []);

  const selectedInView = visibleCompanies.filter(c => selected.has(c.company)).length;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Job Portal Scanner</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Scan <span className="font-bold text-indigo-600 dark:text-indigo-400">{PRESET_COMPANIES.length}+</span> company career portals
            across Greenhouse, Ashby, Lever &amp; more — in one click.
          </p>
        </div>
        {lastScanTime && (
          <div className="text-right">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Last scan</p>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{lastScanRole}</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{lastScanTime}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Search config */}
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4 shadow-sm">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Target Role *</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScan()}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Custom Career Page URL</label>
              <input
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://company.com/careers"
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            {!tavilyApiKey && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                <span className="text-base mt-0.5">🔑</span>
                <div>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Tavily API key required</p>
                  <button onClick={openSettings} className="text-xs text-amber-600 dark:text-amber-400 underline mt-0.5">Add in Settings →</button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                <span className="text-base">⚠️</span>
                <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {scanning && progress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="truncate max-w-[160px]">Scanning <span className="font-semibold text-zinc-700 dark:text-zinc-300">{progress.company}</span>…</span>
                  <span className="font-mono font-bold">{progress.done}/{progress.total}</span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={scanning}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            >
              {scanning ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning {selected.size} companies…
                </>
              ) : (
                <>🔍 Scan {selected.size} {selected.size === 1 ? 'Company' : 'Companies'}</>
              )}
            </button>
          </div>

          {/* Company selector */}
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 dark:border-neutral-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Companies</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{selected.size} of {PRESET_COMPANIES.length} selected</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={selectAll} className="text-[10px] font-bold px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition">All</button>
                  <button onClick={selectNone} className="text-[10px] font-bold px-2 py-1 bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-600 transition">None</button>
                </div>
              </div>

              {/* Company search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  placeholder="Search companies…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            </div>

            {/* Category pills */}
            <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-neutral-700">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  onClick={() => setActiveCategory('All')}
                  className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition ${activeCategory === 'All' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-600'}`}
                >
                  All ({categoryCounts['All']})
                </button>
                {COMPANY_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition whitespace-nowrap ${activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-600'}`}
                  >
                    {CATEGORY_ICONS[cat]} {cat} ({categoryCounts[cat] || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Select visible */}
            {activeCategory !== 'All' && (
              <div className="px-4 py-2 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400">{selectedInView}/{visibleCompanies.length} in view selected</span>
                <div className="flex gap-2">
                  <button onClick={selectVisible} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Select all</button>
                  <button onClick={deselectVisible} className="text-[10px] font-bold text-zinc-400 hover:underline">Deselect</button>
                </div>
              </div>
            )}

            {/* Company list */}
            <div className="max-h-72 overflow-y-auto">
              {visibleCompanies.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">No companies match your search.</p>
              ) : (
                visibleCompanies.map(c => {
                  const badge = PORTAL_META[c.portal || 'custom'];
                  const isSelected = selected.has(c.company);
                  return (
                    <label
                      key={c.company}
                      className={`flex items-center gap-2.5 py-2 px-4 cursor-pointer group transition-colors ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-zinc-50 dark:hover:bg-neutral-700/40'}`}
                    >
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-300 dark:border-zinc-600 group-hover:border-indigo-400'}`}>
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4l3 3 5-6" />
                          </svg>
                        )}
                      </div>
                      <input type="checkbox" className="sr-only" checked={isSelected} onChange={() => toggleCompany(c.company)} />
                      <span className={`text-xs flex-1 font-medium transition-colors ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-300'}`}>{c.company}</span>
                      {badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${badge.color}`}>
                          {badge.label}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Results ────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">
          {/* Results toolbar */}
          {results.length > 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                  <input
                    value={resultSearch}
                    onChange={e => setResultSearch(e.target.value)}
                    placeholder="Filter results by title, company, location…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 transition"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">{filtered.length}</span>
                  <span className="text-xs text-zinc-400 leading-tight">jobs<br/>found</span>
                </div>
                <button
                  onClick={() => { setResults([]); setLastScanRole(''); setLastScanTime(''); }}
                  className="flex-shrink-0 text-xs text-zinc-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Clear results"
                >
                  ✕ Clear
                </button>
              </div>

              {/* Portal breakdown */}
              {portalCounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {portalCounts.map(([portal, count]) => {
                    const meta = PORTAL_META[portal] || PORTAL_META['custom'];
                    return (
                      <span key={portal} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label} · {count}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Empty / scanning states */}
          {!scanning && results.length === 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-16 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl flex items-center justify-center text-4xl mb-5">🔭</div>
              <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">Ready to scan {PRESET_COMPANIES.length}+ portals</h3>
              <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">Pick your target companies, type your role, and hit scan. Results are saved automatically.</p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {Object.entries(PORTAL_META).slice(0, 4).map(([key, meta]) => (
                  <span key={key} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${meta.color}`}>
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {scanning && results.length === 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-16 flex flex-col items-center justify-center shadow-sm">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-2xl">🔍</div>
              </div>
              <p className="text-base font-bold text-zinc-700 dark:text-zinc-300">
                {progress ? `Scanning ${progress.company}…` : 'Starting scan…'}
              </p>
              {progress && (
                <p className="text-sm text-zinc-400 mt-1">{progress.done + 1} of {progress.total} companies</p>
              )}
            </div>
          )}

          {/* Results list */}
          <div className="space-y-2.5">
            {filtered.map(job => {
              const badge = PORTAL_META[job.source] || PORTAL_META['custom'];
              return (
                <div
                  key={job.id}
                  className="bg-white dark:bg-neutral-800 rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    {/* Company initial avatar */}
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-extrabold flex-shrink-0 shadow-sm">
                      {job.company.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-1">{job.title}</h4>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{job.company}</span>
                            {job.location && (
                              <>
                                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                <span className="text-xs text-zinc-400">{job.location}</span>
                              </>
                            )}
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.color}`}>
                              <span className={`w-1 h-1 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </div>
                        </div>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                          Apply →
                        </a>
                      </div>
                      {job.snippet && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mt-1.5">{job.snippet}</p>
                      )}
                      <p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-1.5">Found {job.dateFound}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalScanner;
