---
name: getCVHtml contenteditable bug
description: Critical PDF bug — removing [contenteditable] elements wipes CV content; must strip attribute only
---

## The Rule
In `getCVHtml.ts`, NEVER remove `[contenteditable="true"]` DOM elements from the PDF clone. Strip the attribute in-place instead.

**Why:** When the user is in the CV editor (isEditing=true), every editable span/div/p has `contentEditable: true` set by the `editable()` helper in `TemplateV2.tsx`. These elements are the actual content containers for:
- Name (CVHeader)
- Job title (CVHeader)
- Summary paragraph (SummarySection)
- Bullet point text (Bullet component)
- Education degree + school (EducationSection)
- Any other inline-editable field

Removing those DOM elements strips the entire visible content from the PDF — the user sees a PDF with no name, no summary, no bullet text. The sections still render (headings, company names) but the body text vanishes.

**How to apply:**
```typescript
// WRONG — removes the element AND its content:
clone.querySelectorAll('[contenteditable="true"]').forEach(el => el.remove());

// CORRECT — strips the attribute, keeps the content:
clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => {
  el.removeAttribute('contenteditable');
  el.style.outline = '';   // editable() sets outline: none
  el.style.cursor = '';    // editable() sets cursor: text
});
```

This fix is in `frontend/services/getCVHtml.ts` and covers all download paths (editor, shared view, history modal, job pipeline modal) since they all use the same `getCVHtml` function.
