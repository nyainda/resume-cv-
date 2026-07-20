# Job Vault ("Rooms v2") — Full Build Spec

> Status: Pre-build. Read before writing any code.
> Author: Product review + codebase audit, July 2026.

---

## 1. What We're Actually Building

The existing `RoomsPage.tsx` is a **Profile Manager** — it lets users create separate career identities (e.g. "Software Engineer", "Finance"). That stays and becomes the **outer shell**.

What we're adding is a **Job Vault layer inside each Room**: a place to save, classify, and act on job descriptions without committing to a full CV build right away.

```
Rooms (career identities)
└── Room: "Software Engineer"
    ├── Profile (existing)
    └── Vault ← NEW
        ├── Saved JD: "Senior SWE @ Stripe" — 87% match
        ├── Saved JD: "Staff Eng @ Plaid" — 74% match — ⭐ Dream
        └── Saved JD: "Backend Eng @ Meta" — 62% match — Stretch
```

The Tracker (Tool #9) still exists for **active applications** (Applied/Interviewing/Offer/Rejected).
The Vault is for **pre-commitment capture** — everything before you hit "Apply."
They are complementary, not competing. A JD moves from Vault → Tracker when the user applies.

---

## 2. Decisions Made (Stop Treating These as Open)

### 2.1 D1 Schema

New table. Do not reuse the existing JD storage from the tailoring pipeline — that's ephemeral and session-tied.

```sql
-- Migration 041
CREATE TABLE IF NOT EXISTS vault_jobs (
  id           TEXT PRIMARY KEY,          -- client-gen UUID
  user_id      TEXT NOT NULL,             -- FK → users.id
  room_id      TEXT NOT NULL,             -- FK → profile slot ID (career identity)
  title        TEXT,
  company      TEXT,
  raw_jd       TEXT NOT NULL,             -- full extracted JD text (≤ 50KB)
  input_type   TEXT NOT NULL,             -- 'text' | 'url' | 'pdf' | 'image'
  source_url   TEXT,                      -- populated for URL ingestion
  match_score  INTEGER,                   -- 0–100, nullable until classified
  room_reason  TEXT,                      -- e.g. "Matched your Python + fintech track"
  room_type    TEXT NOT NULL DEFAULT 'primary', -- 'primary' | 'stretch' | 'uncategorized'
  deadline     TEXT,                      -- ISO date, nullable — only if extracted
  priority     TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'dream'
  status       TEXT NOT NULL DEFAULT 'saved', -- 'saved' | 'building' | 'applied' | 'expired'
  built_cv_id  TEXT,                      -- FK → saved_cvs.id, set when user builds
  fingerprint  TEXT,                      -- dedup hash: title+company+jd[:100]
  created_at   INTEGER NOT NULL,          -- unix seconds
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_vault_jobs_user  ON vault_jobs(user_id, created_at DESC);
CREATE INDEX idx_vault_jobs_room  ON vault_jobs(room_id, match_score DESC);
CREATE INDEX idx_vault_fingerprint ON vault_jobs(user_id, fingerprint);
```

### 2.2 Sync / Storage Strategy

Same as profile slots: **IDB-first, D1 sync on auth**. Vault JDs are user-scoped under `u_<userId>:vault_jobs`. Offline capture works without auth; syncs when connected. No KV caching needed — vault reads are infrequent.

### 2.3 Tier Gating

| Feature | Free | BYOK | Premium |
|---|---|---|---|
| Save a JD (any input type) | ✓ (10 slots max) | ✓ (unlimited) | ✓ (unlimited) |
| Auto room classification | ✗ (manual only) | ✓ | ✓ |
| Match score per JD | ✗ | ✓ | ✓ |
| Dwell reminders | ✗ | ✗ | ✓ |
| Deadline extraction + warnings | ✗ | ✓ | ✓ |
| Re-classify after profile update | ✗ | ✓ | ✓ |
| Quick gap analysis | ✗ | ✓ | ✓ |

Free users can save JDs and manually assign them to rooms. The value of BYOK is classification + insight, not capture.

### 2.4 URL Ingestion Scope

**v1: static pages only.** No Puppeteer/headless browser for URL scraping. Reasons:
- LinkedIn/Greenhouse/Lever actively block headless browsers.
- The existing Puppeteer path is optimized for PDF print, not DOM scraping.
- Silent failures on 70% of the most-common use case (job boards) are worse than a clear limitation.

v1 URL behavior: fetch the URL server-side via the CF Worker, strip boilerplate with a readability-style pass, hand to JD parser. If the page requires JS rendering, surface a "this page needs copy-paste" fallback gracefully.

### 2.5 Capture Sync: Optimistic, Classification Deferred

1. User submits a JD → **immediately saved** to IDB with `status: 'saved'`, `room_type: 'uncategorized'`.
2. Classification runs async (CF Worker call) → updates match_score + room_type in IDB and D1.
3. UI updates reactively when classification resolves. No blocking spinner.

### 2.6 Deduplication

Fingerprint = `sha1(title.toLowerCase() + company.toLowerCase() + rawJd.slice(0, 100))`.
Computed client-side at capture. If fingerprint already exists for this user → show "You already saved this role" with a link to the existing entry. No silent overwrite.

### 2.7 Open Question 4 → Answered

Re-classify Uncategorized JDs after profile updates: **yes, silent background pass**. Trigger: `onProfileUpdate` event in the profile sync hook. Re-run classifier only on `room_type: 'uncategorized'` entries for that user. Cheap (classifier is fast, no full generation).

---

## 3. Frontend Architecture

### 3.1 Files to Create

```
frontend/
├── components/
│   ├── VaultPage.tsx              ← full vault view (room selector + JD grid)
│   ├── VaultCapturePanel.tsx      ← JD input modal (text / URL / PDF / image)
│   ├── VaultJobCard.tsx           ← individual JD card
│   ├── VaultEmptyState.tsx        ← first-time / empty room state
│   └── VaultQuickActions.tsx      ← match score + gap analysis drawer
├── hooks/
│   └── useVaultJobs.ts            ← CRUD + IDB sync + D1 push
├── services/
│   └── vaultService.ts            ← save, classify, dedup, sync logic
└── types/
    └── vault.ts                   ← VaultJob type (or add to types.ts)
```

### 3.2 Files to Modify

| File | Change |
|---|---|
| `frontend/components/RoomsPage.tsx` | Add "Vault" tab alongside existing profile card. Room cards get a "Open Vault" button and a saved-job count badge. |
| `frontend/types.ts` | Add `VaultJob` type, `VaultRoomType`, `VaultJobStatus`, `VaultPriority`. |
| `frontend/hooks/useAppNavigation.ts` | Already has `'rooms'` view — no nav change needed. |
| `frontend/components/AppViewRouter.tsx` | Route `rooms` view to new tabbed `RoomsPage` (profile tab + vault tab). |
| `backend/cv-engine-worker/src/index.ts` | Add routes: `POST /api/vault/save`, `GET /api/vault/list`, `DELETE /api/vault/:id`, `POST /api/vault/classify`. |
| `backend/cv-engine-worker/src/migrations/` | Add migration 041 (vault_jobs table). |
| `frontend/components/CVGenerator.tsx` | Accept an optional `prefillJd?: string` prop so "Build CV" from a vault entry pre-fills the JD field. |

### 3.3 New Types

```typescript
// frontend/types.ts additions

export type VaultRoomType  = 'primary' | 'stretch' | 'uncategorized';
export type VaultJobStatus = 'saved' | 'building' | 'applied' | 'expired';
export type VaultPriority  = 'low' | 'medium' | 'high' | 'dream';
export type VaultInputType = 'text' | 'url' | 'pdf' | 'image';

export interface VaultJob {
  id:          string;
  roomId:      string;         // profile slot ID
  title:       string | null;
  company:     string | null;
  rawJd:       string;
  inputType:   VaultInputType;
  sourceUrl:   string | null;
  matchScore:  number | null;  // 0–100, null = not yet classified
  roomReason:  string | null;
  roomType:    VaultRoomType;
  deadline:    string | null;
  priority:    VaultPriority;
  status:      VaultJobStatus;
  builtCvId:   string | null;
  fingerprint: string;
  createdAt:   number;         // unix ms
  updatedAt:   number;
}
```

---

## 4. UI / UX Design Spec

### 4.1 Design Language (existing codebase rules)

- **Navy** `#1B2B4B`, **Gold** `#C9A84C` — primary brand tokens.
- Cards: `bg-white dark:bg-neutral-800`, `rounded-xl`, `border border-zinc-100 dark:border-neutral-700`, `hover:border-[#C9A84C]/50 hover:shadow-md transition-all`.
- Gold top stripe on active/premium cards: `h-0.5 bg-[#C9A84C]` (same pattern as Tracker's `AppCard`).
- Page header: `text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50`.
- Subtext: `text-sm text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed`.
- Modals: fixed overlay, `bg-black/50`, card `rounded-2xl bg-white dark:bg-neutral-900`.

---

### 4.2 Rooms Page — Revised Layout

The existing Rooms page becomes a **two-tab view**:

```
┌────────────────────────────────────────────────────────┐
│ Career Rooms                              [+ New Room]  │
│ Each room is a separate career identity…               │
│                                                        │
│  [👤 Profiles]   [📥 Job Vault]  ← TAB SWITCHER       │
└────────────────────────────────────────────────────────┘
```

**Tab 1 — Profiles**: Exact existing RoomsPage UI, unchanged.

**Tab 2 — Job Vault**: New VaultPage component, described below.

The room selector in the Vault tab mirrors the room cards from the Profiles tab but as a compact horizontal pill list:

```
Rooms:  [● Software Engineer ▾]  [Finance (3)]  [Stretch (1)]  [Uncategorized (2)]
```

Active room name is bolded with a gold underline. Job counts shown in each pill.

---

### 4.3 Vault Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Job Vault                                    [+ Save a Job]       │
│ Save JDs now, build CVs when ready.                               │
│                                                                   │
│  Room: [Software Engineer ▾]    Filter: [All ▾]  Sort: [Match ▾] │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ ████ Stripe  │  │ ████ Plaid   │  │ ████ Meta    │           │
│  │ Senior SWE   │  │ Staff Eng    │  │ Backend Eng  │           │
│  │ ●●●●●●●● 87% │  │ ●●●●●●○○ 74%│  │ ●●●●●○○○ 62%│           │
│  │ Primary      │  │ ⭐ Dream     │  │ Stretch      │           │
│  │ 3d ago       │  │ Today        │  │ 1w ago       │           │
│  │              │  │ ⏰ 5d left   │  │              │           │
│  │ [Quick Check]│  │ [Build CV →] │  │ [Quick Check]│           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                   │
│  [Empty state if no jobs]                                        │
└──────────────────────────────────────────────────────────────────┘
```

**Grid:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

---

### 4.4 VaultJobCard Design

```
┌─────────────────────────────────────────┐
│ ▌ (gold accent stripe — if Dream/high)  │  ← h-full w-1 left border
│                                         │
│  [S]  Stripe                    ⋯       │  ← company avatar (letter, colored)
│       Senior Software Engineer          │
│                                         │
│  ████████████████░░  87%  Primary       │  ← match bar + score + room type badge
│                                         │
│  🗓 Saved 3 days ago    ⏰ Closes Jul 28 │  ← meta row
│                                         │
│  [Quick Check]      [Build CV →]        │  ← action row
└─────────────────────────────────────────┘
```

**Card anatomy:**

- **Company avatar**: Same `CompanyAvatar` pattern from `Tracker.tsx` — letter + deterministic color from company name charCode.
- **Title**: `text-sm font-bold text-zinc-900 dark:text-zinc-50 line-clamp-2`
- **Match bar**: `h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700` background, gold fill proportional to score. Score number `text-xs font-bold text-[#C9A84C]`.
- **Room type badge**:
  - `primary` → `bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400`
  - `stretch` → `bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400`
  - `uncategorized` → `bg-zinc-100 text-zinc-500 dark:bg-neutral-700`
- **Priority indicator**: Left border accent `w-1` — gold for Dream, orange for High, transparent for others.
- **Deadline**: Red text + clock icon when ≤ 5 days. Grey when more. Hidden when no deadline.
- **"Not yet scored" state**: Match bar shows animated shimmer `animate-pulse bg-zinc-200` with "Analysing…" text while classification runs.

**Card states:**
- `status: 'applied'` → faint opacity `opacity-60`, "Applied ✓" badge overlaid top-right, no action buttons.
- `status: 'expired'` → strikethrough title + "May be expired" warning icon.
- `status: 'building'` → gold pulsing dot next to title, "CV in progress" label.

---

### 4.5 Capture Modal — "Save a Job"

Four tabs across the top: **Paste Text** · **URL** · **Upload PDF** · **Screenshot**

```
┌────────────────────────────────────────────────────────┐
│  Save a Job                                     ✕      │
│                                                        │
│  [Paste Text] [URL] [Upload PDF] [Screenshot]          │
│  ─────────────────────────────────────                 │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Paste the job description here…                  │  │
│  │                                                  │  │
│  │ (textarea, min-h-48, font-mono text-sm)          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Save to room:  [Software Engineer ▾]                  │
│  Priority:      [○ Low  ● Medium  ○ High  ○ Dream]     │
│                                                        │
│  [Cancel]                        [Save to Vault →]     │
└────────────────────────────────────────────────────────┘
```

**Tab: URL**
- Single URL input with paste button.
- Below input: small note "Works on static job pages. LinkedIn/Greenhouse may need copy-paste."
- Fetch + strip runs in the Worker on save — user doesn't wait for it before the modal closes.

**Tab: Upload PDF**
- Drag-and-drop zone (same pattern as import in `ProfileForm.tsx`).
- Max 5MB. Text extracted via existing PDF pipeline.

**Tab: Screenshot / Image**
- Drag-and-drop or file picker for PNG/JPEG.
- Sends to existing vision LLM path. Note: "Requires Gemini or Claude key."
- Show gate if neither key present.

**Post-save feedback:**
- Modal closes immediately.
- Toast: "Saved to Software Engineer vault · Analysing match…"
- Card appears in grid instantly with shimmer state.
- Toast updates ~2s later: "87% match · Primary room" (or "Could not classify — sorted to Uncategorized").

**Duplicate detection:**
- Fingerprint checked before save.
- If match: modal shows inline warning "You already saved this role 3 days ago — [View it]" instead of a second toast. Allow re-save with override button.

---

### 4.6 Quick Check Drawer (Right-side panel / bottom sheet on mobile)

Triggered by "Quick Check" button on a card. Slides in from the right on desktop, bottom sheet on mobile.

```
┌──────────────────────────────────────────────────────┐
│  ← Back          Stripe — Senior SWE          ✕      │
│──────────────────────────────────────────────────────│
│                                                      │
│  MATCH SCORE                                         │
│  ████████████████░░░░  87%                           │
│  "Strong match. Your Python, distributed systems,    │
│   and fintech experience directly match 9/12 key    │
│   requirements."                                     │
│                                                      │
│  GAPS (3 missing keywords)                           │
│  ● Kubernetes            ● gRPC                      │
│  ● System design at scale                            │
│                                                      │
│  STRENGTHS (from your profile)                       │
│  ✓ Python/FastAPI  ✓ Payment systems  ✓ API design   │
│                                                      │
│  DEADLINE                                            │
│  July 28, 2026 — 5 days left  ⚠                     │
│                                                      │
│  ────────────────────────────────────────────────    │
│  [Build Tailored CV →]    [Mark as Applied]          │
└──────────────────────────────────────────────────────┘
```

The match score and gaps are computed by a cheap worker call (not a full CV generation) — reuses the existing ATS scorer and keyword gap detector already in `cvEngineClient.ts`. Cached per-job after first fetch.

---

### 4.7 Empty State

First-time empty vault:

```
          📥
    Your Job Vault is empty

    Save job descriptions as you find them —
    no commitment to apply yet. ProCV will
    score each one against your profile and
    sort them into the right room.

         [Save your first job →]

    Or try:  [Paste text]  [From URL]  [Upload PDF]
```

Post-save but no JDs in *this* room (other rooms have some):

```
     No jobs saved to Software Engineer yet.

     You have 3 jobs in other rooms.
     [View all rooms]     [Save a job here →]
```

---

### 4.8 Notifications (Light-touch, in-app only for v1)

No push notifications in v1. In-app only, using the existing `useToast` pattern, plus a **Vault notification dot** on the Rooms nav icon (same pattern as unread counts in other apps).

Trigger conditions:
1. **New classification complete**: Toast "2 new jobs scored in Software Engineer vault"
2. **Dwell reminder** (Premium only): Shown once per JD after 14 days of no action. Small banner at the top of the vault card — not a toast. "Saved 14 days ago — still interested? [Keep] [Archive]"
3. **Deadline warning**: When a JD with an extracted deadline enters the 5-day window, the card's deadline text turns red and a `⚠` badge appears on the Rooms nav icon.

Rooms nav icon gets a small numeric badge `rounded-full bg-rose-500 text-white text-[9px]` when any deadline is within 5 days, or when unread classifications exist.

---

### 4.9 "Build CV" Flow

From a VaultJobCard → "Build CV →" button:

1. Navigate to `cv-generator` view.
2. Pre-fill the JD textarea with `rawJd` from the vault entry.
3. Pre-select the room's profile as the active profile.
4. Set `vaultJobId` in CV generator state so that on successful generation, `built_cv_id` is written back to the vault entry.
5. Vault card status updates to `building` (gold pulse dot).
6. After CV is saved, status updates to `built` and the card shows "CV built [date ago] · [View CV]".

This is a **pre-fill + navigation**, not a new modal. The CV Generator is unchanged except for the optional `prefillJd` and `vaultJobId` props.

---

## 5. Backend Routes

All routes require auth (`Authorization: Bearer <session-token>`).

```
POST   /api/vault/save
       Body: { roomId, rawJd, inputType, sourceUrl?, title?, company? }
       → classifies async, returns { id, fingerprint, isDuplicate?, existingId? }

GET    /api/vault/list?roomId=&status=&limit=&offset=
       → returns VaultJob[] sorted by created_at DESC

DELETE /api/vault/:id
       → soft-delete (status = 'archived'), not hard-delete

POST   /api/vault/:id/classify
       → re-runs classification for one job, updates match_score + room_type

POST   /api/vault/:id/quick-check
       → returns { matchScore, gaps, strengths, deadlineExtracted }
       → uses existing ATS scorer + keyword gap logic, cheaper than full CV gen

PATCH  /api/vault/:id
       Body: { priority?, status?, roomId? }
       → partial update (priority change, mark applied, move to different room)

POST   /api/vault/fetch-url
       Body: { url }
       → fetches URL server-side, strips boilerplate, returns { rawText, title?, company? }
       → 15s timeout, returns { error: 'js_rendered' } for pages that need JS
```

---

## 6. What to Add / Improve Beyond the Original Spec

These are additions on top of the original spec, justified by the codebase audit:

### 6.1 Vault → Tracker Bridge (High value, low cost)
A "Mark as Applied" action in the Vault (and in the Quick Check drawer) that auto-creates a `TrackedApplication` entry in the existing Tracker with the company, role, and a link back to the vault JD. One-click — no duplicate data entry.

### 6.2 JD Freshness Signal for URL-ingested Jobs
Store `sourceUrl` on URL-ingested jobs. Run a lightweight HEAD request (in the CF Worker) once per week per job — if the URL 404s or redirects to a homepage, mark status = `'expired'` and show "This link may be closed." No re-scrape, just a liveness check.

### 6.3 Profile-update Re-classification
When `onProfileUpdate` fires (already exists in profile sync hooks), re-run the classifier silently on all `room_type: 'uncategorized'` vault jobs for that user. Cheap call, no user action needed, makes the vault feel smart.

### 6.4 Keyboard Shortcut for Capture
`Cmd/Ctrl + Shift + V` opens the Capture Modal from anywhere in the app. Same pattern as existing keyboard shortcuts in `App.tsx`. The vault is only useful if capture friction is near-zero.

### 6.5 Browser PWA Share Target (v2 flag)
ProCV already has a PWA manifest. Adding a `share_target` entry lets users share a job URL directly to ProCV from Safari/Chrome on mobile — zero extra UI needed, one manifest.json change. Flag this for v2 but note it's a 20-line change.

---

## 7. Build Order (Sequenced, No Blocking Dependencies)

```
Phase 1 — Data layer (do first, everything depends on it)
  ├── Add VaultJob type to types.ts
  ├── Write D1 migration 041
  ├── Write vaultService.ts (IDB CRUD + fingerprint + dedup)
  └── Write useVaultJobs.ts hook

Phase 2 — Backend (parallel with Phase 1 after types are done)
  ├── POST /api/vault/save + classify worker call
  ├── GET  /api/vault/list
  ├── DELETE + PATCH /api/vault/:id
  ├── POST /api/vault/:id/quick-check
  └── POST /api/vault/fetch-url

Phase 3 — UI components (after Phase 1)
  ├── VaultJobCard.tsx
  ├── VaultEmptyState.tsx
  ├── VaultCapturePanel.tsx (modal, all 4 input tabs)
  ├── VaultQuickActions.tsx (drawer)
  └── VaultPage.tsx (assembles above)

Phase 4 — Integration
  ├── RoomsPage.tsx — add Vault tab
  ├── CVGenerator.tsx — add prefillJd prop
  ├── Tracker.tsx — accept pre-created entry from vault bridge
  └── Nav badge (deadline/unread dot on Rooms icon)

Phase 5 — Polish
  ├── Keyboard shortcut (Cmd+Shift+V)
  ├── Profile-update re-classification trigger
  └── URL liveness check (background, weekly)
```

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| URL ingestion fails on JS-rendered pages | High | Medium | Scope to static only, show graceful fallback |
| Classification adds latency to save flow | Low | Low | Already solved: save is instant, classify is async |
| Vault + Tracker confusion (two places for jobs) | Medium | High | Clear copy: Vault = pre-apply capture; Tracker = active pipeline |
| Vault slot count abuse on free tier | Low | Medium | Server-enforced limit at `/api/vault/save` |
| Dedup fingerprint collisions (two different roles same company) | Low | Low | Fingerprint includes first 100 chars of JD body — collision requires near-identical JDs |

---

## 9. Things That Don't Need to Be Built

- **"Best CV for this room" resolution logic** — deferred to v2, one JD per room for now.
- **Cross-room job merging** — don't touch this.
- **Push notifications** — in-app only for v1.
- **Custom room types** — auto-classification is enough, user can rename rooms if they want.
- **Public vault / shared job lists** — no cross-user data, ever.
