import React, { useState } from 'react';
import type { VaultJob } from '../../types';
import { Clock, Trash, Zap, ArrowRight } from '../icons';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

/** Ensure apply URLs always open in a new tab and never navigate within the app */
function safeHref(url?: string | null): string {
  if (!url) return '#';
  if (url.startsWith('mailto:') || url.startsWith('https://') || url.startsWith('http://')) return url;
  return `https://${url}`;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function CompanyAvatar({ name }: { name: string }) {
  const isUnknown = !name || name === 'Unknown Company';
  const letter    = isUnknown ? '?' : name.charAt(0).toUpperCase();
  const palette   = ['#4f46e5','#7c3aed','#059669','#d97706','#e11d48','#0284c7','#0d9488','#ea580c'];
  const color     = isUnknown ? '#94a3b8' : palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  return (
    <div
      className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-base flex-shrink-0 shadow-sm select-none"
      style={{ background: isUnknown ? '#e2e8f0' : color, color: isUnknown ? '#94a3b8' : '#fff' }}
    >
      {letter}
    </div>
  );
}

function MatchBadge({ score }: { score?: number }) {
  if (score === undefined) {
    return (
      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-700 animate-pulse flex-shrink-0" />
    );
  }
  const pct   = Math.min(100, Math.max(0, score));
  const r     = 18;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * (pct / 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? GOLD : pct >= 45 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="flex-shrink-0 relative">
      <svg width={48} height={48} viewBox="0 0 48 48">
        <circle cx={24} cy={24} r={r} fill="none" stroke="currentColor" strokeWidth={5}
          className="text-zinc-100 dark:text-zinc-700" />
        <circle cx={24} cy={24} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
        <text x={24} y={28} textAnchor="middle" fontSize="10" fontWeight="800" fill={color}>{pct}%</text>
      </svg>
    </div>
  );
}

function RoomBadge({ roomType }: { roomType: VaultJob['roomType'] }) {
  const cfg = {
    primary:       { bg: 'bg-emerald-50 dark:bg-emerald-900/20',  text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
    stretch:       { bg: 'bg-amber-50 dark:bg-amber-900/20',      text: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500'   },
    uncategorized: { bg: 'bg-zinc-100 dark:bg-neutral-700',       text: 'text-zinc-500 dark:text-zinc-400',       dot: 'bg-zinc-400'    },
  };
  const labels = { primary: 'Strong fit', stretch: 'Stretch', uncategorized: 'Saved' };
  const c = cfg[roomType];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${c.dot}`} />
      {labels[roomType]}
    </span>
  );
}

function DeadlinePill({ deadline }: { deadline?: string }) {
  if (!deadline) return null;
  const ms   = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);

  if (days < 0) return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
      <Clock className="h-3 w-3" /> Expired
    </span>
  );

  if (days === 0) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 animate-pulse">
      <Clock className="h-3 w-3" /> Due today!
    </span>
  );

  if (days <= 3) return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
      </span>
      {days}d left
    </span>
  );

  if (days <= 7) return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500">
      <Clock className="h-3 w-3" /> {days}d left
    </span>
  );

  return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
      <Clock className="h-3 w-3" />
      {new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
    </span>
  );
}

function AddedDate({ ts }: { ts: number }) {
  const diffDays = Math.floor((Date.now() - ts) / 86400000);
  const label    = diffDays === 0 ? 'Today'
    : diffDays === 1             ? 'Yesterday'
    : diffDays < 7               ? `${diffDays}d ago`
    : new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  return <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{label}</span>;
}

function RemoteBadge({ remote, location }: { remote?: VaultJob['remote']; location?: string }) {
  if (!remote && !location) return null;
  const remoteIcon = remote === 'Remote' ? '🌍' : remote === 'Hybrid' ? '🔀' : remote === 'On-site' ? '🏢' : null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {remote && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40">
          {remoteIcon} {remote}
        </span>
      )}
      {location && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-zinc-50 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-neutral-600 truncate max-w-[120px]" title={location}>
          📍 {location.length > 18 ? location.slice(0, 16) + '…' : location}
        </span>
      )}
    </div>
  );
}

/* Priority → top-border color */
const PRIORITY_STRIPE: Record<VaultJob['priority'], string> = {
  dream:  GOLD,
  high:   '#f97316',
  medium: 'transparent',
  low:    'transparent',
};

/* roomType → fallback top-border (lower priority than explicit priority) */
const ROOM_STRIPE: Record<VaultJob['roomType'], string> = {
  primary:       '#22c55e',
  stretch:       '#f59e0b',
  uncategorized: 'transparent',
};

interface Props {
  job:              VaultJob;
  onQuickCheck:     (job: VaultJob) => void;
  onBuildCV:        (job: VaultJob) => void;
  onDelete:         (id: string)   => void;
  /** When true the card is in multi-select mode */
  selectMode?:      boolean;
  isSelected?:      boolean;
  onToggleSelect?:  (id: string) => void;
}

export const VaultJobCard: React.FC<Props> = ({
  job, onQuickCheck, onBuildCV, onDelete,
  selectMode = false, isSelected = false, onToggleSelect,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const isApplied  = job.status === 'applied';
  const isExpired  = job.status === 'expired';
  const isBuilding = job.status === 'building';
  const analysing  = !job.analysed;

  const showCompany = job.company && job.company !== 'Unknown Company';

  /* Pick top stripe: explicit dream/high priority first, then roomType */
  const stripeColor =
    job.priority === 'dream' || job.priority === 'high'
      ? PRIORITY_STRIPE[job.priority]
      : ROOM_STRIPE[job.roomType];

  /* Deadline urgency for card border glow */
  const deadlineDays = job.deadline
    ? Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86400000)
    : null;
  const isUrgent = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3;

  function handleCardClick() {
    if (selectMode) { onToggleSelect?.(job.id); return; }
    if (!menuOpen) onQuickCheck(job);
  }

  return (
    <div
      className={`relative rounded-2xl border bg-white dark:bg-neutral-800 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer ${
        isApplied && !selectMode ? 'opacity-60' : ''
      } ${
        selectMode && isSelected
          ? 'border-[#C9A84C] shadow-md shadow-[#C9A84C]/10 ring-1 ring-[#C9A84C]/30'
          : isUrgent
          ? 'border-rose-300 dark:border-rose-700 shadow-rose-100 dark:shadow-rose-900/20 shadow-md hover:shadow-rose-200 dark:hover:shadow-rose-800/30'
          : 'border-zinc-100 dark:border-neutral-700 hover:border-[#C9A84C]/40 hover:shadow-lg'
      }`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') handleCardClick(); }}
    >
      {/* ── Select-mode checkbox overlay ───────────────────────── */}
      {selectMode && (
        <div className="absolute top-3 right-3 z-10" onClick={e => { e.stopPropagation(); onToggleSelect?.(job.id); }}>
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'border-[#C9A84C] bg-[#C9A84C]'
              : 'border-zinc-300 dark:border-neutral-500 bg-white dark:bg-neutral-700 hover:border-[#C9A84C]'
          }`}>
            {isSelected && (
              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="2,6 5,9 10,3"/>
              </svg>
            )}
          </div>
        </div>
      )}
      {/* ── Priority / room stripe ─────────────────────────────── */}
      {stripeColor !== 'transparent' && (
        <div className="h-1 w-full flex-shrink-0" style={{ background: stripeColor }} />
      )}

      {/* ── Card body ──────────────────────────────────────────── */}
      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">

        {/* Header: avatar + title + match badge */}
        <div className="flex items-start gap-3">
          <CompanyAvatar name={job.company} />

          <div className="flex-1 min-w-0 pt-0.5">
            <p className={`text-sm font-extrabold text-zinc-900 dark:text-zinc-50 line-clamp-1 leading-tight ${isExpired ? 'line-through opacity-60' : ''}`}>
              {job.title || 'Untitled Role'}
            </p>

            <p className="text-[11px] mt-0.5 flex items-center gap-1.5">
              {analysing ? (
                <span className="text-zinc-300 dark:text-zinc-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full border border-zinc-300 border-t-transparent animate-spin" />
                  Analysing…
                </span>
              ) : showCompany ? (
                <span className="text-zinc-500 dark:text-zinc-400 font-medium truncate">{job.company}</span>
              ) : (
                <span className="text-zinc-300 dark:text-zinc-600 italic">Company unknown</span>
              )}
            </p>
          </div>

          {/* Match badge */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <MatchBadge score={job.matchScore} />
          </div>
        </div>

        {/* TLDR */}
        {job.tldr && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 -mt-1">
            {job.tldr}
          </p>
        )}

        {/* Remote / location badges */}
        {(job.remote || job.location) && (
          <RemoteBadge remote={job.remote} location={job.location} />
        )}

        {/* Requirements chips */}
        {job.requirements && job.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.requirements.slice(0, 3).map((r, i) => (
              <span
                key={i}
                className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-zinc-50 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-neutral-600 truncate max-w-[130px]"
                title={r}
              >
                {r.length > 22 ? r.slice(0, 20) + '…' : r}
              </span>
            ))}
            {job.requirements.length > 3 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 self-center">
                +{job.requirements.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-0 flex flex-col gap-2.5">
        {/* Status + date row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RoomBadge roomType={job.roomType} />
            {isBuilding && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-[#C9A84C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />CV building
              </span>
            )}
            {isApplied && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ Applied</span>
            )}
            {/* Notes indicator */}
            {job.notes && job.notes.trim().length > 0 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1" title="Has notes">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {job.deadline ? <DeadlinePill deadline={job.deadline} /> : <AddedDate ts={job.createdAt} />}
          </div>
        </div>

        {/* Action row — hidden in select mode */}
        {!isApplied && !selectMode && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {/* Apply link */}
            {(job.website || job.email) && (
              <a
                href={job.website ? safeHref(job.website) : `mailto:${job.email}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {job.email && !job.website ? '✉ Apply' : '↗ Apply'}
              </a>
            )}

            {/* 3-dot overflow */}
            <div className="relative ml-auto" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 bottom-10 z-20 w-44 bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-100 dark:border-neutral-700 shadow-2xl py-1.5 overflow-hidden">
                  <button onClick={() => { setMenuOpen(false); onQuickCheck(job); }} className="w-full text-left px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 flex items-center gap-2.5">
                    <Zap className="h-3.5 w-3.5 text-[#C9A84C]" /> Quick Check
                  </button>
                  <button onClick={() => { setMenuOpen(false); onBuildCV(job); }} className="w-full text-left px-3.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 flex items-center gap-2.5">
                    <ArrowRight className="h-3.5 w-3.5 text-indigo-400" /> Build CV
                  </button>
                  <div className="my-1 border-t border-zinc-100 dark:border-neutral-700" />
                  <button onClick={() => { setMenuOpen(false); onDelete(job.id); }} className="w-full text-left px-3.5 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2.5">
                    <Trash className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Primary CTA */}
            <button
              onClick={e => { e.stopPropagation(); onBuildCV(job); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90 hover:shadow-sm"
              style={{ background: NAVY }}
            >
              Build CV <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VaultJobCard;
