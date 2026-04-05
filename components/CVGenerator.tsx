
import React, { useState, useCallback, ChangeEvent, useMemo, useRef } from 'react';
import { UserProfile, CVData, TemplateName, FontName, fontDisplayNames, JobAnalysisResult, CVGenerationMode, cvGenerationModes, ScholarshipFormat, scholarshipFormats, SavedCV } from '../types';
import { generateCV, generateCoverLetter, extractProfileTextFromFile, scoreCV, CVScore } from '../services/geminiService';
import { downloadCVAsPDF } from '../services/pdfService';
import PDFDownloadButton from './PDFDownloadButton';
import { REACT_PDF_TEMPLATES } from '../services/reactPdfTemplates';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CVPreview from './CVPreview';
import CoverLetterPreview from './CoverLetterPreview';
import TemplateGallery from './TemplateGallery';
import JobAnalysis from './JobAnalysis';
import ShareCVModal from './ShareCVModal';
import AIImprovementPanel from './AIImprovementPanel';
import GitHubSyncModal from './GitHubSyncModal';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Save, Download, RefreshCw, Edit, FileText, Sparkles, UploadCloud, CheckCircle, AlertTriangle, BookOpen, Briefcase, Globe } from './icons';

const ShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

interface CVGeneratorProps {
  userProfile: UserProfile;
  currentCV: CVData | null;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  onSaveCV: (cvData: CVData, purpose: 'job' | 'academic' | 'general') => void;
  onAutoTrack: (details: { roleTitle: string, company: string, savedCvName: string }) => void;
  apiKeySet: boolean;
  openSettings: () => void;
  savedCVs?: SavedCV[];
  /** Called when user clicks "Apply via Email" — passes the JD + generated CV */
  onApplyViaEmail?: (jd: string, cv: CVData) => void;
  /** Optional suggestions from the CV Toolkit Checker — shown as a dismissible banner */
  toolkitSuggestions?: string | null;
  /** Called when user dismisses the toolkit suggestions banner */
  onDismissToolkitSuggestions?: () => void;
}

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });
};

// A color map for the three modes
const modeColorMap: Record<CVGenerationMode, {
  ring: string; bg: string; text: string; badge: string; badgeBg: string; glow: string;
}> = {
  honest: {
    ring: 'ring-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'text-emerald-800 dark:text-emerald-200',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    glow: 'shadow-emerald-500/20',
  },
  boosted: {
    ring: 'ring-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'text-blue-800 dark:text-blue-200',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
    glow: 'shadow-blue-500/20',
  },
  aggressive: {
    ring: 'ring-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-300',
    badge: 'text-orange-800 dark:text-orange-200',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/40',
    glow: 'shadow-orange-500/20',
  },
};

type CVPurpose = 'job' | 'academic' | 'general';

const purposeConfig: Record<CVPurpose, { label: string; icon: React.FC<any>; color: string; description: string }> = {
  job: {
    label: 'Job Application',
    icon: Briefcase,
    color: 'indigo',
    description: 'Tailored to a specific job description with ATS optimization.',
  },
  general: {
    label: 'General Purpose',
    icon: Globe,
    color: 'violet',
    description: 'A strong all-purpose CV — no job description needed.',
  },
  academic: {
    label: 'Grant / Scholarship',
    icon: BookOpen,
    color: 'teal',
    description: 'Academic CV for scholarships, fellowships, and research grants.',
  },
};

