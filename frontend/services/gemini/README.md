# geminiService modules

Split from the monolithic `geminiService.ts` for readability.
**No intentional logic changes.**

`../geminiService.ts` is a thin ~80-line barrel that re-exports the public API.

| Module | Lines (approx) | Responsibility |
|--------|----------------|----------------|
| `generateCVCore.ts` | ~1.5k | Main `generateCV` orchestrator |
| `fidelityAndGuardian.ts` | ~800 | Source fidelity + silent guardian + finalize |
| `validatorHumanizer.ts` | ~600 | Post-gen validator + banned filter |
| `preGeneration.ts` | ~570 | Currency, seniority, scenario, gaps |
| `qualityPolish.ts` | ~470 | `runQualityPolishPasses` |
| `profileGeneration.ts` | ~350 | humanize, generateProfile, parse |
| `optimizeImprove.ts` | ~340 | optimize, improve, polish, GitHub CV |
| `fileImport.ts` | ~320 | PDF/image profile import |
| + feature modules | smaller | cover letter, coaching, scholarship, etc. |

Import from the barrel only:

```ts
import { generateCV, loadRules, improveCV } from './geminiService';
```
