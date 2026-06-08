import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TemplateName, templateDisplayNames, CVData, PersonalInfo, CustomTemplateEntry } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
import TemplateCustomGenerated from './templates/TemplateCustomGenerated';
import { Label } from './ui/Label';
import { CheckCircle, Eye, FileText, Search, Wand2, Trash, Upload, Edit, RefreshCw, Loader2 } from './icons';
import { deleteCustomTemplate, renameCustomTemplate, saveCustomTemplate } from '../utils/customTemplateStorage';
import { analyzeAndGenerateTemplate } from '../services/templateAnalyzerService';

interface TemplateGalleryProps {
  selectedTemplate: TemplateName;
  onSelect: (template: TemplateName) => void;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
  customTemplates?: CustomTemplateEntry[];
  customTemplateId?: string;
  onSelectCustom?: (id: string) => void;
  onOpenUploader?: () => void;
  onRenameCustom?: (id: string, name: string) => void;
}

// ─── Category definitions ─────────────────────────────────────────────────────

const templateCategories: Record<string, TemplateName[]> = {
  '✨ New Engine': ['v2-pro', 'v2-navy', 'v2-photo', 'v2-slate-sidebar', 'v2-gold-exec', 'v2-minimal', 'v2-sage', 'v2-terminal', 'v2-noir', 'v2-editorial', 'v2-coral', 'v2-amber', 'v2-ink', 'v2-forest'],
  'Professional': ['professional', 'corporate', 'elegant', 'executive', 'standard-pro', 'ats-clean-pro', 'london-finance', 'medical-standard'],
  'Modern':       ['prestige', 'modern', 'modern-tech', 'twoColumnBlue', 'silicon-valley', 'tokyo-night'],
  'Creative':     ['creative', 'infographic', 'sydney-creative', 'berlin-design'],
  'Academic':     ['harvard-gold', 'scholarship-pro', 'classic'],
  'Minimal':      ['minimalist', 'compact', 'timeline', 'paris-vibe'],
  'Technical':    ['swe-elite', 'software-engineer', 'technical'],
  'Photo':        ['photo-sidebar', 'navy-sidebar', 'executive-sidebar'],
  'Compact Sidebar': ['compact-slate', 'compact-sage', 'compact-charcoal'],
};

const categoryIcons: Record<string, string> = {
  'Professional':    '🏢',
  'Modern':          '⚡',
  'Creative':        '🎨',
  'Academic':        '🎓',
  'Minimal':         '✦',
  'Technical':       '💻',
  'Photo':           '📷',
  'Compact Sidebar': '📄',
};

// ─── Featured picks — one per use case ────────────────────────────────────────

interface FeaturedPick {
  template: TemplateName;
  badge: string;
  badgeColor: string;
  bestFor: string;
}

