export interface TemplateTheme {
  id: string;
  name: string;
  layout: 'single-col' | 'sidebar-left' | 'sidebar-right' | 'two-col';
  category: string;

  headerBg: string;
  headerText: string;
  headerPadding: string;
  headerNameSize: string;
  headerNameWeight: string;
  headerTitleColor: string;
  headerAlign?: 'left' | 'center';       // default: 'left'
  headerNameStyle?: 'normal' | 'uppercase'; // default: 'normal'
  accentBar?: string;
  supportsPhoto?: boolean;

  accent: string;
  accentContrast: string;

  sidebarBg: string;
  sidebarText: string;
  sidebarMuted: string;
  sidebarWidth: string;

  bodyBg: string;
  bodyText: string;
  bodyMuted: string;

  sectionColor: string;
  sectionSize: string;
  sectionWeight: string;
  sectionDecoration: 'underline' | 'border-left' | 'bar-bg' | 'caps-line' | 'double-rule' | 'none';
  /** When true, renders Core Skills immediately after the summary — before work history.
   *  Mirrors the section priority of modern ATS scorecards and suits career-changers. */
  skillsFirst?: boolean;
  sectionBorderColor: string;

  tagBg: string;
  tagText: string;
  tagBorder: string;
  tagRadius: string;

  fontHeading: string;
  fontBody: string;
  bulletChar: string;
  borderColor: string;

  atsScore: 'high' | 'medium' | 'low';
  bestFor: string;
  description: string;
}

// ─── Content density types ────────────────────────────────────────────────────

export type ContentDensity = 'compact' | 'balanced' | 'spacious';

export interface DensityScale {
  bodySize: string;
  metaSize: string;
  tagSize: string;
  sidebarBodySize: string;
  sectionGap: number;
  bulletGap: number;
  itemGap: number;
  lineH: number;
  bodyPad: string;
  sidebarPad: string;
  sectionTopMargin: number;
}

export const DENSITY_SCALES: Record<ContentDensity, DensityScale> = {
  // compact — many bullets / multiple long jobs: keep content fitting while being readable
  compact: {
    bodySize: '10.5px', metaSize: '9px', tagSize: '8.5px', sidebarBodySize: '9.5px',
    sectionGap: 11, bulletGap: 2.5, itemGap: 8,
    lineH: 1.45, bodyPad: '16px 24px', sidebarPad: '14px 12px', sectionTopMargin: 0,
  },
  // balanced — typical professional CV: clear, comfortable, professional
  balanced: {
    bodySize: '11.5px', metaSize: '9.5px', tagSize: '9px', sidebarBodySize: '10.5px',
    sectionGap: 14, bulletGap: 3, itemGap: 10,
    lineH: 1.5, bodyPad: '20px 28px', sidebarPad: '18px 16px', sectionTopMargin: 2,
  },
  // spacious — sparse CV (new grad / career change): generous, open, inviting
  spacious: {
    bodySize: '12.5px', metaSize: '10.5px', tagSize: '10px', sidebarBodySize: '11.5px',
    sectionGap: 20, bulletGap: 3.5, itemGap: 14,
    lineH: 1.6, bodyPad: '26px 34px', sidebarPad: '26px 20px', sectionTopMargin: 4,
  },
};

export function applyFontScale(sc: DensityScale, scale: number): DensityScale {
  if (scale === 1) return sc;
  const f = (px: string) => {
    const n = parseFloat(px);
    return isNaN(n) ? px : `${(n * scale).toFixed(2)}px`;
  };
  return {
    ...sc,
    bodySize:        f(sc.bodySize),
    metaSize:        f(sc.metaSize),
    tagSize:         f(sc.tagSize),
    sidebarBodySize: f(sc.sidebarBodySize),
  };
}

// ─── Theme presets ────────────────────────────────────────────────────────────

