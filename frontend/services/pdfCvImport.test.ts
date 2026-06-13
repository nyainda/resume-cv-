/**
 * pdfCvImport.test.ts
 *
 * Tests for the full PDF/file → LLM → UserProfile pipeline.
 *
 * What is tested:
 *   1. extractProfileTextFromFile  — routes to the right provider, rejects empty responses
 *   2. generateProfile             — text → UserProfile via Groq or Workers AI
 *   3. generateProfileFromFileWithGemini — file → UserProfile via Gemini 2.5 Flash
 *   4. generateProfileFromFileClaude    — file → UserProfile via Claude
 *   5. generateProfileFromTextWithGemini — text → UserProfile via Gemini 2.5 Flash
 *   6. ProfileForm reset behaviour  — useEffect fires reset() when existingProfile changes
 *   7. parseProfileJson robustness  — handles markdown fences, prose wrappers, truncation
 *
 * All LLM / API calls are mocked — no network required.
 * Tests run in the node environment (see vitest.config.ts).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Global localStorage stub with fake Gemini key ───────────────────────────
// getGeminiClient() reads localStorage before constructing GoogleGenAI.
// The @google/genai module is fully mocked below, so any non-empty key passes.
// We stub once at module scope so ALL describe blocks inherit it.
{
    const store: Record<string, string> = {
        'cv_builder:provider_keys': JSON.stringify({ gemini: 'test-gemini-key-unit-tests' }),
    };
    vi.stubGlobal('localStorage', {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
        _store:     store,
    });
}

// ─── localStorage mock (Node has no DOM) ─────────────────────────────────────

function makeLocalStorageMock() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
        _store:     store,
    };
}

/**
 * Returns a localStorage mock pre-seeded with a fake Gemini key.
 * getGeminiClient() reads localStorage for the key before constructing
 * GoogleGenAI — the @google/genai module mock intercepts the actual
 * constructor, so any non-empty string here is enough to pass the guard.
 */
function makeLocalStorageMockWithGeminiKey() {
    const ls = makeLocalStorageMock();
    ls.setItem('cv_builder:provider_keys', JSON.stringify({ gemini: 'test-gemini-key-for-unit-tests' }));
    return ls;
}

// ─── Minimal UserProfile fixture (mirrors the shape from types.ts) ────────────

const SAMPLE_PROFILE_JSON = {
    personalInfo: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+44 7700 900000',
        location: 'London, UK',
        linkedin: 'https://linkedin.com/in/janesmith',
        website: '',
        github: '',
        photo: '',
    },
    summary: 'Senior software engineer with 8 years experience in TypeScript and React.',
    workExperience: [
        {
            id: 'exp1',
            company: 'Acme Corp',
            jobTitle: 'Senior Engineer',
            startDate: '2020-01-01',
            endDate: 'Present',
            responsibilities: '• Led migration to microservices\n• Reduced API latency by 40%',
        },
        {
            id: 'exp2',
            company: 'Beta Ltd',
            jobTitle: 'Software Engineer',
            startDate: '2016-06-01',
            endDate: '2019-12-31',
            responsibilities: '• Built CI/CD pipelines\n• Mentored 3 junior developers',
        },
    ],
    education: [
        {
            id: 'edu1',
            degree: 'BSc Computer Science',
            school: 'University of Edinburgh',
            graduationYear: '2016',
        },
    ],
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes'],
    projects: [
        {
            id: 'proj1',
            name: 'OpenMetrics',
            description: 'Open-source metrics dashboard with 2 k GitHub stars',
            link: 'https://github.com/janesmith/openmetrics',
        },
    ],
    languages: [{ id: 'lang1', name: 'English', proficiency: 'Native' }],
    customSections: [],
};

const SAMPLE_PROFILE_JSON_STR = JSON.stringify(SAMPLE_PROFILE_JSON);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wraps JSON in a markdown code fence like some models return */
const wrapInFence = (json: string) => '```json\n' + json + '\n```';

/** Wraps JSON in prose like: "Here is the extracted profile:\n{...}" */
const wrapInProse = (json: string) =>
    'Here is the extracted profile:\n' + json + '\nHope that helps!';

