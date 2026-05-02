// components/EmailApply.tsx
// Full pipeline:
//   Paste JD → AI extracts email + composes body →
//   Attach files (PDF / JPG / PNG / DOCX) →
//   Send via Brevo API  OR  open mailto: fallback
//
// Launched from CV Generator with pre-filled JD + cover letter.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UserProfile, CVData } from '../types';
import { analyzeJobDescriptionForKeywords, generateCoverLetter } from '../services/geminiService';
import { sendEmailViaBrevo, buildHtmlEmail, BrevoAttachment } from '../services/brevoService';

/* ── Production-safe Brevo key reader ─────────────────────────────────────
   The key lives in apiSettings (useStorage / Drive-synced).  In a freshly
   loaded production tab it may not be in the prop yet — so we also try the
   raw localStorage key as a fallback (same pattern as geminiService).          */
function readBrevoKey(propKey: string | null | undefined): string | null {
  if (propKey?.trim()) return propKey.trim();
  try {
    const raw = localStorage.getItem('cv_builder:apiSettings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.brevoApiKey?.trim()) return parsed.brevoApiKey.trim();
    }
  } catch { /* ignore */ }
  return null;
}

/* ── Brevo error → human-readable message ─────────────────────────────────
   Brevo returns various error codes/messages. Map the most common ones.       */
function friendlyBrevoError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('sender') && (s.includes('not verified') || s.includes('not allowed') || s.includes('unauthorized'))) {
    return 'Sender email not verified. Go to your Brevo dashboard → Senders & IPs → verify the email address you entered in your profile, then retry.';
  }
  if (s.includes('invalid api') || s.includes('api-key') || s.includes('unauthorized') || s.includes('401')) {
    return 'Invalid Brevo API key. Double-check the key in Settings — it should start with "xkeysib-".';
  }
  if (s.includes('quota') || s.includes('limit') || s.includes('429')) {
    return 'Brevo daily sending limit reached (300 emails/day on free plan). Try again tomorrow.';
  }
  if (s.includes('invalid email') || s.includes('recipient')) {
    return 'Recipient email address is invalid. Check the "Send To" field.';
  }
  return raw;
}

interface EmailApplyProps {
  userProfile: UserProfile;
  apiKeySet: boolean;
  openSettings: () => void;
  currentCV?: CVData | null;
  brevoApiKey?: string | null;
  initialJd?: string;
  initialCoverLetter?: string;
}

type Step = 'paste' | 'compose' | 'send';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const MAX_ATTACHMENT_MB = 10;
const MAX_TOTAL_MB = 25;

