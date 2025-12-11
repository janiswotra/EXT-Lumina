import { API_BASE_URL, APP_DOMAIN } from './constants';
import { ExtensionMessage, CandidateProfile, ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

// Only attach listeners if chrome.runtime exists
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  // Listener for messages from Content Script or Popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: any) => {
    if (message.type === 'SAVE_CANDIDATE') {
      handleSaveCandidate(message.payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true; // Indicates async response
    }
    
    if (message.type === 'CHECK_AUTH') {
      checkAuthStatus()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }
  });
}

/**
 * Retrieves the session cookie for the Lumina domain.
 */
async function getLuminaCookie(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.cookies) {
    return null;
  }
  try {
    const cookie = await chrome.cookies.get({ url: APP_DOMAIN, name: 'lumina_session' });
    return cookie ? cookie.value : null;
  } catch (error) {
    console.error('Error fetching cookie:', error);
    return null;
  }
}

/**
 * Orchestrates the API call to save the candidate.
 */
async function handleSaveCandidate(profile: CandidateProfile): Promise<ApiResponse> {
  const token = await getLuminaCookie();

  if (!token) {
    return { success: false, message: 'Not authenticated. Please log in to Lumina.' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/candidates/linkedin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Assuming token auth, or we can rely on cookie if backend supports it
        'X-Lumina-Source': 'extension'
      },
      body: JSON.stringify(profile)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to save candidate.');
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error: any) {
    return { success: false, message: error.message || 'Network error occurred.' };
  }
}

async function checkAuthStatus(): Promise<ApiResponse> {
  const token = await getLuminaCookie();
  return { success: !!token };
}