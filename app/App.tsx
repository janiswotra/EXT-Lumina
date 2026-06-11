import React, { useState, useEffect } from 'react';
import { ACTIVE_ENV_KEY, ENVIRONMENTS, getEnvById } from './constants';

const App: React.FC = () => {
  const [envLabel, setEnvLabel] = useState('');
  const [appDomain, setAppDomain] = useState(ENVIRONMENTS[0].domain);

  useEffect(() => {
    chrome.storage.local.get(ACTIVE_ENV_KEY, (result: Record<string, unknown>) => {
      const envId = (result[ACTIVE_ENV_KEY] as string) || ENVIRONMENTS[0].id;
      const env = getEnvById(envId) || ENVIRONMENTS[0];
      setEnvLabel(env.label);
      setAppDomain(env.domain);
    });
  }, []);

  const openDashboard = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: appDomain });
    } else {
      window.open(appDomain, '_blank');
    }
  };

  return (
    <div className="w-[320px] bg-gray-50 min-h-[400px] flex flex-col font-sans text-gray-900">
      {/* Header */}
      <header className="bg-[#4E76D9] text-white p-5 rounded-b-3xl shadow-md">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>✦</span> Yena
          </h1>
          {envLabel && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white/90">
              {envLabel}
            </span>
          )}
        </div>
        <p className="text-[#DCE7FF] text-base mt-1">Candidate Clipper</p>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 flex flex-col gap-4">
        {/* Info Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#E8EFFF] text-[#5F86E5] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Manual Save</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Look for the <span className="font-bold text-[#4E76D9]">✦ Yena</span> button on LinkedIn and Sales Navigator profiles to save candidates directly.
              </p>
            </div>
          </div>
        </div>

        {/* Open Dashboard Button */}
        <button
          onClick={openDashboard}
          className="w-full py-2.5 px-4 bg-[#5F86E5] hover:bg-[#4E76D9] text-white rounded-lg font-medium text-base transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Yena Dashboard
        </button>
      </main>

      <footer className="p-3 text-center text-sm text-gray-400 border-t border-gray-200">
        Yena v{typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : ''}
      </footer>
    </div>
  );
};

export default App;
