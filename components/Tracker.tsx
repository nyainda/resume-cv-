import React, { useState, useMemo } from 'react';
import { TrackedApplication, SavedCV, ApplicationStatus, ApplicationPriority } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Plus, Trash, Edit, Search, Filter, Calendar, Building, Briefcase, ExternalLink, CheckCircle, Clock, XCircle, AlertCircle, Bookmark } from './icons';

interface TrackerProps {
  trackedApps: TrackedApplication[];
  setTrackedApps: React.Dispatch<React.SetStateAction<TrackedApplication[]>>;
  savedCVs: SavedCV[];
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
      className={`group relative bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg ${compact ? 'p-3' : 'p-5'}`}
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
              <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[100px]">{app.savedCvName}</span>
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
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold"
        >
          <ExternalLink className="h-3 w-3" />View Job Posting
        </a>
      )}
    </div>
  );
};

const Tracker: React.FC<TrackerProps> = ({ trackedApps, setTrackedApps, savedCVs }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Omit<TrackedApplication, 'id'> | TrackedApplication>(emptyForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');

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

  return (
    <div className="space-y-6">
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
              className="w-full sm:w-36 h-10 pl-3 pr-8 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-indigo-500 appearance-none"
            >
              <option value="All">All Stages</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>

          <div className="flex items-center bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1 border border-zinc-200 dark:border-neutral-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-neutral-700 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Kanban
            </button>
          </div>

          <Button
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-md shadow-indigo-500/20 h-10 px-4 rounded-xl whitespace-nowrap"
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
            <Button onClick={() => openModal()} className="bg-indigo-600 text-white border-0">
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
                <select value={editingApp.status} onChange={e => setEditingApp({ ...editingApp, status: e.target.value as ApplicationStatus })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-indigo-500">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Priority</Label>
                <select value={editingApp.priority || 'Medium'} onChange={e => setEditingApp({ ...editingApp, priority: e.target.value as ApplicationPriority })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-indigo-500">
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
                <select value={editingApp.savedCvId} onChange={e => setEditingApp({ ...editingApp, savedCvId: e.target.value })} className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-indigo-500">
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
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${editingApp.status === s ? `border-indigo-500 ${c.bg} ${c.color}` : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-indigo-300'}`}
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
              <Button onClick={handleSave} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-md shadow-indigo-500/20 rounded-xl">Save Entry</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tracker;
