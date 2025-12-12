import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LinkedInInjector } from './LinkedInInjector';


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
  // Debounce simple check
  const shouldInject = !document.getElementById(MOUNT_ID) && window.location.href.includes('/in/');
  if (shouldInject) {
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

// Initial check
if (window.location.href.includes('/in/')) {
  setTimeout(injectUI, 1500); // Slight delay for hydration
}
