# App.tsx Refactor Roadmap

**Current state:** 2,867 lines · 57 imports · 79 hooks (useState/useEffect/useCallback)  
**Goal:** Break into focused files of ≤300 lines each, each with a single clear responsibility.  
**Approach:** Extract one piece at a time, run the app after each step, never rewrite from scratch.

---

## Current Map — What Lives in App.tsx Today

| Lines | Section | Content |
|-------|---------|---------|
| 1–95 | Imports | 57 imports — components, services, hooks, types |
| 96–255 | Providers & root wrapper | `GoogleAuthProvider`, `WorkerAuthProvider`, `AppInner` split |
| 256–330 | Auth / session state | `authModalMode`, session token sync, account-switch guard, cross-tab guard |
| 331–490 | Restore flows | Drive restore state + effect, D1 restore state + effect |
| 491–617 | Boot effects | Prewarm fonts, prompt registry, rule configs, IDB migration, GC prune |
| 618–692 | Per-profile isolated state | `savedCVs`, `savedCoverLetters`, `trackedApps`, `starStories` — all derived from active slot |
| 693–740 | API / display settings state | `apiSettings`, `isEditingProfile`, `showLanding`, flags |
| 741–975 | UI / modal state | 20+ boolean flags, `isMobile`, resize listener, click-outside effects |
| 975–1005 | API settings handler | `handleApiSettingsSave` — encryption + persist |
| 1006–1270 | Profile handlers | `handleProfileSave`, `handleCreateProfile`, `handleSwitchProfile`, `handleDeleteProfile`, `handleRenameProfile`, `handlePinField`, `handleSlotUpdate`, `handleDeleteAccount` |
| 1271–1573 | CV handlers | `handleSaveCV`, `handleSaveCVFromPipeline`, `handleSaveCoverLetter`, `handleDeleteCV`, `handleSaveStories`, `handleLoadCV`, `handleAutoTrack`, `handleApplyViaEmail`, `handleGoToInterviewPrep`, `handleGoToGenerator`, `handleGitHubCVGenerated`, `handleWordProfileImported` |
| 1574–1652 | JSON import flow | `pendingJsonImport` state + dialog logic + confirm handlers |
| 1653–1770 | Navigation / routing | `currentView` state, hash-based routing, `navItems`, `allMoreItems` |
| 1771–1825 | Derived values | `profileExists`, `activeSlot`, color badge effects |
| 1826–2200 | JSX — Navbar | Top bar, mobile menu, profile switcher, modals triggered from nav |
| 2200–2860 | JSX — Main layout | Two-column grid, view router (14 views), restore dialogs, JSON import dialog |
| 2861–2867 | Export | Root `App` with providers |

---

## Extraction Plan

Each task is independent enough to do one at a time. Do them in order — later tasks depend on earlier ones being done.

---

### TASK 1 — Extract `useProfileManager` hook
**File:** `frontend/hooks/useProfileManager.ts`  
**Move out of App.tsx:**
- Profile handlers: `handleProfileSave`, `handleCreateProfile`, `handleSwitchProfile`, `handleDeleteProfile`, `handleRenameProfile`, `handlePinField`, `handleUnpinField`, `handleSlotUpdate`, `handleDeleteAccount`
- `handleRestoreProfileBullets`
- Profile-derived state helpers: `setUserProfile`, `setCurrentCV`
- The D1 + Drive restore state and effects

**Returns:** `{ handlers, restoreState }` object consumed by AppInner  
**Estimated savings in App.tsx:** ~450 lines  

---

### TASK 2 — Extract `useCVManager` hook
**File:** `frontend/hooks/useCVManager.ts`  
**Move out of App.tsx:**
- `handleSaveCV`, `handleSaveCVFromPipeline`, `handleSaveCoverLetter`, `handleDeleteCV`, `handleSaveStories`, `handleLoadCV`
- `handleAutoTrack`, `handleApplyViaEmail`, `handleGoToInterviewPrep`, `handleGoToGenerator`, `handleGitHubCVGenerated`, `handleWordProfileImported`
- `setSavedCVs`, `setSavedCoverLetters`, `setTrackedApps`, `setStarStories`

**Returns:** `{ cvHandlers, letterHandlers, trackHandlers }` consumed by AppInner  
**Estimated savings in App.tsx:** ~320 lines  

---

### TASK 3 — Extract `useJsonImport` hook + `JsonImportDialog` component
**File:** `frontend/hooks/useJsonImport.ts` + `frontend/components/JsonImportDialog.tsx`  
**Move out of App.tsx:**
- `pendingJsonImport` state, `jsonImportTimestamp`
- `handleJsonProfileImported`, `handleConfirmUpdateCurrentProfile`, `handleConfirmCreateNewProfile`
- The entire JSON import confirmation dialog JSX (currently inline ~80 lines)

