/**
 * Content script injected into app.yena.ai
 * Acts as a bridge between:
 * - Web App (window.postMessage) <-> Background Script (chrome.runtime.sendMessage)
 *
 * This approach works for both local development and production because
 * it doesn't rely on the extension ID.
 */

import { ALL_APP_DOMAINS, ACTIVE_ENV_KEY, OLD_STORAGE_KEYS, STORAGE_KEYS, DOM_IDS, getEnvByDomain, ENVIRONMENTS } from './constants';

const ALLOWED_ORIGINS = [...ALL_APP_DOMAINS, 'http://localhost:3000', 'http://localhost:5173'];

console.log('[Yena contentApp] Script loaded on:', window.location.href);

// ============================================
// 1. Storage Migration (lumina_ -> yena_, then yena_ -> per-env)
// ============================================
const migrateStorageKeys = () => {
    // Step 1: lumina_ -> yena_ (old single-env keys)
    const luminaMigrations: Record<string, string> = {
        'lumina_api_key': OLD_STORAGE_KEYS.API_KEY,
        'lumina_user_id': OLD_STORAGE_KEYS.USER_ID,
        'lumina_cache_jobs': OLD_STORAGE_KEYS.CACHE_JOBS,
        'lumina_cache_stages': OLD_STORAGE_KEYS.CACHE_STAGES,
        'lumina_cache_lists': OLD_STORAGE_KEYS.CACHE_LISTS,
    };

    const oldKeys = Object.keys(luminaMigrations);
    chrome.storage.local.get(oldKeys, (result: Record<string, unknown>) => {
        const updates: Record<string, unknown> = {};
        const keysToRemove: string[] = [];

        for (const oldKey of oldKeys) {
            if (result[oldKey] !== undefined) {
                const newKey = luminaMigrations[oldKey];
                updates[newKey] = result[oldKey];
                keysToRemove.push(oldKey);
            }
        }

        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
                chrome.storage.local.remove(keysToRemove, () => {
                    console.log('[Yena contentApp] Migrated lumina_ storage keys:', keysToRemove);
                    // After lumina migration, run per-env migration
                    migrateToPerEnvKeys();
                });
            });
        } else {
            // No lumina keys, still try per-env migration
            migrateToPerEnvKeys();
        }
    });
};

/**
 * Migrate old single-env yena_api_key / yena_user_id to per-env keys.
 * Copies to the default (first) environment and removes old keys.
 */
const migrateToPerEnvKeys = () => {
    const defaultEnvId = ENVIRONMENTS[0].id;
    chrome.storage.local.get([OLD_STORAGE_KEYS.API_KEY, OLD_STORAGE_KEYS.USER_ID], (result: Record<string, unknown>) => {
        const updates: Record<string, unknown> = {};
        const keysToRemove: string[] = [];

        if (result[OLD_STORAGE_KEYS.API_KEY]) {
            updates[STORAGE_KEYS.apiKey(defaultEnvId)] = result[OLD_STORAGE_KEYS.API_KEY];
            keysToRemove.push(OLD_STORAGE_KEYS.API_KEY);
        }
        if (result[OLD_STORAGE_KEYS.USER_ID]) {
            updates[STORAGE_KEYS.userId(defaultEnvId)] = result[OLD_STORAGE_KEYS.USER_ID];
            keysToRemove.push(OLD_STORAGE_KEYS.USER_ID);
        }

        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
                chrome.storage.local.remove(keysToRemove, () => {
                    console.log('[Yena contentApp] Migrated to per-env keys:', keysToRemove, '->', Object.keys(updates));
                });
            });
        }
    });
};

// ============================================
// 2. Domain Detection & Active Env Storage
// ============================================
const detectAndStoreEnv = () => {
    const origin = window.location.origin;
    const env = getEnvByDomain(origin);
    if (env) {
        chrome.storage.local.set({ [ACTIVE_ENV_KEY]: env.id }, () => {
            console.log('[Yena contentApp] Active environment set to:', env.id, '(' + env.label + ')');
        });
    } else {
        console.log('[Yena contentApp] No matching environment for origin:', origin);
    }
};