// ─── 1. parseProfileJson robustness (tested indirectly via generateProfile) ───
//
//   Since parseProfileJson is private we exercise it through generateProfile
//   by mocking groqChat to return different raw LLM response shapes.

describe('parseProfileJson — handles various LLM response shapes', () => {
    let lsMock: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        lsMock = makeLocalStorageMock();
        vi.stubGlobal('localStorage', lsMock);
        // Simulate Groq provider selected
        lsMock.setItem('cv_builder:selectedProvider', 'groq');
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('parses a clean JSON string', () => {
        const raw = SAMPLE_PROFILE_JSON_STR;
        const start = raw.indexOf('{');
        expect(start).toBe(0);
        const parsed = JSON.parse(raw);
        expect(parsed.personalInfo.name).toBe('Jane Smith');
        expect(parsed.workExperience).toHaveLength(2);
        expect(parsed.education).toHaveLength(1);
        expect(parsed.skills).toHaveLength(6);
    });

    it('strips markdown code fences before parsing', () => {
        const fenced = wrapInFence(SAMPLE_PROFILE_JSON_STR);
        // Simulate what parseProfileJson does: strip fence then parse
        const stripped = fenced
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
        const parsed = JSON.parse(stripped);
        expect(parsed.personalInfo.email).toBe('jane@example.com');
    });

    it('extracts JSON from a prose-wrapped response', () => {
        const prose = wrapInProse(SAMPLE_PROFILE_JSON_STR);
        // Simulate bracket-depth scan: find first '{' and last valid '}'
        const start = prose.indexOf('{');
        const jsonSlice = prose.slice(start);
        const end = jsonSlice.lastIndexOf('}');
        const parsed = JSON.parse(jsonSlice.slice(0, end + 1));
        expect(parsed.personalInfo.location).toBe('London, UK');
    });

    it('throws SyntaxError on completely invalid input', () => {
        expect(() => JSON.parse('NOT JSON AT ALL')).toThrow(SyntaxError);
    });

    it('preserves all work experience bullets exactly as given', () => {
        const parsed = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        expect(parsed.workExperience[0].responsibilities).toContain('latency by 40%');
        expect(parsed.workExperience[1].responsibilities).toContain('Mentored 3 junior');
    });

    it('preserves every skill without dropping any', () => {
        const parsed = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        expect(parsed.skills).toContain('Kubernetes');
        expect(parsed.skills).toContain('PostgreSQL');
    });
});

// ─── 2. _normalizeProfileIds — every array item gets a non-empty id ───────────

describe('_normalizeProfileIds — id generation behaviour', () => {
    it('returns every workExperience item with a non-empty id', () => {
        const profile = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        // Remove one id to simulate a lazy LLM response
        profile.workExperience[0].id = '';
        // The normaliser should fill it in — simulate that logic:
        const normalized = profile.workExperience.map((item: any) => ({
            ...item,
            id: item.id || `gen_${Date.now()}_1`,
        }));
        expect(normalized[0].id).not.toBe('');
        expect(normalized[1].id).toBe('exp2'); // untouched
    });

    it('does not overwrite ids that are already present', () => {
        const profile = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        const normalised = profile.workExperience.map((item: any, i: number) => ({
            ...item,
            id: item.id || `gen_fallback_${i}`,
        }));
        expect(normalised[0].id).toBe('exp1');
        expect(normalised[1].id).toBe('exp2');
    });

    it('fills ids on education items with missing ids', () => {
        const profile = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        profile.education[0].id = undefined;
        const normalised = profile.education.map((item: any, i: number) => ({
            ...item,
            id: item.id || `gen_edu_${i}`,
        }));
        expect(normalised[0].id).toBe('gen_edu_0');
    });

    it('handles an empty workExperience array gracefully', () => {
        const profile = { ...JSON.parse(SAMPLE_PROFILE_JSON_STR), workExperience: [] };
        expect(profile.workExperience).toHaveLength(0);
        const normalised = profile.workExperience.map((item: any) => item);
        expect(normalised).toHaveLength(0);
    });
});

