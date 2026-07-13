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

  // ── Extended sans-serif pairs ──────────────────────────────────────────────
  {
    id: 'space-grotesk',
    name: 'Digital',
    description: 'Geometric · techy',
    heading: "'Space Grotesk', sans-serif",
    body: "'DM Sans', sans-serif",
    category: 'sans',
  },
  {
    id: 'manrope',
    name: 'Precision',
    description: 'Variable · refined',
    heading: "'Manrope', sans-serif",
    body: "'Manrope', sans-serif",
    category: 'sans',
  },
  {
    id: 'sora-inter',
    name: 'Future',
    description: 'Futuristic · clean',
    heading: "'Sora', sans-serif",
    body: "'Inter', sans-serif",
    category: 'sans',
  },
  {
    id: 'outfit',
    name: 'Versatile',
    description: 'Balanced · universal',
    heading: "'Outfit', sans-serif",
    body: "'Outfit', sans-serif",
    category: 'sans',
  },

  // ── Extended mixed pairs ───────────────────────────────────────────────────
  {
    id: 'fraunces-nunito',
    name: 'Artisan',
    description: 'Optical serif · friendly',
    heading: "'Fraunces', Georgia, serif",
    body: "'Nunito', sans-serif",
    category: 'mixed',
  },
  {
    id: 'dm-serif-dm-sans',
    name: 'Editorial Modern',
    description: 'Display serif · precise',
    heading: "'DM Serif Display', Georgia, serif",
    body: "'DM Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'lora-source',
    name: 'Literary Pro',
    description: 'Warm serif · neutral',
    heading: "'Lora', Georgia, serif",
    body: "'Source Sans 3', sans-serif",
    category: 'mixed',
  },
  {
    id: 'spectral-lato',
    name: 'Scholar',
    description: 'Reading serif · clean',
    heading: "'Spectral', Georgia, serif",
    body: "'Lato', sans-serif",
    category: 'mixed',
  },

  // ── Batch 2: more sans-serif ───────────────────────────────────────────────
  {
    id: 'montserrat',
    name: 'Montserrat',
    description: 'Geometric · bold',
    heading: "'Montserrat', sans-serif",
    body: "'Montserrat', sans-serif",
    category: 'sans',
  },
  {
    id: 'poppins',
    name: 'Poppins',
    description: 'Rounded · modern',
    heading: "'Poppins', sans-serif",
    body: "'Poppins', sans-serif",
    category: 'sans',
  },
  {
    id: 'poppins-lato',
    name: 'Agency',
    description: 'Strong heading · clean body',
    heading: "'Poppins', sans-serif",
    body: "'Lato', sans-serif",
    category: 'sans',
  },
  {
    id: 'rubik',
    name: 'Rubik',
    description: 'Soft · contemporary',
    heading: "'Rubik', sans-serif",
    body: "'Rubik', sans-serif",
    category: 'sans',
  },
  {
    id: 'urbanist',
    name: 'Urbanist',
    description: 'Sleek · refined',
    heading: "'Urbanist', sans-serif",
    body: "'Urbanist', sans-serif",
    category: 'sans',
  },
  {
    id: 'josefin-dm',
    name: 'Architectural',
    description: 'Geometric · elegant',
    heading: "'Josefin Sans', sans-serif",
    body: "'DM Sans', sans-serif",
    category: 'sans',
  },
  {
    id: 'figtree',
    name: 'Figtree',
    description: 'Fresh · rounded',
    heading: "'Figtree', sans-serif",
    body: "'Figtree', sans-serif",
    category: 'sans',
  },
  {
    id: 'red-hat',
    name: 'Systematic',
    description: 'Display + text system',
    heading: "'Red Hat Display', sans-serif",
    body: "'Red Hat Text', sans-serif",
    category: 'sans',
  },
  {
    id: 'lexend',
    name: 'Lexend',
    description: 'Clarity · legibility',
    heading: "'Lexend', sans-serif",
    body: "'Lexend', sans-serif",
    category: 'sans',
  },
  {
    id: 'barlow',
    name: 'Barlow',
    description: 'Condensed · editorial',
    heading: "'Barlow Condensed', sans-serif",
    body: "'Barlow', sans-serif",
    category: 'sans',
  },
  {
    id: 'libre-franklin',
    name: 'Franklin',
    description: 'Strong · neutral',
    heading: "'Libre Franklin', sans-serif",
    body: "'Libre Franklin', sans-serif",
    category: 'sans',
  },

  // ── Batch 2: more mixed pairs ──────────────────────────────────────────────
  {
    id: 'playfair-source',
    name: 'Prestige',
    description: 'Display serif · neutral body',
    heading: "'Playfair Display', Georgia, serif",
    body: "'Source Sans 3', sans-serif",
    category: 'mixed',
  },
  {
    id: 'libre-bask-source',
    name: 'Oxford',
    description: 'Classic serif · clean body',
    heading: "'Libre Baskerville', Georgia, serif",
    body: "'Source Sans 3', sans-serif",
    category: 'mixed',
  },
  {
    id: 'libre-bask-lato',
    name: 'Established',
    description: 'Trusted serif · open body',
    heading: "'Libre Baskerville', Georgia, serif",
    body: "'Lato', sans-serif",
    category: 'mixed',
  },
  {
    id: 'zilla-work',
    name: 'Slab Modern',
    description: 'Slab serif · functional',
    heading: "'Zilla Slab', Georgia, serif",
    body: "'Work Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'bitter-inter',
    name: 'Magazine',
    description: 'Print slab · digital body',
    heading: "'Bitter', Georgia, serif",
    body: "'Inter', sans-serif",
    category: 'mixed',
  },
  {
    id: 'domine-lato',
    name: 'Bookish',
    description: 'Literary slab · airy body',
    heading: "'Domine', Georgia, serif",
    body: "'Lato', sans-serif",
    category: 'mixed',
  },
  {
    id: 'roboto-slab-open',
    name: 'Tech Serif',
    description: 'Structured slab · open body',
    heading: "'Roboto Slab', Georgia, serif",
    body: "'Open Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'philosopher-open',
    name: 'Philosopher',
    description: 'Intellectual · literary',
    heading: "'Philosopher', Georgia, serif",
    body: "'Open Sans', sans-serif",
    category: 'mixed',
  },
  {
    id: 'cinzel-source',
    name: 'Classical',
    description: 'Roman formal · clean body',
    heading: "'Cinzel', Georgia, serif",
    body: "'Source Sans 3', sans-serif",
    category: 'mixed',
  },

  // ── Batch 2: more full-serif ───────────────────────────────────────────────
  {
    id: 'libre-baskerville',
    name: 'Victorian',
    description: 'Classic · distinguished',
    heading: "'Libre Baskerville', Georgia, serif",
    body: "'Libre Baskerville', Georgia, serif",
    category: 'serif',
  },
  {
    id: 'bitter',
    name: 'Slab Serif',
    description: 'Print-ready · sturdy',
    heading: "'Bitter', Georgia, serif",
    body: "'Bitter', Georgia, serif",
    category: 'serif',
  },

  // ── Batch 2: more monospace ────────────────────────────────────────────────
  {
    id: 'fira-inter',
    name: 'Code Pro',
    description: 'Code heading · clean body',
    heading: "'Fira Code', 'JetBrains Mono', monospace",
    body: "'Inter', sans-serif",
    category: 'mono',
  },
  {
    id: 'source-code-pro',
    name: 'Terminal',
    description: 'Mono heading · sans body',
    heading: "'Source Code Pro', 'JetBrains Mono', monospace",
    body: "'Source Sans 3', sans-serif",
    category: 'mono',
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
