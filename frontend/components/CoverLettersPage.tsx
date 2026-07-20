// CoverLettersPage.tsx
// Standalone view showing the history of saved cover letters for the active profile.
// Letters are stored in the slot's savedCoverLetters array which syncs to D1,
// so they appear on every device automatically.

import React, { useState } from 'react';
import { SavedCoverLetter } from '../types';
import CoverLetterPreview from './CoverLetterPreview';

interface CoverLettersPageProps {
  savedCoverLetters: SavedCoverLetter[];
  onSaveCoverLetter: (letter: SavedCoverLetter) => void;
  onGoToGenerator: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function wordCountBadgeClass(wc?: number): { label: string; cls: string } {
  if (!wc) return { label: '– words', cls: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-500' };
  if (wc >= 200 && wc <= 260) return { label: `${wc} words`, cls: 'text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400 border border-green-200 dark:border-green-800/40' };
  if (wc >= 150 && wc <= 300) return { label: `${wc} words`, cls: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40' };
  return { label: `${wc} words`, cls: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/40' };
}

function qualityBadge(issueCount?: number): { label: string; cls: string } {
  if (issueCount === undefined || issueCount === null) {
    return { label: 'Not scored', cls: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-500' };
  }
  if (issueCount === 0) return { label: 'Excellent', cls: 'text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400 border border-green-200 dark:border-green-800/40' };
  if (issueCount <= 2) return { label: 'Good', cls: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40' };
  return { label: 'Needs Work', cls: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/40' };
}

// ── Main component ─────────────────────────────────────────────────────────────

const CoverLettersPage: React.FC<CoverLettersPageProps> = ({
  savedCoverLetters,
  onSaveCoverLetter,
  onGoToGenerator,
}) => {
  const [openId, setOpenId] = useState<string | null>(null);

  // Sort newest first
  const sorted = [...savedCoverLetters].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const openLetter = sorted.find(l => l.id === openId) ?? null;

  return (
    <div className="space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Cover Letters</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            All letters sync across devices — saved once, available everywhere.
          </p>
        </div>
        <button
          onClick={onGoToGenerator}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 flex-shrink-0"
          style={{ background: '#1B2B4B' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Generate New
        </button>
      </div>

      {/* ── Open letter (inline viewer) ───────────────────────────────────── */}
      {openLetter && (
        <div className="bg-white dark:bg-neutral-800/50 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6">
          {/* Back button */}
          <button
            onClick={() => setOpenId(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 mb-6 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to history
          </button>

          <CoverLetterPreview
            letterText={openLetter.text}
            onTextChange={(newText) => {
              // Update in-memory only (re-save to persist)
              // We don't mutate savedCoverLetters here; user can re-save if needed
              void newText;
            }}
            fileName={`${openLetter.name.replace(/\s+/g, '_')}_Cover_Letter.pdf`}
            onSave={({ wordCount, issueCount }) => {
              onSaveCoverLetter({
                ...openLetter,
                wordCount,
                issueCount,
                createdAt: new Date().toISOString(), // update timestamp on re-save
              });
            }}
          />
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {sorted.length === 0 && !openLetter && (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-neutral-700"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: '#1B2B4B12' }}
          >
            <svg className="w-8 h-8" fill="none" stroke="#1B2B4B" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-1">No cover letters saved yet</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 text-center max-w-xs">
            Generate a cover letter in the CV Generator, then click <strong>Save</strong> to add it here.
          </p>
          <button
            onClick={onGoToGenerator}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#1B2B4B' }}
          >
            Go to CV Generator →
          </button>
        </div>
      )}

      {/* ── Letter history grid ────────────────────────────────────────────── */}
      {sorted.length > 0 && !openLetter && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((letter) => {
            const wc = wordCountBadgeClass(letter.wordCount);
            const q  = qualityBadge(letter.issueCount);

            return (
              <div
                key={letter.id}
                className="group relative flex flex-col bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden hover:border-zinc-400 dark:hover:border-neutral-500 transition-colors"
              >
                {/* ── Card top accent ─── */}
                <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #1B2B4B, #C9A84C)' }} />

                <div className="flex flex-col gap-3 p-5 flex-1">

                  {/* Title row */}
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-zinc-50 truncate">
                      {letter.company || letter.name}
                    </p>
                    {letter.jobTitle && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{letter.jobTitle}</p>
                    )}
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                      {formatDate(letter.createdAt)}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${wc.cls}`}>
                      {wc.label}
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${q.cls}`}>
                      {q.label}
                    </span>
                  </div>

                  {/* Text preview */}
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3 flex-1">
                    {letter.text.slice(0, 200).trim()}…
                  </p>
                </div>

                {/* ── Card footer ───── */}
                <div className="flex items-center gap-2 px-5 pb-5">
                  <button
                    onClick={() => setOpenId(letter.id)}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: '#1B2B4B' }}
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default CoverLettersPage;
