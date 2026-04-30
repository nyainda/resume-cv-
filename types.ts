
// types.ts

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
  graduationYear: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
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
  currentJobDescription?: string;   // last JD used per profile
  activeTab?: string;               // last active tab per profile
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
  link?: string; // Optional GitHub/project URL for project-based roles
}

export interface CVEducation {
  degree: string;
  school: string;
  year: string;
  description?: string;
}

export interface CVProject {
  name: string;
  description: string;
  link?: string;
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
  customSections?: CustomSection[]; // user-defined extra sections
  sectionOrder?: ProfileSectionKey[]; // mirrors the profile's preferred section ordering
  accentColor?: string; // custom accent color for the selected template
}


// --- App State & Settings ---

export interface SavedCV {
  id: string;
  name: string;
  createdAt: string;
  data: CVData;
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
  apiKey: string | null;            // Gemini key (for PDF/image parsing)
  groqApiKey?: string | null;       // Groq key (for CV gen, cover letters, rewriting)
  cerebrasApiKey?: string | null;   // Cerebras key (automatic fallback when Groq quota is exceeded)
  openrouterApiKey?: string | null; // OpenRouter key (free Llama 3.3 70B & more — separate daily quota)
  togetherApiKey?: string | null;   // Together.ai key (free Llama 3.3 70B Turbo — separate daily quota)
  claudeApiKey?: string | null;     // Anthropic Claude key (optional AI provider)
  tavilyApiKey?: string | null;     // For job search & company research
  brevoApiKey?: string | null;      // For sending emails via Brevo SMTP API
  msClientId?: string | null;       // Azure AD Client ID for Microsoft/OneDrive integration
  jsearchApiKey?: string | null;    // RapidAPI JSearch — live job listings
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
}


// --- Templates and Fonts ---

export type TemplateName =
  | 'professional'
  | 'modern'
  | 'minimalist'
  | 'corporate'
  | 'creative'
  | 'timeline'
  | 'twoColumnBlue'
  | 'executive'
  | 'technical'
  | 'compact'
  | 'elegant'
  | 'software-engineer'
  | 'modern-tech'
  | 'infographic'
  | 'classic'
  | 'standard-pro'
  | 'harvard-gold'
  | 'tokyo-night'
  | 'paris-vibe'
  | 'london-finance'
  | 'berlin-design'
  | 'silicon-valley'
  | 'sydney-creative'
  | 'scholarship-pro'
  | 'medical-standard'
  | 'navy-sidebar'
  | 'photo-sidebar'
  | 'swe-elite'
  | 'swe-neon'
  | 'swe-clean'
  | 'swe-vivid'
  | 'swe-impact'
  | 'ats-clean-pro'
  | 'executive-sidebar'
  | 'compact-slate'
  | 'compact-sage'
  | 'compact-charcoal';

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
export const SIDEBAR_TEMPLATES: TemplateName[] = [
  'twoColumnBlue',
  'navy-sidebar',
  'executive-sidebar',
  'photo-sidebar',
  'modern-tech',
  'compact-slate',
  'compact-sage',
  'compact-charcoal',
];

export const templateDisplayNames: Record<TemplateName, string> = {
  professional: 'Professional',
  modern: 'Modern',
  'software-engineer': 'Tech',
  minimalist: 'Minimalist',
  corporate: 'Corporate',
  elegant: 'Elegant',
  'modern-tech': 'Modern Tech',
  'twoColumnBlue': 'Two Column',
  creative: 'Creative',
  timeline: 'Timeline',
  executive: 'Executive',
  technical: 'Technical',
  compact: 'Compact',
  infographic: 'Infographic',
  classic: 'Classic',
  'standard-pro': 'Standard Professional',
  'harvard-gold': 'Harvard Gold',
  'tokyo-night': 'Tokyo Night',
  'paris-vibe': 'Paris Vibe',
  'london-finance': 'London Finance',
  'berlin-design': 'Berlin Design',
  'silicon-valley': 'Silicon Valley',
  'sydney-creative': 'Sydney Creative',
  'scholarship-pro': 'Scholarship Pro',
  'medical-standard': 'Medical Standard',
  'navy-sidebar': 'Navy Sidebar',
  'photo-sidebar': 'Photo Sidebar',
  'swe-elite': 'SWE Elite',
  'swe-neon': 'SWE Neon',
  'swe-clean': 'SWE Clean',
  'swe-vivid': 'SWE Vivid',
  'swe-impact': 'SWE Impact',
  'ats-clean-pro': 'ATS Clean Pro',
  'executive-sidebar': 'Executive Sidebar',
  'compact-slate': 'Compact Slate',
  'compact-sage': 'Compact Sage',
  'compact-charcoal': 'Compact Charcoal',
};

// --- CV Generation Mode ---
// Controls how aggressively the AI enhances the CV beyond the user's real experience.
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
    label: 'Honest Mode',
    emoji: '✅',
    shortDesc: 'Power up your real story',
    description: 'Your actual experience, reworded with strong action verbs, quantified achievements, and ATS-optimized keywords from the JD. No fabrication — just your best self.',
    color: 'emerald',
  },
  {
    id: 'boosted',
    label: 'Boosted Mode',
    emoji: '🚀',
    shortDesc: 'Add plausible extras to stand out',
    description: 'Your real experience enhanced + 1 strategically crafted extra role from a mid-sized credible company that fills career gaps and strengthens your candidacy.',
    color: 'blue',
  },
  {
    id: 'aggressive',
    label: 'Aggressive Mode',
    emoji: '🔥',
    shortDesc: 'Full optimization — maximum impact',
    description: 'Maximum CV power. The AI goes all-in: rewrites every bullet for peak impact, adds 1-2 targeted roles, and crafts a summary that positions you as the ideal candidate.',
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
