// components/EmailApply.tsx
// Full pipeline:
//   Paste JD (or pre-filled from CV Generator) →
//   AI extracts application email + composes email body →
//   Optionally generate cover letter →
//   Send via Brevo API (direct) OR open mailto: (fallback)
//
// Can be launched from CV Generator with pre-filled JD + CV.

import React, { useState, useCallback, useEffect } from 'react';
import { UserProfile, CVData } from '../types';
import { analyzeJobDescriptionForKeywords, generateCoverLetter } from '../services/geminiService';
import { sendEmailViaBrevo, buildHtmlEmail } from '../services/brevoService';

interface EmailApplyProps {
  userProfile: UserProfile;
  apiKeySet: boolean;
  openSettings: () => void;
  currentCV?: CVData | null;
  brevoApiKey?: string | null;
  /** Pre-filled from CV Generator "Apply via Email" button */
  initialJd?: string;
  initialCoverLetter?: string;
}

type Step = 'paste' | 'compose' | 'send';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text: string): string[] {
  return [...new Set(text.match(EMAIL_RE) ?? [])].filter(
    e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif')
  );
}

interface Draft {
  to: string;
  subject: string;
  body: string;
  coverLetterText?: string;
  attachCoverLetter: boolean;
}

export const EmailApply: React.FC<EmailApplyProps> = ({
  userProfile,
  apiKeySet,
  openSettings,
  currentCV,
  brevoApiKey,
  initialJd = '',
  initialCoverLetter,
}) => {
  const [step, setStep] = useState<Step>('paste');
  const [jd, setJd] = useState(initialJd);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft>({
    to: '',
    subject: '',
    body: '',
    coverLetterText: initialCoverLetter,
    attachCoverLetter: !!initialCoverLetter,
  });
  const [detectedEmails, setDetectedEmails] = useState<string[]>([]);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const hasBrevo = !!brevoApiKey?.trim();

  // If launched from CV Generator with a pre-filled JD, auto-analyse on mount
  useEffect(() => {
    if (initialJd && initialJd.trim() && apiKeySet) {
      handleAnalyse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── helpers ────────────────────────────────────────────────────── */
  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  /* ── Analyse JD ─────────────────────────────────────────────────── */
  const handleAnalyse = useCallback(async () => {
    const jdText = jd.trim();
    if (!jdText) { setError('Please paste a job description first.'); return; }
    if (!apiKeySet) { openSettings(); return; }

    setError('');
    setAnalyzing(true);
    try {
      const found = extractEmails(jdText);
      setDetectedEmails(found);

      const analysis = await analyzeJobDescriptionForKeywords(jdText);
      const title = analysis.jobTitle ?? '';
      const comp = analysis.companyName ?? '';

      const toEmail = found[0] ?? '';
      const subjectLine = `Application for ${title || 'the position'}${comp ? ` at ${comp}` : ''}`;

      const name = userProfile.personalInfo.name || 'Applicant';
      const emailAddr = userProfile.personalInfo.email || '';
      const phone = userProfile.personalInfo.phone || '';
      const skills3 = userProfile.skills.slice(0, 3).join(', ');

      const body = [
        `Dear Hiring Manager,`,
        ``,
        `I am writing to express my strong interest in the ${title || 'open position'}${comp ? ` at ${comp}` : ''}. With my background in ${skills3 || 'relevant fields'}, I am confident I would bring immediate value to your team.`,
        ``,
        userProfile.summary || 'I have a proven track record of delivering results in fast-paced environments.',
        ``,
        `Please find my CV${draft.attachCoverLetter ? ' and cover letter' : ''} attached for your consideration. I would welcome the opportunity to discuss how my experience aligns with your requirements.`,
        ``,
        `Thank you for your time. I look forward to hearing from you.`,
        ``,
        `Best regards,`,
        name,
        emailAddr,
        phone,
      ].filter((l, i) => i !== 11 || name).join('\n');

      setDraft(prev => ({
        ...prev,
        to: toEmail,
        subject: subjectLine,
        body,
      }));
      setStep('compose');
    } catch (e) {
      setError((e as Error).message ?? 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }, [jd, apiKeySet, userProfile, draft.attachCoverLetter, openSettings]);

  /* ── Generate cover letter ─────────────────────────────────────── */
  const handleGenerateCL = async () => {
    if (!apiKeySet) { openSettings(); return; }
    setGeneratingCL(true);
    setError('');
    try {
      const cl = await generateCoverLetter(userProfile, jd);
      setDraft(prev => ({ ...prev, coverLetterText: cl, attachCoverLetter: true }));
    } catch (e) {
      setError((e as Error).message ?? 'Cover letter generation failed');
    } finally {
      setGeneratingCL(false);
    }
  };

  /* ── Send via Brevo ─────────────────────────────────────────────── */
  const handleSendViaBrevo = async () => {
    if (!hasBrevo) { openSettings(); return; }
    if (!draft.to) { setError('Please enter the recipient email address.'); return; }
    if (!userProfile.personalInfo.email) {
      setError('Add your email address in your Profile — it is used as the Brevo sender and must be verified.');
      return;
    }

    setSending(true);
    setSendResult(null);
    setError('');

    try {
      const htmlContent = buildHtmlEmail({
        senderName: userProfile.personalInfo.name,
        recipientEmail: draft.to,
        subject: draft.subject,
        textBody: draft.body,
        coverLetterText: draft.attachCoverLetter ? draft.coverLetterText : undefined,
      });

      let textContent = draft.body;
      if (draft.attachCoverLetter && draft.coverLetterText) {
        textContent = `=== COVER LETTER ===\n\n${draft.coverLetterText}\n\n=== EMAIL MESSAGE ===\n\n${draft.body}`;
      }

      const result = await sendEmailViaBrevo({
        apiKey: brevoApiKey!,
        sender: { name: userProfile.personalInfo.name || 'Applicant', email: userProfile.personalInfo.email },
        to: [{ email: draft.to }],
        subject: draft.subject,
        textContent,
        htmlContent,
        replyTo: { name: userProfile.personalInfo.name || 'Applicant', email: userProfile.personalInfo.email },
      });

      if (result.success) {
        setSendResult({ ok: true, msg: `Email sent! Message ID: ${result.messageId}` });
        setStep('send');
      } else {
        setError(result.error ?? 'Send failed. Check your Brevo API key and sender verification.');
      }
    } catch (e) {
      setError((e as Error).message ?? 'Unexpected error');
    } finally {
      setSending(false);
    }
  };

  /* ── Mailto fallback ────────────────────────────────────────────── */
  const handleOpenMailto = () => {
    let body = draft.body;
    if (draft.attachCoverLetter && draft.coverLetterText) {
      body = `--- COVER LETTER ---\n\n${draft.coverLetterText}\n\n--- EMAIL ---\n\n${draft.body}`;
    }
    window.open(
      `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`,
      '_blank'
    );
    setSendResult({ ok: true, msg: 'Email client opened with pre-filled message.' });
    setStep('send');
  };

  const handleCopyAll = async () => {
    let body = draft.body;
    if (draft.attachCoverLetter && draft.coverLetterText) {
      body = `--- COVER LETTER ---\n\n${draft.coverLetterText}\n\n--- EMAIL ---\n\n${draft.body}`;
    }
    await copy(`TO: ${draft.to}\nSUBJECT: ${draft.subject}\n\n${body}`, 'all');
  };

  const resetWizard = () => {
    setStep('paste');
    setJd('');
    setDraft({ to: '', subject: '', body: '', attachCoverLetter: false });
    setSendResult(null);
    setError('');
    setDetectedEmails([]);
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-2 flex-wrap">
            ✉️ Email Application
            {hasBrevo && (
              <span className="text-[10px] font-extrabold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-2 py-1 rounded-full border border-sky-200 dark:border-sky-700 uppercase tracking-wider">
                Brevo Active
              </span>
            )}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Paste a JD → AI drafts the email &amp; cover letter →{' '}
            {hasBrevo ? 'sends via Brevo directly.' : 'opens in your email client.'}
          </p>
        </div>
      </div>

      {/* Banners */}
      {!apiKeySet && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">AI key required</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Add your Gemini / OpenAI key to analyse the JD.{' '}
              <button onClick={openSettings} className="underline font-bold">Open Settings →</button>
            </p>
          </div>
        </div>
      )}

      {!hasBrevo && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-900/10 p-4 flex gap-3">
          <span className="text-xl flex-shrink-0">💡</span>
          <div>
            <p className="text-sm font-bold text-sky-800 dark:text-sky-300">Add Brevo for one-click sending</p>
            <p className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
              Without Brevo, we open your email client (mailto:). Add your{' '}
              <button onClick={openSettings} className="underline font-bold">Brevo API key in Settings →</button>
            </p>
          </div>
        </div>
      )}

      {/* Step progress bar */}
      <div className="flex items-center gap-1">
        {(['paste', 'compose', 'send'] as Step[]).map((s, i) => {
          const done = (s === 'paste' && step !== 'paste') || (s === 'compose' && step === 'send');
          const active = step === s;
          return (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white shadow' :
                  done ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' :
                    'bg-zinc-100 dark:bg-neutral-800 text-zinc-400'
                }`}>
                {done ? '✓' : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s === 'paste' ? 'Paste JD' : s === 'compose' ? 'Compose' : 'Send'}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px bg-zinc-200 dark:bg-neutral-700" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ═══ STEP 1: Paste JD ═══ */}
      {step === 'paste' && (
        <div className="space-y-4">
          {initialJd && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ Job description pre-filled from CV Generator. Click below to analyse.
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-2">
              Job Description
            </label>
            <textarea
              value={jd}
              onChange={e => setJd(e.target.value)}
              rows={12}
              placeholder={`Paste the full job description here…\n\nThe AI will:\n  📧 Detect the application email\n  🏢 Extract job title & company\n  ✍️ Compose a professional email\n  📝 Generate a tailored cover letter\n  ${hasBrevo ? '📨 Send directly via Brevo' : '🔗 Open pre-filled in your email client'}`}
              className="w-full rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition placeholder:text-zinc-300 dark:placeholder:text-zinc-600 leading-relaxed"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}

          <button
            onClick={handleAnalyse}
            disabled={analyzing || !jd.trim() || !apiKeySet}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {analyzing
              ? <><span className="animate-spin text-lg">⟳</span> Analysing…</>
              : <><span>✨</span> Analyse &amp; Auto-Compose</>}
          </button>
        </div>
      )}

      {/* ═══ STEP 2: Compose ═══ */}
      {step === 'compose' && (
        <div className="space-y-4">

          {/* Email detection result */}
          {detectedEmails.length > 0 ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
                ✓ {detectedEmails.length} application email{detectedEmails.length > 1 ? 's' : ''} found in JD:
              </p>
              <div className="flex flex-wrap gap-2">
                {detectedEmails.map(e => (
                  <button
                    key={e}
                    onClick={() => setDraft(p => ({ ...p, to: e }))}
                    className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${draft.to === e
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white dark:bg-neutral-800 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:border-emerald-500'
                      }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                ⚠️ No email found in this JD — enter it manually below or apply via the company's careers portal.
              </p>
            </div>
          )}

          {/* To field — always visible, prominent */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-1.5">
              Send To <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={draft.to}
                onChange={e => setDraft(p => ({ ...p, to: e.target.value }))}
                className="flex-1 rounded-xl border-2 border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition font-mono placeholder:font-sans"
                placeholder="careers@company.com"
              />
              <button
                onClick={() => copy(draft.to, 'to')}
                className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
              >
                {copied === 'to' ? '✓' : '📋'}
              </button>
            </div>
            {!draft.to && (
              <p className="text-[11px] text-zinc-400 mt-1">
                Tip: Look for "apply@…", "careers@…", or "hr@…" in the job posting or company website.
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-1.5">Subject</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.subject}
                onChange={e => setDraft(p => ({ ...p, subject: e.target.value }))}
                className="flex-1 rounded-xl border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button onClick={() => copy(draft.subject, 'subject')}
                className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
                {copied === 'subject' ? '✓' : '📋'}
              </button>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Email Body</label>
              <button onClick={() => copy(draft.body, 'body')} className="text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                {copied === 'body' ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
            <textarea
              value={draft.body}
              onChange={e => setDraft(p => ({ ...p, body: e.target.value }))}
              rows={10}
              className="w-full rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition"
            />
          </div>

          {/* Cover Letter */}
          <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-violet-800 dark:text-violet-300">📝 Cover Letter</p>
                <p className="text-[11px] text-violet-600 dark:text-violet-500 mt-0.5">
                  Included {hasBrevo ? 'in email HTML body' : 'in message text'}
                </p>
              </div>
              <div
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${draft.attachCoverLetter ? 'bg-violet-600' : 'bg-zinc-200 dark:bg-neutral-600'}`}
                onClick={() => setDraft(p => ({ ...p, attachCoverLetter: !p.attachCoverLetter }))}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${draft.attachCoverLetter ? 'translate-x-5' : ''}`} />
              </div>
            </div>

            {!draft.coverLetterText ? (
              <button
                onClick={handleGenerateCL}
                disabled={generatingCL}
                className="w-full py-2.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {generatingCL ? <><span className="animate-spin">⟳</span> Generating…</> : '✨ Generate Cover Letter with AI'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Cover letter ready</span>
                  <div className="flex gap-3">
                    <button onClick={() => copy(draft.coverLetterText!, 'cl')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 transition-colors">
                      {copied === 'cl' ? '✓ Copied' : '📋 Copy'}
                    </button>
                    <button onClick={() => setDraft(p => ({ ...p, coverLetterText: undefined }))} className="text-[10px] font-bold text-violet-500 hover:underline">
                      Regenerate
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft.coverLetterText}
                  onChange={e => setDraft(p => ({ ...p, coverLetterText: e.target.value }))}
                  rows={7}
                  className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none transition"
                />
              </div>
            )}
          </div>

          {/* Brevo sender info */}
          {hasBrevo && (
            <div className="rounded-lg border border-sky-200 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-900/10 px-4 py-3 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2 flex-wrap">
              <span className="font-bold">📨 Sender:</span>
              <span className="font-mono">{userProfile.personalInfo.email || '—'}</span>
              {!userProfile.personalInfo.email && (
                <span className="text-amber-600 dark:text-amber-400 font-bold">⚠ Add email to your profile</span>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => setStep('paste')}
              className="py-3 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
              ← Back to JD
            </button>

            {hasBrevo ? (
              <button
                onClick={handleSendViaBrevo}
                disabled={sending || !draft.to || !draft.subject}
                className="py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {sending ? <><span className="animate-spin text-lg">⟳</span> Sending…</> : <>📨 Send via Brevo</>}
              </button>
            ) : (
              <button
                onClick={handleOpenMailto}
                disabled={!draft.to || !draft.subject}
                className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                ✉️ Open in Email Client
              </button>
            )}
          </div>

          <button onClick={handleCopyAll}
            className="w-full py-2.5 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
            {copied === 'all' ? '✓ Copied to Clipboard!' : '📋 Copy Everything to Clipboard'}
          </button>
        </div>
      )}

      {/* ═══ STEP 3: Sent ═══ */}
      {step === 'send' && (
        <div className="text-center space-y-6 py-8 px-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto shadow-lg ${sendResult?.ok && hasBrevo ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'}`}>
            {sendResult?.ok && hasBrevo ? '🎉' : '✉️'}
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {sendResult?.ok && hasBrevo ? 'Email Sent!' : 'Email Client Opened!'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
              {sendResult?.ok && hasBrevo
                ? `Your application was sent directly via Brevo to ${draft.to}.`
                : 'Your email client opened with the pre-filled message. Attach your CV PDF (from CV History) and send!'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 text-left space-y-2 max-w-sm mx-auto">
            {[
              { l: 'To:', v: draft.to },
              { l: 'Subject:', v: draft.subject },
              { l: 'Sent via:', v: sendResult?.ok && hasBrevo ? 'Brevo API ✓' : 'Email Client' },
              draft.attachCoverLetter && draft.coverLetterText ? { l: 'Cover Letter:', v: 'Included ✓' } : null,
            ].filter(Boolean).map((r: any) => (
              <div key={r.l} className="flex justify-between text-xs gap-3">
                <span className="text-zinc-400 font-medium flex-shrink-0">{r.l}</span>
                <span className="text-zinc-700 dark:text-zinc-200 truncate text-right">{r.v}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={handleCopyAll}
              className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
              {copied === 'all' ? '✓ Copied!' : '📋 Copy All'}
            </button>
            {!(sendResult?.ok && hasBrevo) && (
              <button onClick={handleOpenMailto}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors shadow-sm">
                ✉️ Re-open Email Client
              </button>
            )}
            <button onClick={resetWizard}
              className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
              ↩ New Application
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailApply;
