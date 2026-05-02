import React, { useState } from 'react';
import { Button } from './ui/Button';
import { ClipboardCopy, Download, Edit, CheckCircle } from './icons';
import { downloadCoverLetterAsPDF } from '../services/pdfService';
import { PersonalInfo } from '../types';

interface CoverLetterPreviewProps {
  letterText: string;
  onTextChange: (newText: string) => void;
  fileName: string;
  personalInfo?: PersonalInfo;
}

type CLTemplate = 'modern' | 'professional' | 'executive' | 'academic' | 'creative';

const CoverLetterPreview: React.FC<CoverLetterPreviewProps> = ({ letterText, onTextChange, fileName, personalInfo }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useState<CLTemplate>('modern');

  const handleCopy = () => {
    navigator.clipboard.writeText(letterText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, (err) => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleDownload = () => {
    downloadCoverLetterAsPDF(letterText, fileName, template, personalInfo);
  };

  const templates: { id: CLTemplate; label: string }[] = [
    { id: 'modern', label: 'Modern' },
    { id: 'professional', label: 'Professional' },
    { id: 'executive', label: 'Executive' },
    { id: 'academic', label: 'Academic' },
    { id: 'creative', label: 'Creative' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-100 dark:border-neutral-800">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Generated Cover Letter</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Review and download your personalized letter.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsEditing(!isEditing)} variant="secondary" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            {isEditing ? 'Finish Editing' : 'Edit content'}
          </Button>
          <Button onClick={handleCopy} variant="secondary" size="sm">
            <ClipboardCopy className="h-4 w-4 mr-2" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={handleDownload} className="bg-[#1B2B4B] hover:bg-[#152238] text-white border-0 shadow-md shadow-[#1B2B4B]/20" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Template Selector */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Select Template</h3>
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`
                  w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200
                  ${template === t.id
                    ? 'border-[#1B2B4B] bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 text-[#1B2B4B] dark:text-[#C9A84C]/80 shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/40 dark:hover:border-[#1B2B4B]/40 text-zinc-600 dark:text-zinc-400 bg-white dark:bg-neutral-800'
                  }
                `}
              >
                <span className="text-sm font-bold">{t.label}</span>
                {template === t.id && <CheckCircle className="h-4 w-4" />}
              </button>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-zinc-100 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
            <p className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Pro Tip</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Use the <span className="font-bold">Executive</span> or <span className="font-bold">Academic</span> templates for high-stakes formal applications.
            </p>
          </div>
        </div>

        {/* Preview Area */}
        <div className="lg:col-span-3">
          <div
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
            onBlur={(e) => onTextChange(e.currentTarget.innerText)}
            className={`
              p-8 sm:p-12 border-2 border-zinc-200 dark:border-neutral-700 rounded-2xl bg-white dark:bg-neutral-900 shadow-inner min-h-[600px] whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 leading-[1.8] text-sm transition-all
              ${(template === 'professional' || template === 'executive' || template === 'academic') ? 'font-serif' : 'font-sans'}
              ${isEditing ? 'ring-4 ring-[#C9A84C]/10 border-[#C9A84C]/60 focus:outline-none' : ''}
              ${template === 'creative' ? 'border-l-[12px] border-l-[#1B2B4B]' : ''}
            `}
          >
            {/* Mock Header Preview */}
            {personalInfo && (
              <div className={`mb-12 pb-8 border-b border-zinc-100 dark:border-neutral-800 ${(template === 'executive' || template === 'professional') ? 'text-center' : ''}`}>
                <h1 className="text-xl font-bold mb-2">{personalInfo.name}</h1>
                <p className="text-xs text-zinc-500">{[personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            {letterText}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoverLetterPreview;