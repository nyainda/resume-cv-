export let CV_DATA_SCHEMA = '';
export let _cvDataSchema = '';

/**
 * Pipeline rules loaded from CF Worker at runtime (not bundled).
 */

// ─── Pipeline Rules — loaded from CF Worker at runtime (not bundled) ──────────
// These variables are populated by loadRules() called from App.tsx at boot.
// The actual strings live inside the compiled Cloudflare Worker (index.ts) and
// are fetched once per session via rulesService.ts. This means DevTools will
// never show the proprietary prompt engineering in the JS bundle or source map.
// Until loadRules() resolves, these are empty — generation functions wait for
// the rules to be ready before assembling any prompts.
export let HUMANIZATION_RULES = '';
export let HUMANIZATION_CHECKLIST = '';
export let SYSTEM_INSTRUCTION_PROFESSIONAL = '';
export let SYSTEM_INSTRUCTION_PARSER = '';
export let SYSTEM_INSTRUCTION_HUMANIZER = '';
export let _validatorSystem = '';
export let _auditSystem = '';
// Generation IP — scenario blocks, pivot template, humanization header,
// critical rules reminder, and CV data schema (all fetched from Worker).
export let _scenarioA = '';
export let _scenarioB = '';
export let _scenarioC = '';
export let _scenarioD = '';
export let _scenarioModeOverride = '';
export let _pivotBlockTemplate = '';
export let _humanizationInstructionHeader = '';
export let _criticalRulesReminder = '';

/**
 * Fetches the CV pipeline rules from the CF Worker and populates the module-
 * level variables used by generateCV, humanizeCV, validateCV, etc.
 * Called once at app boot from App.tsx — safe to call multiple times (noop
 * after first successful load). Also exported so Settings modal can force a
 * reload after a worker URL change.
 */
export async function loadRules(): Promise<void> {
    const { fetchCVRules } = await import('../rulesService');
    const rules = await fetchCVRules();
    HUMANIZATION_RULES          = rules.humanizationRules;
    HUMANIZATION_CHECKLIST      = rules.humanizationChecklist;
    SYSTEM_INSTRUCTION_PROFESSIONAL = rules.systemProfessional;
    SYSTEM_INSTRUCTION_PARSER   = rules.systemParser;
    SYSTEM_INSTRUCTION_HUMANIZER = rules.systemHumanizer;

    // Prompt Vault — register templates so proxyLLMCall sends only the key
    // for Claude/Gemini calls instead of the full system prompt text.
    const { registerSystemTemplate } = await import('../groqService');
    registerSystemTemplate(rules.systemProfessional, 'professional');
    registerSystemTemplate(rules.systemHumanizer,    'humanizer');
    registerSystemTemplate(rules.systemParser,       'parser');
    _validatorSystem             = rules.systemValidator;
    _auditSystem                 = rules.systemAudit;
    // Generation IP
    _scenarioA                       = rules.scenarioA;
    _scenarioB                       = rules.scenarioB;
    _scenarioC                       = rules.scenarioC;
    _scenarioD                       = rules.scenarioD;
    _scenarioModeOverride            = rules.scenarioModeOverride;
    _pivotBlockTemplate              = rules.pivotBlockTemplate;
    _humanizationInstructionHeader   = rules.humanizationInstructionHeader;
    _criticalRulesReminder           = rules.criticalRulesReminder;
    _cvDataSchema                    = rules.cvDataSchema;
    CV_DATA_SCHEMA                   = rules.cvDataSchema;

    // Propagate humanization rules to cvDoctorService so every Doctor LLM
    // fix call (rewriteAllFlaggedBullets, rewriteBulletOptions) enforces the
    // same pipeline rules as CV generation — not ad-hoc prompts.
    const { setDoctorRules } = await import('../cvDoctorService');
    setDoctorRules(rules.humanizationRules);
}

