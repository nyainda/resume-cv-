import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { ApiSettings, AIProvider } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentApiSettings: ApiSettings;
}

const providerDetails: Record<AIProvider, { name: string, url: string }> = {
  gemini: { name: 'Google Gemini', url: 'https://aistudio.google.com/app/apikey' },
  openai: { name: 'OpenAI (ChatGPT)', url: 'https://platform.openai.com/api-keys' },
  anthropic: { name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys' },
  qwen: { name: 'Alibaba (Qwen)', url: 'https://dashscope.console.aliyun.com/apiKey' },
};

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiSettings }) => {
  const [localSettings, setLocalSettings] = useState<ApiSettings>(currentApiSettings);
  const [storedKeys, setStoredKeys] = useState<Record<string, string>>({});
  const [tavilyKey, setTavilyKey] = useState(currentApiSettings.tavilyApiKey || '');

  useEffect(() => {
    const keys = JSON.parse(localStorage.getItem('provider_keys') || '{}');
    if (currentApiSettings.apiKey) {
      keys[currentApiSettings.provider] = currentApiSettings.apiKey;
    }
    setStoredKeys(keys);
    setLocalSettings(currentApiSettings);
    setTavilyKey(currentApiSettings.tavilyApiKey || '');
  }, [currentApiSettings, isOpen]);

  const updateKey = (key: string) => {
    const newKeys = { ...storedKeys, [localSettings.provider]: key };
    setStoredKeys(newKeys);
    localStorage.setItem('provider_keys', JSON.stringify(newKeys));
    setLocalSettings({ ...localSettings, apiKey: key });
  };

  const handleProviderChange = (provider: AIProvider) => {
    const apiKey = storedKeys[provider] || null;
    setLocalSettings({ provider, apiKey });
  };

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...localSettings,
      apiKey: localSettings.apiKey?.trim() || null,
      tavilyApiKey: tavilyKey.trim() || null,
    });
    onClose();
  };

  const handleClear = () => {
    const newKeys = { ...storedKeys };
    delete newKeys[localSettings.provider];
    setStoredKeys(newKeys);
    localStorage.setItem('provider_keys', JSON.stringify(newKeys));
    const clearedSettings = { ...localSettings, apiKey: null };
    setLocalSettings(clearedSettings);
    onSave(clearedSettings);
    onClose();
  };

  const selectedProvider = providerDetails[localSettings.provider];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 transform transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-neutral-700 text-2xl leading-none">&times;</button>
        </div>

        {/* ── AI Provider ── */}
        <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">🤖 AI Generation</h3>
          <div>
            <Label htmlFor="ai-provider">AI Provider</Label>
            <select
              id="ai-provider"
              value={localSettings.provider}
              onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-zinc-300 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg"
            >
              {Object.entries(providerDetails).map(([key, value]) => (
                <option key={key} value={key}>{value.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="api-key">{selectedProvider.name} API Key</Label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              Stored only in your browser. Get your key from{' '}
              <a href={selectedProvider.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">
                their website
              </a>.
            </p>
            <Input
              id="api-key"
              type="password"
              value={localSettings.apiKey || ''}
              onChange={(e) => updateKey(e.target.value)}
              placeholder={`Enter your ${selectedProvider.name} API key`}
            />
          </div>
        </div>

        {/* ── Tavily Job Search ── */}
        <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 p-4 space-y-3 bg-violet-50/50 dark:bg-violet-900/10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-violet-500">🔍 Tavily Job Search</h3>
            {tavilyKey ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">● Connected</span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400">○ Not connected</span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Enables the <strong>Job Board</strong> — automatically scrapes live job listings, fetches full JDs, and researches companies to make your CVs smarter. Free tier: <strong>1,000 calls/month</strong>.
          </p>
          <a
            href="https://app.tavily.com/home"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 underline font-semibold"
          >
            Get your free Tavily API key →
          </a>
          <Input
            id="tavily-key"
            type="password"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
            className="font-mono text-sm"
          />
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            Powers: Job Board search • Full JD fetching • Company intelligence in CV generation
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-neutral-700">
          <Button variant="danger" onClick={handleClear}>Clear AI Key</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;