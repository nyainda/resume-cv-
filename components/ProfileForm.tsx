import React, { useState, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { UserProfile } from '../types';
import {
  generateProfile,
  extractProfileTextFromFile,
  generateEnhancedSummary,
  generateEnhancedResponsibilities,
  generateEnhancedProjectDescription
} from '../services/geminiService';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import { Plus, Trash, Sparkles, UploadCloud, DownloadCloud, User } from './icons';

interface ProfileFormProps {
  existingProfile: UserProfile | null;
  onSave: (data: UserProfile) => void;
  onCancel?: () => void;
  apiKeySet: boolean;
  openSettings: () => void;
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

const ProfileForm: React.FC<ProfileFormProps> = ({ existingProfile, onSave, onCancel, apiKeySet, openSettings }) => {
  const [aiMode, setAiMode] = useState(false);
  const [profileInputMode, setProfileInputMode] = useState<'text' | 'upload'>('text');
  const [rawText, setRawText] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<string | null>(null); // e.g., 'summary', 'work.0', 'project.1'
  const importInputRef = useRef<HTMLInputElement>(null);


  const { register, control, handleSubmit, formState: { errors }, reset, getValues, setValue } = useForm<UserProfile>({
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

  const { fields: workFields, append: appendWork, remove: removeWork } = useFieldArray({ control, name: "workExperience" });
  const { fields: eduFields, append: appendEdu, remove: removeEdu } = useFieldArray({ control, name: "education" });
  const { fields: projFields, append: appendProj, remove: removeProj } = useFieldArray({ control, name: "projects" });
  const { fields: langFields, append: appendLang, remove: removeLang } = useFieldArray({ control, name: "languages" });

  const onSubmit = (data: UserProfile) => {
    const skillsArray = typeof data.skills === 'string' ? (data.skills as string).split(',').map(s => s.trim()).filter(Boolean) : data.skills;
    onSave({ ...data, skills: skillsArray });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setRawText(''); // Clear raw text if a file is uploaded
      setAiError(null);
    }
  };

  const handleGenerateProfile = async () => {
    if (!apiKeySet) {
      setAiError("Please set your Gemini API key in the settings to use this feature.");
      openSettings();
      return;
    }
    if (!rawText.trim() && !uploadedFile && !githubUrl.trim()) {
      setAiError("Please paste your info, upload a file, or provide a GitHub URL.");
      return;
    }
    setIsGenerating(true);
    setAiError(null);
    try {
      let textToParse = rawText;
      if (uploadedFile) {
        const { base64, mimeType } = await fileToBase64(uploadedFile);
        textToParse = await extractProfileTextFromFile(base64, mimeType);
      }

      if (!textToParse.trim() && !githubUrl.trim()) {
        throw new Error("Could not extract any text from the provided source. Please try a different file, paste text manually, or provide a GitHub URL.");
      }

      const profile = await generateProfile(textToParse, githubUrl);
      reset(profile);
      setAiMode(false); // Switch to form view for review
      alert("Profile generated successfully! Please review and save.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      let displayError = `Failed to generate profile: ${errorMessage}`;
      if (errorMessage.toLowerCase().includes('api key')) {
        displayError = "Failed to generate profile. Your API Key seems to be invalid. Please check it in the settings.";
      }
      setAiError(displayError);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnhance = async (type: 'summary' | 'responsibilities' | 'project', index?: number) => {
    if (!apiKeySet) {
      alert("Please set your API key in settings to use AI enhancements.");
      openSettings();
      return;
    }

    const enhancingKey = index !== undefined ? `${type}.${index}` : type;
    setIsEnhancing(enhancingKey);

    try {
      if (type === 'summary') {
        const profileData = getValues();
        const enhancedSummary = await generateEnhancedSummary(profileData);
        setValue('summary', enhancedSummary);
      } else if (type === 'responsibilities' && index !== undefined) {
        const workItem = getValues(`workExperience.${index}`);
        const enhancedResps = await generateEnhancedResponsibilities(workItem.jobTitle, workItem.company, workItem.responsibilities);
        setValue(`workExperience.${index}.responsibilities`, enhancedResps);
      } else if (type === 'project' && index !== undefined) {
        const projectItem = getValues(`projects.${index}`);
        const enhancedDesc = await generateEnhancedProjectDescription(projectItem.name, projectItem.description);
        setValue(`projects.${index}.description`, enhancedDesc);
      }
    } catch (error) {
      alert(`Failed to enhance content: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsEnhancing(null);
    }
  };

  const handleExportProfile = () => {
    const profileData = getValues();
    const blob = new Blob([JSON.stringify(profileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aicv_profile.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === 'string') {
          const importedProfile = JSON.parse(text);
          // Basic validation
          if (importedProfile.personalInfo && importedProfile.summary) {
            reset(importedProfile);
            alert('Profile imported successfully! Please review and save.');
          } else {
            throw new Error('Invalid profile file format.');
          }
        }
      } catch (error) {
        alert(`Failed to import profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };


  return (
    <div className="bg-white dark:bg-neutral-800/50 p-6 sm:p-8 rounded-xl shadow-sm border border-zinc-200 dark:border-neutral-800">
      <div className="flex flex-wrap justify-between items-center mb-8 border-b border-zinc-200 dark:border-neutral-700 pb-5 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">My Profile</h1>
        <div className="flex items-center gap-2">
          <input type="file" accept=".json" ref={importInputRef} onChange={handleImportProfile} className="hidden" />
          <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()}>
            <UploadCloud className="h-4 w-4 mr-2" /> Import
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportProfile}>
            <DownloadCloud className="h-4 w-4 mr-2" /> Export
          </Button>
          <Button variant="secondary" onClick={() => setAiMode(!aiMode)} title={!apiKeySet ? "Please set your API key in settings to use AI features" : ""}>
            <Sparkles className="h-4 w-4 mr-2 text-indigo-500" />
            {aiMode ? 'Fill Manually' : 'Generate with AI'}
          </Button>
        </div>
      </div>

      {aiMode ? (
        <div className="space-y-6">
          <div>
            <Label htmlFor="raw-text" className="text-xl font-bold">Generate Profile with AI</Label>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Provide your career details in any format (pasted text, file, or GitHub URL), and our AI will structure it for you.</p>
          </div>

          <div className="border-b border-zinc-200 dark:border-neutral-700">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button onClick={() => setProfileInputMode('text')} className={`${profileInputMode === 'text' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                Paste Text
              </button>
              <button onClick={() => setProfileInputMode('upload')} className={`${profileInputMode === 'upload' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`}>
                Upload File (PDF, etc.)
              </button>
            </nav>
          </div>

          {profileInputMode === 'text' ? (
            <Textarea
              id="raw-text"
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setUploadedFile(null); }}
              placeholder="e.g., paste your full resume here..."
              rows={12}
              disabled={isGenerating || !apiKeySet}
            />
          ) : (
            <div className="mt-4 flex items-center justify-center w-full">
              <label htmlFor="profile-upload" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-zinc-300 border-dashed rounded-xl bg-zinc-50 dark:bg-neutral-800 dark:border-neutral-600 ${!apiKeySet ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-neutral-700 transition-colors'}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                  {uploadedFile ? (
                    <p className="font-semibold text-indigo-600 px-2">{uploadedFile.name}</p>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 mb-4 text-zinc-500 dark:text-zinc-400" />
                      <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">PDF, PNG, JPG, or WEBP</p>
                    </>
                  )}
                </div>
                <input id="profile-upload" type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={handleFileChange} disabled={!apiKeySet} />
              </label>
            </div>
          )}

          <div className="pt-2">
            <Label htmlFor="github-url">GitHub Profile URL (Optional)</Label>
            <Input
              id="github-url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="e.g., https://github.com/username"
              disabled={isGenerating || !apiKeySet}
              className="mt-1"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Provide a link for the AI to discover and include your projects.</p>
          </div>

          {aiError && <p className="text-red-500 text-sm mt-2">{aiError}</p>}
          {!apiKeySet && <p className="text-amber-600 text-sm mt-2">Please set your API key in settings to enable AI features.</p>}
          <div className="flex justify-end pt-4">
            <Button onClick={handleGenerateProfile} disabled={isGenerating || !apiKeySet}>
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Generating...
                </>
              ) : 'Generate Profile'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-zinc-200 dark:border-neutral-700 pb-3">Personal Information</h2>

            {/* Photo Upload Section */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 p-6 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800">
              <Label className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3 block">
                Profile Photo (Optional)
              </Label>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-4">
                Upload a professional headshot for templates that support photos
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Photo Preview */}
                <div className="flex-shrink-0">
                  {getValues('personalInfo.photo') ? (
                    <div className="relative group">
                      <img
                        src={getValues('personalInfo.photo')}
                        alt="Profile"
                        className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-neutral-700 shadow-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setValue('personalInfo.photo', '')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 border-4 border-white dark:border-neutral-700 shadow-lg flex items-center justify-center">
                      <User className="h-16 w-16 text-indigo-300 dark:text-indigo-600" />
                    </div>
                  )}
                </div>

                {/* Upload Button */}
                <div className="flex-1 w-full">
                  <label
                    htmlFor="photo-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-300 dark:border-indigo-700 border-dashed rounded-xl bg-white/50 dark:bg-neutral-800/50 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 mb-2 text-indigo-500" />
                      <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                        Click to upload photo
                      </p>
                      <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                        PNG, JPG, WEBP (Max 2MB)
                      </p>
                    </div>
                    <input
                      id="photo-upload"
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            alert('File size must be less than 2MB');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setValue('personalInfo.photo', reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2">
              <div><Label htmlFor="name">Full Name</Label><Input id="name" {...register("personalInfo.name", { required: true })} className="mt-1" />{errors.personalInfo?.name && <p className="text-red-500 text-xs mt-1">Name is required</p>}</div>
              <div><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("personalInfo.email", { required: true })} className="mt-1" />{errors.personalInfo?.email && <p className="text-red-500 text-xs mt-1">Email is required</p>}</div>
              <div><Label htmlFor="phone">Phone</Label><Input id="phone" {...register("personalInfo.phone")} className="mt-1" /></div>
              <div><Label htmlFor="location">Location</Label><Input id="location" {...register("personalInfo.location")} className="mt-1" /></div>
              <div className="md:col-span-2"><Label htmlFor="linkedin">LinkedIn URL</Label><Input id="linkedin" {...register("personalInfo.linkedin")} className="mt-1" /></div>
              <div><Label htmlFor="website">Website/Portfolio URL</Label><Input id="website" {...register("personalInfo.website")} className="mt-1" /></div>
              <div><Label htmlFor="github">GitHub URL</Label><Input id="github" {...register("personalInfo.github")} className="mt-1" /></div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2 border-b border-zinc-200 dark:border-neutral-700 pb-3">
              <h2 className="text-xl font-semibold">Professional Summary</h2>
              <button type="button" onClick={() => handleEnhance('summary')} disabled={!apiKeySet || !!isEnhancing} className="p-1 text-indigo-500 hover:text-indigo-700 disabled:opacity-50" title="Enhance with AI">
                {isEnhancing === 'summary' ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <Sparkles className="h-4 w-4" />}
              </button>
            </div>
            <Textarea id="summary" {...register("summary", { required: true })} rows={4} className="mt-2" />
            {errors.summary && <p className="text-red-500 text-xs mt-1">Summary is required</p>}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-zinc-200 dark:border-neutral-700 pb-3">Work Experience</h2>
            {workFields.map((item, index) => (
              <div key={item.id} className="p-4 border border-zinc-200 dark:border-neutral-700/80 rounded-lg space-y-3 relative bg-zinc-50/50 dark:bg-neutral-800/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input placeholder="Company" {...register(`workExperience.${index}.company`, { required: true })} />
                  <Input placeholder="Job Title" {...register(`workExperience.${index}.jobTitle`, { required: true })} />
                  <Input type="date" placeholder="Start Date" {...register(`workExperience.${index}.startDate`)} />
                  <Input type="date" placeholder="End Date" {...register(`workExperience.${index}.endDate`)} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Responsibilities & Achievements</Label>
                  <button type="button" onClick={() => handleEnhance('responsibilities', index)} disabled={!apiKeySet || !!isEnhancing} className="p-1 text-indigo-500 hover:text-indigo-700 disabled:opacity-50" title="Enhance with AI">
                    {isEnhancing === `responsibilities.${index}` ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <Sparkles className="h-4 w-4" />}
                  </button>
                </div>
                <Textarea placeholder="Enter a few keywords or existing points, then click the ✨ icon to generate professional bullet points." {...register(`workExperience.${index}.responsibilities`, { required: true })} rows={4} />
                <button type="button" onClick={() => removeWork(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full"><Trash className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => appendWork({ id: `${Date.now()}`, company: '', jobTitle: '', startDate: '', endDate: '', responsibilities: '' })}><Plus className="h-4 w-4 mr-2" /> Add Experience</Button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-zinc-200 dark:border-neutral-700 pb-3">Education</h2>
            {eduFields.map((item, index) => (
              <div key={item.id} className="p-4 border border-zinc-200 dark:border-neutral-700/80 rounded-lg space-y-2 relative bg-zinc-50/50 dark:bg-neutral-800/20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input placeholder="Degree (e.g., B.S. in Computer Science)" {...register(`education.${index}.degree`, { required: true })} />
                  <Input placeholder="School/University" {...register(`education.${index}.school`, { required: true })} />
                  <Input placeholder="Graduation Year" {...register(`education.${index}.graduationYear`)} />
                </div>
                <button type="button" onClick={() => removeEdu(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full"><Trash className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => appendEdu({ id: `${Date.now()}`, degree: '', school: '', graduationYear: '' })}><Plus className="h-4 w-4 mr-2" /> Add Education</Button>
          </div>

          <div>
            <Label htmlFor="skills" className="text-xl font-semibold">Skills</Label>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">Enter skills separated by commas (e.g., React, TypeScript, Node.js)</p>
            <Controller
              name="skills"
              control={control}
              defaultValue={existingProfile?.skills || []}
              render={({ field }) => (
                <Input
                  id="skills"
                  {...field}
                  value={Array.isArray(field.value) ? field.value.join(', ') : field.value}
                />
              )}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-zinc-200 dark:border-neutral-700 pb-3">Projects (Optional)</h2>
            {projFields.map((item, index) => (
              <div key={item.id} className="p-4 border border-zinc-200 dark:border-neutral-700/80 rounded-lg space-y-3 relative bg-zinc-50/50 dark:bg-neutral-800/20">
                <Input placeholder="Project Name" {...register(`projects.${index}.name`)} />
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Project Description</Label>
                  <button type="button" onClick={() => handleEnhance('project', index)} disabled={!apiKeySet || !!isEnhancing} className="p-1 text-indigo-500 hover:text-indigo-700 disabled:opacity-50" title="Enhance with AI">
                    {isEnhancing === `project.${index}` ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <Sparkles className="h-4 w-4" />}
                  </button>
                </div>
                <Textarea placeholder="Briefly describe your project, then click ✨ to enhance it." {...register(`projects.${index}.description`)} rows={2} />
                <Input placeholder="Project Link (e.g., GitHub, live site)" {...register(`projects.${index}.link`)} />
                <button type="button" onClick={() => removeProj(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full"><Trash className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => appendProj({ id: `${Date.now()}`, name: '', description: '', link: '' })}><Plus className="h-4 w-4 mr-2" /> Add Project</Button>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold border-b border-zinc-200 dark:border-neutral-700 pb-3">Languages</h2>
            {langFields.map((item, index) => (
              <div key={item.id} className="p-4 border border-zinc-200 dark:border-neutral-700/80 rounded-lg relative bg-zinc-50/50 dark:bg-neutral-800/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input placeholder="Language (e.g., Spanish)" {...register(`languages.${index}.name`)} />
                  <Input placeholder="Proficiency (e.g., Fluent, Native)" {...register(`languages.${index}.proficiency`)} />
                </div>
                <button type="button" onClick={() => removeLang(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full"><Trash className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => appendLang({ id: `${Date.now()}`, name: '', proficiency: '' })}><Plus className="h-4 w-4 mr-2" /> Add Language</Button>
          </div>

          <div className="flex justify-end gap-4 pt-6 border-t border-zinc-200 dark:border-neutral-700">
            {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
            <Button type="submit">Save Profile</Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ProfileForm;