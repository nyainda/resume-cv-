import React, { useState } from 'react';
import { TemplateName, templateDisplayNames, CVData, PersonalInfo } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
import { Label } from './ui/Label';
import { CheckCircle, Eye, FileText } from './icons';

interface TemplateGalleryProps {
  selectedTemplate: TemplateName;
  onSelect: (template: TemplateName) => void;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
}

// Template categories for better organization
const templateCategories = {
  'Professional': ['professional', 'corporate', 'elegant', 'executive', 'standard-pro', 'london-finance', 'medical-standard'] as TemplateName[],
  'Modern': ['modern', 'modern-tech', 'twoColumnBlue', 'silicon-valley', 'tokyo-night'] as TemplateName[],
  'Creative': ['creative', 'infographic', 'sydney-creative', 'berlin-design'] as TemplateName[],
  'Academic': ['harvard-gold', 'scholarship-pro', 'classic'] as TemplateName[],
  'Minimal': ['minimalist', 'compact', 'timeline', 'paris-vibe'] as TemplateName[],
  'Technical': ['software-engineer', 'technical'] as TemplateName[],
};

// Badges displayed on template cards
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
};

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ selectedTemplate, onSelect, cvData, personalInfo }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [hoveredTemplate, setHoveredTemplate] = useState<TemplateName | null>(null);

  const allTemplates = Object.keys(templateDisplayNames) as TemplateName[];

  const getFilteredTemplates = () => {
    if (activeCategory === 'All') return allTemplates;
    return templateCategories[activeCategory as keyof typeof templateCategories] || [];
  };

  const filteredTemplates = getFilteredTemplates();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Label className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1 block">
            Choose Your Template
          </Label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select a professional template that matches your style
          </p>
        </div>

        {/* Template count badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-full">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {filteredTemplates.length} Templates
          </span>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {['All', ...Object.keys(templateCategories)].map((category) => {
          const isActive = activeCategory === category;
          const count = category === 'All'
            ? allTemplates.length
            : templateCategories[category as keyof typeof templateCategories]?.length || 0;

          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105'
                  : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'
                }
              `}
            >
              {category}
              <span className={`ml-2 text-xs ${isActive ? 'text-indigo-200' : 'text-zinc-500 dark:text-zinc-500'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
        {filteredTemplates.map((template) => {
          const isSelected = selectedTemplate === template;
          const isHovered = hoveredTemplate === template;

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
                  relative rounded-xl overflow-hidden transition-all duration-300 transform
                  ${isSelected
                    ? 'ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/30 scale-105'
                    : 'ring-2 ring-zinc-200 dark:ring-neutral-700 hover:ring-indigo-400 hover:shadow-xl hover:scale-102'
                  }
                `}
              >
                {/* Selected Badge */}
                {isSelected && (
                  <div className="absolute top-2 right-2 z-10 bg-indigo-600 text-white rounded-full p-1.5 shadow-lg">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                )}

                {/* Hover Preview Button */}
                {isHovered && !isSelected && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="bg-white dark:bg-neutral-800 rounded-lg px-4 py-2 flex items-center gap-2 shadow-xl">
                      <Eye className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        Preview
                      </span>
                    </div>
                  </div>
                )}

                {/* Thumbnail */}
                <div className="bg-white">
                  <TemplateThumbnail templateName={template} cvData={cvData} personalInfo={personalInfo} />
                </div>
              </div>

              {/* Template Name */}
              <div className="mt-3 text-center">
                <p
                  className={`
                    text-sm font-semibold transition-colors duration-200
                    ${isSelected
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                    }
                  `}
                >
                  {templateDisplayNames[template]}
                </p>

                {/* Badge */}
                {templateBadges[template] && (
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${templateBadges[template]!.color}`}>
                    <span>{templateBadges[template]!.emoji}</span>
                    {templateBadges[template]!.label}
                  </span>
                )}

                {/* Selection indicator */}
                {isSelected && (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1 font-medium">
                    ✓ Selected
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-100 dark:bg-neutral-800 rounded-full mb-4">
            <FileText className="h-8 w-8 text-zinc-400" />
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-lg font-medium">
            No templates in this category
          </p>
          <p className="text-zinc-500 dark:text-zinc-500 text-sm mt-1">
            Try selecting a different category
          </p>
        </div>
      )}

      {/* Quick Tips */}
      <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 text-sm">💡</span>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Pro Tip: Match the Template to the Role
            </h4>
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p>🎯 <strong>Standard Pro (ATS King)</strong> — safest pick for most corporate & tech jobs. Maximum ATS compatibility.</p>
              <p>⭐ <strong>Professional</strong> — polished and recruiter-loved. Great for finance, consulting, management.</p>
              <p>🏛️ <strong>Executive</strong> — Harvard-style serif. Senior roles, law, academia, C-suite applications.</p>
              <p>💻 <strong>Tech / Modern Tech</strong> — ideal for software engineers, data scientists, DevOps roles.</p>
              <p>✨ <strong>Creative / Infographic</strong> — design, marketing, and creative roles only (not ATS-safe).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateGallery;
