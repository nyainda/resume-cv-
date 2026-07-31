import React from 'react';
import type { VaultJob } from '../../types';
import { CheckCircle, AlertCircle, ArrowRight } from '../icons';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

function DonutChart({ score }: { score: number }) {
  const size = 96;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const dash = circ * (pct / 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? GOLD : pct >= 45 ? '#f59e0b' : '#94a3b8';
  const label = pct >= 80 ? 'High Match' : pct >= 65 ? 'Good Match' : pct >= 45 ? 'Partial' : 'Low Match';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-100 dark:text-zinc-800" />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x={size/2} y={size/2 - 4} textAnchor="middle" fontSize="16" fontWeight="800" fill={color}>{pct}%</text>
        <text x={size/2} y={size/2 + 11} textAnchor="middle" fontSize="9" style={{fill:'#94a3b8'}}>match</text>
      </svg>
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

function SectionHead({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <p className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">{label}</p>
      {count !== undefined && (
        <span className="ml-auto text-[10px] text-zinc-400">{count}</span>
      )}
    </div>
  );
}

// Derive keyword signals for the match card (used when no LLM requirements available)
function deriveKeywords(job: VaultJob): { found: string[]; notFound: string[] } {
  const TECH = ['Python','JavaScript','TypeScript','React','Node.js','AWS','GCP','Azure','Docker',
    'Kubernetes','Terraform','CI/CD','PostgreSQL','MongoDB','Redis','GraphQL','REST','SQL',
    'Java','Go','Rust','Figma','Excel','Tableau','Salesforce','Jira','Agile','Scrum'];
  const jdLower = (job.rawJd ?? '').toLowerCase();
  const found = TECH.filter(w => jdLower.includes(w.toLowerCase()));
  const notFound = TECH.filter(w => !jdLower.includes(w.toLowerCase())).slice(0, 3);
  return { found: found.slice(0, 6), notFound };
}

interface Props {
  job:       VaultJob;
  onBuildCV: (job: VaultJob) => void;
  onClose:   () => void;
}

export const VaultQuickActions: React.FC<Props> = ({ job, onBuildCV, onClose }) => {
  const score = job.matchScore ?? 0;
  const isClassifying = job.matchScore === undefined;
  const isAnalysing   = !job.analysed;

  const qualityText = score >= 80
    ? `Strong match — your profile directly covers the core requirements.`
    : score >= 65
    ? `Good match — your background covers most of what they need.`
    : score >= 45
    ? `Partial match — worth reviewing the gaps before applying.`
    : `Low match — this may be a stretch role.`;

  const { found: keywordsFound } = deriveKeywords(job);

  const addedDate = new Date(job.createdAt).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full sm:w-[420px] h-[90vh] sm:h-full max-h-screen bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden sm:rounded-none rounded-t-2xl border-l border-zinc-100 dark:border-neutral-700">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Job details</p>
            <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 line-clamp-1">
              {job.title || 'Untitled Role'}
            </h3>
            {job.company && job.company !== 'Unknown Company' && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{job.company}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0 ml-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ── Match score ─────────────────────────────────────── */}
          {isClassifying ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              <p className="text-xs text-zinc-400">Scoring match…</p>
            </div>
          ) : (
            <div className="flex items-center gap-5 bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-4">
              <DonutChart score={score} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">{qualityText}</p>
            </div>
          )}

          {/* ── About this role (TLDR) ───────────────────────── */}
          {isAnalysing ? (
            <div className="space-y-1.5">
              <p className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">About this role</p>
              <div className="space-y-1.5">
                {[80, 95, 70].map(w => (
                  <div key={w} className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Analysing job description…</p>
            </div>
          ) : job.tldr ? (
            <div>
              <SectionHead
                icon={<svg className="h-4 w-4 text-indigo-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>}
                label="About this role"
              />
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-3">
                {job.tldr}
              </p>
            </div>
          ) : null}

          {/* ── Key requirements ─────────────────────────────── */}
          {job.requirements && job.requirements.length > 0 ? (
            <div>
              <SectionHead
                icon={<AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />}
                label="What the job needs"
                count={job.requirements.length}
              />
              <ul className="space-y-1.5">
                {job.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          ) : !isAnalysing && keywordsFound.length > 0 ? (
            <div>
              <SectionHead
                icon={<CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                label="Skills in this job"
                count={keywordsFound.length}
              />
              <div className="flex flex-wrap gap-1.5">
                {keywordsFound.map(w => (
                  <span key={w} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-neutral-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Salary ──────────────────────────────────────────── */}
          {job.salary && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Salary</p>
              <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">{job.salary}</p>
            </div>
          )}

          {/* ── How to apply ─────────────────────────────────── */}
          {(job.email || job.website || job.sourceUrl) && (
            <div>
              <SectionHead
                icon={<svg className="h-4 w-4 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
                label="How to apply"
              />
              <div className="space-y-2">
                {job.website && (
                  <a
                    href={job.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group"
                  >
                    <svg className="h-3.5 w-3.5 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate group-hover:text-[#C9A84C] transition-colors">
                      {job.website.replace(/^https?:\/\//, '').slice(0, 60)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-zinc-300 group-hover:text-[#C9A84C] ml-auto flex-shrink-0" />
                  </a>
                )}
                {job.email && (
                  <a
                    href={`mailto:${job.email}`}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group"
                  >
                    <svg className="h-3.5 w-3.5 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate group-hover:text-[#C9A84C] transition-colors">
                      {job.email}
                    </span>
                  </a>
                )}
                {!job.website && !job.email && job.sourceUrl && (
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 hover:border-[#C9A84C]/50 transition-colors group"
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-[#C9A84C] flex-shrink-0" />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">View original posting</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ── Deadline ─────────────────────────────────────── */}
          {job.deadline && (
            <div className="bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Deadline</p>
              <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
                {new Date(job.deadline).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
              </p>
              {(() => {
                const d = Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86400000);
                return d >= 0 && d <= 7 ? (
                  <p className="text-xs text-rose-500 font-bold mt-0.5">⚠ {d === 0 ? 'Due today!' : `${d} day${d !== 1 ? 's' : ''} left`}</p>
                ) : d < 0 ? (
                  <p className="text-xs text-zinc-400 mt-0.5">Deadline passed</p>
                ) : null;
              })()}
            </div>
          )}

          {/* ── JD preview ───────────────────────────────────── */}
          {!job.tldr && (
            <div>
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Job description preview</p>
              <div className="bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-6 font-mono">
                {(job.rawJd ?? '').slice(0, 500)}{(job.rawJd ?? '').length > 500 ? '…' : ''}
              </div>
            </div>
          )}

          {/* ── Meta ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between text-[10px] text-zinc-300 dark:text-zinc-600 pt-1 border-t border-zinc-50 dark:border-neutral-800">
            <span>Saved {addedDate}</span>
            {job.inputType && (
              <span className="capitalize">{job.inputType === 'url' ? 'From URL' : job.inputType === 'pdf' ? 'From PDF' : job.inputType === 'image' ? 'From screenshot' : 'Pasted'}</span>
            )}
          </div>
        </div>

        {/* Action buttons — pinned to bottom */}
        <div className="px-5 pb-6 pt-4 border-t border-zinc-100 dark:border-neutral-800 space-y-2 flex-shrink-0">
          <button
            onClick={() => onBuildCV(job)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold text-white transition-opacity hover:opacity-90 shadow-lg"
            style={{ background: NAVY }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            Build CV for this role
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default VaultQuickActions;
