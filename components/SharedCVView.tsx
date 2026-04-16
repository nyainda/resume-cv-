import React, { useState } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import CVPreview from './CVPreview';
import { downloadCVAsPDF } from '../services/pdfService';
import type { FontName } from '../types';

interface SharedCVViewProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  onLoadIntoEditor?: (cvData: CVData) => void;
  onDismiss: () => void;
}

const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const SharedCVView: React.FC<SharedCVViewProps> = ({
  cvData,
  personalInfo,
  template,
  sharedAt,
  onLoadIntoEditor,
  onDismiss,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [contactCopied, setContactCopied] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    try {
      const fileName = `${personalInfo.name.replace(/\s+/g, '_')}_CV.pdf`;
      downloadCVAsPDF({ cvData, personalInfo, template, font: 'inter' as FontName, fileName });
    } finally {
      setDownloading(false);
    }
  };

  const handleContact = () => {
    if (personalInfo.email) {
      const subject = encodeURIComponent(`Re: Your CV — ${personalInfo.name}`);
      const body = encodeURIComponent(`Hi ${personalInfo.name.split(' ')[0]},\n\nI came across your CV and would love to connect.\n\nBest regards,`);
      window.open(`mailto:${personalInfo.email}?subject=${subject}&body=${body}`, '_blank');
    }
  };

  const copyEmail = async () => {
    if (!personalInfo.email) return;
    await navigator.clipboard.writeText(personalInfo.email);
    setContactCopied(true);
    setTimeout(() => setContactCopied(false), 2000);
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

  const hasContact = !!(personalInfo.email || personalInfo.phone || personalInfo.linkedin);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-neutral-950 overflow-y-auto">

      {/* ── Recruiter-facing header ── */}
      <header className="sticky top-0 z-10 bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">

            {/* Left: Logo + candidate name */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-xs">CV</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-none">Shared CV</p>
                <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                  {personalInfo.name}
                </h1>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">

              {/* Contact CTA — primary action for recruiters */}
              {hasContact && (
                <div className="flex items-center gap-1">
                  {personalInfo.email && (
                    <button
                      onClick={handleContact}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Contact Candidate
                    </button>
                  )}
                  {personalInfo.email && (
                    <button
                      onClick={copyEmail}
                      title="Copy email"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                    >
                      {contactCopied ? (
                        <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      )}
                    </button>
                  )}
                  {personalInfo.linkedin && (
                    <a
                      href={personalInfo.linkedin.startsWith('http') ? personalInfo.linkedin : `https://${personalInfo.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      title="LinkedIn profile"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                </div>
              )}

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-200 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <><SpinnerIcon /> Saving…</>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PDF
                  </>
                )}
              </button>

              <button
                onClick={onDismiss}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Candidate quick info bar */}
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            {personalInfo.location && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {personalInfo.location}
              </span>
            )}
            {personalInfo.email && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {personalInfo.email}
              </span>
            )}
            {personalInfo.phone && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {personalInfo.phone}
              </span>
            )}
            <span className="text-xs text-zinc-400 dark:text-zinc-600 ml-auto hidden sm:block">
              Shared {formattedDate}
            </span>
          </div>
        </div>
      </header>

      {/* ── CV preview ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
          <CVPreview
            cvData={cvData}
            personalInfo={personalInfo}
            template={template}
            isEditing={false}
            onDataChange={() => {}}
            jobDescriptionForATS=""
          />
        </div>

        {/* Editor CTA (less prominent — for the candidate themselves) */}
        {onLoadIntoEditor && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => { onLoadIntoEditor(cvData); onDismiss(); }}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
            >
              Is this your CV? Load it into the editor →
            </button>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="py-6 text-center border-t border-zinc-100 dark:border-neutral-900">
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Created with{' '}
          <a href={window.location.origin} className="font-semibold hover:text-indigo-500 transition-colors">
            CraftCV
          </a>
          {' '}· Data is encoded in the link only — no servers involved
        </p>
      </footer>
    </div>
  );
};

export default SharedCVView;
