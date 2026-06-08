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
  accentBar?: string; // thin colored bar at very top of header (optional)

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
  sectionDecoration: 'underline' | 'border-left' | 'bar-bg' | 'caps-line' | 'none';
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
  sectionGap: number;
  bulletGap: number;
  itemGap: number;
  lineH: number;
  bodyPad: string;
  sidebarPad: string;
  sectionTopMargin: number;
}

export const DENSITY_SCALES: Record<ContentDensity, DensityScale> = {
  compact: {
    bodySize: '8.5px', metaSize: '8px', tagSize: '7.5px',
    sectionGap: 8, bulletGap: 2, itemGap: 7,
    lineH: 1.35, bodyPad: '14px 22px', sidebarPad: '14px 12px', sectionTopMargin: 0,
  },
  balanced: {
    bodySize: '9.5px', metaSize: '8.5px', tagSize: '8.5px',
    sectionGap: 13, bulletGap: 2.5, itemGap: 10,
    lineH: 1.5, bodyPad: '20px 28px', sidebarPad: '20px 16px', sectionTopMargin: 2,
  },
  spacious: {
    bodySize: '10.5px', metaSize: '9.5px', tagSize: '9px',
    sectionGap: 20, bulletGap: 4, itemGap: 14,
    lineH: 1.65, bodyPad: '28px 36px', sidebarPad: '28px 20px', sectionTopMargin: 4,
  },
};

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
    accent: '#2563eb', accentContrast: '#ffffff',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#ffffff', bodyText: '#0f172a', bodyMuted: '#475569',
    sectionColor: '#0f172a', sectionSize: '9px', sectionWeight: '800',
    sectionDecoration: 'caps-line', sectionBorderColor: '#2563eb',
    tagBg: '#eff6ff', tagText: '#1d4ed8', tagBorder: '#bfdbfe', tagRadius: '4px',
    fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif",
    bulletChar: '▸', borderColor: '#e2e8f0',
    atsScore: 'high', bestFor: 'Any industry — universally safe and trusted',
    description: 'White layout, blue accent bar, Inter font throughout. The highest ATS score in the engine — safe for every industry and seniority.',
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
    id: 'v2-slate-sidebar',
    name: 'Slate Sidebar',
    layout: 'sidebar-left',
    category: 'Professional',
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
    sectionColor: '#111111', sectionSize: '9px', sectionWeight: '800',
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
    headerBg: '#2d4a3e', headerText: '#f0fdf4', headerPadding: '28px 24px 24px',
    headerNameSize: '22px', headerNameWeight: '800', headerTitleColor: '#86efac',
    accent: '#16a34a', accentContrast: '#ffffff',
    sidebarBg: '#2d4a3e', sidebarText: '#f0fdf4', sidebarMuted: '#86efac', sidebarWidth: '33%',
    bodyBg: '#ffffff', bodyText: '#1a2e1f', bodyMuted: '#4a6555',
    sectionColor: '#16a34a', sectionSize: '9.5px', sectionWeight: '800',
    sectionDecoration: 'border-left', sectionBorderColor: '#16a34a',
    tagBg: '#dcfce7', tagText: '#15803d', tagBorder: '#86efac', tagRadius: '4px',
    fontHeading: "'DM Sans', sans-serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '▸', borderColor: '#d1fae5',
    atsScore: 'medium', bestFor: 'Sustainability, healthcare, modern startups',
    description: 'Forest-green sidebar with sage tones. Fresh and distinctive without sacrificing readability.',
  },

  // ── TECHNICAL ────────────────────────────────────────────────────────────────
  {
    id: 'v2-noir',
    name: 'Noir Tech',
    layout: 'single-col',
    category: 'Technical',
    headerBg: '#0d0d0d', headerText: '#f0f0f0', headerPadding: '28px 32px 24px',
    headerNameSize: '24px', headerNameWeight: '900', headerTitleColor: '#a3e635',
    accent: '#a3e635', accentContrast: '#0d0d0d',
    sidebarBg: '', sidebarText: '', sidebarMuted: '', sidebarWidth: '0',
    bodyBg: '#111111', bodyText: '#e8e8e8', bodyMuted: '#9a9a9a',
    sectionColor: '#a3e635', sectionSize: '10px', sectionWeight: '700',
    sectionDecoration: 'border-left', sectionBorderColor: '#a3e635',
    tagBg: 'rgba(163,230,53,0.1)', tagText: '#a3e635', tagBorder: 'rgba(163,230,53,0.3)', tagRadius: '3px',
    fontHeading: "'JetBrains Mono', 'Fira Code', monospace", fontBody: "'Inter', sans-serif",
    bulletChar: '›', borderColor: '#2a2a2a',
    atsScore: 'low', bestFor: 'Senior engineers, OSS contributors, creative tech',
    description: 'Dark background with lime-green accent and monospace headings. Turns heads in tech.',
  },

  // ── CREATIVE ─────────────────────────────────────────────────────────────────
  {
    id: 'v2-coral',
    name: 'Warm Coral',
    layout: 'two-col',
    category: 'Creative',
    headerBg: '#7c2d12', headerText: '#fff7ed', headerPadding: '28px 32px 24px',
    headerNameSize: '26px', headerNameWeight: '800', headerTitleColor: '#fdba74',
    accent: '#ea580c', accentContrast: '#ffffff',
    sidebarBg: '#fff7ed', sidebarText: '#431407', sidebarMuted: '#7c3d12', sidebarWidth: '38%',
    bodyBg: '#ffffff', bodyText: '#1c1917', bodyMuted: '#57534e',
    sectionColor: '#ea580c', sectionSize: '10px', sectionWeight: '800',
    sectionDecoration: 'bar-bg', sectionBorderColor: '#ea580c',
    tagBg: '#fff7ed', tagText: '#c2410c', tagBorder: '#fed7aa', tagRadius: '99px',
    fontHeading: "'Playfair Display', Georgia, serif", fontBody: "'DM Sans', sans-serif",
    bulletChar: '•', borderColor: '#fed7aa',
    atsScore: 'medium', bestFor: 'Design, marketing, creative leadership',
    description: 'Deep terracotta header with warm orange accents. Two-column body for maximum density.',
  },

  // ── ACADEMIC ─────────────────────────────────────────────────────────────────
  {
    id: 'v2-forest',
    name: 'Forest Pro',
    layout: 'sidebar-right',
    category: 'Academic',
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
];

export const THEME_MAP: Record<string, TemplateTheme> = Object.fromEntries(THEMES.map(t => [t.id, t]));
export const V2_TEMPLATE_IDS = THEMES.map(t => t.id) as string[];

export function getTheme(id: string): TemplateTheme {
  return THEME_MAP[id] ?? THEMES[0];
}
