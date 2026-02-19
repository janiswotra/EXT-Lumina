import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { Input } from './ui/Input';
import { PickerModal, PickerOption } from './ui/PickerModal';
import { CandidateProfile, Job, Stage, List } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

type CandidateData = CandidateProfile;

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    data: CandidateData;
    onUpdate: (data: CandidateData) => void;
    onSave: (jobId?: string, stageId?: string, listId?: string) => Promise<boolean>;
    isLoading: boolean;
    isExisting?: boolean;
}

declare const chrome: any;

// Info Row Component (Attio-style) - improved layout
const InfoRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    editable?: boolean;
    onChange?: (value: string) => void;
}> = ({ icon, label, value, editable, onChange }) => (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
        <div className="w-5 flex justify-center text-gray-500 shrink-0 mt-0.5">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">{label}</span>
            {editable ? (
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange?.(e.target.value)}
                    className="w-full text-sm text-white bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-[#7FA1F0]/50 placeholder-gray-600 transition-colors"
                    placeholder={`Enter ${label.toLowerCase()}...`}
                />
            ) : (
                <span className="text-sm text-white block break-words leading-relaxed">{value || '-'}</span>
            )}
        </div>
    </div>
);

// Selector Button Component (triggers modal)
const SelectorButton: React.FC<{
    label: string;
    value?: string;
    placeholder: string;
    onClick: () => void;
    onFocus?: () => void;
    isLoading?: boolean;
    color?: 'primary' | 'secondary';
}> = ({ label, value, placeholder, onClick, onFocus, isLoading, color = 'primary' }) => (
    <button
        onClick={onClick}
        onFocus={onFocus}
        className={cn(
            "w-full flex items-center justify-between px-4 py-4 rounded-xl border transition-all",
            "hover:bg-white/5 active:scale-[0.99]",
            color === 'primary'
                ? "bg-[#5F86E5]/8 border-[#7FA1F0]/25 hover:border-[#7FA1F0]/45"
                : "bg-white/5 border-white/10 hover:border-white/20"
        )}
    >
        <div className="flex items-center gap-3">
            <div className={cn(
                "w-3 h-3 rounded-full",
                color === 'primary' ? "bg-[#7FA1F0]" : "bg-gray-500"
            )} />
            <div className="text-left">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <p className={cn(
                    "text-sm font-medium",
                    value ? "text-white" : "text-gray-500"
                )}>
                    {isLoading ? 'Loading...' : value || placeholder}
                </p>
            </div>
        </div>
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
    </button>
);

