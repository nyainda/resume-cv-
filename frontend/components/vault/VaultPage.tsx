import React, { useState, useMemo } from 'react';
import type { UserProfileSlot, UserProfile, VaultJob } from '../../types';
import { Search, Plus } from '../icons';
import VaultJobCard from './VaultJobCard';
import VaultCapturePanel from './VaultCapturePanel';
import VaultQuickActions from './VaultQuickActions';
import { useVaultJobs } from '../../hooks/useVaultJobs';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

interface Props {
  profiles:    UserProfileSlot[];
  activeSlot:  UserProfileSlot | null | undefined;
  userProfile: UserProfile | null;
  onBuildCV:   (jd: string) => void;
}

type SortKey = 'newest' | 'match' | 'deadline';

/** Deterministic color per room based on slot color */
const ROOM_PILL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  indigo:  { bg: 'bg-[#1B2B4B]/10 dark:bg-[#1B2B4B]/40', text: 'text-[#1B2B4B] dark:text-[#C9A84C]', dot: 'bg-[#1B2B4B] dark:bg-[#C9A84C]' },
  violet:  { bg: 'bg-violet-100 dark:bg-violet-900/30',   text: 'text-violet-700 dark:text-violet-400',  dot: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-400',    dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-100 dark:bg-rose-900/30',       text: 'text-rose-700 dark:text-rose-400',      dot: 'bg-rose-500' },
  sky:     { bg: 'bg-sky-100 dark:bg-sky-900/30',         text: 'text-sky-700 dark:text-sky-400',        dot: 'bg-sky-500' },
};

function getRoomPill(color: string) {
  return ROOM_PILL_COLORS[color] ?? ROOM_PILL_COLORS['indigo'];
}

function EmptyVault({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-100 dark:border-neutral-700">
        📥
      </div>
      <div>
        <p className="font-extrabold text-zinc-800 dark:text-zinc-100 text-lg">Your Job Vault is empty</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm leading-relaxed">
          Save job descriptions as you find them — no commitment to apply yet. ProCV will score each one against your profile.
        </p>
      </div>
      <button
        onClick={onCapture}
        className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white text-sm shadow-sm hover:opacity-90 transition-opacity"
        style={{ background: NAVY }}
      >
        <Plus className="h-4 w-4" /> Save your first job
      </button>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span>Or try:</span>
        {['Paste text', 'From URL', 'Upload PDF'].map(opt => (
          <button key={opt} onClick={onCapture}
            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors">
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export const VaultPage: React.FC<Props> = ({ profiles, activeSlot, userProfile, onBuildCV }) => {
  const skills = useMemo(() => {
    const raw = (userProfile as any)?.skills;
    if (Array.isArray(raw)) return raw.join(', ');
    return typeof raw === 'string' ? raw : '';
  }, [userProfile]);

  const { jobs, addJob, patchJob, removeJob } = useVaultJobs(skills);

  const [selectedRoomId, setSelectedRoomId] = useState<string | 'all'>('all');
  const [search, setSearch]                 = useState('');
  const [sortBy, setSortBy]                 = useState<SortKey>('newest');
  const [captureOpen, setCaptureOpen]       = useState(false);
  const [quickCheckJob, setQuickCheckJob]   = useState<VaultJob | null>(null);

  // Counts per room
  const countByRoom = useMemo(() => {
    const m: Record<string, number> = {};
    jobs.forEach(j => { m[j.roomId] = (m[j.roomId] ?? 0) + 1; });
    return m;
  }, [jobs]);

  // Filtered + sorted jobs
  const displayedJobs = useMemo(() => {
    let list = selectedRoomId === 'all' ? jobs : jobs.filter(j => j.roomId === selectedRoomId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.rawJd.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'match') return (b.matchScore ?? -1) - (a.matchScore ?? -1);
      if (sortBy === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return b.createdAt - a.createdAt;
    });
  }, [jobs, selectedRoomId, search, sortBy]);

  const activeRoomId = activeSlot?.id ?? profiles[0]?.id ?? '';

  function handleSave(args: Parameters<typeof addJob>[0]) {
    const result = addJob(args);
    setCaptureOpen(false);
    if (result.isDuplicate && result.existingId) {
      // Surface via a light toast-style indicator — in v1 we just show the existing job
      setSelectedRoomId(args.roomId);
    }
  }

  function handleBuildCV(job: VaultJob) {
    patchJob(job.id, { status: 'building' });
    setQuickCheckJob(null);
    onBuildCV(job.rawJd);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Job Vault</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Save JDs now, build your CV when you're ready
          </p>
        </div>
        <button
          onClick={() => setCaptureOpen(true)}
          className="flex items-center gap-2 self-start sm:self-auto px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity shadow-sm flex-shrink-0"
          style={{ background: NAVY }}
        >
          <Plus className="h-4 w-4" />
          Add JD
        </button>
      </div>

      {/* ── Room filter pills ────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mb-4 flex-shrink-0">
        {/* All pill */}
        <button
          onClick={() => setSelectedRoomId('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
            selectedRoomId === 'all'
              ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
              : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
          }`}
        >
          All <span className="opacity-70">{jobs.length}</span>
        </button>

        {profiles.map(slot => {
          const count = countByRoom[slot.id] ?? 0;
          const pill  = getRoomPill(slot.color);
          const isSelected = selectedRoomId === slot.id;
          return (
            <button
              key={slot.id}
              onClick={() => setSelectedRoomId(slot.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isSelected
                  ? `${pill.bg} ${pill.text} border-transparent`
                  : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
              }`}
            >
              {isSelected && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pill.dot}`} />}
              {slot.name}
              {count > 0 && <span className="opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Search + sort bar ───────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 dark:text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vault…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-zinc-400 hidden sm:block">Sort:</span>
            {(['newest','match','deadline'] as SortKey[]).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  sortBy === s
                    ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                    : 'border-zinc-200 dark:border-neutral-700 text-zinc-400 hover:border-zinc-300'
                }`}
              >
                {s === 'newest' ? 'Recent' : s === 'match' ? 'Match' : 'Deadline'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {jobs.length === 0 ? (
          <EmptyVault onCapture={() => setCaptureOpen(true)} />
        ) : displayedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No jobs match your search.</p>
            <button onClick={() => { setSearch(''); setSelectedRoomId('all'); }}
              className="text-xs text-[#C9A84C] hover:underline">Clear filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-6">
              {displayedJobs.map(job => (
                <VaultJobCard
                  key={job.id}
                  job={job}
                  onQuickCheck={setQuickCheckJob}
                  onBuildCV={handleBuildCV}
                  onDelete={removeJob}
                />
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center pb-4">
              Showing {displayedJobs.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>

      {/* ── Capture Modal ──────────────────────────────────────── */}
      {captureOpen && (
        <VaultCapturePanel
          profiles={profiles}
          activeRoomId={activeRoomId}
          onSave={handleSave}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {/* ── Quick Check Drawer ─────────────────────────────────── */}
      {quickCheckJob && (
        <VaultQuickActions
          job={quickCheckJob}
          onBuildCV={handleBuildCV}
          onClose={() => setQuickCheckJob(null)}
        />
      )}
    </div>
  );
};

export default VaultPage;
