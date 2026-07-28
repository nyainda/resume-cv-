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

/** Convert a File to a base64 string (without the data URI prefix). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const VaultCapturePanel: React.FC<Props> = ({ profiles, activeRoomId, onSave, onClose }) => {
  const [tab, setTab]           = useState<Tab>('text');
  const [jdText, setJdText]     = useState('');
  const [url, setUrl]           = useState('');
  const [fileName, setFileName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [priority, setPriority] = useState<VaultPriority>('medium');
  const [roomId, setRoomId]     = useState(activeRoomId || profiles[0]?.id || '');
  const [saving, setSaving]     = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const canSave = tab === 'text'  ? jdText.trim().length > 20
    : tab === 'url'               ? url.trim().startsWith('http')
    : tab === 'pdf'               ? !!pdfFile
    : tab === 'image'             ? !!imageFile
    : false;

  async function handleSave() {
    if (!canSave || saving || extracting) return;
    setSaving(true);
    setExtractError('');
    try {
      let rawJd = jdText;
      let sourceUrl: string | undefined;

      if (tab === 'url') {
        rawJd = `${url}\n\nJob URL: ${url}`;
        sourceUrl = url;
      } else if (tab === 'image' && imageFile) {
        setExtracting(true);
        try {
          const { extractTextFromImage } = await import('../../services/geminiService');
          const base64 = await fileToBase64(imageFile);
          rawJd = await extractTextFromImage(base64, imageFile.type);
          if (!rawJd || rawJd.trim().length < 20) {
            throw new Error('Image extraction returned no text. Please paste the job description instead.');
          }
        } catch (e) {
          setExtractError(e instanceof Error ? e.message : 'Image extraction failed — please paste the job description text instead.');
          return;
        } finally {
          setExtracting(false);
        }
      } else if (tab === 'pdf' && pdfFile) {
        setExtracting(true);
        try {
          const { extractProfileTextFromFile } = await import('../../services/geminiService');
          const base64 = await fileToBase64(pdfFile);
          rawJd = await extractProfileTextFromFile(base64, pdfFile.type);
          if (!rawJd || rawJd.trim().length < 20) {
            throw new Error('PDF extraction returned no text. Please paste the job description instead.');
          }
        } catch (e) {
          setExtractError(e instanceof Error ? e.message : 'PDF extraction failed — please paste the job description text instead.');
          return;
        } finally {
          setExtracting(false);
        }
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

  const isBusy = saving || extracting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={isBusy ? undefined : onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-100 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50">Capture Job Description</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Save now, build your CV when you're ready</p>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
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
                  onClick={() => { setTab(t.id); setExtractError(''); }}
                  disabled={isBusy}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${
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
                The URL is saved with your job — paste the full JD text for the best match scoring.
              </p>
            </div>
          )}

          {(tab === 'pdf' || tab === 'image') && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">
                {tab === 'pdf' ? 'Upload PDF' : 'Upload Screenshot'}
              </label>

              {/* Extracting overlay */}
              {extracting ? (
                <div className="border-2 border-dashed border-[#C9A84C]/40 rounded-xl p-8 text-center bg-[#C9A84C]/5">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-8 h-8 rounded-full border-[3px] border-[#C9A84C] border-t-transparent animate-spin" />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {tab === 'image' ? 'Reading image with AI…' : 'Extracting PDF text…'}
                    </p>
                    <p className="text-xs text-zinc-400">This takes a few seconds</p>
                  </div>
                </div>
              ) : (
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
                          {tab === 'pdf' ? 'Max 5MB · PDF only · requires Gemini or Claude key' : 'PNG or JPEG · text extracted automatically via AI'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {extractError && (
                <div className="mt-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{extractError}</p>
                  <p className="text-[11px] text-rose-500/70 dark:text-rose-500/50 mt-1">
                    Tip: switch to the Paste tab and copy-paste the job description directly.
                  </p>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setPdfFile(f);
                  setFileName(f?.name ?? '');
                  setExtractError('');
                }}
              />
              <input
                ref={imageRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setImageFile(f);
                  setFileName(f?.name ?? '');
                  setExtractError('');
                }}
              />
            </div>
          )}

          {/* Room + priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Save to room</label>
              <select
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                disabled={isBusy}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 appearance-none disabled:opacity-40"
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
                    disabled={isBusy}
                    title={opt.label}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all disabled:opacity-40 ${
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
              disabled={isBusy}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || isBusy}
              className="flex-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: NAVY, flex: 2 }}
            >
              {extracting
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Extracting…
                  </span>
                : saving
                ? 'Saving…'
                : 'Save & Analyse →'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed">
            {(tab === 'image' || tab === 'pdf') && !extractError
              ? 'AI reads the file and extracts the job description text automatically'
              : 'Saved instantly · Match score runs in the background'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default VaultCapturePanel;