**Returns hook:** `{ pendingImport, onImported, onConfirmUpdate, onConfirmNew }`  
**Component receives:** `pendingImport` + callbacks as props, renders the dialog  
**Estimated savings in App.tsx:** ~100 lines  

---

### TASK 4 — Extract `useAppNavigation` hook
**File:** `frontend/hooks/useAppNavigation.ts`  
**Move out of App.tsx:**
- `currentView` state + type
- Hash-based routing effect (`window.addEventListener('hashchange', ...)`)
- `navItems` array definition
- `allMoreItems` array definition
- `isMoreActive` derived value

**Returns:** `{ currentView, setCurrentView, navItems, allMoreItems, isMoreActive }`  
**Estimated savings in App.tsx:** ~120 lines  

---

### TASK 5 — Extract `useBootEffects` hook
**File:** `frontend/hooks/useBootEffects.ts`  
**Move out of App.tsx:**
- Font cache prewarm effect
- Prompt registry prefetch effect
- Rule config prefetch effect
- IDB migration effect (`migrateToIDB`)
- Orphaned CV GC effect (`pruneOrphanedCVData`)
- Storage quota warning toast effect

**Returns:** nothing — pure side-effect hook, call once in AppInner  
**Estimated savings in App.tsx:** ~130 lines  

---

### TASK 6 — Extract `<AppNavbar>` component
**File:** `frontend/components/AppNavbar.tsx`  
**Move out of App.tsx:**
- The entire top navbar JSX (lines ~1826–2200, ~375 lines)
- Desktop nav items, mobile menu, profile manager trigger, settings/pricing buttons
- `showMoreMenu`, `showMobileMenu`, click-outside effects for those two menus

**Props it receives:** `currentView`, `setCurrentView`, `navItems`, `allMoreItems`, profile info, modal open handlers  
**Estimated savings in App.tsx:** ~380 lines  

---

### TASK 7 — Extract `<AppViewRouter>` component
**File:** `frontend/components/AppViewRouter.tsx`  
**Move out of App.tsx:**
- The main content view-switching block (lines ~2200–2860)
- All 14 view renders (`generator`, `saved`, `cover`, `tracker`, `email`, `interview`, `essays`, `history`, `toolkit`, `linkedin`, `score`, `career-pivot`, `account`, admin views)

**Props it receives:** `currentView`, all per-view props (passed through or via context)  
**Estimated savings in App.tsx:** ~660 lines  

---

### TASK 8 — Extract `useAuthSession` hook
**File:** `frontend/hooks/useAuthSession.ts`  
**Move out of App.tsx:**
- `authModalMode` state
- Session token sync effect
- Account-switch guard effect
- Cross-tab storage event guard effect

**Returns:** `{ authModalMode, setAuthModalMode }`  
**Estimated savings in App.tsx:** ~80 lines  

---

## What App.tsx Looks Like After All Tasks

```
frontend/App.tsx                   ~300 lines
  — Providers (Google, Worker Auth)
  — AppInner: calls 6 hooks, renders <AppNavbar> + <AppViewRouter>
  — Modals: Settings, Pricing, Auth, Welcome, Restore dialogs
  — Root export

frontend/hooks/
  useProfileManager.ts             ~200 lines
  useCVManager.ts                  ~200 lines
  useJsonImport.ts                  ~60 lines
  useAppNavigation.ts              ~100 lines
  useBootEffects.ts                ~100 lines
  useAuthSession.ts                 ~60 lines

frontend/components/
  AppNavbar.tsx                    ~250 lines
  AppViewRouter.tsx                ~200 lines
  JsonImportDialog.tsx              ~80 lines
```

Total lines: roughly the same code — just distributed across 9 focused files instead of 1 massive one.

---

## Suggested Order of Execution

1. **TASK 5** (boot effects) — lowest risk, pure effects with no return value
2. **TASK 4** (navigation) — self-contained state, easy to test by clicking tabs
3. **TASK 8** (auth session) — small, isolated, clear boundary
4. **TASK 3** (JSON import) — fully contained feature with its own dialog
5. **TASK 2** (CV manager) — depends on profile slot shape being stable
6. **TASK 1** (profile manager) — largest chunk, do after CV manager is out
7. **TASK 6** (Navbar component) — do after navigation hook is extracted
8. **TASK 7** (view router) — do last; benefits from all hooks already extracted

---

## Rules for Each Task

- One task at a time, restart the app and verify it works before starting the next
- No logic changes — only move code, never rewrite it
- Keep the same function/variable names so diffs are readable
- If a hook needs more than 3 parameters from App.tsx, use a single config object
- Each extracted file gets a one-line comment at the top describing its responsibility