// Collapsible Section Component
const CollapsibleSection: React.FC<{
    title: string;
    count: number;
    defaultExpanded?: boolean;
    children: React.ReactNode;
}> = ({ title, count, defaultExpanded = false, children }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="border-t border-white/5 pt-4">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between mb-3 group cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider group-hover:text-white transition-colors">
                        {title}
                    </h4>
                    <span className="text-xs bg-white/10 text-gray-400 px-2 py-0.5 rounded-full">
                        {count}
                    </span>
                </div>
                <svg
                    className={cn(
                        "w-4 h-4 text-gray-500 transition-transform duration-200",
                        isExpanded && "rotate-180"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isExpanded && children}
        </div>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    data,
    onUpdate,
    onSave,
    isLoading,
    isExisting = false
}) => {
    // Auth State
    const [authStatus, setAuthStatus] = useState<'CHECKING' | 'AUTHENTICATED' | 'MISSING_KEY'>('CHECKING');
    const [apiKey, setApiKey] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [authError, setAuthError] = useState('');

    // Form Data
    const [formData, setFormData] = useState<CandidateData>(data);
    const [isSuccess, setIsSuccess] = useState(false);

    // Jobs, Stages & Lists
    const [jobs, setJobs] = useState<Job[]>([]);
    const [stages, setStages] = useState<Stage[]>([]);
    const [lists, setLists] = useState<List[]>([]);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
    const [selectedList, setSelectedList] = useState<List | null>(null);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [loadingStages, setLoadingStages] = useState(false);
    const [loadingLists, setLoadingLists] = useState(false);

    // Modal States
    const [showJobPicker, setShowJobPicker] = useState(false);
    const [showStagePicker, setShowStagePicker] = useState(false);
    const [showListPicker, setShowListPicker] = useState(false);
    const lowConfidenceFields = formData.parseConfidence?.lowFields || [];
    const showConfidenceWarning = lowConfidenceFields.length > 0;
    const lowConfidenceLabel = lowConfidenceFields
        .map((field) => field === 'currentCompany' ? 'company' : field === 'jobTitle' ? 'job title' : field)
        .join(', ');

    useEffect(() => {
        setFormData(data);
    }, [data]);

    useEffect(() => {
        if (isOpen) {
            checkAuth();
        }
    }, [isOpen]);

    const checkAuth = () => {
        setAuthStatus('CHECKING');
        try {
            chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: any) => {
                if (response && response.success) {
                    setAuthStatus('AUTHENTICATED');
                } else {
                    setAuthStatus('MISSING_KEY');
                }
            });
        } catch (e) {
            console.warn('Extension context not found', e);
            setAuthStatus('MISSING_KEY');
        }
    };

    // Cache Helpers
    const CACHE_DURATION = 60 * 60 * 1000; // 1 Hour

    const getCachedData = (key: string): Promise<any> => {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result: any) => {
                const item = result[key];
                if (item && Date.now() - item.timestamp < CACHE_DURATION) {
                    resolve(item.data);
                } else {
                    resolve(null);
                }
            });
        });
    };

    const setCachedData = (key: string, data: any) => {
        chrome.storage.local.set({ [key]: { data, timestamp: Date.now() } });
    };

    const fetchJobs = useCallback(async (forceRefresh = false): Promise<void> => {
        setLoadingJobs(true);
        if (!forceRefresh) {
            const cached = await getCachedData('lumina_cache_jobs');
            if (cached) {
                setJobs(cached);
                setLoadingJobs(false);
                return;
            }
        }

        try {
            await new Promise<void>((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_JOBS' }, (response: any) => {
                    setLoadingJobs(false);
                    if (response && response.success && response.data) {
                        // Handle various response formats: { jobs: [...] }, [...], or { data: [...] }
                        let jobsData: Job[] = [];
                        if (Array.isArray(response.data)) {
                            jobsData = response.data;
                        } else if (response.data.jobs && Array.isArray(response.data.jobs)) {
                            jobsData = response.data.jobs;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            jobsData = response.data.data;
                        }
                        setJobs(jobsData);
                        setCachedData('lumina_cache_jobs', jobsData);
                    } else {
                        console.warn('[Yena Sidebar] GET_JOBS failed:', response);
                    }
                    resolve();
                });
            });
        } catch (e) {
            setLoadingJobs(false);
            console.error('[Yena Sidebar] Failed to fetch jobs:', e);
        }
    }, []);

    const fetchStages = useCallback(async (forceRefresh = false): Promise<void> => {
        setLoadingStages(true);
        if (!forceRefresh) {
            const cached = await getCachedData('lumina_cache_stages');
            if (cached) {
                setStages(cached);
                setLoadingStages(false);
                return;
            }
        }

        try {
            await new Promise<void>((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_STAGES' }, (response: any) => {
                    setLoadingStages(false);
                    if (response && response.success && response.data) {
                        let stagesData: Stage[] = [];
                        if (Array.isArray(response.data)) {
                            stagesData = response.data;
                        } else if (response.data.stages && Array.isArray(response.data.stages)) {
                            stagesData = response.data.stages;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            stagesData = response.data.data;
                        }
                        setStages(stagesData);
                        setCachedData('lumina_cache_stages', stagesData);
                    } else {
                        console.warn('[Yena Sidebar] GET_STAGES failed:', response);
                    }
                    resolve();
                });
            });
        } catch (e) {
            setLoadingStages(false);
            console.error('[Yena Sidebar] Failed to fetch stages:', e);
        }
    }, []);

    const fetchStagesForJob = useCallback(async (jobId: string, resetSelection = true): Promise<void> => {
        setLoadingStages(true);
        if (resetSelection) {
            setSelectedStage(null);
        }
        try {
            await new Promise<void>((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_STAGES', payload: { jobId } }, (response: any) => {
                    setLoadingStages(false);
                    if (response && response.success && response.data) {
                        let stagesData: Stage[] = [];
                        if (Array.isArray(response.data)) {
                            stagesData = response.data;
                        } else if (response.data.stages && Array.isArray(response.data.stages)) {
                            stagesData = response.data.stages;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            stagesData = response.data.data;
                        }
                        setStages(stagesData);
                        // Keep current selection during background refresh, if still present.
                        if (stagesData.length > 0) {
                            setSelectedStage((prev) => {
                                if (!resetSelection && prev) {
                                    const matchedStage = stagesData.find((stage) => stage.id === prev.id);
                                    if (matchedStage) {
                                        return matchedStage;
                                    }
                                }
                                return stagesData[0];
                            });
                        } else {
                            setSelectedStage(null);
                        }
                    } else {
                        console.warn('[Yena Sidebar] GET_STAGES for job failed:', response);
                        setStages([]);
                    }
                    resolve();
                });
            });
        } catch (e) {
            setLoadingStages(false);
            setStages([]);
        }
    }, []);

    const fetchLists = useCallback(async (forceRefresh = false): Promise<void> => {
        setLoadingLists(true);
        if (!forceRefresh) {
            const cached = await getCachedData('lumina_cache_lists');
            if (cached) {
                setLists(cached);
                setLoadingLists(false);
                return;
            }
        }

        try {
            await new Promise<void>((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_LISTS' }, (response: any) => {
                    setLoadingLists(false);
                    if (response && response.success && response.data) {
                        let listsData: List[] = [];
                        if (Array.isArray(response.data)) {
                            listsData = response.data;
                        } else if (response.data.lists && Array.isArray(response.data.lists)) {
                            listsData = response.data.lists;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            listsData = response.data.data;
                        }
                        setLists(listsData);
                        setCachedData('lumina_cache_lists', listsData);
                    } else {
                        console.warn('[Yena Sidebar] GET_LISTS failed:', response);
                    }
                    resolve();
                });
            });
        } catch (e) {
            setLoadingLists(false);
            console.error('[Yena Sidebar] Failed to fetch lists:', e);
        }
    }, []);

    const loadMetadata = useCallback(async (forceRefresh = true): Promise<void> => {
        await Promise.all([
            fetchJobs(forceRefresh),
            fetchLists(forceRefresh),
            selectedJob ? fetchStagesForJob(selectedJob.id, false) : fetchStages(forceRefresh)
        ]);
    }, [fetchJobs, fetchLists, fetchStages, fetchStagesForJob, selectedJob]);

    // Fetch Jobs, Lists, and Stages when authenticated
    useEffect(() => {
        if (authStatus === 'AUTHENTICATED') {
            void loadMetadata(true);
        }
    }, [authStatus, loadMetadata]);

    // Fetch Stages when job is selected
    useEffect(() => {
        if (selectedJob) {
            void fetchStagesForJob(selectedJob.id, true);
        }
    }, [selectedJob, fetchStagesForJob]);

    const handleConnect = () => {
        if (!apiKey.trim()) return;
        setIsConnecting(true);
        setAuthError('');

        chrome.storage.local.set({ lumina_api_key: apiKey.trim() }, () => {
            chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: any) => {
                setIsConnecting(false);
                if (response && response.success) {
                    setAuthStatus('AUTHENTICATED');
                } else {
                    setAuthError(response?.message || 'Failed to connect. Please check your key.');
                }
            });
        });
    };

    const handleChange = (field: keyof CandidateData, value: string) => {
        const updated: CandidateData = { ...formData, [field]: value };

        if (
            (field === 'headline' || field === 'location' || field === 'currentCompany') &&
            updated.parseConfidence
        ) {
            const fieldKey = field as 'headline' | 'location' | 'currentCompany';
            const nextLowFields = updated.parseConfidence.lowFields.filter((f) => f !== fieldKey);
            updated.parseConfidence = {
                ...updated.parseConfidence,
                [fieldKey]: 'high',
                lowFields: nextLowFields,
                overall: nextLowFields.length > 0 ? 'medium' : 'high',
            };
        }

        setFormData(updated);
        onUpdate(updated);
    };

    const handleSaveClick = async () => {
        const didSave = await onSave(
            selectedJob?.id || undefined,
            selectedStage?.id || undefined,
            selectedList?.id || undefined
        );
        if (didSave) {
            setIsSuccess(true);
            setTimeout(() => setIsSuccess(false), 3000);
        }
    };

    // Convert to picker options
    const jobOptions: PickerOption[] = jobs.map(job => ({
        id: job.id,
        label: job.title,
        sublabel: job.company || undefined,
    }));


    const stageOptions: PickerOption[] = stages.map(stage => ({
        id: stage.id,
        label: stage.name,
        color: stage.color,
    }));

    const listOptions: PickerOption[] = lists.map(list => ({
        id: list.id,
        label: list.name,
        sublabel: list.count !== undefined ? `${list.count} candidates` : undefined,
    }));

    if (!isOpen) return null;

    // --- RENDER: Auth Screen ---
    if (authStatus === 'MISSING_KEY' || authStatus === 'CHECKING') {
        return (
            <div className="fixed right-0 top-0 h-full w-[min(520px,92vw)] bg-[#111113] text-white shadow-2xl flex flex-col font-sans border-l border-white/10 z-[2147483647] pointer-events-auto overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src={chrome.runtime.getURL('icons/icon-32.png')}
                            alt="Yena"
                            className="w-8 h-8 object-contain"
                        />
                        <span className="font-semibold text-lg text-white">Yena</span>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Auth Content */}
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="w-20 h-20 rounded-2xl bg-[#5F86E5]/12 border border-[#7FA1F0]/25 flex items-center justify-center mb-8">
                        <svg className="w-10 h-10 text-[#7FA1F0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-semibold text-white mb-3 text-center">Connect to Yena</h2>
                    <p className="text-base text-gray-400 text-center mb-10 max-w-[300px]">
                        Enter your personal API Key from Yena Settings. Do not share API keys if you want correct ownership attribution.
                    </p>
                    <div className="w-full max-w-[320px] space-y-4">
                        <Input
                            label="API Key"
                            placeholder="lumina_sk_..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="text-center font-mono"
                        />
                        {authError && (
                            <p className="text-sm text-red-400 text-center bg-red-500/10 py-3 px-4 rounded-xl border border-red-500/20">
                                {authError}
                            </p>
                        )}
                        <Button
                            size="lg"
                            variant="primary"
                            onClick={handleConnect}
                            isLoading={isConnecting || authStatus === 'CHECKING'}
                            className="w-full py-4 text-base"
                        >
                            {authStatus === 'CHECKING' ? 'Connecting...' : 'Connect to Yena'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER: Authenticated Sidebar ---
    return (
        <div className="fixed right-0 top-0 h-full w-[min(520px,92vw)] bg-[#111113] text-white shadow-2xl flex flex-col font-sans border-l border-white/10 z-[2147483647] pointer-events-auto overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <img
                        src={chrome.runtime.getURL('icons/icon-32.png')}
                        alt="Yena"
                        className="w-8 h-8 object-contain"
                    />
                    <span className="font-semibold text-lg text-white">Yena</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                        isExisting
                            ? "bg-[#5F86E5]/12 border-[#7FA1F0]/25"
                            : "bg-amber-500/10 border-amber-500/20"
                    )}>
                        <div className={cn(
                            "w-2 h-2 rounded-full animate-pulse",
                            isExisting ? "bg-[#7FA1F0]" : "bg-amber-500"
                        )} />
                        <span className={cn(
                            "text-xs font-medium",
                            isExisting ? "text-[#C7D8FF]" : "text-amber-400"
                        )}>
                            {isExisting ? 'In Yena' : 'New Candidate'}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-none">

                {/* Profile Header */}
                <div className="px-6 py-6 border-b border-white/5">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#5F86E5]/35 to-[#7FA1F0]/25 p-0.5 shrink-0">
                            <div className="w-full h-full rounded-full overflow-hidden bg-[#1a1b1e] flex items-center justify-center">
                                {formData.profilePictureUrl ? (
                                    <img src={formData.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xl font-bold text-white">{formData.firstName?.[0]}{formData.lastName?.[0]}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-semibold text-white">{formData.firstName} {formData.lastName}</h3>
                                {formData.connectionDegree && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#266DF0]/10 border border-[#266DF0]/20 text-xs font-medium text-[#C2D6FF]">
                                        {formData.connectionDegree}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-400 mt-1 leading-relaxed">{formData.headline}</p>
                        </div>
                    </div>
                    {showConfidenceWarning && (
                        <div className="mt-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/25 text-[12px] text-amber-300 leading-snug">
                            Some parsed fields may be uncertain ({lowConfidenceLabel}). Please review before saving.
                        </div>
                    )}
                </div>

                {/* Assignment Section */}
                <div className="px-6 py-6 space-y-4 border-b border-white/5">
                    <SelectorButton
                        label="Add to Job"
                        value={selectedJob?.title}
                        placeholder="Select a job"
                        onFocus={() => { void loadMetadata(true); }}
                        onClick={() => setShowJobPicker(true)}
                        isLoading={loadingJobs}
                        color="primary"
                    />

                    {selectedJob && (
                        <SelectorButton
                            label="Pipeline Stage"
                            value={selectedStage?.name}
                            placeholder="Select stage"
                            onClick={() => setShowStagePicker(true)}
                            isLoading={loadingStages}
                            color="primary"
                        />
                    )}

                    <SelectorButton
                        label="Add to List"
                        value={selectedList?.name}
                        placeholder="Select a list (optional)"
                        onClick={() => setShowListPicker(true)}
                        isLoading={loadingLists}
                        color="secondary"
                    />
                </div>

                {/* Profile Details */}
                <div className="px-6 py-4">
                    <InfoRow
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                        label="First Name"
                        value={formData.firstName}
                        editable
                        onChange={(v) => handleChange('firstName', v)}
                    />
                    <InfoRow
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                        label="Last Name"
                        value={formData.lastName}
                        editable
                        onChange={(v) => handleChange('lastName', v)}
                    />
                    {formData.email && (
                        <InfoRow
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                            label="Email"
                            value={formData.email}
                        />
                    )}
                    {formData.phone && (
                        <InfoRow
                            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                            label="Phone"
                            value={formData.phone}
                        />
                    )}
                    <InfoRow
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                        label="Company"
                        value={formData.currentCompany || ''}
                        editable
                        onChange={(v) => handleChange('currentCompany', v)}
                    />
                    <InfoRow
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                        label="Location"
                        value={formData.location}
                        editable
                        onChange={(v) => handleChange('location', v)}
                    />
                </div>

                {/* Collapsible Sections */}
                <div className="px-6 pb-6">
                    {/* About Section */}
                    {formData.about && (
                        <div className="border-t border-white/5 pt-4 mb-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                About
                            </h4>
                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {formData.about}
                            </p>
                        </div>
                    )}

                    {formData.experiences && formData.experiences.length > 0 && (
                        <CollapsibleSection title="Experience" count={formData.experiences.length} defaultExpanded={true}>
                            <div className="space-y-3 pb-4">
                                {formData.experiences.map((exp: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-white/[0.02] rounded-lg border border-white/5">
                                        <div className="w-2 h-2 rounded-full bg-[#7FA1F0] mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white">{exp.title}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{exp.company} | {exp.startDate} - {exp.endDate || 'Present'}</p>
                                            {exp.description && (
                                                <p className="text-xs text-gray-500 mt-2 leading-relaxed whitespace-pre-wrap">
                                                    {exp.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.educations && formData.educations.length > 0 && (
                        <CollapsibleSection title="Education" count={formData.educations.length}>
                            <div className="space-y-3 pb-4">
                                {formData.educations.map((edu: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-white/[0.02] rounded-lg border border-white/5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white">{edu.school}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{edu.degree}{edu.field ? ` | ${edu.field}` : ''}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.skills && formData.skills.length > 0 && (
                        <CollapsibleSection title="Skills" count={formData.skills.length}>
                            <div className="flex flex-wrap gap-1.5 pb-4 max-h-[200px] overflow-y-auto">
                                {formData.skills.map((skill, i) => (
                                    <span key={i} className="text-xs text-gray-300 bg-white/5 px-2 py-1 rounded-md border border-white/10 hover:border-[#7FA1F0]/35 hover:bg-[#5F86E5]/10 transition-colors cursor-default">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.languages && formData.languages.length > 0 && (
                        <CollapsibleSection title="Languages" count={formData.languages.length} defaultExpanded={false}>
                            <div className="flex flex-wrap gap-1.5 pb-4">
                                {formData.languages.map((language: string, i: number) => (
                                    <span key={i} className="text-xs text-gray-300 bg-white/5 px-2 py-1 rounded-md border border-white/10">
                                        {language}
                                    </span>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.certifications && formData.certifications.length > 0 && (
                        <CollapsibleSection title="Certifications" count={formData.certifications.length} defaultExpanded={false}>
                            <div className="space-y-3 pb-4">
                                {formData.certifications.map((cert: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-white/[0.02] rounded-lg border border-white/5">
                                        <div className="w-2 h-2 rounded-full bg-[#7FA1F0] mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white">{cert.name}</p>
                                            {cert.issuer && <p className="text-xs text-gray-400 mt-0.5">{cert.issuer}</p>}
                                            {cert.issueDate && <p className="text-xs text-gray-500 mt-0.5">{cert.issueDate}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.courses && formData.courses.length > 0 && (
                        <CollapsibleSection title="Courses" count={formData.courses.length} defaultExpanded={false}>
                            <div className="space-y-2 pb-4">
                                {formData.courses.map((course: any, i: number) => (
                                    <div key={i} className="py-2 px-3 bg-white/[0.02] rounded-lg border border-white/5">
                                        <p className="text-sm font-medium text-white">{course.name}</p>
                                        {course.institution && <p className="text-xs text-gray-400 mt-0.5">{course.institution}</p>}
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.organizations && formData.organizations.length > 0 && (
                        <CollapsibleSection title="Organizations" count={formData.organizations.length} defaultExpanded={false}>
                            <div className="space-y-2 pb-4">
                                {formData.organizations.map((org: any, i: number) => (
                                    <div key={i} className="py-2 px-3 bg-white/[0.02] rounded-lg border border-white/5">
                                        <p className="text-sm font-medium text-white">{org.name}</p>
                                        {org.role && <p className="text-xs text-gray-400 mt-0.5">{org.role}</p>}
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Harvest Queue Section - DISABLED: Feature not synced with main app yet */}
                    {/* <HarvestQueueSection variant="full" /> */}
                </div>
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-5 border-t border-white/10 bg-[#0d0d0f] shrink-0">
                <Button
                    size="lg"
                    variant="primary"
                    onClick={handleSaveClick}
                    isLoading={isLoading}
                    className={cn(
                        "w-full py-4 text-base shadow-lg",
                        isSuccess && "bg-[#4E76D9] hover:bg-[#436BCF]"
                    )}
                >
                    {isSuccess ? (
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {isExisting ? 'Updated Candidate' : 'Added to Yena'}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            {isExisting ? 'Update Candidate' : 'Add to Yena'}
                        </div>
                    )}
                </Button>
            </div>

            {/* Picker Modals */}
            <PickerModal
                isOpen={showJobPicker}
                onClose={() => setShowJobPicker(false)}
                onSelect={(opt) => setSelectedJob(jobs.find(j => j.id === opt.id) || null)}
                title="Choose Job"
                options={jobOptions}
                selectedId={selectedJob?.id}
                searchPlaceholder="Search jobs..."
                emptyMessage="No jobs found"
                isLoading={loadingJobs}
            />

            <PickerModal
                isOpen={showStagePicker}
                onClose={() => setShowStagePicker(false)}
                onSelect={(opt) => setSelectedStage(stages.find(s => s.id === opt.id) || null)}
                title="Choose Stage"
                options={stageOptions}
                selectedId={selectedStage?.id}
                searchPlaceholder="Search stages..."
                emptyMessage="No stages found"
                isLoading={loadingStages}
            />

            <PickerModal
                isOpen={showListPicker}
                onClose={() => setShowListPicker(false)}
                onSelect={(opt) => setSelectedList(lists.find(l => l.id === opt.id) || null)}
                title="Choose List"
                options={listOptions}
                selectedId={selectedList?.id}
                searchPlaceholder="Search lists..."
                emptyMessage="No lists found"
                isLoading={loadingLists}
            />
        </div>
    );
};
