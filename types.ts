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

export interface Certification {
  name: string;
  issuer?: string;
  issueDate?: string;
}

export interface Course {
  name: string;
  institution?: string;
}

export interface Organization {
  name: string;
  role?: string;
}

export type ParseConfidenceLevel = 'high' | 'medium' | 'low';

export interface ParseConfidence {
  overall: ParseConfidenceLevel;
  headline: ParseConfidenceLevel;
  location: ParseConfidenceLevel;
  currentCompany: ParseConfidenceLevel;
  jobTitle: ParseConfidenceLevel;
  lowFields: Array<'headline' | 'location' | 'currentCompany' | 'jobTitle'>;
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
  connectionDegree?: string; // "1st", "2nd", "3rd", "1st+", etc.
  experiences: Experience[];
  educations: Education[];
  skills: string[];
  languages: string[];
  certifications?: Certification[];
  courses?: Course[];
  organizations?: Organization[];
  parseConfidence?: ParseConfidence;
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

export interface LinkedInMessage {
  id: string;
  text: string;
  senderName: string;
  isOutbound: boolean;
  timestamp: string;
}

export interface SyncMessagesPayload {
  messages: LinkedInMessage[];
  conversationId: string;
  participantUrl: string;
  participantName: string;
  participantUrls?: string[];
  participantMemberIds?: string[];
}

export interface CheckCandidateStatusPayload {
  sourceUrl: string;
  sourceUrls?: string[];
  memberIds?: string[];
  firstName?: string;
  lastName?: string;
  currentCompany?: string;
}

export type ExtensionMessage =
  | { type: 'SAVE_CANDIDATE'; payload: SaveCandidatePayload }
  | { type: 'CHECK_AUTH' }
  | { type: 'CHECK_CANDIDATE_STATUS'; payload: CheckCandidateStatusPayload }
  | { type: 'GET_JOBS' }
  | { type: 'GET_STAGES'; payload?: { jobId: string } }
  | { type: 'GET_LISTS' }
  | { type: 'CHECK_FOR_UPDATES'; payload: { linkedinUrl: string; profileId?: string } }
  | { type: 'SET_API_KEY'; payload: { apiKey: string } }
  | { type: 'SYNC_MESSAGES'; payload: SyncMessagesPayload };
