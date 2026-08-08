# geminiService modules

Extracted from the monolithic `geminiService.ts` for readability.
**No intentional logic changes** — structural split only.

| Module | Responsibility |
|--------|----------------|
| `polishStage.ts` | Polish progress UI events |
| `bannedPhrasesPrompt.ts` | Banned-phrase prompt helper |
| `varianceHelpers.ts` | Fisher-Yates shuffle |
| `cvGenerationCache.ts` | In-memory generation cache |
| `preGeneration.ts` | Currency, seniority, scenario, domain, gaps, mode prompts |
| `rulesState.ts` | Runtime rules from CF Worker (`loadRules`) |
| `multimodalClients.ts` | Gemini/Claude multimodal clients |
| `profileSerialize.ts` | compactProfile, JD truncate, similarity |
| `coverLetter.ts` | Cover letter generation |
| `interviewQA.ts` | Interview Q&A |
| `applicationEmail.ts` | Application emails |
| `jobKeywords.ts` | JD keyword analysis |
| `fieldEnhancers.ts` | Summary/bullet/project enhancers |
| `scholarship.ts` | Scholarship essays |
| `cvCheck.ts` | Check CV against job |
| `thankYouLetter.ts` | Thank-you letters |
| `smartCoverLetter.ts` | Smart cover letter |
| `paraphrase.ts` | Tone paraphrase |
| `coachingFixes.ts` | One-click coaching fixes |
| `scoreCV.ts` | CV scoring |
| `jobAnalysisEnhanced.ts` | Enhanced job analysis |

Public API remains `import { … } from './geminiService'`.
