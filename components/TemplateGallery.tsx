import React, { useState } from 'react';
import { TemplateName, templateDisplayNames } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
import { Label } from './ui/Label';
import { CheckCircle, Eye } from './icons';

interface TemplateGalleryProps {
  selectedTemplate: TemplateName;
  onSelect: (template: TemplateName) => void;
}

// Template categories for better organization
const templateCategories = {
  'Professional': ['professional', 'corporate', 'elegant', 'executive'] as TemplateName[],
  'Modern': ['modern', 'modern-tech', 'twoColumnBlue'] as TemplateName[],
  'Creative': ['creative', 'infographic'] as TemplateName[],
  'Technical': ['software-engineer', 'technical'] as TemplateName[],
  'Minimal': ['minimalist', 'compact', 'timeline', 'classic'] as TemplateName[],
};

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ selectedTemplate, onSelect }) => {
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
                  <TemplateThumbnail templateName={template} />
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
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 text-sm">💡</span>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Pro Tip: Choose Based on Your Industry
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Tech/Engineering:</strong> Try "Software Engineer" or "Modern Tech" •
              <strong className="ml-2">Corporate:</strong> Use "Professional" or "Executive" •
              <strong className="ml-2">Creative:</strong> Go for "Creative" or "Infographic"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateGallery;
