import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrackedApplication, SavedCV, ApplicationStatus, ApplicationPriority, STARStory } from '../types';
import { Plus, Trash, Search, Calendar, Building, Briefcase, ExternalLink, CheckCircle, Clock, XCircle, AlertCircle, Bookmark, Filter } from './icons';
import { canAddTrackedApp, FREE_TRACKER_LIMIT, isPureFreeTier } from '../services/accountTierService';

interface TrackerProps {
  trackedApps: TrackedApplication[];
  setTrackedApps: React.Dispatch<React.SetStateAction<TrackedApplication[]>>;
  savedCVs: SavedCV[];
  starStories?: STARStory[];
  setStarStories?: React.Dispatch<React.SetStateAction<STARStory[]>>;
}

const STATUS_CONFIG: Record<ApplicationStatus, {
  label: string; color: string; bg: string; border: string;
  dot: string; icon: React.FC<{ className?: string }>;
}> = {
  Wishlist:    { label: 'Wishlist',    color: 'text-zinc-600 dark:text-zinc-300',      bg: 'bg-zinc-100 dark:bg-neutral-800',          border: 'border-zinc-300 dark:border-neutral-600',    dot: 'bg-zinc-400',     icon: Bookmark },
  Applied:     { label: 'Applied',     color: 'text-blue-700 dark:text-blue-300',      bg: 'bg-blue-50 dark:bg-blue-900/20',            border: 'border-blue-300 dark:border-blue-700',       dot: 'bg-blue-500',     icon: Clock },
  Interviewing:{ label: 'Interviewing',color: 'text-amber-700 dark:text-amber-300',    bg: 'bg-amber-50 dark:bg-amber-900/20',          border: 'border-amber-300 dark:border-amber-700',     dot: 'bg-amber-500',    icon: Calendar },
  Offer:       { label: 'Offer',       color: 'text-emerald-700 dark:text-emerald-300',bg: 'bg-emerald-50 dark:bg-emerald-900/20',      border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500',  icon: CheckCircle },
  Rejected:    { label: 'Rejected',    color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-50 dark:bg-rose-900/20',            border: 'border-rose-300 dark:border-rose-700',       dot: 'bg-rose-500',     icon: XCircle },
};

const PRIORITY_CONFIG: Record<ApplicationPriority, { label: string; pill: string; bar: string }> = {
  Low:   { label: 'Low',    pill: 'bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400',       bar: 'bg-zinc-300' },
  Medium:{ label: 'Medium', pill: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',       bar: 'bg-blue-400' },
  High:  { label: 'High',   pill: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', bar: 'bg-orange-400' },
  Dream: { label: '⭐ Dream',pill: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400', bar: 'bg-violet-500' },
};

const STATUSES: ApplicationStatus[] = ['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

const emptyForm = (): Omit<TrackedApplication, 'id'> => ({
  savedCvId: '', savedCvName: '', roleTitle: '', company: '',
  status: 'Wishlist', dateApplied: new Date().toISOString().split('T')[0],
  deadline: '', interviewDate: '', jobUrl: '', salary: '', priority: 'Medium', notes: '',
});

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function formatDate(s: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return s; }
}

function CompanyAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const letter = name?.charAt(0).toUpperCase() || '?';
  const colors = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500',
  ];
  const color = colors[name?.charCodeAt(0) % colors.length ?? 0];
  const sz = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} ${color} rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}>
      {letter}
    </div>
  );
}

