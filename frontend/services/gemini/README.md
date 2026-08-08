# geminiService modules

Structural split of the former monolithic `geminiService.ts`.
**No intentional logic or behaviour changes** — code was moved into smaller files only.

## Entry point

`../geminiService.ts` is a thin (~80-line) barrel. Import from there:

```ts
import { generateCV, loadRules, improveCV } from './geminiService';
```

## Layout

| Area | Modules |
|------|---------|
| **CV generation** | `generateCVCore.ts`, `cvJsonUtils.ts`, `qualityPolish.ts`, `voiceConsistency.ts` |
| **Fidelity / polish** | `sourceFidelity.ts`, `silentGuardian.ts`, `finalizeCvData.ts` |
| **Validation** | `postGenValidator.ts`, `bannedPhraseFilter.ts` |
| **Pre-generation** | `preGenDetect.ts`, `preGenBlocks.ts` |
| **Profile** | `profileGeneration.ts`, `profileSerialize.ts`, `fileImportExtract.ts`, `fileImportGenerate.ts` |
| **Optimize / improve** | `optimizeCVForJob.ts`, `polishExistingCV.ts`, `improveCV.ts`, `githubCV.ts` |
| **Features** | cover letter, interview, email, scholarship, coaching fixes, score, etc. |
| **Shims** | `preGeneration.ts`, `fidelityAndGuardian.ts`, `validatorHumanizer.ts`, `fileImport.ts`, `optimizeImprove.ts`, `coachingFixes.ts`, `fieldEnhancers.ts` re-export for compatibility |

Largest remaining unit is `generateCVCore.ts` (~1.5k) because `generateCV` is a single orchestrator function; only pure helpers (JSON repair) were lifted out without rewriting control flow.
