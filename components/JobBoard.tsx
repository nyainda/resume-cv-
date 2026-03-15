import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ScrapedJob, UserProfile, CVData, PipelineStatus } from '../types';
import {
    searchJobsByCategory, fetchJobFromUrl, fetchJobDescription,
    JobCategory, getRemainingCalls, getUsage, getCacheAge,
    shouldRefresh, PLATFORMS,
} from '../services/tavilyService';
import { generateCV } from '../services/geminiService';
import { downloadCVAsPDF } from '../services/pdfService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import {
    Search, Briefcase, Building, ExternalLink, Plus, Trash, CheckCircle,
    Clock, RefreshCw, Target, AlertCircle, Globe, Sparkles, Download, Link,
    BookOpen, Shield,
} from './icons';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface JobBoardProps {
    tavilyApiKey: string | null | undefined;
    apiKeySet: boolean;
    userProfile: UserProfile;
    openSettings: () => void;
    onJobApplied: (details: { roleTitle: string; company: string; savedCvName: string }) => void;
}

type TabId = 'remote' | 'kenya' | 'visa' | 'scholarships' | 'url';

interface SearchResult extends Omit<ScrapedJob, 'status' | 'jobDescription' | 'linkedCvId'> {
    snippet: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; emoji: string; desc: string }[] = [
    { id: 'remote', label: 'Remote', emoji: '🌍', desc: 'Work-from-anywhere jobs worldwide' },
    { id: 'kenya', label: 'Kenya', emoji: '🇰🇪', desc: 'Nairobi & East Africa opportunities' },
    { id: 'visa', label: 'Visa Jobs', emoji: '🛂', desc: 'Jobs with visa/work-permit sponsorship' },
    { id: 'scholarships', label: 'Scholarships', emoji: '🎓', desc: 'Funded study & fellowship opportunities' },
    { id: 'url', label: 'Paste URL', emoji: '🔗', desc: 'Paste any job link → auto extract JD' },
];

const VISA_COUNTRIES = [
    { code: 'UK', label: '🇬🇧 United Kingdom' },
    { code: 'Canada', label: '🇨🇦 Canada' },
    { code: 'Germany', label: '🇩🇪 Germany' },
    { code: 'Netherlands', label: '🇳🇱 Netherlands' },
    { code: 'Australia', label: '🇦🇺 Australia' },
    { code: 'UAE Dubai', label: '🇦🇪 UAE / Dubai' },
    { code: 'Singapore', label: '🇸🇬 Singapore' },
    { code: 'Ireland', label: '🇮🇪 Ireland' },
    { code: 'Belgium', label: '🇧🇪 Belgium' },
    { code: 'Switzerland', label: '🇨🇭 Switzerland' },
    { code: 'New Zealand', label: '🇳🇿 New Zealand' },
    { code: 'Portugal', label: '🇵🇹 Portugal' },
    { code: 'Sweden', label: '🇸🇪 Sweden' },
    { code: 'Norway', label: '🇳🇴 Norway' },
    { code: 'Denmark', label: '🇩🇰 Denmark' },
];

const SCHOLARSHIP_LEVELS = [
    'Masters', 'PhD', 'Undergraduate', 'Postdoctoral',
    'Fellowship', 'Professional Certificate', 'Short Course',
];

