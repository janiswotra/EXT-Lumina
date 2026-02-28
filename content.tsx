import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LinkedInInjector } from './LinkedInInjector';
import { parseProfileWithRetry, waitForProfileToLoad } from './utils/parsers';
import { DOM_IDS } from './constants';

// Handle TRIGGER_SCRAPE from background script (for "Check for Updates" feature)
// This must be at the top level, NOT inside React, to ensure it's ready immediately
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (message.type === 'TRIGGER_SCRAPE') {
    console.log('[Yena Content] Received TRIGGER_SCRAPE command');

    // Acknowledge receipt immediately
    sendResponse({ received: true });

    // Parse the profile and send it back to background
    waitForProfileToLoad(5000).then(() => {
      parseProfileWithRetry(3, 500).then((data) => {
        console.log('[Yena Content] Sending PROFILE_DATA_EXTRACTED:', data.firstName, data.lastName);
        chrome.runtime.sendMessage({
          type: 'PROFILE_DATA_EXTRACTED',
          data: data
        });
      }).catch((err) => {
        console.error('[Yena Content] Parse failed:', err);
        chrome.runtime.sendMessage({
          type: 'PROFILE_DATA_EXTRACTED',
          data: null,
          error: err.message
        });
      });
    });

    return false; // Response already sent synchronously
  }
});

// Track the React root to avoid duplicate mounts
let root: Root | null = null;
let injectionContainer: HTMLElement | null = null;
let isInjecting: boolean = false; // Guard flag to prevent race conditions

const MOUNT_ID = DOM_IDS.EXTENSION_MOUNT;

const injectUI = () => {
  // 1. Check if we are already injected OR currently injecting (race condition guard)
  if (document.getElementById(MOUNT_ID) || isInjecting) {
    return;
  }

  // 2. Set flag immediately to block any concurrent calls
  isInjecting = true;

  // 3. Inject into Body
  const targetElement = document.body;

  if (!targetElement) {
    // Reset flag if body doesn't exist yet
    isInjecting = false;
    return;
  }

  try {
    // Create host container
    injectionContainer = document.createElement('div');
    injectionContainer.id = MOUNT_ID;

    // Position the HOST container fixed on top of everything
    // But allow clicks to pass through unless they hit our elements
    Object.assign(injectionContainer.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%', // Use % instead of vw to avoid scrollbar triggering horizontal scroll
      height: '100%', // Use % or vh
      zIndex: '2147483647', // Max z-index
      pointerEvents: 'none',
    });

    targetElement.appendChild(injectionContainer);

    // 4. Create Shadow DOM
    const shadowRoot = injectionContainer.attachShadow({ mode: 'open' });

    // 5. Inject Styles inside Shadow DOM
    // We use the main generated CSS file (popup.css) which contains all Tailwind utilities
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('assets/popup.css');
    shadowRoot.appendChild(styleLink);

    // 6. Mount Point inside Shadow DOM
    const mountPoint = document.createElement('div');
    mountPoint.id = 'yena-root';
    // Reset pointer events for the app container
    // We want the sidebar/buttons to catch clicks
    Object.assign(mountPoint.style, {
      pointerEvents: 'none', // Allow clicks to pass through the empty parts
      height: '100%',
      width: '100%',
      fontFamily: 'Inter, system-ui, sans-serif' // Enforce font in shadow dom
    });
    shadowRoot.appendChild(mountPoint);

    // 7. Mount React
    root = createRoot(mountPoint);
    root.render(
      <React.StrictMode>
        <LinkedInInjector />
      </React.StrictMode>
    );

    // Reset flag after successful injection
    isInjecting = false;
    console.log('[Yena] UI Injected successfully into Shadow DOM.');
  } catch (error) {
    console.error('[Yena] Error during injection:', error);
    // Reset flag on error to allow retry
    isInjecting = false;
  }
};

// 3. Observer to handle SPA navigation and dynamic loading
const observer = new MutationObserver((mutations) => {
  // Check if we are already injected or currently injecting
  if (!document.getElementById(MOUNT_ID) && !isInjecting) {
    // Ensure body exists before injecting
    if (document.body) {
      injectUI();
    }
  }
});

// Only start observing if document.body exists
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Initial inject - try early, with fallback
// First attempt at 500ms for fast loading
setTimeout(injectUI, 500);
// Fallback at 1500ms in case DOM wasn't ready
setTimeout(injectUI, 1500);
