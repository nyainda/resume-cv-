import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ScrapedJob, UserProfile, CVData, PipelineStatus, SavedCV } from '../types';
import {
    searchJobsByCategory, fetchJobFromUrl, fetchJobDescription,
    JobCategory, getRemainingCalls, getUsage, getCacheAge,
    shouldRefresh, PLATFORMS,
} from '../services/tavilyService';
import {
    searchJobs as jsearchSearch, JSearchJob, JSearchFilters,
    EMPLOYMENT_TYPES, DATE_POSTED_OPTIONS, EXPERIENCE_LEVELS, COUNTRIES, JOB_CATEGORIES,
    formatSalary, timeAgo,
} from '../services/jsearchService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import JobPipelineModal from './JobPipelineModal';
import {
    Search, Briefcase, Building, ExternalLink, Plus, Trash, CheckCircle,
    Clock, RefreshCw, AlertCircle, Globe, Sparkles, Link,
    BookOpen, Shield, FileText,
} from './icons';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface JobBoardProps {
    tavilyApiKey: string | null | undefined;
    jsearchApiKey: string | null | undefined;
    apiKeySet: boolean;
    userProfile: UserProfile;
    openSettings: () => void;
    onJobApplied: (details: { roleTitle: string; company: string; savedCvName: string }) => void;
    onSaveCVFromPipeline: (cvData: CVData, name: string) => void;
    onSaveCoverLetter: (text: string, name: string) => void;
    savedCVs: SavedCV[];
}

type TabId = 'remote' | 'kenya' | 'visa' | 'scholarships' | 'url' | 'jsearch';

