/**
 * Application email generator + tone presets.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, groqChatStream, GROQ_LARGE } from './groqService';
import { purifyProfile, purifyText } from './cvPurificationPipeline';
import { SYSTEM_INSTRUCTION_PROFESSIONAL } from './pipelineRules';

// ── HR-compliant application email generator ────────────────────────────────
// Rules based on recruiter research:
// • 150-200 word body — recruiters spend ~7 seconds scanning
// • Never open with "I am writing to apply" or any cliché
// • One concrete metric / achievement in the body
// • Reference the specific role and company
// • Clear CTA in the closing line
// • No banned phrases (same list as cover letter)
// Curated tone presets for the email composer.
// Each maps a user-facing label to a tone instruction injected into the prompt.
export const EMAIL_TONE_PRESETS = [
    {
        id:    'confident',
        label: 'Confident',
        icon:  '⚡',
        desc:  'Direct, bold, results-focused — mirrors a startup / delivery voice',
        instruction: 'Write with lean, direct energy. Lead with impact. Short declarative sentences. Bias towards action verbs. Confident without arrogance.',
    },
    {
        id:    'professional',
        label: 'Professional',
        icon:  '🎯',
        desc:  'Measured, formal and precise — suited to finance, consulting, corporate',
        instruction: 'Write with measured formality. Precise language, no contractions. Senior but not stiff. Every claim anchored to an outcome.',
    },
    {
        id:    'warm',
        label: 'Warm',
        icon:  '🤝',
        desc:  'Personable and collaborative — good for people-facing or creative roles',
        instruction: 'Write with warmth and authenticity. Slightly conversational but still polished. Show genuine interest in the team and mission. Human, not robotic.',
    },
    {
        id:    'executive',
        label: 'Executive',
        icon:  '🏛️',
        desc:  'Strategic, board-facing — for senior / leadership applications',
        instruction: 'Write at board-deck level. Strategic framing, not task-listing. Speak to vision and organisational impact. Authoritative and concise.',
    },
] as const;
export type EmailToneId = typeof EMAIL_TONE_PRESETS[number]['id'];


export const generateApplicationEmail = async (
    profileInput: UserProfile,
    jobTitle: string,
    companyName: string,
    keywords: string[],
    _jobDescription: string,
    toneId: EmailToneId = 'confident',
    workerVoiceTone?: string,             // auto-detected tone string from /api/cv/brief
    onChunk?: (delta: string) => void,    // optional streaming callback
): Promise<{ subject: string; body: string }> => {
    const profile = purifyProfile(profileInput);
    const name     = profile.personalInfo?.name  || 'Applicant';
    const email    = profile.personalInfo?.email || '';
    const phone    = profile.personalInfo?.phone || '';

    const topSkills  = (profile.skills || []).slice(0, 5).join(', ');
    const topKeywords = keywords.slice(0, 6).join(', ');
    const recentRole  = profile.workExperience?.[0]
        ? `${profile.workExperience[0].jobTitle} at ${profile.workExperience[0].company}`
        : '';
    const achievements = (profile.workExperience || [])
        .flatMap(e => (e.responsibilities || []).slice(0, 2))
        .slice(0, 4)
        .join(' | ');

    const roleRef    = jobTitle  || 'the advertised position';
    const companyRef = companyName && companyName !== 'Unknown' ? companyName : 'your organisation';

    // Tone instruction — worker voice takes precedence if detected, else use preset
    const preset = EMAIL_TONE_PRESETS.find(t => t.id === toneId) ?? EMAIL_TONE_PRESETS[0];
    const toneInstruction = workerVoiceTone
        ? `TONE (auto-detected from job description — worker voice: "${workerVoiceTone}"): ${preset.instruction}`
        : `TONE: ${preset.instruction}`;

    const prompt = `You are a career coach writing a SHORT, HIGH-IMPACT job application email for ${name}.

ROLE: ${roleRef} at ${companyRef}
APPLICANT BACKGROUND: ${recentRole || topSkills}
KEY ACHIEVEMENTS (use ONE with a metric): ${achievements || 'Strong delivery track record'}
TOP JD KEYWORDS (weave in naturally): ${topKeywords}
SIGN-OFF NAME: ${name}${email ? `\n${email}` : ''}${phone ? `\n${phone}` : ''}
${toneInstruction}

MANDATORY RULES — every rule is non-negotiable:
1. SUBJECT LINE: Return it on the very first line as exactly: Subject: <text>
2. Leave one blank line, then write the email body.
3. Body MUST be 150-200 words (salutation to sign-off name). Count carefully.
4. Open with "Dear Hiring Manager," (or specific name if in JD).
5. NEVER open the first paragraph with "I". Lead with a bold 1-sentence value claim or hook.
6. THREE short paragraphs:
   - Para 1 (~40 words): Value hook + role + company name.
   - Para 2 (~80 words): One specific achievement with a real metric, then bridge to 2 JD keywords.
   - Para 3 (~40 words): "Please find my CV attached." + a confident single-sentence CTA for a call/meeting.
7. Sign off: "Best regards," then the applicant's name and contact info on separate lines.
8. BANNED PHRASES — never use: "I am writing to apply", "I am writing to express", "please find attached my resume", "I look forward to hearing from you" (standalone), "passionate about", "proven track record", "team player", "self-starter", "detail-oriented", "excited to leverage", "results-driven", "synergize", "utilize".
9. Honour the TONE instruction above — it shapes sentence length, formality, and vocabulary.
10. Return ONLY the subject line + blank line + email body. No commentary.`;

    const raw = onChunk
        ? await groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, onChunk, { temperature: 0.6, maxTokens: 600 })
        : await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.6, maxTokens: 600 });
    const text = purifyText(raw);

    // Parse subject from first line
    const lines   = text.split('\n');
    const subjectLine = lines.find(l => /^subject:/i.test(l.trim()));
    const subject = subjectLine
        ? subjectLine.replace(/^subject:\s*/i, '').trim()
        : `Application for ${roleRef} at ${companyRef} — ${name}`;
    const bodyStart = subjectLine ? lines.indexOf(subjectLine) + 1 : 0;
    const body = lines.slice(bodyStart).join('\n').trimStart();

    return { subject, body };
};
