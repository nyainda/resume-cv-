---
name: Smart sidebar routing gates
description: SidebarContent must gate publications/customSections with split flags to prevent duplication across columns
---

## The Rule
`SidebarContent` must always check the `split` flags before rendering any "smart-routed" section. **Always sidebar** sections (Skills, Languages, Certifications) need no gate — they never appear in MainContent. **Smart-routed** sections (Publications, Custom Sections, Education, Projects, Achievements, References) must be gated in **both** SidebarContent AND MainContent.

**Why:** `computeSmartSplit` decides which column each section goes to. MainContent correctly uses `!split?.pubsInSidebar` etc. to suppress sections destined for sidebar. But SidebarContent previously rendered Publications and Custom Sections unconditionally — when the split decided those sections were too long for the sidebar, they still appeared in the sidebar AND in main, duplicating the content.

**How to apply:**
- Any time you add a new section to `SidebarContent`, it must be wrapped with the corresponding `split.<sectionName>InSidebar` flag
- Any time you add a new section to `MainContent`, suppress it with `!split?.<sectionName>InSidebar`
- The invariant is: every section appears in exactly ONE column (sidebar XOR main)

Current split flags and their routing rules:
| Section | Sidebar if... |
|---|---|
| Education | ≤2 entries, no long descriptions |
| Projects | ≤2, short desc, ≤4 tech, no bullets |
| Achievements | ≤5, avg length ≤90 chars |
| References | ≤2 |
| Certifications | any exist (always sidebar) |
| Publications | ≤3, title ≤80 chars, ≤3 authors |
| Custom Sections | has items, no long descriptions/subtitles |
