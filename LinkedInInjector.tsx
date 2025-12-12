import React, { useState, useEffect } from 'react';
import { parseProfile } from './utils/parser';
import { Sidebar } from './components/Sidebar';
import { Preview } from './components/Preview';
import { Toast } from './components/Toast';
import { ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

type ViewMode = 'hidden' | 'preview' | 'full';

export const LinkedInInjector: React.FC = () => {
  // Start hidden (show floating button only)
  const [viewMode, setViewMode] = useState<ViewMode>('hidden');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Mock existence check
  const [isExisting, setIsExisting] = useState(false);

  const [profileData, setProfileData] = useState<any>({
    firstName: '',
    lastName: '',
    headline: '',
    location: '',
    currentCompany: '',
    linkedInUrl: window.location.href,
  });

  // URL Change Detection & Initial Load
  useEffect(() => {
    let lastUrl = window.location.href;

    // Initial parse on mount
    const checkState = async () => {
      try {
        const data = parseProfile();
        // Send message to background to check status API
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'CHECK_CANDIDATE_STATUS',
            payload: { sourceUrl: window.location.href }
          }, (res: ApiResponse) => {
            if (res && res.success && res.data) {
              // API returns { exists: boolean, ... }
              setIsExisting(!!res.data.exists);
            }
          });
        }

        setProfileData((prev: any) => ({ ...prev, ...data, linkedInUrl: window.location.href }));
      } catch (e) {
        console.error(e);
      }
    };

    checkState();

    const checkUrlAndData = () => {
      // 1. Check URL Change
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[Lumina] URL changed.');

        // On Nav, we reset to hidden (show button) logic
        // This ensures the button is the entry point
        setViewMode('hidden');

        checkState(); // Re-run parse/exists check
      }

      // 2. Poll ONLY if in FULL mode (lazy loading)
      if (viewMode === 'full') {
        try {
          // We continuously parse to catch lazy-loaded sections (Experience, Skills etc)
          // appearing in DOM after scroll.
          const data = parseProfile();
          setProfileData((prev: any) => ({ ...prev, ...data, linkedInUrl: window.location.href }));
        } catch (err) { }
      }
    };

    const timer = setInterval(checkUrlAndData, 2000);
    return () => clearInterval(timer);
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

  const toggleView = () => {
    if (viewMode === 'hidden') {
      // Open into Preview mode (or Full if existing)
      setViewMode(isExisting ? 'full' : 'preview');
    } else {
      setViewMode('hidden');
    }
  };

  const handleSave = async () => {
    console.log('[Lumina] handleSave called');
    setLoading(true);
    setToast(null);

    try {
      if (!profileData.lastName && !profileData.firstName) {
        throw new Error("First Name or Last Name is required.");
      }

      console.log('[Lumina] Sending SAVE_CANDIDATE message', profileData);

      const response: ApiResponse = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SAVE_CANDIDATE', payload: profileData }, (res: any) => {
            console.log('[Lumina] Background response:', res);
            if (chrome.runtime.lastError) {
              console.error('[Lumina] Runtime error:', chrome.runtime.lastError);
              resolve({ success: false, message: 'Extension communication error: ' + chrome.runtime.lastError.message });
            } else {
              resolve(res);
            }
          });
        } else {
          console.warn('[Lumina] Chrome runtime not found (dev mode?)');
          setTimeout(() => { resolve({ success: true }); }, 1000);
        }
      });

      console.log('[Lumina] Processed response:', response);

      if (response && response.success) {
        setToast({ msg: 'Candidate saved to Lumina!', type: 'success' });
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
      {/* Floating Action Button Trigger (Always visible if hidden, or maybe serves as toggle?) */}
      {viewMode === 'hidden' && (
        <button
          onClick={toggleView}
          className="fixed right-0 top-1/2 transform -translate-y-1/2 z-[2147483647] bg-indigo-600 text-white p-3 rounded-l-2xl shadow-2xl flex items-center gap-2 hover:bg-indigo-700 transition-colors cursor-pointer border-2 border-white pointer-events-auto"
          title="Add to Lumina"
        >
          <span className="font-bold text-xl">✦</span>
          <span className="font-bold whitespace-nowrap">
            Lumina
          </span>
        </button>
      )}

      {/* Preview Card */}
      {viewMode === 'preview' && (
        <>
          {/* Close Overlay to dismiss? Or just a close button on the preview? 
                For now, clicking outside isn't implemented, but let's assume the user can close via UI if we added one.
                Actually, the button is gone, so how to close 'preview'? 
                I should add a close functionality to Preview or keep the floating button? 
                User request didn't specify closing. I'll rely on reloading or clicking 'Add'.
                Actually let's add a close button to Preview component implicitly or just keep the logic simple.
            */}
          <Preview
            data={profileData}
            onAdd={handleAddCandidate}
            isLoading={loading}
            isExisting={isExisting}
          />
          {/* Add a close/cancel button for Preview mode specifically? 
                 Let's add a small overlay or just a 'Cancel' button in Preview if needed.
                 The Preview component I wrote doesn't have a close button. 
                 I'll wrap it in a div that allows closing or add a close button in next iteration if requested.
                 For now, let's assume they want to proceed.
             */}
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
      />

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