const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string }> = {
    queued: { label: 'Queued', color: 'bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400' },
    generating: { label: 'Generating…', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
    'cv-ready': { label: 'CV Ready ✓', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    applied: { label: 'Applied ✓', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
};

const SOURCE_COLORS: Record<string, string> = {
    LinkedIn: 'bg-blue-600', Indeed: 'bg-blue-800',
    Glassdoor: 'bg-emerald-600', Reed: 'bg-red-600',
    TotalJobs: 'bg-orange-500', Workable: 'bg-teal-600',
    Lever: 'bg-purple-600', Greenhouse: 'bg-green-600',
    'Remote.co': 'bg-indigo-600', RemoteOK: 'bg-pink-600',
    WWR: 'bg-rose-600', FlexJobs: 'bg-amber-600',
    Himalayas: 'bg-sky-600', Remotive: 'bg-cyan-600',
    Wellfound: 'bg-orange-600', AngelList: 'bg-neutral-700',
    BrighterMonday: 'bg-red-700', MyJobMag: 'bg-green-700',
    Fuzu: 'bg-teal-700', ReliefWeb: 'bg-blue-700',
    'UN Careers': 'bg-sky-800', 'World Bank': 'bg-indigo-800',
    ScholarshipPortal: 'bg-violet-600', OpportunityDesk: 'bg-fuchsia-600',
    Scholars4Dev: 'bg-purple-700', Chevening: 'bg-blue-900',
    DAAD: 'bg-amber-700', Fulbright: 'bg-red-800',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

const BudgetBar: React.FC<{ remaining: number }> = ({ remaining }) => {
    const pct = Math.round((remaining / 1000) * 100);
    const color = remaining > 300 ? 'bg-emerald-500' : remaining > 100 ? 'bg-amber-500' : 'bg-rose-500';
    return (
        <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                API Budget:
            </span>
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-neutral-700 rounded-full overflow-hidden max-w-[120px]">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`font-bold ${remaining > 300 ? 'text-emerald-600' : remaining > 100 ? 'text-amber-600' : 'text-rose-600'}`}>
                {remaining}/1000
            </span>
        </div>
    );
};

const JobCard: React.FC<{
    job: SearchResult;
    alreadyQueued: boolean;
    onAdd: () => void;
}> = ({ job, alreadyQueued, onAdd }) => {
    const srcColor = SOURCE_COLORS[job.source] || 'bg-zinc-600';
    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 p-4 hover:border-violet-300 dark:hover:border-violet-700 transition-all shadow-sm hover:shadow-md flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${srcColor}`}>
                    {job.source}
                </span>
                <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-violet-500 transition-colors shrink-0">
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-snug mb-1 line-clamp-2">
                {job.title}
            </h3>
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1 mb-1">
                <Building className="h-3 w-3" /> {job.company}
                {job.location && <><span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="text-zinc-500 font-normal">{job.location}</span></>}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-3 flex-1">
                {job.snippet}
            </p>
            <Button
                onClick={onAdd}
                disabled={alreadyQueued}
                className={`w-full rounded-xl text-xs font-bold h-8 border-0 mt-auto ${alreadyQueued
                    ? 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400 cursor-not-allowed'
                    : 'bg-violet-600 hover:bg-violet-700 text-white shadow shadow-violet-500/20'
                    }`}
            >
                {alreadyQueued
                    ? <><CheckCircle className="h-3 w-3 mr-1" />In Pipeline</>
                    : <><Plus className="h-3 w-3 mr-1" />Add to Pipeline</>}
            </Button>
        </div>
    );
};

const PipelineCard: React.FC<{
    job: ScrapedJob;
    isFetching: boolean;
    isGenerating: boolean;
    onGenerate: () => void;
    onRemove: () => void;
}> = ({ job, isFetching, isGenerating, onGenerate, onRemove }) => {
    const s = STATUS_CONFIG[job.status];
    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 p-5 transition-all shadow-sm hover:border-violet-200 dark:hover:border-violet-800">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                        {isFetching && <span className="text-[10px] text-blue-500 animate-pulse">Fetching full JD…</span>}
                    </div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{job.title}</h3>
                    <p className="text-sm text-violet-600 dark:text-violet-400 font-semibold flex items-center gap-1">
                        <Building className="h-3 w-3" /> {job.company}
                        {job.location && <><span className="text-zinc-300 dark:text-zinc-600">·</span>
                            <span className="text-zinc-500 font-normal text-xs">{job.location}</span></>}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{job.jobDescription || job.snippet}</p>
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                    <Button
                        onClick={onGenerate}
                        disabled={isGenerating || job.status === 'generating'}
                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow shadow-violet-500/20 rounded-xl text-xs font-bold px-4 h-9 flex items-center gap-1.5"
                    >
                        {isGenerating
                            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Generating…</>
                            : job.status === 'cv-ready'
                                ? <><Download className="h-3.5 w-3.5" />Re-download</>
                                : <><Sparkles className="h-3.5 w-3.5" />Generate CV</>}
                    </Button>
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 h-9 rounded-xl border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />View
                    </a>
                    <button onClick={onRemove}
                        className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20 transition-colors">
                        <Trash className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const JobBoard: React.FC<JobBoardProps> = ({
    tavilyApiKey, apiKeySet, userProfile, openSettings, onJobApplied
}) => {
    // ── Persisted state (survives page refresh) ──
    const [activeTab, setActiveTab] = useLocalStorage<TabId>('jb_activeTab', 'remote');
    const [mainTab, setMainTab] = useLocalStorage<'search' | 'pipeline'>('jb_mainTab', 'search');
    const [role, setRole] = useLocalStorage<string>('jb_role', '');
    const [visaCountry, setVisaCountry] = useLocalStorage<string>('jb_visaCountry', 'UK');
    const [scholarshipLevel, setScholarshipLevel] = useLocalStorage<string>('jb_scholarshipLevel', 'Masters');
    const [searchResults, setSearchResults] = useLocalStorage<SearchResult[]>('jb_searchResults', []);
    const [pipeline, setPipeline] = useLocalStorage<ScrapedJob[]>('jb_pipeline', []);

    // ── Ephemeral state (resets on refresh — loading/error indicators) ──
    const [pastedUrl, setPastedUrl] = useState('');
    const [urlResult, setUrlResult] = useState<{ title: string; company: string; jobDescription: string } | null>(null);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [isFetchingUrl, setIsFetchingUrl] = useState(false);
    const [fromCache, setFromCache] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [fetchingId, setFetchingId] = useState<string | null>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [remaining, setRemaining] = useState(getRemainingCalls());

    const refreshBudget = () => setRemaining(getRemainingCalls());

    // ─── Search ──────────────────────────────────────────────────────────────────
    const handleSearch = useCallback(async () => {
        if (!role.trim() && activeTab !== 'scholarships') return;
        if (!tavilyApiKey) { openSettings(); return; }
        setIsSearching(true);
        setSearchError(null);
        try {
            const { jobs, fromCache: fc, cacheAge: ca } = await searchJobsByCategory(
                activeTab as JobCategory,
                role || 'scholarship fellowship',
                tavilyApiKey,
                { visaCountry, scholarshipLevel }
            );
            setSearchResults(jobs);
            setFromCache(fc);
            setCacheAge(ca);
            refreshBudget();
        } catch (e) {
            setSearchError(e instanceof Error ? e.message : 'Search failed. Check your Tavily API key.');
        } finally {
            setIsSearching(false);
        }
    }, [role, activeTab, tavilyApiKey, visaCountry, scholarshipLevel, openSettings]);

    // ─── URL Paste ────────────────────────────────────────────────────────────────
    const handleFetchUrl = useCallback(async () => {
        if (!pastedUrl.trim()) return;
        if (!tavilyApiKey) { openSettings(); return; }
        setIsFetchingUrl(true);
        setUrlError(null);
        setUrlResult(null);
        try {
            const result = await fetchJobFromUrl(pastedUrl.trim(), tavilyApiKey);
            setUrlResult(result);
            refreshBudget();
        } catch (e) {
            setUrlError(e instanceof Error ? e.message : 'Could not extract job from that URL.');
        } finally {
            setIsFetchingUrl(false);
        }
    }, [pastedUrl, tavilyApiKey, openSettings]);

    const addUrlJobToPipeline = useCallback(() => {
        if (!urlResult) return;
        const newJob: ScrapedJob = {
            id: `job-url-${Date.now()}`,
            title: urlResult.title || 'Job from URL',
            company: urlResult.company || 'Unknown Company',
            location: '',
            snippet: urlResult.jobDescription.slice(0, 250),
            jobDescription: urlResult.jobDescription,
            url: pastedUrl,
            source: new URL(pastedUrl).hostname.replace('www.', ''),
            dateFound: new Date().toISOString(),
            status: 'queued',
        };
        setPipeline(prev => [newJob, ...prev]);
        setMainTab('pipeline');
        setUrlResult(null);
        setPastedUrl('');
    }, [urlResult, pastedUrl]);

    // ─── Add to Pipeline ─────────────────────────────────────────────────────────
    const addToPipeline = useCallback(async (job: SearchResult) => {
        if (pipeline.some(p => p.url === job.url)) return;
        const newJob: ScrapedJob = { ...job, status: 'queued', jobDescription: job.snippet };
        setPipeline(prev => [newJob, ...prev]);
        setMainTab('pipeline');

        if (tavilyApiKey) {
            setFetchingId(job.id);
            try {
                const fullJD = await fetchJobDescription(job.url, job.title, tavilyApiKey);
                if (fullJD) setPipeline(prev => prev.map(p => p.id === job.id ? { ...p, jobDescription: fullJD } : p));
                refreshBudget();
            } catch { /* keep snippet */ }
            finally { setFetchingId(null); }
        }
    }, [pipeline, tavilyApiKey]);

    // ─── Generate CV ─────────────────────────────────────────────────────────────
    const handleGenerateCV = useCallback(async (job: ScrapedJob) => {
        if (!apiKeySet) { openSettings(); return; }
        setPipeline(prev => prev.map(p => p.id === job.id ? { ...p, status: 'generating' } : p));
        setGeneratingId(job.id);
        try {
            const cvData: CVData = await generateCV(userProfile, job.jobDescription, 'honest', 'job', 'standard');
            const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
            const fileName = `${sanitize(userProfile.personalInfo.name)}_${sanitize(job.company)}_CV.pdf`;
            downloadCVAsPDF({ cvData, personalInfo: userProfile.personalInfo, template: 'standard-pro', font: 'inter', fileName, jobDescription: job.jobDescription });
            setPipeline(prev => prev.map(p => p.id === job.id ? { ...p, status: 'cv-ready' } : p));
            onJobApplied({ roleTitle: job.title, company: job.company, savedCvName: `${job.title} @ ${job.company}` });
        } catch (e) {
            console.error(e);
            setPipeline(prev => prev.map(p => p.id === job.id ? { ...p, status: 'queued' } : p));
        } finally {
            setGeneratingId(null);
        }
    }, [apiKeySet, userProfile, openSettings, onJobApplied]);

    const removeFromPipeline = (id: string) => setPipeline(prev => prev.filter(p => p.id !== id));

    // ─── Guard: no Tavily key ─────────────────────────────────────────────────────
    if (!tavilyApiKey) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                <div className="w-20 h-20 rounded-2xl bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center">
                    <Search className="h-10 w-10 text-violet-500" />
                </div>
                <h2 className="text-2xl font-bold">Job Board</h2>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-sm">
                    Connect your <strong className="text-violet-600 dark:text-violet-400">free Tavily API key</strong> to unlock:
                </p>
                <ul className="text-sm text-left space-y-2 text-zinc-600 dark:text-zinc-400">
                    {['🌍 Remote jobs worldwide', '🇰🇪 Kenya & East Africa jobs', '🛂 Visa-sponsored positions by country',
                        '🎓 Funded scholarships & fellowships', '🔗 Paste any job URL → auto-extract JD',
                        '🔒 Scam job filtering (trusted platforms only)', '⚡ One-click CV generation per job'].map(f => (
                            <li key={f} className="flex items-start gap-2">{f}</li>
                        ))}
                </ul>
                <Button onClick={openSettings} className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow-lg shadow-violet-500/25 px-8 rounded-xl">
                    🔑 Connect Tavily in Settings
                </Button>
                <a href="https://app.tavily.com/home" target="_blank" rel="noopener noreferrer" className="text-sm text-violet-500 underline">
                    Get your free key (1,000 searches/month) →
                </a>
            </div>
        );
    }

    // ─── FULL UI ─────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Globe className="h-6 w-6 text-violet-500" /> Job Board
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Search → Queue → Generate CV → Apply — all in one place
                    </p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                    <BudgetBar remaining={remaining} />
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Shield className="h-3.5 w-3.5" />
                        Scam-filtered
                    </div>
                </div>
            </div>

            {/* Main tab: Search / Pipeline */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-neutral-800 p-1 rounded-xl w-fit">
                {(['search', 'pipeline'] as const).map(t => (
                    <button key={t} onClick={() => setMainTab(t)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${mainTab === t
                            ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}>
                        {t === 'search'
                            ? `🔍 Search ${searchResults.length ? `(${searchResults.length})` : ''}`
                            : `⚡ Pipeline ${pipeline.length ? `(${pipeline.length})` : ''}`}
                    </button>
                ))}
            </div>

            {/* ══ SEARCH TAB ══ */}
            {mainTab === 'search' && (
                <div className="space-y-4">

                    {/* Category tabs */}
                    <div className="flex flex-wrap gap-2">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSearchResults([]); setSearchError(null); setUrlResult(null); setUrlError(null); }}
                                title={tab.desc}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${activeTab === tab.id
                                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                                    : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-violet-300 hover:text-violet-600'
                                    }`}>
                                <span>{tab.emoji}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Category description */}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {TABS.find(t => t.id === activeTab)?.desc}
                        {activeTab !== 'url' && <span className="ml-2">· Searching {activeTab === 'remote' ? PLATFORMS.remote.length : activeTab === 'kenya' ? PLATFORMS.kenya.length : activeTab === 'visa' ? PLATFORMS.visa.length : PLATFORMS.scholarships.length}+ trusted platforms · Scam sites blocked</span>}
                    </p>

                    {/* ─ URL Paste Tab ─ */}
                    {activeTab === 'url' && (
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4">
                            <div>
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                                    Paste a job listing URL
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                        <Input
                                            value={pastedUrl}
                                            onChange={e => setPastedUrl(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
                                            placeholder="https://linkedin.com/jobs/view/..."
                                            className="pl-10 rounded-xl font-mono text-sm"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleFetchUrl}
                                        disabled={isFetchingUrl || !pastedUrl.trim()}
                                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl px-5 shrink-0"
                                    >
                                        {isFetchingUrl ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Fetch JD'}
                                    </Button>
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">
                                    Works with LinkedIn, Indeed, Glassdoor, company career pages, and most job portals. Uses 1 API credit.
                                </p>
                            </div>

                            {urlError && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {urlError}
                                </div>
                            )}

                            {urlResult && (
                                <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-neutral-700">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{urlResult.title}</h3>
                                            <p className="text-sm text-violet-600 font-semibold">{urlResult.company}</p>
                                        </div>
                                        <Button
                                            onClick={addUrlJobToPipeline}
                                            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl text-sm px-4 shrink-0"
                                        >
                                            <Plus className="h-4 w-4 mr-1" /> Add to Pipeline
                                        </Button>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-neutral-900 rounded-xl p-4 max-h-64 overflow-y-auto">
                                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Extracted Job Description</p>
                                        <pre className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans">
                                            {urlResult.jobDescription}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─ Search Bar (non-URL tabs) ─ */}
                    {activeTab !== 'url' && (
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4">
                            <div className="flex flex-wrap gap-3">
                                {/* Role input */}
                                <div className="relative flex-1 min-w-[180px]">
                                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                    <Input
                                        value={role}
                                        onChange={e => setRole(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        placeholder={activeTab === 'scholarships' ? 'Field of study (optional)…' : 'Job title or role…'}
                                        className="pl-10 rounded-xl"
                                    />
                                </div>

                                {/* Visa country picker */}
                                {activeTab === 'visa' && (
                                    <select
                                        value={visaCountry}
                                        onChange={e => setVisaCountry(e.target.value)}
                                        className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    >
                                        {VISA_COUNTRIES.map(c => (
                                            <option key={c.code} value={c.code}>{c.label}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Scholarship level picker */}
                                {activeTab === 'scholarships' && (
                                    <select
                                        value={scholarshipLevel}
                                        onChange={e => setScholarshipLevel(e.target.value)}
                                        className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    >
                                        {SCHOLARSHIP_LEVELS.map(l => (
                                            <option key={l} value={l}>🎓 {l}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Search button */}
                                <Button
                                    onClick={handleSearch}
                                    disabled={isSearching || (!role.trim() && activeTab !== 'scholarships')}
                                    className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow shadow-violet-500/20 rounded-xl px-6 min-w-[120px] shrink-0"
                                >
                                    {isSearching
                                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                                        : <><Search className="h-4 w-4 mr-2" />Search</>}
                                </Button>
                            </div>

                            {fromCache && (
                                <p className="text-xs text-zinc-400 mt-2 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Results from cache ({cacheAge ?? 0}m ago) — saves API credits.
                                    <button onClick={handleSearch} className="text-violet-500 underline ml-1">Refresh</button>
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {searchError && (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm">
                            <AlertCircle className="h-5 w-5 shrink-0" /> {searchError}
                        </div>
                    )}

                    {/* Skeletons */}
                    {isSearching && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="animate-pulse bg-zinc-100 dark:bg-neutral-800 rounded-2xl h-48" />
                            ))}
                        </div>
                    )}

                    {/* Empty */}
                    {!isSearching && !searchError && searchResults.length === 0 && activeTab !== 'url' && (
                        <div className="text-center py-16 text-zinc-400">
                            {activeTab === 'remote' && <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />}
                            {activeTab === 'kenya' && <div className="text-5xl mb-4">🇰🇪</div>}
                            {activeTab === 'visa' && <div className="text-5xl mb-4">🛂</div>}
                            {activeTab === 'scholarships' && <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />}
                            <p className="font-medium">Enter a search then click Search</p>
                            <p className="text-sm mt-1">
                                {activeTab === 'visa' && `Results for visa-sponsored jobs in ${visaCountry}`}
                                {activeTab === 'scholarships' && `${scholarshipLevel} scholarships & fellowships`}
                                {activeTab === 'remote' && 'Remote opportunities from 30+ trusted platforms'}
                                {activeTab === 'kenya' && 'Jobs from Nairobi & East Africa boards'}
                            </p>
                        </div>
                    )}

                    {/* Results grid */}
                    {searchResults.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {searchResults.map(job => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    alreadyQueued={pipeline.some(p => p.url === job.url)}
                                    onAdd={() => addToPipeline(job)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══ PIPELINE TAB ══ */}
            {mainTab === 'pipeline' && (
                <div className="space-y-4">
                    {pipeline.length === 0 ? (
                        <div className="text-center py-16 text-zinc-400">
                            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="font-medium">Your pipeline is empty</p>
                            <p className="text-sm mt-1">Find jobs in Search, then click <strong>Add to Pipeline</strong></p>
                            <Button onClick={() => setMainTab('search')} className="mt-4 rounded-xl border-violet-300 text-violet-600">
                                ← Go to Search
                            </Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-zinc-500">
                                {pipeline.length} job{pipeline.length !== 1 ? 's' : ''} queued · Click <strong>Generate CV</strong> to create a tailored PDF and auto-log the application.
                            </p>
                            <div className="space-y-3">
                                {pipeline.map(job => (
                                    <PipelineCard
                                        key={job.id}
                                        job={job}
                                        isFetching={fetchingId === job.id}
                                        isGenerating={generatingId === job.id}
                                        onGenerate={() => handleGenerateCV(job)}
                                        onRemove={() => removeFromPipeline(job.id)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default JobBoard;
