import React, { useState, useRef } from 'react';
import type { VaultJob } from '../../types';
import { CheckCircle, AlertCircle, ArrowRight } from '../icons';
import { useAuth } from '../../auth/AuthContext';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';

/** Ensure URLs always open externally and never navigate within the app */
function safeHref(url?: string | null): string {
  if (!url) return '#';
  if (url.startsWith('mailto:') || url.startsWith('https://') || url.startsWith('http://')) return url;
  return `https://${url}`;
}

/* ── Match donut ─────────────────────────────────────────────────────── */
function DonutChart({ score }: { score: number }) {
  const size  = 110;
  const r     = 40;
  const circ  = 2 * Math.PI * r;
  const pct   = Math.min(100, Math.max(0, score));
  const dash  = circ * (pct / 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? GOLD : pct >= 45 ? '#f59e0b' : '#94a3b8';
  const label = pct >= 80 ? 'Strong match' : pct >= 65 ? 'Good match' : pct >= 45 ? 'Partial' : 'Low match';
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor"
          strokeWidth="9" className="text-zinc-100 dark:text-zinc-800" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x={size/2} y={size/2 - 5}  textAnchor="middle" fontSize="19" fontWeight="800" fill={color}>{pct}%</text>
        <text x={size/2} y={size/2 + 14} textAnchor="middle" fontSize="9"  style={{ fill: '#94a3b8' }}>match</text>
      </svg>
      <span className="text-xs font-bold tracking-wide" style={{ color }}>{label}</span>
    </div>
  );
}

