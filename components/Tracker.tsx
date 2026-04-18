import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TrackedApplication, SavedCV, ApplicationStatus, ApplicationPriority, STARStory } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Plus, Trash, Edit, Search, Filter, Calendar, Building, Briefcase, ExternalLink, CheckCircle, Clock, XCircle, AlertCircle, Bookmark } from './icons';

interface TrackerProps {
  trackedApps: TrackedApplication[];
  setTrackedApps: React.Dispatch<React.SetStateAction<TrackedApplication[]>>;
  savedCVs: SavedCV[];
  starStories?: STARStory[];
  setStarStories?: React.Dispatch<React.SetStateAction<STARStory[]>>;
}

const statusConfig: Record<ApplicationStatus, { label: string; color: string; bg: string; icon: React.FC<{ className?: string }> }> = {
  Wishlist:    { label: 'Wishlist',    color: 'text-zinc-600 dark:text-zinc-300',    bg: 'bg-zinc-100 dark:bg-neutral-800',          icon: Bookmark },
  Applied:     { label: 'Applied',     color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-900/20',           icon: Clock },
  Interviewing:{ label: 'Interviewing',color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-900/20',         icon: Calendar },
  Offer:       { label: 'Offer',       color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/20',  icon: CheckCircle },
  Rejected:    { label: 'Rejected',    color: 'text-rose-700 dark:text-rose-300',    bg: 'bg-rose-50 dark:bg-rose-900/20',           icon: XCircle },
};

const priorityConfig: Record<ApplicationPriority, { label: string; color: string }> = {
  Low:   { label: 'Low',   color: 'text-zinc-500 bg-zinc-100 dark:bg-neutral-700 dark:text-zinc-400' },
  Medium:{ label: 'Med',   color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  High:  { label: 'High',  color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400' },
  Dream: { label: '⭐ Dream', color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400' },
};

const STATUSES: ApplicationStatus[] = ['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

const emptyForm = (): Omit<TrackedApplication, 'id'> => ({
  savedCvId: '',
  savedCvName: '',
  roleTitle: '',
  company: '',
  status: 'Wishlist',
  dateApplied: new Date().toISOString().split('T')[0],
  deadline: '',
  interviewDate: '',
  jobUrl: '',
  salary: '',
  priority: 'Medium',
  notes: '',
});

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function formatDate(s: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

const AppCard: React.FC<{
  app: TrackedApplication;
  onEdit: (a: TrackedApplication) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  compact?: boolean;
}> = ({ app, onEdit, onDelete, compact }) => {
  const cfg = statusConfig[app.status];
  const StatusIcon = cfg.icon;
  const pri = app.priority ? priorityConfig[app.priority] : null;
  const deadlineDays = daysUntil(app.deadline);
  const interviewDays = daysUntil(app.interviewDate);

  return (
    <div
      onClick={() => onEdit(app)}
      className={`group relative bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 hover:border-[#C9A84C]/60 dark:hover:border-[#1B2B4B] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg ${compact ? 'p-3' : 'p-5'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
            <StatusIcon className="h-3 w-3" />{cfg.label}
          </span>
          {pri && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.color}`}>{pri.label}</span>
          )}
        </div>
        <button
          onClick={(e) => onDelete(app.id, e)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all flex-shrink-0"
        >
          <Trash className="h-3.5 w-3.5" />
        </button>
      </div>

      <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-sm leading-tight mb-0.5 line-clamp-1">{app.roleTitle}</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1 mb-2">
        <Building className="h-3 w-3 flex-shrink-0" />{app.company}
      </p>

      {!compact && (
        <div className="space-y-1 border-t border-zinc-50 dark:border-neutral-700 pt-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-400 flex items-center gap-1"><Calendar className="h-3 w-3" />Applied</span>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">{formatDate(app.dateApplied)}</span>
          </div>
          {app.deadline && (
            <div className="flex items-center justify-between text-[10px]">
              <span className={`flex items-center gap-1 ${deadlineDays !== null && deadlineDays <= 3 ? 'text-rose-500 font-bold' : 'text-zinc-400'}`}>
                <AlertCircle className="h-3 w-3" />Deadline
              </span>
              <span className={`font-medium ${deadlineDays !== null && deadlineDays <= 3 ? 'text-rose-500 font-bold' : 'text-zinc-600 dark:text-zinc-300'}`}>
                {formatDate(app.deadline)}{deadlineDays !== null && deadlineDays <= 7 ? ` (${deadlineDays}d)` : ''}
              </span>
            </div>
          )}
          {app.interviewDate && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-amber-500 flex items-center gap-1 font-semibold"><Clock className="h-3 w-3" />Interview</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {formatDate(app.interviewDate)}{interviewDays !== null && interviewDays >= 0 ? ` (${interviewDays}d)` : ''}
              </span>
            </div>
          )}
          {app.salary && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">Salary</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{app.salary}</span>
            </div>
          )}
          {app.savedCvName && app.savedCvName !== 'Manual Entry' && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400 flex items-center gap-1"><ExternalLink className="h-3 w-3" />CV</span>
              <span className="font-bold text-[#1B2B4B] dark:text-[#C9A84C] truncate max-w-[100px]">{app.savedCvName}</span>
            </div>
          )}
        </div>
      )}

      {app.notes && !compact && (
        <p className="mt-2 text-[10px] text-zinc-400 line-clamp-2 italic">"{app.notes}"</p>
      )}

      {app.jobUrl && (
        <a
          href={app.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#C9A84C] hover:text-[#1B2B4B] font-semibold"
        >
          <ExternalLink className="h-3 w-3" />View Job Posting
        </a>
      )}
    </div>
  );
};

const Tracker: React.FC<TrackerProps> = ({ trackedApps, setTrackedApps, savedCVs, starStories = [], setStarStories }) => {
  const [mainTab, setMainTab] = useState<'applications' | 'stories'>('applications');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Omit<TrackedApplication, 'id'> | TrackedApplication>(emptyForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const shownNotifIds = useRef<Set<string>>(new Set());

  // ── Deadline browser notifications ────────────────────────────────────────
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = new Date();
    trackedApps.forEach(app => {
      if (!app.deadline) return;
      const deadlineDate = new Date(app.deadline);
      const msUntil = deadlineDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
      if (daysLeft < 0 || daysLeft > 3) return;
      const notifId = `deadline-${app.id}-${app.deadline}`;
      if (shownNotifIds.current.has(notifId)) return;
      shownNotifIds.current.add(notifId);
      const urgency = daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow!' : `in ${daysLeft} days`;
      new Notification(`Application Deadline ${urgency}`, {
        body: `${app.roleTitle} at ${app.company} — deadline ${urgency}`,
        icon: '/favicon.ico',
        tag: notifId,
      });
    });
  }, [trackedApps]);

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  };

  const stats = useMemo(() => ({
    total: trackedApps.length,
    applied: trackedApps.filter(a => a.status === 'Applied').length,
    interviewing: trackedApps.filter(a => a.status === 'Interviewing').length,
    offers: trackedApps.filter(a => a.status === 'Offer').length,
    rejected: trackedApps.filter(a => a.status === 'Rejected').length,
    upcoming: trackedApps.filter(a => {
      const d = daysUntil(a.interviewDate);
      return d !== null && d >= 0 && d <= 7;
    }).length,
  }), [trackedApps]);

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

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingApp(emptyForm());
  };

  const handleSave = () => {
    if (!editingApp.roleTitle.trim() || !editingApp.company.trim()) {
      alert('Role and Company are required.');
      return;
    }
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
    if (window.confirm('Delete this application entry?')) {
      setTrackedApps(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleStatusChange = (id: string, status: ApplicationStatus) => {
    setTrackedApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const handleDeleteStory = (id: string) => {
    if (window.confirm('Delete this story from your bank?')) {
      setStarStories?.(prev => prev.filter(s => s.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Tab switcher + notification toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1 self-start w-fit border border-zinc-200 dark:border-neutral-700">
        <button
          onClick={() => setMainTab('applications')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mainTab === 'applications' ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
        >
          Applications
        </button>
        <button
          onClick={() => setMainTab('stories')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${mainTab === 'stories' ? 'bg-white dark:bg-neutral-700 text-violet-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
        >
          Interview Story Bank
          {starStories.length > 0 && (
            <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-black px-1.5 py-0.5 rounded-full">{starStories.length}</span>
          )}
        </button>
      </div>
      {/* Deadline notification bell */}
      {typeof Notification !== 'undefined' && notifPermission !== 'granted' && (
        <button
          onClick={requestNotifications}
          title="Enable deadline reminders"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" />
          Enable deadline alerts
        </button>
      )}
      {typeof Notification !== 'undefined' && notifPermission === 'granted' && (
        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <Calendar className="h-3.5 w-3.5" />
          Deadline alerts on
        </span>
      )}
      </div>

      {/* Story Bank Tab */}
      {mainTab === 'stories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">STAR+R Interview Story Bank</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Save stories from job analyses to build a reusable bank for any interview.</p>
            </div>
          </div>
          {starStories.length === 0 ? (
            <div className="p-12 text-center bg-violet-50 dark:bg-violet-900/10 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800/30">
              <div className="text-3xl mb-3">🎯</div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1">Your story bank is empty</p>
              <p className="text-xs text-violet-500 dark:text-violet-400 max-w-xs mx-auto">Generate a job analysis in the CV Generator, then save STAR+R stories from the Interview Prep tab.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {starStories.map((story) => (
                <div key={story.id} className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-800 shadow-sm">
                  <button
                    onClick={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-neutral-700/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {story.linkedCompany && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F8F7F4] text-[#1B2B4B] dark:bg-[#1B2B4B]/20 dark:text-[#C9A84C]/80">{story.linkedCompany}</span>
                        )}
                        {story.linkedRole && (
                          <span className="text-[10px] text-zinc-400">{story.linkedRole}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-1">{story.jobRequirement}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1 italic">Situation: {story.situation}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-[10px] text-zinc-400">{new Date(story.createdAt).toLocaleDateString()}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteStory(story.id); }}
                        className="p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-zinc-400 text-xs">{expandedStory === story.id ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {expandedStory === story.id && (
                    <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-zinc-100 dark:border-neutral-700 pt-3">
                      {[
                        { key: 'S', label: 'Situation', value: story.situation, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' },
                        { key: 'T', label: 'Task', value: story.task, color: 'bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200' },
                        { key: 'A', label: 'Action', value: story.action, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' },
                        { key: 'R', label: 'Result', value: story.result, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' },
                      ].map(item => (
                        <div key={item.key} className={`rounded-lg p-3 ${item.color}`}>
                          <div className="text-[10px] font-black mb-1">{item.key} — {item.label}</div>
                          <p className="text-xs leading-relaxed">{item.value}</p>
                        </div>
                      ))}
                      <div className="sm:col-span-2 rounded-lg p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200 border-l-4 border-rose-400">
                        <div className="text-[10px] font-black mb-1">+R — Reflection (signals seniority)</div>
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

      {mainTab === 'applications' && (<>
      {/* Stats Row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-zinc-700 dark:text-zinc-200', bg: 'bg-zinc-50 dark:bg-neutral-800' },
          { label: 'Applied', value: stats.applied, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Interviewing', value: stats.interviewing, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Offers', value: stats.offers, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Rejected', value: stats.rejected, color: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20' },
          { label: 'This Week', value: stats.upcoming, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-transparent`}>
            <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 min-w-0 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search roles or companies…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 text-sm h-10 rounded-xl w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full sm:w-36 h-10 pl-3 pr-8 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-[#C9A84C] appearance-none"
            >
              <option value="All">All Stages</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>

          <div className="flex items-center bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1 border border-zinc-200 dark:border-neutral-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Kanban
            </button>
          </div>

          <Button
            onClick={() => openModal()}
            className="bg-[#1B2B4B] hover:bg-[#152238] text-white border-0 shadow-md shadow-[#1B2B4B]/20 h-10 px-4 rounded-xl whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Track Job
          </Button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        filtered.length === 0 ? (
          <div className="p-12 text-center bg-zinc-50 dark:bg-neutral-800/30 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700">
            <Briefcase className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 dark:text-zinc-400 font-semibold mb-1">No applications yet</p>
            <p className="text-zinc-400 text-sm mb-4">Start tracking your job hunt to stay organized.</p>
            <Button onClick={() => openModal()} className="bg-[#1B2B4B] text-white border-0">
              <Plus className="h-4 w-4 mr-2" />Add your first application
            </Button>
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
        <div className="overflow-x-auto pb-4 -mx-2 px-2">
          <div className="flex gap-4 min-w-[900px]">
            {kanbanColumns.map(col => {
              const cfg = statusConfig[col.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={col.status} className="flex-1 min-w-[180px]">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 ${cfg.bg}`}>
                    <StatusIcon className={`h-4 w-4 ${cfg.color}`} />
                    <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                    <span className={`ml-auto text-xs font-extrabold ${cfg.color}`}>{col.apps.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.apps.map(app => (
                      <AppCard key={app.id} app={app} onEdit={openModal} onDelete={handleDelete} compact />
                    ))}
                    {col.apps.length === 0 && (
                      <div className="rounded-xl border-2 border-dashed border-zinc-100 dark:border-neutral-800 p-4 text-center text-[11px] text-zinc-400">
                        None
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeModal}>
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl w-full max-w-2xl p-8 my-4 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                  {'id' in editingApp ? 'Edit Application' : 'Track New Application'}
                </h3>
                <p className="text-sm text-zinc-500 mt-0.5">Keep your job hunt organized and on schedule.</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-zinc-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-zinc-400">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Role / Position *</Label>
                <Input value={editingApp.roleTitle} onChange={e => setEditingApp({ ...editingApp, roleTitle: e.target.value })} placeholder="e.g., Senior Software Engineer" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Company *</Label>
                <Input value={editingApp.company} onChange={e => setEditingApp({ ...editingApp, company: e.target.value })} placeholder="e.g., Google" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Status</Label>
                <select value={editingApp.status} onChange={e => setEditingApp({ ...editingApp, status: e.target.value as ApplicationStatus })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-[#C9A84C]">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Priority</Label>
                <select value={editingApp.priority || 'Medium'} onChange={e => setEditingApp({ ...editingApp, priority: e.target.value as ApplicationPriority })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-[#C9A84C]">
                  {(['Dream', 'High', 'Medium', 'Low'] as ApplicationPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Date Applied</Label>
                <Input type="date" value={editingApp.dateApplied} onChange={e => setEditingApp({ ...editingApp, dateApplied: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Application Deadline</Label>
                <Input type="date" value={editingApp.deadline || ''} onChange={e => setEditingApp({ ...editingApp, deadline: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Interview Date</Label>
                <Input type="date" value={editingApp.interviewDate || ''} onChange={e => setEditingApp({ ...editingApp, interviewDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Salary / Package</Label>
                <Input value={editingApp.salary || ''} onChange={e => setEditingApp({ ...editingApp, salary: e.target.value })} placeholder="e.g., $120k–$140k or KES 150k" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Job Posting URL</Label>
                <Input type="url" value={editingApp.jobUrl || ''} onChange={e => setEditingApp({ ...editingApp, jobUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Linked CV</Label>
                <select value={editingApp.savedCvId} onChange={e => setEditingApp({ ...editingApp, savedCvId: e.target.value })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-[#C9A84C]">
                  <option value="">No CV linked</option>
                  {savedCVs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Notes / Next Steps</Label>
              <Textarea value={editingApp.notes} onChange={e => setEditingApp({ ...editingApp, notes: e.target.value })} placeholder="Follow up on Friday, referred by Jane, portal link submitted…" rows={3} />
            </div>

            {'id' in editingApp && (
              <div className="mt-4">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">Quick Status Update</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => {
                    const c = statusConfig[s];
                    const SI = c.icon;
                    return (
                      <button
                        key={s}
                        onClick={() => setEditingApp({ ...editingApp, status: s })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${editingApp.status === s ? `border-[#1B2B4B] ${c.bg} ${c.color}` : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-[#C9A84C]/40'}`}
                      >
                        <SI className="h-3.5 w-3.5" />{s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100 dark:border-neutral-700 mt-6">
              <Button variant="ghost" onClick={closeModal} className="px-5 border border-zinc-200 dark:border-neutral-700 rounded-xl">Discard</Button>
              <Button onClick={handleSave} className="px-8 bg-[#1B2B4B] hover:bg-[#152238] text-white border-0 shadow-md shadow-[#1B2B4B]/20 rounded-xl">Save Entry</Button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
};

export default Tracker;
