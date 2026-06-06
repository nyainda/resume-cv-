
import React, { useState, useCallback, ChangeEvent, useMemo, useRef, useEffect } from 'react';
import { UserProfile, CVData, TemplateName, FontName, fontDisplayNames, templateDisplayNames, JobAnalysisResult, CVGenerationMode, cvGenerationModes, ScholarshipFormat, scholarshipFormats, SavedCV, SidebarSectionsVisibility, DEFAULT_SIDEBAR_SECTIONS, SIDEBAR_TEMPLATES } from '../types';
import { generateCV, generateCoverLetter, extractProfileTextFromFile, scoreCV, improveCV, CVScore } from '../services/geminiService';
import { buildCVDeterministically } from '../services/cvDeterministicAssembler';
import { auditCvQuality } from '../services/cvNumberFidelity';
import { purifyCV, enforceTenseConsistency } from '../services/cvPurificationPipeline';
import type { PurifyLeak } from '../services/cvPurificationPipeline';
import { auditStyleGovernance } from '../services/cvStyleGovernance';
import { getCachedBannedPhrases } from '../services/cvEngineClient';
import type { BannedEntry } from '../services/cvEngineClient';
import { getLastAiEngine, PROVIDER_TRYING_EVENT } from '../services/groqService';
import type { ProviderTryingPayload } from '../services/groqService';
import { conductMarketResearch, detectRoleAndIndustry, MarketResearchResult } from '../services/marketResearch';
import { scoreCVCompleteness } from '../utils/cvCompleteness';
import { downloadCV } from '../services/cvDownloadService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CVPreview from './CVPreview';
import TemplateThumbnail from './TemplateThumbnail';
import CoverLetterPreview from './CoverLetterPreview';
import TemplateGallery from './TemplateGallery';
import JobAnalysis from './JobAnalysis';
import ShareCVModal from './ShareCVModal';
import AIImprovementPanel from './AIImprovementPanel';
import QualityIssuesPanel from './QualityIssuesPanel';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import { profileToCV } from '../utils/profileToCV';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Save, Download, RefreshCw, Edit, FileText, Sparkles, UploadCloud, CheckCircle, AlertTriangle, BookOpen, Briefcase, Globe, Wand2 } from './icons';
import CustomTemplateUploader from './CustomTemplateUploader';
import { loadCustomTemplates, saveCustomTemplate } from '../utils/customTemplateStorage';
import type { CustomTemplateEntry, CustomTemplateCustomizations } from '../types';
import CVGenerationProgress, { type GenerationStageId } from './CVGenerationProgress';
import DownloadProgressModal from './DownloadProgressModal';
import CVDoctorPanel from './CVDoctorPanel';
import { diffCV, CVDiff } from '../services/cvDoctorService';
import { DownloadGateModal, shouldGateDownload, incrementDownloadCount } from './DownloadGateModal';
import { useGoogleAuth } from '../auth/GoogleAuthContext';

const ACCENT_COLORS = [
  { hex: '#4f46e5', label: 'Indigo' },
  { hex: '#2563eb', label: 'Blue' },
  { hex: '#0d9488', label: 'Teal' },
  { hex: '#059669', label: 'Emerald' },
  { hex: '#7c3aed', label: 'Violet' },
  { hex: '#c8701a', label: 'Amber' },
  { hex: '#dc2626', label: 'Red' },
  { hex: '#be185d', label: 'Pink' },
  { hex: '#1a2f5a', label: 'Navy' },
  { hex: '#2e2510', label: 'Bronze' },
] as const;

/**
 * Converts any caught error into a short, user-readable string.
 * Respects the `isUserFacing` flag set by groqService/geminiService for
 * already-humanised messages (rate limits, quota, etc.).
 */
function friendlyError(err: unknown, action = 'complete that action'): string {
  if (err instanceof Error) {
    if ((err as any).isUserFacing) return err.message;
    const m = err.message.toLowerCase();
    if (m.includes('api key') || m.includes('invalid_api_key')) {
      return 'Invalid API key — please check your key in Settings.';
    }
    if (m.includes('rate') || m.includes('429')) {
      return 'Rate limit reached. Wait 30–60 seconds and try again.';
    }
    if (m.includes('quota') || m.includes('daily')) {
      return 'Daily AI limit reached. Usage resets at midnight UTC.';
    }
    if (m.includes('503') || m.includes('overload') || m.includes('unavailable')) {
      return 'The AI service is temporarily overloaded. Please try again in a few seconds.';
    }
    // Truncate raw tech messages but keep them readable
    const clean = err.message.replace(/^Groq \d+:\s*/i, '').replace(/\{[\s\S]*\}/, '').trim();
    return clean.length > 0
      ? `Could not ${action}: ${clean.substring(0, 140)}${clean.length > 140 ? '…' : ''}`
      : `Could not ${action}. Please try again.`;
  }
  return `Could not ${action}. Please try again.`;
}


const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

interface CVGeneratorProps {
  userProfile: UserProfile;
  currentCV: CVData | null;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  onSaveCV: (cvData: CVData, purpose: 'job' | 'academic' | 'general') => void;
  onAutoTrack: (details: { roleTitle: string, company: string, savedCvName: string }) => void;
  apiKeySet: boolean;
  openSettings: () => void;
  savedCVs?: SavedCV[];
  /** Called when user clicks "Apply via Email" — passes the JD + generated CV */
  onApplyViaEmail?: (jd: string, cv: CVData) => void;
  /** Optional suggestions from the CV Toolkit Checker — shown as a dismissible banner */
  toolkitSuggestions?: string | null;
  /** Called when user dismisses the toolkit suggestions banner */
  onDismissToolkitSuggestions?: () => void;
  /** Called when the user saves STAR+R interview stories from the job analysis */
  onSaveStories?: (stories: import('../types').STARStory[]) => void;
  /** Called when user clicks "Interview Prep" — passes the JD to pre-fill the prep tool */
  onGoToInterviewPrep?: (jd: string) => void;
  /** Reset the current CV's experience bullets back to the raw profile text (undo AI generation) */
  onRestoreProfileBullets?: () => void;
  /**
   * When true, the generator shows a dismissible "Import Quality Report" panel
   * with completeness score and deterministic quality checks — no AI required.
   * Pass a fresh Date timestamp string each time to re-trigger the panel.
   */
  importedFromJson?: string;
}

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });
};

// A color map for the three modes
const modeColorMap: Record<CVGenerationMode, {
  ring: string; bg: string; text: string; badge: string; badgeBg: string; glow: string;
  barFill: string; selectedBorder: string; headerBg: string; headerText: string;
}> = {
  honest: {
    ring: 'ring-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'text-emerald-800 dark:text-emerald-200',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    glow: 'shadow-emerald-500/20',
    barFill: 'bg-emerald-500',
    selectedBorder: 'border-emerald-400 dark:border-emerald-600',
    headerBg: 'bg-emerald-600',
    headerText: 'text-emerald-100',
  },
  boosted: {
    ring: 'ring-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'text-blue-800 dark:text-blue-200',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
    glow: 'shadow-blue-500/20',
    barFill: 'bg-blue-500',
    selectedBorder: 'border-blue-400 dark:border-blue-600',
    headerBg: 'bg-blue-600',
    headerText: 'text-blue-100',
  },
  aggressive: {
    ring: 'ring-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-300',
    badge: 'text-orange-800 dark:text-orange-200',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/40',
    glow: 'shadow-orange-500/20',
    barFill: 'bg-orange-500',
    selectedBorder: 'border-orange-400 dark:border-orange-600',
    headerBg: 'bg-orange-600',
    headerText: 'text-orange-100',
  },
};

type CVPurpose = 'job' | 'academic' | 'general';

const purposeConfig: Record<CVPurpose, { label: string; icon: React.FC<any>; color: string; description: string }> = {
  job: {
    label: 'Job Application',
    icon: Briefcase,
    color: 'indigo',
    description: 'Paste a JD → get Match Score, Skill Gaps, STAR Stories, Salary Research & Interview Prep. Auto ATS-optimised.',
  },
  general: {
    label: 'General Purpose',
    icon: Globe,
    color: 'violet',
    description: 'A strong all-purpose CV — no job description needed.',
  },
  academic: {
    label: 'Grant / Scholarship',
    icon: BookOpen,
    color: 'teal',
    description: 'Academic CV for scholarships, fellowships, and research grants.',
  },
};

