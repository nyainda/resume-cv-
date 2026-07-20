
// types.ts

// --- S3: Confidence-Tagged Profile Fields ---

/** Wraps any profile value with its confidence level so the anchor block
 *  and validation rules can distinguish facts the user explicitly wrote
 *  from values the system inferred or the LLM extrapolated. */
export type ConfidenceLevel = 'user_supplied' | 'system_extracted' | 'llm_inferred';

export interface TaggedValue<T> {
  value: T;
  confidence: ConfidenceLevel;
  /** Human-readable provenance, e.g. "extracted from work experience at Acme Corp" */
  source?: string;
}

// --- Basic Profile & CV Data Structures ---

export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  github: string;
  photo?: string; // Base64 encoded image or URL
}

export interface WorkExperience {
  id: string;
  company: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  responsibilities: string;
  pointCount?: number; // Number of bullet points to generate (e.g., 3, 4, 5, 6, 8)
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  startYear?: string;
  graduationYear: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
  startDate?: string;
  endDate?: string;
}

export interface Language {
  id: string;
  name: string;
  proficiency: string;
}

export interface Reference {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
}

// --- Custom Sections (user-defined profile extras) ---

export type CustomSectionType =
  | 'awards'
  | 'certifications'
  | 'publications'
  | 'volunteer'
  | 'presentations'
  | 'patents'
  | 'courses'
  | 'memberships'
  | 'hobbies'
  | 'interests'
  | 'achievements'
  | 'custom';

export interface CustomSectionItem {
  id: string;
  title: string;       // e.g. "Best Innovation Award", "AWS Solutions Architect"
  subtitle?: string;   // e.g. issuer, institution, company
  year?: string;       // e.g. "2023", "2021–2022"
  description?: string;
  link?: string;
}

export interface CustomSection {
  id: string;
  type: CustomSectionType;
  label: string;       // display label — e.g. "Awards & Honours"
  items: CustomSectionItem[];
}

// Section order keys — controls AI emphasis & template hint
export type ProfileSectionKey =
  | 'summary'
  | 'workExperience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'languages'
  | 'references';

export const DEFAULT_SECTION_ORDER: ProfileSectionKey[] = [
  'summary', 'workExperience', 'education', 'skills', 'projects', 'languages', 'references',
];

export interface UserProfile {
  personalInfo: PersonalInfo;
  summary: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  projects?: Project[];
  languages?: Language[];
  references?: Reference[];
  customSections?: CustomSection[];   // extra sections the user adds
  sectionOrder?: ProfileSectionKey[]; // preferred section order
  preferredField?: string;            // S6: ontology slug chosen by user — bypasses keyword scoring in detectField
  /** Set at import time by the zero-token import pipeline. Used by detectFieldWithSource
   *  to skip keyword scoring when the field was already classified during import. */
  detectedField?: string;
  /** ROLE_TRACKS name detected at import time (e.g. "Software Engineering"). */
  detectedTrack?: string;
  /** How the profile was originally created/imported. */
  importSource?: 'pdf' | 'docx' | 'json' | 'text' | 'github' | 'manual';
}

// --- Multiple Profiles ---

export type ProfileColor =
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky';

export interface UserProfileSlot {
  id: string;
  name: string;           // e.g. "Software Engineer", "Product Manager"
  color: ProfileColor;
  createdAt: string;
  profile: UserProfile;
  currentCV?: CVData | null;         // per-profile CV state
  savedCVs?: SavedCV[];              // per-profile saved CVs
  savedCoverLetters?: SavedCoverLetter[]; // per-profile cover letters
  trackedApps?: TrackedApplication[]; // per-profile job tracker
  starStories?: STARStory[];         // per-profile STAR stories
  currentJobDescription?: string;   // legacy — use jobDescription instead
  activeTab?: string;               // last active tab per profile

  // ── Per-profile "room" state ────────────────────────────────────────────
  // Each profile is fully isolated — switching profiles never bleeds JD,
  // targeting info, or generation settings from another profile.
  jobDescription?: string;          // job description pasted in this profile
  cvPurpose?: 'job' | 'academic' | 'general';
  targetCompany?: string;
  targetJobTitle?: string;
  generationMode?: string;          // 'honest' | 'boosted' | 'aggressive'
  jdKeywords?: string[];

