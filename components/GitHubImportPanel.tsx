import React, { useState, useCallback } from 'react';
import { Project, UserProfile, CVData } from '../types';
import { generateCVFromGitHub, GitHubRepoForCV } from '../services/geminiService';
import { Button } from './ui/Button';
import { RefreshCw, CheckCircle, AlertCircle, ExternalLink, Sparkles } from './icons';

// ── Icons ────────────────────────────────────────────────────────────────────

const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

const StarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    homepage: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    topics: string[];
    updated_at: string;
    fork: boolean;
    private: boolean;
}

interface GitHubUser {
    login: string;
    name: string | null;
    avatar_url: string;
    bio: string | null;
    public_repos: number;
    followers: number;
    following: number;
    html_url: string;
}

interface GitHubImportPanelProps {
    onProjectsImported: (projects: Project[], extraSkills: string[]) => void;
    currentProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
    onGenerateCV?: (cv: CVData) => void;
    jobDescription?: string;
}

const AI_STEPS = [
    'Analysing your repositories…',
    'Extracting languages & frameworks…',
    'Crafting project descriptions with real links…',
    'Writing impact-driven experience bullets…',
    'Optimising skills for ATS…',
    'Finalising your best-possible CV…',
];

// ── Component ─────────────────────────────────────────────────────────────────