function extractEmails(text: string): string[] {
  return [...new Set(text.match(EMAIL_RE) ?? [])].filter(
    e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif')
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LocalAttachment extends BrevoAttachment {
  sizeBytes: number;
  mimeType: string;
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
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachError, setAttachError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedBrevoKey = readBrevoKey(brevoApiKey);
  const hasBrevo = !!resolvedBrevoKey;

  const totalAttachBytes = attachments.reduce((s, a) => s + a.sizeBytes, 0);
  const totalAttachMB = totalAttachBytes / (1024 * 1024);

  // Auto-analyse when launched from CV Generator
  useEffect(() => {
    if (initialJd && initialJd.trim() && apiKeySet) {
      handleAnalyse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Copy helper ─────────────────────────────────────────────────── */
  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  /* ── File attachment picker ──────────────────────────────────────── */
  const handleFilesPicked = (files: FileList | null) => {
    if (!files) return;
    setAttachError('');
    const promises: Promise<LocalAttachment | null>[] = Array.from(files).map(file =>
      new Promise(resolve => {
        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
          setAttachError(`"${file.name}" exceeds the ${MAX_ATTACHMENT_MB} MB per-file limit.`);
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // dataUrl = "data:<mime>;base64,<content>"
          const base64 = dataUrl.split(',')[1];
          resolve({
            name: file.name,
            content: base64,
            sizeBytes: file.size,
            mimeType: file.type,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      })
    );

    Promise.all(promises).then(results => {
      const valid = results.filter(Boolean) as LocalAttachment[];
      setAttachments(prev => {
        const merged = [...prev, ...valid];
        const newTotal = merged.reduce((s, a) => s + a.sizeBytes, 0) / (1024 * 1024);
        if (newTotal > MAX_TOTAL_MB) {
          setAttachError(`Total attachments exceed ${MAX_TOTAL_MB} MB. Remove some files.`);
          return prev;
        }
        return merged;
      });
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
    setAttachError('');
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
      ].filter((_, i) => i < 11 || [name, emailAddr, phone][i - 11]).join('\n');

      setDraft(prev => ({ ...prev, to: toEmail, subject: subjectLine, body }));
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
  const handleSendViaBrevo = async (testSelf = false) => {
    if (!resolvedBrevoKey) { openSettings(); return; }
    const recipient = testSelf ? userProfile.personalInfo.email : draft.to;
    if (!recipient) {
      setError(testSelf
        ? 'Add your email address in your Profile to send a test.'
        : 'Please enter the recipient email address.');
      return;
    }
    if (!userProfile.personalInfo.email) {
      setError('Add your email address in your Profile — it is used as the Brevo sender and must be verified in Brevo.');
      return;
    }

    setSending(true);
    setSendResult(null);
    setError('');

    try {
      const htmlContent = buildHtmlEmail({
        senderName: userProfile.personalInfo.name,
        recipientEmail: recipient,
        subject: testSelf ? `[TEST] ${draft.subject}` : draft.subject,
        textBody: draft.body,
        coverLetterText: draft.attachCoverLetter ? draft.coverLetterText : undefined,
      });

      let textContent = draft.body;
      if (draft.attachCoverLetter && draft.coverLetterText) {
        textContent = `=== COVER LETTER ===\n\n${draft.coverLetterText}\n\n=== EMAIL MESSAGE ===\n\n${draft.body}`;
      }

      const result = await sendEmailViaBrevo({
        apiKey: resolvedBrevoKey,
        sender: { name: userProfile.personalInfo.name || 'Applicant', email: userProfile.personalInfo.email },
        to: [{ email: recipient }],
        subject: testSelf ? `[TEST] ${draft.subject}` : draft.subject,
        textContent,
        htmlContent,
        replyTo: { name: userProfile.personalInfo.name || 'Applicant', email: userProfile.personalInfo.email },
        attachments: attachments.length > 0 ? attachments.map(a => ({ name: a.name, content: a.content })) : undefined,
      });

      if (result.success) {
        const msg = testSelf
          ? `Test email sent to ${recipient}! Check your inbox.`
          : `Email sent! Message ID: ${result.messageId}`;
        setSendResult({ ok: true, msg });
        if (!testSelf) setStep('send');
      } else {
        setError(friendlyBrevoError(result.error ?? 'Send failed.'));
      }
    } catch (e) {
      setError(friendlyBrevoError((e as Error).message ?? 'Unexpected error'));
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
    setAttachments([]);
    setAttachError('');
  };

  /* ── File type icon ─────────────────────────────────────────────── */
  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext ?? '')) return '🖼️';
    if (['doc', 'docx'].includes(ext ?? '')) return '📝';
    return '📎';
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
            Paste a JD → AI drafts the email &amp; cover letter → attach files →{' '}
            {hasBrevo ? 'send via Brevo directly.' : 'open in your email client.'}
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
              Add your Gemini key to analyse the JD.{' '}
              <button onClick={openSettings} className="underline font-bold">Open Settings →</button>
            </p>
          </div>
        </div>
      )}

      {!hasBrevo && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-900/10 p-4 flex gap-3">
          <span className="text-xl flex-shrink-0">💡</span>
          <div>
            <p className="text-sm font-bold text-sky-800 dark:text-sky-300">Add Brevo for one-click sending with attachments</p>
            <p className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
              Without Brevo we open your email client (mailto:). Add your{' '}
              <button onClick={openSettings} className="underline font-bold">Brevo API key in Settings →</button>
            </p>
          </div>
        </div>
      )}

      {/* Brevo sender verification reminder */}
      {hasBrevo && userProfile.personalInfo.email && (
        <div className="rounded-xl border border-[#C9A84C]/20 dark:border-[#1B2B4B]/30 bg-[#F8F7F4]/60 dark:bg-[#1B2B4B]/10 px-4 py-3 flex items-start gap-3">
          <span className="text-base flex-shrink-0 mt-0.5">ℹ️</span>
          <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C]/80">
            <span className="font-bold">Sender:</span>{' '}
            <span className="font-mono">{userProfile.personalInfo.email}</span>{' '}
            — this email must be verified in your{' '}
            <a href="https://app.brevo.com/senders" target="_blank" rel="noreferrer" className="underline font-bold">Brevo Senders dashboard</a>{' '}
            before sending works.
          </p>
        </div>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-1">
        {(['paste', 'compose', 'send'] as Step[]).map((s, i) => {
          const done = (s === 'paste' && step !== 'paste') || (s === 'compose' && step === 'send');
          const active = step === s;
          return (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${active ? 'bg-[#1B2B4B] text-white shadow' :
                  done ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]' :
                    'bg-zinc-100 dark:bg-neutral-800 text-zinc-400'
                }`}>
                {done ? '✓' : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s === 'paste' ? 'Paste JD' : s === 'compose' ? 'Compose' : 'Sent'}</span>
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
              placeholder={`Paste the full job description here…\n\nThe AI will:\n  📧 Detect the application email\n  🏢 Extract job title & company\n  ✍️ Compose a professional email\n  📝 Generate a tailored cover letter\n  ${hasBrevo ? '📨 Send directly via Brevo with attachments' : '🔗 Open pre-filled in your email client'}`}
              className="w-full rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none transition placeholder:text-zinc-300 dark:placeholder:text-zinc-600 leading-relaxed"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
          <button
            onClick={handleAnalyse}
            disabled={analyzing || !jd.trim() || !apiKeySet}
            className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
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

          {/* To */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block mb-1.5">
              Send To <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={draft.to}
                onChange={e => setDraft(p => ({ ...p, to: e.target.value }))}
                className="flex-1 rounded-xl border-2 border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]/60 transition font-mono placeholder:font-sans"
                placeholder="careers@company.com"
              />
              <button onClick={() => copy(draft.to, 'to')}
                className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
                {copied === 'to' ? '✓' : '📋'}
              </button>
            </div>
            {!draft.to && (
              <p className="text-[11px] text-zinc-400 mt-1">Look for "apply@…", "careers@…", or "hr@…" in the job posting.</p>
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
                className="flex-1 rounded-xl border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] transition"
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
              className="w-full rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] resize-none transition"
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
              <button onClick={handleGenerateCL} disabled={generatingCL}
                className="w-full py-2.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
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

          {/* ── File Attachments ── */}
          <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">📎 Attachments</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  PDF, JPG, PNG, DOCX · max {MAX_ATTACHMENT_MB} MB each · {MAX_TOTAL_MB} MB total
                  {attachments.length > 0 && ` · ${fmtSize(totalAttachBytes)} used`}
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-200 dark:bg-neutral-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-neutral-600 transition-colors"
              >
                + Add File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="hidden"
                onChange={e => { handleFilesPicked(e.target.files); e.target.value = ''; }}
              />
            </div>

            {attachError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{attachError}</p>
            )}

            {attachments.length === 0 ? (
              <div
                className="border-2 border-dashed border-zinc-300 dark:border-neutral-600 rounded-xl p-5 text-center cursor-pointer hover:border-[#C9A84C]/60 dark:hover:border-[#1B2B4B] transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFilesPicked(e.dataTransfer.files); }}
              >
                <p className="text-2xl mb-1">📂</p>
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Drop files here or click Add File</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Your CV PDF, cover letter, portfolio screenshots…</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-xl px-3 py-2.5">
                    <span className="text-base flex-shrink-0">{fileIcon(a.name)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 truncate">{a.name}</p>
                      <p className="text-[10px] text-zinc-400">{fmtSize(a.sizeBytes)}</p>
                    </div>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-xs font-bold"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 border border-dashed border-zinc-300 dark:border-neutral-600 rounded-xl hover:border-zinc-400 transition-colors"
                >
                  + Add another file
                </button>
              </div>
            )}

            {!hasBrevo && attachments.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ File attachments only work with Brevo. Without it, attach files manually in your email client.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
              {error.toLowerCase().includes('sender') && (
                <a
                  href="https://app.brevo.com/senders"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-red-700 dark:text-red-300 underline mt-1 inline-block"
                >
                  → Open Brevo Senders Dashboard
                </a>
              )}
            </div>
          )}

          {/* Success (test send) */}
          {sendResult?.ok && step === 'compose' && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">✓ {sendResult.msg}</p>
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
                onClick={() => handleSendViaBrevo(false)}
                disabled={sending || !draft.to || !draft.subject}
                className="py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {sending
                  ? <><span className="animate-spin text-lg">⟳</span> Sending…</>
                  : <>📨 Send via Brevo{attachments.length > 0 ? ` (+${attachments.length} file${attachments.length > 1 ? 's' : ''})` : ''}</>}
              </button>
            ) : (
              <button
                onClick={handleOpenMailto}
                disabled={!draft.to || !draft.subject}
                className="py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-sm">
                ✉️ Open in Email Client
              </button>
            )}
          </div>

          {/* Test send to self */}
          {hasBrevo && (
            <button
              onClick={() => handleSendViaBrevo(true)}
              disabled={sending || !userProfile.personalInfo.email || !draft.subject}
              className="w-full py-2.5 rounded-xl border border-zinc-300 dark:border-neutral-600 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"
            >
              🧪 Send Test Email to Myself ({userProfile.personalInfo.email || 'set email in profile'})
            </button>
          )}

          <button onClick={handleCopyAll}
            className="w-full py-2.5 rounded-xl border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors">
            {copied === 'all' ? '✓ Copied to Clipboard!' : '📋 Copy Everything to Clipboard'}
          </button>
        </div>
      )}

      {/* ═══ STEP 3: Sent ═══ */}
      {step === 'send' && (
        <div className="text-center space-y-6 py-8 px-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto shadow-lg ${sendResult?.ok && hasBrevo ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20'}`}>
            {sendResult?.ok && hasBrevo ? '🎉' : '✉️'}
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {sendResult?.ok && hasBrevo ? 'Email Sent!' : 'Email Client Opened!'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
              {sendResult?.ok && hasBrevo
                ? `Your application was sent directly via Brevo to ${draft.to}.${attachments.length > 0 ? ` ${attachments.length} file(s) attached.` : ''}`
                : 'Your email client opened with the pre-filled message. Attach your CV PDF and send!'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-4 text-left space-y-2 max-w-sm mx-auto">
            {[
              { l: 'To:', v: draft.to },
              { l: 'Subject:', v: draft.subject },
              { l: 'Sent via:', v: sendResult?.ok && hasBrevo ? 'Brevo API ✓' : 'Email Client' },
              draft.attachCoverLetter && draft.coverLetterText ? { l: 'Cover Letter:', v: 'Included ✓' } : null,
              attachments.length > 0 ? { l: 'Attachments:', v: `${attachments.length} file(s) ✓` } : null,
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
                className="px-4 py-2 rounded-xl bg-[#1B2B4B] hover:bg-[#152238] text-white font-bold text-sm transition-colors shadow-sm">
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
