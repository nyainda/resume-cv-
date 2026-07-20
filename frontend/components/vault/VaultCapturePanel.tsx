import React, { useState, useRef } from 'react';
import type { UserProfileSlot, VaultPriority, VaultInputType } from '../../types';
import { Search, Upload, Image, Link, FileText } from '../icons';
import { extractTitleCompany } from '../../services/vaultService';

const GOLD = '#C9A84C';
const NAVY = '#1B2B4B';

type Tab = 'text' | 'url' | 'pdf' | 'image';

interface Props {
  profiles:      UserProfileSlot[];
  activeRoomId:  string;
  onSave: (args: {
    roomId:    string;
    rawJd:     string;
    inputType: VaultInputType;
    sourceUrl?: string;
    title:     string;
    company:   string;
    deadline?: string;
    priority:  VaultPriority;
  }) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: VaultPriority; label: string; color: string }[] = [
  { value: 'low',    label: 'Low',     color: 'text-zinc-500' },
  { value: 'medium', label: 'Medium',  color: 'text-blue-500' },
  { value: 'high',   label: 'High',    color: 'text-orange-500' },
  { value: 'dream',  label: '⭐ Dream', color: 'text-[#C9A84C]' },
];

export const VaultCapturePanel: React.FC<Props> = ({ profiles, activeRoomId, onSave, onClose }) => {
  const [tab, setTab]           = useState<Tab>('text');
  const [jdText, setJdText]     = useState('');
  const [url, setUrl]           = useState('');
  const [fileName, setFileName] = useState('');
  const [priority, setPriority] = useState<VaultPriority>('medium');
  const [roomId, setRoomId]     = useState(activeRoomId || profiles[0]?.id || '');
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const canSave = tab === 'text' ? jdText.trim().length > 20
    : tab === 'url' ? url.trim().startsWith('http')
    : tab === 'pdf' || tab === 'image' ? !!fileName
    : false;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let rawJd = jdText;
      let sourceUrl: string | undefined;

      if (tab === 'url') {
        rawJd = `Job URL: ${url}\n\n[Content will be extracted from the URL]`;
        sourceUrl = url;
      } else if (tab === 'pdf' || tab === 'image') {
        rawJd = `Uploaded file: ${fileName}\n\n[Content extracted from uploaded file]`;
      }

      const { title, company } = extractTitleCompany(rawJd);
      onSave({ roomId, rawJd, inputType: tab, sourceUrl, title, company, priority });
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.FC<{className?:string}> }[] = [
    { id: 'text',  label: 'Paste',      icon: FileText },
    { id: 'url',   label: 'URL',        icon: Link },
    { id: 'pdf',   label: 'PDF',        icon: Upload },
    { id: 'image', label: 'Screenshot', icon: Image },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-100 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50">Capture Job Description</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Save now, build your CV when you're ready</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-zinc-50 dark:bg-neutral-800 p-1 rounded-xl">
            {tabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    active
                      ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tab === 'text' && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Paste Job Description</label>
              <textarea
                autoFocus
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                placeholder="Paste the job description here…"
                rows={8}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 resize-none font-mono leading-relaxed"
              />
            </div>
          )}

          {tab === 'url' && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Job Posting URL</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 dark:text-zinc-600" />
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://jobs.company.com/role-123"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                />
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed">
                Works on static job pages. LinkedIn / Greenhouse / Lever may require copy-paste instead.
              </p>
            </div>
          )}

          {(tab === 'pdf' || tab === 'image') && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">
                {tab === 'pdf' ? 'Upload PDF' : 'Upload Screenshot'}
              </label>
              <div
                onClick={() => (tab === 'pdf' ? fileRef : imageRef).current?.click()}
                className="border-2 border-dashed border-zinc-200 dark:border-neutral-700 rounded-xl p-8 text-center cursor-pointer hover:border-[#C9A84C]/50 transition-colors group"
              >
                {fileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${NAVY}12` }}>
                      {tab === 'pdf' ? <Upload className="h-5 w-5 text-[#1B2B4B] dark:text-[#C9A84C]" /> : <Image className="h-5 w-5 text-[#1B2B4B] dark:text-[#C9A84C]" />}
                    </div>
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{fileName}</p>
                    <p className="text-xs text-zinc-400">Click to change file</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: `${NAVY}12` }}>
                      {tab === 'pdf' ? <Upload className="h-5 w-5 text-zinc-400" /> : <Image className="h-5 w-5 text-zinc-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        {tab === 'pdf' ? 'Drop PDF here or click to upload' : 'Drop screenshot here or click to upload'}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {tab === 'pdf' ? 'Max 5MB · PDF only' : 'PNG or JPEG · Requires Gemini or Claude key'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
              <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
            </div>
          )}

          {/* Room + priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Save to room</label>
              <select
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 appearance-none"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Priority</label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    title={opt.label}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                      priority === opt.value
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                        : 'border-zinc-200 dark:border-neutral-700 text-zinc-400 hover:border-zinc-300'
                    }`}
                  >
                    {opt.value === 'dream' ? '⭐' : opt.label.slice(0,1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-neutral-800 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: NAVY, flex: 2 }}
            >
              {saving ? 'Saving…' : 'Save & Analyse →'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed">
            Saved instantly · Match score runs in the background
          </p>
        </div>
      </div>
    </div>
  );
};

export default VaultCapturePanel;
