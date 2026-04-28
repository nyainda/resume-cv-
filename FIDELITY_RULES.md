# Source Fidelity Rules (Enforced)

The CV generation pipeline applies deterministic source-lock rules in
`services/geminiService.ts::applySourceFidelityRules(...)`.
To avoid scattered/competing post-processing, all major CV mutation paths now
pass through `services/geminiService.ts::finalizeCvData(...)`.

Number-fidelity helpers live in `services/cvNumberFidelity.ts` so they can
be unit-tested in isolation (`npm run test:numbers`).

## Rules currently enforced

1. Never add a skill/tool not already in source profile skills.
2. Never remove existing source skills.
3. Preserve source company names and job titles.
4. Preserve source start/end dates.
5. Strip generated numeric metric claims not grounded in source bullets.
   - "Grounded" means the same digit string appears in any source bullet,
     the professional summary, or any project description in the profile
     (with or without thousand-separators).
   - 4-digit calendar years (1900–2099) are always preserved.
   - The strip consumes the **entire** numeric phrase including currency
     prefix (`KES`, `$`, `€`), unit suffix (`%`, `x`, `m`, `k`), trailing
     `+`, and hyphenated noun (`-person`, `-day`, `-year`). This prevents
     the orphan-symbol garbage class:
     `KES , in revenue` / `by % from Dec 2023` / `a -person team` /
     `of + clients`.
   - Digits glued to a letter (`Q4`, `iPhone15`) are not stripped.
6. Preserve user custom sections (awards/certs when stored there).
7. Per-bullet fallback: when a generated bullet would come out broken
   after the number strip (empty, sentence-stub, or hollowed-out), it is
   replaced with the user's original profile bullet for the same role
   instead of being emitted as garbage. See
   `cvNumberFidelity.ts::repairBulletsAgainstSource`.
8. Voice fidelity (deterministic post-process, see
   `cvVoiceFidelity.ts`):
   - **No first-person pronouns.** "I", "I've", "I have", "I'm", "my",
     "we", "our", "us" are stripped from the summary and from every
     responsibility bullet. Where a pronoun starts a clause, the
     immediately-following verb is capitalised so the sentence still
     reads (`"I've combined data analysis to help farmers"` →
     `"Combined data analysis to help farmers"`). `"my"` is rewritten to
     `"the"` because `"their"` reads strangely outside first-person
     context.
   - **Tense consistency in the active role.** Bullets in the role with
     `endDate` of `Present` / `Current` / empty are normalised from
     third-person singular present (`Generates KES …`, `Delivers
     designs …`, `Maintains a 98% rate`) to base-form imperative
     (`Generate KES …`, `Deliver designs …`, `Maintain a 98% rate`).
     This matches the convention used by other bullets in the same role
     (`"Manage 15+ projects"`). Past roles are left untouched so
     legitimate past-tense bullets (`"Led the design …"`) survive.
     Verbs are converted only if they appear in a hand-curated allow
     list — unknown verbs are passed through to avoid converting nouns.
   - **Dangling time references** (`"with years delivering"`,
     `"of months across"`, `"for experience"`) are tidied at the end of
     the number strip, so a hallucinated number like `"with 5 years"`
     that gets removed does not leave a grammatically-broken phrase.

## Notes

- These checks are deterministic and run near the end of generation, before cache return.
- LLM improves language; deterministic guardrails protect factual integrity.
- `npm run test:numbers` runs the regression suite for rules 5, 7, and 8 (46 tests).