  // ── Share links (synced across devices via profile slot) ────────────────
  sharedLinks?: Array<{ id: string; created_at: number; expires_at: number }>;

  // ── Tracker / analytics ─────────────────────────────────────────────────
  lastGeneratedAt?: string;         // ISO timestamp of last successful generation
  lastAtsScore?: number;            // cached ATS score after last generation (0-100)
}

// --- Email Application ---

export interface EmailApplicationDraft {
  to: string;
  subject: string;
  body: string;
  attachCv: boolean;
  attachCoverLetter: boolean;
  coverLetterText?: string;
}

// --- Generated CV Data Structure ---

export interface CVExperience {
  company: string;
  jobTitle: string;
  dates: string;
  startDate: string; // For sorting
  endDate: string; // For sorting
  responsibilities: string[];
  location?: string; // Optional office/remote location
  link?: string; // Optional GitHub/project URL for project-based roles
}

export interface CVEducation {
  degree: string;
  school: string;
  year: string;           // graduation / end year, e.g. "2022"
  startYear?: string;     // enrolment year, e.g. "2019" — used to build "2019 – 2022" date range
  description?: string;
}

export interface CVProject {
  name: string;
  description: string;
  bullets?: string[];     // 3-5 achievement bullets (full pipeline treatment)
  year?: string;
  technologies?: string[];
  link?: string;
  dates?: string;         // e.g. "Jan 2024 – Present" or "2023"
  endDate?: string;       // "Present" if live, date string if completed — used for tense detection
}

export interface CVLanguage {
  name: string;
  proficiency: string;
}

export interface CVPublication {
  title: string;
  authors: string[];
  journal: string;
  year: string;
  link?: string;
}

export interface CVReference {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
}

export interface CVData {
  summary: string;
  skills: string[];
  experience: CVExperience[];
  education: CVEducation[];
  projects?: CVProject[];
  languages?: CVLanguage[];
  publications?: CVPublication[];
  references?: CVReference[];
  certifications?: Array<string | { name: string; issuer?: string; year?: string }>; // professional certs / licences
  achievements?: string[]; // key achievements, awards, honors
  customSections?: CustomSection[]; // user-defined extra sections
  sectionOrder?: ProfileSectionKey[]; // mirrors the profile's preferred section ordering
  accentColor?: string;    // section label colour (EXPERIENCE, EDUCATION …) — Tier 1 only
  headerBgColor?: string;  // header panel background override; text colour auto-adjusted for contrast
  fontPairing?: string;    // custom font pairing key for V2 templates (e.g. 'playfair-dm')
  fontScale?: number;      // user-adjustable text-size multiplier for V2 templates (0.88–1.20, default 1.0)
  bulletStyle?: string;    // user-chosen bullet character for V2 templates (e.g. '▸', '◆', '–')
  onePage?: boolean;       // user wants content compressed to fit a single A4 page
  density?: number;
  /** Resolved spacing compression level (0–3) from the two-phase convergence loop. Persisted alongside density. */
  spacingLevel?: number;    // resolved zoom level from the one-page convergence loop (0.85–1.0); persisted so re-open matches last PDF
  _trace?: import('./services/generationTrace').GenerationTrace; // generation audit trail — stripped before PDF export
}


// --- App State & Settings ---

export interface SavedCV {
  id: string;
  name: string;
  createdAt: string;
  /** Full CV content. Stored in IndexedDB via cvDataStore; may be absent after migration. */
  data?: CVData;
  purpose: 'job' | 'academic' | 'general';
  template?: TemplateName;  // template used when saved
  qualityReport?: SavedCvQualityReport; // post-flight quality audit snapshot at save time
}

// Mirrors services/cvNumberFidelity::CvQualityReport but kept here so types.ts
// stays the single source of truth and we don't introduce circular imports.
export interface SavedCvQualityIssue {
  kind: string;
  where: string;
  snippet: string;
}
export interface SavedCvQualityReport {
  score: number;
  totalBullets: number;
  totalIssues: number;
  issues: SavedCvQualityIssue[];
  durationMs: number;
  auditedAt: string; // ISO timestamp when the audit ran
}

