/**
 * CareerPivotPage.tsx
 *
 * Career Pivot Analyser — instant deterministic analysis + optional AI pivot brief.
 * Zero LLM calls for the base score (instant). AI Brief is opt-in.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { CVData } from '../types';
import type { UserProfile } from '../types';
import { detectField, type CVField } from '../services/cvPromptHelpers';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import { generatePivotBrief, type PivotBrief } from '../services/pivotService';

// ─── Field display names ───────────────────────────────────────────────────────

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

// Skills that transfer broadly between fields
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
  engineering: ['autocad', 'solidworks', 'matlab', 'mechanical', 'structural', 'design', 'simulation', 'testing', 'prototyping'],
  manufacturing: ['lean manufacturing', 'quality control', 'six sigma', 'production planning', 'erp', 'iso', 'health and safety'],
  government: ['policy', 'legislation', 'procurement', 'public sector', 'regulatory', 'governance', 'stakeholder engagement'],
  media: ['journalism', 'content', 'editing', 'writing', 'social media', 'video production', 'storytelling', 'publishing'],
  ngo: ['grant writing', 'fundraising', 'community outreach', 'advocacy', 'programme management', 'monitoring', 'evaluation'],
};

// Action items for pivoting into a target field
const PIVOT_ACTION_ITEMS: Record<string, string[]> = {
  tech: [
    'Complete a Python or SQL course (freeCodeCamp, Coursera, or edX — free)',
    'Build 2–3 portfolio projects on GitHub that solve real problems from your current field',
    'Earn a cloud certification (AWS Certified Cloud Practitioner is the fastest entry point)',
    'Add a "Technical Skills" section listing languages, tools, and frameworks you\'ve used',
    'Reframe past work to highlight automation, data, or systems thinking',
  ],
  data_analytics: [
    'Complete Google\'s Data Analytics Certificate (Coursera — 6 months, free to audit)',
    'Build a portfolio: one SQL project, one Excel dashboard, one Python notebook',
    'Learn Tableau or Power BI via free trial — build a dashboard from public data',
    'Add measurable metrics from past roles (% improvements, volumes, costs saved)',
    'Contribute to a Kaggle competition to demonstrate data problem-solving',
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
    'Run a small personal project: blog, newsletter, or social campaign — track the metrics',
    'Learn basic SEO tools (Google Search Console, Semrush free tier)',
    'Frame past communication or stakeholder work as "audience engagement"',
    'Build a portfolio deck showing campaigns, results, and creative samples',
  ],
  sales: [
    'Get Salesforce Trailhead certification (free)',
    'Quantify every commercial interaction: deals influenced, revenue generated, clients managed',
    'Frame negotiation, partnership, and stakeholder work as sales experience',
    'Add any revenue, pipeline, or growth metrics from your current role',
    'List CRM tools and communication platforms you\'ve used',
  ],
  consulting: [
    'Build a case study of a work problem you solved using a structured framework (MECE, SCQA)',
    'Learn PowerPoint storytelling — consulting decks follow a specific narrative arc',
    'Add deliverables, not just responsibilities: "Delivered X which resulted in Y"',
    'Earn a project management cert (PMP or Prince2) to signal structured thinking',
    'Network on LinkedIn with consultants in your target firm\'s practice area',
  ],
  hr: [
    'Complete CIPD Level 3 or SHRM Essentials certification',
    'Frame any hiring, training, or team-development experience in HR language',
    'Add experience with HRIS tools: Workday, BambooHR, SAP SuccessFactors',
    'Quantify people outcomes: team size managed, retention rate, time-to-hire',
    'Write a 2-paragraph CV summary that explicitly positions your pivot into People/HR',
  ],
  healthcare: [
    'Identify which healthcare role fits your background (administration, data, operations, or clinical)',
    'Get familiar with healthcare compliance frameworks (HIPAA, CQC, NHS guidelines)',
    'Volunteer or shadow in a healthcare setting to build contextual knowledge',
    'Frame any people-care, compliance, or data experience in clinical language',
    'Consider a healthcare-specific certificate (Health Informatics, NHS Leadership)',
  ],
  education: [
    'Complete a PGCE, CELTA, or online teaching credential relevant to your subject area',
    'Volunteer as a tutor, mentor, or workshop facilitator to build classroom experience',
    'Frame coaching, training, and knowledge-sharing from past roles as teaching experience',
    'Create a sample lesson plan or curriculum outline to demonstrate pedagogy',
    'Join a professional teaching community (TES, Teachmeet) to build your network',
  ],
  legal: [
    'Complete a paralegal certificate if you don\'t have a law degree',
    'Focus on compliance, contracts, or regulatory roles — more accessible for career changers',
    'Frame any contract management, policy writing, or regulatory work as legal experience',
    'Get certified in GDPR, data privacy, or a compliance-specific area',
    'Tailor your CV to one legal niche (corporate, employment, compliance) — don\'t generalize',
  ],
  engineering: [
    'Identify which engineering discipline maps closest to your background',
    'Take a relevant CAD or simulation software course (AutoCAD, SolidWorks, ANSYS)',
    'Build a portfolio of technical projects — even personal ones count',
    'Pursue IEng or CEng accreditation pathway if you have a technical undergraduate degree',
    'Reframe project management, problem solving, and analytical work in engineering terms',
  ],
  operations: [
    'Get a Lean Six Sigma Yellow or Green Belt certification (widely respected, affordable)',
    'Quantify process improvements from past roles: time saved, cost reduced, error rate lowered',
    'Add any ERP, workflow, or SOP experience explicitly to your CV',
    'Frame coordination and cross-functional experience as operational leadership',
    'Target operations roles within your current industry first — lower context barrier',
  ],
  logistics: [
    'Complete a CILT (Chartered Institute of Logistics and Transport) foundation certificate',
    'Get familiar with SAP, Oracle WMS, or another major ERP system (free trial access available)',
    'Add any procurement, vendor management, or inventory experience explicitly',
    'Quantify volumes: units shipped, SKUs managed, cost per shipment reduced',
    'Target a supply chain analyst or coordinator role as an entry point',
  ],
  manufacturing: [
    'Complete a Lean Manufacturing or Six Sigma certification (even Yellow Belt is valued)',
    'Familiarise yourself with ISO 9001 quality management — widely required in manufacturing',
    'Frame any process improvement, quality control, or safety experience prominently',
    'Show health & safety awareness: NEBOSH or IOSH qualifications are highly transferable',
    'Target a production coordinator or quality analyst role as an entry point',
  ],
  government: [
    'Research the specific grade and role structure in your target government body',
    'Learn the Civil Service Competency Framework and mirror its language in your CV',
    'Frame stakeholder management, reporting, and policy work as public sector experience',
    'Emphasize accountability, governance, and risk management in your bullet points',
    'Apply to Fast Stream or equivalent graduate scheme if eligible — strong transfer pathway',
  ],
  media: [
    'Build a public portfolio: blog, newsletter, podcast, or YouTube channel in your niche',
    'Develop a distinctive voice — editors hire personalities, not just skilled writers',
    'Complete a journalism, content strategy, or social media certificate',
    'Pitch 2–3 pieces to relevant publications and collect bylines',
    'Frame any public speaking, communication, or storytelling experience prominently',
  ],
  ngo: [
    'Volunteer with an NGO in a project or communications role to build sector credibility',
    'Learn MEAL frameworks (Monitoring, Evaluation, Accountability, and Learning)',
    'Get familiar with grant writing — even a short course builds credibility',
    'Frame all programme management, community work, or advocacy experience in development language',
    'Network through DevEx, ReliefWeb, or LinkedIn\'s NGO communities',
  ],
};

const DEFAULT_ACTIONS = [
  'Rewrite your CV summary to explicitly state your pivot direction and why you\'re a strong fit',
  'Add a "Transferable Skills" section near the top of your CV',
  'Quantify achievements from your current field — numbers transfer across industries',
  'Get one certification in the target field (even a free one signals intent)',
  'Find 3–5 people on LinkedIn who made the same pivot and study their career paths',
];

// ─── CV to profile-like adapter ───────────────────────────────────────────────

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
    if (corpus.includes(skill.toLowerCase())) have.push(skill);
    else missing.push(skill);
  }
  return { have, missing };
}

function detectTransferables(cv: CVData): string[] {
  const corpus = [
    ...(cv.skills || []),
    ...(cv.experience || []).flatMap(e => e.responsibilities || []),
    cv.summary || '',
  ].join(' ').toLowerCase();
  return UNIVERSAL_TRANSFERS.filter(skill => corpus.includes(skill.toLowerCase()));
}

// ─── Pivot score arc gauge ─────────────────────────────────────────────────────

function PivotGauge({ score, color }: { score: number; color: string }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const half = circ / 2; // semi-circle
  const fill = (score / 100) * half;
  return (
    <svg width="110" height="62" viewBox="0 0 110 62">
      {/* track */}
      <path
        d={`M 10 60 A ${r} ${r} 0 0 1 100 60`}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="10"
        strokeLinecap="round"
        className="dark:stroke-neutral-700"
      />
      {/* fill */}
      <path
        d={`M 10 60 A ${r} ${r} 0 0 1 100 60`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * half * 1.05} ${half}`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="55" y="55" textAnchor="middle" fontSize="16" fontWeight="900" fill={color}>
        {score}%
      </text>
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  currentCV: CVData | null;
  onGoToGenerator: () => void;
  onGoToScore: () => void;
  apiKeySet?: boolean;
  openSettings?: () => void;
}

const NAV  = '#1B2B4B';
const GOLD = '#C9A84C';

// ─── Component ────────────────────────────────────────────────────────────────

const CareerPivotPage: React.FC<Props> = ({
  currentCV, onGoToGenerator, onGoToScore, apiKeySet, openSettings,
}) => {
  const [jobDescription, setJobDescription] = useState('');
  const [showJDInput, setShowJDInput] = useState(false);
  const [pivotBrief, setPivotBrief] = useState<PivotBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

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

  const handleGenerateBrief = useCallback(async () => {
    if (!currentCV || !analysis?.isPivot) return;
    if (!apiKeySet) { openSettings?.(); return; }
    setBriefLoading(true);
    setBriefError(null);
    setPivotBrief(null);
    try {
      const fromLabel = FIELD_LABELS[analysis.profileField] || analysis.profileField;
      const toLabel   = FIELD_LABELS[analysis.jdField || ''] || analysis.jdField || '';
      const brief = await generatePivotBrief(currentCV, jobDescription, fromLabel, toLabel);
      setPivotBrief(brief);
    } catch (e: any) {
      setBriefError(e.message || 'AI brief failed. Check your API key.');
    } finally {
      setBriefLoading(false);
    }
  }, [currentCV, analysis, jobDescription, apiKeySet, openSettings]);

  // Reset brief when JD changes
  const handleJdChange = (val: string) => {
    setJobDescription(val);
    setPivotBrief(null);
    setBriefError(null);
  };

  if (!currentCV) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🧭</div>
        <h2 className="text-xl font-bold text-zinc-800 dark:text-white mb-2">No CV loaded yet</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          Build or import a CV first, then come back to analyse your career pivot.
        </p>
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
  const toLabel   = jdField ? (FIELD_LABELS[jdField] || jdField) : null;

  const gaugeColor = pivotScore !== null
    ? pivotScore >= 60 ? '#16a34a' : pivotScore >= 35 ? '#d97706' : '#dc2626'
    : GOLD;

  const checkedCount = bridgeSkills.have.length + transferables.length;
  const totalBridge  = (FIELD_BRIDGE_SKILLS[jdField || ''] || []).length;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${NAV}15` }}>
            🧭
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-zinc-900 dark:text-white">Career Pivot Analyser</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Switching fields? See what transfers, what's missing, and exactly how to bridge the gap.
            </p>
          </div>
          <button
            onClick={onGoToScore}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 transition-colors flex-shrink-0"
          >
            ← CV Score
          </button>
        </div>

        {/* JD input */}
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
                onChange={e => handleJdChange(e.target.value)}
                rows={5}
                placeholder="Paste the full job description here…"
                className="w-full rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
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
        <div className="rounded-2xl p-5 border" style={{ background: `${NAV}08`, borderColor: `${NAV}30` }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🔀</span>
                <h2 className="text-base font-black text-zinc-900 dark:text-white">Career Pivot Detected</h2>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 ml-9">
                Your background is in <strong>{fromLabel}</strong>, but this role targets <strong>{toLabel}</strong>.
                That's not a red flag — it's a positioning challenge.
              </p>
              {pivotScore !== null && (
                <div className="ml-9 mt-2 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {pivotScore >= 60 ? '✅ Strong pivot foundation — focus on framing and narrative' :
                     pivotScore >= 35 ? '⚡ Moderate overlap — targeted upskilling needed' :
                     '⚠️ Significant gap — a structured transition plan is recommended'}
                  </span>
                  {totalBridge > 0 && (
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 bg-white/60 dark:bg-neutral-800/60 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-neutral-600">
                      {checkedCount}/{totalBridge + UNIVERSAL_TRANSFERS.length} skills transferable
                    </span>
                  )}
                </div>
              )}
            </div>
            {pivotScore !== null && (
              <div className="flex flex-col items-center flex-shrink-0">
                <PivotGauge score={pivotScore} color={gaugeColor} />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">Transfer-ready</p>
              </div>
            )}
          </div>
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
              Skills from <strong>{fromLabel}</strong> that are directly valued in <strong>{toLabel}</strong>.
            </p>

            {transferables.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Universal skills in your CV
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {transferables.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {bridgeSkills.have.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Field-specific bridge skills you already have
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {bridgeSkills.have.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {transferables.length === 0 && bridgeSkills.have.length === 0 && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                No cross-field skills detected — add them to Skills and work experience descriptions.
              </p>
            )}
          </div>

          {/* What's missing */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <span className="text-base">⚠️</span> What's Missing
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              Field-specific skills expected in <strong>{toLabel}</strong> roles that aren't in your CV.
            </p>

            {bridgeSkills.missing.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {bridgeSkills.missing.slice(0, 10).map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40">
                    ✗ {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                No critical field-specific gaps detected — good foundation for this pivot.
              </p>
            )}

            {atsReport && atsReport.missing && atsReport.missing.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                  JD keywords missing from your CV ({atsReport.missing.length})
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

      {/* AI Pivot Brief */}
      {isPivot && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-neutral-800"
               style={{ background: `${GOLD}10` }}>
            <div className="flex items-center gap-3">
              <span className="text-xl">✨</span>
              <div>
                <p className="text-sm font-black text-zinc-800 dark:text-zinc-100">AI Pivot Brief</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Personalised narrative, LinkedIn headline, and pivot-specific tips
                </p>
              </div>
            </div>
            {!pivotBrief && !briefLoading && (
              <button
                onClick={handleGenerateBrief}
                disabled={briefLoading}
                className="px-4 py-2 text-xs font-bold rounded-xl text-white transition-colors flex items-center gap-1.5 flex-shrink-0"
                style={{ background: NAV }}
              >
                ✨ Generate Brief
              </button>
            )}
          </div>

          {briefLoading && (
            <div className="flex items-center gap-3 px-5 py-5">
              <svg className="animate-spin h-5 w-5 text-[#C9A84C] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Analysing your {fromLabel} → {toLabel} pivot…
              </p>
            </div>
          )}

          {briefError && (
            <div className="px-5 py-4">
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{briefError}</p>
            </div>
          )}

          {pivotBrief && !briefLoading && (
            <div className="p-5 space-y-5">

              {/* Headline */}
              <div className="rounded-xl p-4 border" style={{ background: `${NAV}08`, borderColor: `${NAV}20` }}>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                  🎯 Your Pivot Positioning
                </p>
                <p className="text-base font-bold text-zinc-900 dark:text-white leading-snug">{pivotBrief.headline}</p>
              </div>

              {/* Narrative */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  📝 CV Summary Narrative
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{pivotBrief.narrative}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(pivotBrief.narrative)}
                  className="mt-2 text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  Copy narrative →
                </button>
              </div>

              {/* LinkedIn headline */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-1.5">
                  💼 LinkedIn Headline
                </p>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{pivotBrief.linkedinHeadline}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(pivotBrief.linkedinHeadline)}
                  className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-600 transition-colors"
                >
                  Copy headline →
                </button>
              </div>

              {/* Top tips */}
              {pivotBrief.topTips && pivotBrief.topTips.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                    ⚡ Pivot-Specific Tips
                  </p>
                  <ol className="space-y-2">
                    {pivotBrief.topTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 text-white mt-0.5"
                          style={{ background: GOLD }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <button
                onClick={handleGenerateBrief}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                🔄 Regenerate brief →
              </button>
            </div>
          )}

          {!pivotBrief && !briefLoading && !briefError && (
            <div className="px-5 py-4">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Click "Generate Brief" to get a personalised pivot narrative, LinkedIn headline, and specific tips for the {fromLabel} → {toLabel} transition.
                {!apiKeySet && (
                  <>{' '}<button onClick={openSettings} className="text-[#C9A84C] font-semibold underline">Set up API key →</button></>
                )}
              </p>
            </div>
          )}
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

      {/* CTAs */}
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
