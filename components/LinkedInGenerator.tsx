import React, { useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { generateLinkedInProfile, LinkedInProfileResult } from '../services/geminiService';

interface LinkedInGeneratorProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button
            onClick={handleCopy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5"
        >
            {copied ? (
                <><svg className="h-3.5 w-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Copied!</>
            ) : (
                <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>{label}</>
            )}
        </button>
    );
};

const Section: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/80">
            <span className="text-base">{icon}</span>
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const LinkedInGenerator: React.FC<LinkedInGeneratorProps> = ({ userProfile, apiKeySet, openSettings }) => {
    const [targetRole, setTargetRole] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<LinkedInProfileResult | null>(null);
    const [loadingMsg, setLoadingMsg] = useState('Generating...');

    const phases = [
        'Analyzing your profile...',
        'Crafting your headline...',
        'Writing your About section...',
        'Building your skills list...',
        'Finalizing profile package...',
    ];

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsGenerating(true);
        setError(null);
        setResult(null);

        let phaseIdx = 0;
        setLoadingMsg(phases[0]);
        const interval = setInterval(() => {
            phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
            setLoadingMsg(phases[phaseIdx]);
        }, 2200);

        try {
            const res = await generateLinkedInProfile(userProfile, targetRole || undefined);
            setResult(res);
        } catch (err: any) {
            setError(err?.message || 'Failed to generate LinkedIn profile. Please try again.');
        } finally {
            clearInterval(interval);
            setIsGenerating(false);
        }
    }, [userProfile, targetRole, apiKeySet, openSettings]);

    const hasProfile = userProfile.personalInfo.name && (
        userProfile.workExperience.length > 0 || userProfile.skills.length > 0
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">LinkedIn Profile Generator</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">AI-crafted headline, About section, skills & post — ready to copy-paste into LinkedIn.</p>
                    </div>
                </div>
            </div>

            {/* Profile warning */}
            {!hasProfile && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                    Your profile seems empty. Fill in your name, experience, and skills in the Profile section for best results.
                </div>
            )}

            {/* Input card */}
            <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-6">
                <div className="mb-5">
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        Target Role or Industry <span className="font-normal text-zinc-400">(optional)</span>
                    </label>
                    <input
                        type="text"
                        value={targetRole}
                        onChange={e => setTargetRole(e.target.value)}
                        placeholder="e.g. Senior Product Manager, FinTech, AI Engineering..."
                        className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={isGenerating}
                    />
                    <p className="text-xs text-zinc-400 mt-1.5">Adding a target role tailors the headline and skills for recruiter searches in that field.</p>
                </div>

                {!apiKeySet && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                        An API key is required. <button onClick={openSettings} className="font-bold underline">Open Settings →</button>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{error}</div>
                )}

                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !apiKeySet}
                    className="w-full py-3 px-6 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            {loadingMsg}
                        </>
                    ) : (
                        <>
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                            Generate LinkedIn Profile Package
                        </>
                    )}
                </button>
            </div>

            {/* Results */}
            {result && (
                <div className="space-y-4">
                    {/* Headline */}
                    <Section title="LinkedIn Headline" icon="✏️">
                        <div className="flex items-start justify-between gap-4">
                            <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200 flex-1 leading-snug">{result.headline}</p>
                            <CopyButton text={result.headline} />
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">{result.headline.length}/220 characters</p>
                    </Section>

                    {/* About */}
                    <Section title="About Section" icon="📝">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{result.about.length} characters — copy and paste into LinkedIn's About field</p>
                            <CopyButton text={result.about} label="Copy About" />
                        </div>
                        <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg p-4 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed border border-zinc-200 dark:border-neutral-700 max-h-72 overflow-y-auto">
                            {result.about}
                        </div>
                    </Section>

                    {/* Achievement Bullets */}
                    <Section title="Featured Achievement Bullets" icon="🏆">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">Add these to your LinkedIn Featured section or profile intro as highlights.</p>
                        <div className="space-y-2">
                            {result.summaryBullets.map((bullet, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-neutral-800 rounded-lg border border-zinc-200 dark:border-neutral-700">
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{bullet}</p>
                                    <CopyButton text={bullet} />
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* Skills */}
                    <Section title="LinkedIn Skills to Add" icon="🎯">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">Add these skills in order — top ones are most searchable for your role. LinkedIn allows up to 50.</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {result.skills.map((skill, i) => (
                                <span key={i} className={`text-xs font-medium px-3 py-1 rounded-full border ${i < 5 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-zinc-100 dark:bg-neutral-700 border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-400'}`}>
                                    {i < 5 && <span className="mr-1">★</span>}{skill}
                                </span>
                            ))}
                        </div>
                        <CopyButton text={result.skills.join(', ')} label="Copy All Skills" />
                    </Section>

                    {/* Featured Post */}
                    <Section title="Ready-to-Post LinkedIn Update" icon="📣">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">A high-engagement post you can use now or adapt for your next milestone.</p>
                            <CopyButton text={result.featuredPost} label="Copy Post" />
                        </div>
                        <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg p-4 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed border border-zinc-200 dark:border-neutral-700">
                            {result.featuredPost}
                        </div>
                    </Section>

                    {/* Connection Message */}
                    <Section title="Connection Request Template" icon="🤝">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Use when reaching out to recruiters, hiring managers, or industry peers. Replace [NAME] with their first name.</p>
                            <CopyButton text={result.connectionMessage} label="Copy Message" />
                        </div>
                        <div className="bg-zinc-50 dark:bg-neutral-800 rounded-lg p-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed border border-zinc-200 dark:border-neutral-700 italic">
                            {result.connectionMessage}
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">{result.connectionMessage.length}/300 characters</p>
                    </Section>

                    {/* Profile Tips */}
                    <Section title="Profile Improvement Tips" icon="💡">
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">Based on your profile — specific actions to boost recruiter visibility.</p>
                        <ol className="space-y-2.5">
                            {result.profileTips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                    {tip}
                                </li>
                            ))}
                        </ol>
                    </Section>

                    {/* Regenerate */}
                    <div className="text-center">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                            Regenerate with different phrasing →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LinkedInGenerator;
