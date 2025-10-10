import React, { useState, useCallback, ChangeEvent, useMemo } from 'react';
import { UserProfile, CVData, TemplateName, FontName, fontDisplayNames } from '../types';
import { generateCV, generateCoverLetter, extractTextFromImage, extractProfileTextFromFile } from '../services/geminiService';
import { downloadCVAsPDF } from '../services/pdfService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CVPreview from './CVPreview';
import CoverLetterPreview from './CoverLetterPreview';
import TemplateGallery from './TemplateGallery';
import JobAnalysis from './JobAnalysis';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Save, Download, RefreshCw, Edit, FileText, Sparkles, HelpCircle, UploadCloud, CheckCircle } from './icons';

interface CVGeneratorProps {
  userProfile: UserProfile;
  currentCV: CVData | null;
  setCurrentCV: React.Dispatch<React.SetStateAction<CVData | null>>;
  onSaveCV: (cvData: CVData, purpose: 'job' | 'academic') => void;
  apiKeySet: boolean;
  openSettings: () => void;
}

const fileToBase64 = (file: File): Promise<{base64: string, mimeType: string}> => {
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

const CVGenerator: React.FC<CVGeneratorProps> = ({ userProfile, currentCV, setCurrentCV, onSaveCV, apiKeySet, openSettings }) => {
  const [jobDescription, setJobDescription] = useLocalStorage<string>('jobDescription', '');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Generating...');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [template, setTemplate] = useLocalStorage<TemplateName>('template', 'professional');
  const [font, setFont] = useLocalStorage<FontName>('cvFont', 'lora');
  const [inputMode, setInputMode] = useState<'text' | 'upload'>('text');
  const [aiEnhancements, setAiEnhancements] = useState(true);
  const [cvPurpose, setCvPurpose] = useState<'job' | 'academic'>('job');
  const [atsDataEmbedded, setAtsDataEmbedded] = useState(false);

  const [coverLetter, setCoverLetter] = useLocalStorage<string | null>('coverLetter', null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);

  const handleGenerateCV = useCallback(async () => {
    if (!apiKeySet) {
        setError("Please set your Gemini API key in the settings to use this feature.");
        openSettings();
        return;
    }
    if (!jobDescription.trim()) {
      setError(`Please provide a ${cvPurpose === 'job' ? 'job' : 'grant/scholarship'} description.`);
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Generating CV...');
    setError(null);
    setIsEditing(false);
    setCoverLetter(null); // Clear old cover letter
    setAtsDataEmbedded(false); // Reset confirmation on new CV generation
    try {
      const generatedData = await generateCV(userProfile, jobDescription, aiEnhancements, cvPurpose);
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
    }
  }, [jobDescription, userProfile, setCurrentCV, aiEnhancements, setCoverLetter, apiKeySet, openSettings, cvPurpose]);

  const handleGenerateCoverLetter = useCallback(async () => {
    if (!apiKeySet) {
        setCoverLetterError("Please set your Gemini API key in the settings to use this feature.");
        openSettings();
        return;
    }
    if (!jobDescription.trim()) {
      setCoverLetterError("Please provide a description to generate a cover letter.");
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

            let extractedText = '';
            // Gemini can handle various document types via its generic file API
            extractedText = await extractProfileTextFromFile(base64, mimeType);
            
            extractedTexts.push(extractedText);
        }
        setJobDescription(prev => `${prev}\n\n${extractedTexts.join('\n\n---\n\n')}`.trim());
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        setError(`Failed to process files: ${errorMessage}`);
    } finally {
        setIsLoading(false);
        setLoadingMessage('Generating...');
        // Clear file input value to allow re-uploading the same file
        if(event.target) event.target.value = '';
    }
  };

  const handleDownload = () => {
    if (!currentCV) return;
    const wasEmbedded = downloadCVAsPDF({
      cvData: currentCV,
      personalInfo: userProfile.personalInfo,
      template: template,
      font: font,
      fileName: `${userProfile.personalInfo.name.replace(' ','_')}_CV.pdf`,
      jobDescription: jobDescription, // Pass job description for ATS optimization
    });
    setAtsDataEmbedded(wasEmbedded);
  };

  const cvTextContent = useMemo(() => {
    if (!currentCV) return "";
    let text = currentCV.summary;
    text += currentCV.skills.join(' ');
    currentCV.experience.forEach(exp => {
      text += ` ${exp.jobTitle} ${exp.company} ${exp.responsibilities.join(' ')}`;
    });
    return text.toLowerCase();
  }, [currentCV]);


  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-neutral-800/50 p-6 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
        <div className="space-y-2">
            <Label className="text-2xl font-bold">CV Customization</Label>
            <div className="flex items-center gap-4 pt-2">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">CV Purpose:</span>
                <div className="flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-neutral-900 p-1">
                    <Button variant={cvPurpose === 'job' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCvPurpose('job')} className={`!rounded-md ${cvPurpose === 'job' ? 'bg-white dark:!bg-neutral-700 shadow-sm' : ''}`}>Job Application</Button>
                    <Button variant={cvPurpose === 'academic' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCvPurpose('academic')} className={`!rounded-md ${cvPurpose === 'academic' ? 'bg-white dark:!bg-neutral-700 shadow-sm' : ''}`}>Grant / Scholarship</Button>
                </div>
            </div>
        </div>

        <Label className="text-xl font-semibold mt-6 block">{cvPurpose === 'job' ? 'Job Description' : 'Grant/Scholarship Description'}</Label>
        
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
             placeholder={`Paste the full ${cvPurpose === 'job' ? 'job' : 'grant'} description here...`}
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

        <JobAnalysis jobDescription={jobDescription} cvTextContent={cvTextContent} apiKeySet={apiKeySet} />
        
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2 self-start sm:self-center">
              <input
                  type="checkbox"
                  id="ai-enhancements"
                  checked={aiEnhancements}
                  onChange={(e) => setAiEnhancements(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  disabled={cvPurpose === 'academic'}
              />
              <label htmlFor="ai-enhancements" className={`text-sm font-medium text-zinc-700 dark:text-zinc-300 ${cvPurpose === 'academic' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  AI Enhancements
              </label>
              <div className="group relative flex items-center">
                  <HelpCircle className="h-4 w-4 text-zinc-400" />
                  <div className="absolute bottom-full mb-2 w-64 bg-zinc-800 text-white text-xs rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                      {cvPurpose === 'job' ? 'Allows the AI to add an ideal work experience and generate relevant projects to strengthen your CV.' : 'AI enhancements are not applicable for academic CVs.'}
                      <svg className="absolute text-zinc-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg>
                  </div>
              </div>
          </div>
          <Button onClick={handleGenerateCV} disabled={isLoading || isGeneratingCoverLetter || !apiKeySet} size="lg">
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {loadingMessage}
              </>
            ) : <><Sparkles className="h-5 w-5 mr-2" />Generate Tailored CV</>}
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
                    <Button variant="secondary" onClick={handleGenerateCV} disabled={isLoading || isEditing || !apiKeySet} size="sm">
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
                    <Button onClick={handleDownload} disabled={isEditing} size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                    </Button>
                </div>
            </div>

            {atsDataEmbedded && (
                <div className="mb-6 -mt-2 p-3 text-sm text-green-800 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center gap-3 border border-green-200 dark:border-green-800">
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                    <span><strong>ATS Optimization Active:</strong> The job description has been embedded as invisible text in your PDF to improve keyword matching.</span>
                </div>
            )}

            <TemplateGallery selectedTemplate={template} onSelect={setTemplate} />

            <div className="mt-8 border-t border-zinc-200 dark:border-neutral-700 pt-8">
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
                fileName={`${userProfile.personalInfo.name.replace(' ','_')}_Cover_Letter.pdf`}
              />
          </div>
      )}
    </div>
  );
};

export default CVGenerator;