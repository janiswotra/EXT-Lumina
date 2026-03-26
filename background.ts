import { ENVIRONMENTS, ACTIVE_ENV_KEY, STORAGE_KEYS, EnvConfig, getEnvById } from './constants';
import { ExtensionMessage, ApiResponse, SyncMessagesPayload, CheckCandidateStatusPayload } from './types';
import { normalizeLinkedInUrl, extractLinkedInMemberId } from './utils/linkedin';
import { validateProfileBeforeSave } from './utils/validation';

// Validate that a URL is a legitimate LinkedIn profile URL before scraping
function isValidScrapeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('linkedin.com') && /^\/(in|sales\/(lead|people)|talent\/profile)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

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

/**
 * Get the active environment config from chrome.storage.
 * Falls back to the first configured environment.
 */
async function getActiveEnv(): Promise<EnvConfig> {
  try {
    const result = await chrome.storage.local.get(ACTIVE_ENV_KEY);
    const envId = result[ACTIVE_ENV_KEY] as string;
    if (envId) {
      const env = getEnvById(envId);
      if (env) return env;
    }
  } catch (error) {
    console.error('[Yena Background] Error reading active env:', error);
  }
  return ENVIRONMENTS[0];
}

// Process the queue with delays to prevent detection/throttling
const processQueue = async () => {
  if (isProcessingQueue || scrapeQueue.length === 0) return;

  isProcessingQueue = true;
  const task = scrapeQueue.shift();

  if (task) {
    // Immediately acknowledge the request is queued
    task.sendResponse({ success: true, status: 'QUEUED' });

    try {
      console.log('[Yena Background] Processing scrape task:', task.url);
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
        console.error('[Yena Background] Failed to send result to tab:', err);
      });

    } catch (error: any) {
      console.error('[Yena Background] Scrape task failed:', error);

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
        console.error('[Yena Background] Failed to send error to tab:', err);
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
const scrapeUrlInNewTab = async (url: string): Promise<any> => {
  let tabId: number | undefined;
  let settled = false;
  let messageListener: ((message: any, sender: any) => void) | null = null;
  let tabUpdatedListener: ((uTabId: number, info: any) => void) | null = null;
  let timeout: ReturnType<typeof setTimeout>;

  console.log('[Yena Background] scrapeUrlInNewTab called for:', url);

  const cleanup = () => {
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
      messageListener = null;
    }
    if (tabUpdatedListener) {
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      tabUpdatedListener = null;
    }
    clearTimeout(timeout);
  };

  try {
    // 1. Create inactive tab
    console.log('[Yena Background] Creating tab...');
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    console.log('[Yena Background] Tab created with ID:', tabId);

    if (!tabId) throw new Error('Failed to create tab');

    // 2. Wait for profile data via Promise
    const result = await new Promise<any>((resolve, reject) => {
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      // Timeout safety - max 30 seconds per scrape
      timeout = setTimeout(() => {
        console.log('[Yena Background] TIMEOUT reached for tab:', tabId);
        settle(() => {
          if (tabId) chrome.tabs.remove(tabId).catch(() => null);
          reject(new Error('Scraping timed out'));
        });
      }, 30000);

      // Setup a one-time listener for this specific scraping session
      messageListener = (message: any, sender: any) => {
        if (sender.tab?.id === tabId && message.type === 'PROFILE_DATA_EXTRACTED') {
          console.log('[Yena Background] Got PROFILE_DATA_EXTRACTED:', message.data?.firstName);
          settle(() => {
            if (tabId) chrome.tabs.remove(tabId).catch(() => null);
            resolve(message.data);
          });
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Wait for tab to finish loading, then trigger scrape
      tabUpdatedListener = (uTabId: number, info: any) => {
        if (uTabId === tabId && info.status === 'complete') {
          console.log('[Yena Background] Tab finished loading, waiting 2s...');
          if (tabUpdatedListener) {
            chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
            tabUpdatedListener = null;
          }
          setTimeout(() => {
            console.log('[Yena Background] Sending TRIGGER_SCRAPE to tab:', tabId);
            chrome.tabs.sendMessage(tabId!, { type: 'TRIGGER_SCRAPE' })
              .then(() => console.log('[Yena Background] TRIGGER_SCRAPE sent'))
              .catch((err: any) => console.error('[Yena Background] TRIGGER_SCRAPE failed:', err));
          }, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    });

    return result;
  } catch (e: any) {
    cleanup();
    if (tabId) chrome.tabs.remove(tabId).catch(() => null);
    throw e;
  }
};

// Only attach listeners if chrome.runtime exists
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  // Listener for messages from Content Script or Popup
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: any) => {
    // ... handling existing internal messages ...
    // Note: We need to modify this block to not conflict with the external listener logic below

    // Handle standard internal messages
    if (message.type === 'SAVE_CANDIDATE') {
      console.log('[Yena Background] Processing SAVE_CANDIDATE');
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
      checkCandidateStatus(message.payload)
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
      // Store API key under per-env key
      getActiveEnv().then((env) => {
        const storageKey = STORAGE_KEYS.apiKey(env.id);
        chrome.storage.local.set({ [storageKey]: apiKey }, () => {
          console.log('[Yena Background] API Key saved for env:', env.id);
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (message.type === 'SYNC_MESSAGES') {
      console.log('[Yena Background] Processing SYNC_MESSAGES');
      handleSyncMessages(message.payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err.message }));
      return true;
    }

    // Handle GET_ACTIVE_ENV request from UI components
    if (message.type === 'GET_ACTIVE_ENV') {
      getActiveEnv().then((env) => {
        sendResponse({ success: true, data: { id: env.id, label: env.label } });
      });
      return true;
    }

    // Handle CHECK_FOR_UPDATES relayed from contentApp.ts via postMessage
    // This is the reliable way for Manifest V3 - through content script relay
    if (message.type === 'CHECK_FOR_UPDATES') {
      console.log('[Yena Background] CHECK_FOR_UPDATES received from content script:', message.payload);

      const senderTabId = sender.tab?.id;

      if (!senderTabId) {
        console.error('[Yena Background] No sender tab ID for CHECK_FOR_UPDATES');
        sendResponse({ success: false, message: 'No sender tab' });
        return false;
      }

      // Validate URL before enqueuing
      const linkedinUrl = message.payload?.linkedinUrl;
      if (!linkedinUrl || !isValidScrapeUrl(linkedinUrl)) {
        sendResponse({ success: false, message: 'Invalid LinkedIn URL' });
        return false;
      }

      // Enqueue the scrape request
      scrapeQueue.push({
        url: linkedinUrl,
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
      console.log('[Yena Background] External message received:', message);

      if (message && message.type === 'PING') {
        sendResponse({ success: true, version: chrome.runtime.getManifest().version, type: 'PONG' });
        return false;
      }

      if (message && message.type === 'CHECK_FOR_UPDATES') {
        // Validate URL before enqueuing
        const linkedinUrl = message.payload?.linkedinUrl;
        if (!linkedinUrl || !isValidScrapeUrl(linkedinUrl)) {
          sendResponse({ success: false, message: 'Invalid LinkedIn URL' });
          return false;
        }

        // For external messages, sender.tab might not exist
        // We need to find the yena.ai tab to send results back to
        let senderTabId = sender.tab?.id;

        console.log('[Yena Background] CHECK_FOR_UPDATES - sender.tab:', sender.tab);

        // If we don't have a tab ID, try to find the yena.ai tab
        if (!senderTabId) {
          chrome.tabs.query({ url: ['https://app.yena.ai/*', 'https://*.yena.ai/*', 'http://localhost/*'] }, (tabs: chrome.tabs.Tab[]) => {
            if (tabs && tabs.length > 0) {
              senderTabId = tabs[0].id;
              console.log('[Yena Background] Found yena.ai tab:', senderTabId);

              // Enqueue the request with profileId and sender info
              scrapeQueue.push({
                url: linkedinUrl,
                profileId: message.payload.profileId || '',
                senderTabId: senderTabId!,
                sendResponse,
                timestamp: Date.now()
              });

              processQueue();
            } else {
              console.error('[Yena Background] No yena.ai tab found');
              sendResponse({ success: false, message: 'Could not find app tab' });
            }
          });
          return true; // Keep channel open for async response
        }

        // Enqueue the request with profileId and sender info
        scrapeQueue.push({
          url: linkedinUrl,
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
 * Helper to get headers with API Key for the active environment.
 * Sends both Authorization (for Supabase gateway) and x-api-key (for app auth)
 */
async function getHeaders(): Promise<Record<string, string>> {
  const env = await getActiveEnv();
  const storageKey = STORAGE_KEYS.apiKey(env.id);
  const result = await chrome.storage.local.get(storageKey);
  const apiKey = (result[storageKey] as string) || '';

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.supabaseAnonKey}`,
    'x-api-key': apiKey
  };
}

/**
 * Checks authentication status via /me endpoint.
 * Tries the active environment first, then falls back to all other environments.
 * When auth succeeds on a different env, switches to that env automatically.
 */
async function checkAuthStatus(): Promise<ApiResponse> {
  try {
    const activeEnv = await getActiveEnv();
    const storageKey = STORAGE_KEYS.apiKey(activeEnv.id);
    const result = await chrome.storage.local.get(storageKey);
    const apiKey = (result[storageKey] as string) || '';

    if (!apiKey) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    // Try active env first, then all others
    const envsToTry = [activeEnv, ...ENVIRONMENTS.filter(e => e.id !== activeEnv.id)];

    for (const env of envsToTry) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.supabaseAnonKey}`,
          'x-api-key': apiKey
        };

        const response = await fetch(`${env.apiBaseUrl}/extension-auth`, {
          method: 'GET',
          credentials: 'omit',
          headers
        });

        if (response.status === 200) {
          const data = await response.json();

          // If auth succeeded on a different env, switch to it
          if (env.id !== activeEnv.id) {
            console.log('[Yena Background] Key valid on', env.id, '- switching active env');
            await chrome.storage.local.set({
              [ACTIVE_ENV_KEY]: env.id,
              [STORAGE_KEYS.apiKey(env.id)]: apiKey
            });
          }

          // Store the user ID under per-env key
          if (data?.userId) {
            const userIdKey = STORAGE_KEYS.userId(env.id);
            await chrome.storage.local.set({ [userIdKey]: data.userId });
            console.log('[Yena Background] Stored user ID for env', env.id, ':', data.userId);
          }

          return { success: true, data };
        }
      } catch (err) {
        console.log('[Yena Background] Auth check failed for env', env.id, ':', err);
      }
    }

    // All envs failed — clear stored user ID on active env
    const userIdKey = STORAGE_KEYS.userId(activeEnv.id);
    await chrome.storage.local.remove(userIdKey);
    return { success: false, message: 'Invalid API Key', shouldAuth: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Gets the stored user ID for including in profile payloads.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const env = await getActiveEnv();
    const userIdKey = STORAGE_KEYS.userId(env.id);
    const result = await chrome.storage.local.get(userIdKey);
    return (result[userIdKey] as string) || null;
  } catch (error) {
    console.error('[Yena Background] Error getting user ID:', error);
    return null;
  }
}


function buildLinkedInIdentityBundle(sourceUrl: string): {
  normalizedUrl: string;
  urls: string[];
  memberIds: string[];
} {
  const normalizedUrl = normalizeLinkedInUrl(sourceUrl || '');
  const urlSet = new Set<string>();
  const memberIdSet = new Set<string>();

  if (normalizedUrl) urlSet.add(normalizedUrl);

  const memberId = extractLinkedInMemberId(normalizedUrl);
  if (memberId) {
    memberIdSet.add(memberId);
    urlSet.add(`https://www.linkedin.com/in/${memberId}`);
  }

  return {
    normalizedUrl,
    urls: Array.from(urlSet),
    memberIds: Array.from(memberIdSet)
  };
}


/**
 * Checks if candidate exists via /status endpoint.
 * Sends normalized URL + identity aliases for robust matching.
 */
async function checkCandidateStatus(payload: CheckCandidateStatusPayload | string): Promise<ApiResponse> {
  try {
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const sourceUrl = typeof payload === 'string' ? payload : (payload?.sourceUrl || '');
    const identityBundle = buildLinkedInIdentityBundle(sourceUrl);

    const sourceUrls = new Set<string>([identityBundle.normalizedUrl, ...identityBundle.urls].filter(Boolean));
    const memberIds = new Set<string>(identityBundle.memberIds);

    if (typeof payload !== 'string') {
      for (const url of payload.sourceUrls || []) {
        const normalized = normalizeLinkedInUrl(url);
        if (normalized) sourceUrls.add(normalized);
      }
      for (const memberId of payload.memberIds || []) {
        if (memberId) memberIds.add(memberId);
      }
    }

    const firstName = typeof payload === 'string' ? '' : (payload.firstName || '').trim();
    const lastName = typeof payload === 'string' ? '' : (payload.lastName || '').trim();
    const currentCompany = typeof payload === 'string' ? '' : (payload.currentCompany || '').trim();

    console.log('[Yena Background] Checking candidate status for:', {
      sourceUrl: identityBundle.normalizedUrl,
      sourceUrls: Array.from(sourceUrls),
      memberIds: Array.from(memberIds),
      firstName,
      lastName,
      currentCompany
    });

    const url = new URL(`${env.apiBaseUrl}/linkedin-status`);
    url.searchParams.append('sourceUrl', identityBundle.normalizedUrl);

    Array.from(sourceUrls).forEach((value) => {
      url.searchParams.append('sourceUrls[]', value);
      url.searchParams.append('sourceUrlVariant', value);
    });

    Array.from(memberIds).forEach((value) => {
      url.searchParams.append('memberIds[]', value);
      url.searchParams.append('memberId', value);
    });

    if (firstName) url.searchParams.append('firstName', firstName);
    if (lastName) url.searchParams.append('lastName', lastName);
    if (currentCompany) {
      url.searchParams.append('currentCompany', currentCompany);
      url.searchParams.append('company', currentCompany);
    }

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
    console.log('[Yena Background] Candidate status result:', data.exists ? 'EXISTS' : 'NEW');
    return { success: true, data };
  } catch (error: any) {
    console.error('[Yena Background] Status check error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available jobs from the backend.
 */
async function fetchJobs(): Promise<ApiResponse> {
  try {
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const endpoint = `${env.apiBaseUrl}/extension-jobs?_ts=${Date.now()}`;
    console.log('[Yena Background] Fetching jobs from:', endpoint);

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers,
      cache: 'no-store'
    });

    console.log('[Yena Background] Jobs response status:', response.status);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Unauthorized', shouldAuth: true };
      }
      const errorText = await response.text();
      console.error('[Yena Background] Jobs error response:', errorText);
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Yena Background] Jobs data:', data);
    return { success: true, data };
  } catch (error: any) {
    console.error('[Yena Background] Fetch Jobs Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available stages from the backend.
 * Accepts optional jobId to fetch job-specific stages.
 */
async function fetchStages(jobId?: string): Promise<ApiResponse> {
  try {
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const endpointUrl = new URL(`${env.apiBaseUrl}/extension-stages`);
    if (jobId) {
      endpointUrl.searchParams.set('jobId', jobId);
    }
    endpointUrl.searchParams.set('_ts', Date.now().toString());
    const endpoint = endpointUrl.toString();
    console.log('[Yena Background] Fetching stages from:', endpoint, jobId ? `(job: ${jobId})` : '(global)');

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers,
      cache: 'no-store'
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
    console.error('[Yena Background] Fetch Stages Error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetches available candidate lists from the backend.
 */
async function fetchLists(): Promise<ApiResponse> {
  try {
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    const endpoint = `${env.apiBaseUrl}/extension-lists?_ts=${Date.now()}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers,
      cache: 'no-store'
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
    console.error('[Yena Background] Fetch Lists Error:', error);
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
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    // Get the current user ID to include in the payload
    const importedByUserId = await getCurrentUserId();

    // Transform the profile data to match backend's expected structure
    const frontendProfile = body.profile || {};
    const validation = validateProfileBeforeSave(frontendProfile);
    if (!validation.valid) {
      return { success: false, message: validation.error };
    }

    const identityBundle = buildLinkedInIdentityBundle(
      frontendProfile.linkedinUrl || frontendProfile.sourceUrl || ''
    );

    const transformedPayload = {
      profile: {
        sourceUrl: identityBundle.normalizedUrl,
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
        recommendations: frontendProfile.recommendations || [],
        linkedinIdentifiers: {
          normalizedUrl: identityBundle.normalizedUrl,
          urls: identityBundle.urls,
          memberIds: identityBundle.memberIds
        },
        // Include the user ID who imported this profile
        ...(importedByUserId && { importedByUserId })
      },
      // Optional fields
      ...(body.jobId && { jobId: body.jobId }),
      ...(body.stageId && { stageId: body.stageId }),
      ...(body.listId && { listId: body.listId })
    };

    console.log('[Yena Background] Transformed payload:', transformedPayload);

    const response = await fetch(`${env.apiBaseUrl}/linkedin-import`, {
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
      console.error('[Yena Background] Save failed:', response.status, errorData);
      throw new Error(`Failed to save (Status ${response.status}): ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('[Yena Background] Save success:', data);
    return { success: true, data };

  } catch (error: any) {
    console.error('[Yena Background] Save Exception:', error);
    return { success: false, message: error.message || 'Network error occurred.' };
  }
}

/**
 * Syncs LinkedIn messages to Yena via the linkedin-messages-sync Edge Function.
 * Follows the same auth/error pattern as handleSaveCandidate.
 */
async function handleSyncMessages(payload: SyncMessagesPayload): Promise<ApiResponse> {
  try {
    const env = await getActiveEnv();
    const headers = await getHeaders();
    if (!headers['x-api-key']) {
      return { success: false, message: 'Missing API Key', shouldAuth: true };
    }

    console.log('[Yena Background] Syncing messages:', {
      messageCount: payload.messages.length,
      participant: payload.participantName,
      conversationId: payload.conversationId,
    });

    const endpoint = `${env.apiBaseUrl}/linkedin-messages-sync`;
    console.log('[Yena Background] POST to:', endpoint);

    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Invalid API Key', shouldAuth: true };
      }
      if (response.status === 404) {
        console.error('[Yena Background] Edge Function not found (404). Has it been deployed?');
        return { success: false, message: 'Message sync service not deployed. Deploy the linkedin-messages-sync Edge Function.' };
      }
      const errorData = await response.json().catch(() => ({}));
      console.error('[Yena Background] Message sync failed:', response.status, errorData);
      throw new Error(`Sync failed (Status ${response.status}): ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('[Yena Background] Message sync success:', data);
    return { success: true, data };

  } catch (error: any) {
    console.error('[Yena Background] Message sync exception:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return { success: false, message: 'Cannot reach sync service. Check if the Edge Function is deployed.' };
    }
    return { success: false, message: error.message || 'Network error occurred.' };
  }
}
