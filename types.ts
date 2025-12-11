export interface Experience {
  title: string;
  company: string;
  dates?: string;
  description?: string;
  location?: string;
}

export interface Education {
  school: string;
  degree?: string;
  dates?: string;
}

export interface CandidateProfile {
  firstName: string;
  lastName: string;
  headline: string;
  location: string;
  linkedInUrl: string;
  currentCompany?: string;
  experiences: Experience[];
  educations: Education[];
  skills: string[];
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export type ExtensionMessage = 
  | { type: 'SAVE_CANDIDATE'; payload: CandidateProfile }
  | { type: 'CHECK_AUTH' };
