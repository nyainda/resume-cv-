---
name: Auth device ID key mismatch
description: Two different localStorage keys were used for device_id — one in auth context, one in cloud services. Fixed to use the shared getDeviceId() helper.
---

## Rule
Always use `getDeviceId()` from `services/userDataCloudService.ts` when sending `device_id` to the Cloudflare worker. Never read localStorage directly with a hardcoded key.

**Why:** `WorkerAuthContext.tsx` originally read `localStorage.getItem('procv:device_id')` — this key is never written anywhere, so every Google sign-in sent an empty `device_id` to the worker. The correct key (`'cv_builder:deviceId'`) is managed exclusively by `getDeviceId()` in `userDataCloudService.ts`, which also creates the UUID on first call.

**How to apply:** In any auth or cloud service that needs the device ID, import and call `getDeviceId()` — never use a raw `localStorage.getItem` with a device key string.
