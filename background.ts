import { API_BASE_URL } from './constants';
import { ExtensionMessage, ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

// Queue to manage scraping requests sequentially
interface ScrapeTask {
  url: string;
  profileId: string;           // From main app, for correlation
  senderTabId: number;         // Tab that sent the request (app.yena.ai)
  sendResponse: (response: any) => void;
  timestamp: number;
}

const scrapeQueue: ScrapeTask[] = [];
let isProcessingQueue = false;

// Storage key for the current user ID
const USER_ID_STORAGE_KEY = 'lumina_user_id';

// Process the queue with delays to prevent detection/throttling
const processQueue = async () => {
  if (isProcessingQueue || scrapeQueue.length === 0) return;

  isProcessingQueue = true;
  const task = scrapeQueue.shift();

  if (task) {
    // Immediately acknowledge the request is queued
    task.sendResponse({ success: true, status: 'QUEUED' });

    try {
      console.log('[Lumina Background] Processing scrape task:', task.url);
      const result = await scrapeUrlInNewTab(task.url);

      // Send result to the originating tab (app.yena.ai) via contentApp.js
      chrome.tabs.sendMessage(task.senderTabId, {
        type: 'PROFILE_RESULT',
        payload: {
          profileId: task.profileId,
          data: result,
          success: true
        }
      }).catch((err: any) => {
        console.error('[Lumina Background] Failed to send result to tab:', err);
      });

    } catch (error: any) {
      console.error('[Lumina Background] Scrape task failed:', error);

      // Determine error type
      let errorType = 'UNKNOWN';
      if (error.message?.includes('timeout')) errorType = 'TIMEOUT';
      if (error.message?.includes('auth') || error.message?.includes('login')) errorType = 'AUTH_REQUIRED';

      // Send error to originating tab
      chrome.tabs.sendMessage(task.senderTabId, {
        type: 'PROFILE_RESULT',
        payload: {
          profileId: task.profileId,
          success: false,
          error: errorType
        }
      }).catch((err: any) => {
        console.error('[Lumina Background] Failed to send error to tab:', err);
      });
    }
  }

  // Cooldown before next request (randomized 3-6 seconds)
  const delay = Math.random() * 3000 + 3000;
  setTimeout(() => {
    isProcessingQueue = false;
    processQueue();
  }, delay);
};

/**
 * Opens a tab, scrapes the profile, and closes it.
 */
const scrapeUrlInNewTab = (url: string): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    let tabId: number | undefined;

    console.log('[Lumina Background] scrapeUrlInNewTab called for:', url);

    // Timeout safety - max 30 seconds per scrape
    const timeout = setTimeout(() => {
      console.log('[Lumina Background] ⏰ TIMEOUT reached for tab:', tabId);
      if (tabId) chrome.tabs.remove(tabId);
      reject(new Error('Scraping timed out'));
    }, 30000);

    try {
      // 1. Create inactive tab
      console.log('[Lumina Background] Creating tab...');
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      console.log('[Lumina Background] Tab created with ID:', tabId);

      if (!tabId) throw new Error('Failed to create tab');

      // 2. Wait for page to load
      // We rely on the content script to auto-run and eventually send a message
      // But for "headless" scraping, we might need to ping it or wait for a specific signal

      // Setup a one-time listener for this specific scraping session
      const messageListener = (message: any, sender: any) => {
        console.log('[Lumina Background] Message received:', message.type, 'from tab:', sender.tab?.id);
        if (sender.tab?.id === tabId && message.type === 'PROFILE_DATA_EXTRACTED') {
          console.log('[Lumina Background] ✅ Got PROFILE_DATA_EXTRACTED!', message.data?.firstName);
          chrome.runtime.onMessage.removeListener(messageListener);
          clearTimeout(timeout);
          if (tabId) chrome.tabs.remove(tabId);
          resolve(message.data);
          return;
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // 3. Inject script if needed (usually handled by manifest, but ensure it runs)
      // Note: We can send a message to the tab to force a report if it's already loaded
      chrome.tabs.onUpdated.addListener(function listener(uTabId: number, info: any) {
        if (uTabId === tabId && info.status === 'complete') {
          console.log('[Lumina Background] Tab finished loading, waiting 2s...');
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            console.log('[Lumina Background] Sending TRIGGER_SCRAPE to tab:', tabId);
            chrome.tabs.sendMessage(tabId!, { type: 'TRIGGER_SCRAPE' })
              .then(() => console.log('[Lumina Background] ✅ TRIGGER_SCRAPE sent'))
              .catch((err: any) => console.error('[Lumina Background] ❌ TRIGGER_SCRAPE failed:', err));
          }, 2000);
        }
      });

    } catch (e: any) {
      clearTimeout(timeout);
      if (tabId) chrome.tabs.remove(tabId);
      reject(e);
    }
  });
};

