import React from 'react';

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'failed' | 'ai-verified';

export function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= 90) return 'high';
  if (score >= 70) return 'medium';
  if (score >= 50) return 'low';
  return 'failed';
}

interface ImportConfidenceBadgeProps {
  score: number;
  aiVerified?: boolean;
  className?: string;
}

const TIER_CONFIG: Record<ConfidenceTier, { label: string; dot: string; bg: string; text: string; title: string }> = {
  'high':        { label: '',                            dot: '', bg: '', text: '', title: '' },
  'medium':      { label: '?',                           dot: 'bg-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', title: 'We think this is correct — double-check' },
  'low':         { label: 'Low confidence',              dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-400', title: 'Low confidence — please verify this field' },
  'failed':      { label: 'Could not extract',           dot: 'bg-rose-500',  bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',    text: 'text-rose-700 dark:text-rose-400',   title: 'Could not extract — please fill in manually' },
  'ai-verified': { label: '✓ AI verified',               dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', title: 'Verified and improved by AI' },
};

export const ImportConfidenceBadge: React.FC<ImportConfidenceBadgeProps> = ({ score, aiVerified, className = '' }) => {
  const tier = aiVerified ? 'ai-verified' : getConfidenceTier(score);
  const cfg = TIER_CONFIG[tier];
  if (tier === 'high') return null;

  return (
    <span
      title={cfg.title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${cfg.bg} ${cfg.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

/** Compact dot-only variant for use in tight spaces. */
export const ImportConfidenceDot: React.FC<{ score: number; aiVerified?: boolean }> = ({ score, aiVerified }) => {
  const tier = aiVerified ? 'ai-verified' : getConfidenceTier(score);
  if (tier === 'high') return null;
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      title={cfg.title}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ml-1`}
    />
  );
};

export default ImportConfidenceBadge;
