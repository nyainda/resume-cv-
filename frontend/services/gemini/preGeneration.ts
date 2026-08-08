/**
 * Compatibility re-exports for pre-generation helpers.
 */
export {
  _normalizeCurrencyInCV,
  detectCurrency,
  detectSeniority,
  detectScenario,
  classifyDomains,
  detectDomainPivot,
  detectMarket,
  detectGaps,
  type GapInfo,
} from './preGenDetect';
export {
  buildPivotBlock,
  buildScenarioBlock,
  buildGapContext,
  buildMetricsCeiling,
  buildModePromptBlock,
} from './preGenBlocks';
