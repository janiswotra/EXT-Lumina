import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseProfile, parseProfileWithRetry, waitForProfileToLoad } from './utils/parser';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';
import { Toast } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

type ViewMode = 'hidden' | 'preview' | 'full';

/**
 * Helper to check if the extension context is still valid.
 * Returns false if the extension was reloaded/updated while this script was running.
 */
const isExtensionContextValid = (): boolean => {
  try {
    // This will throw if the extension context is invalidated
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Safely send a message to the background script.
 * Returns null if the extension context is invalid.
 */
const safeSendMessage = (message: any): Promise<any> => {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(null);
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response: any) => {
        if (chrome.runtime.lastError) {
          // Handle the error silently - context may have been invalidated
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (e) {
      resolve(null);
    }
  });
};

/**
 * Normalize LinkedIn URL for consistent matching.
 * Removes query params, hash, trailing slash, and standardizes format.
 */
const normalizeLinkedInUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    // Remove query params and hash
    let path = parsed.pathname;
    // Remove trailing slash
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${parsed.origin}${path}`;
  } catch {
    return url;
  }
};

export const LinkedInInjector: React.FC = () => {
  // Start hidden (show floating button only)
  const [viewMode, setViewMode] = useState<ViewMode>('hidden');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // State to track if we've already attempted scraping for the current URL
  const [hasScrapedCurrentUrl, setHasScrapedCurrentUrl] = useState(false);

  // NEW: Track data fetching state for better UX
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Track current URL to detect changes
  const currentUrlRef = useRef(window.location.href);

  // Track the URL for which we're awaiting a status check (race condition fix)
  const pendingStatusCheckUrlRef = useRef<string | null>(null);

  // Global Auth State
  const [authStatus, setAuthStatus] = useState<'CHECKING' | 'AUTHENTICATED' | 'MISSING_KEY'>('CHECKING');

  // Mock existence check
  const [isExisting, setIsExisting] = useState(false);

  const [profileData, setProfileData] = useState<any>({
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
    linkedinUrl: window.location.href,
  });

  // Function to reset all profile state for new URL
  const resetProfileState = useCallback(() => {
    setHasScrapedCurrentUrl(false);
    setIsExisting(false);
    setIsFetchingData(false);
    // Invalidate any pending status check by clearing the ref
    pendingStatusCheckUrlRef.current = null;
    setProfileData({
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
      linkedinUrl: window.location.href,
    });
  }, []);

  // Check Auth on Mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      setAuthStatus('MISSING_KEY');
      return;
    }

    // Set a timeout to fallback to MISSING_KEY if no response
    const timeout = setTimeout(() => {
      setAuthStatus('MISSING_KEY');
    }, 5000);

    try {
      const response = await safeSendMessage({ type: 'CHECK_AUTH' });
      clearTimeout(timeout);

      if (response && response.success) {
        setAuthStatus('AUTHENTICATED');
      } else {
        setAuthStatus('MISSING_KEY');
      }
    } catch (e) {
      clearTimeout(timeout);
      setAuthStatus('MISSING_KEY');
    }
  };

  // Listen for background requests (e.g. Check for Updates)
  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      if (message.type === 'TRIGGER_SCRAPE') {

        // Background scrape - use scrolling for full data capture
        // Since this opens in a separate window, scrolling is acceptable
        waitForProfileToLoad(5000).then((isReady) => {
          if (!isReady) {
          }
          // Enable scrolling (true) for background scrapes to capture all experience items
          parseProfileWithRetry(3, 250, true).then((data: any) => {
            chrome.runtime.sendMessage({
              type: 'PROFILE_DATA_EXTRACTED',
              data: data
            });
          });
        });
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  // URL Change Detection & Initial Load - IMPROVED
  useEffect(() => {
    let isMounted = true;
    let pollTimer: number | null = null;
    let hasInitiallyLoaded = false; // Prevent duplicate initial loads

    // Helper to check if profile data meaningfully changed
    const hasDataChanged = (newData: any, prevData: any): boolean => {
      // Only update if core fields changed
      const coreFields = ['firstName', 'lastName', 'headline', 'location', 'currentCompany'];
      for (const field of coreFields) {
        if (newData[field] && newData[field] !== prevData[field]) {
          return true;
        }
      }
      // Check arrays length changes
      if (newData.experiences?.length !== prevData.experiences?.length) return true;
      if (newData.educations?.length !== prevData.educations?.length) return true;
      if (newData.skills?.length !== prevData.skills?.length) return true;
      return false;
    };

    // Main function to load profile data - OPTIMIZED for instant response
    const loadProfileData = async () => {
      // Skip if extension context is invalid (extension was reloaded)
      if (!isExtensionContextValid()) {
        return;
      }

      // Skip if not a profile page
      if (!isValidProfilePage()) {
        return;
      }

      setIsFetchingData(true);

      try {
        // STEP 1: Parse profile IMMEDIATELY - no waiting (Attio-style instant response)
        // DOM is ready by the time user clicks, no need to wait
        const data = parseProfile();
        if (!isMounted) return;

        // STEP 2: Update UI immediately with parsed data
        setProfileData((prev: any) => ({
          ...data,
          email: data.email || (prev.linkedinUrl === window.location.href ? prev.email : '') || '',
          phone: data.phone || (prev.linkedinUrl === window.location.href ? prev.phone : '') || '',
          linkedinUrl: window.location.href
        }));

        // STEP 3: Check if candidate exists in Yena (BACKGROUND - doesn't block display)
        if (data.firstName && data.lastName && data.firstName !== 'Unknown') {
          const normalizedUrl = normalizeLinkedInUrl(window.location.href);
          pendingStatusCheckUrlRef.current = normalizedUrl;

          // Fire and forget - doesn't block UI
          safeSendMessage({
            type: 'CHECK_CANDIDATE_STATUS',
            payload: { sourceUrl: normalizedUrl }
          }).then((res: ApiResponse) => {
            const currentNormalizedUrl = normalizeLinkedInUrl(window.location.href);
            const isResponseForCurrentProfile = pendingStatusCheckUrlRef.current === normalizedUrl &&
                                                 currentNormalizedUrl === normalizedUrl;

            if (isMounted && isResponseForCurrentProfile && res && res.success && res.data) {
              setIsExisting(!!res.data.exists);
            }
          }).catch(() => {
            // Silent fail - existence check is optional
            if (isMounted && pendingStatusCheckUrlRef.current === normalizedUrl) {
              setIsExisting(false);
            }
          });
        }

        hasInitiallyLoaded = true;

      } catch (e) {
        // Silent error handling - don't spam console
      } finally {
        if (isMounted) {
          setIsFetchingData(false);
        }
      }
    };

    // Initial load (only once)
    if (!hasInitiallyLoaded) {
      loadProfileData();
    }

    // Polling function - ONLY for URL changes, NOT for constant data updates
    const pollForChanges = () => {
      if (!isMounted) return;

      // Stop polling if extension context is invalid
      if (!isExtensionContextValid()) {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        return;
      }

      // Check URL change ONLY
      if (window.location.href !== currentUrlRef.current) {
        currentUrlRef.current = window.location.href;
        hasInitiallyLoaded = false;

        // Reset state for new profile
        resetProfileState();
        setViewMode('hidden');

        // Load new profile data
        loadProfileData();
        return; // Don't do lazy-load polling on URL change
      }

      // Lazy-load content polling ONLY in full mode AND only if data changed
      if (viewMode === 'full' && hasInitiallyLoaded) {
        try {
          const data = parseProfile();
          setProfileData((prev: any) => {
            // Only update if data actually changed to prevent re-renders
            if (!hasDataChanged(data, prev)) {
              return prev; // Return same reference = no re-render
            }
            return {
              ...prev,
              ...data,
              // Preserve contact info
              email: prev.email || data.email || '',
              phone: prev.phone || data.phone || '',
              linkedinUrl: window.location.href
            };
          });
        } catch (err) {
          // Ignore - lazy load polling errors are expected
        }
      }
    };

    // Poll every 3 seconds (slower to reduce flashing)
    pollTimer = window.setInterval(pollForChanges, 3000);

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [viewMode, hasScrapedCurrentUrl, resetProfileState]);

  const handleAddCandidate = () => {
    // Switch to full mode -> this triggers specific scraping poller logic via useEffect
    setLoading(true);
    // Simulate "Adding..." delay and transition
    setTimeout(() => {
      setViewMode('full');
      setLoading(false);
    }, 500);
  };

  // Check if current URL is a valid profile page
  const isValidProfilePage = () => {
    const url = window.location.href;
    return url.includes('/in/') || url.includes('/sales/lead/') || url.includes('/talent/profile/');
  };

  const toggleView = () => {
    if (viewMode === 'hidden') {
      if (!isValidProfilePage()) {
        setToast({ msg: 'Visit a Candidate Profile to get started', type: 'error' });
        return;
      }
      // Open into Preview mode (or Full if existing)
      setViewMode(isExisting ? 'full' : 'preview');
    } else {
      setViewMode('hidden');
    }
  };

  const handleSave = async (jobId?: string, stageId?: string, listId?: string) => {
    setLoading(true);
    setToast(null);

    try {
      if (!profileData.lastName && !profileData.firstName) {
        throw new Error("First Name or Last Name is required.");
      }

      // Build the payload with optional job, stage, and list
      const payload = {
        profile: profileData,
        ...(jobId && { jobId }),
        ...(stageId && { stageId }),
        ...(listId && { listId })
      };


      const response = await safeSendMessage({ type: 'SAVE_CANDIDATE', payload });

      if (!response) {
        throw new Error('Failed to communicate with extension. Please refresh the page.');
      }


      if (response && response.success) {
        setToast({ msg: 'Candidate saved to Yena!', type: 'success' });
        setTimeout(() => setViewMode('hidden'), 1500);
      } else {
        setToast({ msg: response?.message || 'Failed to save.', type: 'error' });
      }

    } catch (e: any) {
      console.error('[Lumina] Save Exception:', e);
      setToast({ msg: e.message || 'Error occurred.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button Trigger */}
      {viewMode === 'hidden' && (
        <button
          onClick={toggleView}
          className="fixed right-0 top-1/2 transform -translate-y-1/2 z-[2147483647] bg-indigo-600 text-white p-3 rounded-l-2xl shadow-2xl flex items-center gap-2 hover:bg-indigo-700 transition-colors cursor-pointer border-2 border-white pointer-events-auto"
          title="Add to Yena"
        >
          <img
            src={chrome.runtime.getURL('icons/icon-32.png')}
            alt="Yena"
            className="w-5 h-5 object-contain"
          />
          <span className="font-bold whitespace-nowrap">
            Yena
          </span>
        </button>
      )}

      {/* Render Auth Screen if visible and NOT authenticated */}
      {viewMode !== 'hidden' && authStatus !== 'AUTHENTICATED' && (
        <AuthScreen
          onSuccess={() => setAuthStatus('AUTHENTICATED')}
          onClose={() => setViewMode('hidden')}
          isChecking={authStatus === 'CHECKING'}
        />
      )}

      {/* Render Main Content ONLY if authenticated */}
      {viewMode !== 'hidden' && authStatus === 'AUTHENTICATED' && (
        <>
          {/* Preview Card */}
          {viewMode === 'preview' && (
            <>
              <Preview
                data={profileData}
                onAdd={handleAddCandidate}
                isLoading={loading}
                isExisting={isExisting}
                isFetching={isFetchingData}
              />
              <button
                onClick={() => setViewMode('hidden')}
                className="fixed right-5 top-[350px] text-xs text-gray-400 hover:text-white underline z-[2147483647] pointer-events-auto bg-black/50 px-2 py-1 rounded"
              >
                Close Preview
              </button>
            </>
          )}

          {/* Full Sidebar */}
          <Sidebar
            isOpen={viewMode === 'full'}
            onClose={() => setViewMode('hidden')}
            data={profileData}
            onUpdate={setProfileData}
            onSave={handleSave}
            isLoading={loading}
            isExisting={isExisting}
          />
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[1000000]">
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </>
  );
};
