/**
 * Compatibility re-exports — prefer importing from the specific modules.
 */
export {
  buildStaleProfileRefreshInstruction,
  applySourceFidelityRules,
  applyFidelityAgainstSourceCV,
} from './sourceFidelity';
export {
  _expandHollowBullets,
  _repairGerundTruncations,
  _trimBulletAtBoundary,
  _runSilentQualityGuardian,
} from './silentGuardian';
export { finalizeCvData } from './finalizeCvData';
