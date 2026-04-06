import React, { useState, useMemo } from 'react';
import {
  PRESET_COMPANIES, scanMultipleCompanies, scanCustomUrl,
  ScanTarget, PortalJob,
} from '../services/portalScannerService';

const PORTAL_BADGE: Record<string, { label: string; color: string }> = {
  greenhouse: { label: 'Greenhouse', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  lever: { label: 'Lever', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  ashby: { label: 'Ashby', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  workday: { label: 'Workday', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  custom: { label: 'Web', color: 'bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-400' },
};

interface Props {
  tavilyApiKey: string | null;
  openSettings: () => void;
}

const PortalScanner: React.FC<Props> = ({ tavilyApiKey, openSettings }) => {
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(PRESET_COMPANIES.slice(0, 8).map(c => c.company)));
  const [customUrl, setCustomUrl] = useState('');
  const [results, setResults] = useState<PortalJob[]>([]);
  const [progress, setProgress] = useState<{ company: string; done: number; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedTargets = useMemo(
    () => PRESET_COMPANIES.filter(c => selected.has(c.company)),
    [selected]
  );

  const toggleCompany = (company: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(PRESET_COMPANIES.map(c => c.company)));
  const selectNone = () => setSelected(new Set());
  const selectTop = () => setSelected(new Set(PRESET_COMPANIES.slice(0, 8).map(c => c.company)));

  const handleScan = async () => {
    if (!role.trim()) { setError('Enter a role title to search for.'); return; }
    if (!tavilyApiKey) { openSettings(); return; }
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
        } catch (e: any) {
          console.warn('Custom URL scan failed:', e.message);
        }
      }

      if (selectedTargets.length > 0) {
        const jobs = await scanMultipleCompanies(
          selectedTargets,
          role,
          tavilyApiKey,
          (company, done, total) => setProgress({ company, done, total })
        );
        allResults.push(...jobs);
      }

      setResults(allResults);
    } catch (e: any) {
      setError(e.message || 'Scan failed.');
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return results;
    const q = search.toLowerCase();
    return results.filter(j =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
    );
  }, [results, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Job Portal Scanner</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Scan 30+ company career portals (Greenhouse, Ashby, Lever) for your target role in one click.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Target Role *</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Custom Career Page URL</label>
              <input
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://company.com/careers"
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {!tavilyApiKey && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Tavily API key required.</p>
                <button onClick={openSettings} className="text-xs text-amber-600 dark:text-amber-400 underline mt-0.5">Add in Settings →</button>
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

            {scanning && progress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Scanning {progress.company}…</span>
                  <span>{progress.done}/{progress.total}</span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={scanning}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {scanning ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Scanning {selected.size} companies…</>
              ) : `🔍 Scan ${selected.size} Companies`}
            </button>
          </div>

          {/* Company selector */}
          <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Companies ({selected.size} selected)</h3>
              <div className="flex gap-2">
                <button onClick={selectTop} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Top 8</button>
                <button onClick={selectAll} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">All</button>
                <button onClick={selectNone} className="text-[10px] font-bold text-zinc-400 hover:underline">None</button>
              </div>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {PRESET_COMPANIES.map(c => (
                <label key={c.company} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(c.company) ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {selected.has(c.company) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 5-6" /></svg>}
                  </div>
                  <input type="checkbox" className="sr-only" checked={selected.has(c.company)} onChange={() => toggleCompany(c.company)} />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{c.company}</span>
                  {c.portal && PORTAL_BADGE[c.portal] && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${PORTAL_BADGE[c.portal].color}`}>
                      {PORTAL_BADGE[c.portal].label}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="xl:col-span-2 space-y-4">
          {results.length > 0 && (
            <div className="flex items-center gap-3">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter results…"
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-zinc-500 whitespace-nowrap">{filtered.length} jobs found</span>
            </div>
          )}

          {!scanning && results.length === 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-12 flex flex-col items-center justify-center text-center">
              <div className="text-5xl mb-4">🔭</div>
              <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">Ready to scan</h3>
              <p className="text-sm text-zinc-400 max-w-sm">Select your target companies, enter a role title, and scan all their career portals at once.</p>
            </div>
          )}

          {scanning && results.length === 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-12 flex flex-col items-center justify-center">
              <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                {progress ? `Scanning ${progress.company}… (${progress.done + 1}/${progress.total})` : 'Starting scan…'}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(job => (
              <div key={job.id} className="bg-white dark:bg-neutral-800 rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{job.title}</h4>
                      {job.source && PORTAL_BADGE[job.source] && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${PORTAL_BADGE[job.source].color}`}>
                          {PORTAL_BADGE[job.source].label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{job.company}</span>
                      {job.location && <> · {job.location}</>}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{job.snippet}</p>
                  </div>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    View →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalScanner;