interface SearchResult extends Omit<ScrapedJob, 'status' | 'jobDescription' | 'linkedCvId'> {
    snippet: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; emoji: string; desc: string }[] = [
    { id: 'jsearch', label: 'Live Jobs', emoji: '🔎', desc: 'Real-time listings from LinkedIn, Indeed, Glassdoor & 50+ sources' },
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

const GRADE_COLORS: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    F: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

const PipelineCard: React.FC<{
    job: ScrapedJob;
    isFetching: boolean;
    matchGrade?: string;
    matchScore?: number;
    onOpen: () => void;
    onRemove: () => void;
}> = ({ job, isFetching, matchGrade, matchScore, onOpen, onRemove }) => {
    const s = STATUS_CONFIG[job.status];
    const gradeColor = matchGrade ? GRADE_COLORS[matchGrade] : '';
    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 p-5 transition-all shadow-sm hover:border-violet-200 dark:hover:border-violet-800">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                        {isFetching && <span className="text-[10px] text-blue-500 animate-pulse">Fetching full JD…</span>}
                        {matchGrade && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gradeColor}`}>
                                Match: {matchGrade} {matchScore !== undefined ? `(${matchScore}%)` : ''}
                            </span>
                        )}
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
                        onClick={onOpen}
                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow shadow-violet-500/20 rounded-xl text-xs font-bold px-4 h-9 flex items-center gap-1.5"
                    >
                        <FileText className="h-3.5 w-3.5" />View Details
                    </Button>
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 h-9 rounded-xl border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />Apply
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

// Lightweight client-side match grade for pipeline cards
function quickMatchGrade(userProfile: UserProfile, jd: string): { grade: string; score: number } {
    const STOP = new Set(['the','and','or','in','on','at','to','for','of','with','by','a','an','is','are','was','be','not','this','that','will','have','has','do','we','you','our','your','its','work','team','role','job','position']);
    const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s+#]/g,' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
    const jdTok = new Set(tok(jd));
    const userTok = [...new Set([...userProfile.skills, ...userProfile.workExperience.map(e=>e.jobTitle)].flatMap(s => tok(s)))];
    const matched = userTok.filter(t => jdTok.has(t)).length;
    const score = userTok.length === 0 ? 50 : Math.min(Math.round((matched / Math.min(userTok.length, 20)) * 100), 100);
    const grade = score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : score >= 20 ? 'D' : 'F';
    return { grade, score };
}

const JobBoard: React.FC<JobBoardProps> = ({
    tavilyApiKey, jsearchApiKey, apiKeySet, userProfile, openSettings, onJobApplied,
    onSaveCVFromPipeline, onSaveCoverLetter, savedCVs,
}) => {
    // ── Persisted state (survives page refresh) ──
    const [activeTab, setActiveTab] = useLocalStorage<TabId>('jb_activeTab', 'jsearch');
    const [mainTab, setMainTab] = useLocalStorage<'search' | 'pipeline'>('jb_mainTab', 'search');
    const [role, setRole] = useLocalStorage<string>('jb_role', '');
    const [visaCountry, setVisaCountry] = useLocalStorage<string>('jb_visaCountry', 'UK');
    const [scholarshipLevel, setScholarshipLevel] = useLocalStorage<string>('jb_scholarshipLevel', 'Masters');
    const [searchResults, setSearchResults] = useLocalStorage<SearchResult[]>('jb_searchResults', []);
    const [pipeline, setPipeline] = useLocalStorage<ScrapedJob[]>('jb_pipeline', []);

    // ── JSearch state ──
    const [jsRole, setJsRole] = useLocalStorage<string>('jb_jsRole', '');
    const [jsCategory, setJsCategory] = useLocalStorage<string>('jb_jsCategory', '');
    const [jsCountry, setJsCountry] = useLocalStorage<string>('jb_jsCountry', 'worldwide');
    const [jsDatePosted, setJsDatePosted] = useLocalStorage<string>('jb_jsDatePosted', 'all');
    const [jsEmploymentTypes, setJsEmploymentTypes] = useLocalStorage<string[]>('jb_jsEmpTypes', []);
    const [jsRemoteOnly, setJsRemoteOnly] = useLocalStorage<boolean>('jb_jsRemote', false);
    const [jsExperience, setJsExperience] = useLocalStorage<string>('jb_jsExperience', '');
    const [jsResults, setJsResults] = useLocalStorage<JSearchJob[]>('jb_jsResults', []);
    const [jsPage, setJsPage] = useLocalStorage<number>('jb_jsPage', 1);
    const [jsTotalPages, setJsTotalPages] = useLocalStorage<number>('jb_jsTotalPages', 1);
    // ── Deduplication & cache ──
    // seenJobIds: all job IDs ever shown — never show them again across sessions
    const [seenJobIds, setSeenJobIds] = useLocalStorage<string[]>('jb_seenIds', []);
    // pageCache: raw API pages keyed by "cacheKey|page" — avoids re-fetching same page
    const [pageCache, setPageCache] = useLocalStorage<Record<string, { jobs: JSearchJob[]; fetchedAt: number }>>(
        'jb_pageCache', {}
    );
    const [isJsSearching, setIsJsSearching] = useState(false);
    const [jsError, setJsError] = useState<string | null>(null);
    const [jsAutoFetching, setJsAutoFetching] = useState(false); // silent auto-advance indicator

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
    const [remaining, setRemaining] = useState(getRemainingCalls());
    const [selectedPipelineJob, setSelectedPipelineJob] = useState<ScrapedJob | null>(null);

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

    // ─── JSearch ─────────────────────────────────────────────────────────────────
    const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
    const MIN_NEW_RESULTS = 3;                // auto-advance if fewer than this
    const MAX_AUTO_ADVANCE = 5;               // stop auto-advancing after N pages

    const buildCacheKey = useCallback((q: string) =>
        [q, jsCountry, jsDatePosted, jsEmploymentTypes.sort().join(','), jsRemoteOnly, jsExperience].join('|'),
    [jsCountry, jsDatePosted, jsEmploymentTypes, jsRemoteOnly, jsExperience]);

    const handleJSearch = useCallback(async (startPage = 1, appendMode = false) => {
        const query = jsRole.trim() || jsCategory;
        if (!query) return;
        if (!jsearchApiKey) { openSettings(); return; }
        if (startPage === 1) {
            setIsJsSearching(true);
            if (!appendMode) setJsResults([]);
        } else {
            setJsAutoFetching(true);
        }
        setJsError(null);

        const cacheKey = buildCacheKey(query);
        const seenSet = new Set(seenJobIds);
        let newResults: JSearchJob[] = [];
        let currentPage = startPage;
        let totalPagesEstimate = jsTotalPages;
        let apiCalls = 0;

        try {
            while (newResults.length < MIN_NEW_RESULTS && currentPage <= Math.max(totalPagesEstimate, MAX_AUTO_ADVANCE)) {
                const pageCacheKey = `${cacheKey}|${currentPage}`;
                const cached = pageCache[pageCacheKey];
                const isFresh = cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS;

                let pageJobs: JSearchJob[];

                if (isFresh) {
                    // Serve from cache — no API call needed
                    pageJobs = cached.jobs;
                } else {
                    // Fetch from API
                    apiCalls++;
                    const result = await jsearchSearch(jsearchApiKey, {
                        query,
                        country: jsCountry !== 'worldwide' ? jsCountry : undefined,
                        datePosted: jsDatePosted as any,
                        employmentTypes: jsEmploymentTypes.length ? jsEmploymentTypes : undefined,
                        remoteOnly: jsRemoteOnly || undefined,
                        jobRequirements: jsExperience || undefined,
                        page: currentPage,
                        numPages: 1,
                    });
                    pageJobs = result.jobs;
                    totalPagesEstimate = result.total ? Math.min(Math.ceil(result.total / 10), 10) : totalPagesEstimate;
                    setJsTotalPages(totalPagesEstimate);

                    // Cache this page
                    setPageCache(prev => ({
                        ...prev,
                        [pageCacheKey]: { jobs: pageJobs, fetchedAt: Date.now() },
                    }));
                }

                // Filter out seen jobs
                const unseen = pageJobs.filter(j => !seenSet.has(j.id));
                newResults = [...newResults, ...unseen];
                currentPage++;

                // Stop auto-advancing if we hit an empty page from the API (no more jobs)
                if (!isFresh && pageJobs.length === 0) break;
            }

            // Mark all returned jobs as seen (even ones already in results, to avoid showing them on the next search)
            if (newResults.length > 0) {
                const newIds = newResults.map(j => j.id);
                setSeenJobIds(prev => {
                    const merged = new Set([...prev, ...newIds]);
                    return Array.from(merged);
                });
            }

            setJsPage(currentPage - 1);
            if (appendMode || startPage > 1) {
                setJsResults(prev => [...prev, ...newResults]);
            } else {
                setJsResults(newResults);
            }

        } catch (e) {
            setJsError(e instanceof Error ? e.message : 'Search failed. Check your JSearch API key.');
        } finally {
            setIsJsSearching(false);
            setJsAutoFetching(false);
        }
    }, [jsRole, jsCategory, jsCountry, jsDatePosted, jsEmploymentTypes, jsRemoteOnly, jsExperience,
        jsearchApiKey, openSettings, buildCacheKey, seenJobIds, pageCache, jsTotalPages]);

    const handleJSearchReset = useCallback(() => {
        setSeenJobIds([]);
        setPageCache({});
        setJsResults([]);
        setJsPage(1);
        setJsTotalPages(1);
    }, []);

    const addJSearchJobToPipeline = useCallback((job: JSearchJob) => {
        if (pipeline.some(p => p.url === job.applyLink)) return;
        const newJob: ScrapedJob = {
            id: `jsearch-${job.id}`,
            title: job.title,
            company: job.company,
            location: job.location,
            snippet: job.description.slice(0, 300),
            jobDescription: job.description,
            url: job.applyLink,
            source: job.publisher,
            dateFound: new Date().toISOString(),
            status: 'queued',
        };
        setPipeline(prev => [newJob, ...prev]);
        setMainTab('pipeline');
    }, [pipeline]);

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

    // ─── Pipeline actions ─────────────────────────────────────────────────────────
    const removeFromPipeline = useCallback((id: string) => setPipeline(prev => prev.filter(p => p.id !== id)), []);

    const handleMarkApplied = useCallback((job: ScrapedJob) => {
        setPipeline(prev => prev.map(p => p.id === job.id ? { ...p, status: 'applied' } : p));
        onJobApplied({ roleTitle: job.title, company: job.company, savedCvName: `${job.title} @ ${job.company}` });
    }, [onJobApplied]);

    // ─── Guard: no API keys at all ────────────────────────────────────────────────
    if (!tavilyApiKey && !jsearchApiKey) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                <div className="w-20 h-20 rounded-2xl bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center">
                    <Search className="h-10 w-10 text-violet-500" />
                </div>
                <h2 className="text-2xl font-bold">Job Board</h2>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-sm">
                    Connect a job search API to unlock live listings, CV generation, and your pipeline.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 text-left max-w-lg w-full">
                    <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-4 space-y-2 bg-emerald-50/50 dark:bg-emerald-900/10">
                        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">🔎 JSearch (Recommended)</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">Real-time jobs from LinkedIn, Indeed, Glassdoor & 50+ sources. 200 free searches/month on RapidAPI.</p>
                    </div>
                    <div className="rounded-xl border border-violet-200 dark:border-violet-800 p-4 space-y-2 bg-violet-50/50 dark:bg-violet-900/10">
                        <p className="text-xs font-bold uppercase tracking-widest text-violet-500">🔍 Tavily (Alternative)</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">AI-powered web search for jobs, scholarships & visa postings. 1,000 free searches/month.</p>
                    </div>
                </div>
                <Button onClick={openSettings} className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow-lg shadow-violet-500/25 px-8 rounded-xl">
                    🔑 Connect API Key in Settings
                </Button>
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
                        {activeTab !== 'url' && activeTab !== 'jsearch' && (
                            <span className="ml-2">· Searching {activeTab === 'remote' ? PLATFORMS.remote.length : activeTab === 'kenya' ? PLATFORMS.kenya.length : activeTab === 'visa' ? PLATFORMS.visa.length : PLATFORMS.scholarships.length}+ trusted platforms · Scam sites blocked</span>
                        )}
                        {activeTab === 'jsearch' && !jsearchApiKey && (
                            <button onClick={openSettings} className="ml-2 text-emerald-600 dark:text-emerald-400 underline font-semibold">Connect JSearch API key →</button>
                        )}
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

                    {/* ─ JSearch Panel ─ */}
                    {activeTab === 'jsearch' && (
                        <div className="space-y-4">
                            {!jsearchApiKey ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-800">
                                    <div className="text-4xl">🔎</div>
                                    <div>
                                        <p className="font-bold text-zinc-800 dark:text-zinc-200">JSearch API key not connected</p>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">Real-time job listings from LinkedIn, Indeed, Glassdoor & 50+ sources.</p>
                                    </div>
                                    <Button onClick={openSettings} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 rounded-xl px-6">
                                        Connect JSearch in Settings
                                    </Button>
                                    <a href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 dark:text-emerald-400 underline">
                                        Get your free API key on RapidAPI (200 searches/month) →
                                    </a>
                                </div>
                            ) : (
                                <>
                                    {/* ── Filters ── */}
                                    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-4">
                                        {/* Row 1: Category + Role */}
                                        <div className="flex flex-wrap gap-3">
                                            <select
                                                value={jsCategory}
                                                onChange={e => { setJsCategory(e.target.value); if (!jsRole.trim()) setJsRole(''); }}
                                                className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-[200px]"
                                            >
                                                {JOB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                            </select>
                                            <div className="relative flex-1 min-w-[180px]">
                                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                                <Input
                                                    value={jsRole}
                                                    onChange={e => setJsRole(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleJSearch(1)}
                                                    placeholder={jsCategory ? `Refine: e.g. "Senior ${jsCategory}"` : 'Job title or keywords…'}
                                                    className="pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                        {/* Row 2: Country + Date + Experience */}
                                        <div className="flex flex-wrap gap-3">
                                            <select
                                                value={jsCountry}
                                                onChange={e => setJsCountry(e.target.value)}
                                                className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            >
                                                {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                            </select>
                                            <select
                                                value={jsDatePosted}
                                                onChange={e => setJsDatePosted(e.target.value)}
                                                className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            >
                                                {DATE_POSTED_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                            </select>
                                            <select
                                                value={jsExperience}
                                                onChange={e => setJsExperience(e.target.value)}
                                                className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            >
                                                {EXPERIENCE_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                            </select>
                                        </div>
                                        {/* Row 3: Employment types + Remote toggle */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {EMPLOYMENT_TYPES.map(et => {
                                                const active = jsEmploymentTypes.includes(et.value);
                                                return (
                                                    <button
                                                        key={et.value}
                                                        onClick={() => setJsEmploymentTypes(prev =>
                                                            active ? prev.filter(v => v !== et.value) : [...prev, et.value]
                                                        )}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${active
                                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                                            : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600'
                                                        }`}
                                                    >
                                                        {et.label}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                onClick={() => setJsRemoteOnly(v => !v)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${jsRemoteOnly
                                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                                    : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-emerald-300'
                                                }`}
                                            >
                                                🌐 Remote only
                                            </button>
                                        </div>
                                        {/* Row 4: Seen counter + Reset + Search */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            {seenJobIds.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                                        <span className="font-bold text-zinc-600 dark:text-zinc-300">{seenJobIds.length}</span> jobs seen &amp; skipped
                                                    </span>
                                                    <button
                                                        onClick={handleJSearchReset}
                                                        title="Clear seen history and cache — next search will show all jobs again"
                                                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold underline"
                                                    >
                                                        Reset history
                                                    </button>
                                                </div>
                                            )}
                                            <Button
                                                onClick={() => handleJSearch(1)}
                                                disabled={isJsSearching || (!jsRole.trim() && !jsCategory)}
                                                className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow shadow-emerald-500/20 rounded-xl px-6 shrink-0"
                                            >
                                                {isJsSearching
                                                    ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Searching…</>
                                                    : <><Search className="h-4 w-4 mr-2" />Search</>}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* JSearch Error */}
                                    {jsError && (
                                        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm">
                                            <AlertCircle className="h-5 w-5 shrink-0" /> {jsError}
                                        </div>
                                    )}

                                    {/* JSearch Skeletons */}
                                    {isJsSearching && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {[1, 2, 3, 4, 5, 6].map(i => (
                                                <div key={i} className="animate-pulse bg-zinc-100 dark:bg-neutral-800 rounded-2xl h-52" />
                                            ))}
                                        </div>
                                    )}

                                    {/* JSearch Empty */}
                                    {!isJsSearching && !jsError && jsResults.length === 0 && (
                                        <div className="text-center py-16 text-zinc-400">
                                            <div className="text-5xl mb-4">🔎</div>
                                            <p className="font-medium">Select a category or enter keywords, then search</p>
                                            <p className="text-sm mt-1">Real-time results from LinkedIn, Indeed, Glassdoor & 50+ sources</p>
                                            {seenJobIds.length > 0 && (
                                                <p className="text-xs mt-3 text-zinc-400">
                                                    {seenJobIds.length} previously seen jobs are being filtered.{' '}
                                                    <button onClick={handleJSearchReset} className="text-rose-500 underline">Reset history</button>
                                                    {' '}to see them again.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Auto-fetching indicator */}
                                    {jsAutoFetching && !isJsSearching && (
                                        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 px-1">
                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                            Skipping seen jobs, fetching more…
                                        </div>
                                    )}

                                    {/* JSearch Results */}
                                    {!isJsSearching && jsResults.length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">{jsResults.length}</span> new listings
                                                    {seenJobIds.length > 0 && <span> · <span className="font-semibold">{seenJobIds.length}</span> already seen &amp; skipped</span>}
                                                    {jsAutoFetching && <span className="ml-2 text-emerald-500 animate-pulse">· fetching more…</span>}
                                                </p>
                                                {seenJobIds.length > 0 && (
                                                    <button onClick={handleJSearchReset} className="text-xs text-rose-400 hover:text-rose-600 underline shrink-0">
                                                        Reset history
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {jsResults.map(job => {
                                                    const alreadyQueued = pipeline.some(p => p.url === job.applyLink);
                                                    const salary = formatSalary(job);
                                                    return (
                                                        <div key={job.id} className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-zinc-100 dark:border-neutral-700 p-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all shadow-sm hover:shadow-md flex flex-col">
                                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-emerald-600 shrink-0">
                                                                        {job.publisher}
                                                                    </span>
                                                                    {job.isRemote && (
                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 shrink-0">
                                                                            Remote
                                                                        </span>
                                                                    )}
                                                                    {job.employmentType && (
                                                                        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                                                                            {job.employmentType.replace('_', '-').toLowerCase()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <a href={job.applyLink} target="_blank" rel="noopener noreferrer"
                                                                    className="text-zinc-400 hover:text-emerald-500 transition-colors shrink-0">
                                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                                </a>
                                                            </div>
                                                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-snug mb-1 line-clamp-2">
                                                                {job.title}
                                                            </h3>
                                                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-0.5">
                                                                <Building className="h-3 w-3 shrink-0" /> {job.company}
                                                            </p>
                                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                                                                {job.location}
                                                                {job.postedAt && <span className="ml-2 text-zinc-300 dark:text-zinc-600">· {timeAgo(job.postedAt)}</span>}
                                                            </p>
                                                            {salary && (
                                                                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">💰 {salary}</p>
                                                            )}
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-3 flex-1">
                                                                {job.description.slice(0, 220)}
                                                            </p>
                                                            <Button
                                                                onClick={() => addJSearchJobToPipeline(job)}
                                                                disabled={alreadyQueued}
                                                                className={`w-full rounded-xl text-xs font-bold h-8 border-0 mt-auto ${alreadyQueued
                                                                    ? 'bg-zinc-100 dark:bg-neutral-700 text-zinc-400 cursor-not-allowed'
                                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow shadow-emerald-500/20'
                                                                }`}
                                                            >
                                                                {alreadyQueued
                                                                    ? <><CheckCircle className="h-3 w-3 mr-1" />In Pipeline</>
                                                                    : <><Plus className="h-3 w-3 mr-1" />Add to Pipeline</>}
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {jsPage < jsTotalPages && (
                                                <div className="flex justify-center pt-2">
                                                    <Button
                                                        onClick={() => handleJSearch(jsPage + 1, true)}
                                                        disabled={isJsSearching || jsAutoFetching}
                                                        className="border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 rounded-xl px-8"
                                                    >
                                                        {(isJsSearching || jsAutoFetching)
                                                            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Loading…</>
                                                            : 'Load more jobs →'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ─ Search Bar (non-URL, non-JSearch tabs) ─ */}
                    {activeTab !== 'url' && activeTab !== 'jsearch' && (
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

                    {/* Error (Tavily tabs only) */}
                    {searchError && activeTab !== 'jsearch' && (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm">
                            <AlertCircle className="h-5 w-5 shrink-0" /> {searchError}
                        </div>
                    )}

                    {/* Skeletons (Tavily tabs only) */}
                    {isSearching && activeTab !== 'jsearch' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="animate-pulse bg-zinc-100 dark:bg-neutral-800 rounded-2xl h-48" />
                            ))}
                        </div>
                    )}

                    {/* Empty */}
                    {!isSearching && !searchError && searchResults.length === 0 && activeTab !== 'url' && activeTab !== 'jsearch' && (
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

                    {/* Results grid (Tavily tabs only) */}
                    {searchResults.length > 0 && activeTab !== 'jsearch' && (
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

            {/* ══ PIPELINE DETAIL MODAL ══ */}
            {selectedPipelineJob && (
                <JobPipelineModal
                    job={selectedPipelineJob}
                    userProfile={userProfile}
                    apiKeySet={apiKeySet}
                    onClose={() => setSelectedPipelineJob(null)}
                    onSaveCV={onSaveCVFromPipeline}
                    onSaveCoverLetter={onSaveCoverLetter}
                    onMarkApplied={() => handleMarkApplied(selectedPipelineJob)}
                    openSettings={openSettings}
                />
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
                                {pipeline.length} job{pipeline.length !== 1 ? 's' : ''} queued · Click <strong>View Details</strong> to pick a template, generate a tailored CV, cover letter, and see your match score.
                            </p>
                            <div className="space-y-3">
                                {pipeline.map(job => {
                                    const { grade, score } = quickMatchGrade(userProfile, job.jobDescription || job.snippet);
                                    return (
                                        <PipelineCard
                                            key={job.id}
                                            job={job}
                                            isFetching={fetchingId === job.id}
                                            matchGrade={grade}
                                            matchScore={score}
                                            onOpen={() => setSelectedPipelineJob(job)}
                                            onRemove={() => removeFromPipeline(job.id)}
                                        />
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default JobBoard;
