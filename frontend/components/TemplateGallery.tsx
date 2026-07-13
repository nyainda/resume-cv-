import React, { useState, useMemo } from 'react';
import { TemplateName, templateDisplayNames, CVData, PersonalInfo } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
import { Label } from './ui/Label';
import { CheckCircle, Eye, FileText, Search } from './icons';

interface TemplateGalleryProps {
  selectedTemplate: TemplateName;
  onSelect: (template: TemplateName) => void;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
}

// ─── Category definitions ─────────────────────────────────────────────────────

// ─── Active gallery templates ──────────────────────────────────────────────────
// Only genuinely distinct designs are listed here. Near-duplicate legacy templates
// have been consolidated into their V2 engine equivalents (see CONSOLIDATION_MAP
// below). Those templates remain in CVPreview.tsx switch/types.ts for backward
// compatibility — existing user CVs that used them still render correctly.
const templateCategories: Record<string, TemplateName[]> = {
  // Most widely used — safe for any industry. Leads with ATS-safe options.
  'Professional': [
    'v2-ats-max', 'v2-skills-first', 'v2-starter',
    'v2-classic-pro', 'v2-standard-black', 'v2-pro', 'v2-navy',
    'v2-harvard', 'v2-warm',
  ],
  // Contemporary accent-forward designs
  'Modern': [
    'v2-bold', 'v2-graphite',
  ],
  // Senior, C-suite and leadership roles
  'Executive': [
    'v2-ink',
  ],
  // Engineers, developers, and technical contributors
  'Technical': [
    'v2-modern-blue', 'v2-terminal', 'v2-noir',
  ],
  // Research, academia, graduate programmes
  'Academic': [
    'v2-amber', 'v2-ink',
  ],
  // Clean, sparse layouts — highest ATS parse rates
  'Minimal': [
    'v2-minimal', 'v2-graphite',
  ],
};

const categoryIcons: Record<string, string> = {
  'Professional': '💼',
  'Modern':       '⚡',
  'Executive':    '👑',
  'Technical':    '💻',
  'Creative':     '🎨',
  'Academic':     '🎓',
  'Photo':        '📷',
  'Minimal':      '📄',
};

// ─── Featured picks — one per use case ────────────────────────────────────────

interface FeaturedPick {
  template: TemplateName;
  badge: string;
  badgeColor: string;
  bestFor: string;
}

const FEATURED_PICKS: FeaturedPick[] = [
  { template: 'v2-ats-max',       badge: '🛡️ Max ATS Safety',  badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',     bestFor: 'Workday, Greenhouse, Taleo'    },
  { template: 'v2-classic-pro',   badge: '⭐ Most Trusted',   badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',     bestFor: 'Any professional role'         },
  { template: 'v2-harvard',       badge: '🏛️ Harvard Style',  badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',         bestFor: 'Consulting, law & finance'     },
  { template: 'v2-pro',           badge: '🎯 ATS Safe',        badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', bestFor: 'Corporate & tech hiring'    },
  { template: 'v2-modern-blue',   badge: '💻 Best for Tech',   badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',             bestFor: 'SWE, product & data science'   },
  { template: 'v2-skills-first',  badge: '🔑 Skills First',    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',         bestFor: 'Career changers & switchers'   },
  { template: 'v2-gold-exec',     badge: '👑 Executive',       badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', bestFor: 'C-suite & senior leadership'   },
  { template: 'v2-starter',       badge: '🎓 Career Starter',  badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',     bestFor: 'Graduates & first roles'       },
  { template: 'v2-editorial',     badge: '🎨 Creative',        badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',         bestFor: 'Design, media & marketing'     },
];

// ─── ATS config ───────────────────────────────────────────────────────────────

const photoSupportedTemplates: TemplateName[] = [
  'v2-photo', 'v2-slate-sidebar', 'v2-gold-exec', 'v2-sage', 'v2-coral', 'v2-forest',
  'v2-teal', 'v2-steel', 'v2-crimson',
];

const atsLevel: Record<TemplateName, 'high' | 'medium' | 'low'> = {
  // Legacy remaining
  'ats-clean-pro': 'high', 'professional': 'high', 'minimalist': 'high',
  'london-finance': 'medium', 'medical-standard': 'medium',
  'harvard-gold': 'medium', 'timeline': 'medium', 'swe-elite': 'medium',
  'swe-clean': 'medium', 'swe-impact': 'medium',
  'creative': 'low', 'infographic': 'low', 'tokyo-night': 'low',
  'paris-vibe': 'low', 'berlin-design': 'low', 'swe-neon': 'low', 'swe-vivid': 'low',
  // V2
  'v2-classic-pro': 'high', 'v2-standard-black': 'high',
  'v2-pro': 'high', 'v2-navy': 'high', 'v2-minimal': 'high', 'v2-amber': 'high', 'v2-ink': 'high',
  'v2-harvard': 'high', 'v2-warm': 'high', 'v2-bold': 'high',
  'v2-modern-blue': 'high', 'v2-graphite': 'high',
  'v2-ats-max': 'high', 'v2-skills-first': 'high', 'v2-starter': 'high',
  'v2-photo': 'medium', 'v2-slate-sidebar': 'medium', 'v2-gold-exec': 'medium',
  'v2-sage': 'medium', 'v2-forest': 'medium', 'v2-coral': 'medium',
  'v2-editorial': 'medium', 'v2-steel': 'medium', 'v2-teal': 'medium', 'v2-crimson': 'medium',
  'v2-terminal': 'low', 'v2-noir': 'low',
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
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('Featured');
  const [searchQuery, setSearchQuery]       = useState('');

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
            {activeCategory === 'Featured' && !searchQuery ? '9 expert-curated picks — one for every career goal' : `${activeCategory} templates`}
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
          {/* Featured picks grid — 3 cols on sm, 4 on md, 5 on lg to fit 9 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
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

      {/* ── Quick tips ─────────────────────────────────────────────────────── */}
      {!searchQuery && (
        <div className="p-3 bg-gradient-to-r from-blue-50 to-[#F8F7F4] dark:from-blue-900/10 dark:to-[#1B2B4B]/10 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex gap-2.5">
            <span className="text-sm flex-shrink-0">💡</span>
            <div className="text-[11px] text-blue-700 dark:text-blue-300 space-y-0.5">
              <p><strong>ATS Maximum</strong> — zero colour, Arial. The safest choice for Workday, Greenhouse, Taleo &amp; iCIMS.</p>
              <p><strong>Skills First</strong> — Core Skills before Experience. Best for career changers and technical roles.</p>
              <p><strong>Harvard Classic / Clean Professional</strong> — most trusted formats for any corporate or professional role.</p>
              <p><strong>Looking for Navy Sidebar, Compact Slate, or Executive Sidebar?</strong> Their upgraded V2 equivalents are <em>Navy Classic</em>, <em>Slate Sidebar</em>, and <em>Gold Executive</em>.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateGallery;