const CVGenerator: React.FC<CVGeneratorProps> = ({ userProfile, currentCV, setCurrentCV, onSaveCV, onAutoTrack, apiKeySet, openSettings, onApplyViaEmail, savedCVs = [], toolkitSuggestions, onDismissToolkitSuggestions, onSaveStories, onGoToInterviewPrep, onRestoreProfileBullets, importedFromJson }) => {
  const { isAuthenticated } = useGoogleAuth();
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [jobDescription, setJobDescription] = useLocalStorage<string>('jobDescription', '');
  const [targetCompany, setTargetCompany] = useLocalStorage<string>('cv:targetCompany', '');
  const [targetJobTitle, setTargetJobTitle] = useLocalStorage<string>('cv:targetJobTitle', '');
  const forceFreshRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Generating...');
  // Stage-based progress tracking — used by the CVGenerationProgress modal
  // alongside the legacy loadingMessage string (kept so other call sites still
  // work). `activeStageIds` is the subset of stages that will actually run for
  // THIS generation (e.g. "research" only when market research is reachable;
  // "scoring" only when there's a job description).
  const [progressStage, setProgressStage] = useState<GenerationStageId | null>(null);
  const [progressDone, setProgressDone] = useState<GenerationStageId[]>([]);
  const [progressActiveIds, setProgressActiveIds] = useState<GenerationStageId[]>([]);
  const [progressRetryNotice, setProgressRetryNotice] = useState<string | null>(null);
  // Post-generation ATS re-score — computed instantly after each generation to
  // show how many gap terms the AI successfully incorporated vs how many remain.
  const [postGenGapResult, setPostGenGapResult] = useState<{
    before: number; closed: number; after: number;
  } | null>(null);

  // CV Diversity Score — instant zero-cost freshness metric.
  // Compares the new CV's summary words + bullet openers against the previous
  // generation's snapshot (localStorage). 100 = completely different, 0 = identical.
  // null = first ever generation (no prior snapshot to compare).
  const [cvDiversityScore, setCvDiversityScore] = useState<number | null>(null);
  const advanceStage = useCallback((next: GenerationStageId, message: string) => {
    setProgressStage(prev => {
      if (prev && prev !== next) {
        setProgressDone(d => (d.includes(prev) ? d : [...d, prev]));
      }
      return next;
    });
    setLoadingMessage(message);
  }, []);
  const resetProgress = useCallback(() => {
    setProgressStage(null);
    setProgressDone([]);
    setProgressActiveIds([]);
    setProgressRetryNotice(null);
  }, []);

  // ── Progressive streaming draft ─────────────────────────────────────────────
  // Sections appear here as soon as the Worker responds (before quality polish).
  // Cleared when the final polished CV is committed via setCurrentCV.
  const [draftCV, setDraftCV] = useState<Partial<CVData> | null>(null);
  // Used to cancel stale progressive-reveal animations when a second generation
  // fires before the first one finishes painting the draft CV section-by-section.
  const revealGenIdRef = useRef(0);

  const revealDraftProgressively = useCallback(async (raw: Partial<CVData>) => {
    const myGenId = ++revealGenIdRef.current;
    const isStale = () => revealGenIdRef.current !== myGenId;

    // Seed with summary + empty arrays so the CV skeleton appears immediately
    setDraftCV({ summary: raw.summary ?? '', skills: [], experience: [], education: [] });
    await new Promise(r => setTimeout(r, 280));
    if (isStale()) return;
    // Skills
    setDraftCV(prev => prev ? { ...prev, skills: raw.skills ?? [] } : prev);
    await new Promise(r => setTimeout(r, 320));
    if (isStale()) return;
    // Education
    setDraftCV(prev => prev ? { ...prev, education: raw.education ?? [] } : prev);
    // Experience roles one by one (most content-rich section — feels like streaming)
    const roles = raw.experience ?? [];
    for (let i = 0; i < roles.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      if (isStale()) return;
      const slice = roles.slice(0, i + 1);
      setDraftCV(prev => prev ? { ...prev, experience: slice } : prev);
    }
    // Projects last
    if (raw.projects && raw.projects.length > 0) {
      await new Promise(r => setTimeout(r, 300));
      if (isStale()) return;
      setDraftCV(prev => prev ? { ...prev, projects: raw.projects } : prev);
    }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useLocalStorage<TemplateName>('template', 'professional');
  const [customTemplateId, setCustomTemplateId] = useState<string | null>(null);
  const [showTemplateUploader, setShowTemplateUploader] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateEntry[]>(() => loadCustomTemplates());
  // Sidebar Section Picker — persists user's choice of which auto-generated
  // sidebar fillers (Key Achievements, Selected Projects, References) are
  // visible. Only takes effect for templates listed in SIDEBAR_TEMPLATES.
  const [sidebarSections, setSidebarSections] = useLocalStorage<SidebarSectionsVisibility>('sidebarSections', DEFAULT_SIDEBAR_SECTIONS);
  const [font, setFont] = useLocalStorage<FontName>('cvFont', 'lora');
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [generationMode, setGenerationMode] = useLocalStorage<CVGenerationMode>('generationMode', 'honest');
  const [cvPurpose, setCvPurpose] = useLocalStorage<CVPurpose>('cv:purpose', 'job');
  const [scholarshipFormat, setScholarshipFormat] = useLocalStorage<ScholarshipFormat>('scholarshipFormat', 'standard');
  const [atsDataEmbedded, setAtsDataEmbedded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  // Tight wrapper around <CVPreview> with NO outer chrome (no padding, no
  // borders, no margins). This is what we hand to `downloadCV()` as the
  // capture container so the editor download is byte-for-byte identical to
  // the Share download (which uses the same data-cv-preview-active pattern).
  // Keeping this separate from `previewRef` (which carries editor-only chrome
  // like the top border + padding used for visual separation) prevents that
  // chrome from leaking into the captured PDF.
  const cvCaptureRef = useRef<HTMLDivElement>(null);
  const [cvScore, setCvScore] = useState<CVScore | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizingProvider, setOptimizingProvider] = useState<string | null>(null);
  const [optimizeStage, setOptimizeStage] = useState<'analysing' | 'improving' | 'polishing' | 'scoring' | null>(null);
  const [isScoringCV, setIsScoringCV] = useState(false);
  const [showDoctorPanel, setShowDoctorPanel] = useLocalStorage<boolean>('cv:doctorPanelOpen', false);
  const [optimizeDiff, setOptimizeDiff] = useLocalStorage<CVDiff | null>('cv:doctorDiff', null);

  // Leaks produced by the purification pipeline during the most recent generation.
  // Accumulates synonym_sub fixes so the quality panel can display them.
  const [purifyLeaks, setPurifyLeaks] = useState<PurifyLeak[]>([]);

  // Live, deterministic quality audit. Recomputes only when currentCV changes.
  // Pure regex, runs in <5 ms, never hits the network.
  const qualityReport = useMemo(() => {
    if (!currentCV) return null;
    try {
      return auditCvQuality(currentCV as any);
    } catch {
      return null;
    }
  }, [currentCV]);

  const handleFixImportIssues = useCallback(async () => {
    if (!currentCV) return;
    setIsFixingIssues(true);
    setFixSummary(null);
    try {
      // Step 1 — run deterministic purification pipeline (local rules, zero AI):
      // tense enforcement, banned phrase substitution, first-person removal,
      // duplicate bullet pruning, instruction-leak stripping, and more.
      const { cv: purified, report } = purifyCV(currentCV);

      // Step 2 — apply extra banned phrases from the worker's D1/KV store.
      // This is a pure data read — no AI, no LLM, just a list of phrases and
      // their replacements stored in Cloudflare D1 by the CV engine team.
      let remoteFixes = 0;
      let cvAfterRemote = purified;
      try {
        const remoteBanned: BannedEntry[] | null = await getCachedBannedPhrases();
        if (remoteBanned && remoteBanned.length > 0) {
          // Build one big replacement function that scans all text fields.
          const applyToText = (text: string): { text: string; count: number } => {
            let result = text;
            let count = 0;
            for (const entry of remoteBanned) {
              if (!entry.phrase) continue;
              const escaped = entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const re = new RegExp(`\\b${escaped}\\b`, 'gi');
              const replacement = entry.replacement ?? '';
              const replaced = result.replace(re, (match) => {
                // Preserve original capitalisation if the replacement is lower-case
                const rep = replacement || '';
                if (rep && match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
                  return rep.charAt(0).toUpperCase() + rep.slice(1);
                }
                return rep;
              });
              if (replaced !== result) {
                count += (result.match(re) ?? []).length;
                result = replaced;
              }
            }
            return { text: result, count };
          };

          const applyToArray = (arr: string[]): { arr: string[]; count: number } => {
            let count = 0;
            const out = arr.map(s => {
              const { text, count: c } = applyToText(s);
              count += c;
              return text;
            });
            return { arr: out, count };
          };

          let totalRemote = 0;
          const { text: newSummary, count: sc } = applyToText(cvAfterRemote.summary || '');
          totalRemote += sc;

          const newExperience = cvAfterRemote.experience?.map(role => {
            const { arr, count } = applyToArray(role.responsibilities || []);
            totalRemote += count;
            return { ...role, responsibilities: arr };
          }) ?? [];

          const newProjects = cvAfterRemote.projects?.map(p => {
            const { text, count } = applyToText(p.description || '');
            totalRemote += count;
            return { ...p, description: text };
          }) ?? [];

          cvAfterRemote = {
            ...cvAfterRemote,
            summary: newSummary,
            experience: newExperience,
            projects: newProjects,
          };
          remoteFixes = totalRemote;
        }
      } catch {
        // Worker unavailable — that's fine, local fixes still applied.
      }

      const totalFixed = (report.substitutionsMade || 0) + (report.polishFixes || 0)
        + (report.bulletsTenseFlipped || 0) + (report.skillsDeduped || 0)
        + (report.leaks?.filter(l => l.fixedBy && l.fixedBy !== 'none').length || 0)
        + remoteFixes;

      setCurrentCV(cvAfterRemote);
      setPurifyLeaks(report.leaks ?? []);
      setFixSummary({ total: totalFixed, remote: remoteFixes });
    } finally {
      setIsFixingIssues(false);
    }
  }, [currentCV, setCurrentCV]);

  const handleDownloadQualityReport = useCallback(() => {
    if (!currentCV || !qualityReport) return;
    const synonymFixes = purifyLeaks.filter(l => l.fixedBy === 'synonym_sub');
    const atsReport = jobDescription.trim() ? scoreAtsCoverage(currentCV, jobDescription) : null;
    const payload = {
      auditedAt: new Date().toISOString(),
      cvSnapshot: {
        summary: currentCV.summary,
        skillCount: currentCV.skills?.length ?? 0,
        experienceRoleCount: currentCV.experience?.length ?? 0,
        projectCount: currentCV.projects?.length ?? 0,
      },
      report: qualityReport,
      atsKeywordCoverage: atsReport
        ? {
            score: atsReport.score,
            matched: atsReport.matched,
            missing: atsReport.missing,
            totalKeywords: atsReport.keywords.length,
          }
        : null,
      pipelineAutoFixes: {
        synonymSubstitutions: synonymFixes.length,
        detail: synonymFixes.map(l => ({
          word: l.phrase,
          location: l.fieldLocation ?? null,
          context: l.contextSnippet ?? null,
        })),
      },
      legend: {
        score: '0-100, higher is better. 100 = no orphan symbols, no stub bullets, no passive voice, no repeated leading verbs.',
        achievementDensity: 'Informational only (does not affect score). Shows what % of experience bullets contain at least one measurable number or metric.',
        atsKeywordCoverage: 'Informational only (does not affect score). Null when no job description was provided. Lists which JD keywords were found in the CV and which are missing.',
        pipelineAutoFixes: 'Words the purification pipeline replaced with synonyms before you saw the CV. These are already fixed -- no action needed.',
        kinds: {
          orphan_currency_comma: 'A currency code (KES, $, EUR) was followed by a stray comma -- usually a stripped number.',
          orphan_currency_word: 'A preposition was followed by a currency code with no number after it.',
          orphan_percent: 'A "%" sign appeared without a leading digit.',
          orphan_plus: 'A "+" appeared between words instead of after a number.',
          orphan_hyphen_noun: 'An article was followed by "-noun" (e.g. "a -person team").',
          orphan_dollar: 'A "$" was followed by a word instead of a number.',
          stub_bullet: 'A bullet started with a preposition (by, of, with, from, ...).',
          empty_bullet: 'A bullet was empty or whitespace-only.',
          duplicate_adjacent_word: 'Two identical words appeared back-to-back.',
          mid_sentence_period: 'A period was followed by a lowercase word.',
          passive_voice: 'A bullet used passive voice ("was implemented", "were managed"). Rewrite with an active verb.',
          leading_verb_repetition: '3 or more bullets in the same role start with the same verb. Vary the opening verb.',
        },
      },
    };
    const firstRoleTitle = currentCV.experience?.[0]?.jobTitle || 'cv';
    const safeName = String(firstRoleTitle).replace(/[^a-z0-9-_]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'cv';
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-quality-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentCV, qualityReport, purifyLeaks, jobDescription]);

  const [targetLanguage, setTargetLanguage] = useLocalStorage<string>('cv:targetLanguage', 'English');

  const [coverLetter, setCoverLetter] = useLocalStorage<string | null>('coverLetter', null);
  const [streamingLetter, setStreamingLetter] = useState('');
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);

  const [showShareModal, setShowShareModal] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [showImportReport, setShowImportReport] = useState(false);
  const [isFixingIssues, setIsFixingIssues] = useState(false);
  const [fixSummary, setFixSummary] = useState<{ total: number; remote: number } | null>(null);
  const [jdTier1Keywords, setJdTier1Keywords] = useLocalStorage<string[]>('cv:jdKeywords', []);

  // ── Active AI engine (shown as badge after generation) ──
  const [lastEngine, setLastEngine] = useState<string | null>(null);

  // ── Auto-scroll to template preview after generation ──
  const [justGenerated, setJustGenerated] = useState(false);
  useEffect(() => {
    if (justGenerated && currentCV && previewRef.current) {
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      setJustGenerated(false);
    }
  }, [justGenerated, currentCV]);

  const handleApplyTemplate = useCallback(() => {
    const cvData = profileToCV(userProfile);
    setCurrentCV(cvData);
    setError(null);
    setCoverLetter(null);
    setAtsDataEmbedded(false);
  }, [userProfile, setCurrentCV, setCoverLetter]);

  // Show import quality report whenever a JSON import is triggered from parent
  useEffect(() => {
    if (importedFromJson) {
      setShowImportReport(true);
      // Scroll to preview after a short delay
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [importedFromJson]);

  // JD is required only for job mode
  const jdRequired = cvPurpose === 'job';
  const jdOptional = cvPurpose === 'academic'; // optional for scholarship, not needed for general

  const handleGenerateCV = useCallback(async () => {
    if (!apiKeySet) {
      setError("The CV Engine is not reachable right now. Please check your connection and try again.");
      return;
    }
    if (jdRequired && !jobDescription.trim()) {
      setError(`Please paste a job description to generate a job-targeted CV.`);
      return;
    }
    setIsLoading(true);
    setDraftCV(null);
    setError(null);
    setIsEditing(false);
    setCoverLetter(null);
    setAtsDataEmbedded(false);
    setCvScore(null);
    setPurifyLeaks([]);
    setPostGenGapResult(null);
    setCvDiversityScore(null);

    // Compute which stages are actually relevant for THIS run so the modal
    // only shows steps that will execute (no greyed-out "Scoring" when there
    // is no JD, no "Researching market" when we're in scholarship mode).
    const hasJD = jobDescription.trim().length > 0;
    const willScore = hasJD && cvPurpose === 'job';
    const activeIds: GenerationStageId[] = ['profile'];
    if (cvPurpose === 'job') activeIds.push('research');
    if (hasJD) activeIds.push('jd');
    activeIds.push('drafting', 'polishing');
    if (willScore) activeIds.push('scoring');
    setProgressActiveIds(activeIds);
    setProgressDone([]);
    setProgressRetryNotice(null);
    advanceStage('profile', 'Reading your profile…');

    // Phase 1 — Market research (silent fail)
    let marketResearch: MarketResearchResult | null = null;
    if (cvPurpose === 'job') {
      try {
        const { role } = detectRoleAndIndustry(userProfile, jobDescription);
        advanceStage('research', `Researching ${role} market & salary benchmarks…`);
        marketResearch = await conductMarketResearch(userProfile, jobDescription);
      } catch (err) {
        console.warn('[CVGenerator] Market research failed silently:', err);
      }
    }

    // ── Gap-pin pre-computation ────────────────────────────────────────────────
    // Deterministically score the CURRENT CV against the JD right now (zero
    // tokens, instant) so we know exactly which ATS keywords are missing.
    // These are passed to generateCV as `targetKeywords` so the AI is told
    // explicitly which gaps to bridge — making every generation tailored.
    const _gapKeywords: string[] | undefined =
      (hasJD && cvPurpose === 'job' && currentCV)
        ? scoreAtsCoverage(currentCV, jobDescription).missing
            .filter(kw => {
              const t = kw.trim();
              // Drop very short abbreviations like "GE" (2 chars) or "CV" (2 chars)
              // which are too ambiguous to inject verbatim and pollute the prompt.
              // Also always exclude the word "CV" itself — it is never a meaningful
              // ATS gap keyword (it refers to the document, not a skill).
              if (t.length <= 2) return false;
              if (t.toLowerCase() === 'cv') return false;
              return true;
            })
            .slice(0, 12)
        : undefined;

    // Helper — run one generation attempt and populate generatedData.
    // Smart path: when a CV already exists, audit it first and only fix what
    // is actually broken — avoids burning tokens on a full fresh generation
    // that might produce inconsistent sentence lengths or new content.
    const runGenerate = async (): Promise<CVData> => {
      const skipSmartPath = forceFreshRef.current;
      forceFreshRef.current = false; // consume the flag immediately
      // ── Smart regenerate path ─────────────────────────────────────────────
      if (currentCV && !skipSmartPath) {
        advanceStage('drafting', 'Auditing existing CV for quality issues…');
        await new Promise(r => setTimeout(r, 200));

        // Deterministic checks — zero AI cost, zero network calls
        const { changes: tenseChanges } = enforceTenseConsistency(currentCV);
        const { issues: styleIssues } = auditStyleGovernance(currentCV);
        const styleWarnings = styleIssues.filter(i => i.severity === 'warn');

        // Collect up to 6 most actionable violations as plain English instructions
        const violations: string[] = [
          ...tenseChanges.slice(0, 3),
          ...styleWarnings.slice(0, 3).map(i => i.detail),
        ];

        const hasGapKeywords = _gapKeywords && _gapKeywords.length > 0;

        if (violations.length === 0 && !hasGapKeywords) {
          // CV is already clean — light purify pass only, no AI needed
          advanceStage('polishing', 'CV is already high quality — applying final polish…');
          await new Promise(r => setTimeout(r, 300));
          const { cv: cleaned } = purifyCV(currentCV);
          return cleaned;
        }

        // Build a focused fix instruction — only what the audit found
        const fixParts: string[] = ['Fix ONLY these specific quality issues in the existing CV:'];
        violations.forEach(v => fixParts.push(`• ${v}`));
        if (hasGapKeywords) {
          fixParts.push(`• Weave these missing JD keywords in verbatim where they fit naturally: ${_gapKeywords!.join(', ')}.`);
        }
        fixParts.push(
          '\nKeep ALL content, facts, metrics, company names, dates, education, and structure exactly as-is.',
          'Do NOT rewrite sections that are not listed above.',
        );

        const issueCount = violations.length + (hasGapKeywords ? 1 : 0);
        advanceStage('polishing', `Fixing ${issueCount} quality issue${issueCount === 1 ? '' : 's'} in your CV…`);
        return improveCV(currentCV, userProfile.personalInfo, fixParts.join('\n'), jobDescription || undefined);
      }

      // ── Full generation path (first generate, no existing CV) ─────────────
      if (hasJD) {
        advanceStage(
          'jd',
          _gapKeywords?.length
            ? `Extracting JD keywords — targeting ${_gapKeywords.length} confirmed gap term${_gapKeywords.length === 1 ? '' : 's'}…`
            : 'Extracting job-description keywords & role signals…',
        );
        await new Promise(r => setTimeout(r, 400));
      }
      advanceStage('drafting', 'Drafting your tailored summary & bullets…');
      const data = await generateCV(
        userProfile, jobDescription, generationMode, cvPurpose, scholarshipFormat, marketResearch, targetLanguage,
        (report) => {
          const fixes = (report.leaks || []).filter(l => l.fixedBy === 'synonym_sub');
          if (fixes.length > 0) {
            setPurifyLeaks(prev => [...prev, ...fixes]);
          }
        },
        _gapKeywords,
        // Progressive draft callback — fires when raw Worker sections arrive,
        // before quality polishing. Reveals content in the background preview.
        (raw) => { revealDraftProgressively(raw); },
      );
      advanceStage('polishing', 'Polishing every line — capitals, punctuation, numbers…');
      await new Promise(r => setTimeout(r, 300));
      if (userProfile.references && userProfile.references.length > 0) {
        data.references = userProfile.references.map(ref => ({
          name: ref.name,
          title: ref.title,
          company: ref.company,
          email: ref.email,
          phone: ref.phone,
          relationship: ref.relationship,
        }));
      }
      return data;
    };

    let generatedData: CVData | null = null;
    try {
      generatedData = await runGenerate();
    } catch (firstErr: any) {
      // Auto-retry once for rate limits OR when both providers are temporarily unavailable
      const errMsg = (firstErr?.message || '').toLowerCase();
      const isRateLimit = firstErr?.status === 429 ||
        errMsg.includes('rate limit') ||
        errMsg.includes('rate_limit') ||
        errMsg.includes('unavailable') ||
        errMsg.includes('both groq') ||
        errMsg.includes('overload') ||
        errMsg.includes('try again');

      if (isRateLimit) {
        const waitSec: number = firstErr?.retryAfterSeconds ?? 45;
        for (let i = waitSec; i > 0; i--) {
          setProgressRetryNotice(`Provider is busy — retrying in ${i}s…`);
          setLoadingMessage(`Rate limited — retrying in ${i}s…`);
          await new Promise(r => setTimeout(r, 1000));
        }
        try {
          setProgressRetryNotice(null);
          advanceStage('drafting', 'Retrying CV generation…');
          generatedData = await runGenerate();
        } catch (retryErr) {
          setError(friendlyError(retryErr, 'generate your CV'));
          setIsLoading(false);
          setLoadingMessage('Generating...');
          resetProgress();
          return;
        }
      } else {
        setError(friendlyError(firstErr, 'generate your CV'));
        setIsLoading(false);
        setLoadingMessage('Generating...');
        resetProgress();
        return;
      }
    }

    if (generatedData) {
      setCurrentCV(generatedData);
      setDraftCV(null); // draft replaced by polished final version
      setLastEngine(getLastAiEngine());
      setJustGenerated(true);
      // Instant zero-cost re-score: compare the newly generated CV against the
      // same JD to measure how many of the pinned gap terms were incorporated.
      if (_gapKeywords && _gapKeywords.length > 0 && jobDescription.trim()) {
        const afterCount = Math.min(
          scoreAtsCoverage(generatedData, jobDescription).missing.length,
          _gapKeywords.length,
        );
        setPostGenGapResult({
          before: _gapKeywords.length,
          closed: Math.max(0, _gapKeywords.length - afterCount),
          after:  afterCount,
        });
      }
      // Instant zero-cost diversity score: Jaccard similarity vs previous generation.
      // Measures word-level freshness so users can see the variance system is working.
      // No API, no LLM — pure localStorage set arithmetic.
      setCvDiversityScore((() => {
        try {
          const SNAP_KEY = 'cv:last_snapshot';
          const summaryWords = (generatedData.summary || '').toLowerCase().split(/\W+/).filter(Boolean).slice(0, 60);
          const bulletOpeners = (generatedData.experience || []).flatMap(exp => {
            const bullets = Array.isArray(exp.responsibilities) ? exp.responsibilities : [];
            return bullets.map((b: string) => b.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
          });
          const currentSet = new Set([...summaryWords, ...bulletOpeners]);
          let score: number | null = null;
          const storedRaw = localStorage.getItem(SNAP_KEY);
          if (storedRaw) {
            const prevSet = new Set(JSON.parse(storedRaw) as string[]);
            const intersection = [...currentSet].filter(t => prevSet.has(t)).length;
            const union = new Set([...currentSet, ...prevSet]).size;
            score = Math.round((1 - (union === 0 ? 0 : intersection / union)) * 100);
          }
          localStorage.setItem(SNAP_KEY, JSON.stringify([...currentSet]));
          return score;
        } catch { return null; }
      })());
    }

    // Phase 3 — Auto-score against JD (job mode only, silent fail)
    if (generatedData && willScore) {
      try {
        advanceStage('scoring', 'Scoring CV against the job description…');
        const score = await scoreCV(generatedData, jobDescription);
        setCvScore(score);
      } catch {
        // silent — score card just won't appear
      }
    }

    // Mark whatever stage we ended on as done so the bar reaches 100 % before
    // the modal closes.
    setProgressDone(d => {
      const finalStage = willScore ? 'scoring' : 'polishing';
      return d.includes(finalStage) ? d : [...d, finalStage];
    });
    setProgressStage(null);
    // Tiny pause so the user sees the bar hit 100 % before the modal vanishes.
    await new Promise(r => setTimeout(r, 350));
    setIsLoading(false);
    setLoadingMessage('Generating...');
    resetProgress();
  }, [jobDescription, userProfile, setCurrentCV, generationMode, setCoverLetter, apiKeySet, openSettings, cvPurpose, scholarshipFormat, jdRequired, targetLanguage, advanceStage, resetProgress]);

  /**
   * Zero-LLM fallback: assembles a clean CV directly from the user's profile
   * data using the worker's D1 verb pools and banned-phrase cleaner.
   * Available when all AI providers are quota-exhausted or unreachable.
   */
  const handleBuildWithoutAI = useCallback(async () => {
    setError(null);
    setIsAssembling(true);
    try {
      const assembled = await buildCVDeterministically(userProfile, jobDescription || undefined);
      setCurrentCV(assembled);
      setJustGenerated(true);
    } catch (err) {
      setError(friendlyError(err, 'build your CV without AI'));
    } finally {
      setIsAssembling(false);
    }
  }, [userProfile, jobDescription, setCurrentCV]);

  // Track active AI provider during auto-optimize so the button label can show it.
  useEffect(() => {
    if (!isOptimizing) {
      setOptimizingProvider(null);
      return;
    }
    const onTrying = (e: Event) => {
      const { label, type } = (e as CustomEvent<ProviderTryingPayload>).detail;
      setOptimizingProvider(type === 'race' ? `Racing: ${label}` : label);
    };
    window.addEventListener(PROVIDER_TRYING_EVENT, onTrying);
    return () => window.removeEventListener(PROVIDER_TRYING_EVENT, onTrying);
  }, [isOptimizing]);

  // ── One-click score optimizer ────────────────────────────────────────────
  const handleAutoOptimize = useCallback(async () => {
    if (!currentCV || !cvScore) return;
    setIsOptimizing(true);
    setOptimizeStage('analysing');
    try {
      // Auto-Optimize runs two categories of fixes:
      //  A) STRUCTURAL — missing dates, fragmented summary, section clarity.
      //  B) STYLE & QUALITY — tense, openers, verb uniqueness, language.
      // Keyword injection and education rewrites are never touched.
      const scoreImprovements = (cvScore.improvements || []).filter(imp => {
        const lower = imp.toLowerCase();
        return !lower.includes('keyword') &&
               !lower.includes('education') &&
               !lower.includes('degree') &&
               !lower.includes('qualification') &&
               !lower.includes('certif');
      });

      const parts: string[] = [
        'Fix ALL of the following issues in the CV:',
        '',
        '=== STRUCTURAL FIXES (highest priority) ===',
        '• MISSING DATES: Every experience role MUST have a non-empty "dates" field formatted as "Mon YYYY – Mon YYYY" or "Mon YYYY – Present". If dates are missing or blank for any role (especially intern or junior roles), infer approximate dates from context (surrounding roles, education graduation year, or "Jan YYYY – Dec YYYY" for the most likely period). Never leave dates empty.',
        '• SUMMARY INTEGRITY: The professional summary must stand alone as clean prose. It must NOT end with a job title, company name, or role label — those belong in the experience section. If the summary bleeds into a role title, cut it off cleanly.',
        '• SECTION CLARITY: Ensure each experience role has this clear structure: (1) jobTitle line, (2) company + dates line, (3) an optional one-sentence scope/context line if needed, then (4) bullet points. Bullets must never start with the company name or repeat the job title.',
        '• SCOPE ANCHOR: the very first bullet of every role must state team size, budget, geographic scope, or project count — not an achievement. Rewrite only if missing. Use REAL numbers from the profile.',
        '',
        '=== STYLE & QUALITY FIXES ===',
        '• TENSE: current role (endDate "Present") bullets must use bare present tense — "Manage" not "Manages" or "Managed". Past role bullets must use simple past — "Managed" not "Manage".',
        '• OPENER ROTATION: no opener type should appear more than twice per role. Use all 7 types — verb, number ("[N] projects…"), scope ("For [N] clients…"), context ("As the sole engineer…"), timeframe ("Over [N] months…"), collaboration ("With the ops team…"), outcome ("Top performer in…"). Replace [N] with real profile values. Fix any role where one type dominates.',
        '• VERB UNIQUENESS: no two bullets anywhere in the document may start with the same verb stem. Rename duplicates to a distinct strong verb.',
        '• NO 3RD-PERSON VERBS: never start a bullet with "Manages", "Generates", "Prepares", "Engineers", etc. Use the bare imperative form.',
        '• REPEATED PHRASES: if any phrase of 4+ words appears in more than one bullet across the whole document, rewrite the second occurrence to use different wording — same meaning, different words.',
        '• SUMMARY ECHO: if a phrase from the professional summary also appears verbatim in a bullet, rephrase the bullet so they complement rather than repeat each other.',
        '• LANGUAGE: write in plain, direct CV language. Do NOT upgrade vocabulary to formal or academic English. Do NOT use words like "spearheaded", "leveraged", "orchestrated", "catalyzed", "utilized", or similar AI-sounding elevated language. Sound like a confident professional, not an AI assistant.',
        '• GRAMMAR: fix broken grammar (missing subjects, fragments, tense errors) but keep the language simple and direct.',
      ];

      if (scoreImprovements.length > 0) {
        parts.push(`\nAdditional fixes flagged by the score:\n${scoreImprovements.map(s => `• ${s}`).join('\n')}`);
      }

      parts.push(
        '\nSTRICT LIMITS — do NOT:',
        '• Touch the education section — return it exactly as received, word for word.',
        '• Add, remove, or reorder skills.',
        '• Inject keywords not already present in the CV.',
        '• Invent new achievements, metrics, or responsibilities.',
        '• Change company names or job titles.',
        '• Change or remove dates that are already present — only ADD dates where missing.',
      );

      const instruction = parts.join('\n');

      const beforeSnapshot = currentCV;
      const improved = await improveCV(
        currentCV,
        userProfile.personalInfo,
        instruction,
        jobDescription || undefined,
        undefined,
        (stage) => setOptimizeStage(stage),
      );
      setCurrentCV(improved);

      // Compute what changed and store for the diff panel
      const diff = diffCV(beforeSnapshot, improved);
      if (diff.totalChanges > 0) {
        setOptimizeDiff(diff);
        setShowDoctorPanel(true); // open doctor panel on the Changes tab automatically
      }

      // Re-score silently so the card updates
      if (jobDescription.trim()) {
        try {
          setOptimizeStage('scoring');
          const newScore = await scoreCV(improved, jobDescription);
          setCvScore(newScore);
        } catch { /* silent — old score stays */ }
      } else {
        setCvScore(null);
      }

      setJustGenerated(true); // scroll back to preview
    } catch (err: any) {
      // Surface error briefly in the score card header, don't lose the CV
      setCvScore(prev => prev ? { ...prev, verdict: `Optimization failed — ${err?.message?.substring(0, 80) ?? 'try again'}` } : prev);
    } finally {
      setIsOptimizing(false);
      setOptimizeStage(null);
    }
  }, [currentCV, cvScore, userProfile, jobDescription, setCurrentCV]);

  const handleGenerateCoverLetter = useCallback(async () => {
    if (!apiKeySet) {
      setCoverLetterError("The CV Engine is not reachable right now. Please check your connection and try again.");
      return;
    }
    if (!jobDescription.trim()) {
      setCoverLetterError("Please provide a job or grant description to generate a cover letter.");
      return;
    }
    setIsGeneratingCoverLetter(true);
    setCoverLetterError(null);
    setStreamingLetter('');
    setCoverLetter(null);
    try {
      const letter = await generateCoverLetter(
        userProfile,
        jobDescription,
        (delta) => setStreamingLetter(prev => prev + delta),
      );
      setCoverLetter(letter);
      setStreamingLetter('');
    } catch (err) {
      setStreamingLetter('');
      setCoverLetterError(friendlyError(err, 'generate your cover letter'));
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  }, [jobDescription, userProfile, setCoverLetter, apiKeySet, openSettings]);

  const handleFileUploads = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!apiKeySet) {
      setError("File uploads require a Gemini API key (for multimodal parsing). Please add it in Settings → AI Settings.");
      openSettings();
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setError(null);
    const extractedTexts: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setLoadingMessage(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
        const { base64, mimeType } = await fileToBase64(file);
        const extractedText = await extractProfileTextFromFile(base64, mimeType);
        extractedTexts.push(extractedText);
      }
      setJobDescription(prev => `${prev}\n\n${extractedTexts.join('\n\n---\n\n')}`.trim());
    } catch (err) {
      setError(friendlyError(err, 'process your files'));
    } finally {
      setIsLoading(false);
      setLoadingMessage('Generating...');
      if (event.target) event.target.value = '';
    }
  };

  const [scoreError, setScoreError] = useState<string | null>(null);

  const handleScoreCV = useCallback(async () => {
    if (!currentCV || !jobDescription.trim() || !apiKeySet) return;
    setIsScoringCV(true);
    setScoreError(null);
    try {
      const score = await scoreCV(currentCV, jobDescription);
      setCvScore(score);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Scoring failed — please try again.';
      setScoreError(msg);
      setTimeout(() => setScoreError(null), 6000);
    } finally {
      setIsScoringCV(false);
    }
  }, [currentCV, jobDescription, apiKeySet]);

  const pdfFileName = useMemo(() => {
    const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    const name = sanitize(userProfile.personalInfo.name).substring(0, 20);
    const companyPart = targetCompany ? `_${sanitize(targetCompany).substring(0, 20)}` : '';
    return `${name}${companyPart}_CV.pdf`;
  }, [userProfile.personalInfo.name, targetCompany]);

  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Captured at the end of a successful download so the progress modal can
  // display "Saved in X.Xs · cloud renderer" before auto-dismissing.
  const [downloadTotalMs, setDownloadTotalMs] = useState<number | null>(null);
  const [downloadVia, setDownloadVia] = useState<'playwright' | 'cloudflare' | null>(null);

  const executeDownload = useCallback(async () => {
    if (!currentCV) return;
    const jobTitle = targetJobTitle || currentCV.experience[0]?.jobTitle || 'New Role';
    const companyName = targetCompany || 'Unknown';

    setDownloadError(null);
    setDownloadTotalMs(null);
    setDownloadVia(null);
    setDownloadStatus('Preparing download…');
    try {
      // Single source of truth: render the live preview DOM via headless Chrome
      // (Playwright local → Cloudflare worker). What you see is what you get.
      // The HiddenATSKeywords component already lives inside the preview so the
      // job-description keywords are baked into the PDF automatically.
      const result = await downloadCV({
        fileName: pdfFileName,
        // Pass the tight capture wrapper explicitly — same pattern Share uses,
        // which the user confirmed produces a perfect WYSIWYG PDF. Without this
        // we'd fall back to auto-discovery and capture a different DOM subtree
        // that doesn't match the on-screen layout exactly.
        containerEl: cvCaptureRef.current,
        onStatus: (m) => setDownloadStatus(m),
      });

      if (result.ok) {
        setAtsDataEmbedded(jdTier1Keywords.length > 0);
        onAutoTrack({
          roleTitle: jobTitle,
          company: companyName,
          savedCvName: `Auto-Generated CV (${new Date().toLocaleDateString()})`,
        });
        // Switch the modal into success mode (green checkmark, "Ready in X.Xs")
        // and let it linger for a moment so the user sees the win before it
        // auto-dismisses. The modal also has a close button for instant
        // dismissal if they prefer.
        setDownloadTotalMs(result.totalMs ?? null);
        setDownloadVia(result.via ?? null);
        setDownloadStatus('PDF ready');
        await new Promise((r) => setTimeout(r, 2200));
        setDownloadStatus(null);
      } else {
        setDownloadStatus(null);
        setDownloadError(result.error || 'Download failed.');
      }
    } catch (err) {
      // Defensive: never leave the modal stuck open if the service throws
      // unexpectedly (e.g. network error before any onStatus is emitted).
      setDownloadStatus(null);
      setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    }
  }, [currentCV, targetCompany, targetJobTitle, onAutoTrack, pdfFileName, jdTier1Keywords.length]);

  const handleDownload = useCallback(() => {
    if (!currentCV) return;
    if (shouldGateDownload(isAuthenticated)) {
      setShowDownloadGate(true);
      setPendingDownload(true);
      return;
    }
    incrementDownloadCount();
    executeDownload();
  }, [currentCV, isAuthenticated, executeDownload]);

  const cvTextContent = useMemo(() => {
    if (!currentCV) return "";
    let text = currentCV.summary;
    text += currentCV.skills.join(' ');
    currentCV.experience.forEach(exp => {
      text += ` ${exp.jobTitle} ${exp.company} ${exp.responsibilities.join(' ')}`;
    });
    return text.toLowerCase();
  }, [currentCV]);

  // Render-time gap count — shows the user how many confirmed-missing ATS keywords
  // will be targeted BEFORE they click Generate. Recomputes whenever JD or CV changes.
  const previewGapCount = useMemo(() => {
    if (!currentCV || !jobDescription.trim() || cvPurpose !== 'job') return 0;
    return Math.min(scoreAtsCoverage(currentCV, jobDescription).missing.length, 12);
  }, [currentCV, jobDescription, cvPurpose]);

  const handleJobAnalysisComplete = useCallback((result: JobAnalysisResult) => {
    if (result.companyName) {
      setTargetCompany(result.companyName);
    }
    if (result.jobTitle) {
      setTargetJobTitle(result.jobTitle);
    }
    const tier1 = [...(result.keywords || []), ...(result.skills || [])]
      .map(k => (k || '').trim())
      .filter(Boolean);
    setJdTier1Keywords(Array.from(new Set(tier1)).slice(0, 15));
  }, []);

  const selectedMode = cvGenerationModes.find(m => m.id === generationMode)!;
  const modeColors = modeColorMap[generationMode];
  const selectedScholarshipFormat = scholarshipFormats.find(f => f.id === scholarshipFormat)!;

  // Resolve purpose label for preview badge
  const purposeLabel = cvPurpose === 'job'
    ? `Job CV · ${selectedMode.emoji} ${selectedMode.label}`
    : cvPurpose === 'general'
      ? '🌐 General Purpose CV'
      : `🎓 ${selectedScholarshipFormat.flag} ${selectedScholarshipFormat.label}`;
  const purposeBadgeBg = cvPurpose === 'job' ? modeColors.badgeBg : cvPurpose === 'general' ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-teal-100 dark:bg-teal-900/40';
  const purposeBadgeText = cvPurpose === 'job' ? modeColors.badge : cvPurpose === 'general' ? 'text-violet-800 dark:text-violet-200' : 'text-teal-800 dark:text-teal-200';

  return (
    <div className="space-y-8">
      {/* ── Generation progress overlay (modal, only while generating) ── */}
      <CVGenerationProgress
        isOpen={isLoading && progressActiveIds.length > 0}
        currentStage={progressStage}
        completedStages={progressDone}
        activeStageIds={progressActiveIds}
        statusMessage={loadingMessage}
        retryNotice={progressRetryNotice}
        hasDraft={!!draftCV}
      />
      {/* ── CV Toolkit Suggestions Banner ── */}
      {toolkitSuggestions && (
        <div className="bg-gradient-to-br from-violet-50 to-[#F8F7F4] dark:from-violet-900/20 dark:to-[#1B2B4B]/10 border border-violet-300 dark:border-violet-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-bold text-violet-900 dark:text-violet-100">CV Toolkit Feedback — Ready to Apply</span>
            </div>
            <p className="text-xs text-violet-700 dark:text-violet-300 whitespace-pre-line leading-relaxed">
              {toolkitSuggestions}
            </p>
            <button
              onClick={() => {
                const appended = jobDescription.trim()
                  ? `${jobDescription}\n\n${toolkitSuggestions}`
                  : toolkitSuggestions;
                setJobDescription(appended);
                onDismissToolkitSuggestions?.();
              }}
              className="mt-3 text-xs font-bold px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              ✓ Apply to Job Description &amp; Generate
            </button>
          </div>
          <button
            onClick={onDismissToolkitSuggestions}
            className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 text-xl leading-none p-1 flex-shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* === CV Completeness Bar === */}
      {(() => {
        const { percent, missing, grade } = scoreCVCompleteness(currentCV, userProfile);
        const gradeConfig = {
          weak:   { color: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',    label: 'Weak',   tip: 'Add more details to get started.' },
          fair:   { color: 'bg-amber-500',  text: 'text-amber-600 dark:text-amber-400', label: 'Fair',  tip: 'Good progress — keep going!' },
          good:   { color: 'bg-blue-500',   text: 'text-blue-600 dark:text-blue-400',   label: 'Good',  tip: 'Strong profile — nearly there.' },
          strong: { color: 'bg-emerald-500',text: 'text-emerald-600 dark:text-emerald-400', label: 'Strong', tip: 'Excellent! Your CV is highly complete.' },
        }[grade];
        return (
          <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Ring */}
            <div className="flex-shrink-0 flex items-center gap-3">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="5" className="text-zinc-200 dark:text-neutral-700" />
                  <circle
                    cx="28" cy="28" r="23" fill="none" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 23}`}
                    strokeDashoffset={`${2 * Math.PI * 23 * (1 - percent / 100)}`}
                    strokeLinecap="round"
                    className={`${gradeConfig.color.replace('bg-', 'text-')} transition-all duration-700`}
                    stroke="currentColor"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold text-zinc-800 dark:text-zinc-100">{percent}%</span>
              </div>
              <div>
                <p className={`text-sm font-bold ${gradeConfig.text}`}>{gradeConfig.label} CV</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{gradeConfig.tip}</p>
              </div>
            </div>
            {/* Missing fields */}
            {missing.length > 0 && (
              <div className="flex-1 border-t sm:border-t-0 sm:border-l border-zinc-200 dark:border-neutral-700 sm:pl-4 pt-3 sm:pt-0">
                <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">Missing to reach 100%</p>
                <div className="flex flex-wrap gap-1.5">
                  {missing.slice(0, 6).map(m => (
                    <span key={m} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300">{m}</span>
                  ))}
                  {missing.length > 6 && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-500">+{missing.length - 6} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* === STEP 1: Purpose Selector === */}
      <div className="bg-white dark:bg-neutral-800/50 p-6 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
        <div className="space-y-2 mb-6">
          <Label className="text-2xl font-bold">CV Customization</Label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose what type of CV you need, then configure below.</p>
        </div>

        {/* Purpose selector cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {(Object.entries(purposeConfig) as [CVPurpose, typeof purposeConfig[CVPurpose]][]).map(([key, cfg]) => {
            const isSelected = cvPurpose === key;
            const colorCls = {
              indigo: { ring: 'ring-[#C9A84C]', bg: 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/10', text: 'text-[#1B2B4B] dark:text-[#C9A84C]/80', border: 'border-[#C9A84C]/40 dark:border-[#1B2B4B]/40' },
              violet: { ring: 'ring-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-700' },
              teal: { ring: 'ring-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700' },
            }[cfg.color];
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setCvPurpose(key)}
                className={`
                  text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                  ${isSelected
                    ? `${colorCls.ring} ${colorCls.bg} ${colorCls.border} ring-2 shadow-md`
                    : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/40'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-5 w-5 ${isSelected ? colorCls.text : 'text-zinc-500'}`} />
                  <span className={`text-sm font-bold ${isSelected ? colorCls.text : 'text-zinc-800 dark:text-zinc-200'}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{cfg.description}</p>
              </button>
            );
          })}
        </div>

        {/* === SCHOLARSHIP FORMAT SELECTOR (Academic mode only) === */}
        {cvPurpose === 'academic' && (
          <div className="mb-6 p-5 rounded-xl bg-teal-50/70 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800">
            <div className="mb-3">
              <Label className="text-base font-semibold text-teal-800 dark:text-teal-200 block">Application Format</Label>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                Select the scholarship/grant format so the CV follows the expected structure for that programme.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {scholarshipFormats.map((fmt) => {
                const isSelected = scholarshipFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setScholarshipFormat(fmt.id)}
                    className={`
                      text-left p-3 rounded-lg border-2 transition-all duration-150
                      ${isSelected
                        ? 'border-teal-500 bg-white dark:bg-neutral-800 shadow-sm ring-1 ring-teal-400'
                        : 'border-zinc-200 dark:border-neutral-700 hover:border-teal-300 dark:hover:border-teal-700 bg-white dark:bg-neutral-800/40'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{fmt.flag}</span>
                      <span className={`text-xs font-bold ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-700 dark:text-zinc-300'}`}>{fmt.label}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">{fmt.description}</p>
                    {isSelected && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {fmt.keyFields.map(field => (
                          <span key={field} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium">{field}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* === JD / Grant Description Input === */}
        {cvPurpose !== 'general' && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <Label className="text-xl font-semibold">
                {cvPurpose === 'job' ? 'Job Description' : 'Grant / Scholarship Description'}
              </Label>
              {jdOptional && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">Optional — leave blank for a general academic CV</span>
              )}
            </div>

            <div className="mt-2 border-b border-zinc-200 dark:border-neutral-700">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => setInputMode('text')} className={`${inputMode === 'text' ? 'border-[#1B2B4B] text-[#1B2B4B]' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                  Paste Text
                </button>
                <button onClick={() => setInputMode('upload')} className={`${inputMode === 'upload' ? 'border-[#1B2B4B] text-[#1B2B4B]' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                  Upload Files
                </button>
              </nav>
            </div>

            {inputMode === 'text' ? (
              <Textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={
                  cvPurpose === 'job'
                    ? 'Paste the full job description here — the AI will auto-run a 6-block analysis: Match Score, Skill Gaps, Level Strategy, Salary Research & Interview Prep...'
                    : 'Paste the scholarship/grant call, requirements, or criteria here (or leave blank for general academic CV)...'
                }
                rows={10}
                className="mt-4"
                disabled={isLoading || isGeneratingCoverLetter}
              />
            ) : (
              <div className="mt-4 flex items-center justify-center w-full">
                <label htmlFor="file-upload" className={`flex flex-col items-center justify-center w-full h-48 border-2 border-zinc-300 border-dashed rounded-xl bg-zinc-50 dark:bg-neutral-800 dark:border-neutral-600 ${!apiKeySet ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors'}`}>
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                    <UploadCloud className="w-8 h-8 mb-4 text-zinc-500 dark:text-zinc-400" />
                    <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400"><span className="font-semibold">Click to upload files</span> or drag and drop</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">PDF, DOCX, PNG, JPG, etc.</p>
                  </div>
                  <input id="file-upload" type="file" className="hidden" multiple accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" onChange={handleFileUploads} disabled={!apiKeySet} />
                </label>
              </div>
            )}

            {error && (() => {
              // Detect quota/rate-limit errors — offer the deterministic fallback.
              const isQuotaError = /quota|daily|rate.?limit|overload|unavailable|all providers|exhausted/i.test(error);
              return (
                <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  {isQuotaError && (
                    <div className="mt-2 flex items-start gap-3">
                      <button
                        onClick={handleBuildWithoutAI}
                        disabled={isAssembling || isLoading}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                      >
                        {isAssembling ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                            </svg>
                            Building…
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
                            </svg>
                            Build without AI
                          </>
                        )}
                      </button>
                      <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 leading-snug">
                        Uses your real profile data — zero AI calls. Cleans weak openers, deduplicates skills, and applies strong action verbs from our verb database.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            {!apiKeySet && inputMode === 'upload' && <p className="text-amber-600 text-sm mt-2">Please set your API key in settings to enable file uploads.</p>}

            {/* Market research hint — shown when JD is blank in academic mode */}
            {cvPurpose === 'academic' && inputMode === 'text' && !jobDescription.trim() && (
              <p className="mt-2 text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                No description? We'll automatically research current market trends for your field before generating.
              </p>
            )}

            {cvPurpose === 'job' && (
              <JobAnalysis
                jobDescription={jobDescription}
                cvTextContent={cvTextContent}
                apiKeySet={apiKeySet}
                onAnalysisComplete={handleJobAnalysisComplete}
                onSaveStories={onSaveStories}
                currentCV={currentCV}
                onCVUpdate={(updated) => setCurrentCV(updated)}
              />
            )}
          </div>
        )}

        {/* General mode info banner */}
        {cvPurpose === 'general' && (
          <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800 flex items-start gap-3">
            <Globe className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">No job description needed</p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                We'll automatically research current market trends for your field before generating — then craft a powerful, well-rounded CV that works across industries. Great for cold applications, LinkedIn optimization, and networking.
              </p>
            </div>
          </div>
        )}

        {/* === GENERATION MODE SELECTOR (Job mode only) === */}
        {cvPurpose === 'job' && (
          <div className="mt-8">
            <div className="mb-4">
              <Label className="text-base font-semibold block">Writing Style</Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Choose how your CV is written. Your facts never change.</p>
            </div>
            <div className="space-y-2.5">
              {cvGenerationModes.map((mode) => {
                const isSelected = generationMode === mode.id;
                const colors = modeColorMap[mode.id];
                const intensity = mode.id === 'honest' ? 1 : mode.id === 'boosted' ? 2 : 3;
                const riskLabel = mode.id === 'boosted' ? 'Review output' : mode.id === 'aggressive' ? 'Review carefully' : null;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setGenerationMode(mode.id)}
                    className={`
                      w-full text-left rounded-xl border-2 overflow-hidden transition-all duration-200 cursor-pointer group
                      ${isSelected
                        ? `${colors.selectedBorder} ${colors.bg} shadow-md ${colors.glow}`
                        : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/40'
                      }
                    `}
                  >
                    <div className="flex items-stretch">
                      {/* Left accent bar */}
                      <div className={`w-1 flex-shrink-0 ${isSelected ? colors.barFill : 'bg-zinc-200 dark:bg-neutral-700'} transition-colors`} />

                      <div className="flex items-center gap-4 px-4 py-3.5 flex-1 min-w-0">
                        {/* Intensity dots */}
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {[3, 2, 1].map(bar => (
                            <div
                              key={bar}
                              className={`w-2 h-2 rounded-full transition-colors ${
                                bar <= intensity
                                  ? (isSelected ? colors.barFill : 'bg-zinc-300 dark:bg-neutral-500')
                                  : 'bg-zinc-100 dark:bg-neutral-700'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base leading-none">{mode.emoji}</span>
                            <span className={`text-sm font-bold ${isSelected ? colors.text : 'text-zinc-800 dark:text-zinc-200'}`}>
                              {mode.label}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isSelected ? `${colors.badgeBg} ${colors.badge}` : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400'}`}>
                              {mode.shortDesc}
                            </span>
                            {riskLabel && (
                              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${mode.id === 'aggressive' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                ⚠ {riskLabel}
                              </span>
                            )}
                            {isSelected && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badgeBg} ${colors.text} flex items-center gap-1`}>
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                                Active
                              </span>
                            )}
                          </div>
                          <p className={`text-xs mt-1 leading-relaxed ${isSelected ? colors.text + ' opacity-80' : 'text-zinc-500 dark:text-zinc-400'}`}>
                            {mode.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Warning for non-authentic modes */}
            {(generationMode === 'boosted' || generationMode === 'aggressive') && (
              <div className={`mt-3 p-3 rounded-lg border flex items-start gap-2.5 text-xs ${generationMode === 'aggressive'
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                }`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Heads up:</strong> {generationMode === 'aggressive'
                    ? 'Maximum mode makes bold editorial choices — structure, emphasis, and positioning will be significantly reworked. Always read the full output before submitting.'
                    : 'Enhanced mode strengthens your existing experience with bolder framing. Review the CV before submitting to ensure all phrasing feels true to you.'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Language selector */}
        <div className="mt-6 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">CV Language</span>
              <select
                value={targetLanguage}
                onChange={e => setTargetLanguage(e.target.value)}
                className="text-sm font-medium rounded-lg px-3 py-1.5 border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] cursor-pointer"
              >
                {['English','French','Spanish','German','Arabic','Portuguese','Italian','Dutch','Chinese (Simplified)','Japanese'].map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            {targetLanguage !== 'English' && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 text-[#1B2B4B] dark:text-[#C9A84C] border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 font-medium">
                CV will be generated in {targetLanguage}
              </span>
            )}
          </div>
        </div>

        {/* ── Action buttons row ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Use Template (no AI) — always available */}
          <div className="flex flex-col">
            <button
              onClick={handleApplyTemplate}
              disabled={isLoading}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
              title="Instantly apply your profile data to the selected template — no AI, no API key needed"
            >
              <FileText className="h-4 w-4 text-zinc-500" />
              Use Template Only
            </button>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 ml-1">Your existing data, no AI rewriting</p>
          </div>

          {/* AI Generate — full pipeline */}
          <Button onClick={handleGenerateCV} disabled={isLoading || isGeneratingCoverLetter || !apiKeySet} size="lg" className="sm:ml-auto">
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {loadingMessage}
              </>
            ) : <><Sparkles className="h-5 w-5 mr-2" />Build My CV</>}
          </Button>
        </div>

        {/* Hint text — below both buttons */}
        {!isLoading && (
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-2">
            Tailored to your job description · ready in ~30 seconds
          </p>
        )}

        {/* Badges row — gap analysis + engine indicator */}
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
          {/* Gap badge — two states:
               1. Pre-generation: "N gap terms will be targeted" (emerald, pre-run hint)
               2. Post-generation: delta showing how many were closed vs remaining */}
          {(() => {
            if (postGenGapResult) {
              const { before, closed, after } = postGenGapResult;
              const allClosed  = after === 0;
              const mostClosed = closed >= Math.ceil(before / 2);
              const colorCls   = allClosed  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                               : mostClosed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                               :              'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800';
              const dotCls     = allClosed || mostClosed ? 'bg-emerald-500' : 'bg-amber-500';
              const icon       = allClosed ? '✅' : mostClosed ? '✅' : '⚠️';
              const label      = allClosed
                ? `All ${before} gap term${before === 1 ? '' : 's'} incorporated`
                : `${closed}/${before} gap term${before === 1 ? '' : 's'} incorporated${after > 0 ? ` · ${after} still open` : ''}`;
              const tip = allClosed
                ? 'Every targeted ATS keyword now appears in your CV.'
                : `${closed} of the ${before} targeted keywords were incorporated. ${after} remain — try generating again to close more gaps.`;
              return (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${colorCls}`}
                     title={tip}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls} flex-shrink-0`} />
                  {icon} {label}
                </div>
              );
            }
            if (previewGapCount > 0) {
              return (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                     title="These ATS keywords appear in the JD but are missing from your current CV. The AI will specifically incorporate them in the next generation.">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  🎯 {previewGapCount} gap term{previewGapCount === 1 ? '' : 's'} will be targeted
                </div>
              );
            }
            return null;
          })()}

          {/* AI engine badge — shown after successful generation */}
          {lastEngine && (() => {
            const engineStyles: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
              'Workers AI': { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', icon: '⚡' },
              'Groq':       { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', icon: '⚡' },
              'Cerebras':   { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-300',   dot: 'bg-blue-500',   icon: '⚡' },
              'Claude':     { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500',   icon: '🧠' },
              'Gemini':     { bg: 'bg-teal-50 dark:bg-teal-900/20',   text: 'text-teal-700 dark:text-teal-300',   dot: 'bg-teal-500',   icon: '✨' },
            };
            const s = engineStyles[lastEngine] ?? engineStyles['Workers AI'];
            return (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.icon} Generated via {lastEngine}
              </div>
            );
          })()}

          {/* CV Diversity Score — how different this generation is from the previous one */}
          {cvDiversityScore !== null && (() => {
            const fresh = cvDiversityScore;
            const [bg, text, dot, tip] =
              fresh >= 70 ? ['bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800', 'text-emerald-700 dark:text-emerald-300', 'bg-emerald-500', 'This CV is very different from your last generation — the variance system is working well.']
            : fresh >= 40 ? ['bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',   'text-amber-700 dark:text-amber-300',   'bg-amber-500',   'Moderate freshness vs last generation. Try a different job description or generation mode for more variety.']
            :               ['bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800',      'text-rose-700 dark:text-rose-300',     'bg-rose-500',    'This CV is very similar to your last generation. Try changing the job description or generation mode.'];
            return (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${bg} ${text}`}
                   title={tip}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
                ↺ {fresh}% fresh vs last CV
              </div>
            );
          })()}
          </div>
        )}
      </div>

      {(currentCV || (isLoading && draftCV)) && (
        <div className="bg-white dark:bg-neutral-800/50 p-4 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
          {/* Streaming draft banner — visible while polishing runs in background */}
          {isLoading && draftCV && !currentCV && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 animate-in fade-in duration-500">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping" />
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-violet-500 -ml-3.5" />
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                Drafting in progress — polishing in background. Final version will appear automatically.
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between mb-6 gap-6">
            <div>
              <h2 className="text-2xl font-bold">CV Preview</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Select a template, choose a font, and make final edits.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} size="sm">
                <Edit className="h-4 w-4 mr-2" />
                {isEditing ? 'Finish Editing' : 'Edit CV'}
              </Button>
              <Button variant="secondary" onClick={() => { setCvScore(null); handleGenerateCV(); }} disabled={isLoading || isEditing || !apiKeySet} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              {onRestoreProfileBullets && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (window.confirm('Reset all experience bullets and summary back to your raw profile text?\n\nThis will remove any AI-polished content. You can regenerate afterwards.')) {
                      onRestoreProfileBullets();
                    }
                  }}
                  disabled={isLoading || isEditing}
                  size="sm"
                  title="Reset all bullets and summary back to your raw profile text — useful before starting a fresh AI generation for a new job"
                  className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to Profile
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => { forceFreshRef.current = true; setCvScore(null); handleGenerateCV(); }}
                disabled={isLoading || isEditing || !apiKeySet}
                size="sm"
                title="Skip the smart audit and run a full fresh generation from scratch"
              >
                <RefreshCw className="h-4 w-4 mr-2 text-amber-500" />
                Force Fresh
              </Button>
              <Button variant="secondary" onClick={() => onSaveCV(currentCV, cvPurpose)} disabled={isEditing} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="secondary" onClick={handleGenerateCoverLetter} disabled={isGeneratingCoverLetter || isEditing || !apiKeySet} size="sm">
                <FileText className="h-4 w-4 mr-2" />
                {isGeneratingCoverLetter ? "Generating..." : "Cover Letter"}
              </Button>
              {jobDescription.trim() && apiKeySet && (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleScoreCV}
                    disabled={isScoringCV || isEditing}
                    size="sm"
                    className="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                  >
                    {isScoringCV ? (
                      <><svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Scoring…</>
                    ) : (
                      <>⚡ Score CV</>
                    )}
                  </Button>
                  {scoreError && (
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">{scoreError}</span>
                  )}
                </>
              )}
              <Button onClick={handleDownload} disabled={isEditing || !!downloadStatus} size="sm">
                {downloadStatus ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>
              {qualityReport && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQualityPanel(true)}
                  disabled={isEditing}
                  title={
                    qualityReport.totalIssues === 0
                      ? `Perfect score across ${qualityReport.totalBullets} bullet(s) — open to view the audit.`
                      : `${qualityReport.totalIssues} issue(s) detected across ${qualityReport.totalBullets} bullet(s) — open to fix with AI.`
                  }
                  className={
                    qualityReport.totalIssues === 0
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      : qualityReport.score >= 80
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                        : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/40'
                  }
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Quality {qualityReport.score}/100
                  {qualityReport.totalIssues > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-current/10">
                      {qualityReport.totalIssues}
                    </span>
                  )}
                  {purifyLeaks.filter(l => l.fixedBy === 'synonym_sub').length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      {purifyLeaks.filter(l => l.fixedBy === 'synonym_sub').length} auto-fixed
                    </span>
                  )}
                </Button>
              )}
              {lastEngine && (
                <span
                  title={`Generated by ${lastEngine}. Run window.__providerStatus() in DevTools for the full health snapshot.`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 self-center"
                >
                  <Sparkles className="h-3 w-3" />
                  Engine: {lastEngine}
                </span>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowShareModal(true)}
                disabled={isEditing}
                size="sm"
                className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
                <ShareIcon className="h-4 w-4 mr-2" />Share Link
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowAIPanel(true)}
                disabled={isEditing || !apiKeySet}
                size="sm"
                className="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40"
              >
                <Sparkles className="h-4 w-4 mr-2" />CV Coach
              </Button>
              {onApplyViaEmail && cvPurpose === 'job' && (
                <Button
                  onClick={() => onApplyViaEmail(jobDescription, currentCV!)}
                  disabled={isEditing || !jobDescription.trim()}
                  size="sm"
                  variant="secondary"
                  className="bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                >
                  ✉️ Apply via Email
                </Button>
              )}
              {onGoToInterviewPrep && cvPurpose === 'job' && jobDescription.trim() && (
                <Button
                  onClick={() => onGoToInterviewPrep(jobDescription)}
                  disabled={isEditing}
                  size="sm"
                  variant="secondary"
                  className="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                >
                  🎤 Interview Prep
                </Button>
              )}
            </div>
          </div>

          {downloadError && (
            <div className="mb-4 -mt-2 p-3 text-sm text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-lg flex items-center gap-3 border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}

          {atsDataEmbedded && (
            <div className="mb-4 -mt-2 p-3 text-sm text-green-800 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center gap-3 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <span><strong>ATS Power Mode Active:</strong> Job description keywords, phrases &amp; semantic context embedded invisibly in your PDF across 4 zones — maximising match scores in Greenhouse, Lever, Workday, Taleo &amp; iCIMS.</span>
            </div>
          )}

          {cvScore && (() => {
            const score = cvScore.overall;
            const grade = score >= 85 ? { label: 'Excellent', ring: 'ring-green-400', bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400' }
              : score >= 70 ? { label: 'Good', ring: 'ring-blue-400', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' }
              : score >= 55 ? { label: 'Fair', ring: 'ring-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400' }
              : { label: 'Needs Work', ring: 'ring-red-400', bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' };

            const dim = (label: string, val: number, colour: string) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-neutral-700">
                  <div className={`h-1.5 rounded-full ${colour}`} style={{ width: `${val}%` }} />
                </div>
              </div>
            );

            return (
              <div className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full ring-4 ${grade.ring} flex items-center justify-center bg-white dark:bg-neutral-800`}>
                      <span className={`text-xl font-extrabold ${grade.text}`}>{score}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">CV Match Score</p>
                      <p className={`text-lg font-extrabold ${grade.text}`}>{grade.label}</p>
                    </div>
                  </div>
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400 max-w-[160px] hidden sm:block">"{cvScore.verdict}"</p>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <button
                      onClick={() => setShowDoctorPanel(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm"
                      title="Open CV Doctor — bullet review, career insights & change history"
                    >
                      <span>⚕</span> CV Doctor
                    </button>
                    <button onClick={() => setCvScore(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" title="Dismiss">✕</button>
                  </div>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Score bars */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Score Breakdown</p>
                    {dim('ATS Keyword Match', cvScore.ats, 'bg-[#1B2B4B]')}
                    {dim('Quantified Impact', cvScore.impact, 'bg-emerald-500')}
                    {dim('Role Relevance', cvScore.relevance, 'bg-blue-500')}
                    {dim('Writing Clarity', cvScore.clarity, 'bg-amber-500')}
                  </div>

                  {/* Insights */}
                  <div className="space-y-4">
                    {cvScore.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1.5">✓ Strengths</p>
                        <ul className="space-y-1">
                          {cvScore.strengths.map((s, i) => <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">• {s}</li>)}
                        </ul>
                      </div>
                    )}
                    {cvScore.improvements.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1.5">→ Quick Wins</p>
                        <ul className="space-y-1">
                          {cvScore.improvements.map((s, i) => <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">• {s}</li>)}
                        </ul>
                      </div>
                    )}
                    {cvScore.missingKeywords.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1.5">⚠ Missing Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {cvScore.missingKeywords.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-Optimize footer */}
                {cvScore.overall < 95 && (
                  <div className="px-5 py-3 border-t border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/10 flex items-center justify-between gap-3">
                    {isOptimizing ? (
                      /* ── progress panel ── */
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        {(
                          [
                            { id: 'analysing', label: 'Reading your current CV' },
                            { id: 'improving', label: 'Applying structural & quality fixes' },
                            { id: 'polishing', label: 'Running quality checks' },
                            ...(jobDescription.trim() ? [{ id: 'scoring', label: 'Re-scoring against job description' }] : []),
                          ] as { id: typeof optimizeStage; label: string }[]
                        ).map(({ id, label }) => {
                          const ORDER = ['analysing', 'improving', 'polishing', 'scoring'];
                          const cur = ORDER.indexOf(optimizeStage ?? '');
                          const mine = ORDER.indexOf(id ?? '');
                          const isDone = mine < cur;
                          const isCurrent = mine === cur;
                          return (
                            <div key={id} className={`flex items-center gap-2 text-[11px] transition-colors ${isDone ? 'text-emerald-600 dark:text-emerald-400' : isCurrent ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-zinc-400 dark:text-zinc-600'}`}>
                              {isDone ? (
                                <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                              ) : isCurrent ? (
                                <svg className="h-3 w-3 flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                              ) : (
                                <span className="h-3 w-3 flex-shrink-0 flex items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" /></span>
                              )}
                              <span>{label}</span>
                              {isCurrent && optimizingProvider && (
                                <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                                  {optimizingProvider}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Fix structure, missing dates, tense, and style issues in one click.
                      </p>
                    )}
                    <button
                      onClick={handleAutoOptimize}
                      disabled={isOptimizing}
                      className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#1B2B4B] hover:bg-[#243860] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {isOptimizing ? (
                        <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Working…</>
                      ) : (
                        <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Auto-Optimize CV</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Purpose/Mode badge + CV Doctor button on preview */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${purposeBadgeBg} ${purposeBadgeText}`}>
              {purposeLabel}
            </span>
            {currentCV && (
              <button
                onClick={() => setShowDoctorPanel(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/40 dark:hover:bg-violet-800/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 transition-colors"
                title="Career review: bullet inspector, smart insights & what changed"
              >
                <span>⚕</span> CV Doctor
              </button>
            )}
          </div>

          <TemplateGallery
            selectedTemplate={template}
            onSelect={(t) => { setTemplate(t); setCustomTemplateId(null); }}
            cvData={currentCV ?? undefined}
            personalInfo={userProfile.personalInfo}
            customTemplates={customTemplates}
            customTemplateId={customTemplateId ?? undefined}
            onSelectCustom={(id) => { setCustomTemplateId(id); setTemplate('custom'); }}
            onOpenUploader={() => setShowTemplateUploader(true)}
            onRenameCustom={() => setCustomTemplates(loadCustomTemplates())}
          />

          {/* ── Custom Template Style Panel ── */}
          {template === 'custom' && customTemplateId && (() => {
            const ct = customTemplates.find(t => t.id === customTemplateId);
            if (!ct) return null;
            const cust: CustomTemplateCustomizations = ct.customizations ?? {};

            const updateCustomizations = (patch: Partial<CustomTemplateCustomizations>) => {
              const updated: CustomTemplateEntry = { ...ct, customizations: { ...cust, ...patch } };
              saveCustomTemplate(updated);
              setCustomTemplates(loadCustomTemplates());
            };

            const TEMPLATE_COLORS = [
              { hex: '#1B2B4B', label: 'Navy' }, { hex: '#1e293b', label: 'Slate' },
              { hex: '#374151', label: 'Charcoal' }, { hex: '#166534', label: 'Forest' },
              { hex: '#1e40af', label: 'Blue' }, { hex: '#7c3aed', label: 'Violet' },
              { hex: '#be123c', label: 'Crimson' }, { hex: '#92400e', label: 'Amber' },
              { hex: '#0f766e', label: 'Teal' }, { hex: '#334155', label: 'Steel' },
            ];

            const activeColor = cust.primaryColor ?? ct.spec.colorScheme.primary;
            const activeSidebar = cust.sidebarColor ?? ct.spec.colorScheme.sidebarBackground ?? ct.spec.colorScheme.primary;
            const activeFont = cust.fontFamily ?? ct.spec.typography.fontFamily ?? 'sans-serif';
            const hasSidebar = ct.spec.layout.columns !== 'single';

            return (
              <div className="mt-3 p-3.5 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-200 dark:border-sky-800 space-y-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-widest">Custom Template Style</span>
                  <span className="text-[9px] text-sky-500 dark:text-sky-500">Editing: {ct.name}</span>
                </div>

                {/* Accent colour */}
                <div>
                  <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">Accent Colour</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {TEMPLATE_COLORS.map(({ hex: h, label }) => (
                      <button
                        key={h}
                        title={label}
                        onClick={() => updateCustomizations({ primaryColor: h, ...(hasSidebar ? { sidebarColor: h } : {}) })}
                        className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${activeColor === h ? 'border-zinc-900 dark:border-white scale-110 ring-2 ring-offset-1 ring-zinc-300' : 'border-transparent'}`}
                        style={{ backgroundColor: h }}
                      />
                    ))}
                    <label title="Custom colour" className="relative w-6 h-6 rounded-full border-2 border-dashed border-zinc-400 dark:border-zinc-500 overflow-hidden cursor-pointer hover:scale-110 transition-all flex items-center justify-center bg-white dark:bg-neutral-700">
                      <span className="text-[10px] text-zinc-400 font-bold select-none">+</span>
                      <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={activeColor} onChange={e => updateCustomizations({ primaryColor: e.target.value, ...(hasSidebar ? { sidebarColor: e.target.value } : {}) })} />
                    </label>
                    {cust.primaryColor && (
                      <button onClick={() => updateCustomizations({ primaryColor: undefined, sidebarColor: undefined })} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline">Reset</button>
                    )}
                  </div>
                </div>

                {/* Sidebar colour override (only for two-column templates) */}
                {hasSidebar && (
                  <div>
                    <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">Sidebar Colour</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {TEMPLATE_COLORS.map(({ hex: h, label }) => (
                        <button key={h} title={label} onClick={() => updateCustomizations({ sidebarColor: h })}
                          className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${activeSidebar === h ? 'border-zinc-900 dark:border-white scale-110 ring-2 ring-offset-1 ring-zinc-300' : 'border-transparent'}`}
                          style={{ backgroundColor: h }} />
                      ))}
                      <label className="relative w-6 h-6 rounded-full border-2 border-dashed border-zinc-400 dark:border-zinc-500 overflow-hidden cursor-pointer hover:scale-110 transition-all flex items-center justify-center bg-white dark:bg-neutral-700">
                        <span className="text-[10px] text-zinc-400 font-bold select-none">+</span>
                        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={activeSidebar ?? '#1B2B4B'} onChange={e => updateCustomizations({ sidebarColor: e.target.value })} />
                      </label>
                    </div>
                  </div>
                )}

                {/* Font */}
                <div>
                  <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">Font Style</span>
                  <div className="flex gap-1.5">
                    {(['sans-serif', 'serif', 'monospace'] as const).map(f => (
                      <button key={f} onClick={() => updateCustomizations({ fontFamily: f })}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${activeFont === f ? 'bg-sky-700 text-white shadow-sm' : 'bg-white dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-600 hover:bg-zinc-100'}`}
                        style={{ fontFamily: f === 'serif' ? 'Georgia,serif' : f === 'monospace' ? 'monospace' : 'Inter,sans-serif' }}>
                        {f === 'sans-serif' ? 'Sans' : f === 'serif' ? 'Serif' : 'Mono'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Customisation Panel: Font + Accent Colour ── */}
          <div className="mt-5 p-4 bg-zinc-50 dark:bg-neutral-800/60 rounded-xl border border-zinc-200 dark:border-neutral-700 space-y-4">

            {/* Font chips */}
            <div>
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Font</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(fontDisplayNames).map(([key, label]) => {
                  const shortName = label.split(' ')[0];
                  const isSelected = font === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFont(key as FontName)}
                      disabled={isEditing}
                      title={label}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-[#1B2B4B] text-white shadow-sm ring-1 ring-[#1B2B4B]/30'
                          : 'bg-white dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-600 hover:bg-zinc-100 dark:hover:bg-neutral-600 hover:text-zinc-900 dark:hover:text-zinc-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent colour */}
            {currentCV && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Accent Colour</span>
                  <div
                    className="w-4 h-4 rounded-full border border-zinc-300 dark:border-neutral-600 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: currentCV.accentColor ?? '#4f46e5' }}
                  />
                  <span className="text-[10px] text-zinc-400">
                    {ACCENT_COLORS.find(c => c.hex === currentCV.accentColor)?.label ?? (currentCV.accentColor ? 'Custom' : 'Default')}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCENT_COLORS.map(({ hex, label }) => (
                    <button
                      key={hex}
                      title={label}
                      onClick={() => setCurrentCV({ ...currentCV, accentColor: hex })}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 hover:shadow-md ${
                        (currentCV.accentColor ?? '#4f46e5') === hex
                          ? 'border-zinc-900 dark:border-white scale-110 shadow-lg ring-2 ring-offset-1 ring-zinc-300 dark:ring-zinc-600'
                          : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-500'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <label
                    title="Custom colour"
                    className="relative w-7 h-7 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 overflow-hidden cursor-pointer hover:scale-110 transition-all flex items-center justify-center bg-white dark:bg-neutral-700"
                  >
                    <span className="text-[11px] text-zinc-400 font-bold select-none">+</span>
                    <input
                      type="color"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      value={currentCV.accentColor ?? '#4f46e5'}
                      onChange={e => setCurrentCV({ ...currentCV, accentColor: e.target.value })}
                    />
                  </label>
                  {currentCV.accentColor && (
                    <button
                      onClick={() => setCurrentCV({ ...currentCV, accentColor: undefined })}
                      className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline ml-1"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Quick Template Strip ── */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Quick Switch Template</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{templateDisplayNames[template]}</span> selected
              </span>
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-2"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
            >
              {(Object.keys(templateDisplayNames) as TemplateName[]).map((t) => {
                const isActive = t === template;
                return (
                  <button
                    key={t}
                    onClick={() => setTemplate(t)}
                    title={templateDisplayNames[t]}
                    className="flex-none flex flex-col items-center gap-1 focus:outline-none group"
                  >
                    <div className={`w-11 h-[62px] rounded-lg overflow-hidden transition-all duration-150 ${
                      isActive
                        ? 'ring-2 ring-[#C9A84C] shadow-md shadow-[#C9A84C]/20 scale-105'
                        : 'ring-1 ring-zinc-200 dark:ring-neutral-700 hover:ring-[#C9A84C]/60 hover:shadow-sm group-hover:scale-[1.03]'
                    }`}>
                      <TemplateThumbnail templateName={t} />
                    </div>
                    <span className={`text-[8px] font-medium max-w-[44px] text-center leading-tight truncate ${
                      isActive ? 'text-[#C9A84C] font-bold' : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                    }`}>
                      {templateDisplayNames[t].split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sidebar Section Picker ───────────────────────────────────
              Only visible for sidebar templates. Lets the user toggle off the
              auto-generated fillers (Key Achievements, Selected Projects,
              References summary) when they prefer a cleaner sidebar with only
              their own data. The toolbar is intentionally compact and lives
              right above the preview so the effect is immediately visible. */}
          {SIDEBAR_TEMPLATES.includes(template) && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Sidebar Sections</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                  Toggle auto-generated sidebar content
                </span>
              </div>
              <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700">
                {([
                  { key: 'keyAchievements', label: 'Key Achievements', hint: 'Quantitative wins from your experience' },
                  { key: 'selectedProjects', label: 'Selected Projects', hint: 'Project titles in the sidebar' },
                  { key: 'references', label: 'References', hint: '"Available on request" note' },
                ] as const).map(({ key, label, hint }) => {
                  const isOn = sidebarSections[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSidebarSections({ ...sidebarSections, [key]: !isOn })}
                      title={hint}
                      aria-pressed={isOn}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150 ${
                        isOn
                          ? 'bg-[#C9A84C] text-white shadow-sm hover:bg-[#b89740]'
                          : 'bg-white dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600 hover:border-[#C9A84C]/50'
                      }`}
                    >
                      <span className={`inline-block w-3 h-3 rounded-sm flex-shrink-0 flex items-center justify-center ${
                        isOn ? 'bg-white/30' : 'border border-zinc-300 dark:border-neutral-500'
                      }`}>
                        {isOn && (
                          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M2 6 L5 9 L10 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Import Quality Report ─────────────────────────────────────── */}
          {showImportReport && (() => {
            const completeness = scoreCVCompleteness(currentCV, userProfile);
            const issueCount = qualityReport?.issues?.length ?? 0;
            const gradeColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
              strong: { bg: 'bg-emerald-50 dark:bg-emerald-900/15', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
              good:   { bg: 'bg-blue-50 dark:bg-blue-900/15',    border: 'border-blue-200 dark:border-blue-800',    text: 'text-blue-700 dark:text-blue-300',    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' },
              fair:   { bg: 'bg-amber-50 dark:bg-amber-900/15',  border: 'border-amber-200 dark:border-amber-800',  text: 'text-amber-700 dark:text-amber-300',  badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' },
              weak:   { bg: 'bg-red-50 dark:bg-red-900/15',      border: 'border-red-200 dark:border-red-800',      text: 'text-red-700 dark:text-red-300',      badge: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
            };
            const c = gradeColors[completeness.grade];
            return (
              <div className={`mt-4 mb-2 rounded-xl border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 ${c.border} flex flex-col items-center justify-center`}>
                      <span className={`text-base font-bold leading-none ${c.text}`}>{completeness.percent}</span>
                      <span className={`text-[9px] font-medium leading-none ${c.text} opacity-70`}>/ 100</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import Quality Report</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${c.badge}`}>{completeness.grade}</span>
                        {issueCount > 0 && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300">
                            {issueCount} quality {issueCount === 1 ? 'issue' : 'issues'}
                          </span>
                        )}
                      </div>
                      {completeness.missing.length > 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                          <span className="font-medium">Missing: </span>{completeness.missing.slice(0, 4).join(', ')}{completeness.missing.length > 4 ? ` +${completeness.missing.length - 4} more` : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">All key fields are filled in — great start!</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {issueCount > 0 && (
                      <button
                        onClick={() => { setShowImportReport(false); setShowQualityPanel(true); }}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${c.border} ${c.text} hover:opacity-80 transition-opacity`}
                      >
                        View issues
                      </button>
                    )}
                    <button
                      onClick={() => setShowImportReport(false)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1"
                      aria-label="Dismiss"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {/* Fix summary row — shown after a successful fix run */}
                {fixSummary && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800">
                    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>
                      {fixSummary.total > 0
                        ? <>Fixed <strong>{fixSummary.total}</strong> issue{fixSummary.total !== 1 ? 's' : ''}{fixSummary.remote > 0 ? ` (including ${fixSummary.remote} from the live banned-phrase database)` : ''} — your CV is cleaner now.</>
                        : <>No common issues found — your CV text is already clean.</>
                      }
                    </span>
                  </div>
                )}

                {/* Fix common issues button */}
                <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                    Automatically removes overused AI words, passive-voice openers, stub bullets, duplicate phrases, and more — no AI used, instant.
                  </p>
                  <button
                    onClick={handleFixImportIssues}
                    disabled={isFixingIssues}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a65] text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isFixingIssues ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                        Fixing…
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Fix common issues
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}

          <div ref={previewRef} className="mt-6 border-t border-zinc-200 dark:border-neutral-700 pt-6">
            {/* Tight wrapper for PDF capture — mirrors SharedCVView's layout
                so the editor download is byte-identical to the share download.
                The data-cv-preview-active marker is what `getCVHtml`'s default
                selector prefers, and what we pass explicitly via cvCaptureRef. */}
            <div ref={cvCaptureRef} data-cv-preview-active="true">
              <CVPreview
                cvData={(isLoading && draftCV && !currentCV) ? draftCV as CVData : currentCV}
                personalInfo={userProfile.personalInfo}
                isEditing={isEditing && !!currentCV}
                onDataChange={setCurrentCV}
                jobDescriptionForATS={jobDescription}
                template={template}
                sidebarSections={sidebarSections}
                customTemplateId={customTemplateId ?? undefined}
              />
            </div>
          </div>
        </div>
      )}

      {coverLetterError && <p className="text-red-500 text-sm mt-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">{coverLetterError}</p>}
      {(streamingLetter || coverLetter) && (
        <div className="bg-white dark:bg-neutral-800/50 p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
          {streamingLetter ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-[#C9A84C] animate-pulse inline-block" />
                <span className="text-xs font-semibold text-[#C9A84C]">Writing your cover letter…</span>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 font-sans leading-relaxed">{streamingLetter}</pre>
            </div>
          ) : (
            <CoverLetterPreview
              letterText={coverLetter ?? ''}
              onTextChange={setCoverLetter}
              fileName={`${userProfile.personalInfo.name.replace(/\s+/g, '_')}_Cover_Letter.pdf`}
              personalInfo={userProfile.personalInfo}
            />
          )}
        </div>
      )}

      {showTemplateUploader && (
        <CustomTemplateUploader
          cvData={currentCV ?? undefined}
          personalInfo={userProfile.personalInfo}
          onSaved={(entry) => {
            setCustomTemplates(loadCustomTemplates());
            setCustomTemplateId(entry.id);
            setTemplate('custom');
            setShowTemplateUploader(false);
          }}
          onClose={() => setShowTemplateUploader(false)}
        />
      )}

      {showShareModal && currentCV && (
        <ShareCVModal
          cvData={currentCV}
          personalInfo={userProfile.personalInfo}
          template={template}
          coverLetterText={coverLetter ?? undefined}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showAIPanel && currentCV && (
        <AIImprovementPanel
          cvData={currentCV}
          personalInfo={userProfile.personalInfo}
          jobDescription={jobDescription}
          apiKeySet={apiKeySet}
          onCVUpdate={(newCV) => { setCurrentCV(newCV); }}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {showQualityPanel && qualityReport && currentCV && (
        <QualityIssuesPanel
          open={showQualityPanel}
          onClose={() => setShowQualityPanel(false)}
          cv={currentCV}
          report={qualityReport}
          purifyLeaks={purifyLeaks}
          jd={jobDescription || undefined}
          onApplyFix={(newCv) => {
            setCurrentCV(newCv);
            // Surface which provider just produced the rewrite, so the engine
            // badge stays in sync with reality.
            setLastEngine(getLastAiEngine());
          }}
          onDownloadJson={handleDownloadQualityReport}
        />
      )}

      {/* Download auth gate — shown when the free 2-download limit is reached */}
      <DownloadGateModal
        open={showDownloadGate}
        onClose={() => { setShowDownloadGate(false); setPendingDownload(false); }}
        onContinue={() => {
          setShowDownloadGate(false);
          if (pendingDownload) {
            setPendingDownload(false);
            incrementDownloadCount();
            executeDownload();
          }
        }}
      />

      {/* Animated download progress modal — replaces the previous inline
          "Rendering preview…" button text with a step-by-step progress
          experience. Mounted unconditionally so the open/close fade is owned
          by the modal itself (it returns null when status is null). */}
      <DownloadProgressModal
        status={downloadStatus}
        totalMs={downloadTotalMs}
        via={downloadVia}
        onClose={() => setDownloadStatus(null)}
      />

      {/* CV Doctor slide-over panel */}
      {showDoctorPanel && currentCV && (
        <CVDoctorPanel
          cv={currentCV}
          jobDescription={jobDescription || undefined}
          diff={optimizeDiff}
          onApplyBullet={(roleIndex, bulletIndex, newText) => {
            setCurrentCV(prev => {
              if (!prev) return prev;
              const exp = prev.experience.map((role, rIdx) => {
                if (rIdx !== roleIndex) return role;
                const responsibilities = role.responsibilities.map((b, bIdx) =>
                  bIdx === bulletIndex ? newText : b
                );
                return { ...role, responsibilities };
              });
              return { ...prev, experience: exp };
            });
          }}
          onClose={() => setShowDoctorPanel(false)}
        />
      )}
    </div>
  );
};

export default CVGenerator;
