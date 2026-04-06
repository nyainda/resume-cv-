import React, { useState, useRef, useEffect } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import { Download } from './icons';
import { downloadViaPlaywright, isPlaywrightServerAvailable } from '../services/playwrightPdfService';
import {
  isCloudflareConfigured,
  isCloudflareWorkerOnline,
  generateAndDownloadViaCF,
} from '../services/cloudflareWorkerService';
import { getCVHtml } from '../services/getCVHtml';

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
  const [hdError, setHdError] = useState<string | null>(null);
  const [hdStatus, setHdStatus] = useState<string | null>(null);

  const [cfConfigured] = useState(() => isCloudflareConfigured());
  const [cfOnline, setCfOnline] = useState<boolean | null>(null);
  const [playwrightAvailable, setPlaywrightAvailable] = useState<boolean | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cfConfigured) {
      isCloudflareWorkerOnline().then(setCfOnline);
    } else {
      setCfOnline(false);
    }
    isPlaywrightServerAvailable().then(setPlaywrightAvailable);
  }, [cfConfigured]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCloudflareDownload = async () => {
    setOpen(false);
    setHdLoading(true);
    setHdError(null);
    setHdStatus('Capturing CV preview…');

    const html = getCVHtml();
    if (!html) {
      setHdError('Could not capture CV preview. Please ensure the CV is visible.');
      setHdLoading(false);
      setHdStatus(null);
      return;
    }

    const result = await generateAndDownloadViaCF({
      html,
      filename: fileName,
      format: 'A4',
      onStatus: (msg) => setHdStatus(msg),
    });

    setHdLoading(false);
    setHdStatus(null);
    if (!result.ok) {
      setHdError(result.error || 'Cloudflare PDF failed');
      setTimeout(() => setHdError(null), 6000);
    }
  };

  const handlePlaywrightDownload = async () => {
    setOpen(false);
    setHdLoading(true);
    setHdError(null);
    setHdStatus('Generating HD PDF via local server…');
    const result = await downloadViaPlaywright(fileName);
    setHdLoading(false);
    setHdStatus(null);
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
      <div className="inline-flex rounded-lg shadow-sm overflow-visible">
        <button
          onClick={handleStandardDownload}
          disabled={disabled || hdLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-l-lg"
        >
          {hdLoading ? (
            <><Spinner /><span>{hdStatus ?? 'Generating…'}</span></>
          ) : (
            <><Download className="h-4 w-4" /><span>Download PDF</span></>
          )}
        </button>

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

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">PDF Options</p>
          </div>

          {/* Standard PDF */}
          <button
            onClick={handleStandardDownload}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors flex items-start gap-3"
          >
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Standard PDF</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Fast · ATS-safe text layer · Works everywhere</p>
            </div>
          </button>

          {/* Cloudflare HD PDF */}
          <button
            onClick={handleCloudflareDownload}
            disabled={cfOnline === false}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-slate-100 dark:border-neutral-700"
          >
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cloudflare HD PDF</p>
                <span className="text-[9px] font-black uppercase bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full tracking-wide">CF</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                {!cfConfigured
                  ? 'Not configured — set VITE_PDF_WORKER_URL'
                  : cfOnline === false
                  ? 'Cloudflare Worker offline'
                  : 'Pixel-perfect · Edge rendering · Works on Vercel'}
              </p>
            </div>
          </button>

          {/* Local HD PDF (Playwright) — only shown if running */}
          {playwrightAvailable && (
            <button
              onClick={handlePlaywrightDownload}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors flex items-start gap-3 border-t border-slate-100 dark:border-neutral-700"
            >
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center flex-shrink-0">
                <svg className="h-4 w-4 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Local HD PDF</p>
                  <span className="text-[9px] font-black uppercase bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-1.5 py-0.5 rounded-full tracking-wide">Dev</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Local Chromium · Dev only · Not available on Vercel</p>
              </div>
            </button>
          )}
        </div>
      )}

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
