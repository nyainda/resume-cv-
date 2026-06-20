---
name: Profile room isolation
description: How per-profile JD/targeting state isolation is implemented across CVGenerator, App.tsx, and ProfileManager. Includes three root-cause cross-profile contamination bugs and their fixes.
---

## The rule
Each `UserProfileSlot` is a fully isolated "room". JD, targeting, generation mode, keywords, purpose, cover letter, and diversity snapshot are stored in profile-scoped localStorage keys and written back to the slot object.

## Key storage keys (in CVGenerator.tsx)
- `p:${profileId}:jd` — job description
- `p:${profileId}:company` — target company
- `p:${profileId}:jobTitle` — target job title
- `p:${profileId}:mode` — generation mode (honest/boosted/aggressive)
- `p:${profileId}:purpose` — cv purpose (job/academic/general)
- `p:${profileId}:keywords` — jdTier1Keywords array
- `p:${profileId}:doctorPanelOpen`, `p:${profileId}:doctorDiff`
- `p:${profileId}:coverLetter` ← was global `'coverLetter'`, fixed June 2026
- `p:${profileId}:snapshot` ← was global `'cv:last_snapshot'`, fixed June 2026

Global keys that intentionally stay shared: `'cv:targetLanguage'`, `'template'`, `'sidebarSections'`, `'cvFont'`, `'scholarshipFormat'`

## Remount on switch
`CVGenerator` is rendered with `key={activeSlot?.id ?? 'default'}` in App.tsx. When the user switches profiles, the component fully remounts with the new profileId and `initial*` props populated from the incoming slot's stored values.

## Slot write-back (onSlotUpdate)
- `CVGenerator` runs a 1-second debounced `useEffect` on the six state values, calling `onSlotUpdate({...})` when they change.
- After a successful generation, `onSlotUpdate?.({ lastGeneratedAt: new Date().toISOString() })` is called immediately.
- `handleSlotUpdate` in App.tsx maps the partial update onto the matching profile in the `profiles` array via `setProfiles`.

## UserProfileSlot fields added (types.ts)
`jobDescription`, `cvPurpose`, `targetCompany`, `targetJobTitle`, `generationMode`, `jdKeywords`, `lastGeneratedAt`, `lastAtsScore`

## Three root-cause bugs fixed (June 2026)

### Bug 1: Cross-slot profile cache reuse via getHashIfCached
`getHashIfCached(compactJson)` searched ALL slots for a matching hash. A cloned profile B has the same compact JSON as profile A → same hash → the worker served A's D1-cached profile for B's generation → same LLM prompt → LLM cache returned A's generated CV for B.

**Fix**: `generateCV` now accepts optional `slotId` parameter. When provided, uses `getProfileCacheHash(slotId)` + SHA-256 re-verification (slot-specific) instead of the cross-slot scan. CVGenerator passes `profileId` as `slotId` to every `generateCV` call.

### Bug 2: Global keys bleeding between rooms
`'coverLetter'` and `'cv:last_snapshot'` were global localStorage keys shared by all profiles.

**Fix**: Changed to `p:${profileId}:coverLetter` and `p:${profileId}:snapshot` in CVGenerator.

### Bug 3: useStorage async race condition
The async IDB/Drive load (started on mount) could complete AFTER the user created a new profile slot and wrote it. The stale loaded value overwrote the fresh write: `JSON.stringify(prev) !== JSON.stringify(loaded) → setValue(loaded)`. This silently reset `profiles` and `activeProfileId` to old values.

**Fix**: Added `writeGenRef` (useRef counter) to `useStorage.ts`. `persist()` increments it. The async effect captures `capturedWriteGen` at load-start and only applies the loaded value if `writeGenRef.current === capturedWriteGen` (no writes happened during load).

**Why:** Without these fixes, newly-created or cloned rooms inherited profile data, cover letters, and CV snapshots from other rooms, causing wrong CVs to be generated and stale field detection ("Biosystems") to appear.

**How to apply:** Any new per-profile state in CVGenerator must use `p:${profileId}:someKey` and be included in the `onSlotUpdate` debounce effect. Never add a global localStorage key in CVGenerator.