export interface SavedCoverLetter {
  id: string;
  name: string;
  createdAt: string;
  text: string;
  // Rich metadata saved at generation time — used for history cards & quality badges
  company?: string;
  jobTitle?: string;
  wordCount?: number;
  issueCount?: number; // number of HR rule violations at save time (0 = Excellent)
}

// --- Scholarship / Grant Application Formats ---
export type ScholarshipFormat =
  | 'standard'        // Generic academic CV
  | 'europass'        // EU Europass format
  | 'eu-horizon'      // EU Horizon Europe / Marie Curie / ERC
  | 'nih-nsf'         // US NIH / NSF Biosketch style
  | 'chevening'       // UK Chevening Scholarship
  | 'commonwealth';   // Commonwealth Scholarship

export interface ScholarshipFormatConfig {
  id: ScholarshipFormat;
  label: string;
  flag: string;
  description: string;
  keyFields: string[];
}

export const scholarshipFormats: ScholarshipFormatConfig[] = [
  {
    id: 'standard',
    label: 'Standard Academic',
    flag: '📄',
    description: 'General-purpose academic CV for scholarships, fellowships, and grants worldwide.',
    keyFields: ['Research Statement', 'Publications', 'Awards & Honors', 'Teaching Experience'],
  },
  {
    id: 'europass',
    label: 'Europass (EU)',
    flag: '🇪🇺',
    description: 'European standard CV format required by many EU institutions, Erasmus+, and DAAD.',
    keyFields: ['Personal Statement', 'Language Skills', 'Digital Competencies', 'Voluntary Work'],
  },
  {
    id: 'eu-horizon',
    label: 'EU Horizon / ERC',
    flag: '🇪🇺',
    description: 'Tailored for Horizon Europe, Marie Skłodowska-Curie Actions, and ERC grants.',
    keyFields: ['Research Excellence', 'Impact Statement', 'Publications (last 5 yrs)', 'Collaborations'],
  },
  {
    id: 'nih-nsf',
    label: 'NIH / NSF Biosketch',
    flag: '🇺🇸',
    description: 'US government grant format for National Institutes of Health and National Science Foundation.',
    keyFields: ['Personal Statement', 'Positions & Honours', 'Contributions to Science', 'Research Support'],
  },
  {
    id: 'chevening',
    label: 'Chevening (UK)',
    flag: '🇬🇧',
    description: 'UK Foreign Commonwealth & Development Office scholarship — leadership focused.',
    keyFields: ['Leadership Narrative', 'Networking', 'Career Vision', 'UK Study Plan'],
  },
  {
    id: 'commonwealth',
    label: 'Commonwealth',
    flag: '🌍',
    description: 'Commonwealth Scholarship Commission format for developing country applicants.',
    keyFields: ['Development Impact', 'Home Country Return', 'Current Role', 'Academic Record'],
  },
];

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'qwen';

export interface ApiSettings {
  provider: AIProvider;
  aiProvider?: 'workers-ai' | 'claude' | 'gemini' | 'groq'; // Active AI provider (single selection)
  apiKey: string | null;            // Gemini key (for PDF/image parsing + Gemini AI provider)
  claudeApiKey?: string | null;     // Anthropic Claude key (for Claude AI provider)
  groqApiKey?: string | null;       // Groq key (for Groq AI provider)
  tavilyApiKey?: string | null;     // For job search & company research
  brevoApiKey?: string | null;      // For sending emails via Brevo SMTP API
  msClientId?: string | null;       // Azure AD Client ID for Microsoft/OneDrive integration
  jsearchApiKey?: string | null;    // RapidAPI JSearch — live job listings
  // Legacy fields kept for backwards-compatible localStorage reads only — not shown in UI
  preferredFallback?: 'claude' | 'gemini';
}

export type PipelineStatus = 'queued' | 'generating' | 'cv-ready' | 'applied';

