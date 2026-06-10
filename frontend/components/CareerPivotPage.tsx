/**
 * CareerPivotPage.tsx
 *
 * Phase 2.2 — "Career Pivot Score"
 *
 * When the user's CV field differs from the target JD field, Resume Worded
 * would just score them low. ProCV explains the pivot, surfaces what transfers,
 * shows what gaps exist, and gives a concrete action plan.
 *
 * Zero LLM calls — all deterministic from existing field detection and ATS
 * keyword scoring. Results are instant.
 */

import React, { useState, useMemo } from 'react';
import type { CVData } from '../types';
import type { UserProfile } from '../types';
import { detectField, type CVField } from '../services/cvPromptHelpers';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';

// ─── Field display names & descriptions ───────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  tech: 'Software / Technology',
  data_analytics: 'Data Analytics',
  finance: 'Finance',
  marketing: 'Marketing / Comms',
  sales: 'Sales / Commercial',
  hr: 'HR / People',
  legal: 'Legal',
  healthcare: 'Healthcare / Clinical',
  education: 'Education / Teaching',
  engineering: 'Engineering',
  civil_engineering: 'Civil Engineering',
  construction: 'Construction / Trades',
  architecture: 'Architecture',
  manufacturing: 'Manufacturing',
  logistics: 'Logistics / Supply Chain',
  ngo: 'NGO / Development',
  government: 'Government / Public Sector',
  consulting: 'Consulting',
  operations: 'Operations',
  hospitality: 'Hospitality / Tourism',
  media: 'Media / Journalism',
  irrigation: 'Irrigation / Agri-Engineering',
  drought_management: 'Drought / Water Management',
  general: 'General / Unspecified',
};

// Skills that transfer broadly between fields, mapped by category
const UNIVERSAL_TRANSFERS = [
  'project management', 'stakeholder management', 'data analysis', 'budgeting',
  'team leadership', 'communication', 'reporting', 'planning', 'excel',
  'microsoft office', 'presentation', 'research', 'problem solving', 'writing',
  'coordination', 'client management', 'cross-functional', 'strategy',
];

// Bridge skills that help when pivoting INTO a target field
const FIELD_BRIDGE_SKILLS: Record<string, string[]> = {
  tech: ['python', 'sql', 'git', 'agile', 'cloud', 'api', 'software', 'coding', 'programming', 'javascript', 'linux', 'devops'],
  data_analytics: ['sql', 'python', 'excel', 'tableau', 'power bi', 'statistics', 'machine learning', 'data visualization', 'reporting'],
  finance: ['financial modelling', 'excel', 'accounting', 'budgeting', 'cfa', 'cpa', 'ifrs', 'gaap', 'audit', 'forecasting', 'valuation'],
  marketing: ['seo', 'google analytics', 'social media', 'content creation', 'branding', 'campaigns', 'email marketing', 'crm', 'copywriting'],
  sales: ['crm', 'salesforce', 'pipeline', 'b2b', 'account management', 'negotiation', 'cold calling', 'quota', 'revenue'],
  hr: ['recruitment', 'talent acquisition', 'hris', 'performance management', 'onboarding', 'labour law', 'compensation', 'shrm'],
  healthcare: ['clinical', 'patient', 'hipaa', 'nursing', 'medical', 'ehr', 'diagnosis', 'clinical trials', 'pharmacy'],
  education: ['curriculum', 'lesson planning', 'classroom', 'pedagogy', 'assessment', 'e-learning', 'lms', 'mentoring'],
  legal: ['contract', 'compliance', 'regulatory', 'litigation', 'corporate law', 'due diligence', 'legal drafting', 'gdpr'],
  consulting: ['frameworks', 'problem solving', 'client engagement', 'deliverables', 'powerpoint', 'stakeholders', 'strategy', 'recommendations'],
  logistics: ['supply chain', 'warehouse', 'inventory', 'erp', 'sap', 'procurement', 'vendor management', 'incoterms', 'shipping'],
  operations: ['process improvement', 'lean', 'six sigma', 'kpi', 'workflow', 'erp', 'sop', 'quality', 'continuous improvement'],
};

