# Source Fidelity Rules (Enforced)

The CV generation pipeline applies deterministic source-lock rules in
`services/geminiService.ts::applySourceFidelityRules(...)`.
To avoid scattered/competing post-processing, all major CV mutation paths now
pass through `services/geminiService.ts::finalizeCvData(...)`.

## Rules currently enforced

1. Never add a skill/tool not already in source profile skills.
2. Never remove existing source skills.
3. Preserve source company names and job titles.
4. Preserve source start/end dates.
5. Strip generated numeric metric claims not grounded in source bullets.
6. Preserve user custom sections (awards/certs when stored there).

## Notes

- These checks are deterministic and run near the end of generation, before cache return.
- LLM improves language; deterministic guardrails protect factual integrity.
