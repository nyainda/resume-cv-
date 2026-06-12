---
name: Profile room isolation
description: How per-profile JD/targeting state isolation is implemented across CVGenerator, App.tsx, and ProfileManager.
---

## The rule
Each `UserProfileSlot` is a fully isolated "room". JD, targeting, generation mode, keywords, and purpose are stored in profile-scoped localStorage keys and written back to the slot object.

## Key storage keys (in CVGenerator.tsx)
- `p:${profileId}:jd` — job description
- `p:${profileId}:company` — target company
- `p:${profileId}:jobTitle` — target job title
- `p:${profileId}:mode` — generation mode (honest/boosted/aggressive)
- `p:${profileId}:purpose` — cv purpose (job/academic/general)
- `p:${profileId}:keywords` — jdTier1Keywords array

## Remount on switch
`CVGenerator` is rendered with `key={activeSlot?.id ?? 'default'}` in App.tsx. When the user switches profiles, the component fully remounts with the new profileId and `initial*` props populated from the incoming slot's stored values.

## Slot write-back (onSlotUpdate)
- `CVGenerator` runs a 1-second debounced `useEffect` on the six state values, calling `onSlotUpdate({...})` when they change.
- After a successful generation, `onSlotUpdate?.({ lastGeneratedAt: new Date().toISOString() })` is called immediately.
- `handleSlotUpdate` in App.tsx maps the partial update onto the matching profile in the `profiles` array via `setProfiles`.

## UserProfileSlot fields added (types.ts)
`jobDescription`, `cvPurpose`, `targetCompany`, `targetJobTitle`, `generationMode`, `jdKeywords`, `lastGeneratedAt`, `lastAtsScore`

**Why:** Without profile-scoped keys and key={id} remount, switching profiles silently carried the previous JD/targeting into the new room, causing wrong CVs to be generated.

**How to apply:** Any new per-profile state in CVGenerator must use `p:${profileId}:someKey` as the localStorage key and be included in the `onSlotUpdate` debounce effect.
