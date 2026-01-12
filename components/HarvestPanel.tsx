import React, { useState, useEffect, useCallback } from 'react';

// Fix: Declare chrome variable
declare const chrome: any;

interface HarvestStatus {
    unsyncedCount: number;
    lastSyncedAt: string | null;
}

interface SyncResult {
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
}

export const HarvestPanel: React.FC = () => {
    const [status, setStatus] = useState<HarvestStatus>({
        unsyncedCount: 0,
        lastSyncedAt: null
    });
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch harvest status on mount and periodically
    const fetchStatus = useCallback(async () => {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_HARVEST_STATUS' });
            if (response?.success) {
                setStatus({
                    unsyncedCount: response.data.unsyncedCount || 0,
                    lastSyncedAt: response.data.lastSyncedAt || null
                });
            }
        } catch (err) {
            console.error('[HarvestPanel] Error fetching status:', err);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        // Refresh every 10 seconds
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleSync = async () => {
        setIsSyncing(true);
        setError(null);
        setSyncResult(null);

        try {
            const response = await chrome.runtime.sendMessage({ type: 'SYNC_HARVEST' });

            if (response?.success) {
                setSyncResult(response.data);
                // Refresh status after sync
                await fetchStatus();
            } else {
                setError(response?.message || 'Sync failed');
            }
        } catch (err: any) {
            setError(err.message || 'Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    const formatLastSynced = (isoString: string | null): string => {
        if (!isoString) return 'Never';

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700/50">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🌾</span>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                    Harvested Profiles
                </h3>
            </div>

            {/* Count */}
            <div className="mb-4">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                        {status.unsyncedCount}
                    </span>
                    <span className="text-sm text-amber-700 dark:text-amber-300">
                        profile{status.unsyncedCount !== 1 ? 's' : ''} ready to sync
                    </span>
                </div>
            </div>

            {/* Sync Button */}
            <button
                onClick={handleSync}
                disabled={isSyncing || status.unsyncedCount === 0}
                className={`
          w-full py-2.5 px-4 rounded-lg font-medium text-sm
          transition-all duration-200
          flex items-center justify-center gap-2
          ${status.unsyncedCount > 0 && !isSyncing
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }
        `}
            >
                {isSyncing ? (
                    <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Syncing...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sync to Yena
                    </>
                )}
            </button>

            {/* Last Synced */}
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-3 text-center">
                Last synced: {formatLastSynced(status.lastSyncedAt)}
            </p>

            {/* Sync Result */}
            {syncResult && (
                <div className="mt-3 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-xs text-green-700 dark:text-green-300">
                    <div className="font-medium mb-1">✓ Sync Complete</div>
                    <div>
                        Imported: {syncResult.imported} | Updated: {syncResult.updated} | Skipped: {syncResult.skipped}
                    </div>
                    {syncResult.errors.length > 0 && (
                        <div className="text-red-600 dark:text-red-400 mt-1">
                            Errors: {syncResult.errors.length}
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mt-3 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-xs text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Hint */}
            <p className="text-xs text-amber-600/60 dark:text-amber-400/60 mt-3 text-center italic">
                Profiles are automatically captured when you browse LinkedIn or Sales Navigator
            </p>
        </div>
    );
};
