import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playwrightAvailable, setPlaywrightAvailable] = useState<boolean | null>(null);
  const [cfAvailable, setCfAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    isPlaywrightServerAvailable().then(setPlaywrightAvailable);
    if (isCloudflareConfigured()) {
      isCloudflareWorkerOnline().then(setCfAvailable);
    } else {
      setCfAvailable(false);
    }
  }, []);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);

    // Strategy: try the best available engine silently, fall back if it fails.
    // 1) Local Playwright server (best quality, matches preview).
    // 2) Cloudflare Worker (if configured and reachable).
    // 3) Standard jsPDF fallback (always works).

    if (playwrightAvailable) {
      const result = await downloadViaPlaywright(fileName);
      if (result.success) { setLoading(false); return; }
    }

    if (cfAvailable) {
      const html = await getCVHtml();
      if (html) {
        const result = await generateAndDownloadViaCF({
          html,
          filename: fileName,
          format: 'A4',
        });
        if (result.ok) { setLoading(false); return; }
      }
    }

    // Final fallback — always succeeds because it's purely client-side.
    onFallback();
    setLoading(false);
  };

  return (
    <div className="relative inline-flex flex-col items-end gap-1">
      <button
        onClick={handleDownload}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B2B4B] hover:bg-[#152238] text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm"
      >
        {loading ? (
          <><Spinner /><span>Generating…</span></>
        ) : (
          <><Download className="h-4 w-4" /><span>Download PDF</span></>
        )}
      </button>

      {error && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl px-4 py-3 shadow-lg z-50">
          <strong className="block font-bold mb-0.5">Download failed</strong>
          {error}
        </div>
      )}
    </div>
  );
};

export default PDFDownloadButton;
