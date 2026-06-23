import React, { useState, useRef, useEffect } from 'react';
import { CVData, PersonalInfo } from '../types';
import { improveCV, polishExistingCV, LeakSummaryPayload } from '../services/geminiService';
import { Sparkles } from './icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  updatedCV?: CVData;
  leakReport?: LeakSummaryPayload;
}

interface AIImprovementPanelProps {
  cvData: CVData;
  personalInfo: PersonalInfo;
  jobDescription: string;
  apiKeySet: boolean;
  onCVUpdate: (newCV: CVData) => void;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  { emoji: '💪', label: 'Stronger bullets', prompt: 'Rewrite all experience bullet points with stronger action verbs and more quantified achievements.' },
  { emoji: '🎯', label: 'More ATS keywords', prompt: 'Add more relevant industry keywords and technical skills throughout the CV to improve ATS scoring.' },
  { emoji: '✂️', label: 'Make it concise', prompt: 'Trim the CV to be more concise. Remove redundant phrases and keep only the most impactful content.' },
  { emoji: '📊', label: 'Add metrics', prompt: 'Add quantified metrics and numbers to every bullet point where possible. Use realistic estimates if exact numbers are unknown.' },
  { emoji: '🧠', label: 'Better summary', prompt: 'Rewrite the professional summary to be more compelling, specific, and tailored to my experience.' },
  { emoji: '🔧', label: 'Fix skills section', prompt: 'Reorganise and improve the skills section. Group by category and prioritise the most relevant skills.' },
];

const LEAK_TYPE_LABELS: Record<string, string> = {
  round_number: 'Round number',
  repeated_phrase: 'Repeated phrase',
  bullet_rhythm_monotone: 'Monotone bullet rhythm',
  bullet_band_imbalance: 'Bullet length imbalance',
  low_quantification: 'Low metric coverage',
  low_quantification_role: 'Role missing metrics',
  word_overuse_per_role: 'Overused word',
  summary_bullet_phrase_leak: 'Summary phrase recycled in bullets',
  orphan_metric: 'Orphan metric',
  short_bullet: 'Very short bullet',
  long_bullet: 'Very long bullet',
};