const AppCard: React.FC<{
  app: TrackedApplication;
  onEdit: (a: TrackedApplication) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  compact?: boolean;
}> = ({ app, onEdit, onDelete, compact }) => {
  const cfg = STATUS_CONFIG[app.status];
  const pri = app.priority ? PRIORITY_CONFIG[app.priority] : null;
  const deadlineDays = daysUntil(app.deadline);
  const interviewDays = daysUntil(app.interviewDate);
  const deadlineUrgent = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3;
  const interviewSoon  = interviewDays !== null && interviewDays >= 0 && interviewDays <= 7;

  if (compact) {
    return (
      <div
        onClick={() => onEdit(app)}
        className="group bg-white dark:bg-neutral-800 rounded-xl border border-zinc-100 dark:border-neutral-700 hover:border-[#C9A84C]/50 hover:shadow-md transition-all duration-150 cursor-pointer overflow-hidden"
      >
        <div className={`h-0.5 ${cfg.dot}`} />
        <div className="p-3">
          <div className="flex items-start justify-between gap-1.5 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <CompanyAvatar name={app.company} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50 truncate leading-tight">{app.roleTitle}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{app.company}</p>
              </div>
            </div>
            <button
              onClick={e => onDelete(app.id, e)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-300 hover:text-rose-400 transition-all flex-shrink-0 mt-0.5"
            >
              <Trash className="h-3 w-3" />
            </button>
          </div>
          {(deadlineUrgent || interviewSoon) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {deadlineUrgent && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                  <AlertCircle className="h-2.5 w-2.5" />{deadlineDays === 0 ? 'Due today' : `${deadlineDays}d left`}
                </span>
              )}
              {interviewSoon && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  <Calendar className="h-2.5 w-2.5" />{interviewDays === 0 ? 'Interview today' : `Interview ${interviewDays}d`}
                </span>
              )}
            </div>
          )}
          {app.salary && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">{app.salary}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onEdit(app)}
      className="group bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-100 dark:border-neutral-700 hover:border-[#C9A84C]/50 hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden"
    >
      <div className={`h-1 ${cfg.dot}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CompanyAvatar name={app.company} />
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-sm leading-snug truncate">{app.roleTitle}</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1 mt-0.5">
                <Building className="h-3 w-3 flex-shrink-0" /><span className="truncate">{app.company}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {pri && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pri.pill}`}>{pri.label}</span>
            )}
            <button
              onClick={e => onDelete(app.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-300 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 ${cfg.bg} ${cfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>

        <div className="space-y-1.5 border-t border-zinc-50 dark:border-neutral-700/60 pt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 flex items-center gap-1"><Calendar className="h-3 w-3" />Applied</span>
            <span className="font-semibold text-zinc-600 dark:text-zinc-300">{formatDate(app.dateApplied)}</span>
          </div>
          {app.deadline && (
            <div className="flex items-center justify-between text-[11px]">
              <span className={`flex items-center gap-1 font-semibold ${deadlineUrgent ? 'text-rose-500' : 'text-zinc-400'}`}>
                <AlertCircle className="h-3 w-3" />Deadline
              </span>
              <span className={`font-bold ${deadlineUrgent ? 'text-rose-500' : 'text-zinc-600 dark:text-zinc-300'}`}>
                {formatDate(app.deadline)}{deadlineDays !== null && deadlineDays <= 7 ? ` · ${deadlineDays}d` : ''}
              </span>
            </div>
          )}
          {app.interviewDate && (
            <div className="flex items-center justify-between text-[11px]">
              <span className={`flex items-center gap-1 font-semibold ${interviewSoon ? 'text-amber-500' : 'text-zinc-400'}`}>
                <Clock className="h-3 w-3" />Interview
              </span>
              <span className={`font-bold ${interviewSoon ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                {formatDate(app.interviewDate)}{interviewDays !== null && interviewDays >= 0 ? ` · ${interviewDays}d` : ''}
              </span>
            </div>
          )}
          {app.salary && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Salary</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{app.salary}</span>
            </div>
          )}
          {app.savedCvName && app.savedCvName !== 'Manual Entry' && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">CV Used</span>
              <span className="font-semibold text-[#1B2B4B] dark:text-[#C9A84C] truncate max-w-[130px]">{app.savedCvName}</span>
            </div>
          )}
        </div>

        {app.notes && (
          <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-2 italic border-t border-zinc-50 dark:border-neutral-700/60 pt-2.5">"{app.notes}"</p>
        )}

        {app.jobUrl && (
          <a
            href={app.jobUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline"
          >
            <ExternalLink className="h-3 w-3" />View Posting
          </a>
        )}
      </div>
    </div>
  );
};

const Tracker: React.FC<TrackerProps> = ({ trackedApps, setTrackedApps, savedCVs, starStories = [], setStarStories }) => {
  const [mainTab, setMainTab] = useState<'applications' | 'stories'>('applications');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Omit<TrackedApplication, 'id'> | TrackedApplication>(emptyForm());
  const [pendingFeedback, setPendingFeedback] = useState<TrackedApplication | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('kanban');
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const shownNotifIds = useRef<Set<string>>(new Set());
  const roleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isModalOpen) setTimeout(() => roleInputRef.current?.focus(), 50);
  }, [isModalOpen]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = new Date();
    trackedApps.forEach(app => {
      if (!app.deadline) return;
      const daysLeft = Math.ceil((new Date(app.deadline).getTime() - now.getTime()) / 86400000);
      if (daysLeft < 0 || daysLeft > 3) return;
      const notifId = `deadline-${app.id}-${app.deadline}`;
      if (shownNotifIds.current.has(notifId)) return;
      shownNotifIds.current.add(notifId);
      new Notification(`Application Deadline ${daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow!' : `in ${daysLeft} days`}`, {
        body: `${app.roleTitle} at ${app.company}`,
        icon: '/favicon.ico',
        tag: notifId,
      });
    });
  }, [trackedApps]);

  const stats = useMemo(() => {
    const applied     = trackedApps.filter(a => a.status === 'Applied').length;
    const interviewing = trackedApps.filter(a => a.status === 'Interviewing').length;
    const offers      = trackedApps.filter(a => a.status === 'Offer').length;
    const rejected    = trackedApps.filter(a => a.status === 'Rejected').length;
    const wishlist    = trackedApps.filter(a => a.status === 'Wishlist').length;
    const responded   = interviewing + offers + rejected;
    const responseRate = applied + responded > 0 ? Math.round((responded / (applied + responded)) * 100) : 0;
    const winRate     = applied + responded > 0 ? Math.round((offers / (applied + responded)) * 100) : 0;
    const upcoming    = trackedApps.filter(a => { const d = daysUntil(a.interviewDate); return d !== null && d >= 0 && d <= 7; }).length;
    return { total: trackedApps.length, wishlist, applied, interviewing, offers, rejected, responseRate, winRate, upcoming };
  }, [trackedApps]);

  const filtered = useMemo(() => trackedApps.filter(app => {
    const matchSearch = !searchTerm || app.roleTitle.toLowerCase().includes(searchTerm.toLowerCase()) || app.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'All' || app.status === statusFilter;
    return matchSearch && matchStatus;
  }), [trackedApps, searchTerm, statusFilter]);

  const kanbanColumns = useMemo(() => STATUSES.map(s => ({
    status: s,
    apps: filtered.filter(a => a.status === s),
  })), [filtered]);

  const openModal = (app?: TrackedApplication) => {
    setEditingApp(app ? { ...app } : emptyForm());
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setEditingApp(emptyForm()); };

  const handleSave = () => {
    if (!editingApp.roleTitle.trim() || !editingApp.company.trim()) return;
    const selectedCv = savedCVs.find(cv => cv.id === editingApp.savedCvId);
    const withCvName = { ...editingApp, savedCvName: selectedCv?.name || 'Manual Entry' };
    if ('id' in withCvName) {
      setTrackedApps(prev => prev.map(a => a.id === (withCvName as TrackedApplication).id ? withCvName as TrackedApplication : a));
    } else {
      setTrackedApps(prev => [{ ...withCvName, id: Date.now().toString() } as TrackedApplication, ...prev]);
    }
    closeModal();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Remove this application from your tracker?')) {
      setTrackedApps(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleStatusChange = (id: string, status: ApplicationStatus) => {
    setTrackedApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    // Trigger outcome feedback card when an app reaches a positive milestone
    if (status === 'Interviewing' || status === 'Offer') {
      const app = trackedApps.find(a => a.id === id);
      if (app && !app.interviewFeedback) {
        setPendingFeedback({ ...app, status });
        setFeedbackNote('');
      }
    }
  };

  const handleRecordFeedback = (note: string) => {
    if (!pendingFeedback) return;
    setTrackedApps(prev => prev.map(a =>
      a.id === pendingFeedback.id
        ? { ...a, interviewFeedback: { gotInterview: true, note: note.trim() || undefined, recordedAt: new Date().toISOString() } }
        : a
    ));
    setPendingFeedback(null);
    setFeedbackNote('');
  };

  const handleDeleteStory = (id: string) => {
    if (window.confirm('Delete this story from your bank?')) {
      setStarStories?.(prev => prev.filter(s => s.id !== id));
    }
  };

  const field = (label: string, children: React.ReactNode) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{label}</label>
      {children}
    </div>
  );

  const inputCls = "w-full h-10 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C] transition";
  const selectCls = `${inputCls} appearance-none`;

  return (
    <div className="space-y-6">

      {/* ── Outcome feedback card ── */}
      {pendingFeedback && (
        <div className="rounded-xl border border-[#C9A84C]/50 bg-yellow-50 dark:bg-yellow-900/10 p-4 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="text-2xl flex-shrink-0">🎉</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 mb-0.5">
              {pendingFeedback.status === 'Offer' ? 'Offer received!' : 'Interview landed!'} — {pendingFeedback.roleTitle} @ {pendingFeedback.company}
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
              Help us learn what works — add a quick note (optional) and we'll track this outcome.
            </p>
            <textarea
              value={feedbackNote}
              onChange={e => setFeedbackNote(e.target.value)}
              placeholder="e.g. Used the Navy Sidebar template, focused on leadership bullets…"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 mb-3"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleRecordFeedback(feedbackNote)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#C9A84C] text-[#1B2B4B] hover:opacity-90 transition-opacity"
              >
                Save outcome
              </button>
              <button
                onClick={() => setPendingFeedback(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 hover:opacity-80 transition-opacity"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main tab switcher ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1 border border-zinc-200 dark:border-neutral-700">
          <button
            onClick={() => setMainTab('applications')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mainTab === 'applications' ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] dark:text-[#C9A84C] shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Applications {trackedApps.length > 0 && <span className="ml-1.5 bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] text-[9px] font-black px-1.5 py-0.5 rounded-full">{trackedApps.length}</span>}
          </button>
          <button
            onClick={() => setMainTab('stories')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${mainTab === 'stories' ? 'bg-white dark:bg-neutral-700 text-violet-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Story Bank {starStories.length > 0 && <span className="ml-1.5 bg-violet-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{starStories.length}</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {typeof Notification !== 'undefined' && notifPermission !== 'granted' && (
            <button
              onClick={() => Notification.requestPermission().then(p => setNotifPermission(p))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />Alerts
            </button>
          )}
          {mainTab === 'applications' && (
            canAddTrackedApp(trackedApps.length) ? (
              <button
                onClick={() => openModal()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#1B2B4B] hover:bg-[#152238] text-white shadow-md shadow-[#1B2B4B]/20 transition-all active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />Track Job
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  {FREE_TRACKER_LIMIT}/{FREE_TRACKER_LIMIT} free slots used
                </span>
                <button
                  onClick={() => {
                    const e = new CustomEvent('procv:openPricing');
                    window.dispatchEvent(e);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#C9A84C] hover:bg-[#b8963f] text-white shadow-md transition-all active:scale-95"
                >
                  Upgrade to track more
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Story Bank tab ── */}
      {mainTab === 'stories' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">STAR+R Interview Story Bank</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Save stories from job analyses — build a reusable bank for any interview.</p>
          </div>
          {starStories.length === 0 ? (
            <div className="p-14 text-center bg-gradient-to-b from-violet-50 to-white dark:from-violet-900/10 dark:to-neutral-900 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800/30">
              <div className="w-14 h-14 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300 mb-1.5">Story bank is empty</p>
              <p className="text-xs text-violet-500 dark:text-violet-400 max-w-xs mx-auto leading-relaxed">Run a job analysis in CV Generator and save STAR+R stories from the Interview Prep tab.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {starStories.map((story) => (
                <div key={story.id} className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-800 shadow-sm">
                  <button
                    onClick={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-neutral-700/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {story.linkedCompany && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1B2B4B]/5 text-[#1B2B4B] dark:bg-[#C9A84C]/10 dark:text-[#C9A84C]">{story.linkedCompany}</span>
                        )}
                        {story.linkedRole && <span className="text-[10px] text-zinc-400">{story.linkedRole}</span>}
                      </div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{story.jobRequirement}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate italic">Situation: {story.situation}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-[10px] text-zinc-400">{new Date(story.createdAt).toLocaleDateString()}</span>
                      <button onClick={e => { e.stopPropagation(); handleDeleteStory(story.id); }} className="p-1.5 text-zinc-300 hover:text-rose-400 rounded-lg transition-colors">
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-zinc-300 text-xs">{expandedStory === story.id ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {expandedStory === story.id && (
                    <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-zinc-100 dark:border-neutral-700 pt-3">
                      {([
                        { key: 'S', label: 'Situation', value: story.situation, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' },
                        { key: 'T', label: 'Task',      value: story.task,      cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200' },
                        { key: 'A', label: 'Action',    value: story.action,    cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' },
                        { key: 'R', label: 'Result',    value: story.result,    cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' },
                      ] as const).map(item => (
                        <div key={item.key} className={`rounded-xl p-3 ${item.cls}`}>
                          <div className="text-[10px] font-black mb-1 opacity-70">{item.key} — {item.label}</div>
                          <p className="text-xs leading-relaxed">{item.value}</p>
                        </div>
                      ))}
                      <div className="sm:col-span-2 rounded-xl p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200 border-l-4 border-rose-400">
                        <div className="text-[10px] font-black mb-1 opacity-70">+R — Reflection (signals seniority)</div>
                        <p className="text-xs leading-relaxed">{story.reflection}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Applications tab ── */}
      {mainTab === 'applications' && (<>

        {/* Pipeline stats */}
        {trackedApps.length > 0 && (
          <div className="bg-gradient-to-br from-[#1B2B4B] to-[#243660] rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">Pipeline Overview</p>
                <p className="text-lg font-extrabold mt-0.5">{stats.total} Application{stats.total !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-4 text-right">
                {stats.applied + stats.interviewing + stats.offers + stats.rejected > 0 && (
                  <>
                    <div>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider">Response</p>
                      <p className="text-xl font-black text-[#C9A84C]">{stats.responseRate}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider">Offer rate</p>
                      <p className="text-xl font-black text-emerald-400">{stats.winRate}%</p>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {STATUSES.map(s => {
                const count = trackedApps.filter(a => a.status === s).length;
                const pct = trackedApps.length > 0 ? Math.round((count / trackedApps.length) * 100) : 0;
                return (
                  <div key={s} className="text-center">
                    <div className="text-xl font-black">{count}</div>
                    <div className="text-[10px] text-white/60 font-semibold mb-1.5">{s}</div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${STATUS_CONFIG[s].dot}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {stats.upcoming > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Calendar className="h-3.5 w-3.5" />
                {stats.upcoming} interview{stats.upcoming !== 1 ? 's' : ''} this week — stay sharp!
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              placeholder="Search roles or companies…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] transition"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as ApplicationStatus | 'All')}
                className="h-10 pl-3 pr-8 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] appearance-none transition"
              >
                <option value="All">All Stages</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            </div>
            <div className="flex items-center bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1 border border-zinc-200 dark:border-neutral-700">
              {(['kanban', 'grid'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${viewMode === mode ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] dark:text-[#C9A84C] shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid view */}
        {viewMode === 'grid' && (
          filtered.length === 0 ? (
            <div className="py-20 text-center bg-zinc-50 dark:bg-neutral-800/30 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700">
              <div className="w-14 h-14 bg-zinc-100 dark:bg-neutral-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Briefcase className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
              </div>
              <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400 mb-1.5">
                {searchTerm || statusFilter !== 'All' ? 'No matching applications' : 'No applications tracked yet'}
              </p>
              <p className="text-xs text-zinc-400 mb-5 max-w-xs mx-auto">
                {searchTerm || statusFilter !== 'All' ? 'Try adjusting your search or filter.' : 'Start tracking your job search to stay organised and ahead.'}
              </p>
              {!searchTerm && statusFilter === 'All' && (
                <button
                  onClick={() => openModal()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-sm font-bold shadow-md hover:bg-[#152238] transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" />Add first application
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(app => (
                <AppCard key={app.id} app={app} onEdit={openModal} onDelete={handleDelete} />
              ))}
            </div>
          )
        )}

        {/* Kanban view */}
        {viewMode === 'kanban' && (
          <div className="overflow-x-auto -mx-1 px-1 pb-4">
            <div className="flex gap-3 min-w-[860px]">
              {kanbanColumns.map(col => {
                const cfg = STATUS_CONFIG[col.status];
                const Icon = cfg.icon;
                return (
                  <div key={col.status} className="flex-1 min-w-[165px] flex flex-col">
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-2.5 border ${cfg.bg} ${cfg.border}`}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{col.apps.length}</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      {col.apps.map(app => (
                        <AppCard key={app.id} app={app} onEdit={openModal} onDelete={handleDelete} compact />
                      ))}
                      {col.apps.length === 0 && (
                        <button
                          onClick={() => { openModal(); setEditingApp({ ...emptyForm(), status: col.status }); }}
                          className="w-full rounded-xl border-2 border-dashed border-zinc-100 dark:border-neutral-800 hover:border-zinc-200 dark:hover:border-neutral-700 p-4 text-center text-[11px] text-zinc-400 dark:text-zinc-600 hover:text-zinc-500 transition-colors group"
                        >
                          <Plus className="h-4 w-4 mx-auto mb-1 opacity-40 group-hover:opacity-70 transition-opacity" />
                          Add here
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state — no apps at all */}
        {trackedApps.length === 0 && (
          <div className="py-20 text-center bg-gradient-to-b from-[#F8F7F4] to-white dark:from-neutral-800/30 dark:to-neutral-900/20 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700">
            <div className="w-16 h-16 bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Briefcase className="h-8 w-8 text-[#1B2B4B]/40 dark:text-[#C9A84C]/60" />
            </div>
            <h3 className="text-base font-bold text-zinc-700 dark:text-zinc-300 mb-2">Your tracker is empty</h3>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">Add every job you apply for — see your pipeline, catch deadlines, and spot patterns in your search.</p>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] text-white font-bold shadow-lg shadow-[#1B2B4B]/20 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />Track your first application
            </button>
          </div>
        )}
      </>)}

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={closeModal}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {'id' in editingApp ? 'Edit Application' : 'Track New Application'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">Keep your job hunt organised and on schedule.</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-zinc-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {field('Role / Position *',
                  <input
                    ref={roleInputRef}
                    value={editingApp.roleTitle}
                    onChange={e => setEditingApp({ ...editingApp, roleTitle: e.target.value })}
                    placeholder="e.g. Senior Product Manager"
                    className={inputCls}
                  />
                )}
                {field('Company *',
                  <input
                    value={editingApp.company}
                    onChange={e => setEditingApp({ ...editingApp, company: e.target.value })}
                    placeholder="e.g. Stripe"
                    className={inputCls}
                  />
                )}
                {field('Status',
                  <select value={editingApp.status} onChange={e => setEditingApp({ ...editingApp, status: e.target.value as ApplicationStatus })} className={selectCls}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                {field('Priority',
                  <select value={editingApp.priority || 'Medium'} onChange={e => setEditingApp({ ...editingApp, priority: e.target.value as ApplicationPriority })} className={selectCls}>
                    {(['Dream', 'High', 'Medium', 'Low'] as ApplicationPriority[]).map(p => <option key={p} value={p}>{p === 'Dream' ? '⭐ Dream' : p}</option>)}
                  </select>
                )}
                {field('Date Applied',
                  <input type="date" value={editingApp.dateApplied} onChange={e => setEditingApp({ ...editingApp, dateApplied: e.target.value })} className={inputCls} />
                )}
                {field('Application Deadline',
                  <input type="date" value={editingApp.deadline} onChange={e => setEditingApp({ ...editingApp, deadline: e.target.value })} className={inputCls} />
                )}
                {field('Interview Date',
                  <input type="date" value={editingApp.interviewDate} onChange={e => setEditingApp({ ...editingApp, interviewDate: e.target.value })} className={inputCls} />
                )}
                {field('Salary / Range',
                  <input value={editingApp.salary} onChange={e => setEditingApp({ ...editingApp, salary: e.target.value })} placeholder="e.g. £80,000 – £95,000" className={inputCls} />
                )}
                <div className="sm:col-span-2">{field('Job Posting URL',
                  <input type="url" value={editingApp.jobUrl} onChange={e => setEditingApp({ ...editingApp, jobUrl: e.target.value })} placeholder="https://…" className={inputCls} />
                )}</div>
                {savedCVs.length > 0 && (
                  <div className="sm:col-span-2">{field('CV Used',
                    <select value={editingApp.savedCvId} onChange={e => setEditingApp({ ...editingApp, savedCvId: e.target.value })} className={selectCls}>
                      <option value="">— None —</option>
                      {savedCVs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                    </select>
                  )}</div>
                )}
                <div className="sm:col-span-2">{field('Notes',
                  <textarea
                    value={editingApp.notes}
                    onChange={e => setEditingApp({ ...editingApp, notes: e.target.value })}
                    placeholder="Recruiter name, next steps, anything to remember…"
                    rows={3}
                    className={`${inputCls} h-auto resize-none py-2.5`}
                  />
                )}</div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-100 dark:border-neutral-800 flex items-center justify-between gap-3">
              {'id' in editingApp && (
                <button
                  onClick={e => { handleDelete((editingApp as TrackedApplication).id, e); if (isModalOpen) closeModal(); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-3 py-2 rounded-xl transition-colors"
                >
                  <Trash className="h-3.5 w-3.5" />Delete
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editingApp.roleTitle.trim() || !editingApp.company.trim()}
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-[#1B2B4B] hover:bg-[#152238] text-white shadow-md shadow-[#1B2B4B]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  {'id' in editingApp ? 'Save Changes' : 'Add Application'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tracker;
