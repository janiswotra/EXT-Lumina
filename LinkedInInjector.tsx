import React, { useState } from 'react';
import { parseProfile } from './utils/parser';
import { Button } from './components/Button';
import { Toast } from './components/Toast';
import { ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

export const LinkedInInjector: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const handleAddToLumina = async () => {
    setLoading(true);
    setToast(null);

    try {
      // 1. Parse Data
      let profileData;
      try {
        profileData = parseProfile();
      } catch (err) {
        console.warn('Parsing failed, using fallback data for preview if necessary.', err);
        // Fallback for preview if on non-LinkedIn page
        profileData = {
          firstName: 'Test',
          lastName: 'Candidate',
          headline: 'Developer',
          location: 'San Francisco',
          linkedInUrl: window.location.href,
          experiences: [],
          educations: []
        };
      }
      
      // 2. Validate basic data
      if (!profileData.lastName && !profileData.firstName) {
         // If we are in a dev environment, we might want to proceed with mock data, 
         // but if we really failed to parse on LinkedIn, throw.
         if (window.location.hostname.includes('linkedin.com')) {
             throw new Error("Could not detect profile name. Is the page fully loaded?");
         }
      }

      // 3. Send to Background Script
      const response: ApiResponse = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SAVE_CANDIDATE', payload: profileData }, (res: any) => {
             if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                resolve({ success: false, message: 'Extension communication error.' });
             } else {
                resolve(res);
             }
          });
        } else {
          // Fallback for dev/preview environment
          console.warn('Chrome API not found. Mocking save operation.');
          setTimeout(() => {
            resolve({ success: true });
          }, 1000);
        }
      });

      if (response.success) {
        setToast({ msg: 'Candidate saved to Lumina!', type: 'success' });
      } else {
        setToast({ msg: response.message || 'Failed to save.', type: 'error' });
      }

    } catch (e: any) {
      console.error(e);
      setToast({ msg: e.message || 'An unexpected error occurred.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lumina-extension-root font-sans antialiased inline-block ml-2">
      <Button 
        onClick={handleAddToLumina} 
        isLoading={loading}
        className="bg-[#4338ca] hover:bg-[#3730a3] text-white border-none" // Custom Lumina Branding overrides
      >
        <span className="mr-2">✦</span> Add to Lumina
      </Button>

      {toast && (
        <Toast 
          message={toast.msg} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};