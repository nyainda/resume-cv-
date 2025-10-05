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

  useEffect(() => {
    setLocalSettings(currentApiSettings);
  }, [currentApiSettings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ ...localSettings, apiKey: localSettings.apiKey?.trim() || null });
    onClose();
  };

  const handleClear = () => {
    const clearedSettings = { ...localSettings, apiKey: null };
    setLocalSettings(clearedSettings);
    onSave(clearedSettings);
    onClose();
  }
  
  const selectedProvider = providerDetails[localSettings.provider];

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-2xl leading-none">&times;</button>
        </div>
        
        <div className="space-y-4">
            <div>
                <Label htmlFor="ai-provider">AI Provider</Label>
                <select 
                    id="ai-provider"
                    value={localSettings.provider}
                    onChange={(e) => setLocalSettings({...localSettings, provider: e.target.value as AIProvider })}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                    {Object.entries(providerDetails).map(([key, value]) => (
                        <option key={key} value={key}>{value.name}</option>
                    ))}
                </select>
            </div>
            <div>
              <Label htmlFor="api-key">{selectedProvider.name} API Key</Label>
              <p className="text-sm text-slate-500 mb-2">
                Your API key is stored only in your browser. Get your key from{' '}
                <a href={selectedProvider.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  their website
                </a>.
              </p>
              <Input
                id="api-key"
                type="password"
                value={localSettings.apiKey || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                placeholder={`Enter your ${selectedProvider.name} API key`}
              />
            </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button variant="danger" onClick={handleClear}>Clear Key</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
