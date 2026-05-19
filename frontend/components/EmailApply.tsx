// components/EmailApply.tsx
// Simplified copy-paste email composer.
// Paste a JD → AI extracts recipient + composes email →
// Copy To / Subject / Body individually, or open in your email app.

import React, { useState, useCallback, useEffect } from 'react';
import { UserProfile } from '../types';
import { analyzeJobDescriptionForKeywords, generateApplicationEmail } from '../services/geminiService';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text: string): string[] {
  return [...new Set(text.match(EMAIL_RE) ?? [])].filter(
    e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif')
  );
}

interface EmailApplyProps {
  userProfile: UserProfile;
  apiKeySet: boolean;
  openSettings: () => void;
  currentCV?: unknown;
  brevoApiKey?: string | null;
  initialJd?: string;
  initialCoverLetter?: string;
}

interface Draft {
  to: string;
  subject: string;
  body: string;
}

type Step = 'paste' | 'draft';

// ─── Copy button ───────────────────────────────────────────────────────────────
const CopyBtn: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
        copied
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-600'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          {label}
        </>
      )}
    </button>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
export const EmailApply: React.FC<EmailApplyProps> = ({
  userProfile,
  apiKeySet,
  openSettings,
  initialJd = '',
}) => {
  const [step, setStep] = useState<Step>('paste');
  const [jd, setJd] = useState(initialJd);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>({ to: '', subject: '', body: '' });

  // Auto-compose when launched from CV Generator with a pre-filled JD
  useEffect(() => {
    if (initialJd?.trim() && apiKeySet) {
      handleAnalyse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyse = useCallback(async () => {
    const jdText = jd.trim();
    if (!jdText) { setError('Please paste a job description first.'); return; }
    if (!apiKeySet) { openSettings(); return; }

    setError('');
    setAnalyzing(true);
    try {
      const found    = extractEmails(jdText);
      // Run JD keyword analysis and AI email composition in parallel
      const [analysis, emailDraft] = await Promise.all([
        analyzeJobDescriptionForKeywords(jdText),
        generateApplicationEmail(
          userProfile,
          '',        // jobTitle filled in below after analysis
          '',        // companyName filled in below
          [],        // keywords filled in below
          jdText,
        ).catch(() => null), // non-fatal if email AI fails
      ]);
      const title   = analysis.jobTitle    ?? '';
      const company = analysis.companyName ?? '';
      const keywords = [...(analysis.keywords ?? []), ...(analysis.skills ?? [])];

      // If the parallel email call had empty title/company, re-run with real values
      // (only if the first call failed or returned a generic placeholder)
      let finalEmail = emailDraft;
      if (!finalEmail) {
        finalEmail = await generateApplicationEmail(userProfile, title, company, keywords, jdText);
      }

      setDraft({
        to:      found[0] ?? '',
        subject: finalEmail.subject,
        body:    finalEmail.body,
      });
      setStep('draft');
    } catch (e) {
      setError((e as Error).message ?? 'Analysis failed — please try again.');
    } finally {
      setAnalyzing(false);
    }
  }, [jd, apiKeySet, userProfile, openSettings]);

  const mailtoHref = () => {
    const sp = new URLSearchParams({ subject: draft.subject, body: draft.body });
    return `mailto:${encodeURIComponent(draft.to)}?${sp.toString().replace(/\+/g, '%20')}`;
  };

  // ─── STEP 1 — Paste JD ─────────────────────────────────────────────────────
  if (step === 'paste') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <span className="text-2xl">✉️</span> Email Application
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Paste a job description and we'll draft a ready-to-send email. Copy each field straight into your email client.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { n: '1', label: 'Paste JD',        desc: 'Drop the job posting here'    },
            { n: '2', label: 'AI Composes',      desc: 'Extracts recipient & drafts'  },
            { n: '3', label: 'Copy & Send',      desc: 'Paste into any email client'  },
          ].map(s => (
            <div key={s.n} className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 text-center">
              <div className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-black flex items-center justify-center mx-auto mb-2">{s.n}</div>
              <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{s.label}</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* JD Input */}
        <div>
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Job Description</label>
          <textarea
            rows={10}
            value={jd}
            onChange={e => { setJd(e.target.value); setError(''); }}
            placeholder="Paste the full job description here…"
            className="w-full text-sm rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 focus:border-transparent transition"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </p>
        )}

        {!apiKeySet && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start gap-3">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">API key required for AI composition</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                Add a Groq or Gemini key in{' '}
                <button onClick={openSettings} className="underline font-semibold">Settings</button>
                {' '}to enable AI drafting.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleAnalyse}
          disabled={!jd.trim() || analyzing}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {analyzing ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Composing your email…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Compose Email
            </>
          )}
        </button>
      </div>
    );
  }

  // ─── STEP 2 — Draft (copy-paste) ───────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <span>✉️</span> Your Email Draft
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Copy each field and paste it directly into your email client.</p>
        </div>
        <button
          onClick={() => setStep('paste')}
          className="flex-shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline underline-offset-2 transition-colors"
        >
          ← Start over
        </button>
      </div>

      {/* To */}
      <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-neutral-700/50 border-b border-zinc-200 dark:border-neutral-700">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">To</span>
          <CopyBtn text={draft.to} label="Copy" />
        </div>
        <div className="px-4 py-3">
          <input
            type="text"
            value={draft.to}
            onChange={e => setDraft(p => ({ ...p, to: e.target.value }))}
            placeholder="Recipient email (edit if needed)"
            className="w-full text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-none outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Subject */}
      <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-neutral-700/50 border-b border-zinc-200 dark:border-neutral-700">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Subject</span>
          <CopyBtn text={draft.subject} label="Copy" />
        </div>
        <div className="px-4 py-3">
          <input
            type="text"
            value={draft.subject}
            onChange={e => setDraft(p => ({ ...p, subject: e.target.value }))}
            className="w-full text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-none outline-none"
          />
        </div>
      </div>

      {/* Body */}
      <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-neutral-700/50 border-b border-zinc-200 dark:border-neutral-700">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Email Body</span>
          <CopyBtn text={draft.body} label="Copy" />
        </div>
        <div className="px-4 py-3">
          <textarea
            rows={12}
            value={draft.body}
            onChange={e => setDraft(p => ({ ...p, body: e.target.value }))}
            className="w-full text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-none outline-none resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <a
          href={mailtoHref()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Open in Email App
        </a>
        <CopyBtn text={`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`} label="Copy All" />
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
        💡 Edit any field above before copying. Attach your CV PDF manually in your email client.
      </p>
    </div>
  );
};

export default EmailApply;
