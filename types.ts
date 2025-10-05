export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website?: string;
  github?: string;
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
  link?: string;
}

export interface Language {
    id: string;
    name: string;
    proficiency: string; // e.g., Native, Fluent, Proficient
}

export interface UserProfile {
  personalInfo: PersonalInfo;
  summary: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  projects: Project[];
  languages: Language[];
}

export interface CVData {
  summary: string;
  experience: {
    company: string;
    jobTitle: string;
    dates: string;
    responsibilities: string[];
  }[];
  skills: string[];
  education: {
    degree: string;
    school: string;
    year: string;
    description?: string; // Added optional description
  }[];
  projects: {
    name: string;
    description: string;
    link?: string;
  }[];
  languages: {
    name: string;
    proficiency: string;
  }[];
}

export interface SavedCV {
    id: string;
    name: string;
    createdAt: string;
    data: CVData;
}

export interface JobAnalysisResult {
    keywords: string[];
    skills: string[];
}

export type TemplateName = 
  | 'modern' 
  | 'professional'
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
  | 'classic';

export const templateDisplayNames: Record<TemplateName, string> = {
    modern: 'Modern',
    professional: 'Professional',
    minimalist: 'Minimalist',
    corporate: 'Corporate',
    creative: 'Creative',
    timeline: 'Timeline',
    twoColumnBlue: 'Two Column Blue',
    executive: 'Executive',
    technical: 'Technical',
    compact: 'Compact',
    elegant: 'Elegant',
    'software-engineer': 'Software Engineer',
    'modern-tech': 'Modern Tech',
    infographic: 'Infographic',
    classic: 'Classic',
};