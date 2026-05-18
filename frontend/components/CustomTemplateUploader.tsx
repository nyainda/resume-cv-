/**
 * CustomTemplateUploader — modal for analysing a CV template image and saving
 * it to the user's personal template library (localStorage).
 *
 * Flow:
 *   idle → uploading → analyzing → refining → preview → saved
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Image, CheckCircle, AlertCircle, Loader2, Wand2, RotateCcw, Save, Eye } from './icons';
import { CVData, PersonalInfo, CustomTemplateEntry } from '../types';
import { analyzeAndGenerateTemplate, TemplateSpec, getDefaultSpec } from '../services/templateAnalyzerService';
import { getGeminiKey, getClaudeKey } from '../services/security/RuntimeKeys';
import { getSelectedProvider } from '../services/groqService';
import { isCVEngineConfigured } from '../services/cvEngineClient';
import { loadCustomTemplates, saveCustomTemplate } from '../utils/customTemplateStorage';
import TemplateCustomGenerated from './templates/TemplateCustomGenerated';

type Step = 'idle' | 'analyzing' | 'refining' | 'preview' | 'saved' | 'error';

interface Props {
  onClose: () => void;
  onSaved: (template: CustomTemplateEntry) => void;
  cvData?: CVData;
  personalInfo?: PersonalInfo;
}

const PLACEHOLDER_CV: CVData = {
  summary: 'Experienced professional with a track record of delivering impactful results in fast-paced environments.',
  skills: ['Leadership', 'Project Management', 'Strategic Planning', 'Data Analysis', 'Communication'],
  experience: [{
    company: 'Acme Corporation', jobTitle: 'Senior Manager', dates: 'Jan 2020 – Present',
    startDate: 'Jan 2020', endDate: 'Present',
    responsibilities: ['Led cross-functional teams of 12+ members', 'Increased revenue by 32% through strategic initiatives', 'Delivered 15 major projects on time and under budget'],
  }],
  education: [{ degree: 'MBA', school: 'University of Example', year: '2018' }],
  projects: [{ name: 'Digital Transformation', description: 'Enterprise-wide digital overhaul reducing costs by 25%', link: '' }],
  languages: [{ name: 'English', proficiency: 'Native' }],
};

const PLACEHOLDER_INFO: PersonalInfo = {
  name: 'Alex Johnson', email: 'alex@example.com', phone: '+1 555 0100',
  location: 'New York, NY', linkedin: 'linkedin.com/in/alexjohnson',
  website: '', github: '',
};

export default function CustomTemplateUploader({ onClose, onSaved, cvData, personalInfo }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [spec, setSpec] = useState<TemplateSpec | null>(null);
  const [templateName, setTemplateName] = useState('My Custom Template');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingCount = loadCustomTemplates().length;

  const selectedProvider = getSelectedProvider();
  const hasProviderKey = selectedProvider === 'workers-ai'
    ? isCVEngineConfigured()
    : selectedProvider === 'claude'
      ? !!getClaudeKey()
      : !!getGeminiKey();

  const providerLabel = selectedProvider === 'claude' ? 'Claude' : selectedProvider === 'gemini' ? 'Gemini' : 'Workers AI';
  const keySetupHint = selectedProvider === 'claude'
    ? 'Add your Anthropic key in Settings → AI Keys → Claude.'
    : selectedProvider === 'gemini'
      ? 'Add your Google key in Settings → AI Keys → Gemini.'
      : 'Set your CV Engine Worker URL in Settings.';

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (PNG, JPG, WEBP, etc.)');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('Image is too large. Please use a file under 20MB.');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setStep('idle');
    setSpec(null);
    setErrorMsg('');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const runAnalysis = useCallback(async () => {
    if (!imageFile) return;
    setStep('analyzing');
    setErrorMsg('');

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = e => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const result = await analyzeAndGenerateTemplate(
        base64,
        imageFile.type,
        templateName,
        (phase) => {
          if (phase === 'analyzing') setProgressLabel('Analysing layout, colours & structure…');
          if (phase === 'refining') { setStep('refining'); setProgressLabel('Refining specification…'); }
          if (phase === 'done') setProgressLabel('Done!');
        }
      );

      setSpec(result.spec);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStep('error');
    }
  }, [imageFile, templateName]);

  const handleSave = useCallback(() => {
    if (!spec) return;
    const entry: CustomTemplateEntry = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: templateName,
      spec,
      createdAt: new Date().toISOString(),
      thumbnail: imagePreview ?? undefined,
    };
    saveCustomTemplate(entry);
    setStep('saved');
    onSaved(entry);
  }, [spec, templateName, imagePreview, onSaved]);

  // Color swatch preview from spec
  const ColorPalette = spec ? (
    <div className="flex gap-1.5 flex-wrap">
      {Object.entries(spec.colorScheme)
        .filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
        .slice(0, 6)
        .map(([key, val]) => (
          <div key={key} className="group relative">
            <div className="w-5 h-5 rounded-full border border-zinc-200 shadow-sm" style={{ backgroundColor: val as string }} />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              {key}: {val}
            </div>
          </div>
        ))}
    </div>
  ) : null;

  const previewData = cvData && cvData.experience?.length ? cvData : PLACEHOLDER_CV;
  const previewInfo = personalInfo?.name ? personalInfo : PLACEHOLDER_INFO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[#C9A84C]" />
              Custom Template Analyzer
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Upload any CV screenshot — AI will clone the design for you
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className={`grid ${step === 'preview' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-0 h-full`}>

            {/* Left panel — upload + analysis */}
            <div className="p-6 space-y-5 border-r border-zinc-100 dark:border-neutral-800">

              {/* API key warning */}
              {!hasProviderKey && (
                <div className="flex gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>{providerLabel} not configured.</strong> {keySetupHint}
                  </div>
                </div>
              )}

              {/* Template name */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Blue Sidebar Pro"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]"
                />
              </div>

              {/* Drop zone */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">Template Screenshot</label>
                <div
                  onDrop={onDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150 overflow-hidden
                    ${dragOver ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-zinc-300 dark:border-neutral-600 hover:border-[#C9A84C]/60 hover:bg-zinc-50 dark:hover:bg-neutral-800/50'}
                  `}
                  style={{ minHeight: imagePreview ? 0 : 160 }}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={onFileChange} />
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="Template preview" className="w-full object-contain max-h-64" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">Click to change image</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-neutral-800 flex items-center justify-center">
                        <Image className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Drop a CV screenshot here</p>
                        <p className="text-xs text-zinc-400 mt-0.5">PNG, JPG, WEBP · max 20MB</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1B2B4B] text-white text-xs font-semibold rounded-lg hover:bg-[#243860] transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Browse Files
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Analyse button */}
              {imageFile && step !== 'saved' && (
                <button
                  onClick={runAnalysis}
                  disabled={!hasProviderKey || step === 'analyzing' || step === 'refining'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#C9A84C', color: '#1B2B4B' }}
                >
                  {(step === 'analyzing' || step === 'refining') ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{progressLabel || 'Analysing…'}</>
                  ) : (
                    <><Wand2 className="h-4 w-4" />{spec ? 'Re-Analyse' : 'Analyse Template'}</>
                  )}
                </button>
              )}

              {/* Error */}
              {step === 'error' && errorMsg && (
                <div className="flex gap-3 p-3.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-800 dark:text-rose-200 space-y-1">
                    <p className="font-semibold">Analysis failed</p>
                    <p>{errorMsg}</p>
                    <button onClick={() => setStep('idle')} className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-medium mt-1">
                      <RotateCcw className="h-3 w-3" /> Try again
                    </button>
                  </div>
                </div>
              )}

              {/* Spec summary card */}
              {spec && (step === 'preview' || step === 'saved') && (
                <div className="rounded-xl border border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">What We Detected</p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-zinc-400">Layout</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{spec.layout.columns.replace('-', ' ')}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400">Style</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{spec.overallStyle.replace(/-/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400">Density</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{spec.layout.contentDensity}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400">Skills</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{spec.skillsStyle}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-zinc-400">Section Order</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {spec.sectionOrder.map((sec, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-full text-[10px] font-medium text-zinc-700 dark:text-zinc-300 capitalize">{sec}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-zinc-400">Colour Palette</span>
                    <div className="mt-1">{ColorPalette}</div>
                  </div>
                </div>
              )}

              {/* Save button */}
              {spec && step === 'preview' && (
                <button
                  onClick={handleSave}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all text-white"
                  style={{ backgroundColor: '#1B2B4B' }}
                >
                  <Save className="h-4 w-4" />
                  Save to My Templates
                </button>
              )}

              {/* Saved confirmation */}
              {step === 'saved' && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-800 dark:text-zinc-100">Template Saved!</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Find <strong>"{templateName}"</strong> in the <em>My Templates</em> tab of the gallery.
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">You now have {existingCount + 1} custom template{existingCount + 1 !== 1 ? 's' : ''}.</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: '#C9A84C' }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>

            {/* Right panel — live preview */}
            {spec && step === 'preview' && (
              <div className="p-6 bg-zinc-100 dark:bg-neutral-950 overflow-y-auto">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="h-4 w-4 text-zinc-500" />
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Live Preview — rendered with your CV data</p>
                </div>
                <div className="rounded-xl overflow-hidden shadow-xl border border-zinc-200 dark:border-neutral-700" style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '794px', marginBottom: `-${794 * 0.4}px` }}>
                  <TemplateCustomGenerated cvData={previewData} personalInfo={previewInfo} spec={spec} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
