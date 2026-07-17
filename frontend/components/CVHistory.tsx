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
import { downloadCV } from '../services/cvDownloadService';
import { getCVDataCached, loadCVData } from '../services/storage/cvDataStore';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

interface CVHistoryProps {
    savedCVs: SavedCV[];
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    userProfile: UserProfile;
    onNewCV?: () => void;
}

const purposeConfig: Record<string, { label: string; dot: string; color: string; bg: string; icon: React.FC<any> }> = {
    job:      { label: 'Job',         dot: 'bg-blue-500',   color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500/12 dark:bg-blue-500/15',   icon: Briefcase },
    academic: { label: 'Scholarship', dot: 'bg-teal-500',   color: 'text-teal-600 dark:text-teal-400',   bg: 'bg-teal-500/12 dark:bg-teal-500/15',   icon: BookOpen  },
    general:  { label: 'General',     dot: 'bg-violet-500', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/12 dark:bg-violet-500/15', icon: Globe   },
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

function scoreColor(score: number): string {
    if (score >= 80) return '#16a34a';
    if (score >= 60) return GOLD;
    return '#ef4444';
}
function scoreBg(score: number): string {
    if (score >= 80) return 'rgba(22,163,74,0.1)';
    if (score >= 60) return `${GOLD}18`;
    return 'rgba(239,68,68,0.1)';
}
function scoreLabel(score: number): string {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Good';
    if (score >= 40) return 'Building';
    return 'Needs Work';
}

/** Mini circular score ring */
function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
    const r = size / 2 - 3.5;
    const circ = 2 * Math.PI * r;
    const dash = circ * (Math.min(score, 100) / 100);
    const c = scoreColor(score);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeOpacity={0.15} strokeWidth="3" />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={circ / 4}
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
            <text x={size/2} y={size/2 + 3.5} textAnchor="middle" fontSize={size < 40 ? "8.5" : "11"} fontWeight="700" fill={c}>{score}</text>
        </svg>
    );
}

// ─── CV data: read directly from the saved object (same pattern as cv.template) ─
function useCVData(cv: SavedCV): CVData | null {
    return getCVDataCached(cv.id) ?? cv.data ?? null;
}

// ─── Right-side Preview Panel ─────────────────────────────────────────────────
interface PreviewPanelProps {
    cv: SavedCV;
    userProfile: UserProfile;
    onClose: () => void;
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    isDesktop?: boolean;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ cv, userProfile, onClose, onLoad, onDelete, isDesktop }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>(cv.template || 'v2-classic-pro');
    const [showAllTemplates, setShowAllTemplates] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [autoZoom, setAutoZoom] = useState(0.45);
    const cvData = useCVData(cv);

    // Reset template when CV changes
    useEffect(() => {
        setSelectedTemplate(cv.template || 'v2-classic-pro');
        setConfirmDelete(false);
    }, [cv.id, cv.template]);

    // Auto-fit zoom using ResizeObserver
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                if (w > 0) {
                    // A4 page is 794px wide; fit with some padding
                    setAutoZoom(Math.max(0.3, Math.min(0.75, (w - 24) / 794)));
                }
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;
    const roleCount   = cvData?.experience?.length ?? 0;
    const skillCount  = cvData?.skills?.length ?? 0;
    const atsScore    = cv.qualityReport?.score ?? (cv as any).atsScore as number | undefined;
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

    return (
        <div className="flex flex-col h-full bg-white dark:bg-neutral-900 overflow-hidden">

            {/* Panel header */}
            <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Purpose icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${purpose.bg}`}>
                        <PurposeIcon className={`h-4.5 w-4.5 ${purpose.color}`} style={{ width: 18, height: 18 }} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 truncate leading-snug">{cv.name}</h3>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                            {exactDate(cv.createdAt)}
                            {roleCount > 0 && ` · ${roleCount} role${roleCount > 1 ? 's' : ''}`}
                            {skillCount > 0 && ` · ${skillCount} skill${skillCount > 1 ? 's' : ''}`}
                        </p>
                    </div>
                    {/* ATS score ring */}
                    {atsScore !== undefined && atsScore > 0 && (
                        <ScoreRing score={atsScore} size={38} />
                    )}
                </div>
                {!isDesktop && (
                    <button
                        onClick={onClose}
                        className="ml-2 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Score + metadata strip */}
            {atsScore !== undefined && atsScore > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1"
                        style={{ background: scoreBg(atsScore) }}>
                        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: scoreColor(atsScore) }}>
                            ATS Score
                        </span>
                        <span className="font-black text-[13px] ml-auto" style={{ color: scoreColor(atsScore) }}>
                            {atsScore}<span className="text-[10px] font-semibold opacity-70">/100</span>
                        </span>
                    </div>
                    <div className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700">
                        {scoreLabel(atsScore)}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold ${purpose.bg} ${purpose.color}`}>
                        <PurposeIcon style={{ width: 11, height: 11 }} />
                        {purpose.label}
                    </span>
                </div>
            )}

            {/* Template switcher */}
            <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[9.5px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Template</span>
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate max-w-[140px]">
                        {templateDisplayNames[selectedTemplate] || selectedTemplate}
                    </span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {visibleTemplates.map(t => (
                        <button
                            key={t}
                            onClick={() => setSelectedTemplate(t)}
                            title={templateDisplayNames[t]}
                            className={`flex-shrink-0 w-9 h-12 rounded-lg overflow-hidden border-2 transition-all duration-150 ${
                                selectedTemplate === t
                                    ? 'border-[#C9A84C] shadow-md shadow-[#C9A84C]/20 scale-105'
                                    : 'border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 opacity-70 hover:opacity-100'
                            }`}
                        >
                            <div className="w-full h-full pointer-events-none" style={{ transform: 'scale(0.16)', transformOrigin: 'top left', width: '625%', height: '625%' }}>
                                <TemplateThumbnail templateName={t} />
                            </div>
                        </button>
                    ))}
                    <button
                        onClick={() => setShowAllTemplates(s => !s)}
                        className="flex-shrink-0 w-9 h-12 rounded-lg border-2 border-dashed border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/60 flex items-center justify-center text-[9px] font-black text-zinc-400 dark:text-zinc-500 hover:text-[#C9A84C] transition-colors"
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
            <div ref={containerRef} className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-neutral-950 relative min-h-0">
                {cvData ? (
                    <div className="py-3 px-3">
                        <div
                            ref={previewRef}
                            data-cv-preview-active="true"
                            className="origin-top mx-auto shadow-xl rounded-sm"
                            style={{
                                transform: `scale(${autoZoom})`,
                                transformOrigin: 'top center',
                                width: `${(1 / autoZoom) * 100}%`,
                            }}
                        >
                            <CVPreview
                                cvData={cvData}
                                personalInfo={userProfile.personalInfo}
                                template={selectedTemplate}
                                isEditing={false}
                                onDataChange={() => {}}
                                jobDescriptionForATS=""
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full py-16">
                        <div className="flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-600">
                            <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3"/>
                                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                            </svg>
                            <p className="text-xs font-medium">Loading preview…</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-zinc-100 dark:border-neutral-800 flex-shrink-0 bg-white dark:bg-neutral-900">
                <div className="grid grid-cols-3 gap-2">
                    {/* Primary: Download */}
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading || !cvData}
                        className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11.5px] font-bold transition-all disabled:opacity-50 shadow-sm hover:shadow-md active:scale-[0.98]"
                        style={{ background: NAVY, color: '#fff' }}
                    >
                        <Download className="h-3.5 w-3.5" />
                        {isDownloading ? 'Saving PDF…' : 'Download PDF'}
                    </button>

                    {/* Edit */}
                    <button
                        onClick={handleLoadAndClose}
                        disabled={!cvData}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11.5px] font-bold border border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                        <Eye className="h-3.5 w-3.5" />
                        Edit
                    </button>
                </div>

                {/* Delete */}
                <div className="mt-2">
                    {confirmDelete ? (
                        <div className="flex items-center justify-center gap-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <span className="text-[11px] text-red-600 dark:text-red-400 font-semibold">Delete this CV?</span>
                            <button onClick={() => { onDelete(cv.id); onClose(); }}
                                className="text-[11px] font-black text-red-600 dark:text-red-400 hover:underline">Yes, delete</button>
                            <button onClick={() => setConfirmDelete(false)}
                                className="text-[11px] text-zinc-500 hover:underline">Cancel</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15 transition-colors"
                        >
                            <Trash className="h-3.5 w-3.5" /> Remove from library
                        </button>
                    )}
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
    const [hovered, setHovered] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const cvData = useCVData(cv);
    const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
    const PurposeIcon = purpose.icon;
    const template = cv.template || 'v2-classic-pro';
    const atsScore = cv.qualityReport?.score ?? (cv as any).atsScore as number | undefined;
    const templateName = templateDisplayNames[template] || template;

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
                    ? 'border-[#C9A84C] shadow-lg shadow-[#C9A84C]/12 ring-1 ring-[#C9A84C]/25'
                    : 'border-zinc-200/80 dark:border-neutral-700/80 shadow-sm hover:shadow-md hover:border-[#C9A84C]/35 dark:hover:border-[#C9A84C]/25'
            }`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onPreview}
        >
            {/* ── Thumbnail ── */}
            <div className="relative overflow-hidden bg-zinc-100 dark:bg-neutral-750 flex-shrink-0" style={{ height: 180 }}>
                <div className="absolute inset-0 flex items-start justify-center pt-1.5 overflow-hidden pointer-events-none">
                    <div style={{ transform: 'scale(0.74)', transformOrigin: 'top center', width: '136%', marginLeft: '-18%' }}>
                        <TemplateThumbnail templateName={template} />
                    </div>
                </div>

                {/* Purpose badge */}
                <div className="absolute top-2.5 left-2.5 z-10">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm backdrop-blur-sm ${
                        cv.purpose === 'job' ? 'bg-blue-600 text-white'
                        : cv.purpose === 'academic' ? 'bg-teal-600 text-white'
                        : 'bg-violet-600 text-white'
                    }`}>
                        <PurposeIcon style={{ width: 9, height: 9 }} />
                        {purpose.label}
                    </span>
                </div>

                {/* ATS score badge */}
                {atsScore !== undefined && atsScore > 0 && !menuOpen && (
                    <div className="absolute top-2.5 right-2.5 z-10">
                        <div className="flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full shadow-sm backdrop-blur-sm"
                            style={{ background: scoreColor(atsScore), }}>
                            <span className="text-white text-[9.5px] font-black">{atsScore}</span>
                        </div>
                    </div>
                )}

                {/* Context menu button */}
                <div
                    className={`absolute top-2 right-2 z-20 transition-opacity duration-150 ${hovered || menuOpen || isSelected ? 'opacity-100' : 'opacity-0'}`}
                    ref={menuRef}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false); }}
                        className="w-6 h-6 rounded-md bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-sm transition-colors text-xs leading-none"
                    >···</button>
                    {menuOpen && (
                        <div className="absolute right-0 top-7 w-36 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-zinc-200 dark:border-neutral-700 py-1 z-30 overflow-hidden">
                            <button
                                onClick={() => { onLoad(); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                            >
                                <Eye className="h-3 w-3" /> Load & Edit
                            </button>
                            <div className="my-0.5 border-t border-zinc-100 dark:border-neutral-700" />
                            {confirmDelete ? (
                                <div className="px-3 py-2 flex items-center gap-2">
                                    <span className="text-[10px] text-red-500 font-semibold flex-1">Delete?</span>
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
                <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-200 ${hovered && !menuOpen ? 'opacity-100' : 'opacity-0'}`}
                    style={{ background: 'rgba(27,43,75,0.82)', backdropFilter: 'blur(1px)' }}>
                    <button
                        onClick={e => { e.stopPropagation(); onPreview(); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-[#1B2B4B] text-xs font-bold hover:bg-zinc-50 transition-colors shadow-md"
                    >
                        <Eye className="h-3 w-3" /> Preview
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onLoad(); }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-bold transition-colors shadow-md"
                        style={{ background: GOLD }}
                    >
                        Load & Edit
                    </button>
                </div>

                {/* Selected indicator bar */}
                {isSelected && (
                    <div className="absolute bottom-0 inset-x-0 h-0.5" style={{ background: GOLD }} />
                )}
            </div>

            {/* ── Card body ── */}
            <div className="px-3 pt-2.5 pb-3 flex-1 flex flex-col gap-1.5">
                {/* Name row */}
                <div className="flex items-start justify-between gap-1.5">
                    <p className="text-[12.5px] font-bold text-zinc-900 dark:text-zinc-100 truncate leading-snug flex-1" title={cv.name}>
                        {cv.name}
                    </p>
                    {atsScore !== undefined && atsScore > 0 && (
                        <ScoreRing score={atsScore} size={30} />
                    )}
                </div>

                {/* Date + template */}
                <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{relativeTime(cv.createdAt)}</span>
                    <span className="text-zinc-200 dark:text-zinc-700 text-[10px]">·</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[90px]">{templateName}</span>
                </div>

                {/* Stats chips */}
                {cvData && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {cvData.experience?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                                <Briefcase className="h-2 w-2" /> {cvData.experience.length} role{cvData.experience.length !== 1 ? 's' : ''}
                            </span>
                        )}
                        {cvData.skills?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                                ✦ {cvData.skills.length} skills
                            </span>
                        )}
                        {cvData.education?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
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

    // Auto-select first CV on large screens (lg = 1024px+)
    useEffect(() => {
        const isLg = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
        if (!isLg || paginated.length === 0) return;
        // If current selection is no longer on this page, select the first item
        const stillVisible = previewCV && paginated.some(cv => cv.id === previewCV.id);
        if (!stillVisible) {
            setPreviewCV(paginated[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paginated]);

    const counts = useMemo(() => ({
        job:      savedCVs.filter(c => c.purpose === 'job').length,
        academic: savedCVs.filter(c => c.purpose === 'academic').length,
        general:  savedCVs.filter(c => c.purpose === 'general').length,
    }), [savedCVs]);

    const lastGeneratedDate = useMemo(() => {
        if (!savedCVs.length) return null;
        const latest = savedCVs.reduce((a, b) =>
            new Date(a.createdAt) > new Date(b.createdAt) ? a : b);
        return latest.createdAt;
    }, [savedCVs]);

    const handleLoad = useCallback(async (cv: SavedCV) => {
        const data = getCVDataCached(cv.id) ?? cv.data ?? await loadCVData(cv.id);
        if (data) onLoad(data);
    }, [onLoad]);

    // Empty state
    if (savedCVs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#1B2B4B]/8 to-[#C9A84C]/8 dark:from-[#1B2B4B]/30 dark:to-[#C9A84C]/10 flex items-center justify-center mb-5 shadow-inner">
                    <FileText className="h-9 w-9 text-zinc-300 dark:text-zinc-600" />
                </div>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200 mb-2">Your CV library is empty</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed mb-6">
                    Generate and save your first CV to build your personal library.
                </p>
                {onNewCV && (
                    <button
                        onClick={onNewCV}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95"
                        style={{ background: NAVY }}
                    >
                        + Create Your First CV
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex gap-0 min-h-full relative">

            {/* ── Main content column ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-4 transition-all duration-300">

                {/* ── Header ── */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                            CV Library
                        </h2>
                        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {savedCVs.length} saved CV{savedCVs.length !== 1 ? 's' : ''}
                            {lastGeneratedDate && ` · Last generated ${relativeTime(lastGeneratedDate)}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onNewCV && (
                            <button
                                onClick={onNewCV}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
                                style={{ background: NAVY }}
                            >
                                <span className="text-base leading-none">+</span> New CV
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats chips */}
                <div className="flex items-center gap-2 flex-wrap -mt-1">
                    {counts.job > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                            <Briefcase className="h-2.5 w-2.5" /> {counts.job} Job
                        </span>
                    )}
                    {counts.academic > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800/30">
                            <BookOpen className="h-2.5 w-2.5" /> {counts.academic} Scholarship
                        </span>
                    )}
                    {counts.general > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800/30">
                            <Globe className="h-2.5 w-2.5" /> {counts.general} General
                        </span>
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
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-colors"
                            style={{ background: GOLD }}
                        >
                            Upgrade
                        </button>
                    </div>
                )}

                {/* Filter pills + toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {/* Filter pills */}
                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                        {([
                            { key: 'all', label: 'All', count: savedCVs.length },
                            { key: 'job', label: 'Job', count: counts.job },
                            { key: 'academic', label: 'Scholarship', count: counts.academic },
                            { key: 'general', label: 'General', count: counts.general },
                        ] as const).map(({ key, label, count }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 border ${
                                    filter === key
                                        ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] border-transparent text-white shadow-sm'
                                        : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600'
                                }`}
                            >
                                {label}
                                <span className={`text-[9.5px] font-bold px-1 py-0.5 rounded-full min-w-[18px] text-center ${
                                    filter === key ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400'
                                }`}>{count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Toolbar: search + sort + view */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Search */}
                        <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-32 sm:w-44 pl-7 pr-7 py-1.5 text-[11.5px] rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:border-[#1B2B4B] dark:focus:border-[#C9A84C] transition-colors"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        {/* Sort */}
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
                            className="py-1.5 pl-2 pr-6 text-[11.5px] rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:border-[#1B2B4B] dark:focus:border-[#C9A84C] transition-colors appearance-none cursor-pointer"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                        </select>

                        {/* View toggle */}
                        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                            <button
                                onClick={() => setViewMode('grid')}
                                title="Grid"
                                className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white' : 'bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600'}`}
                            >
                                <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
                                    <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                                    <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                                </svg>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                title="List"
                                className={`p-1.5 transition-colors border-l border-zinc-200 dark:border-neutral-700 ${viewMode === 'list' ? 'bg-[#1B2B4B] dark:bg-[#C9A84C] text-white' : 'bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600'}`}
                            >
                                <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
                                    <rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/>
                                    <rect x="1" y="11.5" width="14" height="2.5" rx="1"/>
                                </svg>
                            </button>
                        </div>
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
                    <div className={`grid gap-4 ${previewCV ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
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
                    /* ── List view ── */
                    <div className="flex flex-col gap-1.5">
                        {paginated.map(cv => {
                            const atsScore = cv.qualityReport?.score ?? (cv as any).atsScore as number | undefined;
                            const purpose = purposeConfig[cv.purpose] || purposeConfig.job;
                            const PurposeIcon = purpose.icon;
                            const tmplName = templateDisplayNames[cv.template || 'v2-classic-pro'] || cv.template || '';
                            return (
                                <div
                                    key={cv.id}
                                    onClick={() => setPreviewCV(cv)}
                                    className={`group flex items-center gap-3 px-4 py-3 bg-white dark:bg-neutral-800 rounded-xl border transition-all duration-150 cursor-pointer ${
                                        previewCV?.id === cv.id
                                            ? 'border-[#C9A84C] ring-1 ring-[#C9A84C]/25 shadow-sm'
                                            : 'border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/35 hover:shadow-sm'
                                    }`}
                                >
                                    {/* Mini thumbnail */}
                                    <div className="w-9 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-750">
                                        <div className="w-full h-full pointer-events-none" style={{ transform: 'scale(0.16)', transformOrigin: 'top left', width: '625%', height: '625%' }}>
                                            <TemplateThumbnail templateName={cv.template || 'v2-classic-pro'} />
                                        </div>
                                    </div>

                                    {/* Purpose icon */}
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${purpose.bg}`}>
                                        <PurposeIcon className={`${purpose.color}`} style={{ width: 14, height: 14 }} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12.5px] font-bold text-zinc-900 dark:text-zinc-100 truncate leading-snug">{cv.name}</p>
                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                                            {relativeTime(cv.createdAt)} · {tmplName}
                                        </p>
                                    </div>

                                    {/* ATS score */}
                                    {atsScore !== undefined && atsScore > 0 && (
                                        <ScoreRing score={atsScore} size={32} />
                                    )}

                                    {/* Actions (hover) */}
                                    <button
                                        onClick={e => { e.stopPropagation(); handleLoad(cv); }}
                                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-400 hover:border-[#C9A84C]/60 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); onDelete(cv.id); if (previewCV?.id === cv.id) setPreviewCV(null); }}
                                        className="flex-shrink-0 p-1.5 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
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
                                            ? 'text-white shadow-sm'
                                            : 'border border-zinc-200 dark:border-neutral-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
                                    }`}
                                    style={p === safePage ? { background: NAVY } : {}}
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

            {/* ── Right preview panel (desktop: lg+, always visible when a cv is selected) ── */}
            {previewCV && (
                <div
                    className="hidden lg:flex flex-col flex-shrink-0 ml-4 rounded-2xl overflow-hidden border border-zinc-200 dark:border-neutral-700 shadow-xl"
                    style={{ width: 420, alignSelf: 'flex-start', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)' }}
                >
                    <PreviewPanel
                        key={previewCV.id}
                        cv={previewCV}
                        userProfile={userProfile}
                        onClose={() => setPreviewCV(null)}
                        onLoad={onLoad}
                        onDelete={id => { onDelete(id); setPreviewCV(null); }}
                        isDesktop
                    />
                </div>
            )}

            {/* ── Mobile: full-screen overlay ── */}
            {previewCV && (
                <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-900">
                    <PreviewPanel
                        key={`mob-${previewCV.id}`}
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
