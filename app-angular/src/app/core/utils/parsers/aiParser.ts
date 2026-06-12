import { CandidateProfile } from '../../types';

/**
 * Sends extracted section texts to background → edge function → Gemini AI.
 */
export async function parseWithAI(
  profileUrl: string,
  sections: Record<string, string>
): Promise<CandidateProfile | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[Yena] AI parsing timed out after 15s');
      resolve(null);
    }, 15000);

    chrome.runtime.sendMessage(
      { type: 'PARSE_WITH_AI', payload: { profileUrl, sections } },
      (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          console.warn('[Yena] AI parsing message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }

        if (!response || !response.success || !response.data) {
          console.warn('[Yena] AI parsing returned no data:', response?.message);
          resolve(null);
          return;
        }

        resolve(response.data as CandidateProfile);
      }
    );
  });
}
