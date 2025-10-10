import React, { useState } from 'react';
import { TrackedApplication, SavedCV, ApplicationStatus } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Plus, Trash, Edit } from './icons';

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

const Tracker: React.FC<TrackerProps> = ({ trackedApps, setTrackedApps, savedCVs }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<Omit<TrackedApplication, 'id'> | TrackedApplication>(emptyFormState);

    const handleOpenModal = (app?: TrackedApplication) => {
        setEditingApp(app || emptyFormState);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingApp(emptyFormState);
    };
    
    const handleSave = () => {
        const selectedCv = savedCVs.find(cv => cv.id === editingApp.savedCvId);
        const appWithCvName = { ...editingApp, savedCvName: selectedCv?.name || 'N/A' };

        if ('id' in appWithCvName) { // Editing existing
            setTrackedApps(prev => prev.map(app => app.id === appWithCvName.id ? appWithCvName : app));
        } else { // Adding new
            setTrackedApps(prev => [{ ...appWithCvName, id: Date.now().toString() }, ...prev]);
        }
        handleCloseModal();
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this tracked application?")) {
            setTrackedApps(prev => prev.filter(app => app.id !== id));
        }
    };

    const handleStatusChange = (id: string, newStatus: ApplicationStatus) => {
        setTrackedApps(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
    };
    
    const statusOptions: ApplicationStatus[] = ['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
    const statusColors: Record<ApplicationStatus, string> = {
        Wishlist: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        Applied: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        Interviewing: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
        Offer: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200',
        Rejected: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200',
    };

    return (
        <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Application Tracker</h2>
                <Button size="sm" onClick={() => handleOpenModal()}><Plus className="h-4 w-4 mr-2" />Add</Button>
            </div>
            <div className="max-h-96 overflow-x-auto">
                {trackedApps.length > 0 ? (
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-700 dark:text-zinc-300 uppercase bg-zinc-50 dark:bg-neutral-700">
                            <tr>
                                <th scope="col" className="px-4 py-2">Role</th>
                                <th scope="col" className="px-4 py-2">CV</th>
                                <th scope="col" className="px-4 py-2">Status</th>
                                <th scope="col" className="px-4 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trackedApps.map(app => (
                                <tr key={app.id} className="border-b dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-700/50">
                                    <td className="px-4 py-2 font-medium">
                                        {app.roleTitle}
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-normal">{app.company}</p>
                                    </td>
                                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400 truncate max-w-[100px]">{app.savedCvName}</td>
                                    <td className="px-4 py-2">
                                        <select
                                            value={app.status}
                                            onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                                            className={`text-xs p-1 rounded-md border-0 focus:ring-2 focus:ring-indigo-500 ${statusColors[app.status]}`}
                                        >
                                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2 flex items-center gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenModal(app)} className="p-1 h-auto"><Edit className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(app.id)} className="p-1 h-auto text-red-500 hover:text-red-600"><Trash className="h-4 w-4" /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">No applications tracked yet.</p>
                )}
            </div>

            {isModalOpen && (
                 <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={handleCloseModal}>
                    <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold">{'id' in editingApp ? 'Edit' : 'Add'} Application</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><Label>Role / Grant Title</Label><Input value={editingApp.roleTitle} onChange={e => setEditingApp({...editingApp, roleTitle: e.target.value})} className="mt-1"/></div>
                                <div><Label>Company / Institution</Label><Input value={editingApp.company} onChange={e => setEditingApp({...editingApp, company: e.target.value})} className="mt-1"/></div>
                            </div>
                             <div>
                                <Label>CV Used</Label>
                                <select value={editingApp.savedCvId} onChange={e => setEditingApp({...editingApp, savedCvId: e.target.value})} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-zinc-300 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg">
                                    <option value="">Select a CV</option>
                                    {savedCVs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Status</Label>
                                    <select value={editingApp.status} onChange={e => setEditingApp({...editingApp, status: e.target.value as ApplicationStatus})} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-zinc-300 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg">
                                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div><Label>Date Applied</Label><Input type="date" value={editingApp.dateApplied} onChange={e => setEditingApp({...editingApp, dateApplied: e.target.value})} className="mt-1"/></div>
                            </div>
                            <div><Label>Notes</Label><Textarea value={editingApp.notes} onChange={e => setEditingApp({...editingApp, notes: e.target.value})} rows={3} className="mt-1"/></div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="secondary" onClick={handleCloseModal}>Cancel</Button>
                            <Button onClick={handleSave}>Save</Button>
                        </div>
                    </div>
                 </div>
            )}
        </div>
    );
};

export default Tracker;
