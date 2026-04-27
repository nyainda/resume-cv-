import React, { useState, useRef } from 'react';
import { SavedCV, CVData, TemplateName, UserProfile, templateDisplayNames } from '../types';
import { Button } from './ui/Button';
import { Trash, Eye, Download, FileText, BookOpen, Briefcase, Globe, RefreshCw, X } from './icons';
import TemplateThumbnail from './TemplateThumbnail';
import CVPreview from './CVPreview';
import { downloadCV } from '../services/cvDownloadService';

interface CVHistoryProps {
    savedCVs: SavedCV[];
    onLoad: (cvData: CVData) => void;
    onDelete: (id: string) => void;
    userProfile: UserProfile;
}

const purposeConfig: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
    job: { label: 'Job', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', icon: Briefcase },
    academic: { label: 'Scholarship', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300', icon: BookOpen },
    general: { label: 'General', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300', icon: Globe },
};

// Ordered list of all templates for the picker
const ALL_TEMPLATES: TemplateName[] = [
    'standard-pro', 'professional', 'modern', 'minimalist', 'corporate',
    'elegant', 'executive', 'classic', 'london-finance', 'harvard-gold',
    'ats-clean-pro', 'compact', 'timeline', 'twoColumnBlue', 'technical',
    'software-engineer', 'modern-tech', 'swe-elite', 'silicon-valley', 'berlin-design',
    'tokyo-night', 'paris-vibe', 'sydney-creative', 'creative', 'infographic',
    'navy-sidebar', 'photo-sidebar', 'executive-sidebar', 'scholarship-pro', 'medical-standard',
];

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
    const previewRef = useRef<HTMLDivElement>(null);

    const visibleTemplates = showAllTemplates ? ALL_TEMPLATES : ALL_TEMPLATES.slice(0, 10);

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

    const handleLoadAndClose = () => {
        onLoad(cv.data);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate">{cv.name}</h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {new Date(cv.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            {' · '}
                            {cv.data.experience?.length || 0} roles · {cv.data.skills?.length || 0} skills
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <Button variant="secondary" size="sm" onClick={handleLoadAndClose}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Load & Edit
                        </Button>
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            <Download className="h-3.5 w-3.5" />
                            {isDownloading ? 'Downloading...' : 'Download PDF'}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-800 text-zinc-500 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Template Picker */}
                <div className="px-6 py-3 border-b border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800/50 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mr-1">Template:</span>
                        {visibleTemplates.map(t => (
                            <button
                                key={t}
                                onClick={() => setSelectedTemplate(t)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 border ${
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
                            className="px-2.5 py-1 rounded-full text-xs font-medium text-[#1B2B4B] dark:text-[#C9A84C] hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/10 transition-colors border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40"
                        >
                            {showAllTemplates ? 'Show less' : `+${ALL_TEMPLATES.length - 10} more`}
                        </button>
                    </div>
                </div>

                {downloadError && (
                    <div className="px-6 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                        {downloadError}
                    </div>
                )}
                {/* Live CV Preview */}
                <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-neutral-950">
                    <div className="py-6 px-4">
                        <div
                            style={{
                                transform: 'scale(0.72)',
                                transformOrigin: 'top center',
                                width: '138.89%',
                                marginLeft: '-19.44%',
                            }}
                        >
                            <div ref={previewRef} data-cv-preview-active="true">
                                <CVPreview
                                    cvData={cv.data}
                                    personalInfo={userProfile.personalInfo}
                                    template={selectedTemplate}
                                    isEditing={false}
                                    onDataChange={() => {}}
                                    jobDescriptionForATS=""
                                />
                            </div>
                        </div>
                    </div>
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

    const filtered = savedCVs
        .filter(cv => filter === 'all' || cv.purpose === filter)
        .sort((a, b) => {
            const da = new Date(a.createdAt).getTime();
            const db = new Date(b.createdAt).getTime();
            return sortBy === 'newest' ? db - da : da - db;
        });

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
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">CV History</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{savedCVs.length} CV{savedCVs.length !== 1 ? 's' : ''} saved locally</p>
                    </div>
                    <div className="flex items-center gap-2">
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
                                    ? 'bg-[#1B2B4B] text-white shadow-md shadow-[#1B2B4B]/20'
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
                            const savedTemplate = cv.template || 'standard-pro';

                            return (
                                <div
                                    key={cv.id}
                                    className="relative bg-white dark:bg-neutral-800 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/60 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group"
                                >
                                    {/* Live thumbnail — click to open full preview */}
                                    <div
                                        className="cursor-pointer relative overflow-hidden bg-zinc-50 dark:bg-neutral-900"
                                        onClick={() => setPreviewCV(cv)}
                                        title="Click to preview"
                                        style={{ height: '200px' }}
                                    >
                                        <div className="transform scale-[0.85] origin-top-left" style={{ width: '118%' }}>
                                            <TemplateThumbnail templateName={savedTemplate} />
                                        </div>
                                        {/* Hover overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <span className="text-white text-xs font-semibold flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm">
                                                <Eye className="h-3.5 w-3.5" /> Preview CV
                                            </span>
                                        </div>
                                        {/* Template badge */}
                                        <div className="absolute top-2 right-2">
                                            <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-black/50 text-white rounded backdrop-blur-sm">
                                                {templateDisplayNames[savedTemplate]}
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
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3 italic border-l-2 border-[#C9A84C]/40 pl-2">
                                                "{cv.data.summary.substring(0, 100)}..."
                                            </p>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setPreviewCV(cv)}
                                                className="flex-1 !text-xs !py-1.5"
                                            >
                                                <Eye className="h-3.5 w-3.5 mr-1" />
                                                Preview
                                            </Button>
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
                                </div>
                            );
                        })}
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
