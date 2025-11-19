
import React, { useState, useEffect, useMemo } from 'react';
import { analyzeJobDescriptionForKeywords } from '../services/geminiService';
import { JobAnalysisResult } from '../types';
import { CheckCircle } from './icons';

interface JobAnalysisProps {
    jobDescription: string;
    cvTextContent: string;
    apiKeySet: boolean;
    onAnalysisComplete?: (result: JobAnalysisResult) => void;
}

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
    const sqSize = 80;
    const strokeWidth = 8;
    const radius = (sqSize - strokeWidth) / 2;
    const viewBox = `0 0 ${sqSize} ${sqSize}`;
    const dashArray = radius * Math.PI * 2;
    const dashOffset = dashArray - dashArray * score / 100;

    const scoreColor = score < 50 ? 'text-red-500' : score < 75 ? 'text-yellow-500' : 'text-green-500';
    const trackColor = score < 50 ? 'stroke-red-200 dark:stroke-red-800/50' : score < 75 ? 'stroke-yellow-200 dark:stroke-yellow-800/50' : 'stroke-green-200 dark:stroke-green-800/50';
    const progressColor = score < 50 ? 'stroke-red-500' : score < 75 ? 'stroke-yellow-500' : 'stroke-green-500';


    return (
        <div className="relative w-20 h-20 flex items-center justify-center">
            <svg width={sqSize} height={sqSize} viewBox={viewBox}>
                <circle
                    className={`fill-none ${trackColor}`}
                    cx={sqSize / 2}
                    cy={sqSize / 2}
                    r={radius}
                    strokeWidth={`${strokeWidth}px`} />
                <circle
                    className={`fill-none transition-all duration-500 ease-in-out ${progressColor}`}
                    cx={sqSize / 2}
                    cy={sqSize / 2}
                    r={radius}
                    strokeWidth={`${strokeWidth}px`}
                    transform={`rotate(-90 ${sqSize/2} ${sqSize/2})`}
                    style={{
                        strokeDasharray: dashArray,
                        strokeDashoffset: dashOffset,
                        strokeLinecap: 'round'
                    }} />
            </svg>
            <span className={`absolute text-2xl font-bold ${scoreColor}`}>
                {score}
            </span>
        </div>
    );
};


const JobAnalysis: React.FC<JobAnalysisProps> = ({ jobDescription, cvTextContent, apiKeySet, onAnalysisComplete }) => {
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
                    .then(result => {
                        setAnalysis(result);
                        if (onAnalysisComplete) onAnalysisComplete(result);
                    })
                    .catch(err => setError(err instanceof Error ? err.message : "Analysis failed"))
                    .finally(() => setIsLoading(false));
            }, 1000); // Debounce

            return () => clearTimeout(handler);
        } else {
            setAnalysis(null);
            setError(null);
        }
    }, [jobDescription, apiKeySet]);

    const { matchedKeywords, missingKeywords, matchedSkills, missingSkills, matchScore } = useMemo(() => {
        if (!analysis || !cvTextContent) return { matchedKeywords: new Set(), missingKeywords: [], matchedSkills: new Set(), missingSkills: [], matchScore: 0 };
        
        const lowerCvText = cvTextContent.toLowerCase();
        
        const matchedKeywords = new Set<string>();
        const missingKeywords: string[] = [];
        analysis.keywords.forEach(keyword => {
            if (lowerCvText.includes(keyword.toLowerCase())) {
                matchedKeywords.add(keyword);
            } else {
                missingKeywords.push(keyword);
            }
        });

        const matchedSkills = new Set<string>();
        const missingSkills: string[] = [];
        analysis.skills.forEach(skill => {
            if (lowerCvText.includes(skill.toLowerCase())) {
                matchedSkills.add(skill);
            } else {
                missingSkills.push(skill);
            }
        });

        const totalItems = (analysis.keywords?.length || 0) + (analysis.skills?.length || 0);
        const matchedItems = matchedKeywords.size + matchedSkills.size;
        const score = totalItems > 0 ? Math.round((matchedItems / totalItems) * 100) : 0;

        return { matchedKeywords, missingKeywords, matchedSkills, missingSkills, matchScore: score };
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
        <div className="mt-6 p-4 border rounded-lg bg-zinc-50 dark:bg-neutral-700/30 border-zinc-200 dark:border-neutral-700/50">
            <h3 className="text-lg font-semibold mb-3">Job Analysis</h3>
            {isLoading && (
                <div className="flex items-center text-sm text-zinc-500">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Analyzing job description...
                </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {analysis && (
                <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="flex-shrink-0 flex flex-col items-center gap-2">
                         <ScoreGauge score={matchScore} />
                         <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">CV Match Score</h4>
                    </div>
                    <div className="flex-grow w-full">
                        {missingKeywords.length > 0 || missingSkills.length > 0 ? (
                            <div className="mb-4">
                                <h4 className="font-semibold text-sm mb-2 text-zinc-800 dark:text-zinc-200">Missing Keywords & Skills</h4>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">Try to include these terms in your CV summary or experience.</p>
                                <div className="flex flex-wrap gap-2">
                                    {[...missingKeywords, ...missingSkills].map(kw => (
                                        <span key={kw} className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                          {kw}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                             <div className="mb-4 p-3 rounded-lg bg-green-100 dark:bg-green-900/30 text-center">
                                <p className="text-sm font-semibold text-green-800 dark:text-green-200">Excellent Match!</p>
                                <p className="text-xs text-green-700 dark:text-green-300">Your CV includes all top keywords and skills.</p>
                            </div>
                        )}
                        
                        <h4 className="font-semibold text-sm mb-2 text-zinc-800 dark:text-zinc-200">Matched Keywords & Skills</h4>
                         <div className="flex flex-wrap gap-2">
                            {[...matchedKeywords, ...matchedSkills].map(kw => (
                                <span key={kw} className="flex items-center text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                  <CheckCircle className="h-3 w-3 mr-1"/>
                                  {kw}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JobAnalysis;
