import React, { useState, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
  UserProfile, Reference,
  CustomSection, CustomSectionItem, CustomSectionType,
  ProfileSectionKey, DEFAULT_SECTION_ORDER,
} from '../types';
import {
  generateProfile,
  generateProfileFromFileWithGemini,
  generateProfileFromTextWithGemini,
  generateEnhancedSummary,
  generateEnhancedResponsibilities,
  generateEnhancedProjectDescription,
} from '../services/geminiService';
import QuantifyPanel from './QuantifyPanel';
import WordImportPanel from './WordImportPanel';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import {
  Plus, Trash, Sparkles, UploadCloud, DownloadCloud, User,
  Briefcase, BookOpen, List, Globe, FileText, CheckCircle,
} from './icons';

// ─── Constants ────────────────────────────────────────────────────────────────
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
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
const EntryCard: React.FC<{ index: number; onDelete: () => void; children: React.ReactNode; label?: string }> = ({ index, onDelete, children, label }) => (
  <div className="relative group border border-zinc-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800/60 overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-neutral-800 border-b border-zinc-100 dark:border-neutral-700">
      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 tabular-nums">#{index + 1}</span>
      {label && <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{label}</span>}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onDelete}
        className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        title="Remove"
      >
        <Trash className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className="p-4">
      {children}
    </div>
  </div>
);

