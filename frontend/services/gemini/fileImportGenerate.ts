/**
 * Generate UserProfile from uploaded file via Gemini / Claude / Groq.
 * Logic unchanged.
 */

import { UserProfile } from '../../types';
import { getGeminiClient, retryGemini, claudeMultimodalCall } from './multimodalClients';
import { groqChat, GROQ_LARGE, getSelectedProvider } from '../groqService';
import { SYSTEM_INSTRUCTION_PARSER } from './rulesState';
import { parseProfileJson } from './profileGeneration';
import { purifyProfile, cleanImportedText } from '../cvPurificationPipeline';
import { getGeminiKey as _rtGemini } from '../security/RuntimeKeys';
import { extractProfileTextFromFile } from './fileImportExtract';

export const generateProfileFromFileWithGemini = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
    ` : '';

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        ${githubInstruction}
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no preamble of any kind.

        ${USER_PROFILE_SCHEMA}
    `;

    // ── Gemini 2.5 Flash — selected provider is Gemini, use only Gemini ─────────
    const ai = getGeminiClient();
    const filePart = { inlineData: { data: base64Data, mimeType } };
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(response.text || ''));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Parse a UserProfile from a file (PDF/image) using Claude ONLY.
 * No fallback to any other provider.
 */
export const generateProfileFromFileClaude = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const claudeKey = getClaudeApiKey();
    if (!claudeKey) throw new Error('Claude API key is not set. Please add your Claude API key in Settings.');

    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
    ` : '';

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        ${githubInstruction}
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no "I'm ready" or any other preamble.

        ${USER_PROFILE_SCHEMA}
    `;

    const raw = await claudeMultimodalCall(claudeKey, base64Data, mimeType, prompt, { maxTokens: 8192, temperature: 0.1 });
    if (!raw || raw.trim().length < 20) throw new Error('Claude returned an empty response. Please try again.');

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(raw));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Parse a UserProfile from an image file using Groq vision ONLY.
 * Uses llama-3.2-11b-vision-preview routed through the CF Worker proxy.
 * For PDFs, use workerExtractDoc (text extraction) + generateProfile instead.
 */
export const generateProfileFromFileWithGroq = async (
    base64Data: string,
    mimeType: string,
): Promise<UserProfile> => {
    const groqKey = getGroqApiKey();
    if (!groqKey) throw new Error('Groq API key is not set. Please add your Groq API key in Settings.');
    if (!/^image\//i.test(mimeType)) throw new Error('Groq vision only supports image files. For PDFs, the text will be extracted automatically.');

    const prompt = `RESPOND WITH ONLY A RAW JSON OBJECT. NO GREETING. NO PREAMBLE. NO EXPLANATION. START YOUR RESPONSE WITH "{" AND END WITH "}".

        You are a professional CV data extractor. You are looking at a resume, CV, or professional profile document.
        Your ONLY job is to extract EVERY piece of information visible — nothing more, nothing less.

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet point.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. First day of month/year if only month/year given. Current roles → endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item (e.g. 'exp1', 'edu1', 'cs1').
        6. Do NOT invent data that is not visibly present in the document.
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary, no preamble of any kind.

        ${USER_PROFILE_SCHEMA}
    `;

    const { workerProxyMultimodal } = await import('./cvEngineClient');
    const raw = await workerProxyMultimodal(groqKey, base64Data, mimeType, prompt, {
        maxTokens: 8192,
        temperature: 0.1,
        provider: 'groq',
        timeoutMs: 90_000,
    });
    if (!raw || raw.trim().length < 20) throw new Error('Groq returned an empty response. Please try again.');

    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(raw));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

/**
 * Structure plain text into a UserProfile JSON.
 * Priority: Claude (200 K ctx, text-only) → Gemini 2.5 Flash.
 * Named "WithGemini" for backward-compat; Claude is now the primary path.
 */
export const generateProfileFromTextWithGemini = async (
    rawText: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const githubInstruction = githubUrl ? `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. Analyse the public repositories, languages, and commit history to enrich the profile.
        - Populate 'projects' with the top 5 most impressive public repositories.
        - Add all key languages, frameworks, and tools to 'skills'.
        - Infer any missing personal details from the GitHub profile.
    ` : '';

    const prompt = `
        You are a professional CV data extractor. Your goal is to convert the following resume/career text into a complete structured JSON profile — extracting EVERY piece of information present.

        ### SOURCE TEXT
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}

        ${githubInstruction}

        ### CRITICAL EXTRACTION RULES
        ${EXTRACTION_RULE_LANGUAGES}
        2. Preserve ALL responsibility bullets in full — do NOT summarise, paraphrase, or drop any bullet.
        3. Preserve EVERY skill listed — do NOT drop any.
        4. Standardize all dates to 'YYYY-MM-DD'. Current roles: endDate = 'Present'.
        5. Generate a unique simple string 'id' for every array item.
        6. Do NOT invent data not present in the text.
        7. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    // ── Gemini 2.5 Flash (this function is the Gemini-specific text import path) ─
    const ai = getGeminiClient();
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(response.text || ''));
    profileData.projects       = profileData.projects       || [];
    profileData.education      = profileData.education      || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages      = profileData.languages      || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);
    return profileData;
};