// Action items for pivoting into a target field
const PIVOT_ACTION_ITEMS: Record<string, string[]> = {
  tech: [
    'Complete a Python or SQL course (freeCodeCamp, Coursera, or edX — free)',
    'Build 2–3 portfolio projects on GitHub that solve real problems from your current field',
    'Earn a cloud certification (AWS Certified Cloud Practitioner is the fastest entry)',
    'Add a "Technical Skills" section listing languages, tools, and frameworks you\'ve used',
    'Reframe past work to highlight automation, data, or systems thinking',
  ],
  data_analytics: [
    'Complete Google\'s Data Analytics Certificate (Coursera — 6 months)',
    'Build a portfolio: one SQL project, one Excel dashboard, one Python notebook',
    'Learn Tableau or Power BI via free trial — build a dashboard from public data',
    'Add measurable metrics from past roles (% improvements, volumes, costs saved)',
    'Contribute to a Kaggle competition to show data problem-solving',
  ],
  finance: [
    'Start CFA Level 1 or study for ACCA — signals serious intent immediately',
    'Build a financial model in Excel using publicly available company data',
    'Add all budgeting, forecasting, and cost-management experience from past roles',
    'Quantify every financial decision you\'ve been involved in (amounts, % savings, ROI)',
    'List software: Excel (advanced), Power BI, any ERP/accounting systems',
  ],
  marketing: [
    'Complete Google\'s Digital Marketing Certificate (free)',
    'Run a small personal project: blog, newsletter, or social campaign with metrics',
    'Learn basic SEO tools (Google Search Console, Semrush free tier)',
    'Frame past communication or stakeholder work as "audience engagement"',
    'Build a portfolio deck showing campaigns, results, and creative samples',
  ],
  sales: [
    'Get Salesforce Trailhead certification (free)',
    'Quantify every commercial interaction: deals closed, revenue influenced, clients managed',
    'Frame negotiation, partnership, and stakeholder work as sales experience',
    'Add any revenue, pipeline, or growth metrics from current role',
    'List communication and CRM tools you\'ve used',
  ],
  consulting: [
    'Build a case study of a problem you solved at work using a structured framework',
    'Learn PowerPoint storytelling — consulting decks follow a specific narrative arc',
    'Add deliverables, not just responsibilities: "Delivered X which resulted in Y"',
    'Earn a project management cert (PMP or Prince2) to signal structure',
    'Network on LinkedIn with consultants in your target firm\'s industry practice',
  ],
  hr: [
    'Complete CIPD Level 3 or SHRM Essentials certification',
    'Frame any hiring, training, or team-development experience in HR language',
    'Add experience with HRIS tools: Workday, BambooHR, etc.',
    'Quantify people outcomes: team size managed, retention rate, time-to-hire',
    'Write a 2-paragraph summary that explicitly positions your pivot into People/HR',
  ],
};

const DEFAULT_ACTIONS = [
  'Rewrite your CV summary to explicitly state your pivot direction and why you\'re a strong fit',
  'Add a "Transferable Skills" section near the top of your CV',
  'Quantify achievements from your current field — numbers transfer across industries',
  'Get one certification in the target field (even a free one signals intent)',
  'Find 3–5 people on LinkedIn who made the same pivot and study their career paths',
];

// ─── CV to profile-like adapter for detectField ───────────────────────────────

function cvToProfileSummary(cv: CVData): Partial<UserProfile> {
  return {
    workExperience: (cv.experience || []).map(e => ({
      jobTitle: e.jobTitle || '',
      company: e.company || '',
      responsibilities: (e.responsibilities || []).join(' '),
      startDate: e.startDate || '',
      endDate: e.endDate || '',
    })),
    skills: cv.skills || [],
  } as unknown as Partial<UserProfile>;
}

// ─── Score how many bridge skills the user already has ───────────────────────

function detectBridgeSkills(cv: CVData, targetField: CVField): { have: string[]; missing: string[] } {
  const needed = FIELD_BRIDGE_SKILLS[targetField] || [];
  if (needed.length === 0) return { have: [], missing: [] };

  const corpus = [
    ...(cv.skills || []),
    ...(cv.experience || []).flatMap(e => e.responsibilities || []),
    cv.summary || '',
  ].join(' ').toLowerCase();

  const have: string[] = [];
  const missing: string[] = [];
  for (const skill of needed) {
    if (corpus.includes(skill.toLowerCase())) {
      have.push(skill);
    } else {
      missing.push(skill);
    }
  }
  return { have, missing };
}

