---
name: CV preview zoom and one-page mode
description: Zoom controls (autoFitScale + zoomOverride) and onePage mode (CVData.onePage, forced compact density, visual boundary)
---

## Zoom controls (CVGenerator.tsx)

Two separate state variables drive the preview scale:
- `autoFitScale` — set only by the ResizeObserver; fits the A4 width to the available container
- `zoomOverride` — null by default (auto-fit); set to a specific number when the user manually zooms

`previewScale = zoomOverride ?? autoFitScale` — synced via `useEffect([autoFitScale, zoomOverride])`.

**Why separate:** The old single `previewScale` state was set directly by ResizeObserver, making manual overrides impossible (they'd be stomped on next resize event).

**How to apply:**
- `handleZoomIn/Out`: adjust `zoomOverride` by `±0.15`, clamped to `[0.25, 1.75]`
- `handleZoomReset`: set `zoomOverride = null` → reverts to auto-fit
- `paperAreaRef` gets `overflowX: 'auto'` when `zoomOverride > autoFitScale` so the user can scroll horizontally when zoomed in
- Zoom button display: show `"FIT"` when `zoomOverride === null`; show `"N%"` otherwise (where N = `Math.round(previewScale * 100)`)

## One-page mode (CVData.onePage)

`onePage?: boolean` in `CVData` interface (types.ts).

**Template behaviour (TemplateV2.tsx):**
- Forces density to `compact` (or `balanced` if content was only `spacious`) — tighter spacing to maximise content fit
- Renders `<OnePageBoundary />` inside each layout's outermost `div` (which needs `position: 'relative'`)
- `OnePageBoundary` is a `position: absolute; top: 297mm` element — CSS `mm` units give exact A4 height regardless of zoom level
- Has `data-pdf-hide="true"` so `getCVHtml.ts` strips it before PDF capture — the red dashed line never appears in downloaded PDFs

**Generator UI:**
- Toggle switch in the customisation panel below accent colour
- Updates `currentCV.onePage` and syncs to D1 like other CV settings

**What onePage does NOT do:** It does not clip or hide content that overflows. The boundary line shows the user where page 1 ends; they must manually trim content to fit. This is intentional — never hide user-written content.
