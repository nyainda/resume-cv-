/**
 * CVCompareModal.tsx
 *
 * Two tabs:
 *   1. "Generate & Compare" — fires two parallel generateCV calls with different
 *      modes and shows full CV previews side-by-side so the user can pick one.
 *   2. "ATS / Quality" — existing saved-CV comparison with keyword coverage
 *      bars, exclusive-match chips, and writing-quality scores.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { X, AlertTriangle, RefreshCw, Columns, CheckCircle, Clock, Zap } from './icons';
import type { CVData, SavedCV, UserProfile, TemplateName, CVGenerationMode, SidebarSectionsVisibility } from '../types';
import { DEFAULT_SIDEBAR_SECTIONS } from '../types';
import { auditCvQuality, type CvQualityReport } from '../services/cvNumberFidelity';
import { scoreAtsCoverage, type AtsKeywordReport } from '../services/cvAtsKeywords';
import { generateCV } from '../services/geminiService';
import CVPreview from './CVPreview';
import ResponsiveCVScale from './ResponsiveCVScale';
import { getCVDataCached } from '../services/storage/cvDataStore';

// ─────────────────────────────────────────────────────────────────────────────
// Mode meta
// ─────────────────────────────────────────────────────────────────────────────

const MODE_META: Record<CVGenerationMode, {
  label: string; emoji: string; description: string;
  headerBg: string; headerText: string; bg: string; text: string; border: string;
}> = {
  honest: {
    label: 'Authentic', emoji: '✅',
    description: 'Real experience, strongest framing — nothing invented.',
    headerBg: 'bg-emerald-600', headerText: 'text-white',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-700',
  },
  boosted: {
    label: 'Enhanced', emoji: '🚀',
    description: 'Bolder framing, stronger scope language, gaps filled with context.',
    headerBg: 'bg-blue-600', headerText: 'text-white',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
  },
  aggressive: {
    label: 'Maximum', emoji: '🔥',
    description: 'CV restructured, summary rewritten, every word optimised for impact.',
    headerBg: 'bg-orange-600', headerText: 'text-white',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-300 dark:border-orange-700',
  },
};

const ALL_MODES: CVGenerationMode[] = ['honest', 'boosted', 'aggressive'];

function fmtElapsed(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATS/Quality column (used by tab 2)
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnProps {
  label: string; sublabel: string;
  quality: CvQualityReport; ats: AtsKeywordReport | null;
  exclusiveMatches: string[]; isWinner: boolean; hasJd: boolean;
  actionLabel?: string; onAction?: () => void;
}

function CvColumn({ label, sublabel, quality, ats, exclusiveMatches, isWinner, hasJd, actionLabel, onAction }: ColumnProps) {
  const exclusiveSet = new Set(exclusiveMatches);
  const qColor = quality.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : quality.score >= 60 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400';
  const atsColor = ats ? (ats.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : ats.score >= 60 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400') : '';
  const barColor = ats ? (ats.score >= 80 ? 'bg-emerald-500' : ats.score >= 60 ? 'bg-amber-400' : 'bg-rose-400') : '';

  return (
    <div className={`p-6 flex flex-col gap-4 ${isWinner ? 'bg-emerald-50/40 dark:bg-emerald-900/5' : ''}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{label}</span>
            {isWinner && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-700/60">
                ★ Better {hasJd ? 'ATS match' : 'quality'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{sublabel}</p>
        </div>
      </div>
      <div className="flex gap-6 items-end">
        <div>
          <div className={`text-4xl font-bold tabular-nums leading-none ${qColor}`}>{quality.score}</div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Quality score</div>
        </div>
        {ats && (
          <div>
            <div className={`text-4xl font-bold tabular-nums leading-none ${atsColor}`}>{ats.score}%</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">ATS match</div>
          </div>
        )}
      </div>
      {ats && (
        <div>
          <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(2, ats.score)}%` }} />
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{ats.matched.length} of {ats.keywords.length} JD keywords matched</p>
        </div>
      )}
      {exclusiveMatches.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">✦ Only in this version ({exclusiveMatches.length}):</p>
          <div className="flex flex-wrap gap-1.5">
            {exclusiveMatches.map(kw => (
              <span key={kw} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-semibold">{kw}</span>
            ))}
          </div>
        </div>
      )}
      {ats && ats.matched.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5">Matched ({ats.matched.length}):</p>
          <div className="flex flex-wrap gap-1.5">
            {ats.matched.map(kw => (
              <span key={kw} className={`text-[11px] px-2 py-0.5 rounded-full border ${exclusiveSet.has(kw) ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 font-semibold' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'}`}>{kw}</span>
            ))}
          </div>
        </div>
      )}
      {ats && ats.missing.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1.5">Missing ({ats.missing.length}):</p>
          <div className="flex flex-wrap gap-1.5">
            {ats.missing.map(kw => (
              <span key={kw} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40">{kw}</span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
        {quality.totalIssues === 0
          ? `No writing issues across ${quality.totalBullets} bullet${quality.totalBullets === 1 ? '' : 's'}.`
          : `${quality.totalIssues} writing issue${quality.totalIssues === 1 ? '' : 's'} across ${quality.totalBullets} bullet${quality.totalBullets === 1 ? '' : 's'}.`}
      </p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-auto w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate column state
// ─────────────────────────────────────────────────────────────────────────────

type ColPhase =
  | { phase: 'idle' }
  | { phase: 'generating'; startedAt: number }
  | { phase: 'done'; cv: CVData; elapsedMs: number }
  | { phase: 'error'; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  currentCv: CVData;
  savedCVs: SavedCV[];
  jd: string;
  onSelectSaved: (cv: CVData) => void;
  userProfile?: UserProfile;
  template?: TemplateName;
  cvPurpose?: 'job' | 'academic' | 'general';
  sidebarSections?: SidebarSectionsVisibility;
}

const PURPOSE_EMOJI: Record<string, string> = { job: '💼', academic: '🎓', general: '📄' };

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CVCompareModal({
  open, onClose, currentCv, savedCVs, jd, onSelectSaved,
  userProfile, template = 'professional',
  cvPurpose = 'job', sidebarSections = DEFAULT_SIDEBAR_SECTIONS,
}: Props) {
  // Decide default tab: generate if profile is available, else ats
  const defaultTab = userProfile ? 'generate' : 'ats';
  const [tab, setTab] = useState<'generate' | 'ats'>(defaultTab);

  // ── Tab 1: Generate & Compare ────────────────────────────────────────────
  const [modeA, setModeA] = useState<CVGenerationMode>('honest');
  const [modeB, setModeB] = useState<CVGenerationMode>('boosted');
  const [colA, setColA] = useState<ColPhase>({ phase: 'idle' });
  const [colB, setColB] = useState<ColPhase>({ phase: 'idle' });
  const abortRef = useRef(false);
  const [, setTick] = useState(0); // triggers re-render for elapsed timer

  useEffect(() => {
    const running = colA.phase === 'generating' || colB.phase === 'generating';
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [colA.phase, colB.phase]);

  useEffect(() => {
    if (!open) {
      abortRef.current = true;
      setColA({ phase: 'idle' });
      setColB({ phase: 'idle' });
    } else {
      abortRef.current = false;
      setTab(userProfile ? 'generate' : 'ats');
    }
  }, [open, userProfile]);

  const runGeneration = useCallback(async () => {
    if (!userProfile) return;
    abortRef.current = false;
    const startA = Date.now();
    const startB = Date.now();
    setColA({ phase: 'generating', startedAt: startA });
    setColB({ phase: 'generating', startedAt: startB });

    const runOne = async (
      mode: CVGenerationMode,
      set: React.Dispatch<React.SetStateAction<ColPhase>>,
      startedAt: number,
    ) => {
      try {
        const cv = await generateCV(userProfile, jd || '', mode, cvPurpose);
        if (abortRef.current) return;
        set({ phase: 'done', cv, elapsedMs: Date.now() - startedAt });
      } catch (err) {
        if (abortRef.current) return;
        set({ phase: 'error', message: err instanceof Error ? err.message : 'Generation failed' });
      }
    };

    await Promise.all([
      runOne(modeA, setColA, startA),
      runOne(modeB, setColB, startB),
    ]);
  }, [userProfile, jd, modeA, modeB, cvPurpose]);

  const isGenerating = colA.phase === 'generating' || colB.phase === 'generating';
  const canGenerate = !!userProfile && modeA !== modeB && !isGenerating;

  // ── Tab 2: ATS / Quality ─────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSaved = useMemo(() => savedCVs.find(s => s.id === selectedId) ?? null, [savedCVs, selectedId]);
  // Resolved data: in-memory cache first (populated at boot), then inline (legacy / just-saved)
  const resolvedSelectedData = selectedSaved
    ? (getCVDataCached(selectedSaved.id) ?? selectedSaved.data ?? null)
    : null;
  const hasJd = jd.trim().length > 0;
  const qualityA = useMemo(() => auditCvQuality(currentCv), [currentCv]);
  const qualityB = useMemo(() => (resolvedSelectedData ? auditCvQuality(resolvedSelectedData) : null), [resolvedSelectedData]);
  const atsA = useMemo(() => (hasJd ? scoreAtsCoverage(currentCv, jd) : null), [currentCv, jd, hasJd]);
  const atsB = useMemo(() => (hasJd && resolvedSelectedData ? scoreAtsCoverage(resolvedSelectedData, jd) : null), [resolvedSelectedData, jd, hasJd]);
  const setAmatched = useMemo(() => new Set(atsA?.matched ?? []), [atsA]);
  const setBmatched = useMemo(() => new Set(atsB?.matched ?? []), [atsB]);
  const exclusiveA = useMemo(() => (atsA?.matched ?? []).filter(k => !setBmatched.has(k)), [atsA, setBmatched]);
  const exclusiveB = useMemo(() => (atsB?.matched ?? []).filter(k => !setAmatched.has(k)), [atsB, setAmatched]);
  const aScore = hasJd ? (atsA?.score ?? 0) : qualityA.score;
  const bScore = hasJd ? (atsB?.score ?? 0) : (qualityB?.score ?? 0);
  const aWins = selectedSaved !== null && aScore > bScore;
  const bWins = selectedSaved !== null && bScore > aScore;

  if (!open) return null;

  // ── Shared: scaled CV preview pane ───────────────────────────────────────
  const PreviewPane = ({ cvData, label, mode, elapsedMs, onUse }: {
    cvData: CVData; label: string; mode?: CVGenerationMode;
    elapsedMs?: number; onUse: () => void;
  }) => {
    const meta = mode ? MODE_META[mode] : null;
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl shrink-0 ${meta ? meta.headerBg : 'bg-slate-700'} ${meta ? meta.headerText : 'text-white'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {meta && <span>{meta.emoji}</span>}
            <span className="font-semibold text-sm truncate">{label}</span>
            {elapsedMs !== undefined && (
              <span className="text-xs opacity-70 flex items-center gap-1 shrink-0">
                <Clock className="h-3 w-3" />{fmtElapsed(elapsedMs)}
              </span>
            )}
          </div>
          <button
            onClick={onUse}
            className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/35 transition-colors text-xs font-semibold"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Use this CV
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 rounded-b-xl p-3">
          <ResponsiveCVScale maxScale={0.8}>
            <CVPreview
              cvData={cvData}
              personalInfo={userProfile!.personalInfo}
              template={template}
              sidebarSections={sidebarSections}
              jobDescriptionForATS={jd || undefined}
            />
          </ResponsiveCVScale>
        </div>
      </div>
    );
  };

  const EmptyCol = ({ mode, isOtherMode }: { mode: CVGenerationMode; isOtherMode?: boolean }) => {
    const meta = MODE_META[mode];
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed ${isOtherMode ? 'border-gray-100 dark:border-gray-800 opacity-40' : 'border-gray-200 dark:border-gray-700'}`}>
        <div className={`w-12 h-12 rounded-xl ${meta.bg} flex items-center justify-center text-2xl`}>{meta.emoji}</div>
        <div className="text-center px-4">
          <p className={`font-semibold text-sm ${meta.text}`}>{meta.label} Mode</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[180px]">{meta.description}</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">Click "Generate Both" to start</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[96vw] max-w-7xl h-[92vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Columns className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">CV Comparison</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Generate two modes in parallel, or compare against a saved version</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            {userProfile && (
              <button
                onClick={() => setTab('generate')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'generate' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                <Zap className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                Generate Modes
              </button>
            )}
            <button
              onClick={() => setTab('ats')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'ats' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              ATS &amp; Quality
            </button>
          </div>

          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Generate & Compare tab ──────────────────────────────────────── */}
        {tab === 'generate' && userProfile && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Controls row */}
            <div className="flex items-center justify-center gap-3 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
              {/* Mode A */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Version A</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  {ALL_MODES.map(m => {
                    const meta = MODE_META[m];
                    const active = modeA === m;
                    const blocked = m === modeB;
                    return (
                      <button
                        key={m}
                        onClick={() => setModeA(m)}
                        disabled={blocked || isGenerating}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${active ? `${meta.headerBg} ${meta.headerText}` : blocked || isGenerating ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={runGeneration}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800/60 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" />Generating…</>
                ) : (
                  <><Zap className="h-4 w-4" />Generate Both</>
                )}
              </button>

              {/* Mode B */}
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  {ALL_MODES.map(m => {
                    const meta = MODE_META[m];
                    const active = modeB === m;
                    const blocked = m === modeA;
                    return (
                      <button
                        key={m}
                        onClick={() => setModeB(m)}
                        disabled={blocked || isGenerating}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${active ? `${meta.headerBg} ${meta.headerText}` : blocked || isGenerating ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Version B</span>
              </div>
            </div>

            {/* Two preview columns — stack on mobile, side-by-side from md up */}
            <div className="flex-1 overflow-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700 min-h-0">
              {/* Column A */}
              <div className="overflow-visible md:overflow-hidden flex flex-col p-4 min-h-0">
                {colA.phase === 'idle' && <EmptyCol mode={modeA} />}
                {colA.phase === 'generating' && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10">
                    <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                    <div className="text-center">
                      <p className="font-semibold text-sm text-indigo-700 dark:text-indigo-300">Generating {MODE_META[modeA].label}…</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 justify-center">
                        <Clock className="h-3 w-3" />{fmtElapsed(Date.now() - colA.startedAt)}
                      </p>
                    </div>
                  </div>
                )}
                {colA.phase === 'error' && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 p-6">
                    <p className="font-semibold text-sm text-red-600 dark:text-red-400">Generation failed</p>
                    <p className="text-xs text-red-500 text-center">{colA.message}</p>
                    <button onClick={runGeneration} className="text-xs px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200">Retry</button>
                  </div>
                )}
                {colA.phase === 'done' && (
                  <PreviewPane cvData={colA.cv} label={`${MODE_META[modeA].emoji} ${MODE_META[modeA].label} — Version A`} mode={modeA} elapsedMs={colA.elapsedMs} onUse={() => { onSelectSaved(colA.cv); onClose(); }} />
                )}
              </div>

              {/* Column B */}
              <div className="overflow-visible md:overflow-hidden flex flex-col p-4 min-h-0">
                {colB.phase === 'idle' && <EmptyCol mode={modeB} />}
                {colB.phase === 'generating' && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10">
                    <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                    <div className="text-center">
                      <p className="font-semibold text-sm text-indigo-700 dark:text-indigo-300">Generating {MODE_META[modeB].label}…</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 justify-center">
                        <Clock className="h-3 w-3" />{fmtElapsed(Date.now() - colB.startedAt)}
                      </p>
                    </div>
                  </div>
                )}
                {colB.phase === 'error' && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 p-6">
                    <p className="font-semibold text-sm text-red-600 dark:text-red-400">Generation failed</p>
                    <p className="text-xs text-red-500 text-center">{colB.message}</p>
                    <button onClick={runGeneration} className="text-xs px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200">Retry</button>
                  </div>
                )}
                {colB.phase === 'done' && (
                  <PreviewPane cvData={colB.cv} label={`${MODE_META[modeB].emoji} ${MODE_META[modeB].label} — Version B`} mode={modeB} elapsedMs={colB.elapsedMs} onUse={() => { onSelectSaved(colB.cv); onClose(); }} />
                )}
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-6 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Both CVs are generated in parallel from your current profile
                {jd ? ' and job description' : ''}. Click <span className="font-semibold text-indigo-600 dark:text-indigo-400">"Use this CV"</span> on the version you prefer to load it into the editor.
              </p>
            </div>
          </div>
        )}

        {/* ── ATS & Quality tab ───────────────────────────────────────────── */}
        {tab === 'ats' && (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {/* Saved CV picker */}
            <div className="px-6 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/30 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-2">Compare current CV against:</p>
              {savedCVs.length === 0 ? (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                  No saved CVs yet. Save a CV in the generator to build versions to compare, or use the "Generate Modes" tab to compare two freshly generated CVs.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedCVs.map(s => {
                    const sData = getCVDataCached(s.id) ?? s.data;
                    const title = s.name || sData?.experience?.[0]?.jobTitle || 'Untitled';
                    const emoji = PURPOSE_EMOJI[s.purpose] ?? '📄';
                    const date = new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${s.id === selectedId ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 hover:text-violet-700 dark:hover:text-violet-400'}`}
                      >
                        {emoji} {title}<span className="ml-1.5 opacity-60">{date}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Two-column scores */}
            {!hasJd && (
              <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
                💡 Paste a job description in the generator to also see ATS keyword coverage scores.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-700 flex-1">
              <CvColumn label="Current CV" sublabel="Being edited now" quality={qualityA} ats={atsA} exclusiveMatches={exclusiveA} isWinner={aWins} hasJd={hasJd} />
              {selectedSaved && qualityB ? (
                <CvColumn
                  label={selectedSaved.name || resolvedSelectedData?.experience?.[0]?.jobTitle || 'Saved CV'}
                  sublabel={`${PURPOSE_EMOJI[selectedSaved.purpose] ?? '📄'} ${selectedSaved.purpose} · ${new Date(selectedSaved.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
                  quality={qualityB} ats={atsB} exclusiveMatches={exclusiveB} isWinner={bWins} hasJd={hasJd}
                  actionLabel="Switch to this version"
                  onAction={() => { if (resolvedSelectedData) { onSelectSaved(resolvedSelectedData); onClose(); } }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <AlertTriangle className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-neutral-400 dark:text-neutral-500">Select a saved CV above to see the comparison.</p>
                </div>
              )}
            </div>

            {/* Footer tip */}
            <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-800/20 shrink-0">
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">✦ Only in this version</span> chips show keywords a version covers that the other misses — the decisive ATS signal.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
