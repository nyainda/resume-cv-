import React, { useState, useCallback, useRef } from 'react';
import { UserProfile } from '../types';
import { validateAndNormaliseProfile } from '../utils/profileValidator';
import { extractTextFromDocx, extractTextFromArrayBuffer } from '../services/wordImportService';
import { runImportPipeline } from '../services/importPipeline';
import { classifyAndSaveAllRoles } from '../services/careerTrackClassifier';
import { ImportConfidenceBadge } from './ImportConfidenceBadge';
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
    onJsonImported?: (profile: UserProfile) => void;
}

type ImportStep = 'idle' | 'extracting' | 'parsing' | 'preview' | 'done' | 'error';
type PanelMode = 'upload' | 'json';


const JsonIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="10" y2="13" />
        <line x1="14" y1="13" x2="16" y2="13" />
        <line x1="11" y1="10" x2="11" y2="16" />
        <line x1="13" y1="10" x2="13" y2="16" />
    </svg>
);

const WordImportPanel: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported, onJsonImported }) => {
    const [mode, setMode] = useState<PanelMode>('upload');

    return (
        <div className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-neutral-700 p-0.5 bg-zinc-100 dark:bg-neutral-800 gap-0.5">
                <button
                    onClick={() => setMode('upload')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'upload'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <UploadIcon className="h-4 w-4" />
                    Upload File
                </button>
                <button
                    onClick={() => setMode('json')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'json'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <JsonIcon className="h-4 w-4" />
                    Import JSON
                </button>
            </div>

            {mode === 'upload' && (
                <UploadMode apiKeySet={apiKeySet} openSettings={openSettings} onProfileImported={onProfileImported} />
            )}
            {mode === 'json' && (
                <JsonImportMode onProfileImported={onProfileImported} onJsonImported={onJsonImported} />
            )}
        </div>
    );
};

// ── JSON Import ───────────────────────────────────────────────────────────────

interface JsonImportModeProps {
    onProfileImported: (profile: UserProfile) => void;
    onJsonImported?: (profile: UserProfile) => void;
}

const JsonImportMode: React.FC<JsonImportModeProps> = ({ onProfileImported, onJsonImported }) => {
    const [text, setText] = useState('');
    const [step, setStep] = useState<'idle' | 'preview' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseJson = useCallback((json: string) => {
        setError(null);
        try {
            const raw = JSON.parse(json);
            const profile = validateAndNormaliseProfile(raw);
            setParsedProfile(profile);
            setStep('preview');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Could not parse JSON.';
            setError(msg);
            setStep('error');
        }
    }, []);

    const handleFile = useCallback((file: File) => {
        if (!file.name.match(/\.json$/i)) {
            setError('Please drop a .json file.');
            setStep('error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result;
            if (typeof content === 'string') {
                setText(content);
                parseJson(content);
            }
        };
        reader.readAsText(file);
    }, [parseJson]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) { handleFile(file); return; }
        const dropped = e.dataTransfer.getData('text/plain');
        if (dropped) { setText(dropped); parseJson(dropped); }
    }, [handleFile, parseJson]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        if (onJsonImported) {
            onJsonImported(parsedProfile);
        } else {
            onProfileImported(parsedProfile);
        }
        // Fire-and-forget: populate D1 ontology with all imported roles
        if (parsedProfile.workExperience?.length) {
            classifyAndSaveAllRoles(parsedProfile.workExperience, 'pdf_import').catch(() => {});
        }
        setStep('done');
    }, [parsedProfile, onProfileImported, onJsonImported]);

    const reset = () => {
        setText(''); setStep('idle'); setError(null); setParsedProfile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40">
                <div className="p-2.5 bg-violet-600 rounded-xl flex-shrink-0">
                    <JsonIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import ProCV JSON</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Paste the JSON output from the ProCV master prompt — or drop a <strong>.json</strong> file. No AI processing needed; the data is mapped directly.
                    </p>
                </div>
            </div>

            {(step === 'idle' || step === 'error') && (
                <>
                    {/* Drop zone + textarea */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={`relative rounded-2xl border-2 border-dashed transition-all ${isDragging
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                            : 'border-zinc-300 dark:border-neutral-600'
                        }`}
                    >
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder={'Paste your ProCV JSON here…\n\nOr drop a .json file onto this area.'}
                            rows={10}
                            className="w-full bg-transparent resize-none rounded-2xl px-4 py-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600"
                            spellCheck={false}
                        />
                        {isDragging && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-violet-50/80 dark:bg-violet-900/40 pointer-events-none">
                                <p className="text-sm font-semibold text-violet-600 dark:text-violet-300">Drop .json file here</p>
                            </div>
                        )}
                    </div>

                    {/* File pick alternative */}
                    <div className="flex items-center gap-3">
                        <input ref={fileInputRef} type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                        >
                            Browse for a .json file instead
                        </button>
                        <span className="text-zinc-300 dark:text-neutral-600">·</span>
                        <button
                            onClick={() => parseJson(text)}
                            disabled={!text.trim()}
                            className="ml-auto px-4 py-1.5 text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition-colors"
                        >
                            Parse JSON
                        </button>
                    </div>

                    {step === 'error' && error && (
                        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                        </div>
                    )}
                </>
            )}

            {step === 'preview' && parsedProfile && (
                <ProfilePreview
                    parsedProfile={parsedProfile}
                    onApply={handleApply}
                    onReset={reset}
                    applyLabel="Import to My Profile"
                    resetLabel="Edit JSON"
                />
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Import Another JSON" />}
        </div>
    );
};

const UploadMode: React.FC<WordImportPanelProps> = ({ onProfileImported }) => {
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [confidence, setConfidence] = useState<Record<string, number>>({});
    const [isDragging, setIsDragging] = useState(false);
    const [aiVerifying, setAiVerifying] = useState(false);
    const [aiVerified, setAiVerified] = useState(false);
    const [aiProvider, setAiProvider] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file) return;
        if (!file.name.match(/\.docx?$/i)) {
            setError('Please upload a .docx file. .doc files are not supported — save as .docx first.');
            setStep('error');
            return;
        }
        setError(null);
        setAiVerifying(false);
        setAiVerified(false);
        setConfidence({});
        setStep('extracting');
        try {
            const text = await extractTextFromDocx(file);
            setStep('parsing');
            await runImportPipeline(text, 'docx', {
                onStage1Complete: ({ profile, confidence: conf }) => {
                    setParsedProfile(profile);
                    setConfidence(conf);
                    setStep('preview');
                    setAiVerifying(true);
                },
                onStage2Complete: (verifiedProfile, provider) => {
                    setParsedProfile(verifiedProfile);
                    setAiVerifying(false);
                    setAiVerified(true);
                    setAiProvider(provider);
                },
            });
            setAiVerifying(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to parse the Word document.');
            setStep('error');
            setAiVerifying(false);
        }
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        if (parsedProfile.workExperience?.length) {
            classifyAndSaveAllRoles(parsedProfile.workExperience, 'pdf_import').catch(() => {});
        }
        setStep('done');
    }, [parsedProfile, onProfileImported]);

    const aiStatusBadge = aiVerifying
        ? (
            <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 font-semibold">
                <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                AI is verifying & improving your data…
            </div>
        )
        : aiVerified
            ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    ✓ AI verified{aiProvider && aiProvider !== 'workers-ai' ? ` with ${aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)}` : ''}
                </div>
            )
            : null;

    const reset = () => {
        setStep('idle'); setError(null); setParsedProfile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
                <div className="p-2.5 bg-blue-600 rounded-xl flex-shrink-0">
                    <WordIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import from Word Document</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Upload your existing CV as a <strong>.docx</strong> file. Our AI will extract your information and import it into your profile.
                    </p>
                </div>
            </div>

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
                    <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileChange} className="hidden" />
                    <UploadIcon className="h-10 w-10 mx-auto mb-3 text-blue-400" />
                    <p className="font-bold text-zinc-700 dark:text-zinc-300">Drop your .docx file here</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">or click to browse</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">Microsoft Word (.docx) • Max 10MB</p>
                </div>
            )}

            {step === 'error' && error && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {(step === 'extracting' || step === 'parsing') && <ParseLoadingState step={step} />}

            {step === 'preview' && parsedProfile && (
                <div className="space-y-3">
                    {aiStatusBadge && (
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                            {aiStatusBadge}
                        </div>
                    )}
                    <ProfilePreview parsedProfile={parsedProfile} confidence={confidence} aiVerified={aiVerified}
                        onApply={handleApply} onReset={reset}
                        applyLabel="Import to My Profile" resetLabel="Try Another File" />
                </div>
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Import Another File" />}
        </div>
    );
};


const ParseLoadingState: React.FC<{ step: 'extracting' | 'parsing' }> = ({ step }) => (
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
                {step === 'extracting' ? 'Reading your Word document…' : 'Extracting your profile — no AI key needed…'}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {step === 'extracting' ? 'Parsing file structure' : 'Usually done in under 2 seconds'}
            </p>
        </div>
        <div className="flex gap-1.5">
            {(['extracting', 'parsing'] as const).map((s, i) => (
                <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-8 bg-blue-500' : i < (['extracting', 'parsing'] as const).indexOf(step) ? 'w-4 bg-blue-300' : 'w-4 bg-zinc-200 dark:bg-neutral-700'}`} />
            ))}
        </div>
    </div>
);

interface ProfilePreviewProps {
    parsedProfile: UserProfile;
    confidence: Record<string, number>;
    aiVerified: boolean;
    onApply: () => void;
    onReset: () => void;
    applyLabel: string;
    resetLabel: string;
}

/** A single extracted field row with an inline confidence badge. */
const FieldRow: React.FC<{
    label: string;
    value: string | undefined;
    confidenceKey: string;
    confidence: Record<string, number>;
    aiVerified: boolean;
}> = ({ label, value, confidenceKey, confidence, aiVerified }) => {
    if (!value) return null;
    const score = confidence[confidenceKey] ?? 80;
    const wasLow = score < 70;
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-xs">{label}</span>
                <ImportConfidenceBadge score={score} aiVerified={aiVerified && wasLow} />
            </div>
            <span className="font-semibold text-sm leading-snug">{value}</span>
        </div>
    );
};

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ parsedProfile, confidence, aiVerified, onApply, onReset, applyLabel, resetLabel }) => {
    // Compute overall extraction quality
    const scores = Object.values(confidence);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const lowCount = scores.filter(s => s < 70).length;
    const qualityLabel = avgScore >= 85 ? 'High quality extraction' : avgScore >= 65 ? 'Good extraction' : 'Partial extraction';
    const qualityColor = avgScore >= 85 ? 'text-emerald-600 dark:text-emerald-400' : avgScore >= 65 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

    return (
        <div className="space-y-4">
            {/* Header status */}
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                        Profile extracted — review below, then click "{applyLabel}".
                    </p>
                    {scores.length > 0 && (
                        <p className={`text-xs mt-0.5 ${qualityColor}`}>
                            {qualityLabel}
                            {lowCount > 0 && !aiVerified ? ` · ${lowCount} field${lowCount > 1 ? 's' : ''} flagged for AI review` : ''}
                            {aiVerified && lowCount > 0 ? ` · ${lowCount} field${lowCount > 1 ? 's' : ''} improved by AI` : ''}
                        </p>
                    )}
                </div>
            </div>

            {/* Section count pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Work Roles', count: parsedProfile.workExperience.length, confKey: 'workExperience', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' },
                    { label: 'Education',  count: parsedProfile.education.length,       confKey: 'education',      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                    { label: 'Skills',     count: parsedProfile.skills.length,          confKey: 'skills',         color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
                    { label: 'Projects',   count: parsedProfile.projects?.length || 0,  confKey: 'projects',       color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
                ].map(item => {
                    const sc = confidence[item.confKey] ?? 80;
                    return (
                        <div key={item.label} className={`${item.color} rounded-xl p-3 text-center relative`}>
                            <div className="text-2xl font-black">{item.count}</div>
                            <div className="text-xs font-semibold mt-0.5">{item.label}</div>
                            {sc < 70 && (
                                <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${aiVerified ? 'bg-emerald-500' : sc < 50 ? 'bg-rose-400' : 'bg-amber-400'}`} title={aiVerified ? 'AI verified' : `Confidence: ${sc}%`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Field detail with confidence badges */}
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Extracted Data</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <FieldRow label="Name"     value={parsedProfile.personalInfo.name}     confidenceKey="personalInfo.name"     confidence={confidence} aiVerified={aiVerified} />
                    <FieldRow label="Email"    value={parsedProfile.personalInfo.email}    confidenceKey="personalInfo.email"    confidence={confidence} aiVerified={aiVerified} />
                    <FieldRow label="Phone"    value={parsedProfile.personalInfo.phone}    confidenceKey="personalInfo.phone"    confidence={confidence} aiVerified={aiVerified} />
                    <FieldRow label="Location" value={parsedProfile.personalInfo.location} confidenceKey="personalInfo.location" confidence={confidence} aiVerified={aiVerified} />
                    {parsedProfile.personalInfo.linkedin && (
                        <FieldRow label="LinkedIn" value={parsedProfile.personalInfo.linkedin} confidenceKey="personalInfo.linkedin" confidence={confidence} aiVerified={aiVerified} />
                    )}
                    {parsedProfile.personalInfo.github && (
                        <FieldRow label="GitHub" value={parsedProfile.personalInfo.github} confidenceKey="personalInfo.github" confidence={confidence} aiVerified={aiVerified} />
                    )}
                </div>

                {parsedProfile.workExperience.length > 0 && (
                    <div className="pt-1 border-t border-zinc-100 dark:border-neutral-700">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-zinc-400 text-xs">Latest Role</span>
                            <ImportConfidenceBadge score={confidence['workExperience'] ?? 80} aiVerified={aiVerified && (confidence['workExperience'] ?? 80) < 70} />
                        </div>
                        <span className="font-semibold text-sm">{parsedProfile.workExperience[0].jobTitle}</span>
                        {parsedProfile.workExperience[0].company && (
                            <span className="text-zinc-500 text-xs"> @ {parsedProfile.workExperience[0].company}</span>
                        )}
                    </div>
                )}

                {parsedProfile.skills.length > 0 && (
                    <div className="pt-1 border-t border-zinc-100 dark:border-neutral-700">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-zinc-400 text-xs">Skills</span>
                            <ImportConfidenceBadge score={confidence['skills'] ?? 80} aiVerified={aiVerified && (confidence['skills'] ?? 80) < 70} />
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {parsedProfile.skills.slice(0, 14).map(s => (
                                <span key={s} className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-neutral-700 rounded-full text-zinc-600 dark:text-zinc-400">{s}</span>
                            ))}
                            {parsedProfile.skills.length > 14 && (
                                <span className="text-xs text-zinc-400 self-center">+{parsedProfile.skills.length - 14} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Low-confidence nudge */}
                {!aiVerified && lowCount > 0 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-700 dark:text-amber-400">
                        <span className="flex-shrink-0 mt-0.5">⚡</span>
                        <span>
                            {lowCount} field{lowCount > 1 ? 's' : ''} had low confidence.
                            AI is checking them in the background — the preview updates automatically.
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-3">
                <Button onClick={onApply} className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-6 shadow shadow-blue-500/20">
                    <Download className="h-4 w-4 mr-2" /> {applyLabel}
                </Button>
                <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                    {resetLabel}
                </Button>
            </div>
        </div>
    );
};

const DoneState: React.FC<{ onReset: () => void; resetLabel: string }> = ({ onReset, resetLabel }) => (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
            <p className="font-bold text-xl text-zinc-800 dark:text-zinc-200">Profile Imported!</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your data is now in your profile. Head to the CV Generator to apply a template.</p>
        </div>
        <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
            {resetLabel}
        </Button>
    </div>
);

export default WordImportPanel;
