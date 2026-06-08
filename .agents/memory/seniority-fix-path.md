---
name: Seniority fix path format
description: Two different fieldLocation formats exist in the codebase; both must be handled by parseAuditPath.
---

## The rule
`cvSeniorityCoherence.ts` emits `fieldLocation` in dot-notation: `experience[N].responsibilities[M]`.
The rest of the audit system (cvNumberFidelity, humanizer) uses hash-notation: `experience[N] JobTitle @ Company#M`.
`parseAuditPath` in `aiInlineFix.ts` now handles both via `RX_EXPERIENCE` (hash) and `RX_EXPERIENCE_DOT` (dot).

**Why:** Before this fix, `applyFixToCv(cv, leak.fieldLocation, fixed)` returned the CV unchanged for all seniority leaks because the path was unrecognised — the "Fix with AI" button silently did nothing.

**How to apply:** Any new audit source that emits `fieldLocation` in a new format must add a corresponding regex to `parseAuditPath`. Always check both formats are handled before wiring a new leak type to a fix button.
