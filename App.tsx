import React, { useEffect, useState } from 'react';
import { Button } from './components/Button';
import { APP_DOMAIN } from './constants';
import { ApiResponse } from './types';

// Fix: Declare chrome variable to resolve TS error
declare const chrome: any;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if chrome runtime is available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Check auth status via background script
      chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: ApiResponse) => {
        if (chrome.runtime.lastError) {
          console.warn('Background script not ready:', chrome.runtime.lastError);
          setIsAuthenticated(false);
          return;
        }
        setIsAuthenticated(response?.success ?? false);
      });
    } else {
      // Fallback for non-extension environments (e.g. dev server)
      console.warn('Chrome API not detected. Mocking authentication status.');
      setIsAuthenticated(true);
    }
  }, []);

  const openDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: APP_DOMAIN });
    } else {
      window.open(APP_DOMAIN, '_blank');
    }
  };

  return (
    <div className="w-[320px] bg-gray-50 min-h-[400px] flex flex-col font-sans text-gray-900">
      {/* Header */}
      <header className="bg-indigo-700 text-white p-6 rounded-b-3xl shadow-md">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span>✦</span> Lumina
        </h1>
        <p className="text-indigo-200 text-sm mt-1">Candidate Clipper</p>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        
        {isAuthenticated === null ? (
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-4 w-32 bg-gray-300 rounded mb-4"></div>
            <div className="h-8 w-8 bg-gray-300 rounded-full"></div>
          </div>
        ) : isAuthenticated ? (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">Ready to Clip</h2>
            <p className="text-sm text-gray-600">
              Navigate to a LinkedIn profile to see the "Add to Lumina" button.
            </p>
            <div className="pt-4">
              <Button onClick={openDashboard} variant="secondary">
                Go to Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-gray-200 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">Not Logged In</h2>
            <p className="text-sm text-gray-600">
              Please log in to Lumina to enable the extension.
            </p>
            <div className="pt-4">
              <Button onClick={openDashboard}>
                Log In
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="p-4 text-center text-xs text-gray-400 border-t border-gray-200">
        Lumina v1.0.0
      </footer>
    </div>
  );
};

export default App;