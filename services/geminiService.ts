import { UserProfile, CVData, JobAnalysisResult } from '../types';

const handleApiResponse = async (response: Response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    return response.json();
};

export const generateCV = async (profile: UserProfile, jobDescription: string, enableEnhancements: boolean): Promise<CVData> => {
    const response = await fetch('/api/generate-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, jobDescription, enableEnhancements }),
    });
    return handleApiResponse(response);
};

export const generateProfile = async (rawText: string): Promise<UserProfile> => {
    const response = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
    });
    return handleApiResponse(response);
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const response = await fetch('/api/extract-text-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, mimeType }),
    });
    const data = await handleApiResponse(response);
    return data.text;
};

export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const response = await fetch('/api/extract-profile-text-from-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType }),
    });
    const data = await handleApiResponse(response);
    return data.text;
};

export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const response = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, jobDescription }),
    });
    const data = await handleApiResponse(response);
    return data.letter;
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const response = await fetch('/api/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription }),
    });
    return handleApiResponse(response);
};