export interface ScrapedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  snippet: string;       // Short description from search result
  jobDescription: string; // Full JD text (fetched on demand)
  url: string;
  source: string;        // e.g. "LinkedIn", "Indeed"
  dateFound: string;
  status: PipelineStatus;
  linkedCvId?: string;   // Saved CV generated for this job
}

export type ApplicationStatus = 'Wishlist' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export type ApplicationPriority = 'Low' | 'Medium' | 'High' | 'Dream';

export interface TrackedApplication {
  id: string;
  savedCvId: string;
  savedCvName: string;
  roleTitle: string;
  company: string;
  status: ApplicationStatus;
  dateApplied: string;
  deadline?: string;
  interviewDate?: string;
  jobUrl?: string;
  salary?: string;
  priority?: ApplicationPriority;
  notes: string;
  /** Recorded when the user reaches Interviewing or Offer status. */
  interviewFeedback?: {
    gotInterview: boolean;
    note?: string;
    recordedAt: string;
  };
}


// --- Templates and Fonts ---

export type TemplateName =
  // ── Remaining legacy (still shown in gallery) ─────────────────────────────
  | 'professional'
  | 'minimalist'
  | 'creative'
  | 'timeline'
  | 'infographic'
  | 'harvard-gold'
  | 'tokyo-night'
  | 'paris-vibe'
  | 'london-finance'
  | 'berlin-design'
  | 'medical-standard'
  | 'swe-elite'
  | 'swe-neon'
  | 'swe-clean'
  | 'swe-vivid'
  | 'swe-impact'
  | 'ats-clean-pro'
  | 'v2-pro'
  | 'v2-navy'
  | 'v2-photo'
  | 'v2-slate-sidebar'
  | 'v2-gold-exec'
  | 'v2-minimal'
  | 'v2-sage'
  | 'v2-terminal'
  | 'v2-noir'
  | 'v2-editorial'
  | 'v2-coral'
  | 'v2-amber'
  | 'v2-ink'
  | 'v2-forest'
  | 'v2-classic-pro'
  | 'v2-standard-black'
  | 'v2-harvard'
  | 'v2-warm'
  | 'v2-steel'
  | 'v2-teal'
  | 'v2-bold'
  | 'v2-modern-blue'
  | 'v2-graphite'
  | 'v2-crimson'
  | 'v2-ats-max'
  | 'v2-skills-first'
  | 'v2-starter'
  | 'v2-executive-editorial';

// ── Sidebar section visibility (Sidebar Section Picker) ──────────────────────
// Controls which auto-generated sidebar fillers appear in templates that have
// a sidebar (TwoColumnBlue, NavySidebar, ExecutiveSidebar, PhotoSidebar,
// ModernTech, CompactSlate, CompactSage, CompactCharcoal). Stored in
// localStorage so the user's choice persists between sessions.
export interface SidebarSectionsVisibility {
  keyAchievements: boolean;
  selectedProjects: boolean;
  references: boolean;
}

export const DEFAULT_SIDEBAR_SECTIONS: SidebarSectionsVisibility = {
  keyAchievements: true,
  selectedProjects: true,
  references: true,
};

// Templates whose sidebar contains togglable Key Achievements / Selected
// Projects / References fillers. The Sidebar Section Picker toolbar only
// appears in the editor when one of these is selected.
// All legacy sidebar templates have been removed. V2 sidebar templates
// (v2-slate-sidebar, v2-photo, etc.) manage their own layout via the V2 engine.
export const SIDEBAR_TEMPLATES: TemplateName[] = [];

/**
 * Templates that enforce strict one-page rendering via the density convergence
 * loop in CVGenerator. Currently the full sidebar family — density (CSS zoom)
 * is auto-stepped until the content fits or the 0.85 floor is reached.
 */
export const STRICT_ONE_PAGE_TEMPLATES: TemplateName[] = [...SIDEBAR_TEMPLATES];

