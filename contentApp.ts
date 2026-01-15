/**
 * Content script injected into app.yena.ai
 * Acts as a bridge between:
 * - Web App (window.postMessage) ↔ Background Script (chrome.runtime.sendMessage)
 * 
 * This approach works for both local development and production because
 * it doesn't rely on the extension ID.
 */

console.log('[Lumina contentApp] Script loaded on:', window.location.href);

// ============================================
// 1. DOM Marker Injection (for extension detection)
// ============================================
const injectMarker = () => {
    if (document.getElementById('lumina-extension-installed')) return;

    const marker = document.createElement('div');
    marker.id = 'lumina-extension-installed';
    marker.setAttribute('data-version', '1.0.24');
    marker.setAttribute('data-extension-id', chrome.runtime.id || '');
    marker.style.display = 'none';
    document.body.appendChild(marker);

    console.log('[Lumina contentApp] Extension marker injected');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectMarker);
} else {
    injectMarker();
}

// ============================================
// 2. Listen for messages FROM the web app
// ============================================
window.addEventListener('message', async (event) => {
    // Only accept messages from our web app
    if (event.data?.source !== 'LUMINA_WEB_APP') return;

    const { type, payload } = event.data;
    console.log('[Lumina contentApp] Received from web app:', type, payload);

    if (type === 'CHECK_FOR_UPDATES') {
        try {
            // Relay to background script (internal message, no ID needed)
            chrome.runtime.sendMessage({
                type: 'CHECK_FOR_UPDATES',
                payload
            }, (response) => {
                console.log('[Lumina contentApp] Background response:', response);

                // Send acknowledgment back to web app
                window.postMessage({
                    source: 'LUMINA_EXTENSION_ACK',
                    profileId: payload?.profileId,
                    success: response?.success ?? true,
                    error: response?.error
                }, '*');
            });
        } catch (err: any) {
            console.error('[Lumina contentApp] Error sending to background:', err);
            window.postMessage({
                source: 'LUMINA_EXTENSION_ACK',
                profileId: payload?.profileId,
                success: false,
                error: err.message
            }, '*');
        }
        return;
    }

    if (type === 'SET_API_KEY') {
        try {
            console.log('[Lumina contentApp] Received API Key from web app');
            // Relay to background script to save the key
            chrome.runtime.sendMessage({
                type: 'SET_API_KEY',
                payload
            }, (response) => {
                console.log('[Lumina contentApp] Background response for SET_API_KEY:', response);

                // Send acknowledgment back to web app
                window.postMessage({
                    source: 'LUMINA_EXTENSION_ACK',
                    type: 'SET_API_KEY_RESULT',
                    success: response?.success ?? true,
                    error: response?.error
                }, '*');
            });
        } catch (err: any) {
            console.error('[Lumina contentApp] Error sending API Key to background:', err);
            window.postMessage({
                source: 'LUMINA_EXTENSION_ACK',
                type: 'SET_API_KEY_RESULT',
                success: false,
                error: err.message
            }, '*');
        }
        return;
    }

    // Handle PING for extension detection
    if (type === 'PING') {
        window.postMessage({
            source: 'LUMINA_EXTENSION_ACK',
            type: 'PONG',
            success: true,
            version: '1.0.24'
        }, '*');
        return;
    }
});

// ============================================
// 3. Listen for results FROM background script
// ============================================
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
    console.log('[Lumina contentApp] Message from background:', message.type, message);

    // Forward PROFILE_RESULT to web app
    if (message.type === 'PROFILE_RESULT') {
        window.postMessage({
            source: 'LUMINA_EXTENSION_RESULT',
            type: 'PROFILE_UPDATED',
            payload: message.payload
        }, '*');

        sendResponse({ received: true });
        return true;
    }
});
