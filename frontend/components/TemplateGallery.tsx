import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TemplateName, templateDisplayNames, CVData, PersonalInfo, CustomTemplateEntry } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
import TemplateCustomGenerated from './templates/TemplateCustomGenerated';
import { Label } from './ui/Label';
import { CheckCircle, Eye, FileText, Search, Wand2, Trash, Upload, Edit } from './icons';
import { deleteCustomTemplate, renameCustomTemplate } from '../utils/customTemplateStorage';

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

const templateCategories = {
  'Professional': ['professional', 'corporate', 'elegant', 'executive', 'standard-pro', 'ats-clean-pro', 'london-finance', 'medical-standard'] as TemplateName[],
  'Modern': ['modern', 'modern-tech', 'twoColumnBlue', 'silicon-valley', 'tokyo-night'] as TemplateName[],
  'Creative': ['creative', 'infographic', 'sydney-creative', 'berlin-design'] as TemplateName[],
  'Academic': ['harvard-gold', 'scholarship-pro', 'classic'] as TemplateName[],
  'Minimal': ['minimalist', 'compact', 'timeline', 'paris-vibe'] as TemplateName[],
  'Technical': ['swe-elite', 'software-engineer', 'technical'] as TemplateName[],
  'Photo': ['photo-sidebar', 'navy-sidebar', 'executive-sidebar'] as TemplateName[],
  'Compact Sidebar': ['compact-slate', 'compact-sage', 'compact-charcoal'] as TemplateName[],
};

const photoSupportedTemplates: TemplateName[] = ['modern', 'twoColumnBlue', 'creative', 'minimalist', 'classic', 'photo-sidebar', 'executive-sidebar'];