export const templateDisplayNames: Record<TemplateName, string> = {
  // ── Legacy (still shown in gallery) ───────────────────────────────────────
  professional:       'Professional',
  minimalist:         'Minimalist',
  creative:           'Creative',
  timeline:           'Timeline',
  infographic:        'Infographic',
  'harvard-gold':     'Harvard Gold',
  'tokyo-night':      'Tokyo Night',
  'paris-vibe':       'Paris Vibe',
  'london-finance':   'London Finance',
  'berlin-design':    'Berlin Design',
  'medical-standard': 'Medical Standard',
  'swe-elite':        'SWE Elite',
  'swe-neon':         'SWE Neon',
  'swe-clean':        'SWE Clean',
  'swe-vivid':        'SWE Vivid',
  'swe-impact':       'SWE Impact',
  'ats-clean-pro':    'ATS Clean Pro',
  // ── V2 ────────────────────────────────────────────────────────────────────
  'v2-pro':           'Clean Professional',
  'v2-navy':          'Navy Classic',
  'v2-photo':         'Photo Pro',
  'v2-slate-sidebar': 'Slate Sidebar',
  'v2-gold-exec':     'Gold Executive',
  'v2-minimal':       'Pure Minimal',
  'v2-sage':          'Sage Modern',
  'v2-terminal':      'Terminal Dark',
  'v2-noir':          'Noir Tech',
  'v2-editorial':     'Editorial Rose',
  'v2-coral':         'Warm Coral',
  'v2-amber':         'Amber Scholar',
  'v2-ink':           'Ink & Parchment',
  'v2-forest':        'Forest Pro',
  'v2-classic-pro':   'Classic Professional',
  'v2-standard-black':'Standard Black',
  'v2-harvard':       'Harvard Classic',
  'v2-warm':          'Warm Consultancy',
  'v2-steel':         'Steel Blue',
  'v2-teal':          'Teal Professional',
  'v2-bold':          'Bold Indigo',
  'v2-modern-blue':   'Modern Indigo',
  'v2-graphite':      'Graphite Clean',
  'v2-crimson':       'Crimson Elite',
  'v2-ats-max':       'ATS Maximum',
  'v2-skills-first':            'Skills First',
  'v2-starter':                 'Career Starter',
  'v2-executive-editorial':     'Executive Editorial',
};

// --- CV Generation Mode ---
// Controls how strongly the AI rewrites and restructures the CV content.
export type CVGenerationMode = 'honest' | 'boosted' | 'aggressive';

export interface CVGenerationModeConfig {
  id: CVGenerationMode;
  label: string;
  emoji: string;
  shortDesc: string;
  description: string;
  color: string; // Tailwind color class prefix for styling
}

export const cvGenerationModes: CVGenerationModeConfig[] = [
  {
    id: 'honest',
    label: 'Authentic',
    emoji: '✅',
    shortDesc: 'Your story, sharpened',
    description: 'Your real experience rewritten with strong action verbs, quantified results, and the exact keywords from the job description. Nothing invented — just your best, most persuasive self.',
    color: 'emerald',
  },
  {
    id: 'boosted',
    label: 'Enhanced',
    emoji: '🚀',
    shortDesc: 'Stronger framing + gaps filled',
    description: 'Your real experience rewritten for maximum impact, with bolder bullet framing, stronger scope language, and leadership indicators. Fills visible career gaps with plausible context drawn from your background.',
    color: 'blue',
  },
  {
    id: 'aggressive',
    label: 'Maximum',
    emoji: '🔥',
    shortDesc: 'Peak impact — every word optimised',
    description: 'Everything in Enhanced, plus your CV is restructured to foreground your strongest signals. Summary rewritten to match the ideal-candidate profile. Bullet sequence reordered for maximum ATS and human impact.',
    color: 'orange',
  },
];

export type FontName =
  | 'inter'
  | 'helvetica'
  | 'lora'
  | 'times-new-roman'
  | 'roboto-mono'
  | 'georgia'
  | 'garamond'
  | 'palatino'
  | 'century-gothic'
  | 'trebuchet';

export const fontDisplayNames: Record<FontName, string> = {
  'inter': 'Inter (Modern Sans)',
  'helvetica': 'Helvetica (Classic Sans)',
  'century-gothic': 'Century Gothic (Clean Sans)',
  'trebuchet': 'Trebuchet (Friendly Sans)',
  'georgia': 'Georgia (Readable Serif)',
  'lora': 'Lora (Elegant Serif)',
  'garamond': 'Garamond (Classic Serif)',
  'palatino': 'Palatino (Editorial Serif)',
  'times-new-roman': 'Times New Roman (Formal Serif)',
  'roboto-mono': 'Roboto Mono (Monospace)',
};


