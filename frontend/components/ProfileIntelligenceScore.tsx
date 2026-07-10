/**
 * ProfileIntelligenceScore.tsx
 *
 * Visual card displaying the composite Profile Intelligence Score (0-100)
 * with a circular gauge, per-component progress bars, and improvement tips.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { CVData, UserProfile } from '../types';
import { computeIntelligenceScore } from '../services/profileIntelligenceScore';
import type { IntelligenceGrade, IntelligenceComponent } from '../services/profileIntelligenceScore';

interface Props {
  cv: CVData | null;
  profile: UserProfile | null;
  jobDescription?: string;
  /** When true, renders as a compact inline row (no breakdown bars). */
  compact?: boolean;
}

// ── Color maps ───────────────────────────────────────────────────────────────

const GRADE_CONFIG: Record<IntelligenceGrade, {
  label: string; text: string; ring: string; gaugeFill: string; bg: string; border: string;
}> = {
  weak:      { label: 'Needs Work',  text: 'text-rose-600 dark:text-rose-400',       ring: 'text-rose-500',    gaugeFill: '#ef4444', bg: 'bg-rose-50 dark:bg-rose-900/10',      border: 'border-rose-200 dark:border-rose-800' },
  fair:      { label: 'Fair',        text: 'text-amber-600 dark:text-amber-400',     ring: 'text-amber-500',   gaugeFill: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/10',    border: 'border-amber-200 dark:border-amber-800' },
  good:      { label: 'Good',        text: 'text-blue-600 dark:text-blue-400',       ring: 'text-blue-500',    gaugeFill: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-900/10',      border: 'border-blue-200 dark:border-blue-800' },
  strong:    { label: 'Strong',      text: 'text-emerald-600 dark:text-emerald-400', ring: 'text-emerald-500', gaugeFill: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800' },
  excellent: { label: 'Excellent',   text: 'text-[#C9A84C]',                         ring: 'text-[#C9A84C]',   gaugeFill: '#C9A84C', bg: 'bg-yellow-50 dark:bg-yellow-900/10',  border: 'border-yellow-300 dark:border-yellow-700' },
};

const COMPONENT_BAR_COLOR: Record<IntelligenceComponent['color'], string> = {
  red:     'bg-rose-500',
  amber:   'bg-amber-500',
  yellow:  'bg-yellow-400',
  blue:    'bg-blue-500',
  emerald: 'bg-emerald-500',
  gold:    'bg-[#C9A84C]',
};

// ── SVG Gauge ────────────────────────────────────────────────────────────────

function Gauge({ score, fill, size = 80 }: { score: number; fill: string; size?: number }) {
  const r = (size / 2) - 7;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
        strokeWidth="7" className="text-zinc-200 dark:text-neutral-700" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={fill} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }}
      />
    </svg>
  );
}

// ── Component bar ────────────────────────────────────────────────────────────

const ComponentBar: React.FC<{ item: IntelligenceComponent }> = ({ item }) => {
  const bar = COMPONENT_BAR_COLOR[item.color];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 truncate">{item.label}</span>
        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 tabular-nums flex-shrink-0">{item.score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-neutral-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-700`}
          style={{ width: `${item.score}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-snug">{item.tip}</p>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileIntelligenceScore({ cv, profile, jobDescription, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const prevScore = useRef(0);

  const result = computeIntelligenceScore(cv, profile, jobDescription);
  const cfg = GRADE_CONFIG[result.grade];

  // Animate the gauge number on score change
  useEffect(() => {
    if (result.total === prevScore.current) return;
    const start = prevScore.current;
    const end = result.total;
    prevScore.current = end;
    const duration = 900;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(start + (end - start) * ease));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [result.total]);

  // ── Compact mode ─────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${cfg.border} ${cfg.bg}`}>
        <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          <Gauge score={animatedScore} fill={cfg.gaugeFill} size={36} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-zinc-800 dark:text-zinc-100"
            style={{ transform: 'rotate(0deg)' }}>
            {animatedScore}
          </span>
        </div>
        <div>
          <p className={`text-xs font-bold ${cfg.text}`}>Intelligence Score · {cfg.label}</p>
          {result.improvements[0] && (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-snug">{result.improvements[0]}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-4">

        {/* Gauge */}
        <div className="flex-shrink-0 relative" style={{ width: 72, height: 72 }}>
          <Gauge score={animatedScore} fill={cfg.gaugeFill} size={72} />
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ transform: 'rotate(0deg)' }}>
            <span className="text-[17px] font-black leading-none text-zinc-900 dark:text-zinc-50">{animatedScore}</span>
            <span className="text-[9px] font-medium text-zinc-400 leading-none">/ 100</span>
          </div>
        </div>

        {/* Labels */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Profile Intelligence Score</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.text}`}>
              {cfg.label}
            </span>
            {!result.hasJd && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Add a job description for a full ATS score</span>
            )}
          </div>

          {/* Strengths */}
          {result.strengths.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {result.strengths.map(s => (
                <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                  ✓ {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/40 dark:hover:bg-white/5"
          aria-label={expanded ? 'Collapse breakdown' : 'Show breakdown'}
        >
          <svg className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expandable breakdown */}
      {expanded && (
        <div className="border-t border-zinc-200 dark:border-neutral-700 px-5 py-4 space-y-4 bg-white/60 dark:bg-black/10">

          {/* Component bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {result.components.map(comp => (
              <ComponentBar key={comp.label} item={comp} />
            ))}
          </div>

          {/* Improvement tips */}
          {result.improvements.length > 0 && (
            <div className="pt-2 border-t border-zinc-200 dark:border-neutral-700">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
                Top improvements
              </p>
              <ul className="space-y-1.5">
                {result.improvements.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-zinc-200 dark:bg-neutral-700 flex items-center justify-center text-[9px] font-bold text-zinc-500">
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weight legend */}
          <div className="pt-1">
            <p className="text-[9px] text-zinc-400 dark:text-zinc-600 leading-snug">
              Score = Completeness (25%) + Achievement Density (25%) + Number Fidelity (20%) + Voice Quality (15%) + {result.hasJd ? 'ATS Match' : 'Skills Coverage'} (15%)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileIntelligenceScore;