// ============================================
// 3. DOM Marker Injection (for extension detection)
// ============================================
const injectMarker = () => {
    const version = chrome.runtime.getManifest().version;

    // Inject new marker
    if (!document.getElementById(DOM_IDS.EXTENSION_INSTALLED)) {
        const marker = document.createElement('div');
        marker.id = DOM_IDS.EXTENSION_INSTALLED;
        marker.setAttribute('data-version', version);
        marker.setAttribute('data-extension-id', chrome.runtime.id || '');
        marker.style.display = 'none';
        document.body.appendChild(marker);
    }

    // Keep legacy marker for backward compatibility during transition
    if (!document.getElementById(DOM_IDS.LEGACY_EXTENSION_INSTALLED)) {
        const legacyMarker = document.createElement('div');
        legacyMarker.id = DOM_IDS.LEGACY_EXTENSION_INSTALLED;
        legacyMarker.setAttribute('data-version', version);
        legacyMarker.setAttribute('data-extension-id', chrome.runtime.id || '');
        legacyMarker.style.display = 'none';
        document.body.appendChild(legacyMarker);
    }

    console.log('[Yena contentApp] Extension markers injected');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectMarker();
        migrateStorageKeys();
        detectAndStoreEnv();
    });
} else {
    injectMarker();
    migrateStorageKeys();
    detectAndStoreEnv();
}

// ============================================
// 4. Listen for messages FROM the web app
// ============================================
window.addEventListener('message', async (event) => {
    // Security: validate origin
    if (!ALLOWED_ORIGINS.includes(event.origin)) return;

    // Accept both old and new source identifiers
    const source = event.data?.source;
    if (source !== 'YENA_WEB_APP' && source !== 'LUMINA_WEB_APP') return;

    const { type, payload } = event.data;
    console.log('[Yena contentApp] Received from web app:', type);

    if (type === 'CHECK_FOR_UPDATES') {
        try {
            chrome.runtime.sendMessage({
                type: 'CHECK_FOR_UPDATES',
                payload
            }, (response: any) => {
                console.log('[Yena contentApp] Background response:', response);

                window.postMessage({
                    source: 'YENA_EXTENSION_ACK',
                    profileId: payload?.profileId,
                    success: response?.success ?? false,
                    error: response?.error
                }, window.location.origin);
            });
        } catch (err: any) {
            console.error('[Yena contentApp] Error sending to background:', err);
            window.postMessage({
                source: 'YENA_EXTENSION_ACK',
                profileId: payload?.profileId,
                success: false,
                error: err.message
            }, window.location.origin);
        }
        return;
    }

    if (type === 'SET_API_KEY') {
        try {
            console.log('[Yena contentApp] Received API Key update request');
            chrome.runtime.sendMessage({
                type: 'SET_API_KEY',
                payload
            }, (response: any) => {
                console.log('[Yena contentApp] Background response for SET_API_KEY:', response);

                window.postMessage({
                    source: 'YENA_EXTENSION_ACK',
                    type: 'SET_API_KEY_RESULT',
                    success: response?.success ?? false,
                    error: response?.error
                }, window.location.origin);
            });
        } catch (err: any) {
            console.error('[Yena contentApp] Error sending API Key to background:', err);
            window.postMessage({
                source: 'YENA_EXTENSION_ACK',
                type: 'SET_API_KEY_RESULT',
                success: false,
                error: err.message
            }, window.location.origin);
        }
        return;
    }

    // Handle PING for extension detection
    if (type === 'PING') {
        const version = chrome.runtime.getManifest().version;
        window.postMessage({
            source: 'YENA_EXTENSION_ACK',
            type: 'PONG',
            success: true,
            version
        }, window.location.origin);
        return;
    }
});

// ============================================
// 5. Listen for results FROM background script
// ============================================
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
    console.log('[Yena contentApp] Message from background:', message.type, message);

    // Forward PROFILE_RESULT to web app
    if (message.type === 'PROFILE_RESULT') {
        window.postMessage({
            source: 'YENA_EXTENSION_RESULT',
            type: 'PROFILE_UPDATED',
            payload: message.payload
        }, window.location.origin);

        sendResponse({ received: true });
        return true;
    }
});
