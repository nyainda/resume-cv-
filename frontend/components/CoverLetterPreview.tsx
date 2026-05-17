import React, { useState, useCallback, useMemo } from 'react';
import { PersonalInfo } from '../types';
import { downloadCoverLetterViaWorker } from '../services/cvDownloadService';
import type { CoverLetterTemplate } from '../services/coverLetterHtmlService';

interface CoverLetterPreviewProps {
  letterText: string;
  onTextChange: (newText: string) => void;
  fileName: string;
  personalInfo?: PersonalInfo;
}

// ─── Cover Letter Rule types ─────────────────────────────────────────────────

type CLSeverity = 'error' | 'warning' | 'info';

interface CLIssue {
  id: string;
  label: string;
  tip: string;
  severity: CLSeverity;
}

const SEVERITY_STYLES: Record<CLSeverity, { bg: string; border: string; badge: string; dot: string }> = {
  error:   { bg: 'bg-red-50 dark:bg-red-950/30',    border: 'border-red-200 dark:border-red-800/50',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',    dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800/50', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
  info:    { bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-800/50',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',   dot: 'bg-blue-400' },
};

// ─── Instant rule checker ─────────────────────────────────────────────────────

function checkCoverLetter(text: string): CLIssue[] {
  if (!text.trim()) return [];
  const issues: CLIssue[] = [];

  const words     = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Length
  if (wordCount < 200) {
    issues.push({
      id: 'too_short',
      label: `Too short (${wordCount} words)`,
      tip: 'Aim for 250–400 words. A strong cover letter needs at least 3 substantive paragraphs.',
      severity: 'error',
    });
  } else if (wordCount > 500) {
    issues.push({
      id: 'too_long',
      label: `Too long (${wordCount} words)`,
      tip: 'Trim to under 450 words. Recruiters rarely read past the first page.',
      severity: 'warning',
    });
  }

  // 2. Cliché opener
  if (/\b(I am writing to apply|I am writing to express|I would like to apply|Please accept my application|I wish to apply|I am applying for)\b/i.test(text)) {
    issues.push({
      id: 'cliche_opener',
      label: 'Cliché opening line',
      tip: '"I am writing to apply…" is the most overused opener in cover letters. Replace it with a specific achievement or compelling hook.',
      severity: 'error',
    });
  }

  // 3. I-overuse
  const iCount = (text.match(/\bI\b/g) || []).length;
  if (iCount > 14) {
    issues.push({
      id: 'i_overuse',
      label: `"I" used ${iCount} times`,
      tip: 'The letter reads as self-centred. Reframe sentences to focus on what you bring to the employer — start with outcomes, not yourself.',
      severity: 'warning',
    });
  }

  // 4. Generic / vague phrases
  const genericPhrases = [
    'hard worker', 'team player', 'go-getter', 'self-starter',
    'think outside the box', 'results-driven', 'detail-oriented',
    'passionate about', 'highly motivated', 'dynamic professional',
    'proven track record', 'fast learner',
  ];
  const foundGeneric = genericPhrases.filter(p => new RegExp(`\\b${p}\\b`, 'i').test(text));
  if (foundGeneric.length > 0) {
    issues.push({
      id: 'generic_phrases',
      label: `Generic phrase: "${foundGeneric[0]}"`,
      tip: `Vague labels like "${foundGeneric[0]}" add no value. Replace with a specific example, number, or outcome that proves the claim.`,
      severity: 'warning',
    });
  }

  // 5. Outdated / formal phrases
  const outdatedPhrases = [
    'please find attached', 'please find enclosed',
    'to whom it may concern', 'enclosed herewith',
    'as per', 'kindly note', 'i beg to inform',
  ];
  const foundOutdated = outdatedPhrases.filter(p => new RegExp(p, 'i').test(text));
  if (foundOutdated.length > 0) {
    issues.push({
      id: 'outdated_phrase',
      label: `Outdated phrase: "${foundOutdated[0]}"`,
      tip: `"${foundOutdated[0]}" sounds dated and formal. Use natural, direct language instead.`,
      severity: 'error',
    });
  }

  // 6. Three or more consecutive sentences starting with "I"
  const sentenceStarts = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  let run = 0; let maxRun = 0;
  for (const s of sentenceStarts) {
    if (/^I[\s']/.test(s)) { run++; maxRun = Math.max(maxRun, run); } else { run = 0; }
  }
  if (maxRun >= 3) {
    issues.push({
      id: 'consecutive_i_starts',
      label: `${maxRun} sentences in a row start with "I"`,
      tip: 'Vary sentence openings to avoid monotony. Try starting with the company name, a time phrase, or the outcome.',
      severity: 'warning',
    });
  }

  // 7. Salary / compensation mention
  if (/\b(salary|compensation|pay\b|remuneration|benefits package)\b/i.test(text)) {
    issues.push({
      id: 'salary_mention',
      label: 'Salary mentioned',
      tip: "Don't discuss salary in a cover letter — it can signal you're focused on pay over contribution.",
      severity: 'error',
    });
  }

  // 8. Missing call to action
  const lastPara = text.split(/\n\n+/).slice(-1)[0] ?? '';
  const hasCTA   = /\b(look forward|happy to|available|welcome the opportunity|discuss|interview|meet|connect|hear from)\b/i.test(lastPara);
  if (!hasCTA && wordCount >= 150) {
    issues.push({
      id: 'no_cta',
      label: 'No call to action',
      tip: 'End with a forward-looking closing line, e.g. "I would welcome the opportunity to discuss how I can contribute."',
      severity: 'info',
    });
  }

  return issues;
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: {
  id: CoverLetterTemplate;
  label: string;
  desc: string;
}[] = [
  { id: 'modern',       label: 'Modern',       desc: 'Clean · Sans-serif'    },
  { id: 'professional', label: 'Professional', desc: 'Classic · Serif'        },
  { id: 'executive',    label: 'Executive',    desc: 'Navy header · Gold'     },
  { id: 'academic',     label: 'Academic',     desc: 'Formal · Centered'      },
  { id: 'creative',     label: 'Creative',     desc: 'Bold accent bar'        },
];

// ─── Template thumbnail ───────────────────────────────────────────────────────

const TemplateThumbnail: React.FC<{ id: CoverLetterTemplate; active: boolean }> = ({ id, active }) => {
  const base   = 'w-full h-[54px] rounded overflow-hidden border transition-all duration-150';
  const border = active ? 'border-[#1B2B4B] dark:border-[#C9A84C]/60 shadow-sm' : 'border-zinc-200 dark:border-neutral-700';

  if (id === 'executive') return (
    <div className={`${base} ${border}`}>
      <div className="bg-[#1B2B4B] h-[26px] px-2 pt-[7px]">
        <div className="h-[5px] w-[55%] rounded-sm bg-white/80" />
        <div className="h-[3px] w-[40%] rounded-sm bg-white/40 mt-[3px]" />
      </div>
      <div className="bg-[#C9A84C] h-[2px]" />
      <div className="bg-white dark:bg-neutral-900 px-2 pt-[5px] space-y-[2px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-[80%]" />
      </div>
    </div>
  );

  if (id === 'creative') return (
    <div className={`${base} ${border} flex`}>
      <div className="w-[5px] bg-[#1B2B4B] flex-shrink-0" />
      <div className="flex-1 bg-white dark:bg-neutral-900 px-2 pt-[6px] space-y-[3px]">
        <div className="h-[5px] rounded-sm bg-[#C9A84C] w-[50%]" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-[70%]" />
        <div className="h-[2px] rounded-sm bg-zinc-100 dark:bg-neutral-800 w-full mt-1" />
        <div className="h-[2px] rounded-sm bg-zinc-100 dark:bg-neutral-800 w-[90%]" />
      </div>
    </div>
  );

  if (id === 'academic') return (
    <div className={`${base} ${border} bg-white dark:bg-neutral-900 pt-[6px] px-2`}>
      <div className="flex flex-col items-center gap-[2px] mb-1">
        <div className="h-[5px] rounded-sm bg-zinc-600 dark:bg-zinc-400 w-[45%]" />
        <div className="h-[2px] rounded-sm bg-zinc-300 dark:bg-zinc-600 w-[35%]" />
      </div>
      <div className="border-t-[1.5px] border-zinc-600 dark:border-zinc-400 mb-[2px]" />
      <div className="border-t border-zinc-300 dark:border-zinc-600 mb-1" />
      <div className="space-y-[2px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-[85%]" />
      </div>
    </div>
  );

  if (id === 'professional') return (
    <div className={`${base} ${border} bg-white dark:bg-neutral-900 pt-[6px] px-2`}>
      <div className="h-[5px] rounded-sm bg-zinc-700 dark:bg-zinc-300 w-[50%] mb-[2px]" />
      <div className="h-[2px] rounded-sm bg-zinc-300 dark:bg-zinc-600 w-[38%]" />
      <div className="border-t-[1.5px] border-zinc-500 dark:border-zinc-400 mt-[5px] mb-[2px]" />
      <div className="border-t border-zinc-300 dark:border-zinc-600 mb-1" />
      <div className="space-y-[2px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-[80%]" />
      </div>
    </div>
  );

  return (
    <div className={`${base} ${border} bg-white dark:bg-neutral-900`}>
      <div className="h-[3px] bg-[#1B2B4B]" />
      <div className="px-2 pt-[5px] space-y-[3px]">
        <div className="h-[5px] rounded-sm bg-[#1B2B4B]/80 w-[50%]" />
        <div className="h-[2px] rounded-sm bg-zinc-300 dark:bg-zinc-600 w-[38%]" />
        <div className="border-b border-zinc-100 dark:border-neutral-700 mt-[4px] mb-1" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 dark:bg-neutral-700 w-[80%]" />
      </div>
    </div>
  );
};

// ─── Letter header (per-template) ────────────────────────────────────────────

const LetterHeader: React.FC<{
  template: CoverLetterTemplate;
  personalInfo?: PersonalInfo;
}> = ({ template, personalInfo }) => {
  const name    = personalInfo?.name;
  const contact = [personalInfo?.email, personalInfo?.phone, personalInfo?.location].filter(Boolean).join(' · ');
  const links   = [personalInfo?.linkedin, personalInfo?.website].filter(Boolean).join(' · ');
  if (!name && !contact) return null;

  if (template === 'executive') return (
    <div className="relative -mx-10 sm:-mx-14 -mt-10 sm:-mt-14 mb-8 px-10 sm:px-14 pt-10 sm:pt-12 pb-6 bg-[#1B2B4B]">
      {name    && <h1 className="font-serif text-2xl font-bold text-white mb-1 leading-tight">{name}</h1>}
      {contact && <p className="text-[11px] text-white/65 tracking-wide">{contact}</p>}
      {links   && <p className="text-[11px] text-[#C9A84C] mt-1">{links}</p>}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#C9A84C]" />
    </div>
  );

  if (template === 'creative') return (
    <div className="mb-8 pb-6 border-b border-zinc-100 dark:border-neutral-700">
      {name    && <h1 className="font-sans text-xl font-bold text-[#C9A84C] mb-1">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-400">{contact}</p>}
      {links   && <p className="text-[11px] text-[#1B2B4B] dark:text-[#C9A84C]/80 mt-1 font-medium">{links}</p>}
    </div>
  );

  if (template === 'academic') return (
    <div className="mb-8 text-center">
      {name    && <h1 className="font-serif text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{contact}</p>}
      {links   && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic mt-0.5">{links}</p>}
      <div className="mt-3 border-t-2 border-zinc-700 dark:border-zinc-400" />
      <div className="mt-0.5 border-t border-zinc-400 dark:border-zinc-600 mb-3" />
    </div>
  );

  if (template === 'professional') return (
    <div className="mb-8">
      {name    && <h1 className="font-serif text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{contact}</p>}
      {links   && <p className="text-[11px] text-zinc-400 italic mt-0.5">{links}</p>}
      <div className="mt-4 border-t-[1.5px] border-zinc-500 dark:border-zinc-400" />
      <div className="mt-0.5 border-t border-zinc-300 dark:border-zinc-600 mb-3" />
    </div>
  );

  return (
    <div className="mb-8 pb-5 border-b border-zinc-100 dark:border-neutral-700">
      {name    && <h1 className="font-sans text-xl font-bold text-[#1B2B4B] dark:text-zinc-100 mb-1 tracking-tight">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-400">{contact}</p>}
      {links   && <p className="text-[11px] text-blue-500 mt-0.5">{links}</p>}
    </div>
  );
};

// ─── Letter body ─────────────────────────────────────────────────────────────

const LetterBody: React.FC<{
  text: string;
  fontClass: string;
  isEditing: boolean;
  onBlur: (v: string) => void;
}> = ({ text, fontClass, isEditing, onBlur }) => {
  if (isEditing) return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onBlur(e.currentTarget.innerText)}
      className={`outline-none text-sm leading-[1.78] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap ${fontClass}`}
    >
      {text}
    </div>
  );

  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className={`text-sm leading-[1.78] text-zinc-700 dark:text-zinc-300 space-y-[14px] ${fontClass}`}>
      {paragraphs.map((para, i) => (
        <p key={i}>{para.split('\n').map((line, j) => (
          <React.Fragment key={j}>{j > 0 && <br />}{line}</React.Fragment>
        ))}</p>
      ))}
    </div>
  );
};

// ─── Word count bar ───────────────────────────────────────────────────────────

const WordCountBar: React.FC<{ wordCount: number }> = ({ wordCount }) => {
  const min = 200; const ideal = 325; const max = 500;
  const pct = Math.min(100, Math.round((wordCount / max) * 100));
  const readMins = Math.max(1, Math.round(wordCount / 238));

  const statusColor =
    wordCount < min   ? 'text-red-500 dark:text-red-400' :
    wordCount > max   ? 'text-amber-500 dark:text-amber-400' :
    wordCount < 250   ? 'text-amber-500 dark:text-amber-400' :
                        'text-green-600 dark:text-green-400';

  const barColor =
    wordCount < min   ? 'bg-red-400' :
    wordCount > max   ? 'bg-amber-400' :
    wordCount < 250   ? 'bg-amber-400' :
                        'bg-green-500';

  const label =
    wordCount < min  ? 'Too short' :
    wordCount > max  ? 'Too long'  :
    wordCount < 250  ? 'A bit short' :
    wordCount <= 400 ? 'Ideal length' :
                       'Getting long';

  return (
    <div className="mt-3 px-1">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-medium ${statusColor}`}>{wordCount} words · {label}</span>
        <span className="text-[11px] text-zinc-400">~{readMins} min read</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">200</span>
        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">ideal: 250–400</span>
        <span className="text-[9px] text-zinc-300 dark:text-zinc-600">500</span>
      </div>
    </div>
  );
};

// ─── Rules panel ─────────────────────────────────────────────────────────────

const RulesPanel: React.FC<{ issues: CLIssue[] }> = ({ issues }) => {
  const [open, setOpen] = useState(true);

  const errorCount   = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  const summaryColor =
    errorCount   > 0 ? 'text-red-600 dark:text-red-400'   :
    warningCount > 0 ? 'text-amber-600 dark:text-amber-400' :
                       'text-green-600 dark:text-green-400';

  const summaryLabel =
    issues.length === 0
      ? 'All checks passed'
      : `${issues.length} issue${issues.length > 1 ? 's' : ''} found`;

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-800/60 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Cover Letter Check</span>
          <span className={`text-xs font-semibold ${summaryColor}`}>— {summaryLabel}</span>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 space-y-2 bg-white dark:bg-neutral-900">
          {issues.length === 0 ? (
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">Looking great!</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No common cover letter issues detected.</p>
              </div>
            </div>
          ) : (
            issues.map(issue => {
              const s = SEVERITY_STYLES[issue.severity];
              return (
                <div key={issue.id} className={`flex items-start gap-3 p-3 rounded-lg border ${s.bg} ${s.border}`}>
                  <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">{issue.label}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{issue.tip}</p>
                  </div>
                  <span className={`ml-auto flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${s.badge}`}>
                    {issue.severity}
                  </span>
                </div>
              );
            })
          )}

          <div className="pt-2 border-t border-zinc-100 dark:border-neutral-800">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              These are instant, deterministic checks — no AI. They detect common cover letter mistakes but don't replace a human proof-read.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const CoverLetterPreview: React.FC<CoverLetterPreviewProps> = ({
  letterText,
  onTextChange,
  fileName,
  personalInfo,
}) => {
  const [copied,    setCopied]    = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template,  setTemplate]  = useState<CoverLetterTemplate>('modern');
  const [status,    setStatus]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const wordCount = useMemo(
    () => letterText.trim().split(/\s+/).filter(Boolean).length,
    [letterText],
  );

  const issues = useMemo(() => checkCoverLetter(letterText), [letterText]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(letterText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [letterText]);

  const handleDownload = useCallback(async () => {
    setLoading(true);
    setError('');
    setStatus('Preparing PDF…');
    try {
      const result = await downloadCoverLetterViaWorker(
        letterText, fileName, template, personalInfo, setStatus,
      );
      if (!result.ok) setError(result.error ?? 'Download failed. Please try again.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }, [letterText, fileName, template, personalInfo]);

  const fontClass =
    template === 'professional' || template === 'executive' || template === 'academic'
      ? 'font-serif' : 'font-sans';

  const paperClass    = template === 'creative' ? 'border-l-[7px] border-l-[#1B2B4B]' : '';
  const paperTopClass = template === 'modern'   ? 'border-t-[4px] border-t-[#1B2B4B]' : '';

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount  = issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-neutral-800">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cover Letter</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review, edit, and download your personalised letter.
          </p>
          {issues.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
              {warnCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{warnCount} warning{warnCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsEditing(e => !e)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-neutral-800 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            {isEditing ? 'Done editing' : 'Edit'}
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-neutral-800 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
          >
            {copied
              ? <><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy</>
            }
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm shadow-[#1B2B4B]/20"
          >
            {loading
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> {status || 'Generating…'}</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg> Download PDF</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">

        {/* Left: template picker */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Template</p>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`w-full text-left rounded-xl overflow-hidden transition-all duration-150 ring-offset-1 ${
                  template === t.id
                    ? 'ring-2 ring-[#1B2B4B] dark:ring-[#C9A84C]/60'
                    : 'hover:ring-2 hover:ring-zinc-200 dark:hover:ring-neutral-600'
                }`}
              >
                <TemplateThumbnail id={t.id} active={template === t.id} />
                <div className={`px-2 py-1.5 ${template === t.id ? 'bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5' : 'bg-white dark:bg-neutral-800'}`}>
                  <p className={`text-xs font-semibold ${template === t.id ? 'text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'text-zinc-700 dark:text-zinc-300'}`}>{t.label}</p>
                  <p className="text-[10px] text-zinc-400">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-100 dark:border-neutral-700">
            <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Pro tip</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Use <span className="font-semibold text-zinc-600 dark:text-zinc-300">Executive</span> or{' '}
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">Academic</span> for senior or formal applications.
            </p>
          </div>
        </div>

        {/* Right: paper preview + checks */}
        <div>
          <div className="relative">
            {isEditing && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-[#C9A84C] text-white text-[11px] font-semibold shadow">
                Editing — click outside the letter to save
              </div>
            )}
            <div
              className={`
                bg-white dark:bg-neutral-900 rounded-2xl
                shadow-[0_4px_32px_rgba(0,0,0,0.10)] dark:shadow-[0_4px_32px_rgba(0,0,0,0.35)]
                overflow-hidden
                ${isEditing ? 'ring-2 ring-[#C9A84C]/50' : ''}
              `}
            >
              <div className={`px-10 sm:px-14 py-10 sm:py-14 min-h-[640px] ${paperClass} ${paperTopClass}`}>
                <LetterHeader template={template} personalInfo={personalInfo} />
                <LetterBody
                  text={letterText}
                  fontClass={fontClass}
                  isEditing={isEditing}
                  onBlur={onTextChange}
                />
              </div>
            </div>

            {/* Word count bar */}
            {wordCount > 0 && <WordCountBar wordCount={wordCount} />}
          </div>

          {/* Rules panel */}
          {wordCount >= 50 && <RulesPanel issues={issues} />}
        </div>
      </div>
    </div>
  );
};

export default CoverLetterPreview;
