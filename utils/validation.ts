import { CandidateProfile } from '../types';

/**
 * Checks whether a profile has enough meaningful data signals
 * (headline, location, company, about, experiences, etc.)
 * to be considered viable for saving.
 */
export function hasMeaningfulProfileSignals(profile: Partial<CandidateProfile>): boolean {
  const signals = [
    !!profile?.headline?.trim(),
    !!profile?.location?.trim(),
    !!profile?.currentCompany?.trim(),
    (profile?.about || '').trim().length > 20,
    Array.isArray(profile?.experiences) && profile.experiences.length > 0,
    Array.isArray(profile?.educations) && profile.educations.length > 0,
    Array.isArray(profile?.skills) && profile.skills.length > 0,
    typeof profile?.profilePictureUrl === 'string' && profile.profilePictureUrl.startsWith('http')
  ];
  return signals.filter(Boolean).length >= 2;
}

/**
 * Validates a profile before saving.
 * Returns { valid: true } if OK, or { valid: false, error: string } if not.
 */
export function validateProfileBeforeSave(
  profile: Partial<CandidateProfile>
): { valid: boolean; error?: string } {
  const firstName = (profile?.firstName || '').trim();
  const lastName = (profile?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
  const sourceUrl = (profile?.linkedinUrl || '').trim();

  const hasValidUrl = /^https?:\/\/(www\.)?linkedin\.com\/(in\/|sales\/lead\/|sales\/people\/|talent\/profile\/)/i.test(sourceUrl);
  if (!hasValidUrl) {
    return { valid: false, error: 'Invalid LinkedIn profile URL.' };
  }

  if (!firstName && !lastName) {
    return { valid: false, error: 'First Name or Last Name is required.' };
  }

  if (!firstName || fullName === 'unknown') {
    return { valid: false, error: 'Profile parse looks incomplete. Please reload the LinkedIn profile and try again.' };
  }

  if (!hasMeaningfulProfileSignals(profile)) {
    return { valid: false, error: 'Profile data quality too low. Scroll the LinkedIn profile and retry.' };
  }

  return { valid: true };
}
