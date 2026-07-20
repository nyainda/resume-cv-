import React, { useState } from 'react';
import type { VaultJob } from '../../types';
import { Clock, Trash, Zap, ArrowRight, Bookmark } from '../icons';

const GOLD = '#C9A84C';

function CompanyAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const letter = name?.charAt(0)?.toUpperCase() || '?';
  const palette = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-indigo-500','bg-teal-500','bg-orange-500'];
  const color = palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} ${color} rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}>
      {letter}
    </div>
  );
}

function MatchBar({ score }: { score?: number }) {
  if (score === undefined) {
    return (
      <div className="flex items-center gap-2 mt-2.5">
        <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-pulse" />
        </div>
        <span className="text-[10px] text-zinc-400 flex-shrink-0">Analysing…</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? GOLD : pct >= 45 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="flex items-center gap-2 mt-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold flex-shrink-0" style={{ color }}>{pct}%</span>
    </div>
  );
}

function RoomBadge({ roomType }: { roomType: VaultJob['roomType'] }) {
  const cfg = {
    primary:      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    stretch:      'bg-amber-50  text-amber-700  dark:bg-amber-900/20  dark:text-amber-400',
    uncategorized:'bg-zinc-100  text-zinc-500   dark:bg-neutral-700   dark:text-zinc-400',
  };
  const labels = { primary: 'Primary', stretch: 'Stretch', uncategorized: 'Uncategorised' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg[roomType]}`}>
      {labels[roomType]}
    </span>
  );
}

function DeadlinePill({ deadline }: { deadline?: string }) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return (
    <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
      <Clock className="h-3 w-3" />Expired
    </span>
  );
  const urgent = days <= 5;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium ${urgent ? 'text-rose-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
      <Clock className="h-3 w-3" />
      {days === 0 ? 'Due today' : `Due ${new Date(deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
      {urgent && ' ⚠'}
    </span>
  );
}

const PRIORITY_ACCENT: Record<VaultJob['priority'], string> = {
  dream:  GOLD,
  high:   '#f97316',
  medium: 'transparent',
  low:    'transparent',
};

interface Props {
  job: VaultJob;
  onQuickCheck: (job: VaultJob) => void;
  onBuildCV:    (job: VaultJob) => void;
  onDelete:     (id: string)    => void;
}

export const VaultJobCard: React.FC<Props> = ({ job, onQuickCheck, onBuildCV, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isApplied  = job.status === 'applied';
  const isExpired  = job.status === 'expired';
  const isBuilding = job.status === 'building';
  const accentColor = PRIORITY_ACCENT[job.priority];

  return (
    <div className={`relative rounded-xl border bg-white dark:bg-neutral-800 border-zinc-100 dark:border-neutral-700 hover:border-[#C9A84C]/40 hover:shadow-md transition-all duration-150 overflow-hidden flex ${isApplied ? 'opacity-60' : ''}`}>
      {/* Priority left accent */}
      {accentColor !== 'transparent' && (
        <div className="w-1 flex-shrink-0 self-stretch rounded-l-xl" style={{ background: accentColor }} />
      )}

      <div className="flex-1 p-3.5 flex flex-col gap-2 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <CompanyAvatar name={job.company} />
            <div className="min-w-0">
              <p className={`text-xs font-extrabold text-zinc-900 dark:text-zinc-50 line-clamp-2 leading-tight ${isExpired ? 'line-through opacity-60' : ''}`}>
                {job.title}
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{job.company}</p>
            </div>
          </div>

          {/* 3-dot menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 w-40 bg-white dark:bg-neutral-800 rounded-xl border border-zinc-100 dark:border-neutral-700 shadow-xl py-1">
                <button onClick={() => { setMenuOpen(false); onQuickCheck(job); }} className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" /> Quick Check
                </button>
                <button onClick={() => { setMenuOpen(false); onBuildCV(job); }} className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 flex items-center gap-2">
                  <ArrowRight className="h-3.5 w-3.5" /> Build CV
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(job.id); }} className="w-full text-left px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2">
                  <Trash className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Match bar */}
        <MatchBar score={job.matchScore} />

        {/* Badges row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <RoomBadge roomType={job.roomType} />
          {isBuilding && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#C9A84C]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />CV in progress
            </span>
          )}
          {isApplied && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ Applied</span>
          )}
        </div>

        {/* Deadline + action buttons */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {job.deadline ? <DeadlinePill deadline={job.deadline} /> : (
            <span className="text-[10px] text-zinc-300 dark:text-zinc-600">No deadline</span>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!isApplied && (
              <>
                <button
                  onClick={() => onQuickCheck(job)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600 hover:border-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors"
                >
                  <Zap className="h-3 w-3" />Check
                </button>
                <button
                  onClick={() => onBuildCV(job)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1B2B4B' }}
                >
                  Build CV <ArrowRight className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaultJobCard;
