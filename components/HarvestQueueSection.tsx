import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../utils/cn';
import { formatTimeAgo } from '../utils/time';
import { safeSendMessage } from '../utils/chrome';

interface HarvestedProfilePreview {
    linkedinUrl: string;
    firstName: string;
    lastName: string;
    headline?: string;
    currentCompany?: string;
    capturedAt: string;
}

interface HarvestQueueSectionProps {
    variant?: 'full' | 'compact';
    onSyncComplete?: () => void;
}

export const HarvestQueueSection: React.FC<HarvestQueueSectionProps> = ({
    variant = 'full',
    onSyncComplete
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [profiles, setProfiles] = useState<HarvestedProfilePreview[]>([]);
    const [unsyncedCount, setUnsyncedCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ imported: number; updated: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchQueue = useCallback(async () => {
        try {
            const response = await safeSendMessage({ type: 'GET_HARVEST_QUEUE' });

            if (response?.success && response?.data) {
                const queue = response.data;
                const unsynced = queue.profiles?.filter((p: any) => !p.synced) || [];
                setUnsyncedCount(unsynced.length);

                // Map to preview format (most recent first)
                const previews: HarvestedProfilePreview[] = unsynced
                    .slice(0, 10) // Limit to 10 for display
                    .map((p: any) => ({
                        linkedinUrl: p.linkedinUrl,
                        firstName: p.scrapedData?.firstName || 'Unknown',
                        lastName: p.scrapedData?.lastName || '',
                        headline: p.scrapedData?.headline,
                        currentCompany: p.scrapedData?.currentCompany,
                        capturedAt: p.capturedAt
                    }))
                    .reverse(); // Most recent first

                setProfiles(previews);
            }
        } catch (err) {
            console.error('[HarvestQueue] Error fetching queue:', err);
        }
    }, []);

    useEffect(() => {
        fetchQueue();
        // Refresh every 30 seconds
        const interval = setInterval(fetchQueue, 30000);
        return () => clearInterval(interval);
    }, [fetchQueue]);

    const handleSync = async () => {
        setIsSyncing(true);
        setError(null);
        setSyncResult(null);

        try {
            const response = await safeSendMessage({ type: 'SYNC_HARVEST' });

            if (response?.success) {
                setSyncResult({
                    imported: response.data?.imported || 0,
                    updated: response.data?.updated || 0
                });
                await fetchQueue();
                onSyncComplete?.();

                // Clear success message after 3s
                setTimeout(() => setSyncResult(null), 3000);
            } else {
                setError(response?.message || 'Sync failed');
            }
        } catch (err: any) {
            setError(err.message || 'Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };


    // Compact variant - just a subtle indicator
    if (variant === 'compact') {
        if (unsyncedCount === 0) return null;

        return (
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all",
                    "bg-[#fffbeb] border border-[#fde68a] hover:border-[#fbbf24]",
                    isSyncing && "opacity-70 cursor-wait"
                )}
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">🌾</span>
                    <span className="text-base text-[#92400e]">
                        {unsyncedCount} harvested
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-[#d97706] text-sm font-medium">
                    {isSyncing ? (
                        <>
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Syncing...
                        </>
                    ) : syncResult ? (
                        <span className="text-[#059669]">✓ Synced</span>
                    ) : (
                        <>
                            Sync
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </>
                    )}
                </div>
            </button>
        );
    }

    // Full variant - collapsible section with list
    if (unsyncedCount === 0) return null;

    return (
        <div className="border-t border-[#e8ebf1] pt-4 mt-4">
            {/* Header - Clickable to expand */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between mb-3 group cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <span className="text-base">🌾</span>
                    <h4 className="text-sm font-semibold text-[#d97706] uppercase tracking-wider group-hover:text-[#b45309] transition-colors">
                        Harvested Queue
                    </h4>
                    <span className="text-sm bg-[#fffbeb] text-[#92400e] px-2 py-0.5 rounded-full border border-[#fde68a]">
                        {unsyncedCount}
                    </span>
                </div>
                <svg
                    className={cn(
                        "w-4 h-4 text-[#687182] transition-transform duration-200",
                        isExpanded && "rotate-180"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="space-y-3">
                    {/* Profile List */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                        {profiles.map((profile, i) => (
                            <div
                                key={profile.linkedinUrl}
                                className="flex items-center gap-3 p-2 rounded-lg bg-[#fafbfc] hover:bg-[#f5f7fa] border border-[#e8ebf1] transition-colors"
                            >
                                {/* Avatar Placeholder */}
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#fde68a] to-[#fed7aa] flex items-center justify-center shrink-0">
                                    <span className="text-sm font-medium text-[#92400e]">
                                        {profile.firstName?.[0]}{profile.lastName?.[0]}
                                    </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-medium text-[#181c25] truncate">
                                        {profile.firstName} {profile.lastName}
                                    </p>
                                    <p className="text-sm text-[#687182] truncate">
                                        {profile.currentCompany || profile.headline || 'No details'}
                                        <span className="text-[#7e8799]"> • {formatTimeAgo(profile.capturedAt)}</span>
                                    </p>
                                </div>
                            </div>
                        ))}

                        {unsyncedCount > 10 && (
                            <p className="text-sm text-[#687182] text-center py-1">
                                +{unsyncedCount - 10} more profiles
                            </p>
                        )}
                    </div>

                    {/* Sync Button */}
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                            "w-full py-2.5 px-4 rounded-lg font-medium text-base transition-all duration-200",
                            "flex items-center justify-center gap-2",
                            isSyncing
                                ? "bg-[#e8ebf1] text-[#7e8799] cursor-wait"
                                : "bg-[#d97706] hover:bg-[#b45309] text-white shadow-md hover:shadow-lg"
                        )}
                    >
                        {isSyncing ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Syncing to Yena...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Sync All to Yena
                            </>
                        )}
                    </button>

                    {/* Result/Error Messages */}
                    {syncResult && (
                        <div className="p-2 bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg text-sm text-[#065f46] text-center">
                            ✓ Synced: {syncResult.imported} imported, {syncResult.updated} updated
                        </div>
                    )}

                    {error && (
                        <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-sm text-[#991b1b] text-center">
                            {error}
                        </div>
                    )}

                    {/* Hint */}
                    <p className="text-sm text-[#7e8799] text-center italic">
                        Profiles captured while browsing LinkedIn or Sales Navigator
                    </p>
                </div>
            )}
        </div>
    );
};
