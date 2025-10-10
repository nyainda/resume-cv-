import React from 'react';
import { TemplateName, templateDisplayNames } from '../types';
import TemplateThumbnail from './TemplateThumbnail';
// Fix: Import the Label component to resolve the 'Cannot find name 'Label'' error.
import { Label } from './ui/Label';

interface TemplateGalleryProps {
  selectedTemplate: TemplateName;
  onSelect: (template: TemplateName) => void;
}

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ selectedTemplate, onSelect }) => {
  const templates = Object.keys(templateDisplayNames) as TemplateName[];

  return (
    <div>
        <Label className="text-lg font-semibold mb-3 block">Choose a Template</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {templates.map(template => (
            <div key={template} onClick={() => onSelect(template)} className="cursor-pointer group">
                <div className={`border-2 rounded-lg overflow-hidden transition-all duration-200 ${selectedTemplate === template ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-zinc-300 dark:border-neutral-700 group-hover:border-indigo-400'}`}>
                    <TemplateThumbnail templateName={template} />
                </div>
                <p className={`text-center text-sm mt-2 font-medium ${selectedTemplate === template ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'}`}>
                    {templateDisplayNames[template]}
                </p>
            </div>
        ))}
        </div>
    </div>
  );
};

export default TemplateGallery;