// Empty state placeholder
const EmptyState: React.FC<{ message: string; action?: React.ReactNode }> = ({ message, action }) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 border-2 border-dashed border-zinc-200 dark:border-neutral-700 rounded-xl text-center">
    <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-3">{message}</p>
    {action}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const ProfileForm: React.FC<ProfileFormProps> = ({ existingProfile, onSave, onCancel, apiKeySet, openSettings, onProfileImported }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [showWordImport, setShowWordImport] = useState(false);
  const [profileInputMode, setProfileInputMode] = useState<'text' | 'upload'>('text');
  const [rawText, setRawText] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<string | null>(null);
  const [quantifyingEntry, setQuantifyingEntry] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [customSections, setCustomSections] = useState<CustomSection[]>(existingProfile?.customSections || []);
  const [sectionOrder, setSectionOrder] = useState<ProfileSectionKey[]>(
    existingProfile?.sectionOrder || [...DEFAULT_SECTION_ORDER]
  );
  const [newSectionType, setNewSectionType] = useState<CustomSectionType>('awards');
  const [customLabelInput, setCustomLabelInput] = useState('');

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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setRawText(''); setAiError(null); }
  };

  const handleGenerateProfile = async () => {
    if (!apiKeySet) { setAiError('Please set your API key in settings.'); openSettings(); return; }
    if (!rawText.trim() && !uploadedFile && !githubUrl.trim()) {
      setAiError('Please paste your resume text, upload a file, or enter a GitHub URL to continue.'); return;
    }
    setIsGenerating(true); setAiError(null);
    try {
      let profile;

      if (uploadedFile) {
        // File path: use Gemini end-to-end (read + structure in one call — no Groq needed)
        const { base64, mimeType } = await fileToBase64(uploadedFile);
        profile = await generateProfileFromFileWithGemini(base64, mimeType, githubUrl || undefined);
      } else {
        // Text / GitHub path: try Groq first, fall back to Gemini if Groq is unavailable
        try {
          profile = await generateProfile(rawText, githubUrl || undefined);
        } catch (groqErr) {
          const groqMsg = groqErr instanceof Error ? groqErr.message : '';
          const isGroqUnavailable =
            groqMsg.toLowerCase().includes('groq') ||
            groqMsg.toLowerCase().includes('rate limit') ||
            groqMsg.toLowerCase().includes('daily') ||
            groqMsg.toLowerCase().includes('quota') ||
            groqMsg.toLowerCase().includes('overload') ||
            groqMsg.toLowerCase().includes('api key');
          if (isGroqUnavailable) {
            // Silently fall back to Gemini
            profile = await generateProfileFromTextWithGemini(rawText, githubUrl || undefined);
          } else {
            throw groqErr;
          }
        }
      }

      reset(profile);
      setActiveTab('personal');
      alert('Profile imported successfully! Please review your details and save.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setAiError(msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('key not set')
        ? 'Your API key appears to be invalid or missing. Please check your settings.'
        : `Import failed: ${msg}`
      );
    } finally {
      setIsGenerating(false);
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

  const handleImportProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (imported.personalInfo && imported.summary) {
          reset(imported);
          alert('Profile imported! Please review and save.');
        } else throw new Error('Invalid profile format.');
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
            <input id="photo-upload" type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { alert('Max 2MB'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const img = new Image();
                  img.onload = () => {
                    const MAX = 400;
                    let { width, height } = img;
                    if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
                    else { if (height > MAX) { width *= MAX / height; height = MAX; } }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
                    setValue('personalInfo.photo', canvas.toDataURL('image/jpeg', 0.7));
                  };
                  img.src = ev.target?.result as string;
                };
                reader.readAsDataURL(file);
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
          <Input id="location" {...register('personalInfo.location')} placeholder="City, Country" />
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
      </div>
    </div>
  );

  const renderSummary = () => (
    <div className="space-y-4">
      <SectionTitle
        subtitle="A 2–4 sentence snapshot of your career, skills, and value proposition."
        action={
          <EnhanceBtn
            loading={isEnhancing === 'summary'}
            disabled={!apiKeySet || !!isEnhancing}
            onClick={() => handleEnhance('summary')}
          />
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

  const renderExperience = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="List your work history starting with the most recent position.">
        Work Experience
      </SectionTitle>
      <div className="space-y-4">
        {workFields.map((item, index) => (
          <EntryCard
            key={item.id}
            index={index}
            label={watch(`workExperience.${index}.jobTitle`) || watch(`workExperience.${index}.company`) || 'New Entry'}
            onDelete={() => removeWork(index)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Job Title <span className="text-red-400">*</span></Label>
                  <Input placeholder="e.g. Senior Software Engineer" {...register(`workExperience.${index}.jobTitle`, { required: true })} />
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
                  {[3, 4, 5, 6, 8].map(count => {
                    const current = (watch(`workExperience.${index}.pointCount`) as number) ?? 5;
                    const selected = current === count;
                    return (
                      <button key={count} type="button"
                        onClick={() => setValue(`workExperience.${index}.pointCount`, count)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${selected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white dark:bg-neutral-700 border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600'
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
                  <Label className="text-xs">Responsibilities & Achievements</Label>
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
        ))}
        {workFields.length === 0 && (
          <EmptyState message="No work experience added yet." />
        )}
      </div>
      <Button type="button" variant="secondary" size="sm"
        onClick={() => appendWork({ id: `${Date.now()}`, company: '', jobTitle: '', startDate: '', endDate: '', responsibilities: '', pointCount: 5 })}>
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
            label={watch(`education.${index}.degree`) || watch(`education.${index}.school`) || 'New Entry'}
            onDelete={() => removeEdu(index)}
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
        onClick={() => appendEdu({ id: `${Date.now()}`, degree: '', school: '', graduationYear: '' })}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Education
      </Button>
    </div>
  );

  const renderSkills = () => (
    <div className="space-y-4">
      <SectionTitle subtitle="Comma-separated list of your technical and soft skills.">
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
            label={watch(`projects.${index}.name`) || 'New Project'}
            onDelete={() => removeProj(index)}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Project Name</Label>
                <Input placeholder="e.g. AI-Powered CV Builder" {...register(`projects.${index}.name`)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Description</Label>
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
        onClick={() => appendProj({ id: `${Date.now()}`, name: '', description: '', link: '' })}>
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
            label={watch(`languages.${index}.name`) || 'New Language'}
            onDelete={() => removeLang(index)}
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
        onClick={() => appendLang({ id: `${Date.now()}`, name: '', proficiency: '' })}>
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
            label={watch(`references.${index}.name`) || 'New Reference'}
            onDelete={() => removeRef(index)}
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
                onClick={() => appendRef({ id: `${Date.now()}`, name: '', title: '', company: '', relationship: '', email: '', phone: '' })}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Reference
              </Button>
            }
          />
        )}
        {refFields.length > 0 && (
          <Button type="button" variant="secondary" size="sm"
            onClick={() => appendRef({ id: `${Date.now()}`, name: '', title: '', company: '', relationship: '', email: '', phone: '' })}>
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
              <div key={cs.id} className="flex items-center gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <span className="text-xs font-bold text-indigo-400 w-5 text-center">{sectionOrder.length + idx + 1}</span>
                <span className="flex-1 text-sm font-medium text-indigo-800 dark:text-indigo-200">{cs.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded font-medium">custom</span>
                <div className="flex gap-0.5">
                  <button type="button" onClick={() => handleMoveSectionUp(cs.id)} disabled={idx === 0}
                    className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => handleMoveSectionDown(cs.id)} disabled={idx === customSections.length - 1}
                    className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-20 transition-colors">
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
              className="w-full h-9 px-3 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            <div key={section.id} className="border-2 border-indigo-100 dark:border-indigo-800/50 rounded-xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/50">
                <span className="text-xs font-bold text-indigo-400">{sIdx + 1}</span>
                <Input
                  value={section.label}
                  onChange={e => handleUpdateSectionLabel(section.id, e.target.value)}
                  className="flex-1 !h-7 !py-0 !text-sm font-semibold border-0 bg-transparent focus:ring-1"
                  placeholder="Section name"
                />
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => handleMoveSectionUp(section.id)} disabled={sIdx === 0}
                    className="p-1 rounded text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-20 transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => handleMoveSectionDown(section.id)} disabled={sIdx === customSections.length - 1}
                    className="p-1 rounded text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-20 transition-colors">
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
      <SectionTitle subtitle="Already have a CV or resume? Import it and Gemini AI will instantly read and structure your full profile — no manual typing needed.">
        Import Your Existing Profile
      </SectionTitle>

      <div className="border-b border-zinc-200 dark:border-neutral-700">
        <nav className="-mb-px flex gap-6">
          {(['text', 'upload'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => setProfileInputMode(mode)}
              className={`py-2.5 px-1 border-b-2 text-sm font-medium transition-colors ${profileInputMode === mode
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300'}`}>
              {mode === 'text' ? 'Paste Resume Text' : 'Upload CV / Resume'}
            </button>
          ))}
        </nav>
      </div>

      {profileInputMode === 'text' ? (
        <Textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setUploadedFile(null); }}
          placeholder="Paste the full text of your resume or CV here. Include your work history, education, skills, and anything else you'd like in your profile..."
          rows={10}
          disabled={isGenerating || !apiKeySet}
        />
      ) : (
        <label htmlFor="profile-upload"
          className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-zinc-300 dark:border-neutral-600 rounded-xl bg-zinc-50 dark:bg-neutral-800 ${!apiKeySet ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors'}`}>
          {uploadedFile ? (
            <p className="font-semibold text-indigo-600 px-2">{uploadedFile.name}</p>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-zinc-400 mb-2" />
              <p className="text-sm text-zinc-500"><span className="font-semibold">Click to upload</span> or drag & drop your CV</p>
              <p className="text-xs text-zinc-400 mt-1">PDF, PNG, JPG, WEBP — Gemini will read and extract your details</p>
            </>
          )}
          <input id="profile-upload" type="file" className="hidden"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={handleFileChange} disabled={!apiKeySet} />
        </label>
      )}

      <div>
        <Label className="mb-1 block">GitHub Profile URL <span className="text-zinc-400 font-normal">(Optional)</span></Label>
        <Input value={githubUrl} onChange={e => setGithubUrl(e.target.value)}
          placeholder="https://github.com/username" disabled={isGenerating || !apiKeySet} />
        <p className="text-xs text-zinc-400 mt-1">Your public repositories and projects will be pulled in to enrich your profile automatically.</p>
      </div>

      {aiError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{aiError}</p>
        </div>
      )}
      {!apiKeySet && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-amber-700 dark:text-amber-400 text-sm">A Gemini API key is required to use this feature. Please add it in Settings to get started.</p>
        </div>
      )}

      <Button onClick={handleGenerateProfile} disabled={isGenerating || !apiKeySet} className="w-full sm:w-auto">
        {isGenerating ? <><SpinnerIcon /><span className="ml-2">Importing Profile...</span></> : <>Import &amp; Build My Profile</>}
      </Button>
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
          <input type="file" accept=".json" ref={importInputRef} onChange={handleImportProfile} className="hidden" />
          <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()} title="Import profile">
            <UploadCloud className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportProfile} title="Export profile">
            <DownloadCloud className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          {onProfileImported && (
            <Button
              variant={showWordImport ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowWordImport(v => !v)}
              title="Import profile from a Word (.docx) or PDF CV"
            >
              <FileText className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{showWordImport ? 'Close Import' : 'Import from Word'}</span>
              <span className="inline sm:hidden">Word</span>
            </Button>
          )}
          <Button
            variant={activeTab === 'ai' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab(activeTab === 'ai' ? 'personal' : 'ai')}
            title={!apiKeySet ? 'Please set your API key in settings' : ''}
          >
            <Sparkles className="h-4 w-4 sm:mr-1.5 text-indigo-500" />
            <span className="hidden sm:inline">{activeTab === 'ai' ? 'Back to Form' : 'Import CV'}</span>
          </Button>
        </div>
      </div>

      {/* ── Word / PDF Import panel ────────────────────────────────────── */}
      {showWordImport && onProfileImported && (
        <div className="border-b border-zinc-200 dark:border-neutral-700 bg-indigo-50/60 dark:bg-indigo-900/10 p-4">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Import your existing CV from a Word (.docx) or PDF file — fields are auto-filled from your document
          </p>
          <WordImportPanel
            apiKeySet={apiKeySet}
            openSettings={openSettings}
            onProfileImported={(profile) => {
              onProfileImported(profile);
              setShowWordImport(false);
            }}
          />
        </div>
      )}

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
                        ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span className={active ? 'text-indigo-500' : 'text-zinc-400'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className="ml-0.5 text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 px-1 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" onClick={() => setActiveTab(activeTab === 'ai' ? 'personal' : 'ai')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
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
                      ? 'bg-white dark:bg-neutral-700 text-indigo-700 dark:text-indigo-300 shadow-sm border-r-2 border-indigo-500'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-neutral-700/50 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}>
                    {tab.icon}
                  </span>
                  <span className="flex-1 truncate">{tab.label}</span>
                  {count !== undefined && count > 0 ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-zinc-200 dark:bg-neutral-600 text-zinc-600 dark:text-zinc-400'}`}>
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
                    ? 'text-indigo-700 dark:text-indigo-300'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles className="h-4 w-4 text-indigo-400" />
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
