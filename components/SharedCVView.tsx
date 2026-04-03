import React, { useState } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import CVPreview from './CVPreview';
import { downloadCVAsPDF } from '../services/pdfService';

interface SharedCVViewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  onLoadIntoEditor?: (cvData: CVData) => void;
  onDismiss: () => void;
}

const SharedCVView: React.FC<SharedCVViewProps> = ({
  cvData,
  personalInfo,
  template,
  sharedAt,
  onLoadIntoEditor,
  onDismiss,
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const fileName = `${personalInfo.name.replace(/\s+/g, '_')}_CV.pdf`;
      await downloadCVAsPDF(cvData, personalInfo, template, fileName);
    } finally {
      setDownloading(false);
    }
  };

  const formattedDate = (() => {
    try {
      return new Date(sharedAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return sharedAt;
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-neutral-900 overflow-y-auto">
      <header className="sticky top-0 z-10 bg-white dark:bg-neutral-800 border-b border-zinc-200 dark:border-neutral-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {personalInfo.name}'s CV
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Shared on {formattedDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {onLoadIntoEditor && (
              <button
                onClick={() => { onLoadIntoEditor(cvData); onDismiss(); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Load into Editor
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-zinc-700 dark:text-zinc-200 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloading ? 'Saving…' : 'Download PDF'}
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Close
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm p-4 sm:p-8">
          <CVPreview
            cvData={cvData}
            personalInfo={personalInfo}
            template={template}
            isEditing={false}
            onDataChange={() => {}}
            jobDescriptionForATS=""
          />
        </div>
      </main>

      <footer className="py-4 text-center">
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Built with Privacy-First CV Builder · Your data never leaves your device
        </p>
      </footer>
    </div>
  );
};

export default SharedCVView;
