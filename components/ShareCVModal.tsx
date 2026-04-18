import React, { useState, useCallback, useRef } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import LZString from 'lz-string';

interface ShareCVModalProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  coverLetterText?: string | null;
  onClose: () => void;
}

export interface SharedCVPayload {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
  coverLetterText?: string;
}

export function encodeSharePayload(payload: SharedCVPayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharedCVPayload | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    return JSON.parse(json) as SharedCVPayload;
  } catch {
    return null;
  }
}

export function buildShareUrl(payload: SharedCVPayload): string {
  const encoded = encodeSharePayload(payload);
  const base = window.location.origin + window.location.pathname;
  return `${base}#share=${encoded}`;
}

const ShareCVModal: React.FC<ShareCVModalProps> = ({ cvData, personalInfo, template, coverLetterText, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'link' | 'qr'>('link');
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasCoverLetter = !!(coverLetterText && coverLetterText.trim().length > 0);

  const generateLink = useCallback(() => {
    const payload: SharedCVPayload = {
      cvData,
      personalInfo,
      template,
      sharedAt: new Date().toISOString(),
      ...(includeCoverLetter && hasCoverLetter ? { coverLetterText: coverLetterText! } : {}),
    };
    const url = buildShareUrl(payload);
    setShareUrl(url);
    setLinkGenerated(true);
  }, [cvData, personalInfo, template, includeCoverLetter, hasCoverLetter, coverLetterText]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [shareUrl]);

  const urlBytes = new TextEncoder().encode(shareUrl).length;
  const urlKB    = (urlBytes / 1024).toFixed(1);
  const qrOk     = shareUrl.length < 4000;

  const qrSrc = qrOk
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(shareUrl)}`
    : null;

  const regenerate = () => {
    setLinkGenerated(false);
    setShareUrl('');
    setCopied(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg border border-zinc-200 dark:border-neutral-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Share Your CV</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Send a live preview link directly to recruiters — no download required.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors ml-4 flex-shrink-0 mt-0.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">

          {/* Privacy note */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-100 dark:border-neutral-700">
            <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Your data stays on your device.</span>{' '}
              The CV is encoded inside the link itself — no server involved. Recipients see{' '}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">only your CV</span>, not your workspace.
            </p>
          </div>

          {/* Cover letter toggle */}
          {hasCoverLetter && (
            <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors">
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Include cover letter</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Recruiter can toggle between CV and cover letter</p>
                </div>
              </div>
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={includeCoverLetter}
                  onChange={e => { setIncludeCoverLetter(e.target.checked); setLinkGenerated(false); setShareUrl(''); }}
                />
                <div className={`w-10 h-5 rounded-full transition-colors ${includeCoverLetter ? 'bg-[#1B2B4B]' : 'bg-zinc-300 dark:bg-neutral-600'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeCoverLetter ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </label>
          )}

          {!linkGenerated ? (
            <button
              onClick={generateLink}
              className="w-full py-3 px-4 bg-[#1B2B4B] hover:bg-[#152238] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Generate Share Link
            </button>
          ) : (
            <div className="space-y-4">

              {/* Tab switcher */}
              <div className="flex rounded-xl border border-zinc-200 dark:border-neutral-700 p-0.5 bg-zinc-50 dark:bg-neutral-800">
                {(['link', 'qr'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                      activeTab === tab
                        ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    {tab === 'link' ? '🔗 Copy Link' : '📱 QR Code'}
                  </button>
                ))}
              </div>

              {activeTab === 'link' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 text-xs bg-zinc-100 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-zinc-600 dark:text-zinc-400 font-mono truncate focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                      onClick={() => inputRef.current?.select()}
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 flex-shrink-0 min-w-[90px] justify-center ${
                        copied
                          ? 'bg-green-500 text-white shadow-sm'
                          : 'bg-[#1B2B4B] hover:bg-[#152238] text-white shadow-sm'
                      }`}
                    >
                      {copied ? (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>

                  {/* URL size indicator */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                    <span>Link size: <span className="font-semibold">{urlKB} KB</span></span>
                    <span className={`font-semibold ${qrOk ? 'text-green-500' : 'text-amber-500'}`}>
                      {qrOk ? '✓ QR-compatible' : '⚠ Too large for QR'}
                    </span>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`mailto:?subject=${encodeURIComponent(`CV — ${personalInfo.name}`)}&body=${encodeURIComponent(`Hi,\n\nPlease find my CV at the link below:\n${shareUrl}\n\nBest regards,\n${personalInfo.name}`)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Send via Email
                    </a>
                    <a
                      href={`https://www.linkedin.com/messaging/compose?body=${encodeURIComponent(`Check out my CV: ${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      Share on LinkedIn
                    </a>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]/80 text-xs font-semibold rounded-lg hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      Preview
                    </a>
                    <button
                      onClick={regenerate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors ml-auto"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'qr' && (
                <div className="flex flex-col items-center gap-4 py-2">
                  {qrOk && qrSrc ? (
                    <>
                      <div className="p-3 bg-white border border-zinc-200 dark:border-neutral-700 rounded-2xl shadow-sm">
                        <img
                          src={qrSrc}
                          alt={`QR code for ${personalInfo.name}'s CV`}
                          className="w-48 h-48 rounded-lg"
                          loading="lazy"
                        />
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
                        Recruiters can scan this with their phone to instantly view your CV.
                        Right-click the image to save it.
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-6 text-center px-4">
                      <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 flex items-center justify-center">
                        <svg className="w-7 h-7 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">CV is too large for a QR code</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Your CV contains {urlKB} KB of data — QR codes max out at ~4 KB.
                        Use the copy link instead.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer note */}
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center pt-1">
            The link contains your full CV · Only share with people you trust
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareCVModal;
