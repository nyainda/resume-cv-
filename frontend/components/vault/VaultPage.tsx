import React, { useState, useMemo } from 'react';
import type { UserProfileSlot, UserProfile, VaultJob } from '../../types';
import { Search, Plus } from '../icons';
import VaultJobCard from './VaultJobCard';
import VaultCapturePanel from './VaultCapturePanel';
import VaultQuickActions from './VaultQuickActions';
import { useVaultJobs } from '../../hooks/useVaultJobs';
import { useVaultDeadlineNotifier } from '../../hooks/useVaultDeadlineNotifier';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

interface Props {
  profiles:    UserProfileSlot[];
  activeSlot:  UserProfileSlot | null | undefined;
  userProfile: UserProfile | null;
  onBuildCV:   (job: VaultJob) => void;
}

type SortKey = 'newest' | 'match' | 'deadline';

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

/* ── Closing soon alert bar ──────────────────────────────────────────── */
function ClosingSoonBar({ jobs, onViewJob }: { jobs: VaultJob[]; onViewJob: (j: VaultJob) => void }) {
  const urgent = jobs
    .filter(j => {
      if (!j.deadline || j.status === 'applied' || j.status === 'expired') return false;
      const days = Math.ceil((new Date(j.deadline).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 5;
    })
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  if (urgent.length === 0) return null;

  return (
    <div className="mb-4 flex-shrink-0 rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-900/20 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
        <p className="text-xs font-extrabold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
          Closing soon — {urgent.length} role{urgent.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {urgent.map(j => {
          const days = Math.ceil((new Date(j.deadline!).getTime() - Date.now()) / 86400000);
          return (
            <button
              key={j.id}
              onClick={() => onViewJob(j)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 border border-rose-200 dark:border-rose-700 hover:border-rose-400 dark:hover:border-rose-500 transition-colors text-left"
            >
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate max-w-[140px]">
                {j.title || 'Untitled'}
              </span>
              <span className={`text-[10px] font-bold flex-shrink-0 ${days === 0 ? 'text-rose-500 animate-pulse' : 'text-rose-500'}`}>
                {days === 0 ? 'Today!' : `${days}d`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */
function EmptyVault({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      {/* Icon */}
      <div className="relative">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
        >
          <svg className="h-10 w-10 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        </div>
        <div
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-extrabold shadow-sm"
          style={{ background: GOLD }}
        >
          0
        </div>
      </div>

      <div className="max-w-sm">
        <p className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Your Job Vault is empty</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
          Save job descriptions as you find them — no commitment yet. ProCV scores each one against your profile automatically.
        </p>
      </div>

      <button
        onClick={onCapture}
        className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-extrabold text-white text-sm shadow-lg hover:opacity-90 hover:shadow-xl transition-all"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
      >
        <Plus className="h-4 w-4" /> Save your first job
      </button>

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="text-zinc-300 dark:text-zinc-600">or try:</span>
        {['Paste text', 'From URL', 'Upload PDF'].map(opt => (
          <button key={opt} onClick={onCapture}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors font-medium">
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Stats bar ───────────────────────────────────────────────────────── */
function StatsBar({ jobs }: { jobs: VaultJob[] }) {
  const total      = jobs.length;
  const strongFits = jobs.filter(j => j.roomType === 'primary').length;
  const applied    = jobs.filter(j => j.status === 'applied').length;
  const scored     = jobs.filter(j => j.matchScore !== undefined);
  const avgMatch   = scored.length > 0
    ? Math.round(scored.reduce((s, j) => s + (j.matchScore ?? 0), 0) / scored.length)
    : null;

  const stats = [
    { value: total.toString(),                  label: 'Saved',       color: 'text-zinc-900 dark:text-zinc-50' },
    { value: strongFits.toString(),             label: 'Strong fits', color: 'text-emerald-600 dark:text-emerald-400' },
    { value: applied.toString(),                label: 'Applied',     color: 'text-indigo-600 dark:text-indigo-400' },
    { value: avgMatch !== null ? `${avgMatch}%` : '—', label: 'Avg match', color: avgMatch !== null && avgMatch >= 65 ? 'text-[#C9A84C]' : 'text-zinc-500 dark:text-zinc-400' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-5 flex-shrink-0">
      {stats.map(s => (
        <div key={s.label} className="bg-zinc-50 dark:bg-neutral-800 rounded-2xl px-3 py-2.5 text-center border border-zinc-100 dark:border-neutral-700">
          <p className={`text-base font-extrabold leading-none ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 font-medium">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */
export const VaultPage: React.FC<Props> = ({ profiles, activeSlot, userProfile, onBuildCV }) => {
  const skills = useMemo(() => {
    const raw = (userProfile as any)?.skills;
    if (Array.isArray(raw)) return raw.join(', ');
    return typeof raw === 'string' ? raw : '';
  }, [userProfile]);

  const { jobs, addJob, patchJob, removeJob } = useVaultJobs(skills);

  // Auto-fire browser notifications for jobs with deadlines ≤7 days away.
  // Seen IDs are persisted to localStorage so they don't re-fire on reload.
  useVaultDeadlineNotifier(jobs);

  const [selectedRoomId, setSelectedRoomId] = useState<string | 'all'>('all');
  const [search, setSearch]                 = useState('');
  const [sortBy, setSortBy]                 = useState<SortKey>('newest');
  const [captureOpen, setCaptureOpen]       = useState(false);
  const [quickCheckJob, setQuickCheckJob]   = useState<VaultJob | null>(null);

  const countByRoom = useMemo(() => {
    const m: Record<string, number> = {};
    jobs.forEach(j => { m[j.roomId] = (m[j.roomId] ?? 0) + 1; });
    return m;
  }, [jobs]);

  const displayedJobs = useMemo(() => {
    let list = selectedRoomId === 'all' ? jobs : jobs.filter(j => j.roomId === selectedRoomId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        (j.title ?? '').toLowerCase().includes(q) ||
        (j.company ?? '').toLowerCase().includes(q) ||
        (j.rawJd ?? '').toLowerCase().includes(q)
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
      setSelectedRoomId(args.roomId);
    }
  }

  function handleBuildCV(job: VaultJob) {
    patchJob(job.id, { status: 'building' });
    setQuickCheckJob(null);
    onBuildCV(job);          // pass the full VaultJob — parent reads job.rawJd, job.company, job.title
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Job Vault</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Save JDs now · build your CV when you're ready
          </p>
        </div>
        <button
          onClick={() => setCaptureOpen(true)}
          className="flex items-center gap-2 self-start sm:self-auto px-4 py-2.5 rounded-2xl text-sm font-extrabold text-white hover:opacity-90 hover:shadow-md transition-all shadow-sm flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
        >
          <Plus className="h-4 w-4" />
          Add JD
        </button>
      </div>

      {/* ── Closing soon alert ─────────────────────────────────── */}
      {jobs.length > 0 && <ClosingSoonBar jobs={jobs} onViewJob={setQuickCheckJob} />}

      {/* ── Stats (only when vault has jobs) ───────────────────── */}
      {jobs.length > 0 && <StatsBar jobs={jobs} />}

      {/* ── Room filter pills ───────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mb-4 flex-shrink-0">
        <button
          onClick={() => setSelectedRoomId('all')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
            selectedRoomId === 'all'
              ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
              : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
          }`}
        >
          All
          {jobs.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              selectedRoomId === 'all'
                ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
                : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400'
            }`}>{jobs.length}</span>
          )}
        </button>

        {profiles.map(slot => {
          const count    = countByRoom[slot.id] ?? 0;
          const pill     = getRoomPill(slot.color);
          const isSelected = selectedRoomId === slot.id;
          return (
            <button
              key={slot.id}
              onClick={() => setSelectedRoomId(slot.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isSelected
                  ? `${pill.bg} ${pill.text} border-transparent`
                  : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
              }`}
            >
              {isSelected && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pill.dot}`} />}
              {slot.name}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isSelected
                    ? `${pill.bg} ${pill.text}`
                    : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search + sort ───────────────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 dark:text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vault…"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30"
            />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 bg-zinc-50 dark:bg-neutral-800 p-1 rounded-2xl border border-zinc-100 dark:border-neutral-700">
            {(['newest','match','deadline'] as SortKey[]).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  sortBy === s
                    ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
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
            <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-neutral-800 flex items-center justify-center border border-zinc-100 dark:border-neutral-700">
              <Search className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">No jobs match your search</p>
            <button onClick={() => { setSearch(''); setSelectedRoomId('all'); }}
              className="text-xs font-bold text-[#C9A84C] hover:underline">Clear filters</button>
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
            {displayedJobs.length !== jobs.length && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center pb-4">
                Showing {displayedJobs.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Capture Modal ───────────────────────────────────────── */}
      {captureOpen && (
        <VaultCapturePanel
          profiles={profiles}
          activeRoomId={activeRoomId}
          onSave={handleSave}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {/* ── Quick Check Drawer ──────────────────────────────────── */}
      {quickCheckJob && (
        <VaultQuickActions
          job={quickCheckJob}
          onBuildCV={handleBuildCV}
          onPatch={(id, patch) => {
            patchJob(id, patch);
            // Keep drawer job in sync with patched data
            setQuickCheckJob(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
          }}
          onClose={() => setQuickCheckJob(null)}
        />
      )}
    </div>
  );
};

export default VaultPage;
