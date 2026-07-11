import React, { useState, useMemo } from 'react';
import {
  generateNegotiationPackage,
  generateRaisePackage,
  NegotiationInput,
  NegotiationOutput,
  RaiseOutput,
  NegotiationMode,
} from '../services/negotiationService';
import type { UserProfile } from '../types';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const NEW_OFFER_TABS = [
  { id: 'counterOfferEmail',    label: 'Counter-Offer Email',  icon: '✉️' },
  { id: 'talkTrack',            label: 'Talk Track',           icon: '🎙️' },
  { id: 'geographicPushback',   label: 'Geo Pushback',         icon: '🌍' },
  { id: 'competingOfferLeverage', label: 'Competing Offer',    icon: '⚡' },
  { id: 'equityGuide',          label: 'Equity Guide',         icon: '📈' },
  { id: 'benefitsChecklist',    label: 'Benefits',             icon: '✅' },
] as const;

const RAISE_TABS = [
  { id: 'raiseRequestEmail',    label: 'Raise Email',          icon: '✉️' },
  { id: 'talkTrack',            label: 'Talk Track',           icon: '🎙️' },
  { id: 'marketDataArgument',   label: 'Market Data',          icon: '📊' },
  { id: 'handlingObjections',   label: 'Objections',           icon: '🛡️' },
  { id: 'timingStrategy',       label: 'Timing',               icon: '⏱️' },
  { id: 'benefitsChecklist',    label: 'Alternatives',         icon: '✅' },
] as const;

type NewOfferTabId = typeof NEW_OFFER_TABS[number]['id'];
type RaiseTabId    = typeof RAISE_TABS[number]['id'];

// ─── Markdown renderer with inline bold/italic/code support ──────────────────

