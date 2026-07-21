import type { ProfileColor, UserProfileSlot } from '../types';
import type { RawSlot } from '../services/authService';
import { normalizeUserProfile, normalizeCVData } from './cvDataUtils';

export const PROFILE_COLORS: ProfileColor[] = [
  'indigo',
  'violet',
  'emerald',
  'amber',
  'rose',
  'sky',
];

export function colorBg(c: ProfileColor): string {
  const map: Record<ProfileColor, string> = {
    indigo: 'bg-[#1B2B4B]',
    violet: 'bg-violet-600',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
  };
  return map[c];
}

export function navTimeAgo(iso?: string): string {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)        return 'just now';
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function parseSlotData(
  s: RawSlot | { slot_id: string; slot_name: string; color: string; profile_json: string },
): UserProfileSlot | null {
  try {
    const parsed = JSON.parse(s.profile_json);
    if (!parsed || typeof parsed !== 'object') return null;
    const isPayload =
      'profile' in parsed && ('savedCVs' in parsed || 'savedCoverLetters' in parsed);
    const rawProfile = isPayload ? (parsed.profile ?? {}) : parsed;
    const profile = normalizeUserProfile(rawProfile) ?? rawProfile;

    // currentCV is restored from D1 when present (syncSlot now includes it for
    // cross-device restore). If absent (e.g. payload was too large and it was
    // stripped, or this is an older slot synced before this feature shipped),
    // fall back to undefined so the local IDB/localStorage version is used.
    const restoredCV = isPayload && parsed.currentCV && typeof parsed.currentCV === 'object'
      ? parsed.currentCV
      : undefined;

    return {
      id:                s.slot_id,
      name:              s.slot_name,
      color:             (s as any).color ?? 'indigo',
      profile,
      currentCV:         restoredCV,
      savedCVs:          isPayload ? (parsed.savedCVs          ?? []) : [],
      savedCoverLetters: isPayload ? (parsed.savedCoverLetters ?? []) : [],
      trackedApps:       isPayload ? (parsed.trackedApps       ?? []) : [],
      starStories:       isPayload ? (parsed.starStories       ?? []) : [],
      // Restore build report from D1 so fixed annotations don't reappear on this device.
      lastBuildReport:   isPayload && parsed.lastBuildReport ? parsed.lastBuildReport : undefined,
    } as UserProfileSlot;
  } catch {
    return null;
  }
}
