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

  // 2. Find the injection target. 
  // LinkedIn uses .ph5 or .pv-top-card-v2-ctas depending on A/B testing and view.
  // We look for the "More" button or the main action bar.
  const targetSelector = '.pv-top-card-v2-ctas'; 
  const targetElement = document.querySelector(targetSelector);

  if (targetElement) {
    // Create container
    injectionContainer = document.createElement('div');
    injectionContainer.id = MOUNT_ID;
    injectionContainer.style.display = 'inline-block';
    
    // Append to the action bar
    targetElement.appendChild(injectionContainer);

    // Mount React
    root = createRoot(injectionContainer);
    root.render(
      <React.StrictMode>
        <LinkedInInjector />
      </React.StrictMode>
    );
    
    console.log('[Lumina] UI Injected successfully.');
  }
};

// 3. Observer to handle SPA navigation and dynamic loading
const observer = new MutationObserver((mutations) => {
  // Debounce simple check
  const shouldInject = !document.getElementById(MOUNT_ID) && window.location.href.includes('/in/');
  if (shouldInject) {
    injectUI();
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
