/**
 * Enhanced 6-block job analysis.
 * Extracted from geminiService — logic unchanged.
 */

import type { EnhancedJobAnalysis } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import { SYSTEM_INSTRUCTION_PARSER } from './pipelineRules';

// --- Enhanced 6-Block Job Analysis (career-ops inspired) ---
// Strips markdown fences, uses bracket-depth scanning to find the exact closing
// brace of the outermost JSON object (handles prose/extra-content after the JSON,
// even when that prose contains its own `}` characters), and falls back to a
// backwards-walk repair for truncated responses.
const extractAndRepairJson = (raw: string): string => {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Step 1: try the whole stripped string as-is
    try { JSON.parse(stripped); return stripped; } catch {}

    const start = stripped.indexOf('{');
    if (start === -1) return stripped;

    // Step 2: bracket-depth scan — correctly handles nested objects AND extra
    // text after the JSON that happens to contain `}` characters
    let depth = 0;
    let inString = false;
    let escaping = false;
    let matchEnd = -1;
    for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i];
        if (escaping) { escaping = false; continue; }
        if (ch === '\\' && inString) { escaping = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { matchEnd = i; break; } }
    }
    if (matchEnd !== -1) {
        const candidate = stripped.slice(start, matchEnd + 1);
        try { JSON.parse(candidate); return candidate; } catch {}
    }

    // Step 3: backwards-walk repair — handles truncated responses where the
    // model hit the token limit mid-object
    const lastEnd = stripped.lastIndexOf('}');
    if (lastEnd > start) {
        for (let i = lastEnd; i >= start; i--) {
            if (stripped[i] === '}') {
                const repaired = stripped.slice(start, i + 1);
                try { JSON.parse(repaired); return repaired; } catch {}
            }
        }
    }

    return stripped;
};

export const analyzeJobEnhanced = async (
    jobDescription: string,
    cvText: string,
): Promise<EnhancedJobAnalysis> => {
    // ── Compact prompt — reduced from ~900 to ~500 tokens input ──────────────
    // JD capped at 2000 chars, CV at 1800. Array caps reduce output by ~55%.
    const prompt = `You are a career strategist. Analyze this job description vs the candidate CV and return a JSON evaluation.

JOB DESCRIPTION:
${jobDescription.substring(0, 2000)}

CANDIDATE CV:
${cvText.substring(0, 1800)}

Return ONLY valid JSON (no markdown, no prose):
{
  "companyName": "string or 'Unknown'",
  "jobTitle": "string",
  "archetype": "Full-Stack / Dev Engineer | Solutions Architect | Product Manager | LLMOps / MLOps | Agentic AI | Digital Transformation | Data Scientist | DevOps / Platform | General Engineering | Other",
  "domain": "e.g. 'Cloud Infrastructure'",
  "seniority": "e.g. 'Senior'",
  "remote": "Remote | Hybrid | On-site | Unknown",
  "tldr": "1-sentence role summary",
  "matchedRequirements": ["up to 6 JD requirements clearly met by the CV"],
  "gaps": [{"requirement":"string","isBlocker":true/false,"mitigation":"actionable advice"} — up to 4 items],
  "matchScore": 0-100,
  "grade": "A|B|C|D|F",
  "levelStrategy": "2 sentences on seniority positioning",
  "seniorPositioningTips": ["3 specific phrases to appear more senior"],
  "salaryRange": "e.g. '$120k–$160k USD'",
  "salaryNotes": "brief comp/negotiation note",
  "personalizationChanges": [{"section":"Summary|Skills|Experience|Projects","currentState":"string","proposedChange":"string","reason":"string"} — up to 3 items],
  "topKeywords": ["10-12 ATS keywords from the JD"],
  "starStories": [{"jobRequirement":"string","linkedCompany":"string","linkedRole":"string","situation":"string","task":"string","action":"string","result":"string","reflection":"seniority signal"} — up to 3 items]
}

Grade: 85-100=A, 70-84=B, 55-69=C, 40-54=D, 0-39=F. Only use experience present in the CV.`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.3, json: true, maxTokens: 3500 });

    try {
        return JSON.parse(extractAndRepairJson(text)) as EnhancedJobAnalysis;
    } catch (firstErr) {
        console.warn('[Deep Job Analysis] JSON parse failed on first attempt, retrying…', firstErr);
        const retry = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 3500 });
        return JSON.parse(extractAndRepairJson(retry)) as EnhancedJobAnalysis;
    }
};
