// hooks/useBootEffects.ts
// Runs all one-time app-boot side effects: model pre-warming, rule fetching,
// queue flushing, dark-mode toggle, prefs sync, and Drive error notifications.

import { useEffect } from 'react';
import { loadRules } from '../services/geminiService';
import { prewarmFontEmbedCache } from '../services/getCVHtml';
import { prefetchVersions as prefetchPromptVersions } from '../services/promptRegistryClient';
import { prefetchRuleConfigs } from '../services/ruleRegistryClient';
import { sanitiseStaleQueue, enqueuePrefsSync, flushSyncQueue } from '../services/storage/syncQueue';
import { useToast } from './useToast';

interface UseBootEffectsConfig {
  darkMode: boolean;
  isAuthenticated: boolean;
  setIsPricingOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
}

export function useBootEffects({
  darkMode,
  isAuthenticated,
  setIsPricingOpen,
  setIsSettingsOpen,
}: UseBootEffectsConfig): void {
  const toast = useToast();

  // Fetch CV pipeline rules from the CF Worker at boot
  useEffect(() => {
    loadRules().catch(() => {});
  }, []);

  // Boot-time pre-warming: sanitise stale queue, warm fonts,
  // fetch prompt versions and rule configs
  useEffect(() => {
    sanitiseStaleQueue();
    prewarmFontEmbedCache();
    prefetchPromptVersions();
    prefetchRuleConfigs();
  }, []);

  // Apply dark mode class to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!darkMode);
  }, [darkMode]);

  // Sync user preferences to CF D1 whenever auth state or dark mode changes
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      enqueuePrefsSync({
        aiProvider:      localStorage.getItem('cv_builder:aiProvider') ?? undefined,
        cvPurpose:       localStorage.getItem('cv:purpose') ?? undefined,
        targetCompany:   localStorage.getItem('cv:targetCompany') ?? undefined,
        targetJobTitle:  localStorage.getItem('cv:targetJobTitle') ?? undefined,
        jdKeywords:      localStorage.getItem('cv:jdKeywords') ?? undefined,
        sidebarSections: localStorage.getItem('cv_builder:sidebarSections') ?? undefined,
        darkMode:        !!darkMode,
      }).catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, isAuthenticated]);

  // Flush IDB sync queue when browser comes back online or tab regains focus.
  // flushSyncQueue is rate-limited internally so these handlers never hammer CF.
  useEffect(() => {
    const onOnline = () => { flushSyncQueue('online').catch(() => {}); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        flushSyncQueue('visibility').catch(() => {});
      }
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Allow any component to open the pricing modal via a custom event
  useEffect(() => {
    const handler = () => setIsPricingOpen(true);
    window.addEventListener('procv:openPricing', handler);
    return () => window.removeEventListener('procv:openPricing', handler);
  }, [setIsPricingOpen]);

  // Allow any component to open the settings modal via a custom event
  useEffect(() => {
    const handler = () => setIsSettingsOpen(true);
    window.addEventListener('procv:openSettings', handler);
    return () => window.removeEventListener('procv:openSettings', handler);
  }, [setIsSettingsOpen]);
}
