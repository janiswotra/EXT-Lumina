export interface Experience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
}

export interface Education {
  school: string;
  degree?: string;
  field?: string;
  endDate?: string;
}

export interface CandidateProfile {
  firstName: string;
  lastName: string;
  headline: string;
  location: string;
  linkedinUrl: string;
  currentCompany?: string;
  about?: string;
  profilePictureUrl?: string;
  email?: string;
  phone?: string;
  experiences: Experience[];
  educations: Education[];
  skills: string[];
  languages: string[];
}

export interface Job {
  id: string;
  title: string;
  company?: string;
  status?: string;
}

export interface Stage {
  id: string;
  name: string;
  order?: number;
  color?: string;
}

export interface List {
  id: string;
  name: string;
  count?: number;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  shouldAuth?: boolean;
}

export interface SaveCandidatePayload {
  profile: CandidateProfile;
  jobId?: string;
  stageId?: string;
  listId?: string;
}

export type ExtensionMessage =
  | { type: 'SAVE_CANDIDATE'; payload: SaveCandidatePayload }
  | { type: 'CHECK_AUTH' }
  | { type: 'CHECK_CANDIDATE_STATUS'; payload: { sourceUrl: string } }
  | { type: 'GET_JOBS' }
  | { type: 'GET_STAGES'; payload?: { jobId: string } }
  | { type: 'GET_LISTS' }
  | { type: 'CHECK_FOR_UPDATES'; payload: { linkedinUrl: string; profileId?: string } }
  // Harvest Queue messages
  | { type: 'GET_HARVEST_STATUS' }
  | { type: 'GET_HARVEST_QUEUE' }
  | { type: 'SYNC_HARVEST' }
  | { type: 'CLEAR_SYNCED' };

// Harvest Sync Response
export interface HarvestSyncResponse {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

