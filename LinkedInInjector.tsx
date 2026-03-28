import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseProfile, parseProfileWithRetry, waitForProfileToLoad } from './utils/parsers';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';
import { Toast } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { ApiResponse, ParseConfidence } from './types';
import { isExtensionContextValid, safeSendMessage } from './utils/chrome';
import { normalizeLinkedInUrl, extractLinkedInMemberId, isProfileUrl } from './utils/linkedin';
import { hasMeaningfulProfileSignals } from './utils/validation';
import { ENVIRONMENTS, STORAGE_KEYS } from './constants';

type ViewMode = 'hidden' | 'preview' | 'full';

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
      : (prev.skills || []),
    languages: Array.isArray(sanitizedNext.languages) && sanitizedNext.languages.length > 0
      ? sanitizedNext.languages
      : (prev.languages || []),
    certifications: Array.isArray(sanitizedNext.certifications) && sanitizedNext.certifications.length > 0
      ? sanitizedNext.certifications
      : (prev.certifications || []),
    courses: Array.isArray(sanitizedNext.courses) && sanitizedNext.courses.length > 0
      ? sanitizedNext.courses
      : (prev.courses || []),
    organizations: Array.isArray(sanitizedNext.organizations) && sanitizedNext.organizations.length > 0
      ? sanitizedNext.organizations
      : (prev.organizations || []),
    recommendations: Array.isArray(sanitizedNext.recommendations) && sanitizedNext.recommendations.length > 0
      ? sanitizedNext.recommendations
      : (prev.recommendations || [])
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
  const viewModeRef = useRef<ViewMode>('hidden');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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
    parseConfidence: defaultParseConfidence(),
    linkedinUrl: window.location.href,
  });

  // Function to reset all profile state for new URL
  const resetProfileState = useCallback(() => {
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

  // Keep viewModeRef in sync
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

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
    let usedAIParsing = false; // Skip DOM polling when AI parsing succeeded

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

      const urlAtStart = window.location.href;
      setIsFetchingData(true);

      try {
        // Wait for profile anchors to reduce partial parses on LinkedIn SPA transitions
        const isReady = await waitForProfileToLoad(5000);
        // Guard: abort if URL changed during async wait
        if (!isMounted || window.location.href !== urlAtStart) return;
        const data = isReady
          ? await parseProfileWithRetry(3, 250, false)
          : await parseProfileWithRetry(1, 100, false);
        if (!isMounted || window.location.href !== urlAtStart) return;

        // Track if AI parsing was used — skip DOM polling if so
        if ((data as any)._parseMethod === 'ai') {
          usedAIParsing = true;
        }

        const prefetchData = sanitizeProfileTopFields(data);
        // STEP 2: Update UI immediately with parsed data
        setProfileData((prev: any) => ({
          ...mergeProfileReliably(prev, prefetchData, 'prefetch'),
          email: prefetchData.email || (prev.linkedinUrl === window.location.href ? prev.email : '') || '',
          phone: prefetchData.phone || (prev.linkedinUrl === window.location.href ? prev.phone : '') || '',
          linkedinUrl: window.location.href,
          _parseMethod: (data as any)._parseMethod || prev._parseMethod,
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
          }).catch((e) => {
            console.warn('[Yena]', e);
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
        usedAIParsing = false;

        // Reset state for new profile
        resetProfileState();
        setViewMode('hidden');

        // Load new profile data
        loadProfileData();
        return; // Don't do lazy-load polling on URL change
      }

      // Lazy-load content polling ONLY in full mode, only if DOM-parsed (not AI)
      if (viewModeRef.current === 'full' && hasInitiallyLoaded && !usedAIParsing) {
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
  }, [resetProfileState]);

  // Deep hydration after user opens full sidebar:
  // prefer accuracy over speed and update only with reliable values.
  // Skip if AI parsing already provided complete data.
  useEffect(() => {
    if (viewMode !== 'full') return;
    // AI parsing already scrolled, expanded, and parsed — no need to re-hydrate
    if ((profileData as any)._parseMethod === 'ai') return;
    let cancelled = false;
    const urlAtStart = window.location.href;

    const hydrateDeep = async () => {
      try {
        const isReady = await waitForProfileToLoad(6000);
        if (cancelled || window.location.href !== urlAtStart) return;
        const deepData = isReady
          ? await parseProfileWithRetry(4, 300, false)
          : await parseProfileWithRetry(2, 150, false);
        if (cancelled || window.location.href !== urlAtStart) return;

        setProfileData((prev: any) => ({
          ...mergeProfileReliably(prev, deepData, 'deep'),
          email: prev.email || deepData.email || '',
          phone: prev.phone || deepData.phone || '',
          linkedinUrl: window.location.href
        }));
      } catch {
        // ignore — deep hydration is best-effort
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
      console.error('[Yena] Save Exception:', e);
      setToast({ msg: e.message || 'Error occurred.', type: 'error' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Sticky Icon Trigger — offset from right edge */}
      {viewMode === 'hidden' && (
        <button
          onClick={toggleView}
          style={{
            position: 'fixed',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 2147483647,
            width: '38px',
            height: '38px',
            borderRadius: '11px',
            backgroundColor: '#ff6a26',
            boxShadow: '0 2px 12px rgba(255,106,38,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            pointerEvents: 'auto',
            border: 'none',
            padding: 0,
            outline: 'none',
            transition: 'box-shadow 0.2s, transform 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,106,38,0.5)';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,106,38,0.4)';
            e.currentTarget.style.transform = 'translateY(-50%)';
          }}
          title="Add to Yena"
        >
          <img
            src={chrome.runtime.getURL('icons/icon-32.png')}
            alt="Yena"
            style={{ width: '22px', height: '22px', objectFit: 'contain' }}
          />
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
                className="fixed right-5 top-[350px] text-sm text-[#687182] hover:text-[#181c25] underline z-[2147483647] pointer-events-auto bg-white/80 shadow-sm border border-[#dde1e8] px-2 py-1 rounded"
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
            onDisconnect={() => {
              // Clear API key for all envs and reset auth state
              const keysToRemove = ENVIRONMENTS.map(e => STORAGE_KEYS.apiKey(e.id));
              chrome.storage.local.remove(keysToRemove, () => {
                console.log('[Yena] API key cleared, returning to auth screen');
                setAuthStatus('MISSING_KEY');
              });
            }}
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
