import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import { extractTextFromDocx, extractTextFromArrayBuffer, parseWordTextToProfile } from '../services/wordImportService';
import { OneDriveService, OneDriveFile, getMsToken } from '../services/oneDriveService';
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

const OneDriveIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.5 18H5.75A3.75 3.75 0 0 1 3.5 11.1a6 6 0 0 1 11.4-2.5A4.5 4.5 0 0 1 19.5 13a4.5 4.5 0 0 1-4.5 4.5H10.5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const SettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

const MsLogoIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.4 2H2v9.4h9.4V2z" fill="#f25022" />
        <path d="M22 2h-9.4v9.4H22V2z" fill="#7fba00" />
        <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00a4ef" />
        <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#ffb900" />
    </svg>
);

interface WordImportPanelProps {
    apiKeySet: boolean;
    openSettings: () => void;
    onProfileImported: (profile: UserProfile) => void;
}

type ImportStep = 'idle' | 'extracting' | 'parsing' | 'preview' | 'done' | 'error';
type PanelMode = 'upload' | 'onedrive';

function formatRelativeTime(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

const WordImportPanel: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported }) => {
    const [mode, setMode] = useState<PanelMode>('upload');

    const msConnected = !!getMsToken();

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
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
                    onClick={() => setMode('onedrive')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'onedrive'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <MsLogoIcon className="h-4 w-4" />
                    OneDrive Sync
                    {!msConnected && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full font-bold">Setup</span>
                    )}
                </button>
            </div>

            {mode === 'upload' && (
                <UploadMode apiKeySet={apiKeySet} openSettings={openSettings} onProfileImported={onProfileImported} />
            )}
            {mode === 'onedrive' && (
                <OneDriveMode apiKeySet={apiKeySet} openSettings={openSettings} onProfileImported={onProfileImported} msConnected={msConnected} />
            )}
        </div>
    );
};

const UploadMode: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported }) => {
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file) return;
        if (!file.name.match(/\.docx?$/i)) {
            setError('Please upload a .docx file (Word document). .doc files are not supported — save as .docx first.');
            setStep('error');
            return;
        }
        if (!apiKeySet) { openSettings(); return; }

        setError(null);
        setStep('extracting');
        try {
            const text = await extractTextFromDocx(file);
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
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        setStep('done');
    }, [parsedProfile, onProfileImported]);

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
                        Upload your existing CV as a <strong>.docx</strong> file. Our AI will read it, extract all your information, and import it directly into your profile — then you can apply any of our templates.
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
                <ProfilePreview
                    parsedProfile={parsedProfile}
                    onApply={handleApply}
                    onReset={reset}
                    applyLabel="Import to My Profile"
                    resetLabel="Try Another File"
                />
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Import Another File" />}
        </div>
    );
};

interface OneDriveModeProps extends WordImportPanelProps {
    msConnected: boolean;
}

