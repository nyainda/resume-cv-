import React, { useState, useRef, useCallback, useEffect } from 'react';
import PhotoCropModal from './PhotoCropModal';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { buildFlatOntology } from '../services/fieldOntologyResolver';
import { classifyRoleFieldAsync, classifyAndSaveAllRoles } from '../services/careerTrackClassifier';
import {
  UserProfile, Reference,
  CustomSection, CustomSectionItem, CustomSectionType,
  ProfileSectionKey, DEFAULT_SECTION_ORDER,
} from '../types';
import {
  generateProfile,
  generateProfileFromFileWithGemini,
  generateProfileFromFileClaude,
  generateEnhancedSummary,
  generateEnhancedResponsibilities,
  generateEnhancedProjectDescription,
} from '../services/geminiService';
import { getSelectedProvider } from '../services/groqService';
import { workerExtractDoc } from '../services/cvEngineClient';
import { runImportPipeline } from '../services/importPipeline';
import { purifyProfile } from '../services/cvPurificationPipeline';
import QuantifyPanel from './QuantifyPanel';
import { validateAndNormaliseProfile } from '../utils/profileValidator';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import {
  Plus, Trash, Sparkles, UploadCloud, DownloadCloud, User,
  Briefcase, BookOpen, List, Globe, FileText, CheckCircle,
  X, AlertCircle,
} from './icons';

// ─── Constants ────────────────────────────────────────────────────────────────
// Computed once at module load — buildFlatOntology() is pure with no deps.
const FLAT_ONTOLOGY = buildFlatOntology();
const PREDEFINED_SECTION_OPTIONS: { type: CustomSectionType; label: string }[] = [
  { type: 'awards',         label: 'Awards & Honours' },
  { type: 'certifications', label: 'Certifications & Licences' },
  { type: 'publications',   label: 'Publications' },
  { type: 'volunteer',      label: 'Volunteer Work' },
  { type: 'presentations',  label: 'Presentations & Talks' },
  { type: 'patents',        label: 'Patents' },
  { type: 'courses',        label: 'Courses & Training' },
  { type: 'memberships',    label: 'Professional Memberships' },
  { type: 'achievements',   label: 'Key Achievements' },
  { type: 'hobbies',        label: 'Hobbies & Interests' },
  { type: 'interests',      label: 'Interests' },
  { type: 'custom',         label: 'Custom Section' },
];

const SECTION_LABELS: Record<ProfileSectionKey, string> = {
  summary: 'Professional Summary',
  workExperience: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  languages: 'Languages',
  references: 'References',
};

const newItem = (): CustomSectionItem => ({
  id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  title: '',
  subtitle: '',
  year: '',
  description: '',
  link: '',
});

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'personal' | 'summary' | 'experience' | 'education' | 'skills' |
              'projects' | 'languages' | 'references' | 'order' | 'additional' | 'ai';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

interface ProfileFormProps {
  existingProfile: UserProfile | null;
  onSave: (data: UserProfile) => void;
  onCancel?: () => void;
  apiKeySet: boolean;
  openSettings: () => void;
  onProfileImported?: (profile: UserProfile) => void;
  onJsonImported?: (profile: UserProfile) => void;
  /** Current CV — used to show a lock badge on roles that have AI-polished bullets */
  currentCV?: import('../types').CVData | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(',')[1], mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });

const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// Small AI enhance button
const EnhanceBtn: React.FC<{ loading: boolean; disabled: boolean; onClick: () => void }> = ({ loading, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-[#1B2B4B] dark:text-[#C9A84C] bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 hover:bg-[#F8F7F4] dark:hover:bg-[#152238]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    title="Enhance with AI"
  >
    {loading ? <SpinnerIcon /> : <Sparkles className="h-3 w-3" />}
    <span>AI Enhance</span>
  </button>
);

// Section header within the form
const SectionTitle: React.FC<{ children: React.ReactNode; subtitle?: string; action?: React.ReactNode }> = ({ children, subtitle, action }) => (
  <div className="flex items-start justify-between mb-5">
    <div>
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{children}</h2>
      {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="ml-4 flex-shrink-0">{action}</div>}
  </div>
);

// Card wrapper for list items (experience, education, etc.)
const EntryCard: React.FC<{
  index: number;
  onDelete: () => void;
  children: React.ReactNode;
  label?: string;
  isOpen: boolean;
  onToggle: () => void;
  refined?: boolean;
}> = ({ index, onDelete, children, label, isOpen, onToggle, refined }) => (
  <div className="relative border border-zinc-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800/60 overflow-hidden">
    <div
      className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-neutral-800 cursor-pointer select-none hover:bg-zinc-100 dark:hover:bg-neutral-700/60 transition-colors"
      onClick={onToggle}
    >
      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 tabular-nums w-5 shrink-0">#{index + 1}</span>
      <span className={`text-xs font-medium truncate flex-1 ${label ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 italic'}`}>
        {label || 'New Entry'}
      </span>
      {refined && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 shrink-0">
          ✦ Refined
        </span>
      )}
      <svg
        className={`h-4 w-4 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        viewBox="0 0 20 20" fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
        title="Remove"
      >
        <Trash className="h-3.5 w-3.5" />
      </button>
    </div>
    {isOpen && (
      <div className="p-4 border-t border-zinc-100 dark:border-neutral-700">
        {children}
      </div>
    )}
  </div>
);

// Empty state placeholder
const EmptyState: React.FC<{ message: string; action?: React.ReactNode }> = ({ message, action }) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 border-2 border-dashed border-zinc-200 dark:border-neutral-700 rounded-xl text-center">
    <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-3">{message}</p>
    {action}
  </div>
);

// ─── Refined badge — shown when the CV has a customised version of this field ──
const RefinedBadge = ({ show }: { show: boolean }) =>
  show ? (
    <span
      title="Your CV has a customised version of this content. Editing here will update it when you save."
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 cursor-default"
    >
      <svg className="h-2.5 w-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C8.676 1 6 3.676 6 7v1H4v15h16V8h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>
      ✦ Refined
    </span>
  ) : null;

// ─── Key helpers (separate from apiKeySet which includes CF worker) ────────────
function hasGeminiKey(): boolean {
  try {
    const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (s) { const p = JSON.parse(s); if (p.apiKey && !p.apiKey.startsWith('enc:v1:')) return true; }
    const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
    return !!(pk.gemini && !pk.gemini.startsWith('enc:v1:'));
  } catch { return false; }
}
function hasClaudeKey(): boolean {
  try {
    const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (s) { const p = JSON.parse(s); if (p.claudeApiKey && !p.claudeApiKey.startsWith('enc:v1:')) return true; }
    const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
    return !!(pk.claude && !pk.claude.startsWith('enc:v1:'));
  } catch { return false; }
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ProfileForm: React.FC<ProfileFormProps> = ({ existingProfile, onSave, onCancel, apiKeySet, openSettings, onProfileImported, onJsonImported, currentCV }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [profileInputMode, setProfileInputMode] = useState<'text' | 'upload' | 'json'>('text');
  const [rawText, setRawText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<{ label: string; sub?: string; step: 0|1|2|3|4 } | null>(null);
  const [importConfidence, setImportConfidence] = useState<Record<string, number> | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<string | null>(null);
  const [quantifyingEntry, setQuantifyingEntry] = useState<number | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  const [customSections, setCustomSections] = useState<CustomSection[]>(existingProfile?.customSections || []);
  const [sectionOrder, setSectionOrder] = useState<ProfileSectionKey[]>(
    existingProfile?.sectionOrder || [...DEFAULT_SECTION_ORDER]
  );
  const [newSectionType, setNewSectionType] = useState<CustomSectionType>('awards');
  const [customLabelInput, setCustomLabelInput] = useState('');

  // Accordion state — track which card is open per section (-1 = none)
  const [openWork, setOpenWork] = useState<number>(0);
  const [openEdu, setOpenEdu] = useState<number>(0);
  const [openProj, setOpenProj] = useState<number>(-1);
  const [openLang, setOpenLang] = useState<number>(-1);
  const [openRef, setOpenRef] = useState<number>(-1);
  const newCardRef = useRef<HTMLDivElement>(null);

  const methods = useForm<UserProfile>({
    defaultValues: existingProfile || {
      personalInfo: { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '', photo: '' },
      summary: '',
      workExperience: [{ id: '1', company: '', jobTitle: '', startDate: '', endDate: '', responsibilities: '' }],
      education: [{ id: '1', degree: '', school: '', graduationYear: '' }],
      skills: [],
      projects: [{ id: '1', name: '', description: '', link: '' }],
      languages: [{ id: '1', name: '', proficiency: '' }],
    },
  });

  const { register, control, handleSubmit, formState: { errors }, reset, getValues, setValue, watch } = methods;

  // When an external import (Word, PDF, cloud restore) updates the `existingProfile`
  // prop, react-hook-form's defaultValues are already frozen from mount — we must
  // explicitly call reset() to reflect the new profile in the form fields.
  // Also sync the two useState values (customSections, sectionOrder) that are NOT
  // managed by react-hook-form and therefore not updated by reset() alone.
  const _prevProfileRef = useRef(existingProfile);
  useEffect(() => {
    if (existingProfile && existingProfile !== _prevProfileRef.current) {
      _prevProfileRef.current = existingProfile;
      reset(existingProfile);
      setCustomSections(existingProfile.customSections || []);
      setSectionOrder(existingProfile.sectionOrder || [...DEFAULT_SECTION_ORDER]);
    }
  }, [existingProfile, reset]);

  const handleDetectLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 300000 })
      );
      const { latitude, longitude } = position.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || '';
      const county = addr.county || addr.state_district || '';
      const country = addr.country || '';
      const parts: string[] = [];
      if (city) parts.push(city);
      if (county && county !== city) parts.push(county);
      if (country) parts.push(country);
      const location = parts.join(', ') || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      setValue('personalInfo.location', location);
    } catch {
      // silently ignore — geolocation blocked or network error
    } finally {
      setDetectingLocation(false);
    }
  }, [setValue]);

  const { fields: workFields, append: appendWork, remove: removeWork } = useFieldArray({ control, name: 'workExperience' });
  const { fields: eduFields, append: appendEdu, remove: removeEdu } = useFieldArray({ control, name: 'education' });
  const { fields: projFields, append: appendProj, remove: removeProj } = useFieldArray({ control, name: 'projects' });
  const { fields: langFields, append: appendLang, remove: removeLang } = useFieldArray({ control, name: 'languages' });
  const { fields: refFields, append: appendRef, remove: removeRef } = useFieldArray({ control, name: 'references' });

  const [jobDescription] = useLocalStorage<string>('jobDescription', '');

  // ── Submission ─────────────────────────────────────────────────────────────
  const onSubmit = (data: UserProfile) => {
    const skillsArray = typeof data.skills === 'string'
      ? (data.skills as string).split(',').map(s => s.trim()).filter(Boolean)
      : data.skills;
    onSave({
      ...data,
      skills: skillsArray,
      customSections: customSections.filter(s => s.items.length > 0),
      sectionOrder,
    });
  };

  // ── Custom Sections helpers ────────────────────────────────────────────────
  const handleAddSection = () => {
    const option = PREDEFINED_SECTION_OPTIONS.find(o => o.type === newSectionType);
    const label = newSectionType === 'custom'
      ? (customLabelInput.trim() || 'Custom Section')
      : (option?.label || 'Custom');
    setCustomSections(prev => [...prev, { id: `sec-${Date.now()}`, type: newSectionType, label, items: [newItem()] }]);
    setCustomLabelInput('');
  };

  const handleDeleteSection = (id: string) => setCustomSections(prev => prev.filter(s => s.id !== id));
  const handleUpdateSectionLabel = (id: string, label: string) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  const handleAddItem = (id: string) =>
    setCustomSections(prev => prev.map(s => s.id === id ? { ...s, items: [...s.items, newItem()] } : s));
  const handleDeleteItem = (sectionId: string, itemId: string) =>
    setCustomSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s));
  const handleUpdateItem = (sectionId: string, itemId: string, field: keyof CustomSectionItem, value: string) =>
    setCustomSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) } : s
    ));
  const handleMoveSectionUp = (id: string) => {
    setCustomSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx <= 0) return prev;
      const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next;
    });
  };
  const handleMoveSectionDown = (id: string) => {
    setCustomSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next;
    });
  };

  // ── Section Order helpers ──────────────────────────────────────────────────
  const handleMoveOrderUp = (index: number) => {
    if (index <= 0) return;
    setSectionOrder(prev => { const next = [...prev]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; });
  };
  const handleMoveOrderDown = (index: number) => {
    setSectionOrder(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next;
    });
  };

  // ── AI helpers ────────────────────────────────────────────────────────────

  // Handle Ctrl+V / Cmd+V of a screenshot or copied image in the text area.
  // Clipboard images are silently dropped without this handler.
  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(item => /^image\//i.test(item.type));
    if (!imageItem) return; // plain text paste — let default behaviour handle it
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) {
      setAiError('Could not read the pasted image. Try using the upload button instead.');
      return;
    }
    setUploadedFile(file);
    setRawText('');
    setProfileInputMode('upload');
    setAiError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setRawText(''); setAiError(null); }
    e.target.value = '';
  };

  const handleGenerateProfile = async () => {
    if (!rawText.trim() && !uploadedFile) {
      setAiError('Please paste your resume text or upload a file to continue.'); return;
    }
    setIsGenerating(true); setAiError(null); setImportStage(null);
    const importT0 = performance.now();
    const importSource = uploadedFile
      ? `file:${uploadedFile.name} (${Math.round(uploadedFile.size / 1024)}KB, ${uploadedFile.type || 'unknown type'})`
      : `text-paste:${rawText.trim().length} chars`;
    console.group(`[ImportPipeline] Import started — ${importSource}`);
    try {
      let profile: UserProfile;

      if (uploadedFile) {
        const mimeType = uploadedFile.type || '';
        const isPDF  = mimeType === 'application/pdf' || uploadedFile.name.toLowerCase().endsWith('.pdf');
        const isDOCX = mimeType.includes('wordprocessingml') || uploadedFile.name.toLowerCase().endsWith('.docx');
        const isImage = /^image\//i.test(mimeType);

        const activeProvider = getSelectedProvider();
        console.log(`[ImportPipeline] ${isPDF ? 'PDF' : isDOCX ? 'DOCX' : 'Image'} — provider: ${activeProvider}`);

        if (isPDF) {
          setImportStage({ step: 1, label: 'Reading PDF…' });
          if (activeProvider === 'claude') {
            setImportStage({ step: 2, label: 'Extracting via Claude…', sub: 'Multimodal AI reading your PDF' });
            const { base64 } = await fileToBase64(uploadedFile);
            profile = purifyProfile(await generateProfileFromFileClaude(base64, mimeType, undefined));
          } else if (activeProvider === 'gemini') {
            setImportStage({ step: 2, label: 'Extracting via Gemini…', sub: 'Multimodal AI reading your PDF' });
            const { base64 } = await fileToBase64(uploadedFile);
            profile = purifyProfile(await generateProfileFromFileWithGemini(base64, mimeType, undefined));
          } else {
            // Workers AI (free/premium) — toMarkdown handles the whole PDF server-side;
            // text-layer PDFs cost zero tokens, scanned PDFs use vision quota.
            setImportStage({ step: 2, label: 'Extracting via Workers AI…', sub: 'Free — no key required' });
            const text = await workerExtractDoc(uploadedFile);
            if (!text || text.trim().length < 50) throw new Error('Workers AI could not read this PDF. Try pasting your CV text instead.');
            setImportStage({ step: 3, label: 'Structuring profile…' });
            profile = await generateProfile(text, undefined);
          }
          setImportStage({ step: 4, label: 'Profile extracted ✓' });

        } else if (isDOCX) {
          // Claude and Gemini cannot accept raw DOCX bytes — extract text via
          // Workers AI toMarkdown first, then the user's chosen provider structures it.
          setImportStage({ step: 1, label: 'Extracting text from Word document…' });
          const text = await workerExtractDoc(uploadedFile);
          if (!text || text.trim().length < 50) throw new Error('Could not extract text from this Word document. Try saving as PDF and importing that instead.');
          setImportStage({ step: 2, label: 'Parsing sections…' });
          const result = await runImportPipeline(text, 'docx', {
            onStage1Complete: (r) => { setImportStage({ step: 3, label: 'Structuring profile…' }); setImportConfidence(r.confidence); },
            onStage2Complete: (_, provider) => setImportStage({ step: 4, label: 'AI verification complete ✓', sub: `via ${provider}` }),
          });
          profile = result.profile;
          setImportConfidence(result.confidence);

        } else if (isImage) {
          setImportStage({ step: 1, label: 'Reading image…' });
          if (activeProvider === 'claude') {
            setImportStage({ step: 2, label: 'Extracting via Claude…', sub: 'Multimodal AI reading your image' });
            const { base64 } = await fileToBase64(uploadedFile);
            profile = purifyProfile(await generateProfileFromFileClaude(base64, mimeType, undefined));
          } else if (activeProvider === 'gemini') {
            setImportStage({ step: 2, label: 'Extracting via Gemini…', sub: 'Multimodal AI reading your image' });
            const { base64 } = await fileToBase64(uploadedFile);
            profile = purifyProfile(await generateProfileFromFileWithGemini(base64, mimeType, undefined));
          } else {
            // Workers AI — toMarkdown handles images via vision server-side
            setImportStage({ step: 2, label: 'Extracting via Workers AI…', sub: 'Free — no key required' });
            const text = await workerExtractDoc(uploadedFile);
            if (!text || text.trim().length < 50) throw new Error('Could not extract text from this image. Try pasting your CV text instead.');
            setImportStage({ step: 3, label: 'Structuring profile…' });
            profile = await generateProfile(text, undefined);
          }
          setImportStage({ step: 4, label: 'Profile extracted ✓' });

        } else {
          throw new Error('Unsupported file type. Please upload a PDF, DOCX, or image file.');
        }

      } else {
        // ── Text paste path ─────────────────────────────────────────────────
        // Zero-token pipeline, AI verify in background
        setImportStage({ step: 1, label: 'Reading pasted text…' });
        const result = await runImportPipeline(rawText, 'text', {
          onStage1Complete: (r) => { setImportStage({ step: 3, label: 'Structuring profile…' }); setImportConfidence(r.confidence); },
          onStage2Complete: (_, provider) => setImportStage({ step: 4, label: 'AI verification complete ✓', sub: `via ${provider}` }),
        });
        profile = result.profile;
        setImportConfidence(result.confidence);
        if (!result.aiVerified) setImportStage({ step: 4, label: 'Profile ready ✓', sub: 'Add an AI key for higher accuracy' });
      }

      reset(profile);
      setCustomSections(profile.customSections || []);
      setSectionOrder(profile.sectionOrder || [...DEFAULT_SECTION_ORDER]);
      // NOTE: do NOT call onProfileImported here — that would immediately persist
      // the imported data to state/cloud before the user clicks Save.
      // The form is already populated via reset(profile); the user reviews and
      // clicks "Save Profile" to commit, or Cancel to discard.
      setActiveTab('personal');
      console.log(`[ImportPipeline] ✓ Import complete — ${Math.round(performance.now() - importT0)}ms total`);
      console.groupEnd();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[ImportPipeline] ✗ Import failed — ${Math.round(performance.now() - importT0)}ms | ${msg}`);
      console.groupEnd();
      setAiError(`Import failed: ${msg}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => setImportStage(null), 3000);
    }
  };

  const handleEnhance = async (type: 'summary' | 'responsibilities' | 'project', index?: number) => {
    if (!apiKeySet) { alert('Please set your API key in settings.'); openSettings(); return; }
    const key = index !== undefined ? `${type}.${index}` : type;
    setIsEnhancing(key);
    try {
      if (type === 'summary') {
        setValue('summary', await generateEnhancedSummary(getValues()));
      } else if (type === 'responsibilities' && index !== undefined) {
        const w = getValues(`workExperience.${index}`);
        const start = w.startDate ? new Date(w.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
        const end = w.endDate && w.endDate.toLowerCase() !== 'present'
          ? new Date(w.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : 'Present';
        setValue(`workExperience.${index}.responsibilities`,
          await generateEnhancedResponsibilities(w.jobTitle, w.company, w.responsibilities, jobDescription,
            start ? `${start} - ${end}` : 'Unknown duration', w.pointCount ?? 5));
      } else if (type === 'project' && index !== undefined) {
        const p = getValues(`projects.${index}`);
        setValue(`projects.${index}.description`, await generateEnhancedProjectDescription(p.name, p.description));
      }
    } catch (e) {
      alert(`Enhancement failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsEnhancing(null);
    }
  };

  const handleExportProfile = () => {
    const data = getValues();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'craftcv_profile.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleJsonImport = () => {
    if (!jsonText.trim()) { setJsonParseError('Paste your JSON first.'); return; }
    setJsonParseError(null);
    try {
      const raw = JSON.parse(jsonText);

      // ── Choose normalisation strategy ─────────────────────────────────────
      // ProCV fast path: if the JSON is already in ProCV format (has a valid
      // personalInfo object AND all collection fields are arrays or absent),
      // use it directly so no fields are dropped (pointCount, preferredField,
      // location, etc.). For foreign JSON run the full normaliser.
      let profile: UserProfile;
      const pi = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).personalInfo : null;
      const collectionFields = ['workExperience', 'education', 'skills', 'projects', 'languages', 'references', 'customSections'] as const;
      const collectionsAreValid = collectionFields.every(f => {
        const v = (raw as Record<string, unknown>)[f];
        return v === undefined || v === null || Array.isArray(v);
      });
      const isProCVFormat =
        raw && typeof raw === 'object' &&
        pi && typeof pi === 'object' && !Array.isArray(pi) &&
        ((pi as Record<string, unknown>).name || (pi as Record<string, unknown>).email) &&
        collectionsAreValid;

      if (isProCVFormat) {
        profile = raw as UserProfile;
        // Ensure all required arrays exist (guard against missing keys)
        profile.workExperience = Array.isArray(profile.workExperience) ? profile.workExperience : [];
        profile.education       = Array.isArray(profile.education)       ? profile.education       : [];
        profile.skills          = Array.isArray(profile.skills)          ? profile.skills          : [];
        profile.projects        = Array.isArray(profile.projects)        ? profile.projects        : [];
        profile.languages       = Array.isArray(profile.languages)       ? profile.languages       : [];
      } else {
        profile = validateAndNormaliseProfile(raw);
      }

      // ── Populate the form (so the user can review / edit before they leave) ─
      reset(profile);
      setCustomSections(profile.customSections || []);
      setSectionOrder(profile.sectionOrder || [...DEFAULT_SECTION_ORDER]);

      // ── Kick off career-track classification in the background ────────────
      if (profile.workExperience?.length) {
        classifyAndSaveAllRoles(profile.workExperience, 'json_import').catch(() => {});
      }

      // ── Update the parent's state so the CV template is populated now ─────
      // onJsonImported calls profileToCV(), updates currentCV in the slot,
      // syncs to cache, and navigates to the generator — identical to the
      // old WordImportPanel JSON path.
      if (onJsonImported) {
        onJsonImported(profile);
      } else {
        // Fallback: stay on form, let user save manually
        setActiveTab('personal');
      }

      setJsonText('');
    } catch (err) {
      setJsonParseError(err instanceof Error ? err.message : 'Could not parse JSON.');
    }
  };

  const handleJsonFileLoad = (file: File) => {
    if (!file.name.match(/\.json$/i)) { setJsonParseError('Please select a .json file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') { setJsonText(content); setJsonParseError(null); }
    };
    reader.readAsText(file);
    if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
  };

  // ── Tab completion indicators ──────────────────────────────────────────────
  const watchedName = watch('personalInfo.name');
  const watchedEmail = watch('personalInfo.email');
  const watchedSummary = watch('summary');

  const isComplete: Record<TabKey, boolean> = {
    personal: !!(watchedName && watchedEmail),
    summary: !!watchedSummary,
    experience: workFields.some(f => (watch(`workExperience.${workFields.indexOf(f)}.company`) || '')),
    education: eduFields.length > 0,
    skills: !!watch('skills'),
    projects: projFields.length > 0,
    languages: langFields.length > 0,
    references: refFields.length > 0,
    order: true,
    additional: customSections.length > 0,
    ai: false,
  };

  const TABS: TabDef[] = [
    { key: 'personal',    label: 'Personal Info',  icon: <User className="h-4 w-4" /> },
    { key: 'summary',     label: 'Summary',        icon: <FileText className="h-4 w-4" /> },
    { key: 'experience',  label: 'Experience',     icon: <Briefcase className="h-4 w-4" /> },
    { key: 'education',   label: 'Education',      icon: <BookOpen className="h-4 w-4" /> },
    { key: 'skills',      label: 'Skills',         icon: <List className="h-4 w-4" /> },
    { key: 'projects',    label: 'Projects',       icon: <Globe className="h-4 w-4" /> },
    { key: 'languages',   label: 'Languages',      icon: <Globe className="h-4 w-4" /> },
    { key: 'references',  label: 'References',     icon: <User className="h-4 w-4" /> },
    { key: 'order',       label: 'Section Order',  icon: <List className="h-4 w-4" /> },
    { key: 'additional',  label: 'Additional',     icon: <Plus className="h-4 w-4" /> },
  ];

  // ── Render sections ────────────────────────────────────────────────────────
  const renderPersonal = () => (
    <div className="space-y-6">
      <SectionTitle subtitle="Your contact details appear at the top of every CV.">
        Personal Information
      </SectionTitle>

      {/* Photo Upload */}
      <div className="p-5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/40">
        <Label className="text-sm font-semibold mb-3 block">Profile Photo <span className="text-zinc-400 font-normal">(Optional)</span></Label>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex-shrink-0">
            {watch('personalInfo.photo') ? (
              <div className="relative group">
                <img src={watch('personalInfo.photo')} alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-neutral-700 shadow-md" />
                <button type="button" onClick={() => setValue('personalInfo.photo', '')}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600">
                  <Trash className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-neutral-700 border-4 border-white dark:border-neutral-600 shadow-md flex items-center justify-center">
                <User className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              </div>
            )}
          </div>
          <label htmlFor="photo-upload"
            className="flex-1 w-full flex flex-col items-center justify-center h-24 border-2 border-dashed border-zinc-300 dark:border-neutral-600 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-neutral-700/50 transition-colors">
            <UploadCloud className="h-5 w-5 text-zinc-400 mb-1" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Click to upload photo</p>
            <p className="text-xs text-zinc-400">PNG, JPG, WEBP · Max 2MB</p>
            <input id="photo-upload" type="file" className="sr-only" accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { alert('Max 2MB'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => { setCropSrc(ev.target?.result as string); };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name" className="mb-1 block">Full Name <span className="text-red-400">*</span></Label>
          <Input id="name" {...register('personalInfo.name', { required: true })} placeholder="Jane Smith" />
          {errors.personalInfo?.name && <p className="text-red-500 text-xs mt-1">Required</p>}
        </div>
        <div>
          <Label htmlFor="email" className="mb-1 block">Email Address <span className="text-red-400">*</span></Label>
          <Input id="email" type="email" {...register('personalInfo.email', { required: true })} placeholder="jane@example.com" />
          {errors.personalInfo?.email && <p className="text-red-500 text-xs mt-1">Required</p>}
        </div>
        <div>
          <Label htmlFor="phone" className="mb-1 block">Phone Number</Label>
          <Input id="phone" {...register('personalInfo.phone')} placeholder="+1 (555) 000-0000" />
        </div>
        <div>
          <Label htmlFor="location" className="mb-1 block">Location</Label>
          <div className="flex gap-2">
            <Input id="location" {...register('personalInfo.location')} placeholder="City, County, Country" className="flex-1" />
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={detectingLocation}
              title="Auto-detect your location"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#C9A84C]/60 hover:text-[#1B2B4B] dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {detectingLocation ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3" opacity="0"/></svg>
              )}
              {detectingLocation ? 'Detecting…' : 'Detect'}
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="linkedin" className="mb-1 block">LinkedIn URL</Label>
          <Input id="linkedin" {...register('personalInfo.linkedin')} placeholder="https://linkedin.com/in/username" />
        </div>
        <div>
          <Label htmlFor="website" className="mb-1 block">Website / Portfolio</Label>
          <Input id="website" {...register('personalInfo.website')} placeholder="https://yoursite.com" />
        </div>
        <div>
          <Label htmlFor="github" className="mb-1 block">GitHub URL</Label>
          <Input id="github" {...register('personalInfo.github')} placeholder="https://github.com/username" />
        </div>
        {/* S6 — Profession Ontology field picker */}
        <div className="md:col-span-2">
          <Label htmlFor="preferredField" className="mb-1 block">
            Industry / Field <span className="text-zinc-400 font-normal">(Optional)</span>
          </Label>
          <select
            id="preferredField"
            {...register('preferredField')}
            className="w-full rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-zinc-800 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C] transition-colors"
          >
            <option value="">— Auto-detect from job description —</option>
            {FLAT_ONTOLOGY.map(({ node, depth }) =>
              !node.isLeaf ? (
                <optgroup
                  key={node.slug}
                  label={`${'  '.repeat(depth)}${node.icon} ${node.label}`}
                />
              ) : (
                <option key={node.slug} value={node.slug}>
                  {'  '.repeat(depth)}{node.icon} {node.label}
                </option>
              )
            )}
          </select>
          <p className="text-xs text-zinc-400 mt-1">
            Selecting a field pins the AI to that industry's vocabulary and writing style. Leave blank to auto-detect from your job description.
          </p>
        </div>
      </div>
    </div>
  );

  const renderSummary = () => {
    const summaryRefined =
      !!currentCV?.summary &&
      currentCV.summary.trim().length > 0 &&
      currentCV.summary.trim() !== (existingProfile?.summary || '').trim();
    return (
    <div className="space-y-4">
      <SectionTitle
        subtitle="A 2–4 sentence snapshot of your career, skills, and value proposition."
        action={
          <div className="flex items-center gap-2">
            <RefinedBadge show={summaryRefined} />
            <EnhanceBtn
              loading={isEnhancing === 'summary'}
              disabled={!apiKeySet || !!isEnhancing}
              onClick={() => handleEnhance('summary')}
            />
          </div>
        }
      >
        Professional Summary
      </SectionTitle>
      <Textarea
        id="summary"
        {...register('summary', { required: true })}
        rows={6}
        placeholder="Experienced software engineer with 5+ years building scalable web applications..."
      />
      {errors.summary && <p className="text-red-500 text-xs">Summary is required</p>}
      <p className="text-xs text-zinc-400">Tip: Use the AI Enhance button to generate a compelling summary from your profile data.</p>
    </div>
  );
  };

  const renderExperience = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="List your work history starting with the most recent position.">
        Work Experience
      </SectionTitle>
      <div className="space-y-4">
        {workFields.map((item, index) => (
          <div key={item.id} ref={index === workFields.length - 1 ? newCardRef : undefined}>
          <EntryCard
            index={index}
            label={watch(`workExperience.${index}.jobTitle`) || watch(`workExperience.${index}.company`) || ''}
            onDelete={() => { removeWork(index); setOpenWork(prev => prev >= index ? Math.max(0, prev - 1) : prev); }}
            isOpen={openWork === index}
            onToggle={() => setOpenWork(prev => prev === index ? -1 : index)}
            refined={currentCV?.experience?.some(
              e => e.company === watch(`workExperience.${index}.company`) &&
                   e.jobTitle === watch(`workExperience.${index}.jobTitle`) &&
                   e.responsibilities.length > 0
            )}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Job Title <span className="text-red-400">*</span></Label>
                  <Input
                    placeholder="e.g. Senior Software Engineer"
                    {...register(`workExperience.${index}.jobTitle`, { required: true })}
                    onBlur={async (e) => {
                      const title = e.target.value.trim();
                      if (!title) return;
                      classifyRoleFieldAsync(title, 'manual_form').catch(() => {});
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Company <span className="text-red-400">*</span></Label>
                  <Input placeholder="e.g. Acme Corp" {...register(`workExperience.${index}.company`, { required: true })} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Start Date</Label>
                  <Input type="date" {...register(`workExperience.${index}.startDate`)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">End Date <span className="text-zinc-400 font-normal">(leave blank for current)</span></Label>
                  <Input type="date" {...register(`workExperience.${index}.endDate`)} />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Bullet Points per Entry</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[3, 4, 5, 6, 7, 8].map(count => {
                    const current = (watch(`workExperience.${index}.pointCount`) as number) ?? 5;
                    const selected = current === count;
                    return (
                      <button key={count} type="button"
                        onClick={() => setValue(`workExperience.${index}.pointCount`, count)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${selected
                          ? 'bg-[#1B2B4B] border-[#1B2B4B] text-white shadow-sm'
                          : 'bg-white dark:bg-neutral-700 border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:border-[#C9A84C]/60 hover:text-[#1B2B4B]'
                        }`}
                      >
                        {count}
                      </button>
                    );
                  })}
                  <span className="text-xs text-zinc-400 ml-1">AI bullet count</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Responsibilities & Achievements</Label>
                    {(() => {
                      const company  = watch(`workExperience.${index}.company`);
                      const jobTitle = watch(`workExperience.${index}.jobTitle`);
                      const isRefined = currentCV?.experience?.some(
                        e => e.company === company && e.jobTitle === jobTitle && e.responsibilities.length > 0
                      ) ?? false;
                      return <RefinedBadge show={isRefined} />;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!apiKeySet || !!isEnhancing || quantifyingEntry !== null}
                      onClick={() => setQuantifyingEntry(index)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Add numbers and metrics to each bullet point"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                      <span>Quantify</span>
                    </button>
                    <EnhanceBtn
                      loading={isEnhancing === `responsibilities.${index}`}
                      disabled={!apiKeySet || !!isEnhancing}
                      onClick={() => handleEnhance('responsibilities', index)}
                    />
                  </div>
                </div>
                <Textarea
                  {...register(`workExperience.${index}.responsibilities`, { required: true })}
                  rows={4}
                  placeholder="List key achievements and responsibilities. Click AI Enhance to generate professional bullet points."
                />
              </div>
            </div>
          </EntryCard>
          </div>
        ))}
        {workFields.length === 0 && (
          <EmptyState message="No work experience added yet." />
        )}
      </div>
      <Button type="button" variant="secondary" size="sm"
        onClick={() => {
          const newIndex = workFields.length;
          appendWork({ id: `${Date.now()}`, company: '', jobTitle: '', startDate: '', endDate: '', responsibilities: '', pointCount: 5 });
          setOpenWork(newIndex);
          setTimeout(() => newCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        }}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Position
      </Button>
    </div>
  );

  const renderEducation = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Include degrees, diplomas, and relevant certifications.">
        Education
      </SectionTitle>
      <div className="space-y-4">
        {eduFields.map((item, index) => (
          <EntryCard
            key={item.id}
            index={index}
            label={watch(`education.${index}.degree`) || watch(`education.${index}.school`) || ''}
            onDelete={() => { removeEdu(index); setOpenEdu(prev => prev >= index ? Math.max(0, prev - 1) : prev); }}
            isOpen={openEdu === index}
            onToggle={() => setOpenEdu(prev => prev === index ? -1 : index)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1 block">Degree / Qualification <span className="text-red-400">*</span></Label>
                <Input placeholder="e.g. B.S. in Computer Science" {...register(`education.${index}.degree`, { required: true })} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Graduation Year</Label>
                <Input placeholder="2023" {...register(`education.${index}.graduationYear`)} />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs mb-1 block">School / University <span className="text-red-400">*</span></Label>
                <Input placeholder="e.g. University of Oxford" {...register(`education.${index}.school`, { required: true })} />
              </div>
            </div>
          </EntryCard>
        ))}
        {eduFields.length === 0 && <EmptyState message="No education entries yet." />}
      </div>
      <Button type="button" variant="secondary" size="sm"
        onClick={() => { const ni = eduFields.length; appendEdu({ id: `${Date.now()}`, degree: '', school: '', graduationYear: '' }); setOpenEdu(ni); }}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Education
      </Button>
    </div>
  );

  const renderSkills = () => {
    const skillsRefined =
      !!currentCV?.skills &&
      currentCV.skills.length > 0 &&
      JSON.stringify([...(currentCV.skills)].sort()) !==
        JSON.stringify([...(existingProfile?.skills ?? [])].sort());
    return (
    <div className="space-y-4">
      <SectionTitle
        subtitle="Comma-separated list of your technical and soft skills."
        action={<RefinedBadge show={skillsRefined} />}
      >
        Skills
      </SectionTitle>
      <Controller
        name="skills"
        control={control}
        defaultValue={existingProfile?.skills || []}
        render={({ field }) => (
          <Textarea
            id="skills"
            {...field}
            value={Array.isArray(field.value) ? field.value.join(', ') : field.value}
            rows={5}
            placeholder="React, TypeScript, Node.js, Python, AWS, Docker, Agile, Team Leadership..."
          />
        )}
      />
      <p className="text-xs text-zinc-400">Separate each skill with a comma. The AI will pick the most relevant ones for each job description.</p>
    </div>
  );
  };

  const renderProjects = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Showcase personal or professional projects that demonstrate your skills.">
        Projects <span className="text-sm font-normal text-zinc-400">(Optional)</span>
      </SectionTitle>
      <div className="space-y-4">
        {projFields.map((item, index) => (
          <EntryCard
            key={item.id}
            index={index}
            label={watch(`projects.${index}.name`) || ''}
            onDelete={() => { removeProj(index); setOpenProj(prev => prev >= index ? Math.max(0, prev - 1) : prev); }}
            isOpen={openProj === index}
            onToggle={() => setOpenProj(prev => prev === index ? -1 : index)}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Project Name</Label>
                <Input placeholder="e.g. AI-Powered CV Builder" {...register(`projects.${index}.name`)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Description</Label>
                    {(() => {
                      const projName = watch(`projects.${index}.name`);
                      const projDesc = watch(`projects.${index}.description`);
                      const cvProj = currentCV?.projects?.find(p => p.name === projName);
                      return <RefinedBadge show={!!cvProj && !!cvProj.description && cvProj.description !== projDesc} />;
                    })()}
                  </div>
                  <EnhanceBtn
                    loading={isEnhancing === `project.${index}`}
                    disabled={!apiKeySet || !!isEnhancing}
                    onClick={() => handleEnhance('project', index)}
                  />
                </div>
                <Textarea
                  {...register(`projects.${index}.description`)}
                  rows={3}
                  placeholder="Describe what you built, technologies used, and key results..."
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Link</Label>
                <Input placeholder="https://github.com/username/project" {...register(`projects.${index}.link`)} />
              </div>
            </div>
          </EntryCard>
        ))}
        {projFields.length === 0 && <EmptyState message="No projects added yet." />}
      </div>
      <Button type="button" variant="secondary" size="sm"
        onClick={() => { const ni = projFields.length; appendProj({ id: `${Date.now()}`, name: '', description: '', link: '' }); setOpenProj(ni); }}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Project
      </Button>
    </div>
  );

  const renderLanguages = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Languages you speak and your proficiency level.">
        Languages <span className="text-sm font-normal text-zinc-400">(Optional)</span>
      </SectionTitle>
      <div className="space-y-3">
        {langFields.map((item, index) => (
          <EntryCard
            key={item.id}
            index={index}
            label={watch(`languages.${index}.name`) || ''}
            onDelete={() => { removeLang(index); setOpenLang(prev => prev >= index ? Math.max(0, prev - 1) : prev); }}
            isOpen={openLang === index}
            onToggle={() => setOpenLang(prev => prev === index ? -1 : index)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Language</Label>
                <Input placeholder="e.g. Spanish" {...register(`languages.${index}.name`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Proficiency</Label>
                <Input placeholder="e.g. Fluent, Native, B2" {...register(`languages.${index}.proficiency`)} />
              </div>
            </div>
          </EntryCard>
        ))}
        {langFields.length === 0 && <EmptyState message="No languages added yet." />}
      </div>
      <Button type="button" variant="secondary" size="sm"
        onClick={() => { const ni = langFields.length; appendLang({ id: `${Date.now()}`, name: '', proficiency: '' }); setOpenLang(ni); }}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Language
      </Button>
    </div>
  );

  const renderReferences = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Professional contacts who can vouch for your work and character.">
        References <span className="text-sm font-normal text-zinc-400">(Optional)</span>
      </SectionTitle>
      <div className="space-y-3">
        {refFields.map((item, index) => (
          <EntryCard
            key={item.id}
            index={index}
            label={watch(`references.${index}.name`) || ''}
            onDelete={() => { removeRef(index); setOpenRef(prev => prev >= index ? Math.max(0, prev - 1) : prev); }}
            isOpen={openRef === index}
            onToggle={() => setOpenRef(prev => prev === index ? -1 : index)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Full Name</Label>
                <Input placeholder="Dr. John Smith" {...register(`references.${index}.name`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Job Title</Label>
                <Input placeholder="Head of Engineering" {...register(`references.${index}.title`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Company</Label>
                <Input placeholder="Acme Corp" {...register(`references.${index}.company`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Relationship</Label>
                <Input placeholder="Direct Manager" {...register(`references.${index}.relationship`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Email</Label>
                <Input type="email" placeholder="john@example.com" {...register(`references.${index}.email`)} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Phone</Label>
                <Input placeholder="+1 (555) 000-0000" {...register(`references.${index}.phone`)} />
              </div>
            </div>
          </EntryCard>
        ))}
        {refFields.length === 0 && (
          <EmptyState
            message="No references added yet. Add professional contacts who can verify your work."
            action={
              <Button type="button" variant="secondary" size="sm"
                onClick={() => { appendRef({ id: `${Date.now()}`, name: '', title: '', company: '', relationship: '', email: '', phone: '' }); setOpenRef(0); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Reference
              </Button>
            }
          />
        )}
        {refFields.length > 0 && (
          <Button type="button" variant="secondary" size="sm"
            onClick={() => { const ni = refFields.length; appendRef({ id: `${Date.now()}`, name: '', title: '', company: '', relationship: '', email: '', phone: '' }); setOpenRef(ni); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Reference
          </Button>
        )}
      </div>
    </div>
  );

  const renderOrder = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Drag the sections into your preferred order. The AI will structure your CV accordingly.">
        Section Order
      </SectionTitle>
      <div className="space-y-2">
        {sectionOrder.map((key, idx) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 rounded-xl">
            <span className="text-xs font-bold text-zinc-400 w-5 text-center tabular-nums">{idx + 1}</span>
            <span className="flex-1 text-sm font-medium">{SECTION_LABELS[key]}</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => handleMoveOrderUp(idx)} disabled={idx === 0}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <button type="button" onClick={() => handleMoveOrderDown(idx)} disabled={idx === sectionOrder.length - 1}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 disabled:opacity-20 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {customSections.length > 0 && (
        <>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-4 mb-2">Additional Sections</p>
          <div className="space-y-2">
            {customSections.map((cs, idx) => (
              <div key={cs.id} className="flex items-center gap-3 px-4 py-3 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-xl">
                <span className="text-xs font-bold text-[#C9A84C] w-5 text-center">{sectionOrder.length + idx + 1}</span>
                <span className="flex-1 text-sm font-medium text-[#1B2B4B] dark:text-[#C9A84C]/80">{cs.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C] rounded font-medium">custom</span>
                <div className="flex gap-0.5">
                  <button type="button" onClick={() => handleMoveSectionUp(cs.id)} disabled={idx === 0}
                    className="p-1.5 rounded-lg text-[#C9A84C] hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => handleMoveSectionDown(cs.id)} disabled={idx === customSections.length - 1}
                    className="p-1.5 rounded-lg text-[#C9A84C] hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderAdditional = () => (
    <div className="space-y-6">
      <SectionTitle subtitle="Add extra sections like Awards, Certifications, Volunteer Work, etc.">
        Additional Sections
      </SectionTitle>

      {/* Add new section */}
      <div className="p-4 bg-zinc-50 dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-700">
        <p className="text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Add New Section</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs mb-1 block">Section Type</Label>
            <select
              value={newSectionType}
              onChange={e => setNewSectionType(e.target.value as CustomSectionType)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            >
              {PREDEFINED_SECTION_OPTIONS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
            </select>
          </div>
          {newSectionType === 'custom' && (
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs mb-1 block">Section Name</Label>
              <Input value={customLabelInput} onChange={e => setCustomLabelInput(e.target.value)} placeholder="e.g. Patents, Grants…" className="h-9" />
            </div>
          )}
          <Button type="button" onClick={handleAddSection} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Section
          </Button>
        </div>
      </div>

      {/* Existing sections */}
      {customSections.length === 0 ? (
        <EmptyState message="No additional sections yet. Use the form above to add one." />
      ) : (
        <div className="space-y-5">
          {customSections.map((section, sIdx) => (
            <div key={section.id} className="border-2 border-[#C9A84C]/20 dark:border-[#1B2B4B]/40/50 rounded-xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 border-b border-[#C9A84C]/20 dark:border-[#1B2B4B]/40/50">
                <span className="text-xs font-bold text-[#C9A84C]">{sIdx + 1}</span>
                <Input
                  value={section.label}
                  onChange={e => handleUpdateSectionLabel(section.id, e.target.value)}
                  className="flex-1 !h-7 !py-0 !text-sm font-semibold border-0 bg-transparent focus:ring-1"
                  placeholder="Section name"
                />
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => handleMoveSectionUp(section.id)} disabled={sIdx === 0}
                    className="p-1 rounded text-[#C9A84C] hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => handleMoveSectionDown(section.id)} disabled={sIdx === customSections.length - 1}
                    className="p-1 rounded text-[#C9A84C] hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/20 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <button type="button" onClick={() => handleDeleteSection(section.id)}
                    className="p-1 ml-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete section">
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Items */}
              <div className="p-4 space-y-3">
                {section.items.map((item, iIdx) => (
                  <div key={item.id} className="relative p-3 bg-white dark:bg-neutral-800 rounded-xl border border-zinc-100 dark:border-neutral-700 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-zinc-400">Entry {iIdx + 1}</span>
                      {section.items.length > 1 && (
                        <button type="button" onClick={() => handleDeleteItem(section.id, item.id)}
                          className="ml-auto p-0.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-zinc-500 mb-0.5 block">Title *</Label>
                        <Input value={item.title} onChange={e => handleUpdateItem(section.id, item.id, 'title', e.target.value)}
                          placeholder="e.g. Best Innovation Award" className="!h-8 !text-sm" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500 mb-0.5 block">Issuer / Institution</Label>
                        <Input value={item.subtitle || ''} onChange={e => handleUpdateItem(section.id, item.id, 'subtitle', e.target.value)}
                          placeholder="e.g. TechCorp, Coursera" className="!h-8 !text-sm" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500 mb-0.5 block">Year / Date</Label>
                        <Input value={item.year || ''} onChange={e => handleUpdateItem(section.id, item.id, 'year', e.target.value)}
                          placeholder="e.g. 2023" className="!h-8 !text-sm" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-zinc-500 mb-0.5 block">Link</Label>
                        <Input value={item.link || ''} onChange={e => handleUpdateItem(section.id, item.id, 'link', e.target.value)}
                          placeholder="https://..." className="!h-8 !text-sm" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-zinc-500 mb-0.5 block">Description</Label>
                      <Textarea value={item.description || ''} onChange={e => handleUpdateItem(section.id, item.id, 'description', e.target.value)}
                        placeholder="Brief description…" rows={2} className="!text-sm" />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={() => handleAddItem(section.id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Entry
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAI = () => (
    <div className="space-y-6">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-[#1B2B4B] dark:bg-[#C9A84C]/20 flex items-center justify-center shadow-sm">
          <Sparkles className="h-5 w-5 text-[#C9A84C]" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Import Your Existing CV</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Already have a CV? Drop it in — we'll read and structure your full profile in seconds.
            PDF &amp; DOCX work without an AI key.
          </p>
        </div>
      </div>

      {/* ── Mode selector cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {([
          {
            key: 'text' as const,
            icon: (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="14" height="14" rx="2"/>
                <path d="M7 7h6M7 10h6M7 13h4"/>
              </svg>
            ),
            label: 'Paste Text',
            sub: 'Copy & paste',
          },
          {
            key: 'upload' as const,
            icon: <UploadCloud className="h-5 w-5" />,
            label: 'Upload File',
            sub: 'PDF, DOCX, image',
          },
          {
            key: 'json' as const,
            icon: (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4H4a1 1 0 0 0-1 1v2c0 1.1.9 2 2 2H4a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1H3"/>
                <path d="M14 4h2a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2h1a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1h-2"/>
                <path d="M10 4v12"/>
              </svg>
            ),
            label: 'Import JSON',
            sub: 'ProCV export',
          },
        ] as const).map(({ key, icon, label, sub }) => {
          const active = profileInputMode === key;
          return (
            <button
              key={key} type="button"
              onClick={() => { setProfileInputMode(key); setAiError(null); setJsonParseError(null); }}
              className={`relative flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border-2 text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2 ${
                active
                  ? 'border-[#1B2B4B] bg-[#1B2B4B] text-white shadow-md dark:border-[#C9A84C] dark:bg-[#C9A84C]/10 dark:text-[#C9A84C]'
                  : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600 hover:bg-zinc-50 dark:hover:bg-neutral-800 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <span className={active ? 'text-white dark:text-[#C9A84C]' : 'text-zinc-400 dark:text-zinc-500'}>{icon}</span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
              <span className={`text-[10px] leading-tight ${active ? 'text-white/70 dark:text-[#C9A84C]/70' : 'text-zinc-400 dark:text-zinc-600'}`}>{sub}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-[#1B2B4B] dark:bg-[#C9A84C]/10 border-r-2 border-b-2 border-[#1B2B4B] dark:border-[#C9A84C]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content area ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800/30 overflow-hidden">

        {/* Paste Text */}
        {profileInputMode === 'text' && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-[#C9A84C] shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7 5h2v2H7V5Zm0 3h2v3H7V8Z"/>
              </svg>
              Paste any resume text below — or paste a screenshot / image of your CV directly into the box.
            </p>
            <Textarea
              value={rawText}
              onChange={e => { setRawText(e.target.value); setUploadedFile(null); }}
              onPaste={handleTextareaPaste}
              placeholder="Paste your CV or resume text here…&#10;&#10;Work experience, education, skills, certifications — include everything."
              rows={11}
              disabled={isGenerating}
              className="resize-none bg-white dark:bg-neutral-900/60 text-sm"
            />
            {rawText && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 text-right tabular-nums">
                {rawText.length.toLocaleString()} characters
              </p>
            )}
          </div>
        )}

        {/* Upload File */}
        {profileInputMode === 'upload' && (
          <div className="p-4 space-y-4">
            {/* Format badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'PDF', note: 'no AI needed', color: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50' },
                { label: 'DOCX', note: 'no AI needed', color: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50' },
                { label: 'PNG / JPG', note: 'AI key needed', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50' },
              ].map(({ label, note, color }) => (
                <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${color}`}>
                  {label}
                  <span className="opacity-60 font-normal">· {note}</span>
                </span>
              ))}
            </div>

            {/* Drop zone */}
            <label htmlFor="profile-upload" className={`group flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
              uploadedFile
                ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/10 py-5'
                : 'border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-900/40 py-10 hover:border-[#1B2B4B]/40 dark:hover:border-[#C9A84C]/40 hover:bg-zinc-50 dark:hover:bg-neutral-800/60'
            }`}>
              {uploadedFile ? (
                <div className="flex items-center gap-3 px-4">
                  <span className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">Ready to import — click the button below</p>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); setUploadedFile(null); }}
                    className="ml-auto p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-neutral-700 flex items-center justify-center mb-3 group-hover:bg-[#1B2B4B]/8 dark:group-hover:bg-[#C9A84C]/10 transition-colors">
                    <UploadCloud className="h-6 w-6 text-zinc-400 dark:text-zinc-500 group-hover:text-[#1B2B4B] dark:group-hover:text-[#C9A84C] transition-colors" />
                  </span>
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Drop your CV here, or <span className="text-[#1B2B4B] dark:text-[#C9A84C] underline underline-offset-2">browse</span>
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">PDF, DOCX, PNG, JPG, WEBP</p>
                </>
              )}
              <input id="profile-upload" type="file" className="sr-only"
                accept="application/pdf,.docx,image/png,image/jpeg,image/webp"
                onChange={handleFileChange} />
            </label>
          </div>
        )}

        {/* Import JSON */}
        {profileInputMode === 'json' && (
          <div className="p-4 space-y-3">
            {/* Two-option row: paste OR browse */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-neutral-700" />
              <div className="flex items-center gap-2">
                <input ref={jsonFileInputRef} type="file" accept=".json" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleJsonFileLoad(f); }} />
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:border-[#1B2B4B] dark:hover:border-[#C9A84C] hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-all shadow-sm"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Browse .json file
                </button>
              </div>
              <div className="flex-1 h-px bg-zinc-200 dark:bg-neutral-700" />
            </div>
            <Textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonParseError(null); }}
              placeholder={'{ "personalInfo": { "name": "…" }, "workExperience": [ … ] }'}
              rows={9}
              className="font-mono text-xs resize-none bg-white dark:bg-neutral-900/60"
            />
            {jsonText && !jsonParseError && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 text-right tabular-nums">
                {jsonText.length.toLocaleString()} characters
              </p>
            )}
            {jsonParseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-600 dark:text-red-400 text-sm">{jsonParseError}</p>
              </div>
            )}
            <Button
              onClick={handleJsonImport}
              disabled={!jsonText.trim()}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Parse &amp; Import Profile
            </Button>
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
              No AI processing — maps directly into your profile form
            </p>
          </div>
        )}
      </div>

      {/* ── Error / no-key notices (text + upload) ───────────────────────────── */}
      {profileInputMode !== 'json' && aiError && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
          <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-600 dark:text-red-400 text-sm" style={{ whiteSpace: 'pre-line' }}>{aiError}</p>
        </div>
      )}
      {profileInputMode !== 'json' && !apiKeySet && (
        <div className="flex items-start gap-2.5 p-3.5 bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 border border-[#1B2B4B]/15 dark:border-[#C9A84C]/15 rounded-xl">
          <svg className="h-4 w-4 text-[#C9A84C] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7 5h2v2H7V5Zm0 3h2v3H7V8Z"/>
          </svg>
          <p className="text-sm text-[#1B2B4B] dark:text-zinc-300">
            <strong>PDF &amp; DOCX import without an AI key.</strong>{' '}
            Add a Gemini or Claude key in Settings to unlock scanned PDFs, images, and higher accuracy.
          </p>
        </div>
      )}

      {/* ── CTA + progress (text + upload) ───────────────────────────────────── */}
      {profileInputMode !== 'json' && (
        <div className="space-y-4">
          <Button
            onClick={handleGenerateProfile}
            disabled={isGenerating || (!rawText.trim() && !uploadedFile)}
            className="w-full py-3 text-base"
          >
            {isGenerating ? (
              <><SpinnerIcon /><span className="ml-2">Importing…</span></>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2 text-[#C9A84C]" />
                Import &amp; Build My Profile
              </>
            )}
          </Button>

          {/* ── Progress stepper ─────────────────────────────────────────────── */}
          {importStage && (
            <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 overflow-hidden">
              {/* Track bar */}
              <div className="h-1 bg-zinc-100 dark:bg-neutral-700">
                <div
                  className="h-full bg-[#C9A84C] transition-all duration-500 ease-out"
                  style={{ width: `${importStage.step === 4 ? 100 : (importStage.step - 1) * 33.3}%` }}
                />
              </div>
              <div className="px-4 py-3.5 space-y-2.5">
                {/* Step pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['Extract', 'Parse', 'Structure', 'Verify'] as const).map((label, i) => {
                    const stepNum = (i + 1) as 1|2|3|4;
                    const isDone   = importStage.step > stepNum;
                    const isActive = importStage.step === stepNum;
                    return (
                      <span key={label} className="flex items-center gap-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                          isDone    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' :
                          isActive  ? 'bg-[#1B2B4B] dark:bg-[#C9A84C]/20 text-white dark:text-[#C9A84C] shadow-sm' :
                                      'bg-zinc-100 dark:bg-neutral-700 text-zinc-400 dark:text-zinc-500'
                        }`}>
                          {isDone ? (
                            <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : isActive ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                          ) : null}
                          {label}
                        </span>
                        {i < 3 && <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">›</span>}
                      </span>
                    );
                  })}
                </div>
                {/* Status */}
                <p className={`text-sm font-medium ${importStage.step === 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#1B2B4B] dark:text-zinc-200'}`}>
                  {importStage.label}
                </p>
                {importStage.sub && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{importStage.sub}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'personal':    return renderPersonal();
      case 'summary':     return renderSummary();
      case 'experience':  return renderExperience();
      case 'education':   return renderEducation();
      case 'skills':      return renderSkills();
      case 'projects':    return renderProjects();
      case 'languages':   return renderLanguages();
      case 'references':  return renderReferences();
      case 'order':       return renderOrder();
      case 'additional':  return renderAdditional();
      case 'ai':          return renderAI();
      default:            return null;
    }
  };

  // Counts for badge display
  const itemCounts: Partial<Record<TabKey, number>> = {
    experience: workFields.length,
    education: eduFields.length,
    projects: projFields.length,
    languages: langFields.length,
    references: refFields.length,
    additional: customSections.length,
  };

  return (
    <>
    {cropSrc && (
      <PhotoCropModal
        imageSrc={cropSrc}
        onConfirm={(dataUrl) => { setValue('personalInfo.photo', dataUrl); setCropSrc(null); }}
        onCancel={() => setCropSrc(null)}
      />
    )}
    {quantifyingEntry !== null && (
      <QuantifyPanel
        responsibilities={watch(`workExperience.${quantifyingEntry}.responsibilities`) || ''}
        jobTitle={watch(`workExperience.${quantifyingEntry}.jobTitle`) || ''}
        company={watch(`workExperience.${quantifyingEntry}.company`) || ''}
        onApply={(newText) => setValue(`workExperience.${quantifyingEntry}.responsibilities`, newText)}
        onClose={() => setQuantifyingEntry(null)}
      />
    )}
    <div className="bg-white dark:bg-neutral-800/50 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800 overflow-hidden">

      {/* ── Top header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80">
        <h1 className="text-lg sm:text-xl font-bold">My Profile</h1>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="ghost" size="sm" onClick={handleExportProfile} title="Export profile as JSON">
            <DownloadCloud className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant={activeTab === 'ai' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab(activeTab === 'ai' ? 'personal' : 'ai')}
          >
            <Sparkles className="h-4 w-4 sm:mr-1.5 text-[#C9A84C]" />
            <span className="hidden sm:inline">{activeTab === 'ai' ? 'Back to Form' : 'Import CV'}</span>
            <span className="inline sm:hidden">Import</span>
          </Button>
        </div>
      </div>

      {/* ── Import confidence summary banner ─────────────────────────── */}
      {importConfidence && (() => {
        // Group raw confidence keys into display sections
        const sections: { key: TabKey | 'personal'; label: string; tab: TabKey; score: number }[] = [
          {
            key: 'personal', label: 'Personal Info', tab: 'personal',
            score: Math.round(['personalInfo.name','personalInfo.email','personalInfo.phone','personalInfo.location']
              .reduce((s, k) => s + (importConfidence[k] ?? 0), 0) / 4),
          },
          { key: 'summary' as TabKey, label: 'Summary', tab: 'personal', score: importConfidence['summary'] ?? 0 },
          { key: 'experience', label: 'Experience', tab: 'experience', score: importConfidence['workExperience'] ?? 0 },
          { key: 'education', label: 'Education', tab: 'education', score: importConfidence['education'] ?? 0 },
          { key: 'skills', label: 'Skills', tab: 'personal', score: importConfidence['skills'] ?? 0 },
          { key: 'projects', label: 'Projects', tab: 'projects', score: importConfidence['projects'] ?? 0 },
        ].filter(s => s.score > 0);

        const lowCount = sections.filter(s => s.score < 70).length;
        const allGood  = sections.every(s => s.score >= 85);

        return (
          <div className="border-b border-zinc-200 dark:border-neutral-700 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 flex-shrink-0 text-[#C9A84C]">
                    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7 5h2v2H7V5Zm0 3h2v3H7V8Z" fill="currentColor"/>
                  </svg>
                  Import Review
                  {allGood
                    ? <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-normal">— everything looks great!</span>
                    : lowCount > 0
                      ? <span className="ml-1 text-amber-600 dark:text-amber-400 font-normal">— {lowCount} section{lowCount > 1 ? 's' : ''} to review</span>
                      : <span className="ml-1 text-zinc-500 font-normal">— check highlighted fields</span>
                  }
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sections.map(s => {
                    const hi  = s.score >= 85;
                    const mid = s.score >= 70 && s.score < 85;
                    return (
                      <button
                        key={s.key} type="button"
                        onClick={() => setActiveTab(s.tab)}
                        title={`Confidence: ${s.score}% — click to jump to ${s.label}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${
                          hi  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' :
                          mid ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
                                'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hi ? 'bg-emerald-500' : mid ? 'bg-amber-500' : 'bg-red-500'}`} />
                        {s.label}
                        <span className="opacity-60">{s.score}%</span>
                      </button>
                    );
                  })}
                </div>
                {!allGood && (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                    Click a badge to jump to that section and fill in any missing details.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImportConfidence(null)}
                className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5 rounded transition-colors"
                title="Dismiss"
              >
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        );
      })()}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col sm:flex-row sm:min-h-[600px]">

          {/* ── Mobile tab strip (horizontal scroll, in flow) ─────────── */}
          <div className="sm:hidden border-b border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/60 overflow-x-auto">
            <div className="flex min-w-max px-2 py-1.5 gap-1">
              {TABS.map(tab => {
                const active = activeTab === tab.key;
                const count = itemCounts[tab.key];
                return (
                  <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] dark:text-[#C9A84C] shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span className={active ? 'text-[#C9A84C]' : 'text-zinc-400'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className="ml-0.5 text-[9px] font-bold bg-[#F8F7F4] dark:bg-[#1B2B4B]/30/50 text-[#1B2B4B] dark:text-[#C9A84C]/80 px-1 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" onClick={() => setActiveTab(activeTab === 'ai' ? 'personal' : 'ai')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] dark:text-[#C9A84C] shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#C9A84C]" />
                Import
              </button>
            </div>
          </div>

          {/* ── Left sidebar navigation (sm and up) ──────────────────────── */}
          <nav className="hidden sm:flex flex-col w-52 flex-shrink-0 border-r border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/60 py-3">
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              const done = isComplete[tab.key];
              const count = itemCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-white dark:bg-neutral-700 text-[#1B2B4B] dark:text-[#C9A84C]/80 shadow-sm border-r-2 border-[#1B2B4B]'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-neutral-700/50 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className={active ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-400 dark:text-zinc-500'}>
                    {tab.icon}
                  </span>
                  <span className="flex-1 truncate">{tab.label}</span>
                  {count !== undefined && count > 0 ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/30/50 text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'bg-zinc-200 dark:bg-neutral-600 text-zinc-600 dark:text-zinc-400'}`}>
                      {count}
                    </span>
                  ) : done && tab.key !== 'order' && tab.key !== 'ai' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : null}
                </button>
              );
            })}

            {/* AI tab at bottom of sidebar */}
            <div className="mt-auto pt-3 border-t border-zinc-200 dark:border-neutral-700 mx-3 mb-2">
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'ai' ? 'personal' : 'ai')}
                className={`flex items-center gap-2.5 w-full text-left px-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'ai'
                    ? 'text-[#1B2B4B] dark:text-[#C9A84C]/80'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles className="h-4 w-4 text-[#C9A84C]" />
                Import Profile
              </button>
            </div>
          </nav>

          {/* ── Main content area ─────────────────────────────────────────── */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-w-0">
            {renderActiveTab()}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80">
          <p className="text-xs text-zinc-400 hidden sm:block">
            Changes are saved when you click "Save Profile"
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">Cancel</Button>
            )}
            <Button type="submit" className="flex-1 sm:flex-none">Save Profile</Button>
          </div>
        </div>
      </form>
    </div>
    </>
  );
};

export default ProfileForm;