const templateBadges: Partial<Record<TemplateName, { label: string; emoji: string; color: string }>> = {
  'standard-pro': { label: 'ATS King', emoji: '🎯', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'professional': { label: 'Most Popular', emoji: '⭐', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  'executive': { label: 'Harvard Style', emoji: '🏛️', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  'harvard-gold': { label: 'Premium Scholar', emoji: '🎓', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  'tokyo-night': { label: 'Cyberpunk', emoji: '🗼', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  'silicon-valley': { label: 'Startup King', emoji: '🦄', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  'paris-vibe': { label: 'High Fashion', emoji: '🗼', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300' },
  'minimalist': { label: 'Clean & Safe', emoji: '✨', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  'modern': { label: 'Trending', emoji: '🔥', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  'software-engineer': { label: 'Best for Tech', emoji: '💻', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  'swe-elite': { label: 'SWE Premium', emoji: '⚡', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'navy-sidebar': { label: 'Bold & Sharp', emoji: '🏛️', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  'photo-sidebar': { label: 'With Photo', emoji: '📷', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  'executive-sidebar': { label: 'Premium Photo', emoji: '🏆', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  'ats-clean-pro': { label: 'ATS Optimized', emoji: '🎯', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  'compact-slate': { label: 'One-Page', emoji: '📄', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300' },
  'compact-sage': { label: 'One-Page', emoji: '🌿', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'compact-charcoal': { label: 'One-Page', emoji: '⬛', color: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300' },
};

const atsLevel: Record<TemplateName, 'high' | 'medium' | 'low'> = {
  'standard-pro': 'high',
  'ats-clean-pro': 'high',
  'professional': 'high',
  'classic': 'high',
  'executive': 'high',
  'compact': 'high',
  'minimalist': 'high',
  'corporate': 'medium',
  'elegant': 'medium',
  'technical': 'medium',
  'london-finance': 'medium',
  'medical-standard': 'medium',
  'scholarship-pro': 'medium',
  'harvard-gold': 'medium',
  'timeline': 'medium',
  'swe-elite': 'medium',
  'software-engineer': 'medium',
  'modern': 'medium',
  'modern-tech': 'medium',
  'silicon-valley': 'medium',
  'twoColumnBlue': 'medium',
  'navy-sidebar': 'medium',
  'swe-clean': 'medium',
  'swe-impact': 'medium',
  'creative': 'low',
  'infographic': 'low',
  'tokyo-night': 'low',
  'paris-vibe': 'low',
  'berlin-design': 'low',
  'sydney-creative': 'low',
  'swe-neon': 'low',
  'swe-vivid': 'low',
  'photo-sidebar': 'low',
  'executive-sidebar': 'low',
  'compact-slate': 'medium',
  'compact-sage': 'medium',
  'compact-charcoal': 'medium',
  'custom': 'medium',
};

const atsConfig = {
  high:   { label: 'ATS Safe',     dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  medium: { label: 'ATS Friendly', dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
  low:    { label: 'Design Only',  dot: 'bg-rose-400',    text: 'text-rose-600 dark:text-rose-400' },
};

const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  selectedTemplate, onSelect, cvData, personalInfo,
  customTemplates = [], customTemplateId, onSelectCustom, onOpenUploader, onRenameCustom,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [hoveredTemplate, setHoveredTemplate] = useState<TemplateName | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, forceUpdate] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  const allTemplates = Object.keys(templateDisplayNames) as TemplateName[];

  const filteredTemplates = useMemo(() => {
    let base: TemplateName[] =
      activeCategory === 'All'
        ? allTemplates
        : templateCategories[activeCategory as keyof typeof templateCategories] || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        t => templateDisplayNames[t].toLowerCase().includes(q) || t.toLowerCase().includes(q)
      );
    }
    return base;
  }, [activeCategory, searchQuery, allTemplates]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Label className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-0.5 block">
            Choose Template
          </Label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Pick a style that fits your role
          </p>
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0 w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search templates…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-1.5">
        {['All', ...Object.keys(templateCategories)].map((category) => {
          const isActive = activeCategory === category && !searchQuery;
          const count =
            category === 'All'
              ? allTemplates.length
              : templateCategories[category as keyof typeof templateCategories]?.length || 0;

          return (
            <button
              key={category}
              onClick={() => { setActiveCategory(category); setSearchQuery(''); }}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
                ${isActive
                  ? 'bg-[#1B2B4B] text-white shadow-md shadow-[#1B2B4B]/20'
                  : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'
                }
              `}
            >
              {category}
              <span className={`ml-1.5 text-[10px] ${isActive ? 'text-[#C9A84C]/90' : 'text-zinc-400'}`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* My Templates pill */}
        {customTemplates.length > 0 && (
          <button
            onClick={() => { setActiveCategory('My Templates'); setSearchQuery(''); }}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
              ${activeCategory === 'My Templates' && !searchQuery
                ? 'bg-[#C9A84C] text-white shadow-md shadow-[#C9A84C]/30'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
              }
            `}
          >
            ✨ My Templates
            <span className={`ml-1.5 text-[10px] ${activeCategory === 'My Templates' && !searchQuery ? 'text-white/80' : 'text-amber-500'}`}>
              {customTemplates.length}
            </span>
          </button>
        )}

        {/* Upload Template button */}
        <button
          onClick={onOpenUploader}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700 flex items-center gap-1.5"
        >
          <Wand2 className="h-3 w-3" />
          Analyze & Clone
        </button>

        {/* Result count when searching */}
        {searchQuery && (
          <span className="self-center ml-1 text-xs text-zinc-500 dark:text-zinc-400">
            {filteredTemplates.length} result{filteredTemplates.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ATS Legend */}
      <div className="flex items-center gap-4 text-[10px] text-zinc-500 dark:text-zinc-400">
        {Object.entries(atsConfig).map(([level, cfg]) => (
          <span key={level} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* My Templates Grid */}
      {activeCategory === 'My Templates' && !searchQuery && (
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
                const isSelected = customTemplateId === ct.id;
                const isRenaming = renamingId === ct.id;
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
                      {/* Action buttons — delete & rename */}
                      <div className="absolute top-1.5 left-1.5 z-10 flex gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomTemplate(ct.id);
                            onRenameCustom?.(ct.id, ''); // signal deletion to parent
                            forceUpdate(n => n + 1);
                          }}
                          className="bg-white/80 hover:bg-red-50 text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          title="Delete template"
                        >
                          <Trash className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(ct.id);
                            setRenameValue(ct.name);
                          }}
                          className="bg-white/80 hover:bg-amber-50 text-amber-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          title="Rename template"
                        >
                          <Edit className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      {/* Mini live preview */}
                      <div className="bg-white h-36 overflow-hidden flex items-start justify-center pointer-events-none">
                        <div style={{ transform: 'scale(0.25)', transformOrigin: 'top center', width: '400%', height: '400%' }}>
                          <TemplateCustomGenerated
                            cvData={cvData ?? {
                              summary: '', skills: [], experience: [], education: [],
                            }}
                            personalInfo={personalInfo ?? { name: 'Preview', email: '', phone: '', location: '' }}
                            spec={ct.spec}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Name / inline rename input */}
                    <div className="mt-2 text-center px-1">
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(ct.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(ct.id); }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          maxLength={50}
                          className="w-full text-xs font-semibold text-center rounded border border-[#C9A84C] bg-amber-50 dark:bg-amber-900/20 text-zinc-900 dark:text-zinc-100 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
                        />
                      ) : (
                        <p
                          className={`text-xs font-semibold leading-tight ${isSelected ? 'text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-300'}`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(ct.id);
                            setRenameValue(ct.name);
                          }}
                          title="Double-click to rename"
                        >
                          {ct.name}
                        </p>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium mt-0.5 text-amber-700 dark:text-amber-400">
                        <span className="w-1 h-1 rounded-full bg-amber-400" />
                        AI Cloned
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Add another button */}
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

      {/* Templates Grid */}
      {activeCategory !== 'My Templates' && (<>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {filteredTemplates.map((template) => {
          const isSelected = selectedTemplate === template;
          const isHovered = hoveredTemplate === template;
          const atsCfg = atsConfig[atsLevel[template] ?? 'medium'];

          return (
            <div
              key={template}
              onClick={() => onSelect(template)}
              onMouseEnter={() => setHoveredTemplate(template)}
              onMouseLeave={() => setHoveredTemplate(null)}
              className="cursor-pointer group relative"
            >
              {/* Template Card */}
              <div
                className={`
                  relative rounded-xl overflow-hidden transition-all duration-200
                  ${isSelected
                    ? 'ring-[3px] ring-[#C9A84C] shadow-xl shadow-[#1B2B4B]/15 scale-[1.03]'
                    : 'ring-1 ring-zinc-200 dark:ring-neutral-700 hover:ring-[#C9A84C]/50 hover:shadow-lg hover:scale-[1.01]'
                  }
                `}
              >
                {/* Selected checkmark */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 z-10 bg-[#C9A84C] text-white rounded-full p-0.5 shadow-md">
                    <CheckCircle className="h-3 w-3" />
                  </div>
                )}

                {/* Hover overlay */}
                {isHovered && !isSelected && (
                  <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <div className="bg-white dark:bg-neutral-800 rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-xl">
                      <Eye className="h-3.5 w-3.5 text-[#1B2B4B]" />
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">Select</span>
                    </div>
                  </div>
                )}

                {/* Thumbnail */}
                <div className="bg-white">
                  <TemplateThumbnail templateName={template} cvData={cvData} personalInfo={personalInfo} />
                </div>
              </div>

              {/* Name + meta */}
              <div className="mt-2 text-center px-1">
                <p className={`text-xs font-semibold leading-tight transition-colors duration-150 ${
                  isSelected ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-300 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C]'
                }`}>
                  {templateDisplayNames[template]}
                </p>

                {/* ATS indicator */}
                <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium mt-0.5 ${atsCfg.text}`}>
                  <span className={`w-1 h-1 rounded-full ${atsCfg.dot}`} />
                  {atsCfg.label}
                </span>

                {/* Special badges */}
                {templateBadges[template] && (
                  <div className="mt-0.5">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${templateBadges[template]!.color}`}>
                      {templateBadges[template]!.emoji} {templateBadges[template]!.label}
                    </span>
                  </div>
                )}

                {/* Photo support */}
                {photoSupportedTemplates.includes(template) && personalInfo?.photo && (
                  <div className="mt-0.5">
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                      📷 Photo
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-100 dark:bg-neutral-800 rounded-full mb-3">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 font-medium">
            No templates found{searchQuery ? ` for "${searchQuery}"` : ''}
          </p>
          <button
            onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
            className="mt-2 text-sm text-[#C9A84C] hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
      </>)}

      {/* Quick Tips */}
      <div className="p-3 bg-gradient-to-r from-blue-50 to-[#F8F7F4] dark:from-blue-900/10 dark:to-[#1B2B4B]/10 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex gap-2.5">
          <span className="text-sm flex-shrink-0">💡</span>
          <div className="text-[11px] text-blue-700 dark:text-blue-300 space-y-0.5">
            <p><strong>ATS King (Standard Pro)</strong> — safest pick for corporate & tech.</p>
            <p><strong>Executive</strong> — Harvard-style. Senior roles, law, C-suite.</p>
            <p><strong>SWE Elite / Tech</strong> — software engineers, data science, DevOps.</p>
            <p><strong>Creative / Infographic</strong> — design & marketing only. Not ATS-safe.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateGallery;
