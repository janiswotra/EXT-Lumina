import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseProfile, parseProfileWithRetry, waitForProfileToLoad } from './utils/parser';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';
import { Toast } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { ApiResponse, ParseConfidence } from './types';

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
 * Removes query params/hash and canonicalizes profile-like paths so
 * /in/{slug}/recent-activity/* resolves to /in/{slug}.
 */
const normalizeLinkedInUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    let canonicalPath = parsed.pathname;

    if (segments[0] === 'in' && segments[1]) {
      canonicalPath = `/in/${segments[1]}`;
    } else if (segments[0] === 'sales' && (segments[1] === 'lead' || segments[1] === 'people') && segments[2]) {
      const token = (segments[2] || '').split(',')[0];
      canonicalPath = `/sales/${segments[1]}/${token}`;
    } else if (segments[0] === 'talent' && segments[1] === 'profile' && segments[2]) {
      canonicalPath = `/talent/profile/${segments[2]}`;
    }

    if (canonicalPath.endsWith('/')) canonicalPath = canonicalPath.slice(0, -1);
    return `https://www.linkedin.com${canonicalPath}`;
  } catch {
    return url;
  }
};

const extractLinkedInMemberId = (url: string): string | null => {
  const normalized = normalizeLinkedInUrl(url || '');

  const profileMatch = normalized.match(/\/in\/(A[A-Z][a-zA-Z0-9_-]{20,})/);
  if (profileMatch) return profileMatch[1];

  const salesMatch = normalized.match(/\/sales\/(?:lead|people)\/([^/?#]+)/);
  if (!salesMatch) return null;

  const token = (salesMatch[1] || '').split(',')[0];
  if (/^A[A-Z][a-zA-Z0-9_-]{20,}$/.test(token)) return token;
  return null;
};

const isProfileUrl = (url: string): boolean => {
  return url.includes('/in/') || url.includes('/sales/lead/') || url.includes('/sales/people/') || url.includes('/talent/profile/');
};

const hasMeaningfulProfileSignals = (profile: any): boolean => {
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
};

const canSaveProfile = (profile: any): { ok: boolean; reason?: string } => {
  const firstName = (profile?.firstName || '').trim();
  const lastName = (profile?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
  const linkedinUrl = (profile?.linkedinUrl || '').trim();

  if (!firstName && !lastName) {
    return { ok: false, reason: 'First Name or Last Name is required.' };
  }

  if (!isProfileUrl(linkedinUrl)) {
    return { ok: false, reason: 'This page is not recognized as a LinkedIn profile URL.' };
  }

  if (!firstName || fullName === 'unknown') {
    return { ok: false, reason: 'Profile parse looks incomplete. Please wait 2-3 seconds and try again.' };
  }

  if (!hasMeaningfulProfileSignals(profile)) {
    return { ok: false, reason: 'Profile data quality is too low to save safely. Scroll the profile and retry.' };
  }

  return { ok: true };
};

const isLowConfidenceTopField = (value: string): boolean => {
  const text = (value || '').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  const blocked = [
    'comment',
    'connection',
    'follower',
    'mutual',
    'contact info',
    'save in sales navigator',
    'pending',
    'show more',
    'show less',
    'see all'
  ];
  if (blocked.some(token => lower.includes(token))) return true;
  if (/^\d+\s*(comments?|connections?|followers?)$/i.test(text)) return true;
  return false;
};

const sanitizeProfileTopFields = (data: any): any => {
  const sanitized = { ...data };
  if (isLowConfidenceTopField(sanitized.currentCompany || '')) sanitized.currentCompany = '';
  if (isLowConfidenceTopField(sanitized.location || '')) sanitized.location = '';
  if (isLowConfidenceTopField(sanitized.headline || '')) sanitized.headline = '';
  return sanitized;
};

const defaultParseConfidence = (): ParseConfidence => ({
  overall: 'low',
  headline: 'low',
  location: 'low',
  currentCompany: 'low',
  jobTitle: 'low',
  lowFields: ['headline', 'location', 'currentCompany', 'jobTitle']
});

const looksLikeRoleLine = (text: string): boolean => {
  if (!text) return false;
  return /(analyst|associate|manager|director|consultant|partner|officer|president|intern|founder|head|lead|specialist|engineer|developer|advisor|vice president|vp)/i.test(text);
};

const looksLikeCompanyLine = (text: string): boolean => {
  if (!text) return false;
  return /(\binc\.?\b|\bltd\.?\b|\bllc\b|\bgmbh\b|\bag\b|\bgroup\b|\bpartners?\b|\bcapital\b|\bbank\b|\bconsultants?\b|\badvisors?\b|\bholdings?\b)/i.test(text);
};

const parseHeadlineRole = (headline: string): string => {
  const clean = (headline || '').trim();
  const atIndex = clean.toLowerCase().indexOf(' at ');
  if (atIndex > 0) return clean.slice(0, atIndex).trim();
  return '';
};

const deriveParseConfidence = (profile: any): ParseConfidence => {
  const headline = (profile?.headline || '').trim();
  const location = (profile?.location || '').trim();
  const company = (profile?.currentCompany || '').trim();
  const firstExpTitle = (profile?.experiences?.[0]?.title || '').trim();
  const headlineRole = parseHeadlineRole(headline);

  const headlineConfidence: ParseConfidence['headline'] =
    !headline || isLowConfidenceTopField(headline) ? 'low'
      : (headline.length > 18 ? 'high' : 'medium');

  const locationConfidence: ParseConfidence['location'] =
    !location || isLowConfidenceTopField(location) ? 'low'
      : ((/,/.test(location) || /metropolitan area/i.test(location)) ? 'high' : 'medium');

  const companyConfidence: ParseConfidence['currentCompany'] =
    !company || isLowConfidenceTopField(company) ? 'low'
      : (looksLikeCompanyLine(company) ? 'high' : 'medium');

  let jobTitleConfidence: ParseConfidence['jobTitle'] = 'low';
  if (firstExpTitle && !isLowConfidenceTopField(firstExpTitle)) {
    if (company && firstExpTitle.toLowerCase() === company.toLowerCase()) {
      jobTitleConfidence = headlineRole && looksLikeRoleLine(headlineRole) ? 'medium' : 'low';
    } else if (looksLikeRoleLine(firstExpTitle)) {
      jobTitleConfidence = 'high';
    } else {
      jobTitleConfidence = 'medium';
    }
  } else if (headlineRole) {
    jobTitleConfidence = looksLikeRoleLine(headlineRole) ? 'high' : 'medium';
  }

  const lowFields: ParseConfidence['lowFields'] = [];
  if (headlineConfidence === 'low') lowFields.push('headline');
  if (locationConfidence === 'low') lowFields.push('location');
  if (companyConfidence === 'low') lowFields.push('currentCompany');
  if (jobTitleConfidence === 'low') lowFields.push('jobTitle');

  const overall: ParseConfidence['overall'] =
    lowFields.length > 0 ? 'low'
      : ([headlineConfidence, locationConfidence, companyConfidence, jobTitleConfidence].includes('medium') ? 'medium' : 'high');

  return {
    overall,
    headline: headlineConfidence,
    location: locationConfidence,
    currentCompany: companyConfidence,
    jobTitle: jobTitleConfidence,
    lowFields
  };
};

const mergeProfileReliably = (prev: any, next: any, mode: 'prefetch' | 'deep'): any => {
  const sanitizedNext = sanitizeProfileTopFields(next || {});
  const pickText = (incoming: string, existing: string) => {
    const cleanIncoming = (incoming || '').trim();
    if (!cleanIncoming) return existing || '';
    if (isLowConfidenceTopField(cleanIncoming)) return existing || '';
    return cleanIncoming;
  };

  const result = {
    ...prev,
    ...sanitizedNext,
    firstName: sanitizedNext.firstName || prev.firstName || '',
    lastName: sanitizedNext.lastName || prev.lastName || '',
    headline: pickText(sanitizedNext.headline, prev.headline),
    location: pickText(sanitizedNext.location, prev.location),
    currentCompany: pickText(sanitizedNext.currentCompany, prev.currentCompany),
    about: mode === 'deep'
      ? ((sanitizedNext.about || '').trim() || prev.about || '')
      : (prev.about || (sanitizedNext.about || '').trim() || ''),
    experiences: Array.isArray(sanitizedNext.experiences) && sanitizedNext.experiences.length > 0
      ? sanitizedNext.experiences
      : (prev.experiences || []),
    educations: Array.isArray(sanitizedNext.educations) && sanitizedNext.educations.length > 0
      ? sanitizedNext.educations
      : (prev.educations || []),
    skills: Array.isArray(sanitizedNext.skills) && sanitizedNext.skills.length > 0
      ? sanitizedNext.skills
      : (prev.skills || [])
  };

  if (!result.currentCompany && result.experiences?.length > 0) {
    const firstExpCompany = (result.experiences[0]?.company || '').trim();
    if (!isLowConfidenceTopField(firstExpCompany)) {
      result.currentCompany = firstExpCompany;
    }
  }

  result.parseConfidence = deriveParseConfidence(result);

  return result;
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
  const [, setIsHydratingDeepData] = useState(false);

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
    parseConfidence: defaultParseConfidence(),
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
      parseConfidence: defaultParseConfidence(),
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
        // Wait for profile anchors to reduce partial parses on LinkedIn SPA transitions
        const isReady = await waitForProfileToLoad(5000);
        const data = isReady
          ? await parseProfileWithRetry(3, 250, false)
          : await parseProfileWithRetry(1, 100, false);
        if (!isMounted) return;

        const prefetchData = sanitizeProfileTopFields(data);
        // STEP 2: Update UI immediately with parsed data
        setProfileData((prev: any) => ({
          ...mergeProfileReliably(prev, prefetchData, 'prefetch'),
          email: prefetchData.email || (prev.linkedinUrl === window.location.href ? prev.email : '') || '',
          phone: prefetchData.phone || (prev.linkedinUrl === window.location.href ? prev.phone : '') || '',
          linkedinUrl: window.location.href
        }));

        // STEP 3: Check if candidate exists in Yena (BACKGROUND - doesn't block display)
        if (data.firstName && data.lastName && data.firstName !== 'Unknown') {
          const currentUrl = window.location.href;
          const normalizedUrl = normalizeLinkedInUrl(currentUrl);
          const memberId = extractLinkedInMemberId(currentUrl);
          const sourceUrls = Array.from(
            new Set(
              [currentUrl, normalizedUrl, memberId ? `https://www.linkedin.com/in/${memberId}` : '']
                .filter(Boolean)
                .map((item) => normalizeLinkedInUrl(item))
            )
          );

          pendingStatusCheckUrlRef.current = normalizedUrl;

          // Fire and forget - doesn't block UI
          safeSendMessage({
            type: 'CHECK_CANDIDATE_STATUS',
            payload: {
              sourceUrl: currentUrl,
              sourceUrls,
              memberIds: memberId ? [memberId] : [],
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              currentCompany: data.currentCompany || ''
            }
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
              ...mergeProfileReliably(prev, data, 'prefetch'),
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

  // Deep hydration after user opens full sidebar:
  // prefer accuracy over speed and update only with reliable values.
  useEffect(() => {
    if (viewMode !== 'full') return;
    let cancelled = false;

    const hydrateDeep = async () => {
      setIsHydratingDeepData(true);
      try {
        const isReady = await waitForProfileToLoad(6000);
        const deepData = isReady
          ? await parseProfileWithRetry(4, 300, false)
          : await parseProfileWithRetry(2, 150, false);
        if (cancelled) return;

        setProfileData((prev: any) => ({
          ...mergeProfileReliably(prev, deepData, 'deep'),
          email: prev.email || deepData.email || '',
          phone: prev.phone || deepData.phone || '',
          linkedinUrl: window.location.href
        }));
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsHydratingDeepData(false);
      }
    };

    hydrateDeep();
    return () => {
      cancelled = true;
    };
  }, [viewMode]);

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
    return url.includes('/in/') || url.includes('/sales/lead/') || url.includes('/sales/people/') || url.includes('/talent/profile/');
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

  const handleSave = async (jobId?: string, stageId?: string, listId?: string): Promise<boolean> => {
    setLoading(true);
    setToast(null);

    try {
      const validation = canSaveProfile(profileData);
      if (!validation.ok) {
        throw new Error(validation.reason || 'Profile validation failed.');
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
        return true;
      } else {
        setToast({ msg: response?.message || 'Failed to save.', type: 'error' });
        return false;
      }

    } catch (e: any) {
      console.error('[Lumina] Save Exception:', e);
      setToast({ msg: e.message || 'Error occurred.', type: 'error' });
      return false;
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
          className="fixed right-0 top-1/2 transform -translate-y-1/2 z-[2147483647] bg-[#5F86E5] text-white p-3 rounded-l-2xl shadow-2xl flex items-center gap-2 hover:bg-[#4E76D9] transition-colors cursor-pointer border-2 border-white pointer-events-auto"
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
