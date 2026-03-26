// Re-export only the symbols actually consumed by other modules
export { waitForProfileToLoad } from './shared';
export { parseProfile } from './regular';

// parseProfileWithRetry lives here since it orchestrates the other parsers
import { CandidateProfile } from '../../types';
import { triggerLazyLoading } from './shared';
import { parseProfile } from './regular';
import { fetchVoyagerProfile } from '../voyagerApi';

/**
 * Attempts to parse profile using Voyager API first (reliable structured data),
 * then falls back to DOM parsing if the API is unavailable.
 */
export const parseProfileWithRetry = async (
  maxRetries: number = 1,
  delayMs: number = 100,
  enableScrolling: boolean = false
): Promise<CandidateProfile> => {
  // Strategy 1: Voyager API (fast, reliable, structured JSON)
  try {
    const voyagerResult = await fetchVoyagerProfile();
    if (voyagerResult && voyagerResult.firstName && voyagerResult.firstName !== 'Unknown') {
      console.log('[Yena] Profile loaded via Voyager API');
      return voyagerResult;
    }
  } catch (err) {
    console.warn('[Yena] Voyager API failed, falling back to DOM parsing:', err);
  }

  // Strategy 2: DOM parsing fallback
  if (enableScrolling) {
    await triggerLazyLoading();
  }

  let lastResult = parseProfile();

  if (lastResult.firstName && lastResult.firstName !== 'Unknown') {
    return lastResult;
  }

  for (let i = 1; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    lastResult = parseProfile();
    if (lastResult.firstName && lastResult.firstName !== 'Unknown') {
      return lastResult;
    }
  }

  return lastResult;
};
