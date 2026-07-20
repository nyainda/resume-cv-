import React, { useState, useCallback, useMemo } from 'react';
import { PersonalInfo } from '../types';
import { downloadCoverLetterViaWorker } from '../services/cvDownloadService';
import type { CoverLetterTemplate } from '../services/coverLetterHtmlService';

interface CoverLetterPreviewProps {
  letterText: string;
  onTextChange: (newText: string) => void;
  fileName: string;
  personalInfo?: PersonalInfo;
  /** Called when the user clicks "Save to History". Receives word count + issue count so the caller can enrich with company/jobTitle. */
  onSave?: (data: { wordCount: number; issueCount: number }) => void;
  /** If a letter was just saved, show a brief confirmation */
  savedConfirm?: boolean;
}

// ─── Letter text formatter ────────────────────────────────────────────────────

function formatLetterForDisplay(raw: string): string {
  if (!raw) return raw;
  if (/\n\n/.test(raw)) return raw;
  const flat = raw.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  let salutation = '';
  let rest = flat;
  const salutationMatch = flat.match(/^(Dear\s[^,:]+[,:])\s*/i);
  if (salutationMatch) {
    salutation = salutationMatch[1];
    rest = flat.slice(salutationMatch[0].length).trim();
  }
  let closing = '';
  const closingIdx = rest.search(/\b(Sincerely|Best regards|Kind regards|Warm regards|Yours faithfully|Yours sincerely|Yours truly|With regards|Regards|Respectfully|Thank you)[,.]?\s/i);
  if (closingIdx !== -1) {
    closing = rest.slice(closingIdx).trim();
    rest = rest.slice(0, closingIdx).trim();
  }
  const sentences = rest
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map(s => s.trim())
    .filter(Boolean);
  const SENTENCES_PER_PARA = 3;
  const bodyParas: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    bodyParas.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(' '));
  }
  const parts: string[] = [];
  if (salutation) parts.push(salutation);
  parts.push(...bodyParas);
  if (closing) parts.push(closing);
  return parts.join('\n\n');
}

// ─── Cover Letter Rule types ─────────────────────────────────────────────────

type CLSeverity = 'error' | 'warning' | 'info';

interface CLIssue {
  id: string;
  label: string;
  tip: string;
  severity: CLSeverity;
}

// ─── HR-focused rule checker ──────────────────────────────────────────────────

