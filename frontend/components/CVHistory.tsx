import React, { useState, useRef, useMemo } from 'react';
import { SavedCV, CVData, TemplateName, UserProfile, templateDisplayNames } from '../types';
import { getHistoryLimit, FREE_HISTORY_LIMIT, isPureFreeTier } from '../services/accountTierService';
import { Trash, Eye, Download, FileText, BookOpen, Briefcase, Globe, X } from './icons';
import TemplateThumbnail from './TemplateThumbnail';
import CVPreview from './CVPreview';
import { downloadCV } from '../services/cvDownloadService';
import { getCVDataCached, loadCVData } from '../services/storage/cvDataStore';

interface CVHistoryProps {
    savedCVs: SavedCV[];
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    userProfile: UserProfile;
}

const purposeConfig: Record<string, { label: string; bg: string; text: string; icon: React.FC<any> }> = {
    job:      { label: 'Job',         bg: 'bg-blue-500',   text: 'text-white', icon: Briefcase },
    academic: { label: 'Scholarship', bg: 'bg-teal-500',   text: 'text-white', icon: BookOpen  },
    general:  { label: 'General',     bg: 'bg-violet-500', text: 'text-white', icon: Globe     },
};

const ALL_TEMPLATES: TemplateName[] = [
    'standard-pro', 'professional', 'modern', 'minimalist', 'corporate',
    'elegant', 'executive', 'classic', 'london-finance', 'harvard-gold',
    'ats-clean-pro', 'compact', 'timeline', 'twoColumnBlue', 'technical',
    'software-engineer', 'modern-tech', 'swe-elite', 'silicon-valley', 'berlin-design',
    'tokyo-night', 'paris-vibe', 'sydney-creative', 'creative', 'infographic',
    'navy-sidebar', 'photo-sidebar', 'executive-sidebar', 'scholarship-pro', 'medical-standard',
];

