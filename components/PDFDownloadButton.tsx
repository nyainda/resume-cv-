import React, { useState, useRef, useEffect } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import { Download } from './icons';
import { downloadViaPlaywright, isPlaywrightServerAvailable } from '../services/playwrightPdfService';

// @react-pdf/renderer disabled — all templates use jsPDF + optional Playwright HD
const REACT_PDF_TEMPLATES: string[] = [];

const Spinner = () => (
  <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

interface PDFDownloadButtonProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  fileName: string;
  onFallback: () => void;
  disabled?: boolean;
}

const PDFDownloadButton: React.FC<PDFDownloadButtonProps> = ({
  fileName,
  onFallback,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [hdLoading, setHdLoading] = useState(false);
  const [hdAvailable, setHdAvailable] = useState<boolean | null>(null);
  const [hdError, setHdError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check Playwright server on mount (silent)
  useEffect(() => {
    isPlaywrightServerAvailable().then(setHdAvailable);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleHDDownload = async () => {
    setOpen(false);
    setHdLoading(true);
    setHdError(null);
    const result = await downloadViaPlaywright(fileName);
    setHdLoading(false);
    if (!result.success) {
      setHdError(result.error || 'HD PDF failed');
      setTimeout(() => setHdError(null), 5000);
    }
  };

  const handleStandardDownload = () => {
    setOpen(false);
    onFallback();
  };

  return (
    <div className="relative inline-flex flex-col items-end gap-1" ref={menuRef}>
      {/* Split button */}
      <div className="inline-flex rounded-lg shadow-sm overflow-visible">
        {/* Primary action: standard download */}
        <button
          onClick={handleStandardDownload}
          disabled={disabled || hdLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-l-lg"
        >
          {hdLoading ? (
            <><Spinner /><span>Generating HD…</span></>
          ) : (
            <><Download className="h-4 w-4" /><span>Download PDF</span></>
          )}
        </button>

        {/* Dropdown trigger */}
        <button
          onClick={() => setOpen(o => !o)}
          disabled={disabled || hdLoading}
          className="px-2 py-2 bg-indigo-700 hover:bg-indigo-800 text-white border-l border-indigo-500 rounded-r-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="PDF options"
          title="PDF options"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">PDF Options</p>
          </div>

          {/* Standard PDF */}
          <button
            onClick={handleStandardDownload}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors flex items-start gap-3 group"
          >
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Standard PDF</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Fast · ATS-safe text layer · Works everywhere</p>
            </div>
          </button>

          {/* HD PDF (Playwright) */}
          <button
            onClick={handleHDDownload}
            disabled={hdAvailable === false}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100 dark:border-neutral-700"
          >
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-4 w-4 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">HD PDF</p>
                <span className="text-[9px] font-black uppercase bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded-full tracking-wide">Chromium</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {hdAvailable === false
                  ? 'PDF server offline — start the "PDF Server" workflow'
                  : 'Pixel-perfect · Exact font rendering · Best quality'}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Error toast */}
      {hdError && (
        <div className="absolute top-full right-0 mt-12 w-72 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl px-4 py-3 shadow-lg z-50">
          <strong className="block font-bold mb-0.5">HD PDF failed</strong>
          {hdError}
        </div>
      )}
    </div>
  );
};

export default PDFDownloadButton;