const FEATURED_PICKS: FeaturedPick[] = [
  { template: 'standard-pro',      badge: '🎯 ATS King',        badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', bestFor: 'Corporate & tech hiring' },
  { template: 'professional',      badge: '⭐ Most Popular',     badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',   bestFor: 'Any professional role'  },
  { template: 'modern',            badge: '🔥 Trending',         badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', bestFor: 'Creative & startup roles' },
  { template: 'executive',         badge: '🏛️ Harvard Style',    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',         bestFor: 'C-suite, law & finance'   },
  { template: 'minimalist',        badge: '✨ Clean & Safe',      badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300', bestFor: 'Any industry'             },
  { template: 'software-engineer', badge: '💻 Best for Tech',    badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',             bestFor: 'SWE, DevOps, data science'},
  { template: 'navy-sidebar',      badge: '🏛️ Bold & Sharp',     badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',         bestFor: 'Management & operations' },
  { template: 'compact-slate',     badge: '📄 One-Page',         badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300',     bestFor: 'Entry-level & internships'},
  { template: 'prestige',          badge: '👑 Premium Design',   badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',       bestFor: 'Senior roles & executives' },
];

// ─── ATS config ───────────────────────────────────────────────────────────────

const photoSupportedTemplates: TemplateName[] = ['modern', 'twoColumnBlue', 'creative', 'minimalist', 'classic', 'photo-sidebar', 'executive-sidebar', 'v2-photo', 'v2-slate-sidebar', 'v2-gold-exec', 'v2-sage', 'v2-coral', 'v2-forest'];

const atsLevel: Record<TemplateName, 'high' | 'medium' | 'low'> = {
  'standard-pro': 'high', 'ats-clean-pro': 'high', 'professional': 'high',
  'classic': 'high', 'executive': 'high', 'compact': 'high', 'minimalist': 'high',
  'corporate': 'medium', 'elegant': 'medium', 'technical': 'medium',
  'london-finance': 'medium', 'medical-standard': 'medium', 'scholarship-pro': 'medium',
  'harvard-gold': 'medium', 'timeline': 'medium', 'swe-elite': 'medium',
  'software-engineer': 'medium', 'modern': 'medium', 'modern-tech': 'medium',
  'silicon-valley': 'medium', 'twoColumnBlue': 'medium', 'navy-sidebar': 'medium',
  'swe-clean': 'medium', 'swe-impact': 'medium', 'creative': 'low',
  'infographic': 'low', 'tokyo-night': 'low', 'paris-vibe': 'low',
  'berlin-design': 'low', 'sydney-creative': 'low', 'swe-neon': 'low',
  'swe-vivid': 'low', 'photo-sidebar': 'low', 'executive-sidebar': 'low',
  'compact-slate': 'medium', 'compact-sage': 'medium', 'compact-charcoal': 'medium',
  'prestige': 'medium', 'custom': 'medium',
  'v2-pro': 'high', 'v2-navy': 'high', 'v2-minimal': 'high',
  'v2-photo': 'medium', 'v2-slate-sidebar': 'medium', 'v2-gold-exec': 'medium',
  'v2-sage': 'medium', 'v2-forest': 'medium', 'v2-coral': 'medium', 'v2-ink': 'high',
  'v2-terminal': 'low', 'v2-noir': 'low',
  'v2-editorial': 'medium', 'v2-amber': 'high',
};

const atsConfig = {
  high:   { label: 'ATS Safe',     dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  medium: { label: 'ATS Friendly', dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
  low:    { label: 'Design Only',  dot: 'bg-rose-400',    text: 'text-rose-600 dark:text-rose-400' },
};

// ─── Template card (shared) ───────────────────────────────────────────────────

interface TemplateCardProps {
  template: TemplateName;
  isSelected: boolean;
  onSelect: (t: TemplateName) => void;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
  extraBadge?: React.ReactNode;
  footerLabel?: React.ReactNode;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template, isSelected, onSelect, cvData, personalInfo, extraBadge, footerLabel,
}) => {
  const atsCfg = atsConfig[atsLevel[template] ?? 'medium'];

  return (
    <div
      onClick={() => onSelect(template)}
      className="cursor-pointer group"
    >
      <div className={`
        relative rounded-xl overflow-hidden transition-all duration-200
        ${isSelected
          ? 'ring-[3px] ring-[#C9A84C] shadow-xl shadow-[#1B2B4B]/15 scale-[1.02]'
          : 'ring-1 ring-zinc-200 dark:ring-neutral-700 hover:ring-[#C9A84C]/50 hover:shadow-lg hover:scale-[1.01]'
        }
      `}>
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 z-10 bg-[#C9A84C] text-white rounded-full p-0.5 shadow-md">
            <CheckCircle className="h-3 w-3" />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
          <div className="bg-white dark:bg-neutral-800 rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-xl">
            <Eye className="h-3.5 w-3.5 text-[#1B2B4B]" />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
              {isSelected ? 'Selected' : 'Select'}
            </span>
          </div>
        </div>
        <div className="bg-white">
          <TemplateThumbnail templateName={template} cvData={cvData} personalInfo={personalInfo} />
        </div>
      </div>

      <div className="mt-2 text-center px-1 space-y-0.5">
        <p className={`text-xs font-semibold leading-tight transition-colors duration-150 ${
          isSelected ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-300 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C]'
        }`}>
          {templateDisplayNames[template]}
        </p>
        {extraBadge}
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${atsCfg.text}`}>
          <span className={`w-1 h-1 rounded-full ${atsCfg.dot}`} />
          {atsCfg.label}
        </span>
        {footerLabel}
        {photoSupportedTemplates.includes(template) && personalInfo?.photo && (
          <div>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              📷 Photo
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  selectedTemplate, onSelect, cvData, personalInfo,
  customTemplates = [], customTemplateId, onSelectCustom, onOpenUploader, onRenameCustom,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('Featured');
  const [searchQuery, setSearchQuery]       = useState('');
  const [, forceUpdate]                     = useState(0);
  const [renamingId, setRenamingId]         = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId]   = useState<string | null>(null);
  const [reanalyzeError, setReanalyzeError] = useState<Record<string, string>>({});
  const [renameValue, setRenameValue]       = useState('');
  const renameInputRef                      = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== customTemplates.find(t => t.id === id)?.name) {
      renameCustomTemplate(id, trimmed);
      onRenameCustom?.(id, trimmed);
    }
    setRenamingId(null);
  };

  const handleReanalyze = async (ct: CustomTemplateEntry) => {
    if (!ct.thumbnail) {
      setReanalyzeError(prev => ({ ...prev, [ct.id]: 'No source image stored — please delete and re-upload.' }));
      return;
    }
    setReanalyzeError(prev => { const n = { ...prev }; delete n[ct.id]; return n; });
    setReanalyzingId(ct.id);
    try {
      const match = ct.thumbnail.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Could not read stored image.');
      const [, mimeType, base64] = match;
      const result = await analyzeAndGenerateTemplate(base64, mimeType, ct.name);
      saveCustomTemplate({ ...ct, spec: result.spec });
      onRenameCustom?.(ct.id, ct.name);
      forceUpdate(n => n + 1);
    } catch (err) {
      setReanalyzeError(prev => ({ ...prev, [ct.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setReanalyzingId(null);
    }
  };

  const allTemplates = Object.keys(templateDisplayNames) as TemplateName[];

  // When searching, scan all templates across all categories
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allTemplates.filter(
      t => templateDisplayNames[t].toLowerCase().includes(q) || t.toLowerCase().includes(q)
    );
  }, [searchQuery, allTemplates]);

  const categoryTemplates = useMemo(() => {
    if (activeCategory === 'Featured' || activeCategory === 'My Templates') return [];
    return templateCategories[activeCategory] || [];
  }, [activeCategory]);

  const tabs = ['Featured', ...Object.keys(templateCategories)];

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Label className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-0.5 block">
            Choose Template
          </Label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {activeCategory === 'Featured' && !searchQuery ? '8 expert-curated picks — one for every career goal' : `${activeCategory} templates`}
          </p>
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0 w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search all templates…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Category tab strip ─────────────────────────────────────────────── */}
      {!searchQuery && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
          {/* Featured tab */}
          <button
            onClick={() => setActiveCategory('Featured')}
            className={`
              flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150
              ${activeCategory === 'Featured'
                ? 'bg-gradient-to-br from-[#1B2B4B] to-[#243d6b] text-white shadow-md shadow-[#1B2B4B]/25'
                : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'
              }
            `}
          >
            <span className="text-sm">⭐</span>
            <span>Featured</span>
          </button>

          {/* Category tabs */}
          {tabs.slice(1).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150
                ${activeCategory === cat
                  ? 'bg-[#1B2B4B] text-white shadow-md shadow-[#1B2B4B]/20'
                  : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'
                }
              `}
            >
              <span className="text-sm">{categoryIcons[cat]}</span>
              <span>{cat}</span>
              <span className={`text-[10px] ${activeCategory === cat ? 'text-[#C9A84C]/90' : 'text-zinc-400'}`}>
                {templateCategories[cat]?.length}
              </span>
            </button>
          ))}

          {/* My Templates tab */}
          {customTemplates.length > 0 && (
            <button
              onClick={() => setActiveCategory('My Templates')}
              className={`
                flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150
                ${activeCategory === 'My Templates'
                  ? 'bg-[#C9A84C] text-white shadow-md shadow-[#C9A84C]/30'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                }
              `}
            >
              <span>✨</span>
              <span>My Templates</span>
              <span className={`text-[10px] ${activeCategory === 'My Templates' ? 'text-white/80' : 'text-amber-500'}`}>
                {customTemplates.length}
              </span>
            </button>
          )}

          {/* Analyze & Clone */}
          <button
            onClick={onOpenUploader}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-all duration-150 border border-dashed border-zinc-300 dark:border-neutral-600 hover:border-[#C9A84C]"
          >
            <Wand2 className="h-3 w-3" />
            <span>Analyze & Clone</span>
          </button>
        </div>
      )}

      {/* ── ATS legend ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 text-[10px] text-zinc-500 dark:text-zinc-400">
        {Object.entries(atsConfig).map(([level, cfg]) => (
          <span key={level} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* ── Search results ─────────────────────────────────────────────────── */}
      {searchResults && (
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
          </p>
          {searchResults.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No templates found</p>
              <button onClick={() => setSearchQuery('')} className="mt-2 text-sm text-[#C9A84C] hover:underline">
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {searchResults.map(t => (
                <TemplateCard
                  key={t} template={t} isSelected={selectedTemplate === t}
                  onSelect={onSelect} cvData={cvData} personalInfo={personalInfo}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Featured picks view ────────────────────────────────────────────── */}
      {!searchQuery && activeCategory === 'Featured' && (
        <div className="space-y-4">
          {/* 4-column picks grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
            {FEATURED_PICKS.map(({ template, badge, badgeColor, bestFor }) => (
              <TemplateCard
                key={template}
                template={template}
                isSelected={selectedTemplate === template}
                onSelect={onSelect}
                cvData={cvData}
                personalInfo={personalInfo}
                extraBadge={
                  <div>
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${badgeColor}`}>
                      {badge}
                    </span>
                  </div>
                }
                footerLabel={
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">
                    {bestFor}
                  </p>
                }
              />
            ))}
          </div>

          {/* Browse all link */}
          <div className="flex items-center justify-center pt-1">
            <button
              onClick={() => setActiveCategory('Professional')}
              className="text-xs text-zinc-400 hover:text-[#C9A84C] dark:text-zinc-500 dark:hover:text-[#C9A84C] transition-colors flex items-center gap-1.5"
            >
              <span>Browse all {allTemplates.length} templates by category</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Category view ──────────────────────────────────────────────────── */}
      {!searchQuery && activeCategory !== 'Featured' && activeCategory !== 'My Templates' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {categoryTemplates.map(template => (
              <TemplateCard
                key={template}
                template={template}
                isSelected={selectedTemplate === template}
                onSelect={onSelect}
                cvData={cvData}
                personalInfo={personalInfo}
              />
            ))}
          </div>
          {categoryTemplates.length === 0 && (
            <div className="text-center py-10">
              <p className="text-zinc-500 text-sm">No templates in this category.</p>
            </div>
          )}
        </div>
      )}

      {/* ── My Templates view ──────────────────────────────────────────────── */}
      {!searchQuery && activeCategory === 'My Templates' && (
        <div>
          {customTemplates.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">No custom templates yet.</p>
              <button onClick={onOpenUploader} className="mt-2 text-sm text-[#C9A84C] hover:underline flex items-center gap-1 mx-auto">
                <Wand2 className="h-3.5 w-3.5" /> Analyze & Clone a template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {customTemplates.map((ct) => {
                const isSelected  = customTemplateId === ct.id;
                const isRenaming  = renamingId === ct.id;
                return (
                  <div key={ct.id} className="cursor-pointer group relative">
                    <div
                      onClick={() => onSelectCustom?.(ct.id)}
                      className={`relative rounded-xl overflow-hidden transition-all duration-200
                        ${isSelected
                          ? 'ring-[3px] ring-[#C9A84C] shadow-xl shadow-[#1B2B4B]/15 scale-[1.03]'
                          : 'ring-1 ring-zinc-200 dark:ring-neutral-700 hover:ring-[#C9A84C]/50 hover:shadow-lg hover:scale-[1.01]'
                        }
                      `}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-[#C9A84C] text-white rounded-full p-0.5 shadow-md">
                          <CheckCircle className="h-3 w-3" />
                        </div>
                      )}
                      {/* Action buttons */}
                      <div className="absolute top-1.5 left-1.5 z-10 flex gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(ct.id); onRenameCustom?.(ct.id, ''); forceUpdate(n => n + 1); }}
                          className="bg-white/80 hover:bg-red-50 text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Delete">
                          <Trash className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setRenamingId(ct.id); setRenameValue(ct.name); }}
                          className="bg-white/80 hover:bg-amber-50 text-amber-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Rename">
                          <Edit className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); if (reanalyzingId !== ct.id) handleReanalyze(ct); }}
                          disabled={reanalyzingId === ct.id}
                          className="bg-white/80 hover:bg-sky-50 text-sky-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm disabled:cursor-not-allowed" title="Re-analyze">
                          {reanalyzingId === ct.id
                            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : <RefreshCw className="h-2.5 w-2.5" />
                          }
                        </button>
                      </div>
                      {/* Loading overlay */}
                      {reanalyzingId === ct.id && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 dark:bg-neutral-900/80 gap-1.5">
                          <Loader2 className="h-5 w-5 animate-spin text-[#C9A84C]" />
                          <span className="text-[9px] font-semibold text-zinc-600 dark:text-zinc-300">Re-analyzing…</span>
                        </div>
                      )}
                      <div className="bg-white h-36 overflow-hidden flex items-start justify-center pointer-events-none">
                        <div style={{ transform: 'scale(0.25)', transformOrigin: 'top center', width: '400%', height: '400%' }}>
                          <TemplateCustomGenerated
                            cvData={cvData ?? { summary: '', skills: [], experience: [], education: [] }}
                            personalInfo={personalInfo ?? { name: 'Preview', email: '', phone: '', location: '' }}
                            spec={ct.spec}
                            customizations={ct.customizations}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-center px-1">
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(ct.id)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(ct.id); } if (e.key === 'Escape') setRenamingId(null); }}
                          onClick={e => e.stopPropagation()}
                          maxLength={50}
                          className="w-full text-xs font-semibold text-center rounded border border-[#C9A84C] bg-amber-50 dark:bg-amber-900/20 text-zinc-900 dark:text-zinc-100 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
                        />
                      ) : (
                        <p
                          className={`text-xs font-semibold leading-tight ${isSelected ? 'text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-300'}`}
                          onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(ct.id); setRenameValue(ct.name); }}
                          title="Double-click to rename"
                        >
                          {ct.name}
                        </p>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium mt-0.5 text-amber-700 dark:text-amber-400">
                        <span className="w-1 h-1 rounded-full bg-amber-400" />
                        AI Cloned
                      </span>
                      {reanalyzeError[ct.id] && (
                        <p className="text-[8.5px] text-red-500 mt-0.5 leading-tight">{reanalyzeError[ct.id]}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Add another */}
              <div
                onClick={onOpenUploader}
                className="cursor-pointer group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 dark:border-neutral-600 hover:border-[#C9A84C] hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all duration-200 h-36"
              >
                <Upload className="h-5 w-5 text-zinc-400 group-hover:text-[#C9A84C] mb-1.5 transition-colors" />
                <span className="text-[10px] font-semibold text-zinc-400 group-hover:text-[#C9A84C] transition-colors">Add Template</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick tips ─────────────────────────────────────────────────────── */}
      {!searchQuery && (
        <div className="p-3 bg-gradient-to-r from-blue-50 to-[#F8F7F4] dark:from-blue-900/10 dark:to-[#1B2B4B]/10 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex gap-2.5">
            <span className="text-sm flex-shrink-0">💡</span>
            <div className="text-[11px] text-blue-700 dark:text-blue-300 space-y-0.5">
              <p><strong>ATS King (Standard Pro)</strong> — safest pick for corporate & tech. Passes every ATS.</p>
              <p><strong>Executive</strong> — Harvard-style. Ideal for senior roles, law, finance, C-suite.</p>
              <p><strong>SWE Elite / Software Engineer</strong> — built for engineers, data scientists & DevOps.</p>
              <p><strong>Creative / Infographic</strong> — design & marketing only. Not ATS-safe.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateGallery;
