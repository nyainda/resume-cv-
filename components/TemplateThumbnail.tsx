import React from 'react';
import { TemplateName } from '../types';

interface TemplateThumbnailProps {
  templateName: TemplateName;
}

const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ templateName }) => {
  const baseClasses = "w-full aspect-[1/1.414] bg-gradient-to-br from-white to-zinc-50 p-2 flex flex-col gap-1 shadow-inner"; // A4 aspect ratio

  const renderContent = () => {
    switch (templateName) {
      case 'modern':
        return (
          <div className="flex h-full gap-1.5">
            <div className="w-1/3 bg-gradient-to-b from-slate-700 to-slate-800 rounded-md p-1.5 flex flex-col gap-1">
              <div className="h-6 bg-white/20 rounded-sm"></div>
              <div className="h-1 bg-white/30 rounded-full"></div>
              <div className="h-1 bg-white/30 rounded-full w-3/4"></div>
              <div className="mt-auto space-y-1">
                <div className="h-1 bg-white/20 rounded-full"></div>
                <div className="h-1 bg-white/20 rounded-full w-4/5"></div>
              </div>
            </div>
            <div className="w-2/3 flex flex-col gap-1.5 p-1">
              <div className="h-3 bg-slate-800 rounded-sm"></div>
              <div className="h-1 bg-slate-300 rounded-sm w-3/4"></div>
              <div className="h-px bg-slate-200 my-1"></div>
              <div className="space-y-1">
                <div className="h-1 bg-slate-200 rounded-sm"></div>
                <div className="h-1 bg-slate-200 rounded-sm w-5/6"></div>
                <div className="h-1 bg-slate-200 rounded-sm w-4/5"></div>
              </div>
            </div>
          </div>
        );

      case 'twoColumnBlue':
      case 'modern-tech':
        const color = templateName === 'twoColumnBlue' ? 'blue' : 'gray';
        return (
          <div className="flex h-full gap-1.5">
            <div className={`w-1/3 bg-gradient-to-b from-${color}-800 to-${color}-900 rounded-md p-1.5 flex flex-col gap-1`}>
              <div className="h-6 bg-white/20 rounded-sm"></div>
              <div className="space-y-0.5 mt-2">
                <div className="h-0.5 bg-white/30 rounded-full"></div>
                <div className="h-0.5 bg-white/30 rounded-full w-3/4"></div>
              </div>
            </div>
            <div className="w-2/3 flex flex-col gap-1.5 p-1">
              <div className={`h-3 bg-${color}-800 rounded-sm`}></div>
              <div className="h-px bg-slate-200"></div>
              <div className="space-y-0.5">
                <div className="h-1 bg-slate-200 rounded-sm"></div>
                <div className="h-1 bg-slate-200 rounded-sm w-5/6"></div>
              </div>
            </div>
          </div>
        );

      case 'creative':
        return (
          <div className="flex h-full gap-1.5">
            <div className="w-1/3 bg-gradient-to-br from-teal-600 to-teal-700 rounded-md p-1.5 flex flex-col gap-1">
              <div className="h-6 bg-white/25 rounded-full"></div>
              <div className="space-y-1 mt-2">
                <div className="h-1 bg-white/30 rounded-full"></div>
                <div className="h-1 bg-white/30 rounded-full w-4/5"></div>
                <div className="h-1 bg-white/30 rounded-full w-3/5"></div>
              </div>
            </div>
            <div className="w-2/3 flex flex-col gap-1.5 p-1">
              <div className="h-3 bg-gradient-to-r from-teal-600 to-teal-500 rounded-sm"></div>
              <div className="h-px bg-teal-200"></div>
              <div className="space-y-1">
                <div className="h-1 bg-slate-200 rounded-sm"></div>
                <div className="h-1 bg-slate-200 rounded-sm w-5/6"></div>
              </div>
            </div>
          </div>
        );

      case 'professional':
      case 'corporate':
      case 'elegant':
      case 'executive':
        return (
          <div className="p-2 space-y-1.5">
            <div className="text-center space-y-1">
              <div className="h-4 bg-gradient-to-r from-slate-700 to-slate-800 w-2/3 mx-auto rounded-sm"></div>
              <div className="h-0.5 bg-slate-300 w-full rounded-sm"></div>
              <div className="h-0.5 bg-slate-200 w-3/4 mx-auto rounded-sm"></div>
            </div>
            <div className="h-px bg-slate-300 my-1.5"></div>
            <div className="space-y-1">
              <div className="h-1.5 bg-slate-700 w-1/3 rounded-sm"></div>
              <div className="space-y-0.5">
                <div className="h-0.5 bg-slate-200 rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm w-5/6"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm w-4/5"></div>
              </div>
            </div>
            <div className="space-y-1 mt-2">
              <div className="h-1.5 bg-slate-700 w-1/3 rounded-sm"></div>
              <div className="h-4 bg-slate-100 rounded-sm border border-slate-200"></div>
            </div>
          </div>
        );

      case 'software-engineer':
      case 'technical':
        return (
          <div className="p-2 space-y-1.5">
            <div className="text-center space-y-1">
              <div className="h-4 bg-gradient-to-r from-indigo-600 to-indigo-700 w-1/2 mx-auto rounded-sm"></div>
              <div className="h-0.5 bg-slate-200 w-full rounded-sm"></div>
            </div>
            <div className="h-px bg-indigo-200 my-1"></div>
            <div className="space-y-1">
              <div className="h-1 bg-indigo-600 w-1/4 rounded-sm"></div>
              <div className="flex flex-wrap gap-0.5">
                <div className="h-1.5 px-2 bg-slate-100 border border-slate-300 rounded-full text-[4px]"></div>
                <div className="h-1.5 px-2.5 bg-slate-100 border border-slate-300 rounded-full"></div>
                <div className="h-1.5 px-1.5 bg-slate-100 border border-slate-300 rounded-full"></div>
                <div className="h-1.5 px-3 bg-slate-100 border border-slate-300 rounded-full"></div>
                <div className="h-1.5 px-2 bg-slate-100 border border-slate-300 rounded-full"></div>
              </div>
            </div>
            <div className="space-y-1 mt-2">
              <div className="h-1 bg-indigo-600 w-1/4 rounded-sm"></div>
              <div className="space-y-0.5">
                <div className="h-0.5 bg-slate-200 rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm w-5/6"></div>
              </div>
            </div>
          </div>
        );

      case 'minimalist':
      case 'compact':
      case 'timeline':
        return (
          <div className="p-2 space-y-1.5">
            <div className="space-y-1">
              <div className="h-4 bg-slate-800 w-1/2 rounded-sm"></div>
              <div className="h-0.5 bg-slate-200 w-2/3 rounded-sm"></div>
            </div>
            <div className="flex gap-1 mt-2">
              <div className="w-1/4 space-y-0.5">
                <div className="h-1 bg-slate-600 rounded-sm"></div>
                <div className="h-0.5 bg-slate-300 rounded-sm"></div>
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="h-1 bg-slate-700 rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm w-5/6"></div>
              </div>
            </div>
            <div className="flex gap-1 mt-1">
              <div className="w-1/4 space-y-0.5">
                <div className="h-1 bg-slate-600 rounded-sm"></div>
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="h-1 bg-slate-700 rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 rounded-sm w-4/5"></div>
              </div>
            </div>
          </div>
        );

      case 'classic':
        return (
          <div className="p-2 space-y-1.5">
            <div className="text-center space-y-1">
              <div className="h-5 bg-slate-800 w-1/2 mx-auto rounded-sm"></div>
              <div className="h-px bg-slate-400 w-1/4 mx-auto"></div>
              <div className="h-0.5 bg-slate-200 w-2/3 mx-auto rounded-sm"></div>
            </div>
            <div className="space-y-1 mt-2">
              <div className="h-1 bg-slate-600 w-1/3 mx-auto rounded-sm"></div>
              <div className="space-y-0.5 text-center">
                <div className="h-0.5 bg-slate-200 w-4/5 mx-auto rounded-sm"></div>
                <div className="h-0.5 bg-slate-200 w-3/4 mx-auto rounded-sm"></div>
              </div>
            </div>
          </div>
        );

      case 'infographic':
        return (
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 h-full p-2 rounded-md space-y-1">
            <div className="h-4 bg-white/90 w-2/3 mx-auto rounded-sm"></div>
            <div className="space-y-1 mt-2">
              <div className="flex items-center gap-1">
                <div className="h-1 bg-white/70 w-1/4 rounded-sm"></div>
                <div className="flex-1 h-1 bg-white/30 rounded-full"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1 bg-white/70 w-1/4 rounded-sm"></div>
                <div className="flex-1 h-1 bg-white/30 rounded-full"></div>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1 bg-white/70 w-1/4 rounded-sm"></div>
                <div className="flex-1 h-1 bg-white/30 rounded-full"></div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="p-2 space-y-1">
            <div className="h-3 bg-slate-400 w-3/4 rounded-sm"></div>
            <div className="h-0.5 bg-slate-200 w-1/2"></div>
            <div className="space-y-0.5 mt-2">
              <div className="h-0.5 bg-slate-200 rounded-sm"></div>
              <div className="h-0.5 bg-slate-200 rounded-sm"></div>
              <div className="h-0.5 bg-slate-200 rounded-sm w-3/4"></div>
            </div>
          </div>
        );
    }
  };

  return <div className={baseClasses}>{renderContent()}</div>;
};

export default TemplateThumbnail;