const GitHubImportPanel: React.FC<GitHubImportPanelProps> = ({
    onProjectsImported,
    currentProfile,
    apiKeySet,
    openSettings,
    onGenerateCV,
    jobDescription,
}) => {
    const [username, setUsername] = useState('');
    const [pat, setPat] = useState('');
    const [showPat, setShowPat] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [imported, setImported] = useState(false);
    const [showOnlyFeatured, setShowOnlyFeatured] = useState(true);

    const [generatingCV, setGeneratingCV] = useState(false);
    const [aiStep, setAiStep] = useState(0);
    const [cvGenerated, setCvGenerated] = useState(false);
    const [cvError, setCvError] = useState<string | null>(null);

    const headers: HeadersInit = pat.trim()
        ? { Authorization: `Bearer ${pat.trim()}`, 'X-GitHub-Api-Version': '2022-11-28' }
        : { 'X-GitHub-Api-Version': '2022-11-28' };

    const handleFetch = useCallback(async () => {
        const uname = username.trim();
        if (!uname) return;
        setLoading(true);
        setError(null);
        setRepos([]);
        setGhUser(null);
        setSelected(new Set());
        setImported(false);
        setCvGenerated(false);
        setCvError(null);

        try {
            const [userRes, reposRes] = await Promise.all([
                fetch(`https://api.github.com/users/${uname}`, { headers }),
                fetch(`https://api.github.com/users/${uname}/repos?sort=updated&per_page=100&type=owner`, { headers }),
            ]);

            if (!userRes.ok) {
                if (userRes.status === 404) throw new Error(`GitHub user "${uname}" not found.`);
                if (userRes.status === 403) throw new Error('GitHub rate limit hit. Add a Personal Access Token to continue.');
                throw new Error(`GitHub API error: ${userRes.status}`);
            }

            const userData: GitHubUser = await userRes.json();
            const reposData: GitHubRepo[] = await reposRes.json();

            setGhUser(userData);

            const filtered = reposData
                .filter(r => !r.fork)
                .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

            setRepos(filtered);

            const topIds = new Set(filtered.slice(0, 6).map(r => r.id));
            setSelected(topIds);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch GitHub data.');
        } finally {
            setLoading(false);
        }
    }, [username, pat]);

    const toggleSelect = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleImport = useCallback(() => {
        const selectedRepos = repos.filter(r => selected.has(r.id));

        const newProjects: Project[] = selectedRepos.map(repo => ({
            id: `gh_${repo.id}_${Date.now()}`,
            name: repo.name.replace(/-/g, ' ').replace(/_/g, ' '),
            description: [
                repo.description || '',
                repo.topics.length > 0 ? `Tech: ${repo.topics.slice(0, 5).join(', ')}` : '',
                repo.language ? `Built with ${repo.language}` : '',
                repo.stargazers_count > 0 ? `⭐ ${repo.stargazers_count} stars` : '',
            ].filter(Boolean).join(' | '),
            link: repo.html_url,
        }));

        const langSet = new Set<string>();
        const topicSet = new Set<string>();
        selectedRepos.forEach(r => {
            if (r.language) langSet.add(r.language);
            r.topics.slice(0, 3).forEach(t => topicSet.add(t));
        });

        const extraSkills = [
            ...Array.from(langSet),
            ...Array.from(topicSet).filter(t => !Array.from(langSet).some(l => l.toLowerCase() === t.toLowerCase())),
        ].slice(0, 15);

        onProjectsImported(newProjects, extraSkills);
        setImported(true);
    }, [repos, selected, onProjectsImported]);

    const handleGenerateCV = useCallback(async () => {
        if (!apiKeySet) {
            openSettings();
            return;
        }
        if (!onGenerateCV) return;

        const selectedRepos = repos.filter(r => selected.has(r.id));
        if (selectedRepos.length === 0) return;

        setGeneratingCV(true);
        setCvError(null);
        setAiStep(0);

        const stepInterval = setInterval(() => {
            setAiStep(prev => (prev < AI_STEPS.length - 1 ? prev + 1 : prev));
        }, 1800);

        try {
            const repoData: GitHubRepoForCV[] = selectedRepos.map(r => ({
                id: r.id,
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                html_url: r.html_url,
                homepage: r.homepage,
                language: r.language,
                stargazers_count: r.stargazers_count,
                forks_count: r.forks_count,
                topics: r.topics,
                updated_at: r.updated_at,
            }));

            const cv = await generateCVFromGitHub(
                repoData,
                currentProfile,
                username.trim(),
                jobDescription
            );

            clearInterval(stepInterval);
            setAiStep(AI_STEPS.length - 1);
            setCvGenerated(true);
            onGenerateCV(cv);
        } catch (e) {
            clearInterval(stepInterval);
            setCvError(e instanceof Error ? e.message : 'Failed to generate CV from GitHub data.');
        } finally {
            setGeneratingCV(false);
        }
    }, [repos, selected, currentProfile, username, apiKeySet, openSettings, onGenerateCV, jobDescription]);

    const displayedRepos = showOnlyFeatured && repos.length > 10 ? repos.slice(0, 10) : repos;

    const getLangColor = (lang: string | null) => {
        const colors: Record<string, string> = {
            TypeScript: 'bg-blue-100 text-blue-700', JavaScript: 'bg-yellow-100 text-yellow-700',
            Python: 'bg-emerald-100 text-emerald-700', Rust: 'bg-orange-100 text-orange-700',
            Go: 'bg-cyan-100 text-cyan-700', Java: 'bg-red-100 text-red-700',
            'C++': 'bg-purple-100 text-purple-700', C: 'bg-zinc-200 text-zinc-700',
            Ruby: 'bg-rose-100 text-rose-700', Swift: 'bg-orange-100 text-orange-800',
            Kotlin: 'bg-violet-100 text-violet-700', Dart: 'bg-sky-100 text-sky-700',
        };
        return colors[lang || ''] || 'bg-zinc-100 text-zinc-600';
    };

    return (
        <div className="space-y-5">
            {/* Header info card */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/5 dark:bg-zinc-100/5 border border-zinc-200 dark:border-neutral-700">
                <div className="p-2.5 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex-shrink-0">
                    <GitHubIcon className="h-5 w-5 text-white dark:text-zinc-900" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import from GitHub</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Fetch your GitHub repositories, select the best ones, and import them as Projects into your profile.
                        Languages and topics are also extracted as skills — perfect for the <strong>SWE Elite</strong> template.
                        Then let AI read your actual repos and generate the best possible CV with real project links.
                    </p>
                </div>
            </div>

            {/* Search form */}
            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 space-y-4">
                <div>
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
                        GitHub Username
                    </label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-semibold text-sm">@</span>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                                placeholder="your-github-username"
                                className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 text-zinc-800 dark:text-zinc-200"
                            />
                        </div>
                        <Button
                            onClick={handleFetch}
                            disabled={loading || !username.trim()}
                            className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 border-0 rounded-xl px-5 whitespace-nowrap"
                        >
                            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Fetch Repos'}
                        </Button>
                    </div>
                </div>

                {/* Optional PAT */}
                <div>
                    <button
                        onClick={() => setShowPat(v => !v)}
                        className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1"
                    >
                        🔑 {showPat ? 'Hide' : 'Add'} Personal Access Token (for private repos / higher rate limits)
                    </button>
                    {showPat && (
                        <input
                            type="password"
                            value={pat}
                            onChange={e => setPat(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            className="mt-2 w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400 text-zinc-800 dark:text-zinc-200"
                        />
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {/* GitHub user profile card */}
            {ghUser && (
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 flex items-center gap-4">
                    <img src={ghUser.avatar_url} alt={ghUser.login} className="w-12 h-12 rounded-xl" />
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{ghUser.name || ghUser.login}</p>
                        {ghUser.bio && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{ghUser.bio}</p>}
                        <div className="flex gap-4 mt-1">
                            <span className="text-xs text-zinc-500"><strong className="text-zinc-700 dark:text-zinc-300">{ghUser.public_repos}</strong> repos</span>
                            <span className="text-xs text-zinc-500"><strong className="text-zinc-700 dark:text-zinc-300">{ghUser.followers}</strong> followers</span>
                        </div>
                    </div>
                    <a href={ghUser.html_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-semibold">
                        <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                </div>
            )}

            {/* Repos list */}
            {repos.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                                {repos.length} repos found — {selected.size} selected
                            </h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Select the repos you want to import as projects.</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSelected(new Set(repos.map(r => r.id)))}
                                className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                            >
                                All
                            </button>
                            <span className="text-zinc-300 dark:text-neutral-600">|</span>
                            <button
                                onClick={() => setSelected(new Set())}
                                className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                            >
                                None
                            </button>
                        </div>
                    </div>

                    {/* Repo cards */}
                    <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                        {displayedRepos.map(repo => (
                            <div
                                key={repo.id}
                                onClick={() => toggleSelect(repo.id)}
                                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${selected.has(repo.id)
                                    ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-neutral-700'
                                    : 'border-zinc-100 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-500'
                                    }`}
                            >
                                <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${selected.has(repo.id) ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100' : 'border-zinc-300 dark:border-neutral-500'}`}>
                                    {selected.has(repo.id) && (
                                        <svg className="w-2.5 h-2.5 text-white dark:text-zinc-900" viewBox="0 0 10 10" fill="none">
                                            <path d="M1.5 5L4 7.5L8.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{repo.name}</span>
                                        {repo.language && (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getLangColor(repo.language)}`}>
                                                {repo.language}
                                            </span>
                                        )}
                                        {repo.stargazers_count > 0 && (
                                            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-semibold">
                                                <StarIcon className="h-2.5 w-2.5" />{repo.stargazers_count}
                                            </span>
                                        )}
                                        {repo.homepage && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full font-medium">live</span>
                                        )}
                                    </div>
                                    {repo.description && (
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{repo.description}</p>
                                    )}
                                    {repo.topics.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {repo.topics.slice(0, 5).map(t => (
                                                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-400 rounded-full font-medium">{t}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <a
                                            href={repo.html_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-0.5 font-medium"
                                        >
                                            <GitHubIcon className="h-3 w-3" /> GitHub
                                        </a>
                                        {repo.homepage && (
                                            <a
                                                href={repo.homepage}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="text-[10px] text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-0.5 font-medium"
                                            >
                                                <ExternalLink className="h-3 w-3" /> Live
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {repos.length > 10 && (
                            <button
                                onClick={() => setShowOnlyFeatured(v => !v)}
                                className="w-full text-xs text-zinc-500 dark:text-zinc-400 font-semibold py-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                {showOnlyFeatured ? `Show all ${repos.length} repos` : 'Show fewer repos'}
                            </button>
                        )}
                    </div>

                    {/* ── Step 1: Import to Profile ── */}
                    {!imported ? (
                        <div className="flex flex-wrap gap-3 items-center pt-2">
                            <Button
                                onClick={handleImport}
                                disabled={selected.size === 0}
                                className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 border-0 rounded-xl px-6 shadow shadow-zinc-900/10"
                            >
                                <GitHubIcon className="h-4 w-4 mr-2" />
                                Import {selected.size} Project{selected.size !== 1 ? 's' : ''} to Profile
                            </Button>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Languages and topics will also be added to your skills list.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Import success */}
                            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                                <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                                <div>
                                    <p className="font-bold text-emerald-800 dark:text-emerald-200 text-sm">Imported successfully!</p>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                        {selected.size} project{selected.size !== 1 ? 's' : ''} added to your profile with GitHub links. Use the <strong>SWE Elite</strong> template for the best presentation.
                                    </p>
                                </div>
                            </div>

                            {/* ── Step 2: AI Generate CV ── */}
                            {onGenerateCV && !cvGenerated && (
                                <div className="bg-gradient-to-br from-[#F8F7F4] to-violet-50 dark:from-[#1B2B4B]/10 dark:to-[#1B2B4B]/10 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-[#1B2B4B] rounded-xl flex-shrink-0">
                                            <Sparkles className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-[#1B2B4B] dark:text-[#C9A84C]/70 text-sm">Generate Your Best CV with AI</h4>
                                            <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C]/80 mt-1">
                                                The AI reads your actual repos — descriptions, languages, topics, and links — and generates a complete, optimised CV.
                                                Every project gets its real GitHub link (and live URL if available). Skills are extracted from what you actually built.
                                            </p>
                                        </div>
                                    </div>

                                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-[#1B2B4B] dark:text-[#C9A84C]/80">
                                        {[
                                            '✓ Real GitHub links on every project',
                                            '✓ Live demo URLs included',
                                            '✓ Skills from actual languages & topics',
                                            '✓ AI-written impact descriptions',
                                            '✓ ATS-optimised bullets',
                                            '✓ Works with your existing experience',
                                        ].map(f => <li key={f} className="font-medium">{f}</li>)}
                                    </ul>

                                    {generatingCV ? (
                                        <div className="space-y-2 pt-1">
                                            <div className="flex items-center gap-2">
                                                <RefreshCw className="h-4 w-4 animate-spin text-[#1B2B4B]" />
                                                <p className="text-sm font-semibold text-[#1B2B4B] dark:text-[#C9A84C]/80">
                                                    {AI_STEPS[aiStep]}
                                                </p>
                                            </div>
                                            <div className="w-full bg-[#C9A84C]/20 dark:bg-[#1B2B4B]/30 rounded-full h-1.5">
                                                <div
                                                    className="bg-[#1B2B4B] h-1.5 rounded-full transition-all duration-700"
                                                    style={{ width: `${((aiStep + 1) / AI_STEPS.length) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-3 items-center pt-1">
                                            <Button
                                                onClick={handleGenerateCV}
                                                disabled={selected.size === 0}
                                                className="bg-[#1B2B4B] hover:bg-[#152238] text-white border-0 rounded-xl px-6 shadow shadow-[#1B2B4B]/20"
                                            >
                                                <Sparkles className="h-4 w-4 mr-2" />
                                                Generate Best CV from {selected.size} Repos
                                            </Button>
                                            {!apiKeySet && (
                                                <button
                                                    onClick={openSettings}
                                                    className="text-xs text-amber-600 dark:text-amber-400 font-semibold underline"
                                                >
                                                    Set API key first →
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {cvError && (
                                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {cvError}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CV generation success */}
                            {cvGenerated && (
                                <div className="flex items-center gap-3 p-4 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 border border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 rounded-xl">
                                    <Sparkles className="h-5 w-5 text-[#C9A84C] flex-shrink-0" />
                                    <div>
                                        <p className="font-bold text-[#1B2B4B] dark:text-[#C9A84C]/80 text-sm">CV generated from your GitHub!</p>
                                        <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C]">
                                            Your new CV is ready in the CV Generator — complete with real project links and AI-optimised descriptions.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GitHubImportPanel;
