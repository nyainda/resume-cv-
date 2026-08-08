/**
 * Polish sub-stage progress events for CVGenerationProgress UI.
 */

// ── Polish sub-stage progress event ──────────────────────────────────────────
// Fired inside runQualityPolishPasses so CVGenerationProgress can show
// per-substep detail while the 'polishing' stage is active.
export const POLISH_STAGE_EVENT = 'procv:polish-stage';
export type PolishStageId = 'humanizing' | 'purifying' | 'voice' | 'finalizing';
export interface PolishStagePayload { stage: PolishStageId }
export function _dispatchPolishStage(stage: PolishStageId) {
    try { window.dispatchEvent(new CustomEvent<PolishStagePayload>(POLISH_STAGE_EVENT, { detail: { stage } })); }
    catch { /* non-browser env — ignore */ }
}
