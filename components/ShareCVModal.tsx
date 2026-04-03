import React, { useState, useCallback } from 'react';
import { CVData, PersonalInfo, TemplateName } from '../types';
import LZString from 'lz-string';

interface ShareCVModalProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  onClose: () => void;
}

export interface SharedCVPayload {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  sharedAt: string;
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

const ShareCVModal: React.FC<ShareCVModalProps> = ({ cvData, personalInfo, template, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const generateLink = useCallback(() => {
    const payload: SharedCVPayload = {
      cvData,
      personalInfo,
      template,
      sharedAt: new Date().toISOString(),
    };
    const url = buildShareUrl(payload);
    setShareUrl(url);
    setLinkGenerated(true);
  }, [cvData, personalInfo, template]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [shareUrl]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-zinc-200 dark:border-neutral-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Share Your CV</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Generate a public link — anyone with it can view your CV in the browser.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl leading-none ml-4"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Privacy-first sharing</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 leading-relaxed">
                  Your CV data is encoded directly in the link — no server involved. Data never leaves your device unless you share the link.
                </p>
              </div>
            </div>
          </div>

          {!linkGenerated ? (
            <button
              onClick={generateLink}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <span>🔗</span>
              Generate Share Link
            </button>
          ) : (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Your shareable link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 text-xs bg-zinc-100 dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-600 rounded-lg px-3 py-2.5 text-zinc-700 dark:text-zinc-300 font-mono truncate focus:outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 flex-shrink-0 ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200'
                  }`}
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>

              <div className="flex gap-2 flex-wrap">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out my CV — built with AI! ' + shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-lg hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors"
                >
                  Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Share on LinkedIn
                </a>
                <button
                  onClick={() => { setLinkGenerated(false); setShareUrl(''); setCopied(false); }}
                  className="px-3 py-1.5 bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-100 dark:border-neutral-800">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
              The link contains your full CV. Only share with people you trust.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareCVModal;
