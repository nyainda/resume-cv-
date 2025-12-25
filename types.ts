
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
  purpose: 'job' | 'academic';
}

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'qwen';

export interface ApiSettings {
  provider: AIProvider;
  apiKey: string | null;
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
  | 'standard-pro';

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
};

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
}
