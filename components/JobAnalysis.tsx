import React, { useState, useEffect, useMemo } from 'react';
import { analyzeJobDescriptionForKeywords } from '../services/geminiService';
import { JobAnalysisResult } from '../types';
import { CheckCircle } from './icons';

interface JobAnalysisProps {
    jobDescription: string;
    cvTextContent: string;
    apiKeySet: boolean;
}

const JobAnalysis: React.FC<JobAnalysisProps> = ({ jobDescription, cvTextContent, apiKeySet }) => {
    const [analysis, setAnalysis] = useState<JobAnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (jobDescription.trim().length > 50 && apiKeySet) {
            const handler = setTimeout(() => {
                setIsLoading(true);
                setError(null);
                setAnalysis(null);
                analyzeJobDescriptionForKeywords(jobDescription)
                    .then(setAnalysis)
                    .catch(err => setError(err instanceof Error ? err.message : "Analysis failed"))
                    .finally(() => setIsLoading(false));
            }, 1000); // Debounce

            return () => clearTimeout(handler);
        } else {
            setAnalysis(null);
            setError(null);
        }
    }, [jobDescription, apiKeySet]);

    const matchedKeywords = useMemo(() => {
        if (!analysis || !cvTextContent) return new Set();
        const matches = new Set<string>();
        analysis.keywords.forEach(keyword => {
            if (cvTextContent.includes(keyword.toLowerCase())) {
                matches.add(keyword);
            }
        });
        return matches;
    }, [analysis, cvTextContent]);
    
    const matchedSkills = useMemo(() => {
        if (!analysis || !cvTextContent) return new Set();
        const matches = new Set<string>();
        analysis.skills.forEach(skill => {
            if (cvTextContent.includes(skill.toLowerCase())) {
                matches.add(skill);
            }
        });
        return matches;
    }, [analysis, cvTextContent]);

    if (!jobDescription.trim() || jobDescription.length < 50) {
        return null;
    }

    if (!apiKeySet) {
        return (
            <div className="mt-6 p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <p className="text-sm text-amber-700 dark:text-amber-300">Job analysis requires a Gemini API key. Please add one in the settings.</p>
            </div>
        )
    }

    return (
        <div className="mt-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <h3 className="text-lg font-semibold mb-2">Job Analysis</h3>
            {isLoading && (
                <div className="flex items-center text-sm text-slate-500">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Analyzing job description...
                </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {analysis && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h4 className="font-semibold text-sm mb-2">Top Keywords</h4>
                        <div className="flex flex-wrap gap-2">
                            {analysis.keywords.map(kw => {
                                const isMatched = matchedKeywords.has(kw);
                                return (
                                    <span key={kw} className={`flex items-center text-xs font-medium px-2.5 py-1 rounded-full transition-all ${isMatched ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'}`}>
                                      {isMatched && <CheckCircle className="h-3 w-3 mr-1"/>}
                                      {kw}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                     <div>
                        <h4 className="font-semibold text-sm mb-2">Essential Skills</h4>
                         <div className="flex flex-wrap gap-2">
                            {analysis.skills.map(skill => {
                                const isMatched = matchedSkills.has(skill);
                                return (
                                    <span key={skill} className={`flex items-center text-xs font-medium px-2.5 py-1 rounded-full transition-all ${isMatched ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'}`}>
                                      {isMatched && <CheckCircle className="h-3 w-3 mr-1"/>}
                                      {skill}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JobAnalysis;