function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7)  return `${d} days ago`;
    const w = Math.floor(d / 7);
    if (w < 5)  return `${w}w ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
}

function exactDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
        ' · ' + new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
interface PreviewModalProps {
    cv: SavedCV;
    userProfile: UserProfile;
    onClose: () => void;
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ cv, userProfile, onClose, onLoad, onDelete }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>(cv.template || 'standard-pro');
    const [showAllTemplates, setShowAllTemplates] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const cvData = getCVDataCached(cv.id) ?? cv.data;

    const visibleTemplates = showAllTemplates ? ALL_TEMPLATES : ALL_TEMPLATES.slice(0, 12);

    const handleDownload = async () => {
        setIsDownloading(true);
        setDownloadError(null);
        const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        try {
            const result = await downloadCV({
                fileName: `${sanitize(userProfile.personalInfo.name || 'CV').substring(0, 20)}_${sanitize(cv.name).substring(0, 25)}.pdf`,
                containerEl: previewRef.current,
            });
            if (!result.ok) setDownloadError(result.error || 'Download failed.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleLoadAndClose = async () => {
        const data = cvData ?? await loadCVData(cv.id);
        if (data) onLoad(data);
        onClose();
    };

    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0 bg-white dark:bg-neutral-900">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${purpose.bg} flex items-center justify-center`}>
                            <PurposeIcon className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50 truncate leading-tight">{cv.name}</h2>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5" title={exactDate(cv.createdAt)}>
                                {relativeTime(cv.createdAt)} · {cvData ? `${cvData.experience?.length || 0} roles · ${cvData.skills?.length || 0} skills` : '—'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {confirmDelete ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                                <span className="text-xs text-red-700 dark:text-red-300 font-medium">Delete?</span>
                                <button onClick={() => { onDelete(cv.id); onClose(); }} className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors">Yes</button>
                                <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Cancel</button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Delete CV"
                            >
                                <Trash className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            onClick={handleLoadAndClose}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
                        >
                            <Eye className="h-3.5 w-3.5" />
                            Load &amp; Edit
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            <Download className="h-3.5 w-3.5" />
                            {isDownloading ? 'Saving…' : 'Download PDF'}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-800 text-zinc-400 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Template Picker */}
                <div className="px-5 py-2.5 border-b border-zinc-100 dark:border-neutral-800 bg-zinc-50/60 dark:bg-neutral-800/40 flex-shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mr-1">Template</span>
                        {visibleTemplates.map(t => (
                            <button
                                key={t}
                                onClick={() => setSelectedTemplate(t)}
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all duration-150 border ${
                                    selectedTemplate === t
                                        ? 'bg-[#1B2B4B] border-[#1B2B4B] text-white shadow-sm'
                                        : 'bg-white dark:bg-neutral-700 border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:border-[#C9A84C]/60 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C]'
                                }`}
                            >
                                {templateDisplayNames[t]}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowAllTemplates(s => !s)}
                            className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors border border-[#C9A84C]/40"
                        >
                            {showAllTemplates ? '↑ Show less' : `+${ALL_TEMPLATES.length - 12} more`}
                        </button>
                    </div>
                </div>

                {downloadError && (
                    <div className="px-5 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex-shrink-0">
                        {downloadError}
                    </div>
                )}

                {/* Live CV Preview */}
                <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-neutral-950">
                    <div className="py-8 px-4">
                        <div
                            style={{
                                transform: 'scale(0.72)',
                                transformOrigin: 'top center',
                                width: '138.89%',
                                marginLeft: '-19.44%',
                            }}
                        >
                            <div ref={previewRef} data-cv-preview-active="true">
                                {cvData && (
                                    <CVPreview
                                        cvData={cvData}
                                        personalInfo={userProfile.personalInfo}
                                        template={selectedTemplate}
                                        isEditing={false}
                                        onDataChange={() => {}}
                                        jobDescriptionForATS=""
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── CV Card ──────────────────────────────────────────────────────────────────
interface CVCardProps {
    cv: SavedCV;
    onPreview: () => void;
    onLoad: () => void;
    onDelete: () => void;
}

const CVCard: React.FC<CVCardProps> = ({ cv, onPreview, onLoad, onDelete }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [hovered, setHovered] = useState(false);
    const cvData = getCVDataCached(cv.id) ?? cv.data;
    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;
    const template = cv.template || 'standard-pro';
    const atsScore = (cv as any).atsScore as number | undefined;

    return (
        <div
            className="group relative bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200/80 dark:border-neutral-700/80 shadow-sm hover:shadow-xl hover:border-[#C9A84C]/40 transition-all duration-300 overflow-hidden flex flex-col"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
        >
            {/* Thumbnail area */}
            <div
                className="relative overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-neutral-700 dark:to-neutral-800 cursor-pointer flex-shrink-0"
                style={{ height: 210 }}
                onClick={onPreview}
            >
                {/* Static template thumbnail */}
                <div className="absolute inset-0 flex items-start justify-center pt-2 overflow-hidden pointer-events-none">
                    <div style={{ transform: 'scale(0.78)', transformOrigin: 'top center', width: '128%', marginLeft: '-14%' }}>
                        <TemplateThumbnail templateName={template} />
                    </div>
                </div>

                {/* Purpose badge — top left */}
                <div className="absolute top-2.5 left-2.5 z-10">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${purpose.bg} ${purpose.text} shadow-sm`}>
                        <PurposeIcon className="h-2.5 w-2.5" />
                        {purpose.label}
                    </span>
                </div>

                {/* ATS score — top right (if available) */}
                {atsScore !== undefined && atsScore > 0 && (
                    <div className="absolute top-2.5 right-2.5 z-10">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                            atsScore >= 80 ? 'bg-emerald-500 text-white' :
                            atsScore >= 60 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                            ATS {atsScore}
                        </span>
                    </div>
                )}

                {/* Template name — bottom left */}
                <div className="absolute bottom-2.5 left-2.5 z-10">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-black/50 text-white rounded-md backdrop-blur-sm">
                        {templateDisplayNames[template]}
                    </span>
                </div>

                {/* Hover overlay */}
                <div className={`absolute inset-0 bg-[#1B2B4B]/80 flex flex-col items-center justify-center gap-2.5 transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
                    <button
                        onClick={e => { e.stopPropagation(); onPreview(); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#1B2B4B] text-xs font-bold hover:bg-[#F8F7F4] transition-colors shadow-lg"
                    >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onLoad(); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9A84C] text-white text-xs font-bold hover:bg-[#b8963f] transition-colors shadow-lg"
                    >
                        Load &amp; Edit
                    </button>
                </div>
            </div>

            {/* Card body */}
            <div className="flex flex-col flex-1 p-3.5">
                {/* Name + date */}
                <div className="mb-2">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate leading-tight" title={cv.name}>
                        {cv.name}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5" title={exactDate(cv.createdAt)}>
                        {relativeTime(cv.createdAt)}
                    </p>
                </div>

                {/* Stats pills */}
                {cvData && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        {cvData.experience?.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400">
                                <Briefcase className="h-2.5 w-2.5" /> {cvData.experience.length} roles
                            </span>
                        )}
                        {cvData.skills?.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400">
                                ✦ {cvData.skills.length} skills
                            </span>
                        )}
                        {cvData.education?.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400">
                                <BookOpen className="h-2.5 w-2.5" /> {cvData.education.length} edu
                            </span>
                        )}
                    </div>
                )}

                {/* Summary snippet */}
                {cvData?.summary && (
                    <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 line-clamp-2 leading-relaxed mb-3 border-l-2 border-[#C9A84C]/40 pl-2 italic flex-1">
                        {cvData.summary.substring(0, 110)}…
                    </p>
                )}

                {/* Delete confirmation or delete button */}
                <div className="mt-auto pt-2 border-t border-zinc-100 dark:border-neutral-700">
                    {confirmDelete ? (
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Delete this CV?</span>
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors font-medium">
                                    Cancel
                                </button>
                                <button onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 font-bold hover:text-red-800 dark:hover:text-red-200 transition-colors">
                                    Delete
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <button
                                onClick={onPreview}
                                className="text-xs text-[#1B2B4B] dark:text-[#C9A84C] font-semibold hover:underline transition-colors"
                            >
                                Open preview →
                            </button>
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="p-1 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Delete"
                            >
                                <Trash className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main CVHistory ───────────────────────────────────────────────────────────
const CVHistory: React.FC<CVHistoryProps> = ({ savedCVs, onLoad, onDelete, userProfile }) => {
    const [filter, setFilter] = useState<'all' | 'job' | 'academic' | 'general'>('all');
    const [previewCV, setPreviewCV] = useState<SavedCV | null>(null);
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [search, setSearch] = useState('');

    const historyLimit = getHistoryLimit();
    const isLimited = isPureFreeTier() && savedCVs.length > historyLimit;
    const visibleCVs = isLimited
        ? [...savedCVs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, historyLimit)
        : savedCVs;

    const filtered = useMemo(() => visibleCVs
        .filter(cv => filter === 'all' || cv.purpose === filter)
        .filter(cv => !search.trim() || cv.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => {
            const da = new Date(a.createdAt).getTime();
            const db = new Date(b.createdAt).getTime();
            return sortBy === 'newest' ? db - da : da - db;
        }),
    [visibleCVs, filter, search, sortBy]);

    const counts = useMemo(() => ({
        job:      savedCVs.filter(c => c.purpose === 'job').length,
        academic: savedCVs.filter(c => c.purpose === 'academic').length,
        general:  savedCVs.filter(c => c.purpose === 'general').length,
    }), [savedCVs]);

    const handleLoad = async (cv: SavedCV) => {
        const data = getCVDataCached(cv.id) ?? cv.data ?? await loadCVData(cv.id);
        if (data) onLoad(data);
    };

    if (savedCVs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2B4B]/8 to-[#C9A84C]/8 dark:from-[#1B2B4B]/30 dark:to-[#C9A84C]/10 flex items-center justify-center mb-5 shadow-inner">
                    <FileText className="h-9 w-9 text-[#1B2B4B]/40 dark:text-[#C9A84C]/40" />
                </div>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200 mb-2">No saved CVs yet</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                    Generate and save your first CV using the CV Generator. It will appear here so you can preview, download, or reload it any time.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-5">

                {/* Header + Search + Sort */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                            CV History
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#1B2B4B] text-white text-[11px] font-bold">
                                {savedCVs.length}
                            </span>
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Your saved CVs — click any card to preview or download
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Search */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search CVs…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-44 pl-3 pr-7 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-[#1B2B4B] dark:focus:border-[#C9A84C] transition-colors"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        {/* Sort */}
                        <button
                            onClick={() => setSortBy(s => s === 'newest' ? 'oldest' : 'newest')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors whitespace-nowrap"
                        >
                            {sortBy === 'newest' ? '↓ Newest' : '↑ Oldest'}
                        </button>
                    </div>
                </div>

                {/* Free tier limit banner */}
                {isLimited && (
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                            Showing your {FREE_HISTORY_LIMIT} most recent CVs. Upgrade to see all {savedCVs.length}.
                        </p>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('procv:openPricing'))}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#C9A84C] hover:bg-[#b8963f] text-white transition-colors"
                        >
                            Upgrade
                        </button>
                    </div>
                )}

                {/* Filter pills */}
                <div className="flex flex-wrap gap-1.5">
                    {([
                        { key: 'all',      label: `All (${savedCVs.length})`,       bg: filter === 'all'      ? 'bg-[#1B2B4B] text-white shadow-sm shadow-[#1B2B4B]/20' : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700' },
                        { key: 'job',      label: `Job (${counts.job})`,            bg: filter === 'job'      ? 'bg-blue-600 text-white shadow-sm'   : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700' },
                        { key: 'academic', label: `Scholarship (${counts.academic})`,bg: filter === 'academic' ? 'bg-teal-600 text-white shadow-sm'   : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700' },
                        { key: 'general',  label: `General (${counts.general})`,    bg: filter === 'general'  ? 'bg-violet-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700' },
                    ] as const).map(({ key, label, bg }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${bg}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Results count when searching */}
                {search.trim() && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
                    </p>
                )}

                {/* CV Grid */}
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                            <FileText className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
                        </div>
                        <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">No CVs match</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                            {search.trim() ? 'Try a different search term.' : 'Try a different filter.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filtered.map(cv => (
                            <CVCard
                                key={cv.id}
                                cv={cv}
                                onPreview={() => setPreviewCV(cv)}
                                onLoad={() => { handleLoad(cv); }}
                                onDelete={() => onDelete(cv.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Full-Screen Preview Modal */}
            {previewCV && (
                <PreviewModal
                    cv={previewCV}
                    userProfile={userProfile}
                    onClose={() => setPreviewCV(null)}
                    onLoad={onLoad}
                    onDelete={onDelete}
                />
            )}
        </>
    );
};

export default CVHistory;