const CVGenerator: React.FC<CVGeneratorProps> = ({ userProfile, currentCV, setCurrentCV, onSaveCV, onAutoTrack, apiKeySet, openSettings, onApplyViaEmail, savedCVs = [], toolkitSuggestions, onDismissToolkitSuggestions }) => {
  const [jobDescription, setJobDescription] = useLocalStorage<string>('jobDescription', '');
  const [targetCompany, setTargetCompany] = useState('');
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Generating...');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useLocalStorage<TemplateName>('template', 'professional');
  const [font, setFont] = useLocalStorage<FontName>('cvFont', 'lora');
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [generationMode, setGenerationMode] = useLocalStorage<CVGenerationMode>('generationMode', 'honest');
  const [cvPurpose, setCvPurpose] = useState<CVPurpose>('job');
  const [scholarshipFormat, setScholarshipFormat] = useLocalStorage<ScholarshipFormat>('scholarshipFormat', 'standard');
  const [atsDataEmbedded, setAtsDataEmbedded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [cvScore, setCvScore] = useState<CVScore | null>(null);
  const [isScoringCV, setIsScoringCV] = useState(false);

  const [coverLetter, setCoverLetter] = useLocalStorage<string | null>('coverLetter', null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);

  const [showShareModal, setShowShareModal] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  // JD is required only for job mode
  const jdRequired = cvPurpose === 'job';
  const jdOptional = cvPurpose === 'academic'; // optional for scholarship, not needed for general

  const handleGenerateCV = useCallback(async () => {
    if (!apiKeySet) {
      setError("Please set your Gemini API key in the settings to use this feature.");
      openSettings();
      return;
    }
    if (jdRequired && !jobDescription.trim()) {
      setError(`Please paste a job description to generate a job-targeted CV.`);
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Analyzing description...');
    setError(null);
    setIsEditing(false);
    setCoverLetter(null);
    setAtsDataEmbedded(false);
    try {
      setLoadingMessage('Generating your tailored CV...');
      const generatedData = await generateCV(userProfile, jobDescription, generationMode, cvPurpose, scholarshipFormat);
      if (userProfile.references && userProfile.references.length > 0) {
        generatedData.references = userProfile.references.map(ref => ({
          name: ref.name,
          title: ref.title,
          company: ref.company,
          email: ref.email,
          phone: ref.phone,
          relationship: ref.relationship,
        }));
      }
      setCurrentCV(generatedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      let displayError = `Failed to generate CV: ${errorMessage}`;
      if (errorMessage.toLowerCase().includes('api key')) {
        displayError = "Failed to generate CV. Your API Key seems to be invalid. Please check it in the settings.";
      }
      setError(displayError);
    } finally {
      setIsLoading(false);
      setLoadingMessage('Generating...');
    }
  }, [jobDescription, userProfile, setCurrentCV, generationMode, setCoverLetter, apiKeySet, openSettings, cvPurpose, scholarshipFormat, jdRequired]);

  const handleGenerateCoverLetter = useCallback(async () => {
    if (!apiKeySet) {
      setCoverLetterError("Please set your Gemini API key in the settings to use this feature.");
      openSettings();
      return;
    }
    if (!jobDescription.trim()) {
      setCoverLetterError("Please provide a job or grant description to generate a cover letter.");
      return;
    }
    setIsGeneratingCoverLetter(true);
    setCoverLetterError(null);
    try {
      const letter = await generateCoverLetter(userProfile, jobDescription);
      setCoverLetter(letter);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      let displayError = `Failed to generate cover letter: ${errorMessage}`;
      if (errorMessage.toLowerCase().includes('api key')) {
        displayError = "Failed to generate cover letter. Your API Key seems to be invalid. Please check it in the settings.";
      }
      setCoverLetterError(displayError);
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  }, [jobDescription, userProfile, setCoverLetter, apiKeySet, openSettings]);

  const handleFileUploads = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!apiKeySet) {
      setError("Please set your Gemini API key in the settings to upload files.");
      openSettings();
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setError(null);
    const extractedTexts: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setLoadingMessage(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
        const { base64, mimeType } = await fileToBase64(file);
        const extractedText = await extractProfileTextFromFile(base64, mimeType);
        extractedTexts.push(extractedText);
      }
      setJobDescription(prev => `${prev}\n\n${extractedTexts.join('\n\n---\n\n')}`.trim());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to process files: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('Generating...');
      if (event.target) event.target.value = '';
    }
  };

  const handleScoreCV = useCallback(async () => {
    if (!currentCV || !jobDescription.trim() || !apiKeySet) return;
    setIsScoringCV(true);
    try {
      const score = await scoreCV(currentCV, jobDescription);
      setCvScore(score);
    } catch {
      // silently fail — score card just won't appear
    } finally {
      setIsScoringCV(false);
    }
  }, [currentCV, jobDescription, apiKeySet]);

  const pdfFileName = useMemo(() => {
    const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    const name = sanitize(userProfile.personalInfo.name).substring(0, 20);
    const companyPart = targetCompany ? `_${sanitize(targetCompany).substring(0, 20)}` : '';
    return `${name}${companyPart}_CV.pdf`;
  }, [userProfile.personalInfo.name, targetCompany]);

  const handleDownload = useCallback(() => {
    if (!currentCV) return;
    const jobTitle = targetJobTitle || currentCV.experience[0]?.jobTitle || 'New Role';
    const companyName = targetCompany || 'Unknown';

    const wasEmbedded = downloadCVAsPDF({
      cvData: currentCV,
      personalInfo: userProfile.personalInfo,
      template,
      font,
      fileName: pdfFileName,
      jobDescription,
    });
    setAtsDataEmbedded(wasEmbedded);

    onAutoTrack({
      roleTitle: jobTitle,
      company: companyName,
      savedCvName: `Auto-Generated CV (${new Date().toLocaleDateString()})`
    });
  }, [currentCV, userProfile, targetCompany, targetJobTitle, template, font, jobDescription, onAutoTrack, pdfFileName]);

  const cvTextContent = useMemo(() => {
    if (!currentCV) return "";
    let text = currentCV.summary;
    text += currentCV.skills.join(' ');
    currentCV.experience.forEach(exp => {
      text += ` ${exp.jobTitle} ${exp.company} ${exp.responsibilities.join(' ')}`;
    });
    return text.toLowerCase();
  }, [currentCV]);

  const handleJobAnalysisComplete = useCallback((result: JobAnalysisResult) => {
    if (result.companyName) {
      setTargetCompany(result.companyName);
    }
    if (result.jobTitle) {
      setTargetJobTitle(result.jobTitle);
    }
  }, []);

  const selectedMode = cvGenerationModes.find(m => m.id === generationMode)!;
  const modeColors = modeColorMap[generationMode];
  const selectedScholarshipFormat = scholarshipFormats.find(f => f.id === scholarshipFormat)!;

  // Resolve purpose label for preview badge
  const purposeLabel = cvPurpose === 'job'
    ? `Job CV · ${selectedMode.emoji} ${selectedMode.label}`
    : cvPurpose === 'general'
      ? '🌐 General Purpose CV'
      : `🎓 ${selectedScholarshipFormat.flag} ${selectedScholarshipFormat.label}`;
  const purposeBadgeBg = cvPurpose === 'job' ? modeColors.badgeBg : cvPurpose === 'general' ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-teal-100 dark:bg-teal-900/40';
  const purposeBadgeText = cvPurpose === 'job' ? modeColors.badge : cvPurpose === 'general' ? 'text-violet-800 dark:text-violet-200' : 'text-teal-800 dark:text-teal-200';

  return (
    <div className="space-y-8">
      {/* ── CV Toolkit Suggestions Banner ── */}
      {toolkitSuggestions && (
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-300 dark:border-violet-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-bold text-violet-900 dark:text-violet-100">CV Toolkit Feedback — Ready to Apply</span>
            </div>
            <p className="text-xs text-violet-700 dark:text-violet-300 whitespace-pre-line leading-relaxed">
              {toolkitSuggestions}
            </p>
            <button
              onClick={() => {
                const appended = jobDescription.trim()
                  ? `${jobDescription}\n\n${toolkitSuggestions}`
                  : toolkitSuggestions;
                setJobDescription(appended);
                onDismissToolkitSuggestions?.();
              }}
              className="mt-3 text-xs font-bold px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              ✓ Apply to Job Description &amp; Generate
            </button>
          </div>
          <button
            onClick={onDismissToolkitSuggestions}
            className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 text-xl leading-none p-1 flex-shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* === STEP 1: Purpose Selector === */}
      <div className="bg-white dark:bg-neutral-800/50 p-6 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
        <div className="space-y-2 mb-6">
          <Label className="text-2xl font-bold">CV Customization</Label>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose what type of CV you need, then configure below.</p>
        </div>

        {/* Purpose selector cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {(Object.entries(purposeConfig) as [CVPurpose, typeof purposeConfig[CVPurpose]][]).map(([key, cfg]) => {
            const isSelected = cvPurpose === key;
            const colorCls = {
              indigo: { ring: 'ring-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-700' },
              violet: { ring: 'ring-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-700' },
              teal: { ring: 'ring-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700' },
            }[cfg.color];
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                onClick={() => setCvPurpose(key)}
                className={`
                  text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                  ${isSelected
                    ? `${colorCls.ring} ${colorCls.bg} ${colorCls.border} ring-2 shadow-md`
                    : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/40'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-5 w-5 ${isSelected ? colorCls.text : 'text-zinc-500'}`} />
                  <span className={`text-sm font-bold ${isSelected ? colorCls.text : 'text-zinc-800 dark:text-zinc-200'}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{cfg.description}</p>
              </button>
            );
          })}
        </div>

        {/* === SCHOLARSHIP FORMAT SELECTOR (Academic mode only) === */}
        {cvPurpose === 'academic' && (
          <div className="mb-6 p-5 rounded-xl bg-teal-50/70 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800">
            <div className="mb-3">
              <Label className="text-base font-semibold text-teal-800 dark:text-teal-200 block">Application Format</Label>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                Select the scholarship/grant format so the CV follows the expected structure for that programme.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {scholarshipFormats.map((fmt) => {
                const isSelected = scholarshipFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setScholarshipFormat(fmt.id)}
                    className={`
                      text-left p-3 rounded-lg border-2 transition-all duration-150
                      ${isSelected
                        ? 'border-teal-500 bg-white dark:bg-neutral-800 shadow-sm ring-1 ring-teal-400'
                        : 'border-zinc-200 dark:border-neutral-700 hover:border-teal-300 dark:hover:border-teal-700 bg-white dark:bg-neutral-800/40'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{fmt.flag}</span>
                      <span className={`text-xs font-bold ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-700 dark:text-zinc-300'}`}>{fmt.label}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">{fmt.description}</p>
                    {isSelected && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {fmt.keyFields.map(field => (
                          <span key={field} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium">{field}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* === JD / Grant Description Input === */}
        {cvPurpose !== 'general' && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <Label className="text-xl font-semibold">
                {cvPurpose === 'job' ? 'Job Description' : 'Grant / Scholarship Description'}
              </Label>
              {jdOptional && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">Optional — leave blank for a general academic CV</span>
              )}
            </div>

            <div className="mt-2 border-b border-zinc-200 dark:border-neutral-700">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => setInputMode('text')} className={`${inputMode === 'text' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                  Paste Text
                </button>
                <button onClick={() => setInputMode('upload')} className={`${inputMode === 'upload' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                  Upload Files
                </button>
              </nav>
            </div>

            {inputMode === 'text' ? (
              <Textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={
                  cvPurpose === 'job'
                    ? 'Paste the full job description here...'
                    : 'Paste the scholarship/grant call, requirements, or criteria here (or leave blank for general academic CV)...'
                }
                rows={10}
                className="mt-4"
                disabled={isLoading || isGeneratingCoverLetter}
              />
            ) : (
              <div className="mt-4 flex items-center justify-center w-full">
                <label htmlFor="file-upload" className={`flex flex-col items-center justify-center w-full h-48 border-2 border-zinc-300 border-dashed rounded-xl bg-zinc-50 dark:bg-neutral-800 dark:border-neutral-600 ${!apiKeySet ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors'}`}>
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                    <UploadCloud className="w-8 h-8 mb-4 text-zinc-500 dark:text-zinc-400" />
                    <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400"><span className="font-semibold">Click to upload files</span> or drag and drop</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">PDF, DOCX, PNG, JPG, etc.</p>
                  </div>
                  <input id="file-upload" type="file" className="hidden" multiple accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" onChange={handleFileUploads} disabled={!apiKeySet} />
                </label>
              </div>
            )}

            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            {!apiKeySet && inputMode === 'upload' && <p className="text-amber-600 text-sm mt-2">Please set your API key in settings to enable file uploads.</p>}

            {cvPurpose === 'job' && (
              <JobAnalysis
                jobDescription={jobDescription}
                cvTextContent={cvTextContent}
                apiKeySet={apiKeySet}
                onAnalysisComplete={handleJobAnalysisComplete}
              />
            )}
          </div>
        )}

        {/* General mode info banner */}
        {cvPurpose === 'general' && (
          <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800 flex items-start gap-3">
            <Globe className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">No job description needed</p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                The AI will craft a powerful, well-rounded CV from your profile that works across multiple industries and roles. Great for cold applications, LinkedIn optimization, and networking.
              </p>
            </div>
          </div>
        )}

        {/* === GENERATION MODE SELECTOR (Job mode only) === */}
        {cvPurpose === 'job' && (
          <div className="mt-8">
            <div className="mb-3">
              <Label className="text-base font-semibold block">AI Generation Mode</Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Choose how powerfully the AI tailors your CV to this job.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cvGenerationModes.map((mode) => {
                const isSelected = generationMode === mode.id;
                const colors = modeColorMap[mode.id];
                return (
                  <button
                    key={mode.id}
                    onClick={() => setGenerationMode(mode.id)}
                    className={`
                      relative text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                      ${isSelected
                        ? `${colors.ring} ${colors.bg} border-current shadow-lg ${colors.glow}`
                        : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/40'
                      }
                    `}
                  >
                    {isSelected && (
                      <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded-full ${colors.ring} border-2 flex items-center justify-center`}>
                        <div className={`w-1.5 h-1.5 rounded-full bg-current ${colors.text}`}></div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{mode.emoji}</span>
                      <span className={`text-sm font-bold ${isSelected ? colors.text : 'text-zinc-800 dark:text-zinc-200'}`}>{mode.label}</span>
                    </div>
                    <p className={`text-xs font-medium mb-1 ${isSelected ? colors.text : 'text-zinc-600 dark:text-zinc-400'}`}>{mode.shortDesc}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{mode.description}</p>
                  </button>
                );
              })}
            </div>

            {/* Warning for non-honest modes */}
            {(generationMode === 'boosted' || generationMode === 'aggressive') && (
              <div className={`mt-3 p-3 rounded-lg border flex items-start gap-2.5 text-xs ${generationMode === 'aggressive'
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                }`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Heads up:</strong> {generationMode === 'aggressive'
                    ? 'Aggressive mode adds 1-2 fabricated roles. Use with discretion — some employers verify employment history.'
                    : 'Boosted mode adds 1 strategically crafted role. Review the CV carefully before submitting.'}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button onClick={handleGenerateCV} disabled={isLoading || isGeneratingCoverLetter || !apiKeySet} size="lg">
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {loadingMessage}
              </>
            ) : <><Sparkles className="h-5 w-5 mr-2" />Generate CV</>}
          </Button>
        </div>
      </div>

      {currentCV && (
        <div className="bg-white dark:bg-neutral-800/50 p-4 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
          <div className="flex flex-wrap items-start justify-between mb-6 gap-6">
            <div>
              <h2 className="text-2xl font-bold">CV Preview</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Select a template, choose a font, and make final edits.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <Label htmlFor="font-select" className="sr-only">Font</Label>
                <select
                  id="font-select"
                  value={font}
                  onChange={(e) => setFont(e.target.value as FontName)}
                  className="text-sm rounded-lg border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 focus:ring-indigo-500 focus:border-indigo-500 h-9"
                  disabled={isEditing}
                >
                  {Object.entries(fontDisplayNames).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} size="sm">
                <Edit className="h-4 w-4 mr-2" />
                {isEditing ? 'Finish Editing' : 'Edit CV'}
              </Button>
              <Button variant="secondary" onClick={() => { setCvScore(null); handleGenerateCV(); }} disabled={isLoading || isEditing || !apiKeySet} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <Button variant="secondary" onClick={() => onSaveCV(currentCV, cvPurpose)} disabled={isEditing} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="secondary" onClick={handleGenerateCoverLetter} disabled={isGeneratingCoverLetter || isEditing || !apiKeySet} size="sm">
                <FileText className="h-4 w-4 mr-2" />
                {isGeneratingCoverLetter ? "Generating..." : "Cover Letter"}
              </Button>
              {jobDescription.trim() && apiKeySet && (
                <Button
                  variant="secondary"
                  onClick={handleScoreCV}
                  disabled={isScoringCV || isEditing}
                  size="sm"
                  className="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                >
                  {isScoringCV ? (
                    <><svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Scoring…</>
                  ) : (
                    <>⚡ Score CV</>
                  )}
                </Button>
              )}
              {currentCV && REACT_PDF_TEMPLATES.includes(template as any) ? (
                <PDFDownloadButton
                  cvData={currentCV}
                  personalInfo={userProfile.personalInfo}
                  template={template}
                  fileName={pdfFileName}
                  onFallback={handleDownload}
                  disabled={isEditing}
                />
              ) : (
                <Button onClick={handleDownload} disabled={isEditing} size="sm">
                  <Download className="h-4 w-4 mr-2" />Download PDF
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowShareModal(true)}
                disabled={isEditing}
                size="sm"
                className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
                <ShareIcon className="h-4 w-4 mr-2" />Share Link
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowAIPanel(true)}
                disabled={isEditing || !apiKeySet}
                size="sm"
                className="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40"
              >
                <Sparkles className="h-4 w-4 mr-2" />AI Coach
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowGitHubModal(true)}
                disabled={isEditing}
                size="sm"
                className="bg-zinc-50 dark:bg-neutral-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-neutral-600 hover:bg-zinc-100 dark:hover:bg-neutral-700"
              >
                <GitHubIcon className="h-4 w-4 mr-2" />GitHub
              </Button>
              {onApplyViaEmail && cvPurpose === 'job' && (
                <Button
                  onClick={() => onApplyViaEmail(jobDescription, currentCV!)}
                  disabled={isEditing || !jobDescription.trim()}
                  size="sm"
                  variant="secondary"
                  className="bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                >
                  ✉️ Apply via Email
                </Button>
              )}
            </div>
          </div>

          {atsDataEmbedded && (
            <div className="mb-4 -mt-2 p-3 text-sm text-green-800 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center gap-3 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <span><strong>ATS Power Mode Active:</strong> Job description keywords, phrases &amp; semantic context embedded invisibly in your PDF across 4 zones — maximising match scores in Greenhouse, Lever, Workday, Taleo &amp; iCIMS.</span>
            </div>
          )}

          {cvScore && (() => {
            const score = cvScore.overall;
            const grade = score >= 85 ? { label: 'Excellent', ring: 'ring-green-400', bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400' }
              : score >= 70 ? { label: 'Good', ring: 'ring-blue-400', bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' }
              : score >= 55 ? { label: 'Fair', ring: 'ring-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400' }
              : { label: 'Needs Work', ring: 'ring-red-400', bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' };

            const dim = (label: string, val: number, colour: string) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-neutral-700">
                  <div className={`h-1.5 rounded-full ${colour}`} style={{ width: `${val}%` }} />
                </div>
              </div>
            );

            return (
              <div className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full ring-4 ${grade.ring} flex items-center justify-center bg-white dark:bg-neutral-800`}>
                      <span className={`text-xl font-extrabold ${grade.text}`}>{score}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">CV Match Score</p>
                      <p className={`text-lg font-extrabold ${grade.text}`}>{grade.label}</p>
                    </div>
                  </div>
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400 max-w-xs hidden sm:block">"{cvScore.verdict}"</p>
                  <button onClick={() => setCvScore(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 ml-3 flex-shrink-0" title="Dismiss">✕</button>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Score bars */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Score Breakdown</p>
                    {dim('ATS Keyword Match', cvScore.ats, 'bg-indigo-500')}
                    {dim('Quantified Impact', cvScore.impact, 'bg-emerald-500')}
                    {dim('Role Relevance', cvScore.relevance, 'bg-blue-500')}
                    {dim('Writing Clarity', cvScore.clarity, 'bg-amber-500')}
                  </div>

                  {/* Insights */}
                  <div className="space-y-4">
                    {cvScore.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1.5">✓ Strengths</p>
                        <ul className="space-y-1">
                          {cvScore.strengths.map((s, i) => <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">• {s}</li>)}
                        </ul>
                      </div>
                    )}
                    {cvScore.improvements.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1.5">→ Quick Wins</p>
                        <ul className="space-y-1">
                          {cvScore.improvements.map((s, i) => <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">• {s}</li>)}
                        </ul>
                      </div>
                    )}
                    {cvScore.missingKeywords.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1.5">⚠ Missing Keywords</p>
                        <div className="flex flex-wrap gap-1">
                          {cvScore.missingKeywords.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Purpose/Mode badge on preview */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${purposeBadgeBg} ${purposeBadgeText}`}>
              {purposeLabel}
            </span>
          </div>

          <TemplateGallery
            selectedTemplate={template}
            onSelect={setTemplate}
            cvData={currentCV ?? undefined}
            personalInfo={userProfile.personalInfo}
          />

          <div ref={previewRef} className="mt-8 border-t border-zinc-200 dark:border-neutral-700 pt-8">
            <CVPreview
              cvData={currentCV}
              personalInfo={userProfile.personalInfo}
              isEditing={isEditing}
              onDataChange={setCurrentCV}
              jobDescriptionForATS={jobDescription}
              template={template}
            />
          </div>
        </div>
      )}

      {coverLetterError && <p className="text-red-500 text-sm mt-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">{coverLetterError}</p>}
      {coverLetter && (
        <div className="bg-white dark:bg-neutral-800/50 p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
          <CoverLetterPreview
            letterText={coverLetter}
            onTextChange={setCoverLetter}
            fileName={`${userProfile.personalInfo.name.replace(/\s+/g, '_')}_Cover_Letter.pdf`}
            personalInfo={userProfile.personalInfo}
          />
        </div>
      )}

      {showShareModal && currentCV && (
        <ShareCVModal
          cvData={currentCV}
          personalInfo={userProfile.personalInfo}
          template={template}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showAIPanel && currentCV && (
        <AIImprovementPanel
          cvData={currentCV}
          personalInfo={userProfile.personalInfo}
          jobDescription={jobDescription}
          apiKeySet={apiKeySet}
          onCVUpdate={(newCV) => { setCurrentCV(newCV); }}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {showGitHubModal && (
        <GitHubSyncModal
          savedCVs={savedCVs}
          currentCV={currentCV}
          personalInfo={userProfile.personalInfo}
          onClose={() => setShowGitHubModal(false)}
        />
      )}
    </div>
  );
};

export default CVGenerator;
