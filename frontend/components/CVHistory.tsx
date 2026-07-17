import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { SavedCV, CVData, TemplateName, UserProfile, templateDisplayNames } from '../types';
import { getHistoryLimit, FREE_HISTORY_LIMIT, isPureFreeTier } from '../services/accountTierService';
import { Trash, Eye, Download, FileText, BookOpen, Briefcase, Globe, X } from './icons';

const ChevronLeft: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m15 18-6-6 6-6"/></svg>
);
const ChevronRight: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m9 18 6-6-6-6"/></svg>
);
import TemplateThumbnail from './TemplateThumbnail';
import CVPreview from './CVPreview';
import ResponsiveCVScale from './ResponsiveCVScale';
import { downloadCV } from '../services/cvDownloadService';
import { getCVDataCached, loadCVData } from '../services/storage/cvDataStore';

interface CVHistoryProps {
    savedCVs: SavedCV[];
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    userProfile: UserProfile;
    onNewCV?: () => void;
}

const purposeConfig: Record<string, { label: string; dot: string; pillActive: string; pillInactive: string; icon: React.FC<any> }> = {
    job:      { label: 'Job',         dot: 'bg-blue-500',   pillActive: 'bg-blue-600 text-white',   pillInactive: 'text-zinc-600 dark:text-zinc-400', icon: Briefcase },
    academic: { label: 'Scholarship', dot: 'bg-teal-500',   pillActive: 'bg-teal-600 text-white',   pillInactive: 'text-zinc-600 dark:text-zinc-400', icon: BookOpen  },
    general:  { label: 'General',     dot: 'bg-violet-500', pillActive: 'bg-violet-600 text-white', pillInactive: 'text-zinc-600 dark:text-zinc-400', icon: Globe     },
};

