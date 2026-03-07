import React, { useState } from 'react';
import { SavedCV, CVData, TemplateName } from '../types';
import { Button } from './ui/Button';
import { Trash, Eye, Download, FileText, BookOpen, Briefcase, Globe, RefreshCw } from './icons';
import TemplateThumbnail from './TemplateThumbnail';
import { downloadCVAsPDF } from '../services/pdfService';

interface CVHistoryProps {
    savedCVs: SavedCV[];
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    userProfileName?: string;
}

const purposeConfig: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
    job: { label: 'Job', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', icon: Briefcase },
    academic: { label: 'Scholarship', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300', icon: BookOpen },
    general: { label: 'General', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300', icon: Globe },
};

const CVHistory: React.FC<CVHistoryProps> = ({ savedCVs, onLoad, onDelete, userProfileName }) => {
    const [filter, setFilter] = useState<'all' | 'job' | 'academic' | 'general'>('all');
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

    const filtered = savedCVs
        .filter(cv => filter === 'all' || cv.purpose === filter)
        .sort((a, b) => {
            const da = new Date(a.createdAt).getTime();
            const db = new Date(b.createdAt).getTime();
            return sortBy === 'newest' ? db - da : da - db;
        });

    const handleQuickDownload = (cv: SavedCV) => {
        const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        const name = sanitize(userProfileName || 'CV').substring(0, 20);
        const cvName = sanitize(cv.name).substring(0, 25);
        downloadCVAsPDF({
            cvData: cv.data,
            personalInfo: { name: userProfileName || '', email: '', phone: '', location: '', linkedin: '', github: '', website: '', photo: '' },
            template: 'standard-pro' as TemplateName,
            font: 'inter',
            fileName: `${name}_${cvName}.pdf`,
            jobDescription: '',
        });
    };

    const previewCV = savedCVs.find(cv => cv.id === previewId);

    if (savedCVs.length === 0) {
        return (
            <div className="text-center py-16 px-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-zinc-100 dark:bg-neutral-800 rounded-2xl mb-4">
                    <FileText className="h-10 w-10 text-zinc-400" />
                </div>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200 mb-2">No saved CVs yet</h3>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto text-sm leading-relaxed">
                    Generate and save your first CV using the CV Generator tab. All saved CVs will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">CV History</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{savedCVs.length} CV{savedCVs.length !== 1 ? 's' : ''} saved locally</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Sort */}
                    <button
                        onClick={() => setSortBy(s => s === 'newest' ? 'oldest' : 'newest')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                        <RefreshCw className="h-3 w-3" />
                        {sortBy === 'newest' ? 'Newest first' : 'Oldest first'}
                    </button>
                </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2">
                {(['all', 'job', 'academic', 'general'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${filter === f
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                                : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700'
                            }`}
                    >
                        {f === 'all' ? `All (${savedCVs.length})` :
                            f === 'job' ? `Job (${savedCVs.filter(c => c.purpose === 'job').length})` :
                                f === 'academic' ? `Scholarship (${savedCVs.filter(c => c.purpose === 'academic').length})` :
                                    `General (${savedCVs.filter(c => c.purpose === 'general').length})`}
                    </button>
                ))}
            </div>

            {/* CV Grid */}
            {filtered.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-sm">No CVs match this filter.</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(cv => {
                        const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
                        const PurposeIcon = purpose.icon;
                        const isExpanded = previewId === cv.id;

                        return (
                            <div
                                key={cv.id}
                                className={`
                  relative bg-white dark:bg-neutral-800 rounded-xl border-2 transition-all duration-300 overflow-hidden group
                  ${isExpanded
                                        ? 'border-indigo-500 shadow-xl shadow-indigo-500/20'
                                        : 'border-zinc-200 dark:border-neutral-700 hover:border-indigo-400 shadow-sm hover:shadow-lg'
                                    }
                `}
                            >
                                {/* Thumbnail preview of template */}
                                <div
                                    className="cursor-pointer relative overflow-hidden bg-zinc-50"
                                    onClick={() => setPreviewId(isExpanded ? null : cv.id)}
                                    title="Click to expand preview"
                                >
                                    <div className="transform scale-[0.85] origin-top-left" style={{ width: '118%' }}>
                                        <TemplateThumbnail templateName={'standard-pro'} />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <span className="text-white text-[10px] font-medium flex items-center gap-1">
                                            <Eye className="h-3 w-3" /> Details
                                        </span>
                                    </div>
                                </div>

                                {/* Card body */}
                                <div className="p-3">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{cv.name}</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                {new Date(cv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                {' · '}
                                                {new Date(cv.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${purpose.color}`}>
                                            <PurposeIcon className="h-2.5 w-2.5" />
                                            {purpose.label}
                                        </span>
                                    </div>

                                    {/* Stats row */}
                                    <div className="flex gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 mb-3">
                                        <span>📝 {cv.data.experience?.length || 0} roles</span>
                                        <span>🎯 {cv.data.skills?.length || 0} skills</span>
                                        <span>🎓 {cv.data.education?.length || 0} edu</span>
                                    </div>

                                    {/* Summary snippet */}
                                    {cv.data.summary && (
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3 italic border-l-2 border-indigo-200 pl-2">
                                            "{cv.data.summary.substring(0, 100)}..."
                                        </p>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => onLoad(cv.data)}
                                            className="flex-1 !text-xs !py-1.5"
                                        >
                                            <Eye className="h-3.5 w-3.5 mr-1" />
                                            Load & Edit
                                        </Button>
                                        <button
                                            onClick={() => handleQuickDownload(cv)}
                                            title="Quick Download"
                                            className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Delete "${cv.name}"?`)) onDelete(cv.id);
                                            }}
                                            title="Delete"
                                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                        >
                                            <Trash className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded detail panel */}
                                {isExpanded && (
                                    <div className="border-t border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10 p-3">
                                        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Skills Preview</p>
                                        <div className="flex flex-wrap gap-1">
                                            {(cv.data.skills || []).slice(0, 10).map((skill, i) => (
                                                <span key={i} className="text-[10px] px-2 py-0.5 bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-800 rounded-full text-indigo-700 dark:text-indigo-300">
                                                    {skill}
                                                </span>
                                            ))}
                                            {(cv.data.skills?.length || 0) > 10 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full text-zinc-400">+{cv.data.skills.length - 10} more</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CVHistory;
