/**
 * Harvest Queue Management
 * 
 * Stores LinkedIn profiles that have been passively scraped
 * when the user visits profile pages.
 */

import { CandidateProfile } from './types';

// Storage key
const HARVEST_STORAGE_KEY = 'lumina_harvest_queue';

export interface HarvestedProfile {
    linkedinUrl: string;           // Unique key
    scrapedData: CandidateProfile;
    capturedAt: string;            // ISO timestamp
    synced: boolean;               // Has it been sent to server?
}

export interface HarvestQueue {
    profiles: HarvestedProfile[];
    lastSyncedAt: string | null;
    version: number;               // For migrations
}

const DEFAULT_QUEUE: HarvestQueue = {
    profiles: [],
    lastSyncedAt: null,
    version: 1
};

/**
 * Get the current harvest queue from storage
 */
export const getHarvestQueue = async (): Promise<HarvestQueue> => {
    try {
        const result = await chrome.storage.local.get(HARVEST_STORAGE_KEY);
        const queue = result[HARVEST_STORAGE_KEY] as HarvestQueue | undefined;

        if (!queue) {
            return DEFAULT_QUEUE;
        }

        return queue;
    } catch (error) {
        console.error('[Harvest] Error reading queue:', error);
        return DEFAULT_QUEUE;
    }
};

/**
 * Save the harvest queue to storage
 */
const saveHarvestQueue = async (queue: HarvestQueue): Promise<void> => {
    try {
        await chrome.storage.local.set({ [HARVEST_STORAGE_KEY]: queue });
    } catch (error) {
        console.error('[Harvest] Error saving queue:', error);
        throw error;
    }
};

/**
 * Normalize LinkedIn URL for consistent deduplication
 * Removes trailing slashes, query params, etc.
 */
export const normalizeLinkedInUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        // Get just the path, remove trailing slash
        let path = parsed.pathname.replace(/\/$/, '');
        return `https://www.linkedin.com${path}`;
    } catch {
        return url;
    }
};

/**
 * Store a profile in the harvest queue
 * If profile already exists (by URL), update it with fresh data
 */
export const storeInHarvestQueue = async (profileData: CandidateProfile): Promise<void> => {
    const queue = await getHarvestQueue();
    const normalizedUrl = normalizeLinkedInUrl(profileData.linkedinUrl);

    // Find existing profile by URL
    const existingIndex = queue.profiles.findIndex(
        p => normalizeLinkedInUrl(p.linkedinUrl) === normalizedUrl
    );

    const harvestedProfile: HarvestedProfile = {
        linkedinUrl: normalizedUrl,
        scrapedData: {
            ...profileData,
            linkedinUrl: normalizedUrl
        },
        capturedAt: new Date().toISOString(),
        synced: false
    };

    if (existingIndex >= 0) {
        // Update existing profile
        console.log('[Harvest] Updating existing profile:', normalizedUrl);
        queue.profiles[existingIndex] = harvestedProfile;
    } else {
        // Add new profile
        console.log('[Harvest] Adding new profile:', normalizedUrl);
        queue.profiles.push(harvestedProfile);
    }

    // Limit queue size to prevent storage overflow (~1000 profiles max)
    if (queue.profiles.length > 1000) {
        // Remove oldest synced profiles first
        const syncedProfiles = queue.profiles.filter(p => p.synced);
        const unsyncedProfiles = queue.profiles.filter(p => !p.synced);

        if (syncedProfiles.length > 500) {
            // Remove oldest synced profiles
            queue.profiles = [
                ...syncedProfiles.slice(-500),
                ...unsyncedProfiles
            ];
        }
    }

    await saveHarvestQueue(queue);
    console.log('[Harvest] Queue size:', queue.profiles.length);
};

/**
 * Get all unsynced profiles ready for sync
 */
export const getUnsyncedProfiles = async (): Promise<HarvestedProfile[]> => {
    const queue = await getHarvestQueue();
    return queue.profiles.filter(p => !p.synced);
};

/**
 * Get count of unsynced profiles
 */
export const getUnsyncedCount = async (): Promise<number> => {
    const unsynced = await getUnsyncedProfiles();
    return unsynced.length;
};

/**
 * Mark profiles as synced by their URLs
 */
export const markAsSynced = async (linkedinUrls: string[]): Promise<void> => {
    const queue = await getHarvestQueue();
    const normalizedUrls = new Set(linkedinUrls.map(normalizeLinkedInUrl));

    queue.profiles = queue.profiles.map(profile => {
        if (normalizedUrls.has(normalizeLinkedInUrl(profile.linkedinUrl))) {
            return { ...profile, synced: true };
        }
        return profile;
    });

    queue.lastSyncedAt = new Date().toISOString();

    await saveHarvestQueue(queue);
    console.log('[Harvest] Marked', linkedinUrls.length, 'profiles as synced');
};

/**
 * Clear all synced profiles from queue (cleanup)
 */
export const clearSyncedProfiles = async (): Promise<number> => {
    const queue = await getHarvestQueue();
    const beforeCount = queue.profiles.length;

    queue.profiles = queue.profiles.filter(p => !p.synced);

    await saveHarvestQueue(queue);

    const removedCount = beforeCount - queue.profiles.length;
    console.log('[Harvest] Cleared', removedCount, 'synced profiles');
    return removedCount;
};

/**
 * Get the last synced timestamp
 */
export const getLastSyncedAt = async (): Promise<string | null> => {
    const queue = await getHarvestQueue();
    return queue.lastSyncedAt;
};

/**
 * Clear entire harvest queue (for debugging/reset)
 */
export const clearHarvestQueue = async (): Promise<void> => {
    await saveHarvestQueue(DEFAULT_QUEUE);
    console.log('[Harvest] Queue cleared');
};
