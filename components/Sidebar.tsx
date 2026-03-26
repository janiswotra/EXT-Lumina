import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './Button';
import { PickerModal, PickerOption } from './ui/PickerModal';
import { CandidateProfile, Job, Stage, List } from '../types';
import { cn } from '../utils/cn';
import { ACTIVE_ENV_KEY, STORAGE_KEYS, ENVIRONMENTS, getEnvById } from '../constants';

type CandidateData = CandidateProfile;

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    data: CandidateData;
    onUpdate: (data: CandidateData) => void;
    onSave: (jobId?: string, stageId?: string, listId?: string) => Promise<boolean>;
    isLoading: boolean;
    isExisting?: boolean;
    onDisconnect?: () => void;
}


// Info Row Component - light theme
const InfoRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    editable?: boolean;
    onChange?: (value: string) => void;
}> = ({ icon, label, value, editable, onChange }) => (
    <div className="flex items-start gap-3 py-3 border-b border-[#e8ebf1] last:border-0">
        <div className="w-5 flex justify-center text-[#687182] shrink-0 mt-0.5">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <span className="text-sm text-[#687182] uppercase tracking-wider block mb-1">{label}</span>
            {editable ? (
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange?.(e.target.value)}
                    className="w-full text-base text-[#181c25] bg-white border border-[#dde1e8] rounded-lg px-3 py-2 focus:outline-none focus:border-[#2563eb] placeholder-[#7e8799] transition-colors"
                    placeholder={`Enter ${label.toLowerCase()}...`}
                />
            ) : (
                <span className="text-base text-[#181c25] block break-words leading-relaxed">{value || '-'}</span>
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
            "hover:bg-[#f5f7fa] active:scale-[0.99]",
            color === 'primary'
                ? "bg-[#eff6ff] border-[#bfdbfe] hover:border-[#93c5fd]"
                : "bg-[#fafbfc] border-[#dde1e8] hover:border-[#c5cad4]"
        )}
    >
        <div className="flex items-center gap-3">
            <div className={cn(
                "w-3 h-3 rounded-full",
                color === 'primary' ? "bg-[#2563eb]" : "bg-[#687182]"
            )} />
            <div className="text-left">
                <p className="text-sm text-[#687182] uppercase tracking-wider mb-1">{label}</p>
                <p className={cn(
                    "text-base font-medium",
                    value ? "text-[#181c25]" : "text-[#7e8799]"
                )}>
                    {isLoading ? 'Loading...' : value || placeholder}
                </p>
            </div>
        </div>
        <svg className="w-4 h-4 text-[#687182]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="border-t border-[#e8ebf1] pt-4">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between mb-3 group cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-[#687182] uppercase tracking-wider group-hover:text-[#181c25] transition-colors">
                        {title}
                    </h4>
                    <span className="text-sm bg-[#f5f7fa] text-[#687182] px-2 py-0.5 rounded-full border border-[#e8ebf1]">
                        {count}
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
    isExisting = false,
    onDisconnect
}) => {
    // Active environment
    const [activeEnvId, setActiveEnvId] = useState<string>(ENVIRONMENTS[0].id);
    const [activeEnvLabel, setActiveEnvLabel] = useState<string>(ENVIRONMENTS[0].label);

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

    // Load active env on open
    useEffect(() => {
        if (isOpen) {
            chrome.storage.local.get(ACTIVE_ENV_KEY, (result: Record<string, unknown>) => {
                const envId = (result[ACTIVE_ENV_KEY] as string) || ENVIRONMENTS[0].id;
                setActiveEnvId(envId);
                const env = getEnvById(envId);
                if (env) setActiveEnvLabel(env.label);
            });
        }
    }, [isOpen]);

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

    // Generic fetcher that handles caching, loading state, and response format normalization
    const fetchCachedData = useCallback(<T,>(opts: {
        messageType: string;
        payload?: any;
        cacheKey?: string;
        dataKey?: string; // e.g. 'jobs', 'stages', 'lists' — for nested response formats
        setData: (data: T[]) => void;
        setLoading: (loading: boolean) => void;
        forceRefresh?: boolean;
    }): Promise<T[]> => {
        const { messageType, payload, cacheKey, dataKey, setData, setLoading, forceRefresh = false } = opts;

        const extractArray = (responseData: any): T[] => {
            if (Array.isArray(responseData)) return responseData;
            if (dataKey && responseData[dataKey] && Array.isArray(responseData[dataKey])) return responseData[dataKey];
            if (responseData.data && Array.isArray(responseData.data)) return responseData.data;
            return [];
        };

        setLoading(true);

        return (async () => {
            if (!forceRefresh && cacheKey) {
                const cached = await getCachedData(cacheKey);
                if (cached) {
                    setData(cached);
                    setLoading(false);
                    return cached;
                }
            }

            try {
                const items = await new Promise<T[]>((resolve) => {
                    const msg = payload ? { type: messageType, payload } : { type: messageType };
                    chrome.runtime.sendMessage(msg, (response: any) => {
                        if (response && response.success && response.data) {
                            const extracted = extractArray(response.data);
                            resolve(extracted);
                        } else {
                            console.warn(`[Yena Sidebar] ${messageType} failed:`, response);
                            resolve([]);
                        }
                    });
                });
                setData(items);
                if (cacheKey && items.length > 0) setCachedData(cacheKey, items);
                return items;
            } catch (e) {
                console.error(`[Yena Sidebar] Failed to fetch ${messageType}:`, e);
                return [];
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const fetchJobs = useCallback((forceRefresh = false) =>
        fetchCachedData<Job>({
            messageType: 'GET_JOBS', cacheKey: STORAGE_KEYS.cacheJobs(activeEnvId), dataKey: 'jobs',
            setData: setJobs, setLoading: setLoadingJobs, forceRefresh,
        }),
    [fetchCachedData, activeEnvId]);

    const fetchStages = useCallback((forceRefresh = false) =>
        fetchCachedData<Stage>({
            messageType: 'GET_STAGES', cacheKey: STORAGE_KEYS.cacheStages(activeEnvId), dataKey: 'stages',
            setData: setStages, setLoading: setLoadingStages, forceRefresh,
        }),
    [fetchCachedData, activeEnvId]);

    const fetchStagesForJob = useCallback(async (jobId: string, resetSelection = true): Promise<void> => {
        if (resetSelection) setSelectedStage(null);
        const stagesData = await fetchCachedData<Stage>({
            messageType: 'GET_STAGES', payload: { jobId }, dataKey: 'stages',
            setData: setStages, setLoading: setLoadingStages, forceRefresh: true,
        });
        if (stagesData.length > 0) {
            setSelectedStage((prev) => {
                if (!resetSelection && prev) {
                    const matched = stagesData.find((s) => s.id === prev.id);
                    if (matched) return matched;
                }
                return stagesData[0];
            });
        } else {
            setSelectedStage(null);
        }
    }, [fetchCachedData]);

    const fetchLists = useCallback((forceRefresh = false) =>
        fetchCachedData<List>({
            messageType: 'GET_LISTS', cacheKey: STORAGE_KEYS.cacheLists(activeEnvId), dataKey: 'lists',
            setData: setLists, setLoading: setLoadingLists, forceRefresh,
        }),
    [fetchCachedData, activeEnvId]);

    const loadMetadata = useCallback(async (forceRefresh = true): Promise<void> => {
        await Promise.all([
            fetchJobs(forceRefresh),
            fetchLists(forceRefresh),
            fetchStages(forceRefresh)
        ]);
    }, [fetchJobs, fetchLists, fetchStages]);

    // Fetch Jobs, Lists, and Stages when sidebar opens
    useEffect(() => {
        if (isOpen) {
            void loadMetadata(true);
        }
    }, [isOpen, loadMetadata]);

    // Fetch Stages when job is selected
    useEffect(() => {
        if (selectedJob) {
            void fetchStagesForJob(selectedJob.id, true);
        }
    }, [selectedJob, fetchStagesForJob]);

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

    // --- RENDER: Sidebar ---
    return (
        <div className="fixed right-0 top-0 h-full w-[min(520px,92vw)] bg-white text-[#181c25] shadow-2xl flex flex-col font-sans border-l border-[#dde1e8] z-[2147483647] pointer-events-auto overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[#dde1e8] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#ff6a26] flex items-center justify-center shadow-sm">
                        <img
                            src={chrome.runtime.getURL('icons/icon-32.png')}
                            alt="Yena"
                            className="w-6 h-6 object-contain"
                        />
                    </div>
                    <span className="font-semibold text-xl text-[#181c25]">Yena</span>
                    <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        activeEnvId === 'prod'
                            ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]"
                            : "bg-[#fef3c7] text-[#92400e] border border-[#fde68a]"
                    )}>
                        {activeEnvLabel}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                        isExisting
                            ? "bg-[#eff6ff] border-[#bfdbfe]"
                            : "bg-[#fffbeb] border-[#fde68a]"
                    )}>
                        <div className={cn(
                            "w-2 h-2 rounded-full animate-pulse",
                            isExisting ? "bg-[#2563eb]" : "bg-[#d97706]"
                        )} />
                        <span className={cn(
                            "text-sm font-medium",
                            isExisting ? "text-[#1e40af]" : "text-[#92400e]"
                        )}>
                            {isExisting ? 'In Yena' : 'New Candidate'}
                        </span>
                    </div>
                    {onDisconnect && (
                        <button
                            onClick={onDisconnect}
                            title="Disconnect API Key"
                            className="p-2 rounded-lg hover:bg-[#fef2f2] text-[#687182] hover:text-[#dc2626] transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f5f7fa] text-[#687182] hover:text-[#181c25] transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-none">

                {/* Profile Header */}
                <div className="px-6 py-6 border-b border-[#e8ebf1]">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563eb]/20 to-[#3b82f6]/15 p-0.5 shrink-0">
                            <div className="w-full h-full rounded-full overflow-hidden bg-[#f5f7fa] flex items-center justify-center">
                                {formData.profilePictureUrl ? (
                                    <img src={formData.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-bold text-[#181c25]">{formData.firstName?.[0]}{formData.lastName?.[0]}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-2xl font-semibold text-[#181c25]">{formData.firstName} {formData.lastName}</h3>
                                {formData.connectionDegree && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#eff6ff] border border-[#bfdbfe] text-sm font-medium text-[#1e40af]">
                                        {formData.connectionDegree}
                                    </span>
                                )}
                            </div>
                            <p className="text-base text-[#4a5364] mt-1 leading-relaxed">{formData.headline}</p>
                        </div>
                    </div>
                    {showConfidenceWarning && (
                        <div className="mt-4 px-3 py-2 rounded-lg bg-[#fffbeb] border border-[#fde68a] text-sm text-[#92400e] leading-snug">
                            Some parsed fields may be uncertain ({lowConfidenceLabel}). Please review before saving.
                        </div>
                    )}
                </div>

                {/* Assignment Section */}
                <div className="px-6 py-6 space-y-4 border-b border-[#e8ebf1]">
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
                        <div className="border-t border-[#e8ebf1] pt-4 mb-4">
                            <h4 className="text-sm font-semibold text-[#687182] uppercase tracking-wider mb-3">
                                About
                            </h4>
                            <p className="text-base text-[#4a5364] leading-relaxed whitespace-pre-wrap">
                                {formData.about}
                            </p>
                        </div>
                    )}

                    {formData.experiences && formData.experiences.length > 0 && (
                        <CollapsibleSection title="Experience" count={formData.experiences.length} defaultExpanded={true}>
                            <div className="space-y-3 pb-4">
                                {formData.experiences.map((exp: any, i: number) => (
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <div className="w-2 h-2 rounded-full bg-[#2563eb] mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-medium text-[#181c25]">{exp.title}</p>
                                            <p className="text-sm text-[#687182] mt-0.5">{exp.company} | {exp.startDate} - {exp.endDate || 'Present'}</p>
                                            {exp.description && (
                                                <p className="text-sm text-[#7e8799] mt-2 leading-relaxed whitespace-pre-wrap">
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
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <div className="w-2 h-2 rounded-full bg-[#2563eb] mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-medium text-[#181c25]">{edu.school}</p>
                                            <p className="text-sm text-[#687182] mt-0.5">{edu.degree}{edu.field ? ` | ${edu.field}` : ''}</p>
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
                                    <span key={i} className="text-sm text-[#4a5364] bg-[#fafbfc] px-2 py-1 rounded-md border border-[#e8ebf1] hover:border-[#bfdbfe] hover:bg-[#eff6ff] transition-colors cursor-default">
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
                                    <span key={i} className="text-sm text-[#4a5364] bg-[#fafbfc] px-2 py-1 rounded-md border border-[#e8ebf1]">
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
                                    <div key={i} className="flex items-start gap-3 py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <div className="w-2 h-2 rounded-full bg-[#2563eb] mt-2 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-medium text-[#181c25]">{cert.name}</p>
                                            {cert.issuer && <p className="text-sm text-[#687182] mt-0.5">{cert.issuer}</p>}
                                            {cert.issueDate && <p className="text-sm text-[#7e8799] mt-0.5">{cert.issueDate}</p>}
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
                                    <div key={i} className="py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <p className="text-base font-medium text-[#181c25]">{course.name}</p>
                                        {course.institution && <p className="text-sm text-[#687182] mt-0.5">{course.institution}</p>}
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.organizations && formData.organizations.length > 0 && (
                        <CollapsibleSection title="Organizations" count={formData.organizations.length} defaultExpanded={false}>
                            <div className="space-y-2 pb-4">
                                {formData.organizations.map((org: any, i: number) => (
                                    <div key={i} className="py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <p className="text-base font-medium text-[#181c25]">{org.name}</p>
                                        {org.role && <p className="text-sm text-[#687182] mt-0.5">{org.role}</p>}
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {formData.recommendations && formData.recommendations.length > 0 && (
                        <CollapsibleSection title="Recommendations" count={formData.recommendations.length} defaultExpanded={false}>
                            <div className="space-y-2 pb-4">
                                {formData.recommendations.map((rec: string, i: number) => (
                                    <div key={i} className="py-2 px-3 bg-[#fafbfc] rounded-lg border border-[#e8ebf1]">
                                        <p className="text-sm text-[#181c25] whitespace-pre-wrap">{rec}</p>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                </div>
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-5 border-t border-[#dde1e8] bg-[#fafbfc] shrink-0">
                <Button
                    size="lg"
                    variant="primary"
                    onClick={handleSaveClick}
                    isLoading={isLoading}
                    className={cn(
                        "w-full py-4 text-lg shadow-lg",
                        isSuccess && "bg-[#059669] hover:bg-[#047857]"
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
