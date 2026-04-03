import React, { useState, useCallback, useRef } from 'react';
import { UserProfile } from '../types';
import { extractTextFromDocx, parseWordTextToProfile } from '../services/wordImportService';
import { Button } from './ui/Button';
import { RefreshCw, CheckCircle, AlertCircle, Download } from './icons';

const WordIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="10 9 9 9 8 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

interface WordImportPanelProps {
    apiKeySet: boolean;
    openSettings: () => void;
    onProfileImported: (profile: UserProfile) => void;
}

type ImportStep = 'idle' | 'extracting' | 'parsing' | 'preview' | 'done' | 'error';

const WordImportPanel: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported }) => {
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file) return;
        if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
            setError('Please upload a .docx file (Word document). .doc files are not supported — save as .docx first.');
            setStep('error');
            return;
        }
        if (!apiKeySet) {
            openSettings();
            return;
        }

        setError(null);
        setStep('extracting');

        try {
            const text = await extractTextFromDocx(file);
            setExtractedText(text);
            setStep('parsing');

            const profile = await parseWordTextToProfile(text);
            setParsedProfile(profile);
            setStep('preview');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to parse the Word document.');
            setStep('error');
        }
    }, [apiKeySet, openSettings]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        setStep('done');
    }, [parsedProfile, onProfileImported]);

    const reset = () => {
        setStep('idle');
        setError(null);
        setExtractedText('');
        setParsedProfile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
                <div className="p-2.5 bg-blue-600 rounded-xl flex-shrink-0">
                    <WordIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import from Word Document</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Upload your existing CV as a <strong>.docx</strong> file. Our AI will read it, extract all your information, and import it directly into your profile — then you can apply any of our templates to it.
                    </p>
                </div>
            </div>

            {/* Upload zone */}
            {(step === 'idle' || step === 'error') && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${isDragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-neutral-600 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                        }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".docx"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <UploadIcon className="h-10 w-10 mx-auto mb-3 text-blue-400" />
                    <p className="font-bold text-zinc-700 dark:text-zinc-300">Drop your .docx file here</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">or click to browse</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">Microsoft Word (.docx) • Max 10MB</p>
                </div>
            )}

            {/* Error state */}
            {step === 'error' && error && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {/* Loading states */}
            {(step === 'extracting' || step === 'parsing') && (
                <div className="flex flex-col items-center gap-4 py-12">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <WordIcon className="h-8 w-8 text-blue-500" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center">
                            <RefreshCw className="h-3.5 w-3.5 text-white animate-spin" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-zinc-800 dark:text-zinc-200">
                            {step === 'extracting' ? 'Reading your Word document…' : 'AI is extracting your profile data…'}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                            {step === 'extracting' ? 'Parsing the document structure' : 'This takes about 10–20 seconds'}
                        </p>
                    </div>
                    <div className="flex gap-1.5">
                        {['extracting', 'parsing'].map((s, i) => (
                            <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-8 bg-blue-500' : i < ['extracting', 'parsing'].indexOf(step) ? 'w-4 bg-blue-300' : 'w-4 bg-zinc-200 dark:bg-neutral-700'}`} />
                        ))}
                    </div>
                </div>
            )}

            {/* Preview */}
            {step === 'preview' && parsedProfile && (
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                        <CheckCircle className="h-4 w-4" /> Profile extracted successfully! Review below, then click "Import to Profile".
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Work Roles', count: parsedProfile.workExperience.length, color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' },
                            { label: 'Education', count: parsedProfile.education.length, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                            { label: 'Skills', count: parsedProfile.skills.length, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
                            { label: 'Projects', count: parsedProfile.projects?.length || 0, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
                        ].map(item => (
                            <div key={item.label} className={`${item.color} rounded-xl p-3 text-center`}>
                                <div className="text-2xl font-black">{item.count}</div>
                                <div className="text-xs font-semibold mt-0.5">{item.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Extracted name/email preview */}
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Extracted Data Preview</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            {parsedProfile.personalInfo.name && (
                                <div><span className="text-zinc-400 text-xs">Name</span><br /><span className="font-semibold">{parsedProfile.personalInfo.name}</span></div>
                            )}
                            {parsedProfile.personalInfo.email && (
                                <div><span className="text-zinc-400 text-xs">Email</span><br /><span className="font-semibold">{parsedProfile.personalInfo.email}</span></div>
                            )}
                            {parsedProfile.personalInfo.phone && (
                                <div><span className="text-zinc-400 text-xs">Phone</span><br /><span className="font-semibold">{parsedProfile.personalInfo.phone}</span></div>
                            )}
                            {parsedProfile.personalInfo.location && (
                                <div><span className="text-zinc-400 text-xs">Location</span><br /><span className="font-semibold">{parsedProfile.personalInfo.location}</span></div>
                            )}
                        </div>
                        {parsedProfile.workExperience.length > 0 && (
                            <div>
                                <span className="text-zinc-400 text-xs">Latest Role</span><br />
                                <span className="font-semibold text-sm">{parsedProfile.workExperience[0].jobTitle}</span>
                                <span className="text-zinc-500 text-xs"> @ {parsedProfile.workExperience[0].company}</span>
                            </div>
                        )}
                        {parsedProfile.skills.length > 0 && (
                            <div>
                                <span className="text-zinc-400 text-xs block mb-1.5">Skills Preview</span>
                                <div className="flex flex-wrap gap-1">
                                    {parsedProfile.skills.slice(0, 12).map(s => (
                                        <span key={s} className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-neutral-700 rounded-full text-zinc-600 dark:text-zinc-400">{s}</span>
                                    ))}
                                    {parsedProfile.skills.length > 12 && (
                                        <span className="text-xs text-zinc-400">+{parsedProfile.skills.length - 12} more</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={handleApply}
                            className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-6 shadow shadow-blue-500/20"
                        >
                            <Download className="h-4 w-4 mr-2" /> Import to My Profile
                        </Button>
                        <Button
                            onClick={reset}
                            className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5"
                        >
                            Try Another File
                        </Button>
                    </div>
                </div>
            )}

            {/* Done state */}
            {step === 'done' && (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                    </div>
                    <div>
                        <p className="font-bold text-xl text-zinc-800 dark:text-zinc-200">Profile Imported!</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your data is now in your profile. Head to the CV Generator to apply a template and generate your CV.</p>
                    </div>
                    <Button onClick={reset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                        Import Another File
                    </Button>
                </div>
            )}
        </div>
    );
};

export default WordImportPanel;
