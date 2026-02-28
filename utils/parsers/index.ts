// Re-export only the symbols actually consumed by other modules
export { waitForProfileToLoad } from './shared';
export { parseProfile } from './regular';

// parseProfileWithRetry lives here since it orchestrates the other parsers
import { CandidateProfile } from '../../types';
import { triggerLazyLoading } from './shared';
import { parseProfile } from './regular';

/**
 * Attempts to parse profile with minimal retry logic.
 * Optimized for speed - single attempt for user-initiated actions.
 *
 * @param maxRetries - Number of retry attempts (default 1 for instant response)
 * @param delayMs - Delay between retries if needed (default 100ms)
 * @param enableScrolling - If true, scrolls the page to trigger lazy loading.
 *                          Use ONLY for background/headless scrapes.
 */
export const parseProfileWithRetry = async (
  maxRetries: number = 1,
  delayMs: number = 100,
  enableScrolling: boolean = false
): Promise<CandidateProfile> => {
  // Only trigger lazy loading if explicitly enabled (background scrapes only)
  if (enableScrolling) {
    await triggerLazyLoading();
  }

  let lastResult = parseProfile();

  // Return immediately if we got valid data (fast path)
  if (lastResult.firstName && lastResult.firstName !== 'Unknown') {
    return lastResult;
  }

  // Only retry if first attempt failed and retries requested
  for (let i = 1; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    lastResult = parseProfile();
    if (lastResult.firstName && lastResult.firstName !== 'Unknown') {
      return lastResult;
    }
  }

  return lastResult;
};