// --- PDF Merge ---

export type MergeItemSource = 'saved-cv' | 'cover-letter' | 'uploaded-pdf' | 'uploaded-image';

export interface MergeItem {
  id: string;
  source: MergeItemSource;
  label: string;
  // For saved-cv: cvId + template + font
  cvId?: string;
  cvTemplate?: TemplateName;
  cvFont?: FontName;
  // For cover-letter: the text itself
  coverLetterText?: string;
  // For uploaded-pdf: base64 encoded PDF
  uploadedPdfBase64?: string;
  // For uploaded-image: base64 encoded image + mime type
  uploadedImageBase64?: string;
  uploadedImageType?: string;
}

export interface SavedMerge {
  id: string;
  name: string;
  createdAt: string;
  items: MergeItem[];
}

// --- API Service Payloads ---

export interface JobAnalysisResult {
  keywords: string[];
  skills: string[];
  companyName?: string;
  jobTitle?: string; // The specific job title being applied for
  applicationEmail?: string; // Email address to send application to, if found in JD
  applicationMethod?: 'email' | 'portal' | 'unknown'; // How to apply
}

// --- Enhanced 6-Block Job Analysis (career-ops inspired) ---

export type JobArchetype =
  | 'Full-Stack / Dev Engineer'
  | 'Solutions Architect'
  | 'Product Manager'
  | 'LLMOps / MLOps'
  | 'Agentic AI'
  | 'Digital Transformation'
  | 'Data Scientist'
  | 'DevOps / Platform'
  | 'General Engineering'
  | 'Other';

export type MatchGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CVMatchGap {
  requirement: string;
  isBlocker: boolean;
  mitigation: string;
}

export interface STARStory {
  id: string;
  jobRequirement: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  createdAt: string;
  linkedCompany?: string;
  linkedRole?: string;
}

export interface PersonalizationChange {
  section: string;
  currentState: string;
  proposedChange: string;
  reason: string;
}

// ─── Job Vault ────────────────────────────────────────────────────────────────

export type VaultRoomType  = 'primary' | 'stretch' | 'uncategorized';
export type VaultJobStatus = 'saved' | 'building' | 'applied' | 'expired';
export type VaultPriority  = 'low' | 'medium' | 'high' | 'dream';
export type VaultInputType = 'text' | 'url' | 'pdf' | 'image';

export interface VaultJob {
  id:          string;
  roomId:      string;          // profile slot ID
  title:       string;
  company:     string;
  rawJd:       string;
  inputType:   VaultInputType;
  sourceUrl?:  string;
  matchScore?: number;          // 0–100, undefined = classifying
  roomReason?: string;
  roomType:    VaultRoomType;
  deadline?:   string;          // ISO date string
  priority:    VaultPriority;
  status:      VaultJobStatus;
  builtCvId?:  string;
  fingerprint: string;
  createdAt:   number;          // unix ms
  updatedAt:   number;
}

export interface EnhancedJobAnalysis {
  // Block A: Role Summary
  archetype: JobArchetype;
  domain: string;
  seniority: string;
  remote: 'Remote' | 'Hybrid' | 'On-site' | 'Unknown';
  tldr: string;

  // Block B: CV Match
  matchedRequirements: string[];
  gaps: CVMatchGap[];
  matchScore: number; // 0-100
  grade: MatchGrade;

  // Block C: Level Strategy
  levelStrategy: string;
  seniorPositioningTips: string[];

  // Block D: Salary Research
  salaryRange: string;
  salaryNotes: string;

  // Block E: Personalization Plan
  personalizationChanges: PersonalizationChange[];
  topKeywords: string[];

  // Block F: Interview STAR+R Prep
  starStories: Omit<STARStory, 'id' | 'createdAt'>[];

  // Meta
  companyName: string;
  jobTitle: string;
}
