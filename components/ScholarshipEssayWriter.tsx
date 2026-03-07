import React, { useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Sparkles, Download, ClipboardCopy, Edit, BookOpen, FileText, AlertTriangle, CheckCircle } from './icons';
import { generateScholarshipEssay } from '../services/geminiService';
import { downloadCoverLetterAsPDF } from '../services/pdfService';

interface EssayType {
    id: string;
    label: string;
    emoji: string;
    description: string;
    tips: string[];
    wordCount: string;
    promptHint: string;
}

const essayTypes: EssayType[] = [
    {
        id: 'personal-statement',
        label: 'Personal Statement',
        emoji: '📝',
        description: 'Why you deserve this scholarship — your story, motivations, and goals.',
        tips: ['Connect personal experiences to academic goals', 'Show self-awareness and growth', 'Be specific about why this scholarship/program'],
        wordCount: '500–800 words',
        promptHint: 'Write about your background, motivations, academic journey, and why you are a strong candidate for this scholarship.',
    },
    {
        id: 'research-proposal',
        label: 'Research Proposal',
        emoji: '🔬',
        description: 'For PhD, postdoc, or research grants — your research question and methodology.',
        tips: ['Clearly state the research problem and gap', 'Explain methodology and expected outcomes', 'Show how it advances the field'],
        wordCount: '800–1500 words',
        promptHint: 'Write a compelling research proposal describing the research question, background, methodology, expected results, and broader impact.',
    },
    {
        id: 'statement-of-purpose',
        label: 'Statement of Purpose',
        emoji: '🎯',
        description: 'For graduate school applications — why this program, why you, future goals.',
        tips: ['Why this specific program/institution', 'Link past experience to future goals', 'Mention specific faculty or research groups'],
        wordCount: '600–1000 words',
        promptHint: 'Write a statement of purpose explaining your academic background, specific reasons for choosing this program, research or professional interests, and career goals.',
    },
    {
        id: 'leadership-essay',
        label: 'Leadership Essay',
        emoji: '🌟',
        description: 'For Chevening, Commonwealth, and leadership scholarships.',
        tips: ['Use a specific leadership story (STAR format)', 'Show impact and lessons learned', 'Demonstrate potential for future leadership'],
        wordCount: '500–700 words',
        promptHint: 'Write a compelling essay about a significant leadership experience, demonstrating your ability to influence, inspire, and drive change in your community or field.',
    },
    {
        id: 'diversity-statement',
        label: 'Diversity Statement',
        emoji: '🌍',
        description: 'How your background and experiences contribute to diversity.',
        tips: ['Reflect on unique perspectives you bring', 'Connect personal experience to broader impact', 'Show how you will contribute to community'],
        wordCount: '400–600 words',
        promptHint: 'Write a diversity statement describing your unique background, perspective, or experiences, and how they will contribute to and enrich the academic or professional community.',
    },
    {
        id: 'development-impact',
        label: 'Development Impact Essay',
        emoji: '🌱',
        description: 'For Commonwealth, government, and development-focused scholarships.',
        tips: ['Link study to home country development goals', 'Demonstrate commitment to return and contribute', 'Show understanding of national development challenges'],
        wordCount: '500–700 words',
        promptHint: 'Write an essay explaining how your proposed studies will contribute to the development of your home country, addressing specific challenges and your plan to apply your skills upon return.',
    },
    {
        id: 'why-scholarship',
        label: '"Why This Scholarship" Essay',
        emoji: '💡',
        description: 'Specific essay on why this particular scholarship fits your goals.',
        tips: ['Research the scholarship values deeply', 'Align your goals with their mission', 'Show genuine understanding of what they fund'],
        wordCount: '300–500 words',
        promptHint: 'Write an essay explaining why you are applying for this specific scholarship, demonstrating deep knowledge of its values, mission, and what makes it the right fit for your goals.',
    },
    {
        id: 'cover-letter-academic',
        label: 'Academic Cover Letter',
        emoji: '✉️',
        description: 'Professional cover letter for academic positions or grant applications.',
        tips: ['Address the committee/supervisor directly', 'Reference specific requirements from the call', 'Be formal but personable'],
        wordCount: '400–600 words',
        promptHint: 'Write a professional academic cover letter introducing yourself, your qualifications, and your specific interest in this opportunity, referencing details from the scholarship or program description.',
    },
];

interface ScholarshipEssayWriterProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
}