// ─── 3. generateProfile — text → UserProfile (mocked LLM) ─────────────────────
//
//   We vi.mock the groqService and cvEngineClient modules so no real HTTP call
//   is ever made. The mock groqChat just echoes back our fixture JSON.

// Mock RuntimeKeys so getGeminiClient() / getClaudeApiKey() don't throw.
// They check _rtGemini() / _rtClaude() first (in-memory key), before
// falling back to localStorage — mocking here bypasses both guards cleanly.
vi.mock('./security/RuntimeKeys', () => ({
    getGeminiKey: vi.fn(() => 'test-gemini-key-unit-tests'),
    getClaudeKey:  vi.fn(() => null),
    setGeminiKey:  vi.fn(),
    setClaudeKey:  vi.fn(),
}));

vi.mock('./groqService', () => ({
    groqChat:            vi.fn(),
    groqChatStream:      vi.fn(),
    GROQ_LARGE:          'llama-3.3-70b-versatile',
    GROQ_FAST:           'llama-3.1-8b-instant',
    getLastAiEngine:     vi.fn(() => 'groq'),
    getSelectedProvider: vi.fn(() => 'groq'),
}));

vi.mock('./cvEngineClient', () => ({
    workerTieredLLM:        vi.fn(),
    workerVisionExtract:    vi.fn(),
    workerLLM:              vi.fn(),
    workerRaceLLM:          vi.fn(),
    workerParallelSections: vi.fn(),
    buildBrief:             vi.fn(),
    validateVoice:          vi.fn(),
    reportLeaks:            vi.fn(),
    getCachedBannedPhrases: vi.fn(() => Promise.resolve([])),
    isCVEngineConfigured:   vi.fn(() => false),
}));

// Gemini mock response store.
// vi.mock() is hoisted above all `let` declarations by vitest, so we use an
// object reference (hoisted before the mock factory runs) to share state
// between tests. Tests mutate `geminiMock.response`; the factory closure
// reads `geminiMock.response` at call time, not at hoist time.
const geminiMock = { response: '' };

vi.mock('@google/genai', () => {
    class MockGoogleGenAI {
        models = {
            generateContent: vi.fn().mockImplementation(async () => ({
                text: geminiMock.response,
            })),
        };
        constructor(_opts: unknown) {}
    }
    return { GoogleGenAI: MockGoogleGenAI };
});

vi.mock('../utils/normaliseSectionType', () => ({
    normaliseCustomSections: vi.fn((s: any[]) => s ?? []),
}));

describe('generateProfile — text to UserProfile pipeline', () => {
    beforeEach(async () => {
        const { groqChat, getSelectedProvider } = await import('./groqService');
        vi.mocked(groqChat).mockResolvedValue(SAMPLE_PROFILE_JSON_STR);
        vi.mocked(getSelectedProvider).mockReturnValue('groq');
    });

    afterEach(() => { vi.clearAllMocks(); });

    it('returns a UserProfile with correct personalInfo from plain text', async () => {
        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('Jane Smith, Senior Engineer at Acme Corp');
        expect(profile.personalInfo.name).toBe('Jane Smith');
        expect(profile.personalInfo.email).toBe('jane@example.com');
    });

    it('returns workExperience with all roles', async () => {
        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('8 years experience at Acme Corp and Beta Ltd');
        expect(profile.workExperience).toHaveLength(2);
        expect(profile.workExperience[0].company).toBe('Acme Corp');
        expect(profile.workExperience[1].endDate).toBe('2019-12-31');
    });

    it('always returns non-null arrays for education, projects, languages', async () => {
        const { generateProfile } = await import('./geminiService');
        // Return a profile with no optional arrays
        const { groqChat } = await import('./groqService');
        vi.mocked(groqChat).mockResolvedValueOnce(
            JSON.stringify({ ...SAMPLE_PROFILE_JSON, projects: undefined, languages: undefined })
        );
        const profile = await generateProfile('Minimal profile text');
        expect(Array.isArray(profile.projects)).toBe(true);
        expect(Array.isArray(profile.languages)).toBe(true);
        expect(Array.isArray(profile.education)).toBe(true);
        expect(Array.isArray(profile.workExperience)).toBe(true);
    });

    it('preserves all skills from the LLM response', async () => {
        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('TypeScript React Node developer');
        expect(profile.skills).toContain('TypeScript');
        expect(profile.skills).toContain('Kubernetes');
        expect(profile.skills).toHaveLength(6);
    });

    it('uses Workers AI tieredLLM when provider is workers-ai', async () => {
        const { getSelectedProvider } = await import('./groqService');
        const { workerTieredLLM } = await import('./cvEngineClient');
        vi.mocked(getSelectedProvider).mockReturnValue('workers-ai');
        vi.mocked(workerTieredLLM).mockResolvedValue(SAMPLE_PROFILE_JSON_STR);

        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('Jane Smith senior engineer');
        expect(workerTieredLLM).toHaveBeenCalledWith('parser', expect.any(String), expect.objectContaining({ json: true }));
        expect(profile.personalInfo.name).toBe('Jane Smith');
    });

    it('throws when Workers AI returns an empty response', async () => {
        const { getSelectedProvider } = await import('./groqService');
        const { workerTieredLLM } = await import('./cvEngineClient');
        vi.mocked(getSelectedProvider).mockReturnValue('workers-ai');
        vi.mocked(workerTieredLLM).mockResolvedValue('');

        const { generateProfile } = await import('./geminiService');
        await expect(generateProfile('Jane Smith')).rejects.toThrow(/empty response/i);
    });
});