const PREVIEW_TEMPLATES: TemplateName[] = [
    'v2-classic-pro', 'v2-ats-max', 'v2-pro', 'v2-navy', 'v2-harvard', 'v2-warm',
    'v2-teal', 'v2-steel', 'v2-bold', 'v2-minimal', 'v2-modern-blue', 'v2-slate-sidebar',
];
const ALL_TEMPLATES: TemplateName[] = [
    'v2-ats-max', 'v2-skills-first', 'v2-starter', 'v2-classic-pro', 'v2-standard-black',
    'v2-pro', 'v2-navy', 'v2-harvard', 'v2-warm', 'v2-teal', 'v2-steel', 'v2-bold',
    'v2-slate-sidebar', 'v2-sage', 'v2-graphite', 'v2-gold-exec', 'v2-minimal',
    'v2-modern-blue', 'v2-terminal', 'v2-noir', 'v2-editorial', 'v2-coral',
    'v2-amber', 'v2-ink', 'v2-forest', 'v2-crimson', 'v2-photo',
    'swe-neon', 'swe-clean', 'swe-vivid', 'swe-impact', 'swe-elite',
    'professional', 'minimalist', 'creative', 'timeline', 'infographic',
    'harvard-gold', 'tokyo-night', 'paris-vibe', 'london-finance', 'berlin-design',
    'ats-clean-pro', 'medical-standard',
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
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Right-side Preview Panel ─────────────────────────────────────────────────
interface PreviewPanelProps {
    cv: SavedCV;
    userProfile: UserProfile;
    onClose: () => void;
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ cv, userProfile, onClose, onLoad, onDelete }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>(cv.template || 'v2-classic-pro');
    const [showAllTemplates, setShowAllTemplates] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [zoom, setZoom] = useState(0.9);
    const previewRef = useRef<HTMLDivElement>(null);
    const cvData = getCVDataCached(cv.id) ?? cv.data;

    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;
    const roleCount  = cvData?.experience?.length ?? 0;
    const skillCount = cvData?.skills?.length ?? 0;
    const visibleTemplates = showAllTemplates ? ALL_TEMPLATES : PREVIEW_TEMPLATES;

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

    // AI insight copy based on purpose
    const aiInsight = cv.purpose === 'job'
        ? `This CV is tailored for job applications and ATS-optimised.`
        : cv.purpose === 'academic'
        ? `This CV is formatted for academic / scholarship applications.`
        : `General-purpose CV — suitable for multiple application types.`;

    return (
        <div className="flex flex-col h-full bg-white dark:bg-neutral-900 border-l border-zinc-200 dark:border-neutral-700/80 overflow-hidden">

            {/* Panel header */}
            <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        cv.purpose === 'job' ? 'bg-blue-500/15' : cv.purpose === 'academic' ? 'bg-teal-500/15' : 'bg-violet-500/15'
                    }`}>
                        <PurposeIcon className={`h-4 w-4 ${
                            cv.purpose === 'job' ? 'text-blue-500' : cv.purpose === 'academic' ? 'text-teal-500' : 'text-violet-500'
                        }`} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate leading-tight">{cv.name}</h3>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                cv.purpose === 'job' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : cv.purpose === 'academic' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                                : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                            }`}>
                                {purpose.label}
                            </span>
                        </div>
                        <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                            Created {exactDate(cv.createdAt)}
                            {roleCount > 0 && ` · ${roleCount} roles`}
                            {skillCount > 0 && ` · ${skillCount} skills`}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="ml-2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Template section */}
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Template</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">{templateDisplayNames[selectedTemplate]}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {visibleTemplates.map(t => (
                        <button
                            key={t}
                            onClick={() => setSelectedTemplate(t)}
                            title={templateDisplayNames[t]}
                            className={`flex-shrink-0 w-10 h-14 rounded-md overflow-hidden border-2 transition-all duration-150 ${
                                selectedTemplate === t
                                    ? 'border-[#C9A84C] shadow-md shadow-[#C9A84C]/25'
                                    : 'border-zinc-200 dark:border-neutral-700 hover:border-[#1B2B4B]/40 dark:hover:border-[#C9A84C]/40'
                            }`}
                        >
                            <div className="w-full h-full pointer-events-none" style={{ transform: 'scale(0.18)', transformOrigin: 'top left', width: '556%', height: '556%' }}>
                                <TemplateThumbnail templateName={t} />
                            </div>
                        </button>
                    ))}
                    <button
                        onClick={() => setShowAllTemplates(s => !s)}
                        className="flex-shrink-0 w-10 h-14 rounded-md border-2 border-dashed border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/60 flex items-center justify-center text-[10px] font-bold text-zinc-400 dark:text-zinc-500 hover:text-[#C9A84C] transition-colors"
                    >
                        {showAllTemplates ? '↑' : `+${ALL_TEMPLATES.length - PREVIEW_TEMPLATES.length}`}
                    </button>
                </div>
            </div>

            {downloadError && (
                <div className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300 flex-shrink-0">
                    {downloadError}
                </div>
            )}

            {/* Live preview */}
            <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-neutral-950 relative min-h-0">
                <div className="p-3">
                    <div
                        ref={previewRef}
                        data-cv-preview-active="true"
                        className="origin-top mx-auto"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', width: `${(1 / zoom) * 100}%` }}
                    >
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

            {/* Zoom controls */}
            <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-zinc-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
                <button
                    onClick={() => setZoom(z => Math.max(0.5, +(z - 0.05).toFixed(2)))}
                    className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors text-sm font-bold"
                >−</button>
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 w-10 text-center tabular-nums">
                    {Math.round(zoom * 100)}%
                </span>
                <button
                    onClick={() => setZoom(z => Math.min(1.5, +(z + 0.05).toFixed(2)))}
                    className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors text-sm font-bold"
                >+</button>
            </div>

            {/* Quick Actions */}
            <div className="px-4 py-3 border-t border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Quick Actions</p>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={handleLoadAndClose}
                        className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-zinc-50 dark:bg-neutral-800 hover:bg-[#1B2B4B]/8 dark:hover:bg-[#1B2B4B]/30 border border-zinc-200 dark:border-neutral-700 transition-colors group"
                    >
                        <Eye className="h-4 w-4 text-[#1B2B4B] dark:text-[#C9A84C] group-hover:scale-110 transition-transform" />
                        <span className="text-[9.5px] font-semibold text-zinc-600 dark:text-zinc-400 leading-tight text-center">Load & Edit</span>
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-zinc-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-zinc-200 dark:border-neutral-700 transition-colors group disabled:opacity-50"
                    >
                        <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                        <span className="text-[9.5px] font-semibold text-zinc-600 dark:text-zinc-400 leading-tight text-center">
                            {isDownloading ? 'Saving…' : 'Download PDF'}
                        </span>
                    </button>
                    {confirmDelete ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <span className="text-[9px] text-red-600 dark:text-red-400 font-semibold text-center leading-tight">Sure?</span>
                            <div className="flex gap-1.5">
                                <button onClick={() => { onDelete(cv.id); onClose(); }} className="text-[9px] font-bold text-red-600 dark:text-red-400 hover:underline">Yes</button>
                                <button onClick={() => setConfirmDelete(false)} className="text-[9px] text-zinc-500 hover:underline">No</button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-zinc-50 dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-zinc-200 dark:border-neutral-700 transition-colors group"
                        >
                            <Trash className="h-4 w-4 text-red-400 group-hover:scale-110 transition-transform" />
                            <span className="text-[9.5px] font-semibold text-zinc-600 dark:text-zinc-400 leading-tight text-center">Delete</span>
                        </button>
                    )}
                </div>
            </div>

            {/* AI Insights */}
            <div className="px-4 pb-4 flex-shrink-0">
                <div className="rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">AI Insights</p>
                    <div className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-none stroke-white stroke-[1.8]">
                                <polyline points="2,6 5,9 10,3" />
                            </svg>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{aiInsight}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── CV Card ──────────────────────────────────────────────────────────────────
