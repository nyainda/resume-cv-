import React from 'react';
import { TemplateName } from '../types';

interface TemplateThumbnailProps {
  templateName: TemplateName;
}

const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ templateName }) => {
  const baseClasses = "w-full aspect-[1/1.414] bg-white p-1.5 flex flex-col gap-1"; // A4 aspect ratio

  const renderContent = () => {
    switch (templateName) {
      case 'modern':
      case 'twoColumnBlue':
      case 'creative':
      case 'modern-tech':
        const sidebarColor = {
            modern: 'bg-slate-700',
            twoColumnBlue: 'bg-blue-800',
            creative: 'bg-teal-700',
            'modern-tech': 'bg-gray-800'
        }[templateName];
        return (
          <div className="flex h-full gap-1">
            <div className={`w-1/3 rounded-l-sm ${sidebarColor}`}></div>
            <div className="w-2/3 flex flex-col gap-1">
              <div className="h-2 bg-slate-200 rounded-sm"></div>
              <div className="h-1 bg-slate-200 rounded-sm w-3/4"></div>
              <div className="h-4 mt-2 bg-slate-300 rounded-sm"></div>
              <div className="h-1 bg-slate-200 rounded-sm"></div>
              <div className="h-1 bg-slate-200 rounded-sm w-5/6"></div>
            </div>
          </div>
        );
      case 'professional':
      case 'corporate':
      case 'elegant':
      case 'classic':
        return (
          <>
            <div className="h-3 bg-slate-300 w-3/4 mx-auto rounded-sm"></div>
            <div className="h-1 bg-slate-200 w-full mx-auto mt-1 rounded-sm"></div>
            <div className="h-px bg-slate-300 w-full my-1"></div>
            <div className="h-1.5 bg-slate-300 w-1/4 rounded-sm mb-1"></div>
            <div className="h-4 bg-slate-200 rounded-sm"></div>
            <div className="h-1.5 bg-slate-300 w-1/4 rounded-sm mt-2 mb-1"></div>
            <div className="h-8 bg-slate-200 rounded-sm"></div>
          </>
        );
      case 'software-engineer':
      case 'technical':
        return (
          <>
            <div className="h-3 bg-slate-300 w-1/2 mx-auto rounded-sm"></div>
            <div className="h-1 bg-slate-200 w-full mx-auto mt-1 rounded-sm"></div>
            <div className="h-px bg-slate-300 w-full my-1"></div>
            <div className="h-1 bg-slate-300 w-1/5 rounded-sm mb-1"></div>
            <div className="flex flex-wrap gap-0.5">
                <div className="h-1 w-4 bg-slate-200 rounded-full"></div>
                <div className="h-1 w-5 bg-slate-200 rounded-full"></div>
                <div className="h-1 w-3 bg-slate-200 rounded-full"></div>
                <div className="h-1 w-6 bg-slate-200 rounded-full"></div>
            </div>
            <div className="h-1 bg-slate-300 w-1/5 rounded-sm mt-2 mb-1"></div>
            <div className="h-8 bg-slate-200 rounded-sm"></div>
          </>
        );
      default:
        return (
          <>
            <div className="h-3 bg-slate-400 w-3/4 rounded-sm"></div>
            <div className="h-1 bg-slate-200 w-1/2 mt-1"></div>
            <div className="h-1 bg-slate-200 w-full mt-2"></div>
            <div className="h-1 bg-slate-200 w-full"></div>
            <div className="h-1 bg-slate-200 w-3/4"></div>
            <div className="h-1 bg-slate-200 w-full mt-2"></div>
            <div className="h-1 bg-slate-200 w-5/6"></div>
          </>
        );
    }
  };

  return <div className={baseClasses}>{renderContent()}</div>;
};

export default TemplateThumbnail;