function checkCoverLetter(text: string): CLIssue[] {
  if (!text.trim()) return [];
  const issues: CLIssue[] = [];
  const words     = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 180) {
    issues.push({ id: 'too_short', label: `Too short (${wordCount} words)`, tip: 'Aim for 200–240 words. A letter this short lacks the specific examples and achievements that make HR stop and read.', severity: 'error' });
  } else if (wordCount < 200) {
    issues.push({ id: 'slightly_short', label: `A little short (${wordCount} words)`, tip: "You're close — add one more specific achievement or strengthen a body paragraph to reach the 200-word floor.", severity: 'warning' });
  } else if (wordCount > 280) {
    issues.push({ id: 'too_long', label: `Exceeds one-page limit (${wordCount} words)`, tip: 'Cover letters must fit on one page. Cut to 200–240 words. Trim generic sentences — every word should earn its place.', severity: 'error' });
  } else if (wordCount > 240) {
    issues.push({ id: 'slightly_long', label: `Slightly over one-page target (${wordCount} words)`, tip: 'Trim to 240 words. Remove the least specific sentence — recruiters read the first 15 seconds, so make every word count.', severity: 'warning' });
  }

  if (/\b(I am writing to apply|I am writing to express|I would like to apply|Please accept my application|I wish to apply|I am applying for)\b/i.test(text)) {
    issues.push({ id: 'cliche_opener', label: 'Weak opening line', tip: '"I am writing to apply…" is the most discarded opener in HR. Lead with a specific result or bold claim instead.', severity: 'error' });
  }

  const firstSentence = text.trim().split(/[.!?]/)[0] ?? '';
  if (/^I[\s']/.test(firstSentence.trim())) {
    issues.push({ id: 'i_opener', label: 'Opening sentence starts with "I"', tip: 'HR studies show letters that open with an outcome or bold claim get 30% more read-time.', severity: 'warning' });
  }

  const genericPhrases: [string, string][] = [
    ['hard worker', 'Prove it with a specific achievement instead.'],
    ['team player', 'Everyone says this. Show a cross-functional project outcome instead.'],
    ['go-getter', 'This is a self-label. Replace with a concrete initiative you started.'],
    ['self-starter', 'Replace with an example of independent work and its result.'],
    ['think outside the box', 'Describe the unconventional thing you actually did.'],
    ['results-driven', "Show the results — don't just claim you're driven by them."],
    ['detail-oriented', 'Demonstrate it with an example.'],
    ['passionate about', 'Passion is shown through specific commitment, not claimed in text.'],
    ['highly motivated', 'This adds no information. Remove it and say what motivates you specifically.'],
    ['dynamic professional', 'Vague and dated. Replace with something specific.'],
    ['proven track record', 'Then prove it — cite the record (number, scope, outcome).'],
    ['fast learner', 'Self-assessments carry no weight. Show a quick-ramp example with a timeline.'],
    ['excited to leverage', 'This phrase signals AI generation. Use plain language.'],
  ];
  for (const [phrase, tip] of genericPhrases) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(text)) {
      issues.push({ id: `generic_${phrase.replace(/\s/g, '_')}`, label: `Generic phrase: "${phrase}"`, tip, severity: 'warning' });
      break;
    }
  }

  const outdatedPhrases = ['please find attached','please find enclosed','to whom it may concern','enclosed herewith','as per','kindly note','i beg to inform','i humbly apply','herein','aforementioned'];
  const foundOutdated = outdatedPhrases.find(p => new RegExp(p, 'i').test(text));
  if (foundOutdated) {
    issues.push({ id: 'outdated_phrase', label: `Outdated phrasing: "${foundOutdated}"`, tip: `"${foundOutdated}" reads like a 1980s form letter. Use plain, modern language.`, severity: 'error' });
  }

  const iCount = (text.match(/\bI\b/g) || []).length;
  if (iCount > 14) {
    issues.push({ id: 'i_overuse', label: `"I" appears ${iCount} times — too self-centred`, tip: "Reframe sentences to lead with what you deliver to the employer.", severity: 'warning' });
  }

  const sentenceStarts = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let run = 0; let maxRun = 0;
  for (const s of sentenceStarts) {
    if (/^I[\s']/.test(s)) { run++; maxRun = Math.max(maxRun, run); } else { run = 0; }
  }
  if (maxRun >= 3) {
    issues.push({ id: 'consecutive_i', label: `${maxRun} consecutive sentences start with "I"`, tip: 'This creates a monotonous rhythm that HR skims past. Vary your sentence openings.', severity: 'warning' });
  }

  const hasMetric = /\b(\d+[%$£€km]?|\d+,\d+|\d+\.\d+|[£$€]\d+|\d+\s*(percent|million|billion|thousand|users|clients|customers|team members|countries|months|weeks|years))\b/i.test(text);
  if (!hasMetric && wordCount >= 150) {
    issues.push({ id: 'no_metric', label: 'No quantified achievement', tip: 'HR gives 40% more weight to letters with at least one concrete number.', severity: 'error' });
  }

  if (/\b(salary|compensation|pay\b|remuneration|benefits package|expecting|expect to earn)\b/i.test(text)) {
    issues.push({ id: 'salary_mention', label: 'Salary mentioned in cover letter', tip: "Never discuss salary in a cover letter — it signals you're transactional before you've proven value.", severity: 'error' });
  }

  const lastPara = text.split(/\n\n+/).slice(-1)[0] ?? '';
  const hasCTA   = /\b(look forward|happy to|available|welcome the opportunity|discuss|interview|meet|connect|hear from|would love to talk)\b/i.test(lastPara);
  if (!hasCTA && wordCount >= 150) {
    issues.push({ id: 'no_cta', label: 'No call to action in closing', tip: 'End with a forward-looking invitation to interview or discuss.', severity: 'info' });
  }

  const aiWords = ['delve', 'synergize', 'synergise', 'utilize', 'utilise', 'leverage', 'spearhead', 'orchestrate', 'catalyze', 'catalyse', 'multifaceted'];
  const foundAI = aiWords.find(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
  if (foundAI) {
    issues.push({ id: 'ai_word', label: `AI-sounding word: "${foundAI}"`, tip: `"${foundAI}" is flagged by ATS and HR as a sign of AI generation.`, severity: 'warning' });
  }

  return issues;
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: { id: CoverLetterTemplate; label: string; desc: string; best: string }[] = [
  { id: 'modern',       label: 'Modern',       desc: 'Clean · Sans-serif',     best: 'Tech & Startups'      },
  { id: 'professional', label: 'Professional', desc: 'Classic · Serif',         best: 'Finance & Consulting' },
  { id: 'executive',    label: 'Executive',    desc: 'Navy header · Gold rule', best: 'Senior & Leadership'  },
  { id: 'academic',     label: 'Academic',     desc: 'Formal · Centred',        best: 'Academia & Research'  },
  { id: 'creative',     label: 'Creative',     desc: 'Bold accent sidebar',     best: 'Design & Marketing'   },
];

// ─── Template thumbnail ───────────────────────────────────────────────────────

const TemplateThumbnail: React.FC<{ id: CoverLetterTemplate; active: boolean }> = ({ id, active }) => {
  const base   = 'w-full h-[52px] rounded-lg overflow-hidden border-2 transition-all duration-150';
  const border = active ? 'border-[#1B2B4B] dark:border-[#C9A84C]' : 'border-zinc-200 dark:border-neutral-700';

  if (id === 'executive') return (
    <div className={`${base} ${border}`}>
      <div className="bg-[#1B2B4B] h-[25px] px-2 pt-[5px]">
        <div className="h-[5px] w-[55%] rounded-sm bg-white/85" />
        <div className="h-[3px] w-[40%] rounded-sm bg-white/40 mt-[3px]" />
      </div>
      <div className="bg-gradient-to-r from-[#C9A84C] to-[#e8c96e] h-[2.5px]" />
      <div className="bg-white px-2 pt-[3px] space-y-[2.5px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 w-[80%]" />
      </div>
    </div>
  );

  if (id === 'creative') return (
    <div className={`${base} ${border} flex`}>
      <div className="w-[5px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, #1B2B4B 0%, #C9A84C 100%)' }} />
      <div className="flex-1 bg-white px-2 pt-[5px] space-y-[3px]">
        <div className="h-[5px] rounded-sm bg-[#C9A84C] w-[50%]" />
        <div className="h-[2px] rounded-sm bg-zinc-200 w-[70%]" />
        <div className="h-[2px] rounded-sm bg-zinc-100 w-full mt-1" />
      </div>
    </div>
  );

  if (id === 'academic') return (
    <div className={`${base} ${border} bg-white pt-[5px] px-2`}>
      <div className="flex flex-col items-center gap-[2px] mb-1">
        <div className="h-[5px] rounded-sm bg-zinc-600 w-[45%]" />
        <div className="h-[2px] rounded-sm bg-zinc-300 w-[35%]" />
      </div>
      <div className="border-t-[1.5px] border-zinc-600 mb-[2px]" />
      <div className="space-y-[2.5px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 w-[85%]" />
      </div>
    </div>
  );

  if (id === 'professional') return (
    <div className={`${base} ${border} bg-white pt-[5px] px-2`}>
      <div className="h-[5px] rounded-sm bg-zinc-700 w-[50%] mb-[2px]" />
      <div className="h-[2px] rounded-sm bg-zinc-300 w-[38%]" />
      <div className="border-t-[1.5px] border-zinc-500 mt-[4px] mb-[2px]" />
      <div className="space-y-[2.5px]">
        <div className="h-[2px] rounded-sm bg-zinc-200 w-full" />
        <div className="h-[2px] rounded-sm bg-zinc-200 w-[80%]" />
      </div>
    </div>
  );

  return (
    <div className={`${base} ${border} bg-white`}>
      <div className="h-[3.5px]" style={{ background: 'linear-gradient(90deg, #1B2B4B 65%, #C9A84C 100%)' }} />
      <div className="px-2 pt-[4px] space-y-[3px]">
        <div className="h-[5px] rounded-sm bg-[#1B2B4B]/80 w-[50%]" />
        <div className="h-[2px] rounded-sm bg-zinc-300 w-[38%]" />
        <div className="border-b border-zinc-100 mt-[2px] mb-[2px]" />
        <div className="h-[2px] rounded-sm bg-zinc-200 w-full" />
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
  const contact = [personalInfo?.email, personalInfo?.phone, personalInfo?.location].filter(Boolean).join('  ·  ');
  const links   = [personalInfo?.linkedin, personalInfo?.website].filter(Boolean).join('  ·  ');
  if (!name && !contact) return null;

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  if (template === 'executive') return (
    <div className="relative -mx-10 sm:-mx-14 -mt-10 sm:-mt-14 mb-8 px-10 sm:px-14 pt-10 sm:pt-12 pb-6 bg-[#1B2B4B]">
      <div className="flex justify-between items-start">
        <div>
          {name    && <h1 className="font-serif text-2xl font-bold text-white mb-1 leading-tight">{name}</h1>}
          {contact && <p className="text-[11px] text-white/65 tracking-wide">{contact}</p>}
          {links   && <p className="text-[11px] text-[#C9A84C] mt-1">{links}</p>}
        </div>
        <p className="text-[10px] text-white/45 flex-shrink-0 ml-6 mt-1">{today}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#C9A84C] via-[#e8c96e] to-[#C9A84C]" />
    </div>
  );

  if (template === 'creative') return (
    <div className="mb-7 pb-5 border-b border-zinc-100">
      {name    && <h1 className="font-sans text-xl font-bold text-[#C9A84C] mb-1">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-400">{contact}</p>}
      {links   && <p className="text-[11px] text-[#1B2B4B] mt-1 font-medium">{links}</p>}
      <p className="text-[10px] text-zinc-400 mt-2">{today}</p>
    </div>
  );

  if (template === 'academic') return (
    <div className="mb-7 text-center">
      {name    && <h1 className="font-serif text-xl font-semibold text-zinc-800 mb-1">{name}</h1>}
      {contact && <p className="text-[11px] text-zinc-500">{contact}</p>}
      {links   && <p className="text-[11px] text-zinc-500 italic mt-0.5">{links}</p>}
      <p className="text-[10px] text-zinc-400 mt-1.5 text-right">{today}</p>
      <div className="mt-2 border-t-2 border-zinc-700" />
      <div className="mt-0.5 border-t border-zinc-400 mb-3" />
    </div>
  );

  if (template === 'professional') return (
    <div className="mb-7">
      <div className="flex justify-between items-start">
        <div>
          {name    && <h1 className="font-serif text-xl font-semibold text-zinc-800 mb-1">{name}</h1>}
          {contact && <p className="text-[11px] text-zinc-500">{contact}</p>}
          {links   && <p className="text-[11px] text-zinc-400 italic mt-0.5">{links}</p>}
        </div>
        <p className="text-[10px] text-zinc-400 flex-shrink-0 ml-6 mt-1">{today}</p>
      </div>
      <div className="mt-3.5 border-t-[1.5px] border-zinc-500" />
      <div className="mt-0.5 border-t border-zinc-300 mb-3" />
    </div>
  );

  // Modern (default)
  return (
    <div className="mb-7 pb-5 border-b border-zinc-100">
      <div className="flex justify-between items-start">
        <div>
          {name    && <h1 className="font-sans text-xl font-bold text-[#1B2B4B] mb-1 tracking-tight">{name}</h1>}
          {contact && <p className="text-[11px] text-zinc-400">{contact}</p>}
          {links   && <p className="text-[11px] text-[#1B2B4B]/60 mt-0.5 font-medium">{links}</p>}
        </div>
        <p className="text-[10px] text-zinc-400 flex-shrink-0 ml-6 mt-1">{today}</p>
      </div>
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
  const formatted = formatLetterForDisplay(text);

  if (isEditing) return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onBlur(formatLetterForDisplay(e.currentTarget.innerText))}
      className={`outline-none text-sm leading-[1.80] text-zinc-700 whitespace-pre-wrap ${fontClass}`}
    >
      {formatted}
    </div>
  );

  const paragraphs = formatted.split(/\n\n+/).filter(Boolean);
  return (
    <div className={`text-sm leading-[1.80] text-zinc-700 space-y-[14px] ${fontClass}`}>
      {paragraphs.map((para, i) => (
        <p key={i}>{para.split('\n').map((line, j) => (
          <React.Fragment key={j}>{j > 0 && <br />}{line}</React.Fragment>
        ))}</p>
      ))}
    </div>
  );
};

// ─── Circular word-count gauge ────────────────────────────────────────────────

const WordGauge: React.FC<{ wordCount: number }> = ({ wordCount }) => {
  const TARGET_MAX = 240;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(wordCount / TARGET_MAX, 1.1); // allow slight overshoot to show red
  const dash = Math.min(pct * circ, circ);

  const inRange  = wordCount >= 200 && wordCount <= 240;
  const tooShort = wordCount < 200;
  const tooLong  = wordCount > 280;
  const slightlyOff = !inRange && !tooLong;

  const gaugeColor =
    inRange      ? '#22c55e'  :
    tooLong      ? '#ef4444'  :
    tooShort && wordCount < 180 ? '#ef4444' :
    '#f59e0b';

  const label =
    inRange      ? 'Perfect'     :
    wordCount < 180 ? 'Too short'  :
    wordCount < 200 ? 'Getting there' :
    wordCount > 280 ? 'Too long'   :
    'Over target';

  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <div className="relative w-[100px] h-[100px]">
        {/* Background track */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="9"
            className="text-zinc-100 dark:text-neutral-800" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={gaugeColor} strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s' }}
          />
        </svg>
        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 leading-none">{wordCount}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 mt-0.5">words</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold" style={{ color: gaugeColor }}>{label}</span>
      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
        <span>Target:</span>
        <span className="font-semibold text-zinc-600 dark:text-zinc-300">200–240</span>
      </div>
    </div>
  );
};

// ─── Quality Panel (right sidebar) ───────────────────────────────────────────

const QUALITY_RULES = [
  'Word count in range (200–240)',
  '4 complete paragraphs',
  'No clichés detected',
  'No AI buzzwords',
  'Uses specific examples',
  'Shows clear value',
  'Tailored to job',
  'Professional tone',
  'Proper formatting',
  'No experience gaps',
  'Grammar & spelling',
];

const QualityPanel: React.FC<{
  issues: CLIssue[];
  wordCount: number;
  loading: boolean;
  onDownload: () => void;
}> = ({ issues, wordCount, loading, onDownload }) => {
  const [expandIssue, setExpandIssue] = useState<string | null>(null);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount  = issues.filter(i => i.severity === 'warning').length;
  const allClear   = issues.length === 0 && wordCount >= 200 && wordCount <= 240;

  const overallLabel =
    errorCount > 0 ? 'Needs Work' :
    warnCount  > 0 ? 'Good'       :
    allClear       ? 'Excellent'  : 'Review';

  const overallColor =
    errorCount > 0 ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40' :
    warnCount  > 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40' :
                     'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/40';

  // Map rule labels to issue ids for checking
  const passedRules = QUALITY_RULES.filter(r => {
    if (r.includes('Word count'))   return wordCount >= 200 && wordCount <= 240;
    if (r.includes('No clichés'))   return !issues.find(i => i.id === 'cliche_opener' || i.id === 'i_opener');
    if (r.includes('AI buzzwords')) return !issues.find(i => i.id === 'ai_word');
    if (r.includes('No experience')) return true; // checked elsewhere
    if (r.includes('Grammar'))      return true; // always pass (no grammar check)
    return !issues.some(i =>
      (r.toLowerCase().includes('metric') && i.id === 'no_metric') ||
      (r.toLowerCase().includes('call to action') && i.id === 'no_cta')
    );
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">HR Quality Check</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${overallColor}`}>
          {overallLabel}
        </span>
      </div>

      {/* Gauge */}
      <div className="rounded-2xl border border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900/60">
        <WordGauge wordCount={wordCount} />

        {/* Quick stats */}
        <div className="px-4 pb-4 grid grid-cols-3 divide-x divide-zinc-100 dark:divide-neutral-800 text-center">
          <div className="pr-2">
            <p className="text-[10px] font-bold text-[#1B2B4B] dark:text-[#C9A84C]">200–240</p>
            <p className="text-[9px] text-zinc-400 leading-tight">target words</p>
          </div>
          <div className="px-2">
            <p className="text-[10px] font-bold text-[#1B2B4B] dark:text-[#C9A84C]">
              {issues.length === 0 ? '✓ All' : `${11 - Math.min(issues.length, 11)}/11`}
            </p>
            <p className="text-[9px] text-zinc-400 leading-tight">rules passed</p>
          </div>
          <div className="pl-2">
            <p className={`text-[10px] font-bold ${errorCount > 0 ? 'text-red-500' : warnCount > 0 ? 'text-amber-500' : 'text-green-600'}`}>
              {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : warnCount > 0 ? `${warnCount} warn` : 'Clear'}
            </p>
            <p className="text-[9px] text-zinc-400 leading-tight">status</p>
          </div>
        </div>
      </div>

      {/* Rule checklist */}
      <div className="rounded-2xl border border-zinc-100 dark:border-neutral-800 overflow-hidden flex-1">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-neutral-900/60 border-b border-zinc-100 dark:border-neutral-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Rule Check (11 Rules)</p>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-neutral-800/60 bg-white dark:bg-neutral-900">
          {QUALITY_RULES.map((rule, i) => {
            // Find matching issue
            const related = issues.find(iss =>
              (rule.includes('Word count')   && (iss.id === 'too_short' || iss.id === 'too_long' || iss.id === 'slightly_short' || iss.id === 'slightly_long')) ||
              (rule.includes('No clichés')   && (iss.id === 'cliche_opener' || iss.id === 'i_opener')) ||
              (rule.includes('AI buzzwords') && iss.id === 'ai_word') ||
              (rule.includes('specific examples') && (iss.id === 'no_metric' || iss.id.startsWith('generic_'))) ||
              (rule.includes('clear value')  && iss.id === 'no_metric') ||
              (rule.includes('paragraphs')   && (iss.id === 'too_short' || iss.id === 'too_long'))
            );
            const pass    = !related;
            const isOpen  = expandIssue === (related?.id ?? rule);

            return (
              <button
                key={rule}
                onClick={() => related && setExpandIssue(isOpen ? null : (related.id ?? rule))}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors ${related ? 'hover:bg-zinc-50 dark:hover:bg-neutral-800/60 cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${pass ? 'bg-green-100 dark:bg-green-900/30' : related?.severity === 'error' ? 'bg-red-100 dark:bg-red-900/30' : related?.severity === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  {pass ? (
                    <svg className="w-2.5 h-2.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className={`w-1.5 h-1.5 rounded-full ${related?.severity === 'error' ? 'bg-red-500' : related?.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] leading-snug ${pass ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-200 font-medium'}`}>
                    {related ? related.label : rule}
                  </p>
                  {isOpen && related && (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{related.tip}</p>
                  )}
                </div>
                {related && (
                  <svg className={`w-3 h-3 text-zinc-400 flex-shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* All clear */}
        {issues.length === 0 && (
          <div className="px-4 py-3 bg-green-50 dark:bg-green-950/20 border-t border-green-100 dark:border-green-900/40 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">All checks passed · Ready to send</p>
          </div>
        )}
      </div>

      {/* Download button */}
      <button
        onClick={onDownload}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#1B2B4B]/20"
        style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #243a63 100%)' }}
      >
        {loading ? (
          <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Generating…</>
        ) : (
          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Download PDF</>
        )}
      </button>
    </div>
  );
};

// ─── Download progress overlay ────────────────────────────────────────────────

const DOWNLOAD_STEPS = [
  { key: 'prepare', label: 'Building layout',  detail: 'Composing HTML template…' },
  { key: 'render',  label: 'Rendering PDF',     detail: 'Running headless Chrome…'  },
  { key: 'save',    label: 'Saving file',       detail: 'Writing PDF to disk…'      },
];

function statusToStep(status: string): number {
  const s = status.toLowerCase();
  if (s.includes('render') || s.includes('cloud') || s.includes('worker')) return 1;
  if (s.includes('sav') || s.includes('done') || s.includes('complete'))   return 2;
  return 0;
}

const DownloadOverlay: React.FC<{ status: string }> = ({ status }) => {
  const step = statusToStep(status);
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Generating cover letter PDF"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 px-8 py-9 flex flex-col items-center gap-6 w-full max-w-sm mx-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#C9A84C]/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-[#1B2B4B] dark:text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 3v6h6" />
            </svg>
          </div>
          <span className="absolute inset-0 rounded-2xl animate-ping opacity-20 bg-[#1B2B4B] dark:bg-[#C9A84C]" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">Creating your PDF…</p>
          <p className="text-xs text-zinc-400 mt-1">{status || 'Preparing…'}</p>
        </div>
        <ol className="w-full space-y-3">
          {DOWNLOAD_STEPS.map((s, idx) => {
            const done = idx < step; const active = idx === step; const pending = idx > step;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors duration-300
                  ${done ? 'bg-green-500 text-white' : ''}
                  ${active ? 'text-white animate-pulse' : ''}
                  ${pending ? 'bg-zinc-100 dark:bg-neutral-800 text-zinc-400' : ''}`}
                  style={active ? { backgroundColor: '#1B2B4B' } : undefined}
                >
                  {done
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <span>{idx + 1}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-tight
                    ${done ? 'text-green-600 dark:text-green-400' : ''}
                    ${active ? 'text-zinc-900 dark:text-zinc-50' : ''}
                    ${pending ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>{s.label}</p>
                  {active && <p className="text-[11px] text-zinc-400 mt-0.5">{s.detail}</p>}
                </div>
                {idx < DOWNLOAD_STEPS.length - 1 && (
                  <div className={`ml-auto h-px w-6 flex-shrink-0 ${done ? 'bg-green-400' : 'bg-zinc-200 dark:bg-neutral-700'}`} />
                )}
              </li>
            );
          })}
        </ol>
        <div className="w-full h-1 rounded-full bg-zinc-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.round(((step + 0.5) / DOWNLOAD_STEPS.length) * 100)}%`, background: 'linear-gradient(90deg, #1B2B4B, #C9A84C)' }}
          />
        </div>
        <p className="text-[11px] text-zinc-300 dark:text-zinc-600">This usually takes 5–15 seconds</p>
      </div>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyStatePlaceholder: React.FC<{ template: CoverLetterTemplate; personalInfo?: PersonalInfo }> = ({ template, personalInfo }) => {
  const fontClass = template === 'professional' || template === 'executive' || template === 'academic' ? 'font-serif' : 'font-sans';
  const name = personalInfo?.name || 'Your Name';

  const GhostLine: React.FC<{ w?: string }> = ({ w = 'w-full' }) => (
    <div className={`h-2.5 rounded-sm bg-zinc-100 animate-pulse ${w}`} />
  );

  return (
    <div className="relative h-full min-h-[500px]">
      <div
        className={`rounded-2xl overflow-hidden opacity-60 h-full
          ${template === 'creative' ? 'border-l-[7px] border-l-[#1B2B4B]' : ''}
          ${template === 'modern'   ? 'border-t-[4px] border-t-[#1B2B4B]' : ''}
        `}
        style={{ background: '#fff', colorScheme: 'light' }}
      >
        <div className="px-10 py-10 min-h-[500px]">
          <div className="mb-7 pb-5 border-b border-zinc-100">
            <h1 className={`text-xl font-bold text-zinc-300 mb-2 ${fontClass}`}>{name}</h1>
            <div className="flex gap-2"><GhostLine w="w-32" /><GhostLine w="w-24" /></div>
          </div>
          <div className="space-y-5">
            <GhostLine w="w-40" />
            {[['w-full','w-full','w-4/5'],['w-full','w-full','w-11/12','w-3/4'],['w-full','w-full','w-4/5'],['w-3/5','w-32']].map((lines, gi) => (
              <div key={gi} className="space-y-2 pt-1">{lines.map((w, li) => <GhostLine key={li} w={w} />)}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 text-center max-w-xs mx-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#1B2B4B10' }}>
            <svg className="w-6 h-6" style={{ color: '#1B2B4B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-800 mb-1.5">Your cover letter will appear here</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Click <span className="font-semibold text-zinc-600">"Generate Cover Letter"</span> above to create a tailored, one-page letter — strictly 200–240 words.
          </p>
          <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] font-bold" style={{ color: '#1B2B4B' }}>240</p><p className="text-[9px] text-zinc-400">word cap</p></div>
            <div><p className="text-[10px] font-bold" style={{ color: '#1B2B4B' }}>1 page</p><p className="text-[9px] text-zinc-400">strict</p></div>
            <div><p className="text-[10px] font-bold" style={{ color: '#1B2B4B' }}>11 HR</p><p className="text-[9px] text-zinc-400">checks</p></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const CoverLetterPreview: React.FC<CoverLetterPreviewProps> = ({
  letterText,
  onTextChange,
  fileName,
  personalInfo,
  onSave,
}) => {
  const [copied,    setCopied]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [template,  setTemplate]  = useState<CoverLetterTemplate>('modern');
  const [status,    setStatus]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const wordCount = useMemo(
    () => letterText.trim().split(/\s+/).filter(Boolean).length,
    [letterText],
  );

  const issues  = useMemo(() => checkCoverLetter(letterText), [letterText]);
  const isEmpty = !letterText || wordCount < 10;

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

  const fontClass = template === 'professional' || template === 'executive' || template === 'academic'
    ? 'font-serif' : 'font-sans';

  const paperBorderClass =
    template === 'creative' ? 'border-l-[7px] border-l-[#1B2B4B]' :
    template === 'modern'   ? 'border-t-[4px] border-t-[#1B2B4B]' : '';

  return (
    <div className="space-y-5">
      {loading && <DownloadOverlay status={status} />}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cover Letter</h2>
            {!isEmpty && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                issues.filter(i => i.severity === 'error').length > 0
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40'
                  : issues.filter(i => i.severity === 'warning').length > 0
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40'
                  : 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/40'
              }`}>
                {issues.filter(i => i.severity === 'error').length > 0 ? 'Needs Work'
                  : issues.filter(i => i.severity === 'warning').length > 0 ? 'Good'
                  : 'Excellent'}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            AI-generated · tailored to your CV and the job description
          </p>
        </div>

        {/* Action buttons */}
        {!isEmpty && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={() => setIsEditing(e => !e)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-neutral-800 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-neutral-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-neutral-800 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
            >
              {copied
                ? <><svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Copied</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
              }
            </button>
            {onSave && (
              <button
                onClick={() => {
                  onSave({ wordCount, issueCount: issues.length });
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={saved
                  ? { borderColor: '#22c55e', color: '#16a34a', background: '#f0fdf4' }
                  : { borderColor: '#1B2B4B', color: '#1B2B4B', background: '#1B2B4B0D' }
                }
              >
                {saved
                  ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Saved!</>
                  : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>Save</>
                }
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* ── 3-column grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[176px_1fr_256px] gap-6 items-start">

        {/* ── Col 1: Template picker ─────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Template</p>
          <div className="space-y-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`w-full text-left rounded-xl overflow-hidden border-2 transition-all duration-150 ${
                  template === t.id
                    ? 'border-[#1B2B4B] dark:border-[#C9A84C] shadow-sm shadow-[#1B2B4B]/10'
                    : 'border-transparent hover:border-zinc-200 dark:hover:border-neutral-600'
                }`}
              >
                <TemplateThumbnail id={t.id} active={template === t.id} />
                <div className={`px-2.5 py-2 ${
                  template === t.id
                    ? 'bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/8'
                    : 'bg-white dark:bg-neutral-800'
                }`}>
                  <p className={`text-xs font-semibold ${
                    template === t.id ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-700 dark:text-zinc-300'
                  }`}>{t.label}</p>
                  <p className="text-[9.5px] text-zinc-400">{t.desc}</p>
                  <p className="text-[9px] text-zinc-400/60 mt-0.5">{t.best}</p>
                </div>
              </button>
            ))}
          </div>

          {/* HR rules enforced */}
          <div className="pt-1 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-100 dark:border-neutral-700 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-2">HR rules enforced</p>
            {['200–240 word limit','No cliché opener','Metric required','Call to action','No AI buzzwords','No salary mention'].map(rule => (
              <div key={rule} className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{rule}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 2: Letter preview ──────────────────────────────────────── */}
        <div>
          {isEmpty ? (
            <EmptyStatePlaceholder template={template} personalInfo={personalInfo} />
          ) : (
            <div className="relative">
              {isEditing && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-white text-[11px] font-semibold shadow-lg"
                  style={{ backgroundColor: '#C9A84C' }}>
                  Editing — click outside to save
                </div>
              )}

              {/* Paper — always light, isolated from dark mode */}
              <div
                className={`rounded-2xl overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.10)] ${isEditing ? 'ring-2 ring-[#C9A84C]/50' : ''} ${paperBorderClass}`}
                style={{
                  // Dark-mode isolation: the letter is always a white document
                  background: '#ffffff',
                  colorScheme: 'light',
                  color: '#1a1a1a',
                  ['--background' as string]: '0 0% 100%',
                  ['--foreground' as string]: '240 10% 3.9%',
                }}
              >
                <div className="px-10 sm:px-14 py-10 sm:py-14 min-h-[600px]">
                  <LetterHeader template={template} personalInfo={personalInfo} />
                  <LetterBody
                    text={letterText}
                    fontClass={fontClass}
                    isEditing={isEditing}
                    onBlur={onTextChange}
                  />
                </div>
              </div>

              {/* Word count strip */}
              <div className="mt-3 px-1 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${
                    wordCount >= 200 && wordCount <= 240 ? 'text-green-600 dark:text-green-400' :
                    wordCount > 240 || wordCount < 180  ? 'text-red-500 dark:text-red-400' :
                    'text-amber-500 dark:text-amber-400'
                  }`}>
                    {wordCount} words
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span className="text-zinc-400">target 200–240</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-400">
                  <span>{Math.ceil(wordCount / 60)} min read</span>
                  <span>·</span>
                  <span>~1 page</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    wordCount >= 200 && wordCount <= 240 ? 'bg-green-500' :
                    wordCount > 240 || wordCount < 180  ? 'bg-red-400' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min((wordCount / 240) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-zinc-300 dark:text-zinc-600">180</span>
                <span className="text-[9px] text-zinc-400">200 ← ideal → 240</span>
                <span className="text-[9px] text-zinc-300 dark:text-zinc-600">280</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Col 3: Quality panel ───────────────────────────────────────── */}
        {!isEmpty ? (
          <QualityPanel
            issues={issues}
            wordCount={wordCount}
            loading={loading}
            onDownload={handleDownload}
          />
        ) : (
          <div className="rounded-2xl border border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900/60 p-5 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#1B2B4B10' }}>
              <svg className="w-5 h-5" style={{ color: '#1B2B4B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">HR Quality Check</p>
              <p className="text-[10px] text-zinc-400 mt-1">11 instant checks run after generation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverLetterPreview;