export const THEMES: TemplateTheme[] = [
  // ── PROFESSIONAL ─────────────────────────────────────────────────────────────
  {
    id: 'v2-pro',
    name: 'Clean Professional',
    layout: 'single-col',
    category: 'Professional',
    accentBar: '#2563eb',
    headerBg: '#ffffff', headerText: '#0f172a', headerPadding: '20px 36px 18px',
    headerNameSize: '26px', headerNameWeight: '900', headerTitleColor: '#2563eb',
    accent: '#1d4ed8', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#0f172a', bodyMuted: '#475569',
    sectionColor: '#0f172a', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#1d4ed8',
    tagBg: '#eff6ff', tagText: '#1d4ed8', tagBorder: '#bfdbfe', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#e2e8f0',
    atsScore: 'high', bestFor: 'Any industry — universally safe and trusted',
    description: 'White layout, deep-blue accent bar, Inter font throughout. Maximum ATS score — safe for every industry.',
  },
  {
    id: 'v2-classic-pro',
    name: 'Classic Professional',
    layout: 'single-col',
    category: 'Professional',
    headerAlign: 'center',
    headerBg: '#ffffff', headerText: '#0f172a', headerPadding: '28px 36px 18px',
    headerNameSize: '28px', headerNameWeight: '800', headerTitleColor: '#1e3a5f',
    accent: '#1e3a5f', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1a1a2e', bodyMuted: '#475569',
    sectionColor: '#1e3a5f', sectionSize: '11px', sectionWeight: '800',
    sectionDecoration: 'underline', sectionBorderColor: '#1e3a5f',
    tagBg: '#eff6ff', tagText: '#1e3a5f', tagBorder: '#bfdbfe', tagRadius: '3px',
    fontHeading: "Georgia, 'Times New Roman', serif", fontBody: "'Inter', 'DM Sans', sans-serif",
    bulletChar: '▸', borderColor: '#dde2ec',
    atsScore: 'high', bestFor: 'Any professional role — the universally-recognised format',
    description: 'Centred name, Georgia serif headings, navy underline dividers. The most familiar and trusted CV format — works everywhere.',
  },
  {
    id: 'v2-standard-black',
    name: 'Standard Black',
    layout: 'single-col',
    category: 'Professional',
    headerAlign: 'center',
    headerNameStyle: 'uppercase',
    headerBg: '#ffffff', headerText: '#0a0a0a', headerPadding: '32px 52px 12px',
    headerNameSize: '26px', headerNameWeight: '800', headerTitleColor: '#333333',
    accent: '#111111', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#111111', bodyMuted: '#444444',
    sectionColor: '#111111', sectionSize: '11px', sectionWeight: '800',
    sectionDecoration: 'double-rule', sectionBorderColor: '#111111',
    tagBg: '#f5f5f5', tagText: '#333333', tagBorder: '#e0e0e0', tagRadius: '2px',
    fontHeading: "'Lora', 'Merriweather', Georgia, serif", fontBody: "'Lora', 'Merriweather', Georgia, serif",
    bulletChar: '•', borderColor: '#e5e5e5',
    atsScore: 'high', bestFor: 'Corporate, finance, law — maximum ATS score',
    description: 'Lora serif throughout, double-rule section dividers, pure black on white. Closest to a printed Harvard/legal CV — commands respect.',
  },
  {
    id: 'v2-navy',
    name: 'Navy Classic',
    layout: 'single-col',
    category: 'Professional',
    headerBg: '#1B2B4B', headerText: '#ffffff', headerPadding: '28px 32px 24px',
    headerNameSize: '26px', headerNameWeight: '800', headerTitleColor: '#93c5fd',
    accent: '#1B2B4B', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1a1a1a', bodyMuted: '#555555',
    sectionColor: '#1B2B4B', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'border-left', sectionBorderColor: '#1B2B4B',
    tagBg: '#e8eef7', tagText: '#1B2B4B', tagBorder: '#c0cfe8', tagRadius: '4px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', 'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#e2e8f0',
    atsScore: 'high', bestFor: 'Finance, consulting, law, corporate',
    description: 'Deep navy header with Playfair Display headings. Classic authority for corporate and finance roles.',
  },
  {
    id: 'v2-photo',
    name: 'Photo Pro',
    layout: 'sidebar-left',
    category: 'Professional',
    supportsPhoto: true,
    headerBg: '#1e3a5f', headerText: '#f0f7ff', headerPadding: '22px 24px 18px',
    headerNameSize: '23px', headerNameWeight: '800', headerTitleColor: '#93c5fd',
    accent: '#2563eb', accentContrast: '#ffffff',
    sidebarBg: '#172b4d', sidebarText: '#e2ecf9', sidebarMuted: '#93b4d4', sidebarWidth: '34%',
    bodyBg: '#ffffff', bodyText: '#1a2b40', bodyMuted: '#4b6780',
    sectionColor: '#1a2b40', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#2563eb',
    tagBg: 'rgba(37,99,235,0.1)', tagText: '#2563eb', tagBorder: 'rgba(37,99,235,0.3)', tagRadius: '3px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#dde8f0',
    atsScore: 'medium', bestFor: 'Design, product, marketing, management',
    description: 'Dark blue sidebar with circular profile photo at top. Modern and distinctive for roles where presence matters.',
  },
  {
    id: 'v2-slate-sidebar',
    name: 'Slate Sidebar',
    layout: 'sidebar-left',
    category: 'Professional',
    supportsPhoto: true,
    headerBg: '#1e293b', headerText: '#f8fafc', headerPadding: '28px 24px 24px',
    headerNameSize: '22px', headerNameWeight: '800', headerTitleColor: '#94a3b8',
    accent: '#3b82f6', accentContrast: '#ffffff',
    sidebarBg: '#1e293b', sidebarText: '#f1f5f9', sidebarMuted: '#94a3b8', sidebarWidth: '33%',
    bodyBg: '#ffffff', bodyText: '#1e293b', bodyMuted: '#64748b',
    sectionColor: '#3b82f6', sectionSize: '9.5px', sectionWeight: '700',
    sectionDecoration: 'caps-line', sectionBorderColor: '#3b82f6',
    tagBg: 'rgba(59,130,246,0.15)', tagText: '#3b82f6', tagBorder: 'rgba(59,130,246,0.3)', tagRadius: '3px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '–', borderColor: '#e2e8f0',
    atsScore: 'medium', bestFor: 'Tech, operations, management',
    description: 'Dark slate sidebar with blue accent. Clean and modern for tech and management roles.',
  },
  {
    id: 'v2-gold-exec',
    name: 'Gold Executive',
    layout: 'sidebar-right',
    category: 'Professional',
    supportsPhoto: true,
    headerBg: '#1a1a2e', headerText: '#f5f0e8', headerPadding: '32px 28px 28px',
    headerNameSize: '24px', headerNameWeight: '700', headerTitleColor: '#c9a84c',
    accent: '#c9a84c', accentContrast: '#1a1a2e',
    sidebarBg: '#f5f0e8', sidebarText: '#1a1a2e', sidebarMuted: '#6b5e3e', sidebarWidth: '32%',
    bodyBg: '#ffffff', bodyText: '#1a1a2e', bodyMuted: '#5a5243',
    sectionColor: '#1a1a2e', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'underline', sectionBorderColor: '#c9a84c',
    tagBg: '#fef9ec', tagText: '#8b6914', tagBorder: '#c9a84c', tagRadius: '3px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#e8dfc8',
    atsScore: 'medium', bestFor: 'C-suite, senior leadership, luxury industries',
    description: 'Deep navy and gold — Playfair headings and a warm-cream sidebar. Executive presence.',
  },

  // ── MINIMAL ───────────────────────────────────────────────────────────────────
  {
    id: 'v2-minimal',
    name: 'Pure Minimal',
    layout: 'single-col',
    category: 'Minimal',
    headerBg: '#ffffff', headerText: '#111111', headerPadding: '32px 40px 20px',
    headerNameSize: '28px', headerNameWeight: '900', headerTitleColor: '#555555',
    accent: '#111111', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#111111', bodyMuted: '#666666',
    sectionColor: '#111111', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#111111',
    tagBg: '#f5f5f5', tagText: '#333333', tagBorder: '#e0e0e0', tagRadius: '2px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '–', borderColor: '#e5e5e5',
    atsScore: 'high', bestFor: 'Any industry — universally safe',
    description: 'White space, black ink, nothing else. Passes every ATS. Works for any role or industry.',
  },

  // ── MODERN ───────────────────────────────────────────────────────────────────
  {
    id: 'v2-sage',
    name: 'Sage Modern',
    layout: 'sidebar-left',
    category: 'Modern',
    supportsPhoto: true,
    headerBg: '#2d4a3e', headerText: '#f0fdf4', headerPadding: '28px 24px 24px',
    headerNameSize: '22px', headerNameWeight: '800', headerTitleColor: '#86d7a0',
    accent: '#166534', accentContrast: '#ffffff',
    sidebarBg: '#2d4a3e', sidebarText: '#f0fdf4', sidebarMuted: '#86d7a0', sidebarWidth: '33%',
    bodyBg: '#ffffff', bodyText: '#1a2e1f', bodyMuted: '#4a6555',
    sectionColor: '#166534', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'border-left', sectionBorderColor: '#166534',
    tagBg: '#dcfce7', tagText: '#15803d', tagBorder: '#86efac', tagRadius: '4px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '▸', borderColor: '#d1fae5',
    atsScore: 'medium', bestFor: 'Sustainability, healthcare, modern startups',
    description: 'Forest-green sidebar with sage tones. Fresh and distinctive without sacrificing readability.',
  },

  // ── TECHNICAL ────────────────────────────────────────────────────────────────
  {
    id: 'v2-terminal',
    name: 'Terminal Dark',
    layout: 'single-col',
    category: 'Technical',
    headerBg: '#0f172a', headerText: '#e2e8f0', headerPadding: '26px 32px 22px',
    headerNameSize: '22px', headerNameWeight: '700', headerTitleColor: '#7dd3fc',
    accent: '#0891b2', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#0f172a', bodyText: '#e2e8f0', bodyMuted: '#94a3b8',
    sectionColor: '#7dd3fc', sectionSize: '9px', sectionWeight: '700',
    sectionDecoration: 'border-left', sectionBorderColor: '#0891b2',
    tagBg: 'rgba(8,145,178,0.15)', tagText: '#38bdf8', tagBorder: 'rgba(8,145,178,0.35)', tagRadius: '3px',
    fontHeading: "'JetBrains Mono', 'Fira Code', monospace", fontBody: "'Inter', sans-serif",
    bulletChar: '›', borderColor: '#1e293b',
    atsScore: 'low', bestFor: 'Senior engineers, OSS contributors, creative tech',
    description: 'Dark slate background with teal accent and monospace headings. Technical aesthetic without the neon glare.',
  },
  {
    id: 'v2-noir',
    name: 'Noir Professional',
    layout: 'single-col',
    category: 'Technical',
    headerBg: '#111111', headerText: '#f0f0f0', headerPadding: '28px 32px 24px',
    headerNameSize: '24px', headerNameWeight: '900', headerTitleColor: '#a3a3a3',
    accent: '#d4d4d4', accentContrast: '#111111',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#111111', bodyText: '#e8e8e8', bodyMuted: '#9a9a9a',
    sectionColor: '#e8e8e8', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'border-left', sectionBorderColor: '#4a4a4a',
    tagBg: 'rgba(212,212,212,0.1)', tagText: '#d4d4d4', tagBorder: 'rgba(212,212,212,0.25)', tagRadius: '3px',
    fontHeading: "'JetBrains Mono', 'Fira Code', monospace", fontBody: "'Inter', sans-serif",
    bulletChar: '›', borderColor: '#2a2a2a',
    atsScore: 'low', bestFor: 'Senior engineers, OSS contributors, design-tech',
    description: 'Monochrome dark — near-black background, silver text, monospace headings. Sophisticated and readable.',
  },

  // ── CREATIVE ─────────────────────────────────────────────────────────────────
  {
    id: 'v2-editorial',
    name: 'Editorial Rose',
    layout: 'sidebar-left',
    category: 'Creative',
    supportsPhoto: true,
    headerBg: '#1a0a0e', headerText: '#fff1f2', headerPadding: '28px 28px 24px',
    headerNameSize: '24px', headerNameWeight: '800', headerTitleColor: '#fecdd3',
    accent: '#9f1239', accentContrast: '#ffffff',
    sidebarBg: '#1a0a0e', sidebarText: '#fff1f2', sidebarMuted: '#fecdd3', sidebarWidth: '32%',
    bodyBg: '#fafafa', bodyText: '#1a0a0e', bodyMuted: '#6b2239',
    sectionColor: '#1a0a0e', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'bar-bg', sectionBorderColor: '#9f1239',
    tagBg: '#fff1f2', tagText: '#9f1239', tagBorder: '#fecdd3', tagRadius: '99px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#ffe4e6',
    atsScore: 'medium', bestFor: 'Design, media, fashion, marketing, creative leadership',
    description: 'Deep crimson sidebar with Playfair Display headings and pill-shaped tags. Editorial elegance.',
  },
  {
    id: 'v2-coral',
    name: 'Warm Coral',
    layout: 'two-col',
    category: 'Creative',
    supportsPhoto: true,
    headerBg: '#7c2d12', headerText: '#fff7ed', headerPadding: '28px 32px 24px',
    headerNameSize: '26px', headerNameWeight: '800', headerTitleColor: '#fb923c',
    accent: '#c2410c', accentContrast: '#ffffff',
    sidebarBg: '#fff7ed', sidebarText: '#431407', sidebarMuted: '#7c3d12', sidebarWidth: '38%',
    bodyBg: '#ffffff', bodyText: '#1c1917', bodyMuted: '#57534e',
    sectionColor: '#c2410c', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'bar-bg', sectionBorderColor: '#c2410c',
    tagBg: '#fff7ed', tagText: '#c2410c', tagBorder: '#fed7aa', tagRadius: '99px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#fed7aa',
    atsScore: 'medium', bestFor: 'Design, marketing, creative leadership',
    description: 'Deep terracotta header with warm burnt-orange accents. Two-column body for maximum density.',
  },

  // ── ACADEMIC ─────────────────────────────────────────────────────────────────
  {
    id: 'v2-amber',
    name: 'Amber Scholar',
    layout: 'single-col',
    category: 'Academic',
    accentBar: '#b45309',
    headerBg: '#ffffff', headerText: '#1c1917', headerPadding: '28px 36px 22px',
    headerNameSize: '27px', headerNameWeight: '700', headerTitleColor: '#b45309',
    accent: '#b45309', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1c1917', bodyMuted: '#57534e',
    sectionColor: '#1c1917', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'underline', sectionBorderColor: '#b45309',
    tagBg: '#fef3c7', tagText: '#92400e', tagBorder: '#fcd34d', tagRadius: '3px',
    fontHeading: "Georgia, 'Times New Roman', serif", fontBody: "'Inter', sans-serif",
    bulletChar: '›', borderColor: '#e7e5e4',
    atsScore: 'high', bestFor: 'Ivy League applications, law school, academia, consulting',
    description: 'White layout, Georgia serif headings, burnt amber accent. Clean and authoritative for top-tier academic applications.',
  },
  {
    id: 'v2-ink',
    name: 'Ink & Parchment',
    layout: 'single-col',
    category: 'Academic',
    accentBar: '#6b2d3e',
    headerBg: '#1c1917', headerText: '#faf7f2', headerPadding: '28px 36px 22px',
    headerNameSize: '26px', headerNameWeight: '700', headerTitleColor: '#d6b896',
    accent: '#6b2d3e', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#fdfaf6', bodyText: '#1c1917', bodyMuted: '#5c4f43',
    sectionColor: '#1c1917', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'underline', sectionBorderColor: '#6b2d3e',
    tagBg: '#f5efe8', tagText: '#6b2d3e', tagBorder: '#d6b896', tagRadius: '3px',
    fontHeading: "'Merriweather', Georgia, serif", fontBody: "'Lato', 'DM Sans', sans-serif",
    bulletChar: '›', borderColor: '#e8ddd0',
    atsScore: 'high', bestFor: 'Academia, law, consulting, publishing',
    description: 'Deep ink header with warm parchment body — Merriweather serif headings and a burgundy accent. Print-perfect.',
  },
  {
    id: 'v2-forest',
    name: 'Forest Pro',
    layout: 'sidebar-right',
    category: 'Academic',
    supportsPhoto: true,
    headerBg: '#14532d', headerText: '#f0fdf4', headerPadding: '28px 28px 24px',
    headerNameSize: '24px', headerNameWeight: '800', headerTitleColor: '#86efac',
    accent: '#15803d', accentContrast: '#ffffff',
    sidebarBg: '#f0fdf4', sidebarText: '#14532d', sidebarMuted: '#166534', sidebarWidth: '30%',
    bodyBg: '#ffffff', bodyText: '#14532d', bodyMuted: '#166534',
    sectionColor: '#15803d', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'underline', sectionBorderColor: '#15803d',
    tagBg: '#dcfce7', tagText: '#15803d', tagBorder: '#86efac', tagRadius: '4px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#bbf7d0',
    atsScore: 'medium', bestFor: 'Academia, research, NGOs, public sector',
    description: 'Rich forest green — Playfair Display headings with a light sidebar. Perfect for academic and research CVs.',
  },

  // ── PREMIUM ADDITIONS ─────────────────────────────────────────────────────────

  {
    id: 'v2-harvard',
    name: 'Harvard Classic',
    layout: 'single-col',
    category: 'Professional',
    headerAlign: 'center',
    headerBg: '#ffffff', headerText: '#0a0a14', headerPadding: '32px 52px 16px',
    headerNameSize: '30px', headerNameWeight: '700', headerTitleColor: '#1B3A6B',
    accent: '#1B3A6B', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#0a0a14', bodyMuted: '#444444',
    sectionColor: '#0a0a14', sectionSize: '11px', sectionWeight: '700',
    sectionDecoration: 'double-rule', sectionBorderColor: '#0a0a14',
    tagBg: '#eef2ff', tagText: '#1B3A6B', tagBorder: '#c7d2fe', tagRadius: '2px',
    fontHeading: "Georgia, 'Times New Roman', serif", fontBody: "Georgia, 'Times New Roman', serif",
    bulletChar: '•', borderColor: '#d1d5db',
    atsScore: 'high', bestFor: 'Consulting, banking, law, MBA applications, McKinsey / BCG / top-tier firms',
    description: 'Centred name, pure Georgia serif throughout, double-rule section dividers. The Harvard / McKinsey CV format — authoritative and trusted.',
  },
  {
    id: 'v2-warm',
    name: 'Warm Consultancy',
    layout: 'single-col',
    category: 'Professional',
    accentBar: '#D97706',
    headerBg: '#FFFBF5', headerText: '#1C1917', headerPadding: '28px 40px 20px',
    headerNameSize: '27px', headerNameWeight: '700', headerTitleColor: '#D97706',
    accent: '#B45309', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#FFFBF5', bodyText: '#1C1917', bodyMuted: '#57534E',
    sectionColor: '#1C1917', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'underline', sectionBorderColor: '#D97706',
    tagBg: '#FEF3C7', tagText: '#92400E', tagBorder: '#FCD34D', tagRadius: '3px',
    fontHeading: "'Merriweather', Georgia, serif", fontBody: "'DM Sans', 'Inter', sans-serif",
    bulletChar: '›', borderColor: '#E7E0D5',
    atsScore: 'high', bestFor: 'Consulting, business development, project management, generalist professionals',
    description: 'Warm cream background, Merriweather serif headings, golden amber accent. Calm authority — perfect for consulting and business roles.',
  },
  {
    id: 'v2-steel',
    name: 'Steel Blue',
    layout: 'sidebar-left',
    category: 'Modern',
    supportsPhoto: true,
    headerBg: '#1F4E79', headerText: '#EFF6FF', headerPadding: '26px 24px 22px',
    headerNameSize: '22px', headerNameWeight: '800', headerTitleColor: '#BAD8F5',
    accent: '#1D4ED8', accentContrast: '#ffffff',
    sidebarBg: '#1F4E79', sidebarText: '#EFF6FF', sidebarMuted: '#93C5FD', sidebarWidth: '33%',
    bodyBg: '#ffffff', bodyText: '#0F172A', bodyMuted: '#475569',
    sectionColor: '#0F172A', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#1D4ED8',
    tagBg: 'rgba(29,78,216,0.1)', tagText: '#1D4ED8', tagBorder: 'rgba(29,78,216,0.3)', tagRadius: '3px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#E2E8F0',
    atsScore: 'medium', bestFor: 'Engineering, finance, operations, project management',
    description: 'Strong steel-blue sidebar, crisp white body. Technical authority combined with sharp visual impact.',
  },
  {
    id: 'v2-teal',
    name: 'Teal Professional',
    layout: 'sidebar-left',
    category: 'Modern',
    supportsPhoto: true,
    headerBg: '#0D9488', headerText: '#F0FDFA', headerPadding: '26px 24px 22px',
    headerNameSize: '22px', headerNameWeight: '800', headerTitleColor: '#99F6E4',
    accent: '#0D9488', accentContrast: '#ffffff',
    sidebarBg: '#0D9488', sidebarText: '#F0FDFA', sidebarMuted: '#99F6E4', sidebarWidth: '33%',
    bodyBg: '#ffffff', bodyText: '#134E4A', bodyMuted: '#2D6A62',
    sectionColor: '#0D9488', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#0D9488',
    tagBg: '#CCFBF1', tagText: '#0F766E', tagBorder: '#99F6E4', tagRadius: '4px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '▸', borderColor: '#CCFBF1',
    atsScore: 'medium', bestFor: 'Healthcare, sustainability, operations, modern startups',
    description: 'Fresh teal sidebar with clean white body. Modern and distinctive without being loud.',
  },
  {
    id: 'v2-bold',
    name: 'Bold Indigo',
    layout: 'single-col',
    category: 'Modern',
    headerBg: '#312E81', headerText: '#EEF2FF', headerPadding: '28px 36px 24px',
    headerNameSize: '26px', headerNameWeight: '900', headerTitleColor: '#A5B4FC',
    accent: '#4338CA', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1E1B4B', bodyMuted: '#4C4F8A',
    sectionColor: '#1E1B4B', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#4338CA',
    tagBg: '#EEF2FF', tagText: '#4338CA', tagBorder: '#C7D2FE', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#E0E7FF',
    atsScore: 'high', bestFor: 'Product managers, marketers, startup executives',
    description: 'Deep indigo full-width header with clean white body. Bold, confident and memorable — stands out while staying ATS-safe.',
  },
  {
    id: 'v2-modern-blue',
    name: 'Modern Indigo',
    layout: 'single-col',
    category: 'Technical',
    accentBar: '#4F46E5',
    headerBg: '#ffffff', headerText: '#111827', headerPadding: '24px 36px 18px',
    headerNameSize: '27px', headerNameWeight: '900', headerTitleColor: '#4338CA',
    accent: '#4338CA', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#111827', bodyMuted: '#6B7280',
    sectionColor: '#111827', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'border-left', sectionBorderColor: '#4338CA',
    tagBg: '#EEF2FF', tagText: '#4338CA', tagBorder: '#C7D2FE', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#E5E7EB',
    atsScore: 'high', bestFor: 'Software engineers, product managers, data scientists',
    description: 'Clean white with deep indigo accent bar and border-left section headers. The resume top tech companies expect — maximum ATS, unmistakable presence.',
  },
  {
    id: 'v2-graphite',
    name: 'Graphite Clean',
    layout: 'single-col',
    category: 'Minimal',
    accentBar: '#374151',
    headerBg: '#ffffff', headerText: '#111827', headerPadding: '26px 36px 18px',
    headerNameSize: '27px', headerNameWeight: '800', headerTitleColor: '#374151',
    accent: '#374151', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#111827', bodyMuted: '#6B7280',
    sectionColor: '#111827', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'border-left', sectionBorderColor: '#374151',
    tagBg: '#F9FAFB', tagText: '#374151', tagBorder: '#D1D5DB', tagRadius: '4px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '–', borderColor: '#E5E7EB',
    atsScore: 'high', bestFor: 'Any industry — sophisticated and universally readable',
    description: 'Graphite-grey accent on clean white, DM Sans throughout. Sophisticated neutrality — works for any role without saying too much.',
  },
  // ── SWE VIVID ────────────────────────────────────────────────────────────────
  // Dark purple/indigo dark-mode — distinct from swe-neon (cyan sidebar) and tokyo-night
  {
    id: 'swe-vivid',
    name: 'SWE Vivid',
    layout: 'single-col',
    category: 'Technical',
    headerBg: '#1e1b4b', headerText: '#f5f3ff', headerPadding: '24px 28px 20px',
    headerNameSize: '24px', headerNameWeight: '800', headerTitleColor: '#a5b4fc',
    accent: '#8b5cf6', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#0f0d1a', bodyText: '#e2e0f9', bodyMuted: '#9d9bc4',
    sectionColor: '#8b5cf6', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#8b5cf6',
    tagBg: '#8b5cf614', tagText: '#c4b5fd', tagBorder: '#8b5cf644', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#8b5cf622',
    atsScore: 'low', bestFor: 'Creative tech roles, startups, product engineering',
    description: 'Deep indigo-purple background with vivid violet accents. A bold dark-mode statement for engineers who want their CV to stand out.',
  },
  // ── SWE IMPACT ────────────────────────────────────────────────────────────────
  // High-contrast black canvas, vivid orange — maximum visual authority for senior engineers
  {
    id: 'swe-impact',
    name: 'SWE Impact',
    layout: 'single-col',
    category: 'Technical',
    accentBar: '#f97316',
    headerBg: '#09090b', headerText: '#fafafa', headerPadding: '26px 32px 20px',
    headerNameSize: '28px', headerNameWeight: '900', headerTitleColor: '#f97316',
    accent: '#f97316', accentContrast: '#09090b',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#09090b', bodyText: '#e4e4e7', bodyMuted: '#71717a',
    sectionColor: '#f97316', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#f97316',
    tagBg: '#f9731614', tagText: '#fb923c', tagBorder: '#f9731644', tagRadius: '3px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '›', borderColor: '#27272a',
    atsScore: 'low', bestFor: 'Senior engineers, tech leads, open-source contributors',
    description: 'Pure black canvas with vivid orange impact. Maximum visual authority — built for engineers whose achievements deserve the spotlight.',
  },
  // ── ATS MAXIMUM ──────────────────────────────────────────────────────────────
  // Zero colour, Arial, classic bullets — engineered for the most aggressive ATS parsers
  {
    id: 'v2-ats-max',
    name: 'ATS Maximum',
    layout: 'single-col',
    category: 'Professional',
    headerBg: '#ffffff', headerText: '#000000', headerPadding: '24px 32px 16px',
    headerNameSize: '22px', headerNameWeight: '700', headerTitleColor: '#000000',
    accent: '#000000', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#000000', bodyMuted: '#444444',
    sectionColor: '#000000', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'underline', sectionBorderColor: '#000000',
    tagBg: '#f5f5f5', tagText: '#000000', tagBorder: '#d4d4d4', tagRadius: '2px',
    fontHeading: "Arial, 'Helvetica Neue', sans-serif", fontBody: "Arial, 'Helvetica Neue', sans-serif",
    bulletChar: '•', borderColor: '#000000',
    atsScore: 'high', bestFor: 'Large-company ATS — Workday, Greenhouse, Taleo, iCIMS, Lever',
    description: 'Zero colour. Arial. Classic bullets. Engineered for the most aggressive ATS parsers — when getting past the machine is the only priority.',
  },
  // ── SKILLS FIRST ─────────────────────────────────────────────────────────────
  // Leads with Core Skills before Experience — matches how modern ATS scorecards rank
  {
    id: 'v2-skills-first',
    name: 'Skills First',
    layout: 'single-col',
    category: 'Professional',
    skillsFirst: true,
    accentBar: '#0d9488',
    headerBg: '#ffffff', headerText: '#0f172a', headerPadding: '24px 32px 18px',
    headerNameSize: '26px', headerNameWeight: '700', headerTitleColor: '#0d9488',
    accent: '#0d9488', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1e293b', bodyMuted: '#64748b',
    sectionColor: '#0f172a', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'caps-line', sectionBorderColor: '#0d9488',
    tagBg: '#f0fdfa', tagText: '#0d9488', tagBorder: '#99f6e4', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '◆', borderColor: '#e2e8f0',
    atsScore: 'high', bestFor: 'Career changers, technical roles, skills-led hiring',
    description: 'Leads with Core Skills before work history — mirrors how ATS scorecards rank candidates. Teal accent on clean white. Ideal for career changers.',
  },
  // ── CAREER STARTER ───────────────────────────────────────────────────────────
  // Fresh green, spacious, centred header — graduates and career changers
  {
    id: 'v2-starter',
    name: 'Career Starter',
    layout: 'single-col',
    category: 'Professional',
    headerBg: '#f0fdf4', headerText: '#14532d', headerPadding: '28px 36px 22px',
    headerNameSize: '28px', headerNameWeight: '700', headerTitleColor: '#16a34a',
    headerAlign: 'center',
    accent: '#16a34a', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#1a2e1a', bodyMuted: '#4b7a4b',
    sectionColor: '#14532d', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'caps-line', sectionBorderColor: '#16a34a',
    tagBg: '#f0fdf4', tagText: '#166534', tagBorder: '#bbf7d0', tagRadius: '4px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#dcfce7',
    atsScore: 'high', bestFor: 'Graduates, career changers, first professional role',
    description: 'Fresh green header, spacious layout, projects given full weight. Designed for early-career candidates where education and projects speak louder than long work history.',
  },
  {
    id: 'v2-crimson',
    name: 'Crimson Elite',
    layout: 'sidebar-right',
    category: 'Professional',
    supportsPhoto: true,
    accentBar: '#881337',
    headerBg: '#FFFDF9', headerText: '#1C0A0A', headerPadding: '28px 28px 22px',
    headerNameSize: '26px', headerNameWeight: '700', headerTitleColor: '#881337',
    accent: '#881337', accentContrast: '#ffffff',
    sidebarBg: '#FFF5F5', sidebarText: '#1C0A0A', sidebarMuted: '#7C3A3A', sidebarWidth: '31%',
    bodyBg: '#FFFDF9', bodyText: '#1C0A0A', bodyMuted: '#5C3D3D',
    sectionColor: '#1C0A0A', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'underline', sectionBorderColor: '#881337',
    tagBg: '#FFF1F2', tagText: '#881337', tagBorder: '#FECDD3', tagRadius: '3px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#F5E0E0',
    atsScore: 'medium', bestFor: 'Law, banking, consulting, executive and senior leadership roles',
    description: 'Ivory body, crimson accents, Playfair Display serif headings. Distinguished and powerful — the CV that commands a second look.',
  },
];

export const THEME_MAP: Record<string, TemplateTheme> = Object.fromEntries(THEMES.map(t => [t.id, t]));
export const V2_TEMPLATE_IDS = THEMES.map(t => t.id) as string[];

export function getTheme(id: string): TemplateTheme {
  return THEME_MAP[id] ?? THEMES[0];
}
