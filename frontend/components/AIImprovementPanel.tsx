import React, { useState, useRef, useEffect } from 'react';
import { CVData, PersonalInfo } from '../types';
import { improveCV, polishExistingCV } from '../services/geminiService';
import { Sparkles } from './icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  updatedCV?: CVData;
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
      content: `Hi! I've read your CV. I can help you improve it — ask me anything or use a quick action below.\n\nCurrent CV: ${cvData.experience.length} roles, ${cvData.skills.length} skills, ${cvData.education.length} education entries.`,
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
      const result = await improveCV(currentCV, personalInfo, text, jobDescription);

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
        updatedCV: result,
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

  // Polish-only: re-runs the shared polish chain (humanizer + banned-phrase
  // filter + purify + pronoun fix + finalize) on the current CV WITHOUT
  // sending anything back to Groq. No tokens spent — instant cleanup using
  // the latest deterministic rules.
  const runPolishOnly = async () => {
    if (isLoading) return;
    const currentCV = pendingCV || cvData;

    setMessages(prev => [...prev, { role: 'user', content: '✨ Re-polish my CV (no rewrite)' }]);
    setIsLoading(true);

    try {
      const result = await polishExistingCV(currentCV);

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
