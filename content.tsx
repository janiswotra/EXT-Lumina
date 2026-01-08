import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LinkedInInjector } from './LinkedInInjector';
import { parseProfileWithRetry, waitForProfileToLoad, parseProfile } from './utils/parser';
// import { storeInHarvestQueue } from './harvest'; // DISABLED: Feature not synced with main app yet

// ============================================
// PASSIVE HARVESTING - DISABLED
// Feature disabled until synced with main app
// ============================================

// let lastHarvestedUrl = '';
// let harvestDebounceTimer: number | null = null;

// const isProfilePage = (): boolean => {
//   const url = window.location.href;
//   return /linkedin\.com\/in\/[^\/]+/.test(url);
// };

// const passiveHarvest = async () => {
//   const currentUrl = window.location.href;
//   if (currentUrl === lastHarvestedUrl) return;
//   if (!isProfilePage()) return;
//   console.log('[Lumina Harvest] Starting passive harvest for:', currentUrl);
//   try {
//     const isReady = await waitForProfileToLoad(3000);
//     if (!isReady) {
//       console.log('[Lumina Harvest] Page not ready, will retry on next navigation');
//       return;
//     }
//     const profileData = parseProfile();
//     if (profileData.firstName && profileData.firstName !== 'Unknown') {
//       await storeInHarvestQueue(profileData);
//       lastHarvestedUrl = currentUrl;
//       console.log('[Lumina Harvest] ✅ Harvested:', profileData.firstName, profileData.lastName);
//     } else {
//       console.log('[Lumina Harvest] Skipped - no valid data parsed');
//     }
//   } catch (error) {
//     console.error('[Lumina Harvest] Error:', error);
//   }
// };

// const triggerPassiveHarvest = () => {
//   if (harvestDebounceTimer) clearTimeout(harvestDebounceTimer);
//   harvestDebounceTimer = window.setTimeout(() => passiveHarvest(), 2000);
// };

// let lastUrl = window.location.href;
// const urlObserver = new MutationObserver(() => {
//   if (window.location.href !== lastUrl) {
//     lastUrl = window.location.href;
//     console.log('[Lumina Harvest] URL changed to:', lastUrl);
//     triggerPassiveHarvest();
//   }
// });

// if (document.body) {
//   urlObserver.observe(document.body, { childList: true, subtree: true });
// }

// triggerPassiveHarvest();

// Handle TRIGGER_SCRAPE from background script (for "Check for Updates" feature)
// This must be at the top level, NOT inside React, to ensure it's ready immediately
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (message.type === 'TRIGGER_SCRAPE') {
    console.log('[Lumina Content] Received TRIGGER_SCRAPE command');

    // Acknowledge receipt immediately
    sendResponse({ received: true });

    // Parse the profile and send it back to background
    waitForProfileToLoad(5000).then(() => {
      parseProfileWithRetry(3, 500).then((data) => {
        console.log('[Lumina Content] Sending PROFILE_DATA_EXTRACTED:', data.firstName, data.lastName);
        chrome.runtime.sendMessage({
          type: 'PROFILE_DATA_EXTRACTED',
          data: data
        });
      }).catch((err) => {
        console.error('[Lumina Content] Parse failed:', err);
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

const MOUNT_ID = 'lumina-extension-mount';

const injectUI = () => {
  // 1. Check if we are already injected
  if (document.getElementById(MOUNT_ID)) {
    return;
  }

  // 2. Inject into Body
  const targetElement = document.body;

  if (targetElement) {
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

    // 3. Create Shadow DOM
    const shadowRoot = injectionContainer.attachShadow({ mode: 'open' });

    // 4. Inject Styles inside Shadow DOM
    // We use the main generated CSS file (popup.css) which contains all Tailwind utilities
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('assets/popup.css');
    shadowRoot.appendChild(styleLink);

    // 5. Mount Point inside Shadow DOM
    const mountPoint = document.createElement('div');
    mountPoint.id = 'lumina-root';
    // Reset pointer events for the app container
    // We want the sidebar/buttons to catch clicks
    Object.assign(mountPoint.style, {
      pointerEvents: 'none', // Allow clicks to pass through the empty parts
      height: '100%',
      width: '100%',
      fontFamily: 'Inter, system-ui, sans-serif' // Enforce font in shadow dom
    });
    shadowRoot.appendChild(mountPoint);

    // 6. Mount React
    root = createRoot(mountPoint);
    root.render(
      <React.StrictMode>
        <LinkedInInjector />
      </React.StrictMode>
    );

    console.log('[Lumina] UI Injected successfully into Shadow DOM.');
  }
};

// 3. Observer to handle SPA navigation and dynamic loading
const observer = new MutationObserver((mutations) => {
  // Check if we are already injected
  if (!document.getElementById(MOUNT_ID)) {
    // Ensure body exists before injecting
    if (document.body) {
      injectUI();
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial inject - try early, with fallback
// First attempt at 500ms for fast loading
setTimeout(injectUI, 500);
// Fallback at 1500ms in case DOM wasn't ready
setTimeout(injectUI, 1500);