interface CVCardProps {
    cv: SavedCV;
    isSelected: boolean;
    onPreview: () => void;
    onLoad: () => void;
    onDelete: () => void;
}

const CVCard: React.FC<CVCardProps> = ({ cv, isSelected, onPreview, onLoad, onDelete }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [hovered, setHovered] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const cvData = getCVDataCached(cv.id) ?? cv.data;
    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;
    const template = cv.template || 'v2-classic-pro';
    const atsScore = (cv as any).atsScore as number | undefined;

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
                setConfirmDelete(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    return (
        <div
            className={`group relative bg-white dark:bg-neutral-800 rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col cursor-pointer ${
                isSelected
                    ? 'border-[#C9A84C] shadow-lg shadow-[#C9A84C]/15 ring-1 ring-[#C9A84C]/30'
                    : 'border-zinc-200/80 dark:border-neutral-700/80 shadow-sm hover:shadow-md hover:border-[#C9A84C]/40 dark:hover:border-[#C9A84C]/30'
            }`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); }}
            onClick={onPreview}
        >
            {/* Thumbnail */}
            <div
                className="relative overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-neutral-750 dark:to-neutral-800 flex-shrink-0"
                style={{ height: 190 }}
            >
                <div className="absolute inset-0 flex items-start justify-center pt-2 overflow-hidden pointer-events-none">
                    <div style={{ transform: 'scale(0.76)', transformOrigin: 'top center', width: '132%', marginLeft: '-16%' }}>
                        <TemplateThumbnail templateName={template} />
                    </div>
                </div>

                {/* Purpose badge top-left */}
                <div className="absolute top-2.5 left-2.5 z-10">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold shadow-sm ${
                        cv.purpose === 'job' ? 'bg-blue-500 text-white'
                        : cv.purpose === 'academic' ? 'bg-teal-500 text-white'
                        : 'bg-violet-500 text-white'
                    }`}>
                        <PurposeIcon className="h-2.5 w-2.5" />
                        {purpose.label}
                    </span>
                </div>

                {/* ATS badge top-right (unless menu is open) */}
                {atsScore !== undefined && atsScore > 0 && !menuOpen && (
                    <div className="absolute top-2.5 right-2.5 z-10">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-bold shadow-sm ${
                            atsScore >= 80 ? 'bg-emerald-500 text-white'
                            : atsScore >= 60 ? 'bg-amber-500 text-white'
                            : 'bg-red-500 text-white'
                        }`}>
                            ATS {atsScore}
                        </span>
                    </div>
                )}

                {/* "…" menu button — always visible on hover / when selected */}
                <div
                    className={`absolute top-2 right-2 z-20 transition-opacity duration-150 ${hovered || menuOpen || isSelected ? 'opacity-100' : 'opacity-0'}`}
                    ref={menuRef}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false); }}
                        className="w-6 h-6 rounded-md bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors text-xs leading-none"
                    >
                        ···
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-7 w-36 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-zinc-200 dark:border-neutral-700 py-1 z-30 overflow-hidden">
                            <button
                                onClick={() => { onLoad(); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                            >
                                <Eye className="h-3 w-3" /> Load &amp; Edit
                            </button>
                            <div className="my-0.5 border-t border-zinc-100 dark:border-neutral-700" />
                            {confirmDelete ? (
                                <div className="px-3 py-2 flex items-center gap-2">
                                    <span className="text-[10px] text-red-500 font-semibold flex-1">Confirm?</span>
                                    <button onClick={() => { onDelete(); setMenuOpen(false); }} className="text-[10px] font-bold text-red-500 hover:underline">Yes</button>
                                    <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-zinc-400 hover:underline">No</button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <Trash className="h-3 w-3" /> Delete
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Hover overlay */}
                <div className={`absolute inset-0 bg-[#1B2B4B]/75 flex flex-col items-center justify-center gap-2 transition-opacity duration-200 ${hovered && !menuOpen ? 'opacity-100' : 'opacity-0'}`}>
                    <button
                        onClick={e => { e.stopPropagation(); onPreview(); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-[#1B2B4B] text-xs font-bold hover:bg-zinc-50 transition-colors shadow-md"
                    >
                        <Eye className="h-3 w-3" /> Preview
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onLoad(); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#C9A84C] text-white text-xs font-bold hover:bg-[#b8963f] transition-colors shadow-md"
                    >
                        Load &amp; Edit
                    </button>
                </div>
            </div>

            {/* Card body */}
            <div className="px-3 py-2.5 flex-1 flex flex-col min-h-0">
                <p className="text-[12.5px] font-bold text-zinc-900 dark:text-zinc-100 truncate leading-tight" title={cv.name}>
                    {cv.name}
                </p>
                <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {relativeTime(cv.createdAt)}
                    <span className="mx-1 opacity-40">·</span>
                    {exactDate(cv.createdAt)}
                </p>
                {cvData && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                        {cvData.experience?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                                <Briefcase className="h-2 w-2" /> {cvData.experience.length}r
                            </span>
                        )}
                        {cvData.skills?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                                ✦ {cvData.skills.length}
                            </span>
                        )}
                        {cvData.education?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                                <BookOpen className="h-2 w-2" /> {cvData.education.length}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main CVHistory ───────────────────────────────────────────────────────────
const CVHistory: React.FC<CVHistoryProps> = ({ savedCVs, onLoad, onDelete, userProfile, onNewCV }) => {
    const [filter, setFilter] = useState<'all' | 'job' | 'academic' | 'general'>('all');
    const [previewCV, setPreviewCV] = useState<SavedCV | null>(null);
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const PER_PAGE = 9;

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

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const safePage   = Math.min(page, totalPages);
    const paginated  = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

    // Reset to page 1 when filter/sort/search changes
    useEffect(() => { setPage(1); }, [filter, sortBy, search]);

    const counts = useMemo(() => ({
        job:      savedCVs.filter(c => c.purpose === 'job').length,
        academic: savedCVs.filter(c => c.purpose === 'academic').length,
        general:  savedCVs.filter(c => c.purpose === 'general').length,
    }), [savedCVs]);

    const handleLoad = useCallback(async (cv: SavedCV) => {
        const data = getCVDataCached(cv.id) ?? cv.data ?? await loadCVData(cv.id);
        if (data) onLoad(data);
    }, [onLoad]);

    // Empty state
    if (savedCVs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#1B2B4B]/8 to-[#C9A84C]/8 dark:from-[#1B2B4B]/30 dark:to-[#C9A84C]/10 flex items-center justify-center mb-5 shadow-inner">
                    <span className="text-3xl">✨</span>
                </div>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200 mb-2">No saved CVs yet</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed mb-6">
                    Create and save your first CV to see it here.
                </p>
                {onNewCV && (
                    <button
                        onClick={onNewCV}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] text-white text-sm font-semibold transition-colors shadow-md"
                    >
                        + Create New CV
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex gap-0 min-h-full relative">

            {/* ── Main content column ── */}
            <div
                className="flex-1 min-w-0 flex flex-col gap-4 transition-all duration-300"
                style={{ paddingRight: previewCV ? '0' : undefined }}
            >

                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                            CV History
                            <span className="text-lg">✨</span>
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">All your saved CVs in one place.</p>
                    </div>
                    {onNewCV && (
                        <button
                            onClick={onNewCV}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] dark:bg-[#C9A84C] dark:hover:bg-[#b8963f] text-white text-sm font-semibold transition-colors shadow-sm"
                        >
                            <span className="text-base leading-none">+</span> New CV
                        </button>
                    )}
                </div>

                {/* Free tier banner */}
                {isLimited && (
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                            Showing your {FREE_HISTORY_LIMIT} most recent CVs. Upgrade to unlock all {savedCVs.length}.
                        </p>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('procv:openPricing'))}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#C9A84C] hover:bg-[#b8963f] text-white transition-colors"
                        >
                            Upgrade
                        </button>
                    </div>
                )}

                {/* Filter pills row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                        { key: 'all',      label: 'All',         count: savedCVs.length, icon: null,       activeClass: 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white shadow-sm' },
                        { key: 'job',      label: 'Job',         count: counts.job,      icon: Briefcase,  activeClass: 'bg-blue-600 text-white shadow-sm' },
                        { key: 'academic', label: 'Scholarship', count: counts.academic, icon: BookOpen,   activeClass: 'bg-teal-600 text-white shadow-sm' },
                        { key: 'general',  label: 'General',     count: counts.general,  icon: Globe,      activeClass: 'bg-violet-600 text-white shadow-sm' },
                    ] as const).map(({ key, label, count, icon: Icon, activeClass }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all duration-150 border ${
                                filter === key
                                    ? `${activeClass} border-transparent`
                                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600'
                            }`}
                        >
                            {Icon && <Icon className="h-3 w-3" />}
                            {label}
                            <span className={`text-[10px] font-bold px-1 rounded-full ${
                                filter === key ? 'bg-white/25' : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400'
                            }`}>{count}</span>
                        </button>
                    ))}
                </div>

                {/* Toolbar: search + sort + view toggle */}
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 max-w-64">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search CVs…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-[#1B2B4B] dark:focus:border-[#C9A84C] transition-colors"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    {/* Sort dropdown */}
                    <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                        <span className="hidden sm:inline font-medium">Sort:</span>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
                            className="pl-2 pr-6 py-2 text-xs rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:border-[#1B2B4B] dark:focus:border-[#C9A84C] transition-colors appearance-none cursor-pointer"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                        </select>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-neutral-700 overflow-hidden flex-shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            title="Grid view"
                            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white' : 'bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                                <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                                <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            title="List view"
                            className={`p-2 transition-colors border-l border-zinc-200 dark:border-neutral-700 ${viewMode === 'list' ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white' : 'bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                                <rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/>
                                <rect x="1" y="11.5" width="14" height="2.5" rx="1"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Search result count */}
                {search.trim() && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">
                        {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
                    </p>
                )}

                {/* Grid / List */}
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
                ) : viewMode === 'grid' ? (
                    <div className={`grid gap-4 ${previewCV ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                        {paginated.map(cv => (
                            <CVCard
                                key={cv.id}
                                cv={cv}
                                isSelected={previewCV?.id === cv.id}
                                onPreview={() => setPreviewCV(cv)}
                                onLoad={() => handleLoad(cv)}
                                onDelete={() => { onDelete(cv.id); if (previewCV?.id === cv.id) setPreviewCV(null); }}
                            />
                        ))}
                    </div>
                ) : (
                    /* List view */
                    <div className="flex flex-col gap-2">
                        {paginated.map(cv => {
                            const cvData = getCVDataCached(cv.id) ?? cv.data;
                            const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
                            const PurposeIcon = purpose.icon;
                            const atsScore = (cv as any).atsScore as number | undefined;
                            return (
                                <div
                                    key={cv.id}
                                    onClick={() => setPreviewCV(cv)}
                                    className={`group flex items-center gap-3 px-4 py-3 bg-white dark:bg-neutral-800 rounded-xl border transition-all duration-150 cursor-pointer ${
                                        previewCV?.id === cv.id
                                            ? 'border-[#C9A84C] ring-1 ring-[#C9A84C]/30 shadow-sm'
                                            : 'border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/40 hover:shadow-sm'
                                    }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        cv.purpose === 'job' ? 'bg-blue-500/15' : cv.purpose === 'academic' ? 'bg-teal-500/15' : 'bg-violet-500/15'
                                    }`}>
                                        <PurposeIcon className={`h-4 w-4 ${
                                            cv.purpose === 'job' ? 'text-blue-500' : cv.purpose === 'academic' ? 'text-teal-500' : 'text-violet-500'
                                        }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{cv.name}</p>
                                        <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                                            {relativeTime(cv.createdAt)} · {exactDate(cv.createdAt)}
                                            {cvData ? ` · ${cvData.experience?.length || 0} roles · ${cvData.skills?.length || 0} skills` : ''}
                                        </p>
                                    </div>
                                    {atsScore !== undefined && atsScore > 0 && (
                                        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                            atsScore >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                            : atsScore >= 60 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                        }`}>ATS {atsScore}</span>
                                    )}
                                    <button
                                        onClick={e => { e.stopPropagation(); handleLoad(cv); }}
                                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-400 hover:border-[#C9A84C]/60 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); onDelete(cv.id); if (previewCV?.id === cv.id) setPreviewCV(null); }}
                                        className="flex-shrink-0 p-1.5 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            Showing {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} of {filtered.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                                        p === safePage
                                            ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white shadow-sm'
                                            : 'border border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Right preview panel ── */}
            {previewCV && (
                <div
                    className="hidden lg:flex flex-col flex-shrink-0 ml-4 rounded-2xl overflow-hidden border border-zinc-200 dark:border-neutral-700 shadow-xl"
                    style={{ width: 360, alignSelf: 'flex-start', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)' }}
                >
                    <PreviewPanel
                        key={previewCV.id}
                        cv={previewCV}
                        userProfile={userProfile}
                        onClose={() => setPreviewCV(null)}
                        onLoad={onLoad}
                        onDelete={id => { onDelete(id); setPreviewCV(null); }}
                    />
                </div>
            )}

            {/* Mobile: full-screen overlay */}
            {previewCV && (
                <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-900" >
                    <PreviewPanel
                        key={previewCV.id}
                        cv={previewCV}
                        userProfile={userProfile}
                        onClose={() => setPreviewCV(null)}
                        onLoad={onLoad}
                        onDelete={id => { onDelete(id); setPreviewCV(null); }}
                    />
                </div>
            )}
        </div>
    );
};

export default CVHistory;
