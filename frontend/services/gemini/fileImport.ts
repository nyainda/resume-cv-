/**
 * Compatibility re-exports for file import paths.
 */
export {
  extractProfileTextFromFile,
  extractTextFromImage,
} from './fileImportExtract';
export {
  generateProfileFromFileWithGemini,
  generateProfileFromFileClaude,
  generateProfileFromFileWithGroq,
  generateProfileFromTextWithGemini,
} from './fileImportGenerate';