// Only attach listeners if chrome.runtime exists
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  // Listener for messages from Content Script or Popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: any) => {
    // ... handling existing internal messages ...
    // Note: We need to modify this block to not conflict with the external listener logic below

    // Handle standard internal messages
    if (message.type === 'SAVE_CANDIDATE') {
      console.log('[Lumina Background] Processing SAVE_CANDIDATE');
      handleSaveCandidate(message.payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }
    // ... (other handlers preserved in original file but we are just inserting above them)
    // We will leave the rest of the file flow as is, this insertion is CLEAN.

    // EXISTING HANDLERS START HERE (rest of file)
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

    if (message.type === 'GET_JOBS') {
      fetchJobs()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (message.type === 'GET_STAGES') {
      const jobId = message.payload?.jobId;
      fetchStages(jobId)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (message.type === 'GET_LISTS') {
      fetchLists()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    if (message.type === 'SET_API_KEY') {
      const apiKey = message.payload?.apiKey;
      if (!apiKey) {
        sendResponse({ success: false, message: 'No API Key provided' });
        return true;
      }
      chrome.storage.local.set({ lumina_api_key: apiKey }, () => {
        console.log('[Lumina Background] API Key saved via SET_API_KEY');
        sendResponse({ success: true });
      });
      return true;
    }

    // Handle CHECK_FOR_UPDATES relayed from contentApp.ts via postMessage
    // This is the reliable way for Manifest V3 - through content script relay
    if (message.type === 'CHECK_FOR_UPDATES') {
      console.log('[Lumina Background] CHECK_FOR_UPDATES received from content script:', message.payload);

      const senderTabId = sender.tab?.id;

      if (!senderTabId) {
        console.error('[Lumina Background] No sender tab ID for CHECK_FOR_UPDATES');
        sendResponse({ success: false, message: 'No sender tab' });
        return false;
      }

      // Enqueue the scrape request
      scrapeQueue.push({
        url: message.payload.linkedinUrl,
        profileId: message.payload.profileId || '',
        senderTabId: senderTabId,
        sendResponse,
        timestamp: Date.now()
      });

      // Start processing
      processQueue();

      return true; // Keep channel open for async response
    }
  });

  // Listener for messages from External Web App (app.yena.ai)
  if (chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener((message: any, sender: any, sendResponse: any) => {
      console.log('[Lumina Background] External message received:', message);

      if (message && message.type === 'PING') {
        sendResponse({ success: true, version: '1.0.4', type: 'PONG' });
        return false;
      }

      if (message && message.type === 'CHECK_FOR_UPDATES') {
        // For external messages, sender.tab might not exist
        // We need to find the yena.ai tab to send results back to
        let senderTabId = sender.tab?.id;

        console.log('[Lumina Background] CHECK_FOR_UPDATES - sender.tab:', sender.tab);

        // If we don't have a tab ID, try to find the yena.ai tab
        if (!senderTabId) {
          chrome.tabs.query({ url: ['https://app.yena.ai/*', 'https://*.yena.ai/*', 'http://localhost/*'] }, (tabs: chrome.tabs.Tab[]) => {
            if (tabs && tabs.length > 0) {
              senderTabId = tabs[0].id;
              console.log('[Lumina Background] Found yena.ai tab:', senderTabId);

              // Enqueue the request with profileId and sender info
              scrapeQueue.push({
                url: message.payload.linkedinUrl,
                profileId: message.payload.profileId || '',
                senderTabId: senderTabId!,
                sendResponse,
                timestamp: Date.now()
              });

              processQueue();
            } else {
              console.error('[Lumina Background] No yena.ai tab found');
              sendResponse({ success: false, message: 'Could not find app tab' });
            }
          });
          return true; // Keep channel open for async response
        }

        // Enqueue the request with profileId and sender info
        scrapeQueue.push({
          url: message.payload.linkedinUrl,
          profileId: message.payload.profileId || '',
          senderTabId: senderTabId,
          sendResponse,
          timestamp: Date.now()
        });

        // Start processing if not already
        processQueue();

        return true; // Keep channel open for async response
      }
    });
  }
}

/**
 * Helper to get headers with API Key
 * Note: Backend expects lowercase 'x-api-key' header
 */
async function getHeaders(): Promise<HeadersInit> {
  const result = await chrome.storage.local.get('lumina_api_key');
  const apiKey = result.lumina_api_key || '';

  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey  // Lowercase as expected by backend
  };
}

/**
 * Checks authentication status via /me endpoint.
 * Also stores the user ID for use in profile payloads.
 */
async function checkAuthStatus(): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const response = await fetch(`${API_BASE_URL}/integrations/extension/me`, {
      method: 'GET',
      credentials: 'omit',
      headers
    });

    if (response.status === 200) {
      const data = await response.json();

      // Store the user ID for later use in profile payloads
      if (data?.userId) {
        await chrome.storage.local.set({ [USER_ID_STORAGE_KEY]: data.userId });
        console.log('[Lumina Background] Stored user ID:', data.userId);
      }

      return { success: true, data };
    }

    if (response.status === 401 || response.status === 403) {
      // Clear stored user ID on auth failure
      await chrome.storage.local.remove(USER_ID_STORAGE_KEY);
      return { success: false, message: 'Invalid API Key', shouldAuth: true };
    }

    return { success: false, message: 'Not authenticated' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Gets the stored user ID for including in profile payloads.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(USER_ID_STORAGE_KEY);
    return result[USER_ID_STORAGE_KEY] || null;
  } catch (error) {
    console.error('[Lumina Background] Error getting user ID:', error);
    return null;
  }
}

