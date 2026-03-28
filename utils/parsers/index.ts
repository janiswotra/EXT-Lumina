export { waitForProfileToLoad } from './shared';
export { parseProfile } from './regular';

import { CandidateProfile } from '../../types';
import { triggerLazyLoading, extractProfilePictureUrl } from './shared';
import { parseProfile } from './regular';
import { fetchVoyagerProfile } from '../voyagerApi';
import { clickMoreInSections, extractSectionTexts } from './innerTextExtractor';
import { parseWithAI } from './aiParser';

export const parseProfileWithRetry = async (
  maxRetries: number = 1,
  delayMs: number = 100,
  enableScrolling: boolean = false
): Promise<CandidateProfile> => {
  // Strategy 1: Voyager API
  try {
    const voyagerResult = await fetchVoyagerProfile();
    if (voyagerResult && voyagerResult.firstName && voyagerResult.firstName !== 'Unknown') {
      console.log('[Yena] Profile loaded via Voyager API');
      return voyagerResult;
    }
  } catch (err) {
    console.warn('[Yena] Voyager API failed:', err);
  }

  // Strategy 2: AI parsing — click "more" buttons silently, extract text, send to Gemini
  if (!window.location.href.includes('/details/')) {
    try {
      await clickMoreInSections();
      const sections = extractSectionTexts();
      if (sections.header) {
        const aiResult = await parseWithAI(window.location.href, sections);
        if (aiResult && aiResult.firstName && aiResult.firstName !== 'Unknown') {
          if (!aiResult.profilePictureUrl) {
            aiResult.profilePictureUrl = extractProfilePictureUrl(aiResult.firstName, aiResult.lastName);
          }
          console.log('[Yena] Profile loaded via AI parsing');
          (aiResult as any)._parseMethod = 'ai';
          return aiResult;
        }
      }
    } catch (err) {
      console.warn('[Yena] AI parsing failed, falling back to DOM:', err);
    }
  }

  // Strategy 3: DOM parsing fallback
  if (enableScrolling) await triggerLazyLoading();

  let lastResult = parseProfile();
  if (lastResult.firstName && lastResult.firstName !== 'Unknown') return lastResult;

  for (let i = 1; i < maxRetries; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    lastResult = parseProfile();
    if (lastResult.firstName && lastResult.firstName !== 'Unknown') return lastResult;
  }

  return lastResult;
};