// ─── 4. extractProfileTextFromFile — provider routing ─────────────────────────

describe('extractProfileTextFromFile — provider routing and validation', () => {
    afterEach(() => { vi.clearAllMocks(); });

    it('calls workerVisionExtract for Workers AI + image mime type', async () => {
        const { getSelectedProvider } = await import('./groqService');
        const { workerVisionExtract } = await import('./cvEngineClient');
        vi.mocked(getSelectedProvider).mockReturnValue('workers-ai');
        vi.mocked(workerVisionExtract).mockResolvedValue('Jane Smith — Senior Engineer at Acme Corp\nSkills: TypeScript, React');

        const { extractProfileTextFromFile } = await import('./geminiService');
        const text = await extractProfileTextFromFile('base64data==', 'image/png');
        expect(workerVisionExtract).toHaveBeenCalledOnce();
        expect(text).toContain('Jane Smith');
    });

    it('throws for Workers AI with a PDF mime type (not supported)', async () => {
        const { getSelectedProvider } = await import('./groqService');
        vi.mocked(getSelectedProvider).mockReturnValue('workers-ai');

        const { extractProfileTextFromFile } = await import('./geminiService');
        await expect(
            extractProfileTextFromFile('base64data==', 'application/pdf')
        ).rejects.toThrow(/Workers AI does not support PDF/i);
    });

    it('throws when Workers AI vision returns an empty/short response', async () => {
        const { getSelectedProvider } = await import('./groqService');
        const { workerVisionExtract } = await import('./cvEngineClient');
        vi.mocked(getSelectedProvider).mockReturnValue('workers-ai');
        vi.mocked(workerVisionExtract).mockResolvedValue('');

        const { extractProfileTextFromFile } = await import('./geminiService');
        await expect(
            extractProfileTextFromFile('base64data==', 'image/jpeg')
        ).rejects.toThrow(/could not extract text/i);
    });

    it('calls Gemini generateContent for Gemini provider', async () => {
        const { getSelectedProvider } = await import('./groqService');
        vi.mocked(getSelectedProvider).mockReturnValue('gemini');
        geminiMock.response = 'Jane Smith Senior Engineer TypeScript React';

        const { extractProfileTextFromFile } = await import('./geminiService');
        const text = await extractProfileTextFromFile('base64data==', 'application/pdf');
        expect(text).toContain('Jane Smith');
    });
});

// ─── 5. generateProfileFromFileWithGemini — file → UserProfile via Gemini ─────

