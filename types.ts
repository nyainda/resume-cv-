
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

export interface UserProfile {
  personalInfo: PersonalInfo;
  summary: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  projects?: Project[];
  languages?: Language[];
}

// --- Generated CV Data Structure ---

export interface CVExperience {
  company: string;
  jobTitle: string;
  dates: string;
  startDate: string; // For sorting
  endDate: string; // For sorting
  responsibilities: string[];
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

export interface CVData {
  summary: string;
  skills: string[];
  experience: CVExperience[];
  education: CVEducation[];
  projects?: CVProject[];
  languages?: CVLanguage[];
  publications?: CVPublication[];
}


// --- App State & Settings ---

export interface SavedCV {
  id: string;
  name: string;
  createdAt: string;
  data: CVData;
  purpose: 'job' | 'academic' | 'general';
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
  apiKey: string | null;
  tavilyApiKey?: string | null; // For job search & company research
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

export interface TrackedApplication {
  id: string;
  savedCvId: string;
  savedCvName: string;
  roleTitle: string;
  company: string;
  status: ApplicationStatus;
  dateApplied: string;
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
  | 'medical-standard';

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

export type FontName = 'inter' | 'lora' | 'roboto-mono' | 'helvetica' | 'times-new-roman';

export const fontDisplayNames: Record<FontName, string> = {
  'inter': 'Inter (Modern Sans)',
  'helvetica': 'Helvetica (Classic Sans)',
  'lora': 'Lora (Elegant Serif)',
  'times-new-roman': 'Times New Roman (Formal Serif)',
  'roboto-mono': 'Roboto Mono (Monospace)',
};


// --- API Service Payloads ---

export interface JobAnalysisResult {
  keywords: string[];
  skills: string[];
  companyName?: string;
  jobTitle?: string; // The specific job title being applied for
}
