import { UserProfile, CVData, JobAnalysisResult } from '../types';

// A helper function to handle API requests and errors
async function postToApi<T>(endpoint: string, body: object): Promise<T> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown server error occurred.' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
}

export const generateProfile = async (rawText: string): Promise<UserProfile> => {
    return postToApi<UserProfile>('/api/generate-profile', { rawText });
};

export const generateCV = async (profile: UserProfile, jobDescription: string, enableEnhancements: boolean): Promise<CVData> => {
    return postToApi<CVData>('/api/generate-cv', { profile, jobDescription, enableEnhancements });
};

export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const response = await postToApi<{ text: string }>('/api/extract-profile-text-from-file', { base64Data, mimeType });
    return response.text;
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const response = await postToApi<{ text: string }>('/api/extract-text-from-image', { base64Image, mimeType });
    return response.text;
};

export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const response = await postToApi<{ letter: string }>('/api/generate-cover-letter', { profile, jobDescription });
    return response.letter;
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    return postToApi<JobAnalysisResult>('/api/analyze-job', { jobDescription });
};
