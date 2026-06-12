import { ParseConfidence } from '../types';

// Pure profile helpers extracted from the React LinkedInInjector.

export const canSaveProfileBasic = (
  profile: any,
  isProfileUrl: (u: string) => boolean,
  hasMeaningfulProfileSignals: (p: any) => boolean,
): { ok: boolean; reason?: string } => {
  const firstName = (profile?.firstName || '').trim();
  const lastName = (profile?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
  const linkedinUrl = (profile?.linkedinUrl || '').trim();

  if (!firstName && !lastName) return { ok: false, reason: 'First Name or Last Name is required.' };
  if (!isProfileUrl(linkedinUrl)) return { ok: false, reason: 'This page is not recognized as a LinkedIn profile URL.' };
  if (!firstName || fullName === 'unknown')
    return { ok: false, reason: 'Profile parse looks incomplete. Please wait 2-3 seconds and try again.' };
  if (!hasMeaningfulProfileSignals(profile))
    return { ok: false, reason: 'Profile data quality is too low to save safely. Scroll the profile and retry.' };
  return { ok: true };
};

export const isLowConfidenceTopField = (value: string): boolean => {
  const text = (value || '').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  const blocked = [
    'comment', 'connection', 'follower', 'mutual', 'contact info',
    'save in sales navigator', 'pending', 'show more', 'show less', 'see all',
  ];
  if (blocked.some((token) => lower.includes(token))) return true;
  if (/^\d+\s*(comments?|connections?|followers?)$/i.test(text)) return true;
  return false;
};

export const sanitizeProfileTopFields = (data: any): any => {
  const sanitized = { ...data };
  if (isLowConfidenceTopField(sanitized.currentCompany || '')) sanitized.currentCompany = '';
  if (isLowConfidenceTopField(sanitized.location || '')) sanitized.location = '';
  if (isLowConfidenceTopField(sanitized.headline || '')) sanitized.headline = '';
  return sanitized;
};

export const defaultParseConfidence = (): ParseConfidence => ({
  overall: 'low',
  headline: 'low',
  location: 'low',
  currentCompany: 'low',
  jobTitle: 'low',
  lowFields: ['headline', 'location', 'currentCompany', 'jobTitle'],
});

const looksLikeRoleLine = (text: string): boolean => {
  if (!text) return false;
  return /(analyst|associate|manager|director|consultant|partner|officer|president|intern|founder|head|lead|specialist|engineer|developer|advisor|vice president|vp)/i.test(text);
};

const looksLikeCompanyLine = (text: string): boolean => {
  if (!text) return false;
  return /(\binc\.?\b|\bltd\.?\b|\bllc\b|\bgmbh\b|\bag\b|\bgroup\b|\bpartners?\b|\bcapital\b|\bbank\b|\bconsultants?\b|\badvisors?\b|\bholdings?\b)/i.test(text);
};

const parseHeadlineRole = (headline: string): string => {
  const clean = (headline || '').trim();
  const atIndex = clean.toLowerCase().indexOf(' at ');
  if (atIndex > 0) return clean.slice(0, atIndex).trim();
  return '';
};

export const deriveParseConfidence = (profile: any): ParseConfidence => {
  const headline = (profile?.headline || '').trim();
  const location = (profile?.location || '').trim();
  const company = (profile?.currentCompany || '').trim();
  const firstExpTitle = (profile?.experiences?.[0]?.title || '').trim();
  const headlineRole = parseHeadlineRole(headline);

  const headlineConfidence: ParseConfidence['headline'] =
    !headline || isLowConfidenceTopField(headline) ? 'low' : headline.length > 18 ? 'high' : 'medium';

  const locationConfidence: ParseConfidence['location'] =
    !location || isLowConfidenceTopField(location)
      ? 'low'
      : /,/.test(location) || /metropolitan area/i.test(location)
        ? 'high'
        : 'medium';

  const companyConfidence: ParseConfidence['currentCompany'] =
    !company || isLowConfidenceTopField(company) ? 'low' : looksLikeCompanyLine(company) ? 'high' : 'medium';

  let jobTitleConfidence: ParseConfidence['jobTitle'] = 'low';
  if (firstExpTitle && !isLowConfidenceTopField(firstExpTitle)) {
    if (company && firstExpTitle.toLowerCase() === company.toLowerCase()) {
      jobTitleConfidence = headlineRole && looksLikeRoleLine(headlineRole) ? 'medium' : 'low';
    } else if (looksLikeRoleLine(firstExpTitle)) {
      jobTitleConfidence = 'high';
    } else {
      jobTitleConfidence = 'medium';
    }
  } else if (headlineRole) {
    jobTitleConfidence = looksLikeRoleLine(headlineRole) ? 'high' : 'medium';
  }

  const lowFields: ParseConfidence['lowFields'] = [];
  if (headlineConfidence === 'low') lowFields.push('headline');
  if (locationConfidence === 'low') lowFields.push('location');
  if (companyConfidence === 'low') lowFields.push('currentCompany');
  if (jobTitleConfidence === 'low') lowFields.push('jobTitle');

  const overall: ParseConfidence['overall'] =
    lowFields.length > 0
      ? 'low'
      : [headlineConfidence, locationConfidence, companyConfidence, jobTitleConfidence].includes('medium')
        ? 'medium'
        : 'high';

  return {
    overall,
    headline: headlineConfidence,
    location: locationConfidence,
    currentCompany: companyConfidence,
    jobTitle: jobTitleConfidence,
    lowFields,
  };
};

export const mergeProfileReliably = (prev: any, next: any, mode: 'prefetch' | 'deep'): any => {
  const sanitizedNext = sanitizeProfileTopFields(next || {});
  const pickText = (incoming: string, existing: string) => {
    const cleanIncoming = (incoming || '').trim();
    if (!cleanIncoming) return existing || '';
    if (isLowConfidenceTopField(cleanIncoming)) return existing || '';
    return cleanIncoming;
  };
  const arr = (a: any[], b: any[]) => (Array.isArray(a) && a.length > 0 ? a : b || []);

  const result: any = {
    ...prev,
    ...sanitizedNext,
    firstName: sanitizedNext.firstName || prev.firstName || '',
    lastName: sanitizedNext.lastName || prev.lastName || '',
    headline: pickText(sanitizedNext.headline, prev.headline),
    location: pickText(sanitizedNext.location, prev.location),
    currentCompany: pickText(sanitizedNext.currentCompany, prev.currentCompany),
    about:
      mode === 'deep'
        ? (sanitizedNext.about || '').trim() || prev.about || ''
        : prev.about || (sanitizedNext.about || '').trim() || '',
    experiences: arr(sanitizedNext.experiences, prev.experiences),
    educations: arr(sanitizedNext.educations, prev.educations),
    skills: arr(sanitizedNext.skills, prev.skills),
    languages: arr(sanitizedNext.languages, prev.languages),
    certifications: arr(sanitizedNext.certifications, prev.certifications),
    courses: arr(sanitizedNext.courses, prev.courses),
    organizations: arr(sanitizedNext.organizations, prev.organizations),
    recommendations: arr(sanitizedNext.recommendations, prev.recommendations),
  };

  if (!result.currentCompany && result.experiences?.length > 0) {
    const firstExpCompany = (result.experiences[0]?.company || '').trim();
    if (!isLowConfidenceTopField(firstExpCompany)) result.currentCompany = firstExpCompany;
  }

  result.parseConfidence = deriveParseConfidence(result);
  return result;
};

export const emptyProfile = (linkedinUrl: string): any => ({
  firstName: '',
  lastName: '',
  headline: '',
  location: '',
  currentCompany: '',
  about: '',
  email: '',
  phone: '',
  connectionDegree: '',
  experiences: [],
  educations: [],
  skills: [],
  languages: [],
  certifications: [],
  courses: [],
  organizations: [],
  parseConfidence: defaultParseConfidence(),
  linkedinUrl,
});
