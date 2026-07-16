/**
 * CommandPalette — ⌘K global search / quick-nav modal.
 *
 * Opens with ⌘K (Mac) or Ctrl+K (Windows/Linux).
 * Supports keyboard navigation (↑↓ to move, Enter to select, Esc to close).
 * Filters pages, quick actions and recent CVs as the user types.
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

/* ── Types ──────────────────────────────────────────────────────────────── */
type ItemKind = 'nav' | 'action' | 'cv';

interface PaletteItem {
  id: string;
  kind: ItemKind;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

/* ── Icon helpers (inline SVG, no dependency) ─────────────────────────── */
const Icon: React.FC<{ d: string | string[]; size?: number }> = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
  </svg>
);

const NavIcon: Record<string, React.ReactNode> = {
  dashboard:  <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  generator:  <Icon d={["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M12 18v-6","M9 15h6"]} />,
  history:    <Icon d={["M12 8v4l3 3","M3.05 11a9 9 0 1 0 .5-3"]} />,
  score:      <Icon d={["M22 11.08V12a10 10 0 1 1-5.93-9.14","M22 4 12 14.01l-3-3"]} />,
  toolkit:    <Icon d={["M14.7 6.3a1 1 0 00-1.4 1.4l1.4 1.4","M12 20h9","M16.5 3.5l4 4","M3 3l18 18"]} />,
  tracker:    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
  analytics:  <Icon d={["M3 3v18h18","M18 17V9","M13 17V5","M8 17v-3"]} />,
  linkedin:   <Icon d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />,
  interview:  <Icon d={["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"]} />,
  salary:     <Icon d={["M12 1v22","M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"]} />,
  settings:   <Icon d={["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"]} />,
  cv:         <Icon d={["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6"]} />,
  action:     <Icon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
};

/* ── Main component ──────────────────────────────────────────────────────── */
interface SavedCVRef {
  id?: string;
  name?: string;
  createdAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onOpenSettings: () => void;
  onEditProfile: () => void;
  savedCVs?: SavedCVRef[];
  darkMode?: boolean;
}

const CommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSettings,
  onEditProfile,
  savedCVs = [],
  darkMode = false,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const nav = useCallback((view: string) => {
    onNavigate(view);
    onClose();
  }, [onNavigate, onClose]);

  /* ── Item catalogue ───────────────────────────────────────────────────── */
  const staticItems = useMemo<PaletteItem[]>(() => [
    // ── Pages ──────────────────────────────────────────────────────────────
    { id: 'dashboard',  kind: 'nav', label: 'Dashboard',        sublabel: 'Your career home',         icon: NavIcon.dashboard,  onSelect: () => nav('dashboard') },
    { id: 'generator',  kind: 'nav', label: 'CV Generator',     sublabel: 'Build & tailor your CV',   icon: NavIcon.generator,  onSelect: () => nav('generator') },
    { id: 'history',    kind: 'nav', label: 'CV History',       sublabel: 'Browse saved CVs',         icon: NavIcon.history,    onSelect: () => nav('history') },
    { id: 'score',      kind: 'nav', label: 'Score My CV',      sublabel: 'AI quality score',         icon: NavIcon.score,      onSelect: () => nav('score') },
    { id: 'toolkit',    kind: 'nav', label: 'CV Toolkit',       sublabel: 'HR detector & deep audit', icon: NavIcon.toolkit,    onSelect: () => nav('toolkit') },
    { id: 'tracker',    kind: 'nav', label: 'Job Tracker',      sublabel: 'Track applications',       icon: NavIcon.tracker,    onSelect: () => nav('tracker') },
    { id: 'analytics',  kind: 'nav', label: 'Analytics',        sublabel: 'Profile views & sharing',  icon: NavIcon.analytics,  onSelect: () => nav('analytics') },
    { id: 'linkedin',   kind: 'nav', label: 'LinkedIn Optimizer',sublabel: 'Rewrite your headline',  icon: NavIcon.linkedin,   onSelect: () => nav('linkedin') },
    { id: 'interview',  kind: 'nav', label: 'Interview Prep',   sublabel: 'Q&A practice',             icon: NavIcon.interview,  onSelect: () => nav('interview') },
    { id: 'salary',     kind: 'nav', label: 'Salary Insights',  sublabel: 'Market pay data',          icon: NavIcon.salary,     onSelect: () => nav('negotiation') },
    // ── Quick actions ───────────────────────────────────────────────────────
    { id: 'act-profile', kind: 'action', label: 'Edit My Profile',      sublabel: 'Update your details',   icon: NavIcon.action, onSelect: () => { onEditProfile(); onClose(); } },
    { id: 'act-settings',kind: 'action', label: 'Open Settings',        sublabel: 'API keys, theme, plan',icon: NavIcon.settings, onSelect: () => { onOpenSettings(); onClose(); } },
    { id: 'act-new-cv',  kind: 'action', label: 'Generate New CV',      sublabel: 'Start from scratch',   icon: NavIcon.generator, onSelect: () => nav('generator') },
    { id: 'act-score',   kind: 'action', label: 'Score My Current CV',  sublabel: 'Run quality check',    icon: NavIcon.score, onSelect: () => nav('score') },
  ], [nav, onEditProfile, onOpenSettings, onClose]);

  const cvItems = useMemo<PaletteItem[]>(() =>
    savedCVs.slice(0, 5).map((cv, i) => ({
      id: `cv-${cv.id ?? i}`,
      kind: 'cv' as ItemKind,
      label: cv.name || `Saved CV ${i + 1}`,
      sublabel: cv.createdAt
        ? `Saved ${new Date(cv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}`
        : 'Saved CV',
      icon: NavIcon.cv,
      onSelect: () => nav('history'),
    })),
  [savedCVs, nav]);

  const allItems = useMemo(() => [...staticItems, ...cvItems], [staticItems, cvItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      it => it.label.toLowerCase().includes(q) || (it.sublabel ?? '').toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Group filtered items by kind for display
  const groups = useMemo(() => {
    const navItems    = filtered.filter(i => i.kind === 'nav');
    const actionItems = filtered.filter(i => i.kind === 'action');
    const cvItemsF    = filtered.filter(i => i.kind === 'cv');
    const result: { label: string; items: PaletteItem[] }[] = [];
    if (navItems.length)    result.push({ label: 'Pages',         items: navItems });
    if (actionItems.length) result.push({ label: 'Quick Actions', items: actionItems });
    if (cvItemsF.length)    result.push({ label: 'Recent CVs',    items: cvItemsF });
    return result;
  }, [filtered]);

  // Keep activeIdx in bounds
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  /* ── Keyboard handling ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filtered[activeIdx]?.onSelect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filtered, activeIdx, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!isOpen) return null;

  // Map flat index to group item
  let flatIdx = 0;
  const groupsWithFlat = groups.map(g => ({
    ...g,
    items: g.items.map(item => ({ ...item, flatIdx: flatIdx++ })),
  }));

  const kindColors: Record<ItemKind, string> = {
    nav:    NAVY,
    action: '#7c3aed',
    cv:     '#0ea5e9',
  };

  const kindBg: Record<ItemKind, string> = {
    nav:    `${NAVY}12`,
    action: '#7c3aed12',
    cv:     '#0ea5e912',
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center pt-[15vh] px-4"
      style={{ background: 'rgba(10,16,30,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-neutral-800">
          <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, actions, CVs…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-600 font-mono border border-zinc-200 dark:border-neutral-700 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results list */}
        <ul
          ref={listRef}
          className="max-h-[360px] overflow-y-auto py-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {groupsWithFlat.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-zinc-400">
              No results for "{query}"
            </li>
          )}

          {groupsWithFlat.map(group => (
            <React.Fragment key={group.label}>
              {/* Group header */}
              <li className="px-4 py-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                  {group.label}
                </span>
              </li>

              {/* Group items */}
              {group.items.map(item => {
                const isActive = item.flatIdx === activeIdx;
                return (
                  <li key={item.id}>
                    <button
                      data-active={isActive}
                      onClick={item.onSelect}
                      onMouseEnter={() => setActiveIdx(item.flatIdx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75 ${
                        isActive
                          ? 'bg-zinc-50 dark:bg-neutral-800'
                          : 'hover:bg-zinc-50 dark:hover:bg-neutral-800/60'
                      }`}
                    >
                      {/* Icon badge */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: isActive ? kindBg[item.kind] : `${kindBg[item.kind]}88`, color: kindColors[item.kind] }}
                      >
                        {item.icon}
                      </div>

                      {/* Labels */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-tight truncate ${
                          isActive
                            ? 'text-zinc-900 dark:text-zinc-50'
                            : 'text-zinc-700 dark:text-zinc-200'
                        }`}>
                          {item.label}
                        </div>
                        {item.sublabel && (
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-tight truncate">
                            {item.sublabel}
                          </div>
                        )}
                      </div>

                      {/* Enter hint on active */}
                      {isActive && (
                        <kbd className="flex-shrink-0 text-[10px] text-zinc-400 dark:text-zinc-600 font-mono border border-zinc-200 dark:border-neutral-700 rounded px-1.5 py-0.5">
                          ↵
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-zinc-400 dark:text-zinc-600">
            <span className="flex items-center gap-1"><kbd className="font-mono border border-current rounded px-1">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono border border-current rounded px-1">↵</kbd> select</span>
            <span className="flex items-center gap-1"><kbd className="font-mono border border-current rounded px-1">Esc</kbd> close</span>
          </div>
          <div
            className="text-[10px] font-bold"
            style={{ color: GOLD }}
          >
            ProCV
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