/**
 * Normalize LinkedIn URL for consistent matching.
 * Removes query params, hash, trailing slash, and standardizes format.
 */
function normalizeLinkedInUrl(inputUrl: string): string {
  try {
    const parsed = new URL(inputUrl);
    // Remove query params and hash
    let path = parsed.pathname;
    // Remove trailing slash
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${parsed.origin}${path}`;
  } catch {
    return inputUrl;
  }
}

/**
 * Checks if candidate exists via /status endpoint.
 * Uses normalized URL to ensure consistent matching regardless of query params.
 */
async function checkCandidateStatus(sourceUrl: string): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    // Normalize the URL to ensure consistent matching
    const normalizedSourceUrl = normalizeLinkedInUrl(sourceUrl);
    console.log('[Lumina Background] Checking candidate status for:', normalizedSourceUrl);

    const url = new URL(`${API_BASE_URL}/integrations/linkedin/profiles/status`);
    url.searchParams.append('sourceUrl', normalizedSourceUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit',
      headers
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Unauthorized', shouldAuth: true };
      }
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Lumina Background] Candidate status result:', data.exists ? 'EXISTS' : 'NEW');
    return { success: true, data };
  } catch (error: any) {
    console.error('[Lumina Background] Status check error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available jobs from the backend.
 */
async function fetchJobs(): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const endpoint = `${API_BASE_URL}/integrations/extension/jobs`;
    console.log('[Lumina Background] Fetching jobs from:', endpoint);

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers
    });

    console.log('[Lumina Background] Jobs response status:', response.status);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Unauthorized', shouldAuth: true };
      }
      const errorText = await response.text();
      console.error('[Lumina Background] Jobs error response:', errorText);
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Lumina Background] Jobs data:', data);
    return { success: true, data };
  } catch (error: any) {
    console.error('[Lumina Background] Fetch Jobs Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available stages from the backend.
 * Accepts optional jobId to fetch job-specific stages.
 */
async function fetchStages(jobId?: string): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    // Include jobId parameter if provided for job-specific stages
    const endpoint = jobId
      ? `${API_BASE_URL}/integrations/extension/stages?jobId=${encodeURIComponent(jobId)}`
      : `${API_BASE_URL}/integrations/extension/stages`;
    console.log('[Lumina Background] Fetching stages from:', endpoint, jobId ? `(job: ${jobId})` : '(global)');

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers
    });



    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Unauthorized', shouldAuth: true };
      }
      throw new Error(`Failed to fetch stages: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    console.error('[Lumina Background] Fetch Stages Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available candidate lists from the backend.
 */
async function fetchLists(): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const response = await fetch(`${API_BASE_URL}/integrations/extension/lists`, {
      method: 'GET',
      credentials: 'omit',
      headers
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Unauthorized', shouldAuth: true };
      }
      throw new Error(`Failed to fetch lists: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    console.error('[Lumina Background] Fetch Lists Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Saves the candidate via POST /profiles
 * Transforms the extension's profile format to match the backend's expected structure
 * Includes importedByUserId to track who imported the candidate
 */
async function handleSaveCandidate(body: any): Promise<ApiResponse> {
  try {
    const headers = await getHeaders() as any;
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    // Get the current user ID to include in the payload
    const importedByUserId = await getCurrentUserId();

    // Transform the profile data to match backend's expected structure
    const frontendProfile = body.profile || {};

    const transformedPayload = {
      profile: {
        sourceUrl: frontendProfile.linkedinUrl || frontendProfile.sourceUrl || '',
        name: {
          firstName: frontendProfile.firstName || '',
          lastName: frontendProfile.lastName || ''
        },
        headline: frontendProfile.headline || '',
        location: frontendProfile.location || '',
        currentCompany: frontendProfile.currentCompany || '',
        about: frontendProfile.about || '',
        email: frontendProfile.email || '',
        phone: frontendProfile.phone || '',
        profilePictureUrl: frontendProfile.profilePictureUrl || '',
        connectionDegree: frontendProfile.connectionDegree || '',
        experience: frontendProfile.experiences || frontendProfile.experience || [],
        education: frontendProfile.educations || frontendProfile.education || [],
        skills: frontendProfile.skills || [],
        languages: frontendProfile.languages || [],
        certifications: frontendProfile.certifications || [],
        courses: frontendProfile.courses || [],
        organizations: frontendProfile.organizations || [],
        // Include the user ID who imported this profile
        ...(importedByUserId && { importedByUserId })
      },
      // Optional fields
      ...(body.jobId && { jobId: body.jobId }),
      ...(body.stageId && { stageId: body.stageId }),
      ...(body.listId && { listId: body.listId })
    };

    console.log('[Lumina Background] Transformed payload:', transformedPayload);

    const response = await fetch(`${API_BASE_URL}/integrations/linkedin/profiles`, {
      method: 'POST',
      credentials: 'omit',
      headers,
      body: JSON.stringify(transformedPayload)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Invalid API Key', shouldAuth: true };
      }
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
