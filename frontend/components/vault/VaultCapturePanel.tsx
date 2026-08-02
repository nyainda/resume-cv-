import React, { useState, useRef } from 'react';
import type { UserProfileSlot, VaultPriority, VaultInputType } from '../../types';
import { Upload, Image, Link, FileText } from '../icons';
import { extractTitleCompany } from '../../services/vaultService';
import { getSelectedProvider } from '../../services/groqService';
import type { PositionChunk } from '../../services/vaultAnalysis';

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

const PRIORITY_OPTIONS: { value: VaultPriority; label: string; emoji: string; color: string }[] = [
  { value: 'low',    label: 'Low',    emoji: '·',  color: 'text-zinc-400' },
  { value: 'medium', label: 'Medium', emoji: '◈',  color: 'text-blue-500' },
  { value: 'high',   label: 'High',   emoji: '▲',  color: 'text-orange-500' },
  { value: 'dream',  label: 'Dream',  emoji: '⭐', color: 'text-[#C9A84C]' },
];

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

// ── Multi-position picker ─────────────────────────────────────────────────────

interface MultiPickerProps {
  positions: PositionChunk[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onSaveSelected: () => void;
  onBack: () => void;
  saving: boolean;
  roomId: string;
  setRoomId: (id: string) => void;
  priority: VaultPriority;
  setPriority: (p: VaultPriority) => void;
  profiles: UserProfileSlot[];
}

const MultiPositionPicker: React.FC<MultiPickerProps> = ({
  positions, selected, onToggle, onSaveSelected, onBack, saving,
  roomId, setRoomId, priority, setPriority, profiles,
}) => {
  const selCount = selected.size;
  return (
    <div className="flex flex-col h-full">
      {/* Banner */}
      <div className="px-5 pt-4 pb-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2 mb-1">
          <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
            {positions.length} positions found in this document
          </p>
        </div>
        <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80 leading-relaxed ml-6">
          Select which jobs to save. Each will be added as a separate vault entry.
        </p>
      </div>

      {/* Position list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 max-h-64">
        {positions.map((pos, i) => {
          const ins = pos.insights;
          const isSelected = selected.has(i);
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                isSelected
                  ? 'border-[#C9A84C] bg-[#C9A84C]/8 dark:bg-[#C9A84C]/10'
                  : 'border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 hover:border-zinc-300 dark:hover:border-neutral-600'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                  isSelected ? 'border-[#C9A84C] bg-[#C9A84C]' : 'border-zinc-300 dark:border-neutral-600'
                }`}>
                  {isSelected && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <polyline points="2,6 5,9 10,3"/>
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">
                    {ins.title || 'Untitled Role'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {ins.company || 'Unknown Company'}
                    {ins.location ? ` · ${ins.location}` : ''}
                    {ins.remote   ? ` · ${ins.remote}` : ''}
                  </p>
                  {ins.salary && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{ins.salary}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Room + priority */}
      <div className="px-5 pt-2 pb-3 grid grid-cols-2 gap-3 border-t border-zinc-100 dark:border-neutral-800">
        <div>
          <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Save to room</label>
          <select
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            disabled={saving}
            className="w-full px-3.5 py-2 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 appearance-none disabled:opacity-40 cursor-pointer"
          >
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1.5">Priority</label>
          <div className="grid grid-cols-4 gap-1">
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPriority(opt.value)}
                disabled={saving}
                title={opt.label}
                className={`py-2 rounded-xl text-sm transition-all disabled:opacity-40 border flex items-center justify-center ${
                  priority === opt.value
                    ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] shadow-sm'
                    : 'border-zinc-200 dark:border-neutral-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600'
                }`}
              >{opt.emoji}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 flex gap-2.5">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 py-3 rounded-2xl text-sm font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={onSaveSelected}
          disabled={saving || selCount === 0}
          className="py-3 rounded-2xl text-sm font-extrabold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)`, flex: 2 }}
        >
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"/>
                Saving…
              </span>
            : `Save ${selCount} position${selCount !== 1 ? 's' : ''} →`
          }
        </button>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

export const VaultCapturePanel: React.FC<Props> = ({ profiles, activeRoomId, onSave, onClose }) => {
  const [tab, setTab]               = useState<Tab>('text');
  const [jdText, setJdText]         = useState('');
  const [url, setUrl]               = useState('');
  const [fileName, setFileName]     = useState('');
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [pdfFile, setPdfFile]       = useState<File | null>(null);
  const [priority, setPriority]     = useState<VaultPriority>('medium');
  const [roomId, setRoomId]         = useState(activeRoomId || profiles[0]?.id || '');
  const [saving, setSaving]         = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [detecting, setDetecting]   = useState(false);
  const [extractError, setExtractError] = useState('');

  // Multi-position state
  const [multiPositions, setMultiPositions]   = useState<PositionChunk[] | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
  // Stash the raw JD text for multi-position saving
  const pendingRawJd = useRef('');
  const pendingInputType = useRef<VaultInputType>('text');
  const pendingSourceUrl = useRef<string | undefined>(undefined);

  const fileRef  = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const canSave = tab === 'text'  ? jdText.trim().length > 20
    : tab === 'url'               ? url.trim().startsWith('http')
    : tab === 'pdf'               ? !!pdfFile
    : tab === 'image'             ? !!imageFile
    : false;

  const togglePosition = (i: number) => {
    setSelectedPositions(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // Save the selected positions (from multi-position picker)
  async function handleSaveSelected() {
    if (!multiPositions) return;
    setSaving(true);
    try {
      const toSave = multiPositions.filter((_, i) => selectedPositions.has(i));
      for (const chunk of toSave) {
        onSave({
          roomId,
          rawJd: chunk.rawChunk,
          inputType: pendingInputType.current,
          sourceUrl: pendingSourceUrl.current,
          title:   chunk.insights.title   || extractTitleCompany(chunk.rawChunk).title,
          company: chunk.insights.company || extractTitleCompany(chunk.rawChunk).company,
          priority,
        });
      }
      // Close after saving (parent component manages the vault list)
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!canSave || saving || extracting || detecting) return;
    setSaving(true);
    setExtractError('');
    try {
      let rawJd = jdText;
      let sourceUrl: string | undefined;
      let inputType: VaultInputType = tab;

      if (tab === 'url') {
        rawJd     = `${url}\n\nJob URL: ${url}`;
        sourceUrl = url;
      } else if (tab === 'image' && imageFile) {
        setExtracting(true);
        setSaving(false);
        try {
          const provider = getSelectedProvider();
          if (provider === 'workers-ai') {
            // Free CF path: toMarkdown is CF's native document extractor —
            // much better quality than routing through Llama 3.2 11b vision.
            const { workerExtractDoc } = await import('../../services/cvEngineClient');
            rawJd = (await workerExtractDoc(imageFile)) ?? '';
          } else {
            // BYOK (Claude / Gemini / Groq): use multimodal vision path
            const { extractTextFromImage } = await import('../../services/geminiService');
            const base64 = await fileToBase64(imageFile);
            rawJd = await extractTextFromImage(base64, imageFile.type);
          }
          if (!rawJd || rawJd.trim().length < 20)
            throw new Error('Image extraction returned no text. Please paste the job description instead.');
        } catch (e) {
          setExtractError(e instanceof Error ? e.message : 'Image extraction failed — please paste the job description text instead.');
          return;
        } finally {
          setExtracting(false);
        }
        setSaving(true);
      } else if (tab === 'pdf' && pdfFile) {
        setExtracting(true);
        setSaving(false);
        try {
          const { extractProfileTextFromFile } = await import('../../services/geminiService');
          const base64 = await fileToBase64(pdfFile);
          rawJd = await extractProfileTextFromFile(base64, pdfFile.type);
          if (!rawJd || rawJd.trim().length < 20)
            throw new Error('PDF extraction returned no text. Please paste the job description instead.');
        } catch (e) {
          setExtractError(e instanceof Error ? e.message : 'PDF extraction failed — please paste the job description text instead.');
          return;
        } finally {
          setExtracting(false);
        }
        setSaving(true);
      }

      // ── Multi-position detection ────────────────────────────────────────────
      setDetecting(true);
      setSaving(false);
      try {
        const { detectAndSplitPositions } = await import('../../services/vaultAnalysis');
        const chunks = await detectAndSplitPositions(rawJd);
        if (chunks && chunks.length >= 2) {
          // Stash context for the picker
          pendingRawJd.current       = rawJd;
          pendingInputType.current   = inputType;
          pendingSourceUrl.current   = sourceUrl;
          setMultiPositions(chunks);
          setSelectedPositions(new Set(chunks.map((_, i) => i))); // all selected by default
          return; // Show picker instead of saving immediately
        }
      } catch {
        // Detection failure is non-fatal — fall through to single-position save
      } finally {
        setDetecting(false);
      }

      // ── Single position ─────────────────────────────────────────────────────
      const { title, company } = extractTitleCompany(rawJd);
      onSave({ roomId, rawJd, inputType, sourceUrl, title, company, priority });
    } finally {
      setSaving(false);
      setDetecting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.FC<{className?:string}> }[] = [
    { id: 'text',  label: 'Paste',      icon: FileText },
    { id: 'url',   label: 'URL',        icon: Link },
    { id: 'pdf',   label: 'PDF',        icon: Upload },
    { id: 'image', label: 'Screenshot', icon: Image },
  ];

  const isBusy = saving || extracting || detecting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isBusy ? undefined : onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-zinc-100 dark:border-neutral-700 overflow-hidden">

        {/* ── Gradient header ───────────────────────────────────── */}
        <div
          className="px-6 pt-6 pb-5"
          style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <h2 className="text-base font-extrabold text-white">
                  {multiPositions ? 'Multiple Positions Found' : 'Capture Job Description'}
                </h2>
              </div>
              <p className="text-xs text-white/50">
                {multiPositions ? 'Choose which roles to save to your vault' : 'Save now · build your CV when you\'re ready'}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isBusy}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Tab switcher — hidden on multi-position picker */}
          {!multiPositions && (
            <div className="flex gap-1 mt-4 bg-white/10 p-1 rounded-2xl">
              {tabs.map(t => {
                const Icon   = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setExtractError(''); }}
                    disabled={isBusy}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                      active
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-white/60 hover:text-white/90'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Multi-position picker ──────────────────────────────── */}
        {multiPositions ? (
          <MultiPositionPicker
            positions={multiPositions}
            selected={selectedPositions}
            onToggle={togglePosition}
            onSaveSelected={handleSaveSelected}
            onBack={() => setMultiPositions(null)}
            saving={saving}
            roomId={roomId}
            setRoomId={setRoomId}
            priority={priority}
            setPriority={setPriority}
            profiles={profiles}
          />
        ) : (

        /* ── Normal capture body ──────────────────────────────────── */
        <>
        <div className="px-6 py-5 space-y-4">

          {/* Tab content */}
          {tab === 'text' && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Paste Job Description</label>
              <textarea
                autoFocus
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                placeholder="Paste the full job description here…"
                rows={8}
                className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 resize-none leading-relaxed"
              />
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5 leading-relaxed">
                Paste one JD or multiple — we'll detect separate positions automatically.
              </p>
            </div>
          )}

          {tab === 'url' && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Job Posting URL</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://jobs.company.com/role-123"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                />
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed">
                The URL is saved with your job. For best match scoring, also paste the full JD text using the Paste tab.
              </p>
            </div>
          )}

          {(tab === 'pdf' || tab === 'image') && (
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">
                {tab === 'pdf' ? 'Upload PDF' : 'Upload Screenshot'}
              </label>

              {extracting ? (
                <div className="border-2 border-dashed border-[#C9A84C]/40 rounded-2xl p-10 text-center bg-[#C9A84C]/5">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-9 h-9 rounded-full border-[3px] border-[#C9A84C] border-t-transparent animate-spin" />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {tab === 'image' ? 'Reading image with AI…' : 'Extracting PDF text…'}
                    </p>
                    <p className="text-xs text-zinc-400">This takes a few seconds</p>
                  </div>
                </div>
              ) : detecting ? (
                <div className="border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-2xl p-10 text-center bg-blue-50/50 dark:bg-blue-900/10">
                  <div className="flex flex-col items-center gap-3">
                    <span className="w-9 h-9 rounded-full border-[3px] border-blue-400 border-t-transparent animate-spin" />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Checking for multiple positions…</p>
                    <p className="text-xs text-zinc-400">One moment</p>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => (tab === 'pdf' ? fileRef : imageRef).current?.click()}
                  className="border-2 border-dashed border-zinc-200 dark:border-neutral-700 rounded-2xl p-8 text-center cursor-pointer hover:border-[#C9A84C]/60 hover:bg-[#C9A84C]/3 transition-all group"
                >
                  {fileName ? (
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: `${NAVY}18` }}>
                        {tab === 'pdf'
                          ? <Upload className="h-6 w-6 text-[#1B2B4B] dark:text-[#C9A84C]" />
                          : <Image  className="h-6 w-6 text-[#1B2B4B] dark:text-[#C9A84C]" />}
                      </div>
                      <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{fileName}</p>
                      <p className="text-xs text-zinc-400">Click to change file</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: `${NAVY}12` }}>
                        {tab === 'pdf'
                          ? <Upload className="h-6 w-6 text-zinc-400 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] transition-colors" />
                          : <Image  className="h-6 w-6 text-zinc-400 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] transition-colors" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                          {tab === 'pdf' ? 'Drop PDF here or click to upload' : 'Drop screenshot here or click to upload'}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {tab === 'pdf' ? 'PDF only · supports multi-page / multi-position documents' : 'PNG or JPEG · text extracted automatically via AI'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {extractError && (
                <div className="mt-3 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{extractError}</p>
                  <p className="text-[11px] text-rose-500/70 dark:text-rose-500/50 mt-1">
                    Tip: switch to the Paste tab and copy-paste the job description directly.
                  </p>
                </div>
              )}

              <input ref={fileRef}  type="file" accept=".pdf"             className="hidden"
                onChange={e => { const f = e.target.files?.[0]??null; setPdfFile(f);   setFileName(f?.name??''); setExtractError(''); }} />
              <input ref={imageRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]??null; setImageFile(f); setFileName(f?.name??''); setExtractError(''); }} />
            </div>
          )}

          {/* Room + priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Save to room</label>
              <select
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                disabled={isBusy}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 appearance-none disabled:opacity-40 cursor-pointer"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Priority</label>
              <div className="grid grid-cols-4 gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    disabled={isBusy}
                    title={opt.label}
                    className={`py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 border flex items-center justify-center ${
                      priority === opt.value
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] shadow-sm'
                        : 'border-zinc-200 dark:border-neutral-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600'
                    }`}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5 text-center capitalize">{PRIORITY_OPTIONS.find(o=>o.value===priority)?.label}</p>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="px-6 pb-6 pt-3 border-t border-zinc-100 dark:border-neutral-800 space-y-3">
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-neutral-700 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || isBusy}
              className="py-3 rounded-2xl text-sm font-extrabold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #263c61 100%)`, flex: 2 }}
            >
              {extracting
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Extracting…
                  </span>
                : detecting
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Analysing…
                  </span>
                : saving
                ? 'Saving…'
                : 'Save & Analyse →'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center leading-relaxed">
            {(tab === 'image' || tab === 'pdf') && !extractError
              ? 'AI reads the file · multi-position documents split automatically'
              : 'Saved instantly · match score runs in the background'}
          </p>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default VaultCapturePanel;
