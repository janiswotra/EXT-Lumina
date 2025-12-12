import { API_BASE_URL } from './constants';
import { ExtensionMessage, ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

// Only attach listeners if chrome.runtime exists
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  // Listener for messages from Content Script or Popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: any) => {
    console.log('[Lumina Background] Received message:', message.type, message);

    if (message.type === 'SAVE_CANDIDATE') {
      console.log('[Lumina Background] Processing SAVE_CANDIDATE');
      // Structure for the new API: { sourceUrl: string, profile: CandidateProfile }
      // The payload coming in is the flat CandidateProfile. We need to wrap it.
      const payload = {
        sourceUrl: message.payload.linkedInUrl,
        profile: message.payload
      };

      handleSaveCandidate(payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (message.type === 'CHECK_AUTH') {
      checkAuthStatus()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (message.type === 'CHECK_CANDIDATE_STATUS') {
      checkCandidateStatus(message.payload.sourceUrl)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }
  });

  // Listener for messages from External Web App (app.lumina-app.com)
  if (chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener((message: any, sender: any, sendResponse: any) => {
      if (message && message.type === 'PING') {
        sendResponse({ success: true, version: '1.0.0', type: 'PONG' });
        return false; // Synchronous response
      }
    });
  }
}

/**
 * Checks authentication status via /me endpoint.
 */
async function checkAuthStatus(): Promise<ApiResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/integrations/extension/me`, {
      method: 'GET',
      credentials: 'include', // Uses the browser session cookies
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0'
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return { success: true, data };
    }
    return { success: false, message: 'Not authenticated' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Checks if candidate exists via /status endpoint.
 */
async function checkCandidateStatus(sourceUrl: string): Promise<ApiResponse> {
  try {
    const url = new URL(`${API_BASE_URL}/integrations/linkedin/profiles/status`);
    url.searchParams.append('sourceUrl', sourceUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0'
      }
    });

    if (!response.ok) {
      // If 404, it might mean not found (not strictly error, just not exists), 
      // but usually status APIs return 200 with exists: false.
      // If 401, not auth.
      if (response.status === 401) return { success: false, message: 'Not authenticated' };
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();
    // Expected: { "exists": true, "candidateId": "...", "status": {...} }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Saves the candidate via POST /profiles
 */
async function handleSaveCandidate(body: any): Promise<ApiResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/integrations/linkedin/profiles`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0',
        'X-Lumina-Source': 'extension'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Lumina Background] Save failed:', response.status, errorData);
      throw new Error(`Failed to save (Status ${response.status}): ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('[Lumina Background] Save success:', data);
    return { success: true, data };

  } catch (error: any) {
    console.error('[Lumina Background] Save Exception:', error);
    return { success: false, message: error.message || 'Network error occurred.' };
  }
}