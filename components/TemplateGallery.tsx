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
        <Label className="text-lg font-semibold mb-2 block">Choose a Template</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {templates.map(template => (
            <div key={template} onClick={() => onSelect(template)} className="cursor-pointer group">
                <div className={`border-2 rounded-lg overflow-hidden transition-all duration-200 ${selectedTemplate === template ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-slate-300 dark:border-slate-600 group-hover:border-blue-400'}`}>
                    <TemplateThumbnail templateName={template} />
                </div>
                <p className={`text-center text-sm mt-2 font-medium ${selectedTemplate === template ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'}`}>
                    {templateDisplayNames[template]}
                </p>
            </div>
        ))}
        </div>
    </div>
  );
};

export default TemplateGallery;