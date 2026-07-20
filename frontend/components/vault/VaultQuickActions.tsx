import React from 'react';
import type { VaultJob } from '../../types';
import { CheckCircle, AlertCircle, ArrowRight, Bookmark } from '../icons';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

function DonutChart({ score }: { score: number }) {
  const size = 100;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const dash = circ * (pct / 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 65 ? GOLD : pct >= 45 ? '#f59e0b' : '#94a3b8';
  const label = pct >= 80 ? 'High Match' : pct >= 65 ? 'Good Match' : pct >= 45 ? 'Partial Match' : 'Low Match';
  return (
    <div className="flex flex-col items-center gap-2">
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
        <text x={size/2} y={size/2 + 12} textAnchor="middle" fontSize="9" fill="currentColor" className="text-zinc-400" style={{fill:'#94a3b8'}}>Match</text>
      </svg>
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

function KeywordPill({ word }: { word: string; [k: string]: unknown }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-neutral-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600">
      {word}
    </span>
  );
}

function deriveInsights(job: VaultJob) {
  // Extract keyword signals from raw JD for display
  const techWords = ['Python','JavaScript','TypeScript','React','Node.js','AWS','GCP','Azure','Docker','Kubernetes',
    'Terraform','CI/CD','PostgreSQL','MongoDB','Redis','GraphQL','REST','gRPC','ML','AI','SQL','Java','Go','Rust',
    'Figma','Sketch','Excel','Tableau','Salesforce','HubSpot','Jira','Agile','Scrum'];
  const jdLower = job.rawJd.toLowerCase();
  const found = techWords.filter(w => jdLower.includes(w.toLowerCase()));
  const missing = found.slice(0, 5); // show first 5 as "keywords to add"
  const strengths = found.slice(5, 9); // next 4 as "strengths"
  return { missing, strengths };
}

interface Props {
  job:         VaultJob;
  onBuildCV:   (job: VaultJob) => void;
  onClose:     () => void;
}

export const VaultQuickActions: React.FC<Props> = ({ job, onBuildCV, onClose }) => {
  const score = job.matchScore ?? 0;
  const isClassifying = job.matchScore === undefined;
  const { missing, strengths } = deriveInsights(job);
  const qualityText = score >= 80
    ? `Strong match. Your profile directly aligns with the core requirements for this role.`
    : score >= 65
    ? `Good match. Your background covers most requirements with a few gaps to address.`
    : score >= 45
    ? `Partial match. Several gaps exist — worth reviewing before applying.`
    : `Low match. This may be a stretch role — check the gaps carefully.`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full sm:w-96 h-[85vh] sm:h-full max-h-screen bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden sm:rounded-none rounded-t-2xl border-l border-zinc-100 dark:border-neutral-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div>
            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Quick Check</p>
            <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 line-clamp-1">
              {job.title} at {job.company}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Match score donut */}
          {isClassifying ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              <p className="text-xs text-zinc-400">Analysing match…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <DonutChart score={score} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center mt-3 max-w-xs leading-relaxed">{qualityText}</p>
            </div>
          )}

          {/* Match signals */}
          {!isClassifying && (
            <>
              {/* Missing keywords */}
              {missing.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                    <p className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">Keywords to address</p>
                    <span className="ml-auto text-[10px] text-zinc-400">{missing.length} flagged</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map(w => <KeywordPill key={w} word={w} />)}
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">Add these to your CV to improve relevance</p>
                </div>
              )}

              {/* Strengths */}
              {strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <p className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">Your strengths</p>
                  </div>
                  <div className="space-y-1.5">
                    {strengths.map(s => (
                      <div key={s} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deadline */}
              {job.deadline && (
                <div className="bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-0.5">Deadline</p>
                  <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
                    {new Date(job.deadline).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                  </p>
                  {(() => {
                    const d = Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86400000);
                    return d >= 0 && d <= 7 ? (
                      <p className="text-xs text-rose-500 font-bold mt-0.5">⚠ {d === 0 ? 'Due today!' : `${d} day${d !== 1 ? 's' : ''} left`}</p>
                    ) : null;
                  })()}
                </div>
              )}

              {/* JD preview */}
              <div>
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Job description preview</p>
                <div className="bg-zinc-50 dark:bg-neutral-800 rounded-xl px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-6 font-mono">
                  {job.rawJd.slice(0, 400)}{job.rawJd.length > 400 ? '…' : ''}
                </div>
              </div>
            </>
          )}
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
            Create Full CV
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
          >
            View in Vault
          </button>
        </div>
      </div>
    </div>
  );
};

export default VaultQuickActions;
