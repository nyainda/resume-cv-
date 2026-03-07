import React, { useState, useMemo } from 'react';
import { TrackedApplication, SavedCV, ApplicationStatus } from '../types';
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

const emptyFormState: Omit<TrackedApplication, 'id'> = {
    savedCvId: '',
    savedCvName: '',
    roleTitle: '',
    company: '',
    status: 'Wishlist',
    dateApplied: new Date().toISOString().split('T')[0],
    notes: '',
};

const statusConfig: Record<ApplicationStatus, { label: string, color: string, icon: any }> = {
    Wishlist: { label: 'Wishlist', color: 'bg-zinc-100 text-zinc-700 dark:bg-neutral-800 dark:text-zinc-300', icon: Bookmark },
    Applied: { label: 'Applied', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: Clock },
    Interviewing: { label: 'Interviewing', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: Calendar },
    Offer: { label: 'Offer', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle },
    Rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', icon: XCircle },
};

const Tracker: React.FC<TrackerProps> = ({ trackedApps, setTrackedApps, savedCVs }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<Omit<TrackedApplication, 'id'> | TrackedApplication>(emptyFormState);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>('All');

    const filteredApps = useMemo(() => {
        return trackedApps.filter(app => {
            const matchesSearch = app.roleTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.company.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [trackedApps, searchTerm, statusFilter]);

    const handleOpenModal = (app?: TrackedApplication) => {
        setEditingApp(app || emptyFormState);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingApp(emptyFormState);
    };

    const handleSave = () => {
        if (!editingApp.roleTitle || !editingApp.company) {
            alert("Title and Company/Institution are required.");
            return;
        }

        const selectedCv = savedCVs.find(cv => cv.id === editingApp.savedCvId);
        const appWithCvName = { ...editingApp, savedCvName: selectedCv?.name || 'Manual Entry' };

        if ('id' in appWithCvName) {
            setTrackedApps(prev => prev.map(app => app.id === appWithCvName.id ? (appWithCvName as TrackedApplication) : app));
        } else {
            setTrackedApps(prev => [{ ...appWithCvName, id: Date.now().toString() } as TrackedApplication, ...prev]);
        }
        handleCloseModal();
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Delete this application tracker entry?")) {
            setTrackedApps(prev => prev.filter(app => app.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                        placeholder="Search roles or companies..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10 text-sm h-10 rounded-xl"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="w-full sm:w-40 h-10 pl-3 pr-10 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-indigo-500 appearance-none"
                        >
                            <option value="All">All Statuses</option>
                            {Object.keys(statusConfig).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                    </div>
                    <Button onClick={() => handleOpenModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-lg shadow-indigo-500/25 h-10 px-4 rounded-xl">
                        <Plus className="h-4 w-4 mr-2" /> New Entry
                    </Button>
                </div>
            </div>

            {filteredApps.length === 0 ? (
                <div className="p-12 text-center bg-zinc-50 dark:bg-neutral-800/30 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700">
                    <AlertCircle className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">No results found.</p>
                    <button onClick={() => { setSearchTerm(''); setStatusFilter('All'); }} className="text-indigo-600 text-sm font-bold mt-2 hover:underline">Clear filters</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredApps.map(app => {
                        const config = statusConfig[app.status];
                        const StatusIcon = config.icon;
                        return (
                            <div
                                key={app.id}
                                onClick={() => handleOpenModal(app)}
                                className="group relative bg-white dark:bg-neutral-800 p-5 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                                        <StatusIcon className="h-3 w-3" /> {config.label}
                                    </span>
                                    <button onClick={(e) => handleDelete(app.id, e)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all">
                                        <Trash className="h-4 w-4" />
                                    </button>
                                </div>
                                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1 flex items-center gap-2">
                                    <Briefcase className="h-4 w-4 text-zinc-400" /> {app.roleTitle}
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-2 mb-4">
                                    <Building className="h-4 w-4 text-zinc-400" /> {app.company}
                                </p>

                                <div className="space-y-2 border-t border-zinc-50 dark:border-neutral-700 pt-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-400 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Applied on</span>
                                        <span className="font-semibold text-zinc-600 dark:text-zinc-300">{new Date(app.dateApplied).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-400 flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> CV Used</span>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[120px]">{app.savedCvName}</span>
                                    </div>
                                </div>
                                {app.notes && (
                                    <p className="mt-3 text-[11px] text-zinc-500 line-clamp-2 italic italic">
                                        "{app.notes}"
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={handleCloseModal}>
                    <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl w-full max-w-xl p-8 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{'id' in editingApp ? 'Update Application' : 'Create New Tracker'}</h3>
                                <p className="text-sm text-zinc-500 mt-1">Keep your application journey organized.</p>
                            </div>
                            <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-100 dark:hover:bg-neutral-700 rounded-full transition-colors font-bold text-zinc-400">
                                <XCircle className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Role / Position / Grant</Label>
                                <Input
                                    value={editingApp.roleTitle}
                                    onChange={e => setEditingApp({ ...editingApp, roleTitle: e.target.value })}
                                    placeholder="e.g., Senior Software Engineer"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Company / Organization</Label>
                                <Input
                                    value={editingApp.company}
                                    onChange={e => setEditingApp({ ...editingApp, company: e.target.value })}
                                    placeholder="e.g., Google or Commonwealth"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">CV Linkage</Label>
                                <select
                                    value={editingApp.savedCvId}
                                    onChange={e => setEditingApp({ ...editingApp, savedCvId: e.target.value })}
                                    className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Manual Entry (No CV Linked)</option>
                                    {savedCVs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Current Status</Label>
                                <select
                                    value={editingApp.status}
                                    onChange={e => setEditingApp({ ...editingApp, status: e.target.value as ApplicationStatus })}
                                    className="w-full h-11 px-3 text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/50 focus:ring-2 focus:ring-indigo-500"
                                >
                                    {(['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'] as ApplicationStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Application Date</Label>
                                <Input
                                    type="date"
                                    value={editingApp.dateApplied}
                                    onChange={e => setEditingApp({ ...editingApp, dateApplied: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mt-6 space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Personal Notes / Next Steps</Label>
                            <Textarea
                                value={editingApp.notes}
                                onChange={e => setEditingApp({ ...editingApp, notes: e.target.value })}
                                placeholder="Follow up on Tuesday, met with hiring manager..."
                                rows={4}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-8">
                            <Button variant="ghost" onClick={handleCloseModal} className="px-6 border border-zinc-200 dark:border-neutral-700 rounded-xl">Discard</Button>
                            <Button onClick={handleSave} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-lg shadow-indigo-500/20 rounded-xl">Save Tracker</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tracker;
