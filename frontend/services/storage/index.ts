// services/storage/index.ts
// Single import point for everything storage-related.
// App code should only need:
//   import { getStorageService } from '@/services/storage';
// or the hook:
//   import { useStorage } from '@/hooks/useStorage';

export type { IStorageService } from './IStorageService';
export { LocalStorageService } from './LocalStorageService';
export {
  getStorageService,
  isDriveActive,
  resetStorageRouter,
} from './StorageRouter';
