// ─── CV Font Pairings ─────────────────────────────────────────────────────────
// Each pairing overrides a V2 theme's `fontHeading` / `fontBody` when the user
// selects it from the Font Pairing picker. The property names (`heading`, `body`)
// must stay in sync with the stub in TemplateV2.tsx that reads `fp.heading` /
// `fp.body`.
//
// All fonts listed here must be loaded in `frontend/index.html` via Google Fonts.

export interface FontPairing {
  /** Key stored in CVData.fontPairing. 'default' means use the theme's built-in fonts. */
  id: string;
  /** Display name shown in the picker and tooltip. */
  name: string;
  /** One-word style label shown below the name in the chip. */
  description: string;
  /** CSS font-family for heading elements (name, section titles). Empty = use theme default. */
  heading: string;
  /** CSS font-family for body text (bullets, meta, tags). Empty = use theme default. */
  body: string;
  /** Broad style category — used for visual grouping if needed. */
  category: 'sans' | 'serif' | 'mixed' | 'mono';
}

export const FONT_PAIRINGS: FontPairing[] = [
  // ── Sentinel ──────────────────────────────────────────────────────────────
  {
    id: 'default',
    name: 'Theme Default',
    description: 'Designed for template',
    heading: '', // empty = use theme.fontHeading unchanged
    body: '',
    category: 'sans',
  },

  // ── Sans-serif pairs ──────────────────────────────────────────────────────
  {
    id: 'inter',
    name: 'Modern Sans',
    description: 'Clean · universal',
    heading: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
    category: 'sans',
  },
  {
    id: 'jakarta',
    name: 'Clean Pro',
    description: 'Geometric · fresh',
    heading: "'Plus Jakarta Sans', sans-serif",
    body: "'Plus Jakarta Sans', sans-serif",
    category: 'sans',
  },
  {
    id: 'raleway',
    name: 'Bold Modern',
    description: 'Stylish · distinctive',
    heading: "'Raleway', sans-serif",
    body: "'Raleway', sans-serif",
    category: 'sans',
  },
  {
    id: 'work-sans',
    name: 'Swiss',
    description: 'Minimal · functional',
    heading: "'Work Sans', sans-serif",
    body: "'Work Sans', sans-serif",
    category: 'sans',
  },
  {
    id: 'nunito',
    name: 'Warm',
    description: 'Friendly · rounded',
    heading: "'Nunito', sans-serif",
    body: "'Nunito', sans-serif",
    category: 'sans',
  },

  // ── Mixed pairs (serif heading + sans body) ───────────────────────────────
  {
    id: 'playfair-dm',
    name: 'Editorial Pro',
    description: 'Authoritative · classic',
    heading: "'Playfair Display', Georgia, serif",
    body: "'DM Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'lora-lato',
    name: 'Literary',
    description: 'Elegant · readable',
    heading: "'Lora', Georgia, serif",
    body: "'Lato', sans-serif",
    category: 'mixed',
  },
  {
    id: 'garamond',
    name: 'Academic',
    description: 'Scholarly · distinguished',
    heading: "'EB Garamond', Georgia, serif",
    body: "'Source Sans 3', sans-serif",
    category: 'mixed',
  },
  {
    id: 'merriweather',
    name: 'Newspaper',
    description: 'Bold · authoritative',
    heading: "'Merriweather', Georgia, serif",
    body: "'Open Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'ibm-plex',
    name: 'Technical',
    description: 'Precise · structured',
    heading: "'IBM Plex Serif', Georgia, serif",
    body: "'IBM Plex Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'cormorant',
    name: 'Luxury',
    description: 'Refined · executive',
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Proza Libre', sans-serif",
    category: 'mixed',
  },

  // ── Full-serif pairs ──────────────────────────────────────────────────────
  {
    id: 'crimson',
    name: 'Classic Serif',
    description: 'Timeless · literary',
    heading: "'Crimson Pro', Georgia, serif",
    body: "'Crimson Pro', Georgia, serif",
    category: 'serif',
  },

  // ── Monospace ─────────────────────────────────────────────────────────────
  {
    id: 'jetbrains',
    name: 'Dev Mono',
    description: 'Developer · precise',
    heading: "'JetBrains Mono', 'Fira Code', monospace",
    body: "'JetBrains Mono', 'Fira Code', monospace",
    category: 'mono',
  },

  // ── V2ThemePicker canonical pairings ──────────────────────────────────────
  // These IDs are used by V2ThemePicker.tsx and must match so TemplateV2
  // can look them up in FONT_PAIRING_MAP.
  {
    id: 'georgia-open',
    name: 'Traditional',
    description: 'Classic · readable',
    heading: "Georgia, 'Times New Roman', serif",
    body: "'Open Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'mono-inter',
    name: 'Developer',
    description: 'Code · precise',
    heading: "'JetBrains Mono', 'Fira Code', monospace",
    body: "'Inter', sans-serif",
    category: 'mono',
  },
  {
    id: 'raleway-inter',
    name: 'Geometric',
    description: 'Stylish · modern',
    heading: "'Raleway', sans-serif",
    body: "'Inter', sans-serif",
    category: 'sans',
  },
  {
    id: 'merriweather-lato',
    name: 'Classic Pro',
    description: 'Serif · timeless',
    heading: "'Merriweather', Georgia, serif",
    body: "'Lato', sans-serif",
    category: 'mixed',
  },
];

/** O(1) lookup map — used by TemplateV2 to resolve cvData.fontPairing. */
export const FONT_PAIRING_MAP: Record<string, FontPairing> =
  Object.fromEntries(FONT_PAIRINGS.map(p => [p.id, p]));

/** Returns the pairing for the given key, or null if key is missing / 'default'. */
export function getFontPairing(id: string | undefined): FontPairing | null {
  if (!id || id === 'default') return null;
  return FONT_PAIRING_MAP[id] ?? null;
}