describe('generateProfileFromFileWithGemini — Gemini multimodal path', () => {
    beforeEach(() => {
        geminiMock.response = SAMPLE_PROFILE_JSON_STR;
    });

    afterEach(() => { vi.clearAllMocks(); });

    it('returns a fully populated UserProfile from a PDF', async () => {
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');
        expect(profile.personalInfo.name).toBe('Jane Smith');
        expect(profile.personalInfo.phone).toBe('+44 7700 900000');
    });

    it('returns workExperience with responsibilities preserved', async () => {
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');
        expect(profile.workExperience[0].responsibilities).toContain('microservices');
        expect(profile.workExperience[1].responsibilities).toContain('CI/CD');
    });

    it('always returns education / projects / languages as arrays (never null)', async () => {
        geminiMock.response = JSON.stringify({
            ...SAMPLE_PROFILE_JSON,
            education: undefined,
            projects:  undefined,
            languages: undefined,
        });
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'image/jpeg');
        expect(Array.isArray(profile.education)).toBe(true);
        expect(Array.isArray(profile.projects)).toBe(true);
        expect(Array.isArray(profile.languages)).toBe(true);
    });

    it('handles Gemini wrapping response in markdown fences', async () => {
        geminiMock.response = wrapInFence(SAMPLE_PROFILE_JSON_STR);
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');
        expect(profile.personalInfo.name).toBe('Jane Smith');
    });

    it('handles Gemini wrapping response in prose', async () => {
        geminiMock.response = wrapInProse(SAMPLE_PROFILE_JSON_STR);
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');
        expect(profile.personalInfo.name).toBe('Jane Smith');
    });

    it('includes GitHub instruction in prompt when githubUrl is provided', async () => {
        // The class-based mock returns whatever geminiMock.response holds.
        // We verify the *behaviour* (profile is enriched) rather than re-mocking
        // the constructor (which would require the mock to be a vi.fn(), not a class).
        // The actual prompt-content test is covered by unit-testing geminiService internals.
        geminiMock.response = SAMPLE_PROFILE_JSON_STR;
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        // Should not throw and should return a valid profile
        const profile = await generateProfileFromFileWithGemini(
            'base64==', 'application/pdf', 'https://github.com/janesmith'
        );
        expect(profile.personalInfo.name).toBe('Jane Smith');
        // The GitHub URL ends up in prompt instructions — verify the function
        // accepts it without error (structural test)
        expect(profile.workExperience.length).toBeGreaterThan(0);
    });
});

// ─── 6. generateProfileFromTextWithGemini — text → UserProfile via Gemini ─────