const ScholarshipEssayWriter: React.FC<ScholarshipEssayWriterProps> = ({ userProfile, apiKeySet, openSettings }) => {
    const [selectedType, setSelectedType] = useState<EssayType>(essayTypes[0]);
    const [scholarshipDescription, setScholarshipDescription] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [desiredWordCount, setDesiredWordCount] = useState('600');
    const [generatedEssay, setGeneratedEssay] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) {
            setError('Please set your Gemini API key in Settings to generate essays.');
            openSettings();
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const essay = await generateScholarshipEssay({
                profile: userProfile,
                essayType: selectedType.id,
                essayLabel: selectedType.label,
                scholarshipDescription,
                additionalContext,
                wordCount: parseInt(desiredWordCount) || 600,
                promptHint: selectedType.promptHint,
            });
            setGeneratedEssay(essay);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(`Essay generation failed: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    }, [apiKeySet, openSettings, userProfile, selectedType, scholarshipDescription, additionalContext, desiredWordCount]);

    const handleCopy = () => {
        if (!generatedEssay) return;
        navigator.clipboard.writeText(generatedEssay).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDownload = () => {
        if (!generatedEssay) return;
        const name = userProfile.personalInfo.name.replace(/\s+/g, '_');
        downloadCoverLetterAsPDF(generatedEssay, `${name}_${selectedType.id}.pdf`, 'professional');
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="h-7 w-7" />
                    <h2 className="text-2xl font-bold">Scholarship Essay Writer</h2>
                </div>
                <p className="text-teal-100 text-sm leading-relaxed max-w-2xl">
                    Generate compelling, personalized scholarship essays using your profile. AI writes in a natural, human voice tailored to each essay type.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left: Configuration */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Essay Type Selector */}
                    <div>
                        <Label className="text-base font-bold mb-3 block">Essay Type</Label>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                            {essayTypes.map(type => {
                                const isSelected = selectedType.id === type.id;
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => setSelectedType(type)}
                                        className={`
                      w-full text-left p-3 rounded-xl border-2 transition-all duration-150
                      ${isSelected
                                                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-sm'
                                                : 'border-zinc-200 dark:border-neutral-700 hover:border-teal-300 dark:hover:border-teal-700 bg-white dark:bg-neutral-800/40'
                                            }
                    `}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{type.emoji}</span>
                                            <div>
                                                <p className={`text-sm font-semibold ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                                    {type.label}
                                                </p>
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{type.wordCount} · {type.description.substring(0, 50)}...</p>
                                            </div>
                                            {isSelected && <CheckCircle className="h-4 w-4 text-teal-500 ml-auto flex-shrink-0" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Word Count */}
                    <div>
                        <Label htmlFor="word-count" className="text-sm font-semibold mb-1 block">Target Word Count</Label>
                        <select
                            id="word-count"
                            value={desiredWordCount}
                            onChange={e => setDesiredWordCount(e.target.value)}
                            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="300">~300 words (Short)</option>
                            <option value="500">~500 words (Standard)</option>
                            <option value="600">~600 words (Recommended)</option>
                            <option value="800">~800 words (Detailed)</option>
                            <option value="1000">~1000 words (Long)</option>
                            <option value="1500">~1500 words (Research proposal)</option>
                        </select>
                    </div>
                </div>

                {/* Right: Inputs & Output */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Tips for selected type */}
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-200 mb-1.5">✨ Tips for {selectedType.label}</p>
                        <ul className="space-y-1">
                            {selectedType.tips.map((tip, i) => (
                                <li key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                                    <span className="mt-0.5 text-amber-500">•</span> {tip}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Scholarship/Program Description */}
                    <div>
                        <Label htmlFor="scholarship-desc" className="text-sm font-semibold mb-1.5 block">
                            Scholarship / Program Description
                            <span className="ml-2 text-xs font-normal text-zinc-400">(paste requirements, criteria, or values)</span>
                        </Label>
                        <Textarea
                            id="scholarship-desc"
                            value={scholarshipDescription}
                            onChange={e => setScholarshipDescription(e.target.value)}
                            placeholder="Paste the scholarship call, eligibility criteria, values, or any specific requirements here..."
                            rows={5}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Additional personal context */}
                    <div>
                        <Label htmlFor="additional-context" className="text-sm font-semibold mb-1.5 block">
                            Additional Context
                            <span className="ml-2 text-xs font-normal text-zinc-400">(optional — specific stories, achievements, or points to include)</span>
                        </Label>
                        <Textarea
                            id="additional-context"
                            value={additionalContext}
                            onChange={e => setAdditionalContext(e.target.value)}
                            placeholder="Any specific achievements, stories, or talking points you want included. E.g.: 'I founded a community recycling programme in 2022 that served 500 households...'"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    {/* Generate button */}
                    <Button onClick={handleGenerate} disabled={isLoading || !apiKeySet} size="lg" className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white border-0">
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Writing your {selectedType.label}...
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-5 w-5 mr-2" />
                                Generate {selectedType.emoji} {selectedType.label}
                            </>
                        )}
                    </Button>

                    {!apiKeySet && (
                        <p className="text-amber-600 dark:text-amber-400 text-xs text-center">
                            ⚠️ Set your Gemini API key in <button onClick={openSettings} className="underline font-semibold">Settings</button> to enable generation.
                        </p>
                    )}
                </div>
            </div>

            {/* Generated Essay Output */}
            {generatedEssay && (
                <div className="bg-white dark:bg-neutral-800/50 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-teal-600" />
                            <div>
                                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{selectedType.emoji} {selectedType.label}</h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    ~{generatedEssay.split(/\s+/).filter(Boolean).length} words · AI generated, human-sounding
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setIsEditing(!isEditing)}>
                                <Edit className="h-4 w-4 mr-1.5" />
                                {isEditing ? 'Done Editing' : 'Edit'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleCopy}>
                                <ClipboardCopy className="h-4 w-4 mr-1.5" />
                                {copied ? '✓ Copied!' : 'Copy'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleDownload}>
                                <Download className="h-4 w-4 mr-1.5" />
                                PDF
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isLoading}>
                                <Sparkles className="h-4 w-4 mr-1.5" />
                                Regenerate
                            </Button>
                        </div>
                    </div>
                    <div
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        onBlur={e => setGeneratedEssay(e.currentTarget.innerText)}
                        className={`p-6 sm:p-8 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-[1.9] text-sm font-serif max-w-3xl mx-auto min-h-[300px]
              ${isEditing ? 'ring-2 ring-inset ring-teal-400 focus:outline-none bg-teal-50/30 dark:bg-teal-900/10 rounded-lg m-4 p-6' : ''}
            `}
                    >
                        {generatedEssay}
                    </div>
                    <div className="px-6 pb-4 flex items-center gap-2">
                        <div className="h-1.5 w-1.5 bg-teal-500 rounded-full" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            Written using your profile · Humanized to avoid AI detection · Review and personalize before submitting
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScholarshipEssayWriter;