function renderInline(text: string): React.ReactNode[] {
  // Parse **bold**, *italic*, `code` inline
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    if (match[2]) parts.push(<strong key={key++} className="font-bold text-zinc-900 dark:text-zinc-100">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-neutral-700 font-mono text-xs">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return parts;
}

interface ChecklistState { [lineKey: string]: boolean }

function MarkdownBlock({ content }: { content: string }) {
  const [checked, setChecked] = useState<ChecklistState>({});
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith('## '))
          return <h3 key={i} className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-5 mb-1.5 pb-1 border-b border-zinc-100 dark:border-neutral-700">{renderInline(line.slice(3))}</h3>;
        if (line.startsWith('# '))
          return <h2 key={i} className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 mt-4 mb-2">{renderInline(line.slice(2))}</h2>;
        if (line.startsWith('Subject:'))
          return <p key={i} className="text-sm font-bold text-[#1B2B4B] dark:text-[#C9A84C]/80 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 px-3 py-2 rounded-lg">{renderInline(line)}</p>;
        // Interactive checkbox items
        if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
          const isChecked = checked[`${i}`] ?? line.startsWith('- [x]');
          const label = line.slice(6);
          return (
            <div key={i}
                 className="flex items-start gap-2.5 py-1 px-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/40 cursor-pointer transition-colors group"
                 onClick={() => setChecked(prev => ({ ...prev, [`${i}`]: !isChecked }))}>
              <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                isChecked ? 'bg-[#1B2B4B] border-[#1B2B4B]' : 'border-zinc-300 dark:border-zinc-600 group-hover:border-[#1B2B4B]/50'
              }`}>
                {isChecked && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className={`text-sm leading-relaxed transition-colors ${isChecked ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {renderInline(label)}
              </span>
            </div>
          );
        }
        if (line.startsWith('- '))
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[#C9A84C] mt-1.5 flex-shrink-0 text-xs">●</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{renderInline(line.slice(2))}</span>
            </div>
          );
        if (line.startsWith('> '))
          return <blockquote key={i} className="border-l-4 border-[#C9A84C]/60 pl-3 text-sm italic text-zinc-600 dark:text-zinc-400 my-2">{renderInline(line.slice(2))}</blockquote>;
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  apiKeySet: boolean;
  openSettings: () => void;
  userProfile?: UserProfile | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const NegotiationCoach: React.FC<Props> = ({ apiKeySet, openSettings, userProfile }) => {
  const [mode, setMode] = useState<NegotiationMode>('new-offer');

  // Auto-populate from profile
  const latestJob = userProfile?.workExperience?.[0];
  const profileLocation = userProfile?.personalInfo?.location ?? '';

  const [input, setInput] = useState<NegotiationInput>({
    mode: 'new-offer',
    roleTitle:    latestJob?.jobTitle ?? '',
    company:      '',
    offeredSalary: '',
    targetSalary: '',
    currentSalary: '',
    location:     profileLocation,
    yearsExperience: '',
    equityOffered: '',
    competingOffers: '',
    offerDeadline: '',
    notes: '',
    performanceHighlights: '',
    timeSinceLastRaise: '',
    marketDataPoints: '',
  });

  const [newOfferOutput, setNewOfferOutput] = useState<NegotiationOutput | null>(null);
  const [raiseOutput,    setRaiseOutput]    = useState<RaiseOutput | null>(null);
  const [activeNewTab,   setActiveNewTab]   = useState<NewOfferTabId>('counterOfferEmail');
  const [activeRaiseTab, setActiveRaiseTab] = useState<RaiseTabId>('raiseRequestEmail');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);

  const isRaise = mode === 'raise';
  const output = isRaise ? raiseOutput : newOfferOutput;

  // Salary gap calculation
  const salaryGap = useMemo(() => {
    const offered = parseFloat((input.offeredSalary || '').replace(/[^0-9.]/g, ''));
    const target  = parseFloat((input.targetSalary  || '').replace(/[^0-9.]/g, ''));
    if (!offered || !target || offered <= 0) return null;
    const diff    = target - offered;
    const pct     = Math.round((diff / offered) * 100);
    return { diff, pct, offered, target };
  }, [input.offeredSalary, input.targetSalary]);

  const handleGenerate = async () => {
    const label = isRaise ? 'Current Salary' : 'Offered Salary';
    if (!input.roleTitle || !input.company || !input.offeredSalary || !input.targetSalary) {
      setError(`Please fill in Role, Company, ${label}, and Target Salary.`);
      return;
    }
    if (!apiKeySet) { openSettings(); return; }
    setLoading(true);
    setError(null);
    try {
      if (isRaise) {
        const result = await generateRaisePackage({ ...input, mode: 'raise' });
        setRaiseOutput(result);
        setActiveRaiseTab('raiseRequestEmail');
      } else {
        const result = await generateNegotiationPackage({ ...input, mode: 'new-offer' });
        setNewOfferOutput(result);
        setActiveNewTab('counterOfferEmail');
      }
    } catch (e: any) {
      setError(e.message || 'Generation failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  };

  const currentTabContent = (): string => {
    if (!output) return '';
    if (isRaise) {
      return (raiseOutput as any)?.[activeRaiseTab] ?? '';
    }
    return (newOfferOutput as any)?.[activeNewTab] ?? '';
  };

  const handleCopy = () => {
    const text = currentTabContent();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Field = ({
    label, field, placeholder, half, raiseOnly, newOnly,
  }: {
    label: string; field: keyof NegotiationInput; placeholder: string;
    half?: boolean; raiseOnly?: boolean; newOnly?: boolean;
  }) => {
    if (raiseOnly && !isRaise) return null;
    if (newOnly && isRaise) return null;
    return (
      <div className={half ? '' : 'col-span-2 md:col-span-1'}>
        <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
        <input
          value={input[field] as string}
          onChange={e => setInput(p => ({ ...p, [field]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] transition"
        />
      </div>
    );
  };

  const tabs = isRaise ? RAISE_TABS : NEW_OFFER_TABS;
  const activeTab = isRaise ? activeRaiseTab : activeNewTab;
  const setActiveTab = (id: string) => {
    if (isRaise) setActiveRaiseTab(id as RaiseTabId);
    else         setActiveNewTab(id as NewOfferTabId);
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Salary Negotiation Coach</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            AI-generated negotiation scripts, counter-offers, and talk tracks tailored to your situation.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center bg-zinc-100 dark:bg-neutral-700 rounded-xl p-1 gap-1 flex-shrink-0">
          {([
            { id: 'new-offer', label: '📥 New Offer' },
            { id: 'raise',     label: '📈 Ask for a Raise' },
          ] as { id: NegotiationMode; label: string }[]).map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setError(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                mode === m.id
                  ? 'bg-white dark:bg-neutral-800 text-[#1B2B4B] dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Input panel */}
        <div className="xl:col-span-2 bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6 space-y-4">
          <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <span className="w-6 h-6 bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 rounded-lg flex items-center justify-center text-xs">
              {isRaise ? '💼' : '📋'}
            </span>
            {isRaise ? 'Raise Details' : 'Offer Details'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Role Title *" field="roleTitle" placeholder="Senior Software Engineer" />
            </div>
            <div className="col-span-2">
              <Field label="Company *" field="company" placeholder="Acme Corp" />
            </div>

            <Field label={isRaise ? 'Current Salary *' : 'Offer Received *'} field="offeredSalary"
                   placeholder={isRaise ? '$105,000' : '$120,000'} half />
            <Field label="Your Target *" field="targetSalary"
                   placeholder={isRaise ? '$135,000' : '$145,000'} half />

            {/* Salary gap indicator */}
            {salaryGap && (
              <div className="col-span-2">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                  salaryGap.pct <= 10
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                    : salaryGap.pct <= 25
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                }`}>
                  <span className="text-base">
                    {salaryGap.pct <= 10 ? '✅' : salaryGap.pct <= 25 ? '⚡' : '🎯'}
                  </span>
                  <span>
                    {salaryGap.pct > 0
                      ? `+${salaryGap.pct}% above ${isRaise ? 'current' : 'offer'} — ${salaryGap.pct <= 10 ? 'conservative ask' : salaryGap.pct <= 25 ? 'reasonable target' : 'ambitious — lead with strong evidence'}`
                      : salaryGap.pct < 0
                      ? 'Target is below offer — adjust your target'
                      : 'No gap — adjust your target'}
                  </span>
                </div>
              </div>
            )}

            {!isRaise && (
              <Field label="Current Salary" field="currentSalary" placeholder="$105,000" half />
            )}
            <Field label="Location" field="location" placeholder="San Francisco, CA" half />
            <Field label={isRaise ? 'Time in Role' : 'Years of Experience'} field="yearsExperience"
                   placeholder={isRaise ? '2 years' : '7 years'} half />

            {isRaise ? (
              <>
                <Field label="Time Since Last Raise" field="timeSinceLastRaise"
                       placeholder="18 months" half raiseOnly />
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Key Achievements
                  </label>
                  <textarea
                    value={input.performanceHighlights}
                    onChange={e => setInput(p => ({ ...p, performanceHighlights: e.target.value }))}
                    placeholder="e.g. Delivered X project 2 weeks early, grew team revenue by 30%..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] transition resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Market Data / Context
                  </label>
                  <textarea
                    value={input.marketDataPoints}
                    onChange={e => setInput(p => ({ ...p, marketDataPoints: e.target.value }))}
                    placeholder="e.g. Glassdoor shows £95k median, I have an offer at £100k..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] transition resize-none"
                  />
                </div>
              </>
            ) : (
              <>
                <Field label="Offer Deadline" field="offerDeadline" placeholder="5 business days" half newOnly />
                <div className="col-span-2">
                  <Field label="Equity Offered" field="equityOffered" placeholder="0.1% over 4 years, $2M valuation" />
                </div>
                <div className="col-span-2">
                  <Field label="Competing Offers" field="competingOffers" placeholder="Offer from Stripe at $135k" />
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Additional Context
            </label>
            <textarea
              value={input.notes}
              onChange={e => setInput(p => ({ ...p, notes: e.target.value }))}
              placeholder={isRaise
                ? 'e.g. My manager is supportive, budget cycle is Q4, I know a colleague at same level earns more...'
                : 'e.g. They seemed very interested, I have 3 competing interviews...'}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] transition resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-[#1B2B4B] hover:bg-[#152238] disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {isRaise ? 'Building your raise package…' : 'Generating your package…'}
              </>
            ) : (
              isRaise ? '📈 Generate Raise Package' : '⚡ Generate Negotiation Package'
            )}
          </button>

          {/* Quick tips */}
          {!output && !loading && (
            <div className="rounded-xl bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 p-3 space-y-1.5">
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {isRaise ? '📌 Raise Tips' : '📌 Negotiation Tips'}
              </p>
              {(isRaise ? [
                'Never negotiate against yourself — let them make the first move.',
                'Best time: performance review cycles or after a clear win.',
                'Prepare 3 data points: your achievements, market rate, internal equity.',
              ] : [
                'Always counter — 9 in 10 recruiters expect it.',
                'Anchor 15–20% above target; you can always come down.',
                'Never give a number first — let them make the offer.',
              ]).map((tip, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-[#C9A84C] text-xs mt-0.5">•</span>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Output panel */}
        <div className="xl:col-span-3 bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-zinc-200 dark:border-neutral-700 no-scrollbar">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === t.id
                    ? 'border-[#1B2B4B] text-[#1B2B4B] dark:text-[#C9A84C]'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-y-auto min-h-[400px]">
            {!output && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-16 h-16 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 rounded-2xl flex items-center justify-center mb-4 text-3xl">
                  {isRaise ? '📈' : '💰'}
                </div>
                <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                  {isRaise ? 'Your raise package will appear here' : 'Your negotiation scripts will appear here'}
                </h3>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-xs">
                  Fill in the details and click Generate to get copy-paste ready scripts for every scenario.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <svg className="animate-spin h-10 w-10 text-[#C9A84C] mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  {isRaise ? 'Building your raise package…' : 'Building your negotiation package…'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  {isRaise ? 'Crafting scripts for every objection…' : 'Analysing offer, market data & psychology…'}
                </p>
              </div>
            )}

            {output && !loading && (
              <MarkdownBlock content={currentTabContent()} />
            )}
          </div>

          {output && (
            <div className="border-t border-zinc-200 dark:border-neutral-700 px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-zinc-400">Click any tab to switch scripts</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setNewOfferOutput(null);
                    setRaiseOutput(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-100 dark:bg-neutral-700 hover:bg-zinc-200 dark:hover:bg-neutral-600 rounded-lg transition-colors text-zinc-600 dark:text-zinc-300"
                >
                  🔄 Regenerate
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#1B2B4B] hover:bg-[#152238] text-white rounded-lg transition-colors"
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NegotiationCoach;
