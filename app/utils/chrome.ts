/**
 * Check if the extension context is still valid.
 * Returns false if the extension was reloaded/updated while this script was running.
 */
export function isExtensionContextValid(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

/**
 * Safely send a message to the background script.
 * Returns null if the extension context is invalid.
 */
export function safeSendMessage(message: unknown): Promise<any> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(null);
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response: any) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch {
      resolve(null);
    }
  });
}
