import React from 'react';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

interface CVScore {
  overall: number;
  verdict: string;
  ats: number;
  impact: number;
  relevance: number;
  clarity: number;
  strengths: string[];
  improvements: string[];
}

interface Props {
  cvScore: CVScore | null;
  currentCV: object | null;
  onDownload: () => void;
  onAutoOptimize: () => void;
  onOpenDoctor: () => void;
  onToggleEdit: () => void;
  isEditing: boolean;
  isOptimizing: boolean;
  downloadStatus: string | null;
  className?: string;
}

/* Small ring gauge — same pattern as DashboardHome */
const MiniGauge: React.FC<{ value: number; size?: number }> = ({ value, size = 56 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * (value / 100);
  const color = value >= 80 ? '#16a34a' : value >= 60 ? GOLD : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} className="dark:stroke-zinc-700" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
      />
    </svg>
  );
};

/* Metric bar */
const MetricBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 w-[72px] flex-shrink-0 leading-tight">{label}</span>
    <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
    </div>
    <span className="text-[10px] font-bold w-6 text-right flex-shrink-0" style={{ color }}>{value}</span>
  </div>
);

const CVGeneratorRightPanel: React.FC<Props> = ({
  cvScore,
  currentCV,
  onDownload,
  onAutoOptimize,
  onOpenDoctor,
  onToggleEdit,
  isEditing,
  isOptimizing,
  downloadStatus,
  className = '',
}) => {
  const hasCV = !!currentCV;

  const quickActions = [
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      ),
      label: 'AI Enhance',
      onClick: onAutoOptimize,
      disabled: !hasCV || isOptimizing,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      label: 'CV Doctor',
      onClick: onOpenDoctor,
      disabled: !hasCV,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      ),
      label: isEditing ? 'Done Editing' : 'Edit CV',
      onClick: onToggleEdit,
      disabled: !hasCV,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
      label: downloadStatus ? 'Preparing…' : 'Download PDF',
      onClick: onDownload,
      disabled: !hasCV || isEditing || !!downloadStatus,
      color: 'text-[#C9A84C] dark:text-[#C9A84C]',
      bg: 'bg-[#C9A84C]/8 dark:bg-[#C9A84C]/10',
    },
  ];

  const PRO_TIPS = [
    'Tailor your CV to each job — ATS systems scan for exact keyword matches from the job description.',
    'Lead every bullet with a strong action verb and a metric: "Grew revenue 34% by…".',
    'Keep your CV to one page for roles with < 8 years experience — brevity signals clarity.',
    'A 92%+ HR Detector score means your CV reads as human-authored. Aim for that.',
  ];
  const [tipIdx] = React.useState(() => Math.floor(Math.random() * PRO_TIPS.length));

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── AI Optimization Score ─────────────────────────────────── */}
      {cvScore ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              AI Optimization
            </p>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-shrink-0">
                <MiniGauge value={cvScore.overall} size={56} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-100">{cvScore.overall}</span>
                </div>
              </div>
              <div>
                <div
                  className="text-xs font-bold"
                  style={{ color: cvScore.overall >= 80 ? '#16a34a' : cvScore.overall >= 60 ? GOLD : '#ef4444' }}
                >
                  {cvScore.verdict}
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Overall Score</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <MetricBar label="ATS Keywords"   value={cvScore.ats}       color="#1B2B4B" />
              <MetricBar label="Impact"         value={cvScore.impact}    color="#16a34a" />
              <MetricBar label="Relevance"      value={cvScore.relevance} color="#3b82f6" />
              <MetricBar label="Clarity"        value={cvScore.clarity}   color="#f59e0b" />
            </div>
          </div>
          {cvScore.overall < 95 && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-2.5">
              <button
                onClick={onAutoOptimize}
                disabled={isOptimizing}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-bold bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B] hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {isOptimizing ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                ) : (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                )}
                {isOptimizing ? 'Optimizing…' : 'Re-run Optimization'}
              </button>
            </div>
          )}
        </div>
      ) : hasCV ? (
        /* No score yet — show a prompt */
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-5 flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}15` }}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">Generate your CV to see the AI optimization score.</p>
        </div>
      ) : null}

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl ${a.bg} ${a.color} disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 active:scale-95 transition-all`}
            >
              {a.icon}
              <span className="text-[9.5px] font-bold text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Export ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
          Export Your CV
        </p>
        <button
          onClick={onDownload}
          disabled={!hasCV || isEditing || !!downloadStatus}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all text-white shadow-sm"
          style={{ background: NAVY }}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {downloadStatus ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 text-center mt-2">
          High-fidelity PDF · Exact preview match
        </p>
      </div>

      {/* ── Pro Tip ───────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border px-4 py-3.5 flex gap-3"
        style={{ borderColor: `${GOLD}30`, background: `${GOLD}08` }}
      >
        <div
          className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-xs mt-0.5"
          style={{ background: GOLD, color: NAVY }}
        >
          💡
        </div>
        <p className="text-[10.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
          <strong className="text-zinc-700 dark:text-zinc-200">Pro Tip:</strong>{' '}
          {PRO_TIPS[tipIdx]}
        </p>
      </div>

    </div>
  );
};

export default CVGeneratorRightPanel;
