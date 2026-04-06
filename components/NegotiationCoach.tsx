import React, { useState } from 'react';
import { generateNegotiationPackage, NegotiationInput, NegotiationOutput } from '../services/negotiationService';

const tabs = [
  { id: 'email', label: 'Counter-Offer Email', icon: '✉️' },
  { id: 'talk', label: 'Talk Track', icon: '🎙️' },
  { id: 'geo', label: 'Geo Pushback', icon: '🌍' },
  { id: 'competing', label: 'Competing Offer', icon: '⚡' },
  { id: 'equity', label: 'Equity Guide', icon: '📈' },
  { id: 'benefits', label: 'Benefits Checklist', icon: '✅' },
] as const;

type TabId = typeof tabs[number]['id'];

function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-4 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 mt-4 mb-2">{line.slice(2)}</h2>;
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-zinc-800 dark:text-zinc-200">{line.slice(2, -2)}</p>;
        if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
          const checked = line.startsWith('- [x]');
          return (
            <div key={i} className="flex items-start gap-2 py-1">
              <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
                {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="currentColor"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{line.slice(6)}</span>
            </div>
          );
        }
        if (line.startsWith('- ')) return <div key={i} className="flex items-start gap-2"><span className="text-indigo-500 mt-1.5 flex-shrink-0">•</span><span className="text-sm text-zinc-700 dark:text-zinc-300">{line.slice(2)}</span></div>;
        if (line.startsWith('> ')) return <blockquote key={i} className="border-l-4 border-indigo-400 pl-3 text-sm italic text-zinc-600 dark:text-zinc-400 my-2">{line.slice(2)}</blockquote>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        if (line.startsWith('Subject:')) return <p key={i} className="text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg">{line}</p>;
        return <p key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

interface Props {
  apiKeySet: boolean;
  openSettings: () => void;
}

const NegotiationCoach: React.FC<Props> = ({ apiKeySet, openSettings }) => {
  const [input, setInput] = useState<NegotiationInput>({
    roleTitle: '', company: '', offeredSalary: '', targetSalary: '',
    currentSalary: '', location: '', yearsExperience: '',
    equityOffered: '', competingOffers: '', offerDeadline: '', notes: '',
  });
  const [output, setOutput] = useState<NegotiationOutput | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tabContent: Record<TabId, keyof NegotiationOutput> = {
    email: 'counterOfferEmail',
    talk: 'talkTrack',
    geo: 'geographicPushback',
    competing: 'competingOfferLeverage',
    equity: 'equityGuide',
    benefits: 'benefitsChecklist',
  };

  const handleGenerate = async () => {
    if (!input.roleTitle || !input.company || !input.offeredSalary || !input.targetSalary) {
      setError('Please fill in Role, Company, Offered Salary, and Target Salary.');
      return;
    }
    if (!apiKeySet) { openSettings(); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await generateNegotiationPackage(input);
      setOutput(result);
      setActiveTab('email');
    } catch (e: any) {
      setError(e.message || 'Generation failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output[tabContent[activeTab]]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Field = ({ label, field, placeholder, half }: { label: string; field: keyof NegotiationInput; placeholder: string; half?: boolean }) => (
    <div className={half ? '' : 'col-span-2 md:col-span-1'}>
      <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{label}</label>
      <input
        value={input[field] as string}
        onChange={e => setInput(p => ({ ...p, [field]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">Salary Negotiation Coach</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">AI-generated negotiation scripts, counter-offers, and talk tracks tailored to your situation.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Input panel */}
        <div className="xl:col-span-2 bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6 space-y-4">
          <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center text-xs">💼</span>
            Offer Details
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Role Title *" field="roleTitle" placeholder="Senior Software Engineer" /></div>
            <div className="col-span-2"><Field label="Company *" field="company" placeholder="Acme Corp" /></div>
            <Field label="Offer Received *" field="offeredSalary" placeholder="$120,000" half />
            <Field label="Your Target *" field="targetSalary" placeholder="$145,000" half />
            <Field label="Current Salary" field="currentSalary" placeholder="$105,000" half />
            <Field label="Location" field="location" placeholder="San Francisco, CA" half />
            <Field label="Years of Experience" field="yearsExperience" placeholder="7 years" half />
            <Field label="Offer Deadline" field="offerDeadline" placeholder="5 business days" half />
            <div className="col-span-2"><Field label="Equity Offered" field="equityOffered" placeholder="0.1% over 4 years, $2M valuation" /></div>
            <div className="col-span-2"><Field label="Competing Offers" field="competingOffers" placeholder="Offer from Stripe at $135k" /></div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Additional Context</label>
            <textarea
              value={input.notes}
              onChange={e => setInput(p => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. They seemed very interested, I have 3 competing interviews..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generating your package…</>
            ) : '⚡ Generate Negotiation Package'}
          </button>
        </div>

        {/* Output panel */}
        <div className="xl:col-span-3 bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-zinc-200 dark:border-neutral-700 no-scrollbar">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 -mb-px ${activeTab === t.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
              >
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-y-auto min-h-[400px]">
            {!output && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mb-4 text-3xl">💰</div>
                <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">Your negotiation scripts will appear here</h3>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-xs">Fill in your offer details and click Generate to get a complete negotiation package with copy-paste ready scripts.</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Building your negotiation package…</p>
                <p className="text-xs text-zinc-400 mt-1">Analysing offer, market data & psychology…</p>
              </div>
            )}
            {output && !loading && (
              <MarkdownBlock content={output[tabContent[activeTab]]} />
            )}
          </div>

          {output && (
            <div className="border-t border-zinc-200 dark:border-neutral-700 px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-zinc-400">Click any tab to switch scripts</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-100 dark:bg-neutral-700 hover:bg-zinc-200 dark:hover:bg-neutral-600 rounded-lg transition-colors text-zinc-700 dark:text-zinc-200"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NegotiationCoach;