function SectionHead({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <p className="text-xs font-extrabold text-zinc-800 dark:text-zinc-100 tracking-wide uppercase">{label}</p>
      {count !== undefined && (
        <span className="ml-auto text-[10px] font-bold text-zinc-400 bg-zinc-100 dark:bg-neutral-700 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function deriveKeywords(job: VaultJob): { found: string[]; notFound: string[] } {
  const TECH = ['Python','JavaScript','TypeScript','React','Node.js','AWS','GCP','Azure','Docker',
    'Kubernetes','Terraform','CI/CD','PostgreSQL','MongoDB','Redis','GraphQL','REST','SQL',
    'Java','Go','Rust','Figma','Excel','Tableau','Salesforce','Jira','Agile','Scrum'];
  const jdLower = (job.rawJd ?? '').toLowerCase();
  const found    = TECH.filter(w => jdLower.includes(w.toLowerCase()));
  const notFound = TECH.filter(w => !jdLower.includes(w.toLowerCase())).slice(0, 3);
  return { found: found.slice(0, 6), notFound };
}

/* ── Deadline countdown ──────────────────────────────────────────────── */
function DeadlineBlock({ deadline }: { deadline: string }) {
  const ms   = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  const formatted = new Date(deadline).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const urgencyColor = days <= 0 ? 'text-zinc-400' : days <= 3 ? 'text-rose-500' : days <= 7 ? 'text-amber-500' : 'text-zinc-500 dark:text-zinc-400';
  const urgencyBg    = days <= 0 ? '' : days <= 3 ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40' : days <= 7 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40' : 'bg-zinc-50 dark:bg-neutral-800 border-zinc-100 dark:border-neutral-700';

  return (
    <div className={`rounded-2xl px-5 py-4 border ${urgencyBg || 'bg-zinc-50 dark:bg-neutral-800 border-zinc-100 dark:border-neutral-700'}`}>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Deadline</p>
      <p className="text-base font-extrabold text-zinc-900 dark:text-zinc-50">{formatted}</p>
      {days > 0 && days <= 3 && (
        <p className={`text-sm font-bold mt-1.5 flex items-center gap-1.5 ${urgencyColor}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          {days === 1 ? 'Due tomorrow!' : `Only ${days} days left!`}
        </p>
      )}
      {days === 0 && (
        <p className={`text-sm font-bold mt-1.5 animate-pulse ${urgencyColor}`}>⚠ Due today!</p>
      )}
      {days < 0 && <p className="text-xs text-zinc-400 mt-1">Deadline passed</p>}
      {days > 3 && days <= 14 && (
        <p className={`text-xs font-medium mt-1 ${urgencyColor}`}>{days} days to go</p>
      )}
      {days > 14 && (
        <p className="text-xs text-zinc-400 mt-1">{days} days to go</p>
      )}
    </div>
  );
}

interface Props {
  job:       VaultJob;
  onBuildCV: (job: VaultJob) => void;
  onPatch:   (id: string, patch: Partial<VaultJob>) => void;
  onClose:   () => void;
}

export const VaultQuickActions: React.FC<Props> = ({ job, onBuildCV, onPatch, onClose }) => {
  const { user } = useAuth();
  const score          = job.matchScore ?? 0;
  const isClassifying  = job.matchScore === undefined;
  const isAnalysing    = !job.analysed;
  const { found: keywordsFound } = deriveKeywords(job);

  const [notes, setNotes]               = useState(job.notes ?? '');
  const [notesChanged, setNotesChanged] = useState(false);
  const [notesSaved, setNotesSaved]     = useState(false);
  const [reminderState, setReminderState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [reminderMsg,   setReminderMsg]   = useState<string>('');
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qualityText = score >= 80
    ? 'Your profile directly covers the core requirements.'
    : score >= 65
    ? 'Your background covers most of what they\'re looking for.'
    : score >= 45
    ? 'Worth reviewing the gaps before applying.'
    : 'This may be a stretch role for your current profile.';

  const addedDate = new Date(job.createdAt).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  const showCompany = job.company && job.company !== 'Unknown Company';

  /* ── Remote / location icons ─────────────────────────────── */
  const remoteIcon = job.remote === 'Remote' ? '🌍'
    : job.remote === 'Hybrid' ? '🔀'
    : job.remote === 'On-site' ? '🏢'
    : null;

  /* ── Notes auto-save ─────────────────────────────────────── */
  function handleNotesChange(val: string) {
    setNotes(val);
    setNotesChanged(true);
    setNotesSaved(false);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      onPatch(job.id, { notes: val });
      setNotesSaved(true);
      setNotesChanged(false);
    }, 800);
  }

  /* ── Email reminder ──────────────────────────────────────── */
  async function handleReminder() {
    if (reminderState !== 'idle') return;
    setReminderState('sending');
    setReminderMsg('');
    try {
      const base = /^https?:\/\//.test(ENGINE_URL)
        ? new URL('/api/vault/remind', ENGINE_URL)
        : new URL(ENGINE_URL + '/api/vault/remind', window.location.origin);

      const res = await fetch(base.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:    job.id,
          job_title: job.title,
          company:   job.company,
          deadline:  job.deadline ?? null,
        }),
      });
      if (res.ok) {
        setReminderState('sent');
      } else {
        // Decode the error code so we can surface a useful message
        let errorCode = '';
        try { const j = await res.json() as { error?: string }; errorCode = j.error ?? ''; } catch { /* ignore */ }

        let msg = 'Something went wrong — try again.';
        if (res.status === 404) {
          msg = 'Email reminders need a server update. Check back soon.';
        } else if (res.status === 401) {
          msg = 'Sign in to use email reminders.';
        } else if (errorCode === 'email_not_configured') {
          msg = 'Email is not set up on this server.';
        } else if (errorCode === 'no_email_on_file') {
          msg = 'No email address linked to your account.';
        } else if (errorCode === 'send_failed') {
          msg = 'Email delivery failed — try again later.';
        }
        setReminderMsg(msg);
        setReminderState('error');
        setTimeout(() => { setReminderState('idle'); setReminderMsg(''); }, 5000);
      }
    } catch {
      setReminderMsg('Network error — check your connection.');
      setReminderState('error');
      setTimeout(() => { setReminderState('idle'); setReminderMsg(''); }, 5000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full sm:w-[440px] h-[92vh] sm:h-full max-h-screen bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden sm:rounded-none rounded-t-3xl border-l border-zinc-100 dark:border-neutral-800">

        {/* ── Gradient header ──────────────────────────────────── */}
        <div
          className="flex items-start justify-between px-6 pt-6 pb-5 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Job Details</p>
            <h3 className="text-base font-extrabold text-white line-clamp-2 leading-snug">
              {job.title || 'Untitled Role'}
            </h3>
            {showCompany && (
              <p className="text-sm text-white/60 mt-1 font-medium">{job.company}</p>
            )}

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {job.inputType && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
                  {job.inputType === 'url' ? '🔗 From URL' : job.inputType === 'pdf' ? '📄 From PDF' : job.inputType === 'image' ? '📸 Screenshot' : '📋 Pasted'}
                </span>
              )}
              {job.remote && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
                  {remoteIcon} {job.remote}
                </span>
              )}
              {job.location && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
                  📍 {job.location.length > 20 ? job.location.slice(0, 18) + '…' : job.location}
                </span>
              )}
              {job.priority === 'dream' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                  ⭐ Dream role
                </span>
              )}
              {job.status === 'applied' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  ✓ Applied
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 ml-3 mt-0.5"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

          {/* Match score */}
          {isClassifying ? (
            <div className="flex flex-col items-center py-5 gap-3">
              <div className="w-28 h-28 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              <p className="text-xs text-zinc-400">Scoring match…</p>
            </div>
          ) : (
            <div className="flex items-center gap-5 bg-zinc-50 dark:bg-neutral-800 rounded-2xl px-5 py-5 border border-zinc-100 dark:border-neutral-700">
              <DonutChart score={score} />
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">{qualityText}</p>
            </div>
          )}

          {/* About this role */}
          {isAnalysing ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">About this role</p>
              <div className="space-y-2">
                {[90, 75, 60].map(w => (
                  <div key={w} className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
              <p className="text-[10px] text-zinc-400">Analysing job description…</p>
            </div>
          ) : job.tldr ? (
            <div>
              <SectionHead
                icon={<div className="w-5 h-5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="h-3 w-3 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                </div>}
                label="About this role"
              />
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-neutral-800 rounded-2xl px-4 py-4 border border-zinc-100 dark:border-neutral-700">
                {job.tldr}
              </p>
            </div>
          ) : null}

          {/* Key requirements */}
          {job.requirements && job.requirements.length > 0 ? (
            <div>
              <SectionHead
                icon={<div className="w-5 h-5 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                </div>}
                label="What the job needs"
                count={job.requirements.length}
              />
              <ul className="space-y-2">
                {job.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-2" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          ) : !isAnalysing && keywordsFound.length > 0 ? (
            <div>
              <SectionHead
                icon={<div className="w-5 h-5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                </div>}
                label="Skills in this job"
                count={keywordsFound.length}
              />
              <div className="flex flex-wrap gap-1.5">
                {keywordsFound.map(w => (
                  <span key={w} className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-neutral-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Salary */}
          {job.salary && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl px-5 py-4">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Salary</p>
              <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">{job.salary}</p>
            </div>
          )}

          {/* Deadline */}
          {job.deadline && <DeadlineBlock deadline={job.deadline} />}

          {/* Email reminder */}
          {user?.email && (
            <div className="bg-zinc-50 dark:bg-neutral-800 rounded-2xl px-5 py-4 border border-zinc-100 dark:border-neutral-700">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Email Reminder</p>
              {reminderState === 'sent' ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-sm font-medium">Reminder sent to {user.email}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex-1 leading-relaxed">
                      Get a reminder email about this role{job.deadline ? ' before the deadline' : ''}.
                    </p>
                    <button
                      onClick={handleReminder}
                      disabled={reminderState !== 'idle'}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        reminderState === 'sending'
                          ? 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400 cursor-wait'
                          : reminderState === 'error'
                          ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border border-rose-200 dark:border-rose-800'
                          : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                      }`}
                    >
                      {reminderState === 'sending' ? (
                        <><span className="w-3 h-3 rounded-full border border-zinc-400 border-t-transparent animate-spin" /> Sending…</>
                      ) : reminderState === 'error' ? (
                        <>✗ Failed</>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          Remind me
                        </>
                      )}
                    </button>
                  </div>
                  {reminderState === 'error' && reminderMsg && (
                    <p className="text-[11px] text-rose-500 dark:text-rose-400 leading-snug">
                      {reminderMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <SectionHead
              icon={<div className="w-5 h-5 rounded-lg bg-zinc-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                <svg className="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>}
              label="Notes"
            />
            <div className="relative">
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Add private notes — interview tips, contacts, referrals…"
                rows={4}
                className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-zinc-700 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]/50 transition-colors leading-relaxed"
              />
              {(notesChanged || notesSaved) && (
                <span className={`absolute bottom-3 right-3 text-[10px] font-medium transition-colors ${notesSaved ? 'text-emerald-500' : 'text-zinc-300'}`}>
                  {notesSaved ? '✓ Saved' : 'Saving…'}
                </span>
              )}
            </div>
          </div>

          {/* How to apply */}
          {(job.email || job.website || job.sourceUrl) && (
            <div>
              <SectionHead
                icon={<div className="w-5 h-5 rounded-lg bg-zinc-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                  <svg className="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>}
                label="How to apply"
              />
              <div className="space-y-2">
                {job.website && (
                  <a href={safeHref(job.website)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group">
                    <svg className="h-4 w-4 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate group-hover:text-[#C9A84C] transition-colors">
                      {job.website.replace(/^https?:\/\//, '').slice(0, 55)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-[#C9A84C] ml-auto flex-shrink-0 transition-colors" />
                  </a>
                )}
                {job.email && (
                  <a href={`mailto:${job.email}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group">
                    <svg className="h-4 w-4 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate group-hover:text-[#C9A84C] transition-colors">{job.email}</span>
                  </a>
                )}
                {!job.website && !job.email && job.sourceUrl && (
                  <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group">
                    <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">View original posting</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* JD preview fallback */}
          {!job.tldr && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Job description preview</p>
              <div className="bg-zinc-50 dark:bg-neutral-800 rounded-2xl px-4 py-4 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-6 font-mono border border-zinc-100 dark:border-neutral-700">
                {(job.rawJd ?? '').slice(0, 500)}{(job.rawJd ?? '').length > 500 ? '…' : ''}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center justify-between text-[10px] text-zinc-300 dark:text-zinc-600 pt-1 border-t border-zinc-100 dark:border-neutral-800">
            <span>Saved {addedDate}</span>
          </div>
        </div>

        {/* ── Action buttons ───────────────────────────────────── */}
        <div className="px-6 pb-7 pt-4 border-t border-zinc-100 dark:border-neutral-800 space-y-2.5 flex-shrink-0">
          <button
            onClick={() => onBuildCV(job)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold text-white transition-all hover:opacity-90 hover:shadow-lg"
            style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Build CV for this role
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-sm font-bold border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default VaultQuickActions;