// ─── Detect universal transferable skills already in the CV ──────────────────

function detectTransferables(cv: CVData): string[] {
  const corpus = [
    ...(cv.skills || []),
    ...(cv.experience || []).flatMap(e => e.responsibilities || []),
    cv.summary || '',
  ].join(' ').toLowerCase();

  return UNIVERSAL_TRANSFERS.filter(skill => corpus.includes(skill.toLowerCase()));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  currentCV: CVData | null;
  onGoToGenerator: () => void;
  onGoToScore: () => void;
}

const NAV = '#1B2B4B';
const GOLD = '#C9A84C';

const CareerPivotPage: React.FC<Props> = ({ currentCV, onGoToGenerator, onGoToScore }) => {
  const [jobDescription, setJobDescription] = useState('');
  const [showJDInput, setShowJDInput] = useState(false);

  const analysis = useMemo(() => {
    if (!currentCV) return null;

    const profileLike = cvToProfileSummary(currentCV);
    const profileField = detectField(undefined, profileLike as UserProfile);
    const jdField = jobDescription.trim().length > 50
      ? detectField(jobDescription, profileLike as UserProfile)
      : null;

    const isPivot = jdField !== null && jdField !== profileField && jdField !== 'general';

    const bridgeSkills = jdField ? detectBridgeSkills(currentCV, jdField) : { have: [], missing: [] };
    const transferables = detectTransferables(currentCV);

    const atsReport = jobDescription.trim().length > 50
      ? scoreAtsCoverage(currentCV, jobDescription)
      : null;

    const actions = PIVOT_ACTION_ITEMS[jdField || ''] || DEFAULT_ACTIONS;

    const pivotScore = jdField && isPivot ? Math.round(
      (bridgeSkills.have.length / Math.max(1, bridgeSkills.have.length + bridgeSkills.missing.length)) * 60 +
      (transferables.length / Math.max(1, UNIVERSAL_TRANSFERS.length)) * 40
    ) : null;

    return { profileField, jdField, isPivot, bridgeSkills, transferables, atsReport, actions, pivotScore };
  }, [currentCV, jobDescription]);

  if (!currentCV) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🧭</div>
        <h2 className="text-xl font-bold text-zinc-800 dark:text-white mb-2">No CV loaded yet</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Build or import a CV first, then come back to analyse your career pivot.</p>
        <button
          onClick={onGoToGenerator}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: NAV }}
        >
          Go to CV Generator
        </button>
      </div>
    );
  }

  const { profileField, jdField, isPivot, bridgeSkills, transferables, atsReport, actions, pivotScore } = analysis!;
  const fromLabel = FIELD_LABELS[profileField] || profileField;
  const toLabel = jdField ? (FIELD_LABELS[jdField] || jdField) : null;

  const gaugeColor = pivotScore !== null
    ? pivotScore >= 60 ? '#16a34a' : pivotScore >= 35 ? '#d97706' : '#dc2626'
    : GOLD;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: `${NAV}15` }}
          >
            🧭
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-zinc-900 dark:text-white">Career Pivot Analyser</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Switching fields? This tool identifies what transfers, what's missing, and exactly how to bridge the gap — so hiring managers see your pivot as a strength.
            </p>
          </div>
          <button
            onClick={onGoToScore}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 transition-colors flex-shrink-0"
          >
            ← CV Score
          </button>
        </div>

        {/* JD input toggle */}
        <div className="mt-5">
          {!showJDInput ? (
            <button
              onClick={() => setShowJDInput(true)}
              className="w-full text-left px-4 py-3 rounded-xl border-2 border-dashed border-zinc-200 dark:border-neutral-700 text-sm text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-neutral-500 transition-colors"
            >
              + Paste a job description to analyse your pivot to that specific role
            </button>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Target Job Description
              </label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={5}
                placeholder="Paste the full job description here…"
                className="w-full rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {jobDescription.trim().length > 0 && jobDescription.trim().length < 50 && (
                <p className="text-xs text-amber-500 mt-1">Paste at least a few sentences for accurate analysis.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pivot detection banner */}
      {jdField && isPivot && (
        <div
          className="rounded-2xl p-5 border"
          style={{ background: `${NAV}08`, borderColor: `${NAV}30` }}
        >
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔀</span>
            <h2 className="text-base font-black text-zinc-900 dark:text-white">Career Pivot Detected</h2>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 ml-9">
            Your background is in <strong>{fromLabel}</strong>, but this role targets <strong>{toLabel}</strong>.
            That's not a red flag — it's a positioning challenge.
            Resume Worded would score you low here. ProCV shows you what to do about it.
          </p>
          {pivotScore !== null && (
            <div className="ml-9 mt-3 flex items-center gap-3">
              <div
                className="px-3 py-1 rounded-lg text-sm font-black text-white"
                style={{ background: gaugeColor }}
              >
                {pivotScore}% transfer-ready
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {pivotScore >= 60 ? 'Strong pivot foundation — focus on framing' :
                 pivotScore >= 35 ? 'Moderate overlap — targeted upskilling needed' :
                 'Significant gap — a structured transition plan is recommended'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Same field — no pivot */}
      {jdField && !isPivot && (
        <div className="rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div>
              <h2 className="text-base font-black text-emerald-700 dark:text-emerald-400">No pivot detected</h2>
              <p className="text-sm text-emerald-600 dark:text-emerald-500">
                Your background in <strong>{fromLabel}</strong> aligns with this role. Use{' '}
                <button onClick={onGoToScore} className="underline font-semibold">Score My CV</button>{' '}
                to optimise for ATS and bullet quality instead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No JD — profile-only view */}
      {!jdField && (
        <div className="rounded-2xl border border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/40 p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-bold text-zinc-800 dark:text-zinc-200">Your detected field:</span>{' '}
            {fromLabel}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            Paste a job description above to analyse a specific pivot.
          </p>
        </div>
      )}

      {/* Two-column analysis (only when pivot detected) */}
      {isPivot && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* What transfers */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <span className="text-base">✅</span> What Transfers
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Skills and experience from <strong>{fromLabel}</strong> that are directly valued in <strong>{toLabel}</strong>.
            </p>

            {transferables.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Universal skills in your CV</p>
                <div className="flex flex-wrap gap-1.5">
                  {transferables.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {bridgeSkills.have.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Field-specific bridge skills you already have</p>
                <div className="flex flex-wrap gap-1.5">
                  {bridgeSkills.have.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {transferables.length === 0 && bridgeSkills.have.length === 0 && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                No cross-field skills detected in your CV yet — add them to Skills and work experience descriptions.
              </p>
            )}
          </div>

          {/* What's missing */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <span className="text-base">⚠️</span> What's Missing
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Field-specific skills typically expected in <strong>{toLabel}</strong> roles that aren't in your CV.
            </p>

            {bridgeSkills.missing.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {bridgeSkills.missing.slice(0, 10).map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                No critical field-specific gaps detected — good foundation for this pivot.
              </p>
            )}

            {/* ATS gap if JD pasted */}
            {atsReport && atsReport.missing && atsReport.missing.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                  JD keywords not in your CV ({atsReport.missing.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {atsReport.missing.slice(0, 8).map(kw => (
                    <span key={kw} className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action plan */}
      {isPivot && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
          <h3 className="text-sm font-black text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
            <span className="text-base">🗺️</span> Your Pivot Action Plan
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
            Specific, prioritised steps to make your pivot credible to hiring managers in <strong>{toLabel}</strong>.
          </p>
          <ol className="space-y-3">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 text-white mt-0.5"
                  style={{ background: NAV }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onGoToGenerator}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: NAV }}
        >
          Fix My CV →
        </button>
        {isPivot && (
          <button
            onClick={onGoToScore}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border border-zinc-200 dark:border-neutral-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Score My CV
          </button>
        )}
      </div>

    </div>
  );
};

export default CareerPivotPage;