const OneDriveMode: React.FC<OneDriveModeProps> = ({ apiKeySet, openSettings, onProfileImported, msConnected }) => {
    const [files, setFiles] = useState<OneDriveFile[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [filesError, setFilesError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<OneDriveFile | null>(null);
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [liveSync, setLiveSync] = useState(false);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const [lastModified, setLastModified] = useState<string | null>(null);
    const [relativeTime, setRelativeTime] = useState('');
    const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isSyncingRef = useRef(false);

    const token = getMsToken();

    const fetchFiles = useCallback(async () => {
        if (!token) return;
        setLoadingFiles(true);
        setFilesError(null);
        try {
            const svc = new OneDriveService(token);
            const list = await svc.listWordFiles();
            setFiles(list);
        } catch (e) {
            setFilesError(e instanceof Error ? e.message : 'Failed to load files from OneDrive.');
        } finally {
            setLoadingFiles(false);
        }
    }, [token]);

    useEffect(() => {
        if (msConnected) fetchFiles();
    }, [msConnected, fetchFiles]);

    useEffect(() => {
        if (!lastSynced) return;
        setRelativeTime(formatRelativeTime(lastSynced));
        const t = setInterval(() => setRelativeTime(formatRelativeTime(lastSynced)), 15000);
        return () => clearInterval(t);
    }, [lastSynced]);

    const syncFile = useCallback(async (file: OneDriveFile, checkModified = false) => {
        if (!token) return;
        if (!apiKeySet) { openSettings(); return; }
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;

        try {
            const svc = new OneDriveService(token);

            if (checkModified) {
                const mod = await svc.getFileLastModified(file.id);
                if (mod === lastModified) { isSyncingRef.current = false; return; }
                setLastModified(mod);
            }

            setStep('extracting');
            setError(null);
            const buffer = await svc.downloadFile(file.id);
            setStep('parsing');
            const text = await extractTextFromArrayBuffer(buffer);
            const profile = await parseWordTextToProfile(text);
            setParsedProfile(profile);
            setLastSynced(new Date());
            if (!checkModified) setLastModified(file.lastModifiedDateTime);
            setStep('preview');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sync failed.');
            setStep('error');
        } finally {
            isSyncingRef.current = false;
        }
    }, [token, apiKeySet, openSettings, lastModified]);

    const handleSelectFile = useCallback((file: OneDriveFile) => {
        setSelectedFile(file);
        setParsedProfile(null);
        setLastSynced(null);
        setLastModified(null);
        setStep('idle');
        syncFile(file, false);
    }, [syncFile]);

    useEffect(() => {
        if (!liveSync || !selectedFile) {
            if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
            return;
        }
        syncIntervalRef.current = setInterval(() => {
            if (selectedFile) syncFile(selectedFile, true);
        }, 30000);
        return () => {
            if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
        };
    }, [liveSync, selectedFile, syncFile]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        setStep('done');
    }, [parsedProfile, onProfileImported]);

    const reset = () => {
        setSelectedFile(null); setParsedProfile(null); setStep('idle');
        setError(null); setLastSynced(null); setLiveSync(false);
    };

    if (!msConnected) {
        return (
            <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-200 dark:border-blue-800/40 text-center space-y-4">
                    <div className="flex justify-center">
                        <div className="p-3 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-neutral-700">
                            <MsLogoIcon className="h-8 w-8" />
                        </div>
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Connect your Microsoft account</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto">
                            Sign in with Microsoft to browse your OneDrive and sync your Word CV directly — no file uploading needed.
                        </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 p-4 text-left space-y-2 max-w-sm mx-auto">
                        {['Pick any Word file from your OneDrive', 'AI imports your CV data automatically', 'Live sync: updates every 30s as you type in Word'].map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                                {f}
                            </div>
                        ))}
                    </div>
                    <Button
                        onClick={openSettings}
                        className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-6 mx-auto"
                    >
                        <SettingsIcon className="h-4 w-4 mr-2" />
                        Set up in Settings
                    </Button>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-semibold">One-time setup required:</p>
                    <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-400">
                        <li>Open <strong>Settings → Microsoft / OneDrive</strong></li>
                        <li>Enter your Azure App Client ID <span className="text-xs">(or use a shared one if provided)</span></li>
                        <li>Click <strong>Sign in with Microsoft</strong></li>
                    </ol>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* File picker */}
            {!selectedFile || step === 'idle' ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                            Your Word Documents on OneDrive
                        </h4>
                        <button
                            onClick={fetchFiles}
                            disabled={loadingFiles}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3 w-3 ${loadingFiles ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {loadingFiles && (
                        <div className="flex items-center justify-center gap-2 py-8 text-zinc-400 text-sm">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Loading files from OneDrive…
                        </div>
                    )}

                    {filesError && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {filesError}
                        </div>
                    )}

                    {!loadingFiles && !filesError && files.length === 0 && (
                        <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
                            <WordIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No .docx files found in your OneDrive root.
                        </div>
                    )}

                    {!loadingFiles && files.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {files.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => handleSelectFile(file)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all text-left group"
                                >
                                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                                        <WordIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate group-hover:text-blue-700 dark:group-hover:text-blue-300">{file.name}</p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            Modified {new Date(file.lastModifiedDateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {file.size ? ` • ${(file.size / 1024).toFixed(0)} KB` : ''}
                                        </p>
                                    </div>
                                    <svg className="h-4 w-4 text-zinc-300 group-hover:text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {selectedFile && (step === 'extracting' || step === 'parsing') && <ParseLoadingState step={step} />}

            {selectedFile && step === 'error' && error && (
                <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                    </div>
                    <Button onClick={reset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                        Choose Different File
                    </Button>
                </div>
            )}

            {selectedFile && step === 'preview' && parsedProfile && (
                <div className="space-y-4">
                    {/* Selected file + sync controls */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
                        <div className="p-1.5 bg-blue-600 rounded-lg flex-shrink-0">
                            <WordIcon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{selectedFile.name}</p>
                            {lastSynced && (
                                <p className="text-xs text-zinc-400">Last synced: {relativeTime}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => syncFile(selectedFile, false)}
                                disabled={step === 'extracting' || step === 'parsing'}
                                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 disabled:opacity-40 transition-colors"
                                title="Sync now"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                            <button onClick={reset} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-700 text-zinc-400 transition-colors" title="Choose different file">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Live sync toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                        <div>
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Live Sync</p>
                            <p className="text-xs text-zinc-400 mt-0.5">Auto-updates every 30 seconds when you edit in Word</p>
                        </div>
                        <button
                            onClick={() => setLiveSync(v => !v)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${liveSync ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-neutral-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${liveSync ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {liveSync && (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                            <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Live sync active — checking for changes every 30 seconds
                        </div>
                    )}

                    <ProfilePreview
                        parsedProfile={parsedProfile}
                        onApply={handleApply}
                        onReset={reset}
                        applyLabel="Import to My Profile"
                        resetLabel="Choose Different File"
                    />
                </div>
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Sync Another File" />}
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
                {step === 'extracting' ? 'Reading your Word document…' : 'AI is extracting your profile data…'}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {step === 'extracting' ? 'Parsing the document structure' : 'This takes about 10–20 seconds'}
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
    onApply: () => void;
    onReset: () => void;
    applyLabel: string;
    resetLabel: string;
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ parsedProfile, onApply, onReset, applyLabel, resetLabel }) => (
    <div className="space-y-4">
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
            <CheckCircle className="h-4 w-4" /> Profile extracted successfully! Review below, then click "{applyLabel}".
        </div>

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
            <Button onClick={onApply} className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-6 shadow shadow-blue-500/20">
                <Download className="h-4 w-4 mr-2" /> {applyLabel}
            </Button>
            <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                {resetLabel}
            </Button>
        </div>
    </div>
);

const DoneState: React.FC<{ onReset: () => void; resetLabel: string }> = ({ onReset, resetLabel }) => (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
            <p className="font-bold text-xl text-zinc-800 dark:text-zinc-200">Profile Imported!</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your data is now in your profile. Head to the CV Generator to apply a template and generate your CV.</p>
        </div>
        <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
            {resetLabel}
        </Button>
    </div>
);

export default WordImportPanel;