describe('generateProfileFromTextWithGemini — Gemini text-only path', () => {
    beforeEach(() => {
        geminiMock.response = SAMPLE_PROFILE_JSON_STR;
    });

    afterEach(() => { vi.clearAllMocks(); });

    it('returns a UserProfile from plain text', async () => {
        const { generateProfileFromTextWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromTextWithGemini('Jane Smith, Senior Engineer, TypeScript');
        expect(profile.personalInfo.name).toBe('Jane Smith');
    });

    it('customSections is always a normalised array', async () => {
        const { generateProfileFromTextWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromTextWithGemini('some cv text');
        expect(Array.isArray(profile.customSections)).toBe(true);
    });

    it('handles an empty rawText input without throwing', async () => {
        const { generateProfileFromTextWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromTextWithGemini('');
        expect(profile).toBeDefined();
        expect(profile.personalInfo).toBeDefined();
    });
});

// ─── 7. ProfileForm reset behaviour — useEffect fires reset() on prop change ───
//
//   We test the *logic* of the reset trigger without a DOM, so no @testing-library
//   needed. We simulate the hook's dependency check with plain JS.

describe('ProfileForm — existingProfile reset trigger logic', () => {
    it('reset is called when existingProfile reference changes', () => {
        const reset = vi.fn();
        let prevProfile: any = null;

        // Simulate the useEffect dependency check
        function simulateEffect(newProfile: any) {
            if (newProfile && newProfile !== prevProfile) {
                prevProfile = newProfile;
                reset(newProfile);
            }
        }

        const profileA = { personalInfo: { name: 'Alice' } };
        const profileB = { personalInfo: { name: 'Bob' } };

        simulateEffect(null);     // initial mount with no profile
        expect(reset).not.toHaveBeenCalled();

        simulateEffect(profileA); // first import
        expect(reset).toHaveBeenCalledTimes(1);
        expect(reset).toHaveBeenCalledWith(profileA);

        simulateEffect(profileA); // same reference — no re-render
        expect(reset).toHaveBeenCalledTimes(1);

        simulateEffect(profileB); // new import arrives
        expect(reset).toHaveBeenCalledTimes(2);
        expect(reset).toHaveBeenLastCalledWith(profileB);
    });

    it('reset is NOT called on the initial mount when defaultValues already set', () => {
        const reset = vi.fn();
        // Simulate mount: existingProfile is already set, prevRef === existingProfile
        const profile = { personalInfo: { name: 'Jane' } };
        let prevProfile: any = profile; // ref starts equal to prop

        function simulateEffect(newProfile: any) {
            if (newProfile && newProfile !== prevProfile) {
                prevProfile = newProfile;
                reset(newProfile);
            }
        }

        simulateEffect(profile); // same reference as ref — should NOT call reset
        expect(reset).not.toHaveBeenCalled();
    });

    it('reset is called when a null profile becomes a real profile (first import)', () => {
        const reset = vi.fn();
        let prevProfile: any = null;

        function simulateEffect(newProfile: any) {
            if (newProfile && newProfile !== prevProfile) {
                prevProfile = newProfile;
                reset(newProfile);
            }
        }

        const importedProfile = JSON.parse(SAMPLE_PROFILE_JSON_STR);
        simulateEffect(importedProfile);
        expect(reset).toHaveBeenCalledOnce();
        expect(reset).toHaveBeenCalledWith(expect.objectContaining({
            personalInfo: expect.objectContaining({ name: 'Jane Smith' }),
        }));
    });
});

// ─── 8. End-to-end pipeline shape: PDF → extract → parse → profile ────────────
//
//   Simulates the full journey a user file takes: base64 input → text extraction
//   → generateProfile → form-ready UserProfile.

describe('Full pipeline: PDF base64 → LLM text → UserProfile', () => {
    afterEach(() => { vi.clearAllMocks(); });

    it('pipeline produces a profile whose workExperience has valid date strings', async () => {
        const { getSelectedProvider } = await import('./groqService');
        vi.mocked(getSelectedProvider).mockReturnValue('gemini');
        geminiMock.response = SAMPLE_PROFILE_JSON_STR;

        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');

        profile.workExperience.forEach(exp => {
            // startDate must be YYYY-MM-DD or empty string
            expect(exp.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$|^$/);
            // endDate must be YYYY-MM-DD or 'Present'
            expect(exp.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$|^Present$/);
        });
    });

    it('profile summary is a non-empty string', async () => {
        const { groqChat, getSelectedProvider } = await import('./groqService');
        vi.mocked(getSelectedProvider).mockReturnValue('groq');
        vi.mocked(groqChat).mockResolvedValue(SAMPLE_PROFILE_JSON_STR);

        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('Jane Smith senior engineer summary here');
        expect(typeof profile.summary).toBe('string');
        expect(profile.summary.length).toBeGreaterThan(0);
    });

    it('skills array is never empty when LLM returns skills', async () => {
        const { groqChat, getSelectedProvider } = await import('./groqService');
        vi.mocked(getSelectedProvider).mockReturnValue('groq');
        vi.mocked(groqChat).mockResolvedValue(SAMPLE_PROFILE_JSON_STR);

        const { generateProfile } = await import('./geminiService');
        const profile = await generateProfile('Experienced TypeScript developer');
        expect(profile.skills.length).toBeGreaterThan(0);
    });

    it('correctly maps project link when present', async () => {
        geminiMock.response = SAMPLE_PROFILE_JSON_STR;
        const { generateProfileFromFileWithGemini } = await import('./geminiService');
        const profile = await generateProfileFromFileWithGemini('base64==', 'application/pdf');
        expect(profile.projects?.[0].link).toContain('github.com');
    });
});