function LeakNotice({ report }: { report: LeakSummaryPayload }) {
  const hasFixed   = report.totalFixed > 0 || report.polishFixes > 0;
  const hasFlagged = report.totalFlagged > 0;
  if (!hasFixed && !hasFlagged) return null;

  const fixLines: string[] = [];
  if (report.instructionLeaksStripped > 0)
    fixLines.push(`🚫 ${report.instructionLeaksStripped} instruction preamble${report.instructionLeaksStripped > 1 ? 's' : ''} stripped`);
  if (report.duplicateBulletsRemoved > 0)
    fixLines.push(`♻️ ${report.duplicateBulletsRemoved} near-duplicate bullet${report.duplicateBulletsRemoved > 1 ? 's' : ''} removed`);
  if (report.bannedPhrasesFixed > 0)
    fixLines.push(`🔤 ${report.bannedPhrasesFixed} banned phrase${report.bannedPhrasesFixed > 1 ? 's' : ''} cleaned`);
  if (report.tenseFixed > 0)
    fixLines.push(`⏩ ${report.tenseFixed} tense error${report.tenseFixed > 1 ? 's' : ''} corrected`);
  if (report.polishFixes > 0)
    fixLines.push(`✨ ${report.polishFixes} style fix${report.polishFixes > 1 ? 'es' : ''} applied`);

  return (
    <div className="mt-2 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs">
      {hasFixed && (
        <>
          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
            <span>🛡️</span>
            Leak Guard auto-fixed {report.totalFixed + (report.polishFixes > 0 && report.totalFixed === 0 ? 1 : 0)} issue{report.totalFixed !== 1 ? 's' : ''}
          </p>
          <ul className="space-y-0.5 text-amber-700 dark:text-amber-400">
            {fixLines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </>
      )}
      {hasFlagged && (
        <div className={hasFixed ? 'mt-2 pt-2 border-t border-amber-200 dark:border-amber-700/40' : ''}>
          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
            ⚠️ {report.totalFlagged} item{report.totalFlagged > 1 ? 's' : ''} flagged — review manually:
          </p>
          <ul className="space-y-1">
            {report.flaggedItems.slice(0, 4).map((item, i) => (
              <li key={i} className="text-amber-600 dark:text-amber-500 leading-snug">
                <span className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded text-[10px]">
                  {item.fieldLocation
                    ? item.fieldLocation.replace(/experience\[(\d+)\].*/, (_, n) => `Role ${+n + 1}`)
                    : (LEAK_TYPE_LABELS[item.leakType] ?? item.leakType)
                  }
                </span>{' '}
                <span className="text-[10px]">{item.phrase.slice(0, 60)}{item.phrase.length > 60 ? '…' : ''}</span>
              </li>
            ))}
            {report.flaggedItems.length > 4 && (
              <li className="text-amber-500 dark:text-amber-600 text-[10px]">
                …and {report.flaggedItems.length - 4} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const AIImprovementPanel: React.FC<AIImprovementPanelProps> = ({
  cvData,
  personalInfo,
  jobDescription,
  apiKeySet,
  onCVUpdate,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I've read your CV. I can help you improve it — ask me anything or use a quick action below.\n\nCurrent CV: ${(cvData.experience ?? []).length} roles, ${(cvData.skills ?? []).length} skills, ${(cvData.education ?? []).length} education entries.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCV, setPendingCV] = useState<CVData | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (promptText?: string) => {
    const text = promptText || input.trim();
    if (!text || isLoading) return;
    if (!apiKeySet) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please set your Gemini API key in settings first.' }]);
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const currentCV = pendingCV || cvData;
      let capturedLeakReport: LeakSummaryPayload | null = null;
      const result = await improveCV(
        currentCV,
        personalInfo,
        text,
        jobDescription,
        (report) => { capturedLeakReport = report; },
      );

      const changes: string[] = [];
      if (result.summary !== currentCV.summary) changes.push('Updated summary');
      if (result.skills.join() !== currentCV.skills.join()) changes.push('Updated skills');
      if (result.experience.length !== currentCV.experience.length) {
        changes.push(`${result.experience.length > currentCV.experience.length ? 'Added' : 'Removed'} experience entries`);
      } else {
        const expChanged = result.experience.some((exp, i) =>
          exp.responsibilities.join() !== currentCV.experience[i]?.responsibilities.join()
        );
        if (expChanged) changes.push('Improved experience bullets');
      }

      const summary = changes.length > 0
        ? `Done! Here's what I changed:\n${changes.map(c => `• ${c}`).join('\n')}\n\nApply the changes to see your updated CV.`
        : 'I reviewed the CV but didn\'t find specific improvements needed for that request. Try being more specific about what you want changed.';

      setPendingCV(result);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summary,
        updatedCV: changes.length > 0 ? result : undefined,
        leakReport: capturedLeakReport ?? undefined,
      }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I hit an error: ${msg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const applyChanges = (newCV: CVData) => {
    onCVUpdate(newCV);
    setPendingCV(newCV);
    setMessages(prev => [...prev, { role: 'assistant', content: '✅ Changes applied to your CV! You can continue improving or close this panel.' }]);
  };

  const runPolishOnly = async () => {
    if (isLoading) return;
    const currentCV = pendingCV || cvData;

    setMessages(prev => [...prev, { role: 'user', content: '✨ Re-polish my CV (no rewrite)' }]);
    setIsLoading(true);

    try {
      let capturedLeakReport: LeakSummaryPayload | null = null;
      const result = await polishExistingCV(
        currentCV,
        (report) => { capturedLeakReport = report; },
      );

      const changes: string[] = [];
      if (result.summary !== currentCV.summary) changes.push('Cleaned up summary phrasing');
      if (result.skills.join() !== currentCV.skills.join()) changes.push('Tidied skills list');
      const expChanged = result.experience.some((exp, i) =>
        exp.responsibilities.join() !== currentCV.experience[i]?.responsibilities.join()
      );
      if (expChanged) changes.push('Polished experience bullets');

      const summary = changes.length > 0
        ? `Done — re-applied the latest polish rules. Here's what changed:\n${changes.map(c => `• ${c}`).join('\n')}\n\nNo rewrite was performed; only deterministic and humanizer passes ran.`
        : 'Your CV is already at parity with the latest polish rules — nothing to change.';

      setPendingCV(result);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summary,
        updatedCV: changes.length > 0 ? result : undefined,
        leakReport: capturedLeakReport ?? undefined,
      }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, the polish pass hit an error: ${msg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col border border-zinc-200 dark:border-neutral-700 max-h-[90vh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1B2B4B] rounded-lg flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Career Coach</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Reads, edits & strengthens your CV</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Quick Prompts */}
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={runPolishOnly}
              disabled={isLoading}
              title="Re-applies the latest polish rules (humanizer, banned phrases, deterministic cleanup) without sending the CV back to Groq. No tokens used."
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C]/15 hover:bg-[#C9A84C]/25 text-[#1B2B4B] dark:text-[#C9A84C] text-xs font-semibold rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#C9A84C]/30"
            >
              <span>✨</span>
              Re-polish (free)
            </button>
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => sendMessage(qp.prompt)}
                disabled={isLoading}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-neutral-800 hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C]/70 text-zinc-700 dark:text-zinc-300 text-xs font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{qp.emoji}</span>
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#1B2B4B] text-white rounded-br-sm'
                    : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
                }`}
              >
                {msg.content}
                {msg.updatedCV && (
                  <button
                    onClick={() => applyChanges(msg.updatedCV!)}
                    className="mt-3 w-full py-2 px-3 bg-[#1B2B4B] hover:bg-[#152238] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <span>✓</span> Apply Changes to CV
                  </button>
                )}
                {msg.leakReport && <LeakNotice report={msg.leakReport} />}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-neutral-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#1B2B4B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#1B2B4B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#1B2B4B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-3 border-t border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask AI to improve your CV..."
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className="px-4 py-2.5 bg-[#1B2B4B] hover:bg-[#152238] text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIImprovementPanel;
