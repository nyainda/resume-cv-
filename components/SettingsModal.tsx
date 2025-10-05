import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string | null) => void;
  currentApiKey: string | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiKey }) => {
  const [apiKeyInput, setApiKeyInput] = useState(currentApiKey || '');

  useEffect(() => {
    setApiKeyInput(currentApiKey || '');
  }, [currentApiKey, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(apiKeyInput.trim() || null);
    onClose();
  };

  const handleClear = () => {
    setApiKeyInput('');
    onSave(null);
    onClose();
  }

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
        
        <div>
          <Label htmlFor="api-key">Gemini API Key</Label>
          <p className="text-sm text-slate-500 mb-2">
            Your API key is stored only in your browser. Get your key from{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
              Google AI Studio
            </a>.
          </p>
          <Input
            id="api-key"
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Enter your API key"
          />
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