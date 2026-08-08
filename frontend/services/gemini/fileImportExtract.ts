/**
 * Extract text from PDF/image for profile import.
 * Logic unchanged.
 */

import { getGeminiClient, retryGemini, claudeMultimodalCall } from './multimodalClients';
import { groqChat, GROQ_LARGE, getSelectedProvider } from '../groqService';
import { workerVisionExtract } from '../cvEngineClient';
import { cleanImportedText } from '../cvPurificationPipeline';
import { getGeminiKey as _rtGemini } from '../security/RuntimeKeys';

export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const prompt = "This file is a resume, CV, or professional profile. Extract ALL text content from it. Return only the raw, complete text, preserving original line breaks and structure as much as possible. DO NOT add any commentary, summaries, or markdown formatting.";

    const provider = getSelectedProvider();
    const claudeKey = getClaudeApiKey();
    const isImage = /^image\//i.test(mimeType);

    const viaClaude = async () => {
        const text = await claudeMultimodalCall(claudeKey!, base64Data, mimeType, prompt, { maxTokens: 4096 });
        if (!text || text.trim().length < 20) throw new Error('Claude returned an empty response. Please try again.');
        return text;
    };
    const viaGemini = async () => {
        const ai = getGeminiClient();
        const filePart = { inlineData: { data: base64Data, mimeType } };
        const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [filePart, { text: prompt }] },
            config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
        }));
        if (!response.text || response.text.trim().length < 20) throw new Error('Gemini returned an empty response. Please try again.');
        return response.text;
    };
    const viaGroq = async () => {
        const groqKey = getGroqApiKey();
        if (!groqKey) throw new Error('No Groq API key configured. Go to Settings → AI Keys to add your Groq API key.');
        if (!isImage) throw new Error('Groq vision only supports images. For PDFs, paste your CV text instead.');
        const { workerProxyMultimodal } = await import('./cvEngineClient');
        const text = await workerProxyMultimodal(groqKey, base64Data, mimeType, prompt, { maxTokens: 4096, provider: 'groq' });
        if (!text || text.trim().length < 20) throw new Error('Groq returned an empty response. Please try again.');
        return text;
    };
    const viaWorkersAi = async () => {
        if (!isImage) throw new Error('Workers AI does not support PDF extraction. Please paste your CV text, or add a Claude/Gemini key in Settings.');
        const text = await workerVisionExtract(base64Data, mimeType, prompt, { maxTokens: 4096 });
        if (!text || text.trim().length < 20) throw new Error('Workers AI could not extract text from this image. Please paste your CV text instead.');
        return text;
    };

    // Route strictly to the selected provider first.
    if (provider === 'groq') return viaGroq();
    if (provider === 'claude' && claudeKey) return viaClaude();
    if (provider === 'gemini') { try { return await viaGemini(); } catch (e) { if (!claudeKey) throw e; /* fall through to Claude below */ } }
    if (provider === 'workers-ai') return viaWorkersAi();  // viaWorkersAi() will throw for non-image PDFs with a clear message

    // Gemini failed + Claude available — use Claude as same-tier fallback.
    if (claudeKey) return viaClaude();
    try { return await viaGemini(); } catch (e) {
        if (isImage) return viaWorkersAi();
        throw new Error('This file needs a vision-capable key. Add a Claude, Gemini, or Groq key in Settings, or paste your CV text instead.');
    }
};

/**
 * Shared extraction rule #1 used by all three file-import prompts below.
 *
 * IMPORTANT: languages must be called out as going to the dedicated `languages`
 * field, not to customSections. The original single-sentence form lumped
 * "languages" in with the extras list, causing the model to map it to the
 * nearest CustomSectionType — which is 'memberships'.
 */
const EXTRACTION_RULE_LANGUAGES =
    '1. Extract work experience, education, skills, projects, and personal info.' +
    ' Languages go in the dedicated `languages` field — NEVER in customSections.' +
    ' Also extract any extras such as certifications, licences, awards, honours,' +
    ' publications, patents, volunteer work, memberships, presentations, courses,' +
    ' training, hobbies, and interests — map those extras to customSections.';

/**
 * Parse a UserProfile from a file (PDF/image).
 * Priority: Claude (multimodal, 200 K ctx) → Gemini 2.5 Flash.
 * Named "WithGemini" for backward-compat; Claude is now the primary path.
 */
export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const prompt = "Analyze this image, which contains text (likely a job description). Extract ALL of the visible text. Return ONLY the raw text, with no additional commentary, summary, or formatting.";

    // ── Route strictly by selected provider — no cross-provider fallbacks ─────
    const provider = getSelectedProvider();

    if (provider === 'workers-ai') {
        // 4096 tokens — raised from 2048 because long JDs were getting cut off mid-sentence.
        const cf = await workerVisionExtract(base64Image, mimeType, prompt, { maxTokens: 4096 });
        if (!cf || cf.trim().length < 10) throw new Error('Workers AI could not extract text from this image. Please paste the job description text manually.');
        return cf;
    }

    if (provider === 'claude') {
        const claudeKey = getClaudeApiKey();
        if (!claudeKey) throw new Error('Claude API key is not set. Please add it in Settings.');
        const text = await claudeMultimodalCall(claudeKey, base64Image, mimeType, prompt, { maxTokens: 2048 });
        if (!text || text.trim().length < 10) throw new Error('Claude returned an empty response. Please paste the text manually.');
        return text;
    }

    // Gemini
    const ai = getGeminiClient();
    const imagePart = { inlineData: { data: base64Image, mimeType } };
    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    if (!response.text || response.text.trim().length < 10) throw new Error('Gemini returned an empty response. Please paste the text manually.');
    return response.text;
};

