# ProCV Design System — Canonical Token Reference

> **This is the single source of truth for colour, surface, typography, and component patterns.**  
> Every new component and every edit to an existing one must follow these tokens.  
> Do not invent new dark-mode colours. Do not use `dark:bg-zinc-900` for cards.

---

## 1. Brand Colours

| Token | Hex | Usage |
|---|---|---|
| Navy `NAVY` | `#1B2B4B` | Primary CTA bg (light), sidebar bg (dark theme), headings, logo |
| Gold `GOLD` | `#C9A84C` | Active states, CTA bg (dark mode), progress rings, highlights |
| Cream | `#F8F7F4` | Page background (light mode) |

---

## 2. Surface Hierarchy (Light → Dark)

The dark-mode surfaces follow a deliberate depth stack. **Never skip levels.**

| Level | Light | Dark | Usage |
|---|---|---|---|
| **Page / app bg** | `bg-[#F8F7F4]` | `dark:bg-neutral-900` | The root wrapper (`#171717`) |
| **Card / panel** | `bg-white` | `dark:bg-neutral-800` | Every card, modal, drawer (`#262626`) |
| **Nested surface** | `bg-zinc-50` | `dark:bg-neutral-700/50` | Inner rows, sub-cards, table rows |
| **Input / textarea** | `bg-white` | `dark:bg-neutral-900` | Form controls sit _below_ the card |
| **Tag / chip** | `bg-zinc-100` | `dark:bg-neutral-700` | Inline chips, status badges |
| **Sidebar** | `bg-white border-r` | `background: #111111` | Hardcoded via `DARK_BG` in AppSidebar |

### ❌ Never use for cards
- `dark:bg-zinc-900` — nearly identical to the page bg, produces zero contrast
- `dark:bg-neutral-900` — same depth as the page, use only for inputs/textareas
- `dark:bg-zinc-800` — use `neutral-800` instead (consistent naming)

---

## 3. Border Tokens

| Usage | Light | Dark |
|---|---|---|
| **Card border** | `border-zinc-200` | `dark:border-neutral-700` |
| **Inner divider** | `border-zinc-100` | `dark:border-neutral-800` |
| **Input border** | `border-zinc-200` | `dark:border-neutral-700` |
| **Focus ring** | `ring-[#C9A84C]/50` | same |
| **Gold accent border** | `border-[#C9A84C]/30` | `dark:border-[#C9A84C]/20` |

---

## 4. Typography Tokens

| Role | Light | Dark |
|---|---|---|
| **H1 / page title** | `text-zinc-900` | `dark:text-zinc-50` |
| **H2 / card title** | `text-zinc-800` | `dark:text-zinc-100` |
| **Body / label** | `text-zinc-700` | `dark:text-zinc-200` |
| **Secondary / caption** | `text-zinc-500` | `dark:text-zinc-400` |
| **Muted / placeholder** | `text-zinc-400` | `dark:text-zinc-500` |
| **Section label (caps)** | `text-zinc-400` | `dark:text-zinc-500` |
| **Link / action** | `text-[#1B2B4B]` | `dark:text-[#C9A84C]` |

> **Rule**: muted labels (`text-zinc-400`) get _lighter_ in dark mode (`dark:text-zinc-500`) because zinc-500 is medium grey on a dark surface. Do NOT invert this.

---

## 5. Button Tokens

### Primary (Navy → Gold flip)
```
bg-[#1B2B4B] dark:bg-[#C9A84C]
text-white    dark:text-[#1B2B4B]
hover:opacity-90 transition-opacity active:scale-[0.98]
rounded-xl font-bold
```

### Secondary (outlined)
```
border border-zinc-200 dark:border-neutral-700
text-zinc-600 dark:text-zinc-300
bg-transparent hover:bg-zinc-50 dark:hover:bg-neutral-700
rounded-xl font-semibold
```

### Ghost / link-style
```
text-[#1B2B4B] dark:text-[#C9A84C]
hover:underline font-semibold
```

### Destructive
```
bg-red-600 text-white hover:bg-red-700
dark: same (red works on both surfaces)
```

---

## 6. Card Shell

Use this exact pattern for every card in the app:

```tsx
<div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm">
```

For clickable cards add:
```
cursor-pointer hover:shadow-md transition-shadow
```

For nested/inner panels inside a card:
```tsx
<div className="bg-zinc-50 dark:bg-neutral-700/40 rounded-xl border border-zinc-100 dark:border-neutral-700">
```

---

## 7. Section / Page Label

```tsx
<h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
  Section Title
</h2>
```

---

## 8. Input / Textarea

```tsx
<input className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-neutral-700
  bg-white dark:bg-neutral-900
  text-zinc-900 dark:text-zinc-50
  placeholder:text-zinc-400
  focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]
  transition" />
```

---

## 9. Status / Semantic Colours

These work in both modes without changes:

| State | Classes |
|---|---|
| Success / green | `text-emerald-600 dark:text-emerald-400` · `bg-emerald-50 dark:bg-emerald-900/20` |
| Warning / amber | `text-amber-600 dark:text-amber-400` · `bg-amber-50 dark:bg-amber-900/15` |
| Error / red | `text-red-600 dark:text-red-400` · `bg-red-50 dark:bg-red-900/15` |
| Info / blue | `text-blue-600 dark:text-blue-400` · `bg-blue-50 dark:bg-blue-900/15` |

---

## 10. Gold / Navy Tints (transparent overlays)

For subtle tint backgrounds, use opacity variants so they read correctly in both modes:

| Purpose | Class |
|---|---|
| Gold tint bg | `bg-[#C9A84C]/10` (light) · `bg-[#C9A84C]/10` (dark — same, works) |
| Navy tint bg | `bg-[#1B2B4B]/8` (light) · avoid in dark — switch to `bg-[#C9A84C]/10` |
| Gold ring/border | `border-[#C9A84C]/30 dark:border-[#C9A84C]/20` |

---

## 11. Page Wrapper

Every authenticated view that goes through `AppViewRouter` is wrapped with:
```tsx
<div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1380px] mx-auto">
```

The root app wrapper sets:
```tsx
<div className="bg-[#F8F7F4] dark:bg-neutral-900 text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
```

---

## 12. Common Anti-Patterns to Avoid

| ❌ Wrong | ✅ Correct |
|---|---|
| `dark:bg-zinc-900` on a card | `dark:bg-neutral-800` |
| `style={{ background: '#1B2B4B' }}` on a button | `className="bg-[#1B2B4B] dark:bg-[#C9A84C] text-white dark:text-[#1B2B4B]"` |
| `dark:border-neutral-800` as main card border | `dark:border-neutral-700` |
| Mixing `zinc-*` and `neutral-*` for the same semantic role | Pick one — use `neutral-*` for dark surfaces, `zinc-*` for light |
| `text-zinc-500 dark:text-zinc-400` for section labels | `text-zinc-400 dark:text-zinc-500` (labels are lighter than body copy) |
| `dark:bg-neutral-900` for card (same as page bg) | `dark:bg-neutral-800` |
