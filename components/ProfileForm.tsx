import React, { useState, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { UserProfile } from '../types';
import { generateProfile, extractProfileTextFromFile } from '../services/geminiService';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import { Plus, Trash, Sparkles, UploadCloud, DownloadCloud } from './icons';

interface ProfileFormProps {
  existingProfile: UserProfile | null;
  onSave: (data: UserProfile) => void;
  onCancel?: () => void;
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

const ProfileForm: React.FC<ProfileFormProps> = ({ existingProfile, onSave, onCancel }) => {
  const [aiMode, setAiMode] = useState(false);
  const [profileInputMode, setProfileInputMode] = useState<'text' | 'upload'>('text');
  const [rawText, setRawText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);


  const { register, control, handleSubmit, formState: { errors }, reset, getValues } = useForm<UserProfile>({
    defaultValues: existingProfile || {
      personalInfo: { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
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
    if (!rawText.trim() && !uploadedFile) {
      setAiError("Please paste your information or upload a file first.");
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

        if (!textToParse || !textToParse.trim()) {
            throw new Error("Could not extract any text from the provided source. Please try a different file or paste text manually.");
        }
        
        const profile = await generateProfile(textToParse);
        reset(profile);
        setAiMode(false); // Switch to form view for review
        alert("Profile generated successfully! Please review and save.");
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        setAiError(`Failed to generate profile: ${errorMessage}`);
    } finally {
        setIsGenerating(false);
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
    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-md">
        <div className="flex flex-wrap justify-between items-center mb-6 border-b pb-4 gap-4">
            <h1 className="text-3xl font-bold">My Profile</h1>
            <div className="flex items-center gap-2">
                <input type="file" accept=".json" ref={importInputRef} onChange={handleImportProfile} className="hidden" />
                <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()}>
                    <UploadCloud className="h-4 w-4 mr-2"/> Import
                </Button>
                 <Button variant="ghost" size="sm" onClick={handleExportProfile}>
                    <DownloadCloud className="h-4 w-4 mr-2"/> Export
                </Button>
                <Button variant="secondary" onClick={() => setAiMode(!aiMode)}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {aiMode ? 'Fill Form Manually' : 'Generate with AI'}
                </Button>
            </div>
        </div>

        {aiMode ? (
            <div className="space-y-4">
                <Label htmlFor="raw-text" className="text-xl font-bold">Paste or Upload your Resume/Profile</Label>
                <p className="text-sm text-slate-500 mb-2">Provide your career details in any format (pasted text, PDF, or image), and our AI will structure it into your profile.</p>

                <div className="my-2 border-b border-slate-200 dark:border-slate-700">
                  <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                    <button onClick={() => setProfileInputMode('text')} className={`${profileInputMode === 'text' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                      Paste Text
                    </button>
                    <button onClick={() => setProfileInputMode('upload')} className={`${profileInputMode === 'upload' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                      Upload File (PDF, JPG, PNG)
                    </button>
                  </nav>
                </div>

                {profileInputMode === 'text' ? (
                    <Textarea
                        id="raw-text"
                        value={rawText}
                        onChange={(e) => { setRawText(e.target.value); setUploadedFile(null); }}
                        placeholder="e.g., paste your full resume here..."
                        rows={15}
                        disabled={isGenerating}
                    />
                ) : (
                    <div className="mt-4 flex items-center justify-center w-full">
                        <label htmlFor="profile-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 dark:hover:bg-bray-800 dark:bg-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-600">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                                {uploadedFile ? (
                                    <p className="font-semibold text-blue-600 px-2">{uploadedFile.name}</p>
                                ) : (
                                    <>
                                        <svg className="w-8 h-8 mb-4 text-slate-500 dark:text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                                        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">PDF, PNG, JPG, or WEBP</p>
                                    </>
                                )}
                            </div>
                            <input id="profile-upload" type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={handleFileChange} />
                        </label>
                    </div>
                )}
                
                {aiError && <p className="text-red-500 text-sm mt-2">{aiError}</p>}
                <div className="flex justify-end">
                    <Button onClick={handleGenerateProfile} disabled={isGenerating}>
                         {isGenerating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Generating...
                            </>
                        ) : 'Generate Profile'}
                    </Button>
                </div>
            </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold border-b pb-2">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label htmlFor="name">Full Name</Label><Input id="name" {...register("personalInfo.name", { required: true })} />{errors.personalInfo?.name && <p className="text-red-500 text-xs mt-1">Name is required</p>}</div>
                <div><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("personalInfo.email", { required: true })} />{errors.personalInfo?.email && <p className="text-red-500 text-xs mt-1">Email is required</p>}</div>
                <div><Label htmlFor="phone">Phone</Label><Input id="phone" {...register("personalInfo.phone")} /></div>
                <div><Label htmlFor="location">Location</Label><Input id="location" {...register("personalInfo.location")} /></div>
                <div className="md:col-span-2"><Label htmlFor="linkedin">LinkedIn URL</Label><Input id="linkedin" {...register("personalInfo.linkedin")} /></div>
                <div><Label htmlFor="website">Website/Portfolio URL</Label><Input id="website" {...register("personalInfo.website")} /></div>
                <div><Label htmlFor="github">GitHub URL</Label><Input id="github" {...register("personalInfo.github")} /></div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="summary" className="text-2xl font-bold">Professional Summary</Label>
              <Textarea id="summary" {...register("summary", { required: true })} rows={4} className="mt-2" />
              {errors.summary && <p className="text-red-500 text-xs mt-1">Summary is required</p>}
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold border-b pb-2">Work Experience</h2>
              {workFields.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-md space-y-2 relative">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="Company" {...register(`workExperience.${index}.company`, { required: true })} />
                    <Input placeholder="Job Title" {...register(`workExperience.${index}.jobTitle`, { required: true })} />
                    <Input type="date" placeholder="Start Date" {...register(`workExperience.${index}.startDate`)} />
                    <Input type="date" placeholder="End Date" {...register(`workExperience.${index}.endDate`)} />
                  </div>
                  <Textarea placeholder="Responsibilities and achievements (bullet points)" {...register(`workExperience.${index}.responsibilities`, { required: true })} rows={4} />
                  <button type="button" onClick={() => removeWork(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => appendWork({ id: `${Date.now()}`, company: '', jobTitle: '', startDate: '', endDate: '', responsibilities: '' })}><Plus className="h-4 w-4 mr-2" /> Add Experience</Button>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold border-b pb-2">Education</h2>
              {eduFields.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-md space-y-2 relative">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <Input placeholder="Degree (e.g., B.S. in Computer Science)" {...register(`education.${index}.degree`, { required: true })} />
                     <Input placeholder="School/University" {...register(`education.${index}.school`, { required: true })} />
                     <Input placeholder="Graduation Year" {...register(`education.${index}.graduationYear`)} />
                   </div>
                  <button type="button" onClick={() => removeEdu(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => appendEdu({ id: `${Date.now()}`, degree: '', school: '', graduationYear: '' })}><Plus className="h-4 w-4 mr-2" /> Add Education</Button>
            </div>

            <div>
              <Label htmlFor="skills" className="text-2xl font-bold">Skills</Label>
              <p className="text-sm text-slate-500 mb-2">Enter skills separated by commas (e.g., React, TypeScript, Node.js)</p>
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
              <h2 className="text-2xl font-bold border-b pb-2">Projects (Optional)</h2>
              {projFields.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-md space-y-2 relative">
                   <Input placeholder="Project Name" {...register(`projects.${index}.name`)} />
                   <Textarea placeholder="Project Description" {...register(`projects.${index}.description`)} rows={2} />
                   <Input placeholder="Project Link (e.g., GitHub, live site)" {...register(`projects.${index}.link`)} />
                  <button type="button" onClick={() => removeProj(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => appendProj({ id: `${Date.now()}`, name: '', description: '', link: '' })}><Plus className="h-4 w-4 mr-2" /> Add Project</Button>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold border-b pb-2">Languages</h2>
              {langFields.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-md space-y-2 relative">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Input placeholder="Language (e.g., Spanish)" {...register(`languages.${index}.name`)} />
                     <Input placeholder="Proficiency (e.g., Fluent, Native)" {...register(`languages.${index}.proficiency`)} />
                   </div>
                  <button type="button" onClick={() => removeLang(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700"><Trash className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => appendLang({ id: `${Date.now()}`, name: '', proficiency: '' })}><Plus className="h-4 w-4 mr-2" /> Add Language</Button>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
              <Button type="submit">Save Profile</Button>
            </div>
          </form>
        )}
    </div>
  );
};

export default ProfileForm;
