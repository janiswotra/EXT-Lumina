import React from 'react';
import { CandidateProfile } from '../types';

// Fix: Declare chrome for TypeScript
declare const chrome: any;

interface PreviewProps {
    data: CandidateProfile;
    onAdd: () => void;
    isLoading?: boolean;
    isExisting?: boolean;
    isFetching?: boolean;
}

// Attio-style info row component - improved for readability
const InfoRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | React.ReactNode;
    isLink?: boolean;
    href?: string;
}> = ({ icon, label, value, isLink, href }) => (
    <div className="flex items-start gap-3 py-2.5 group">
        <div className="w-5 h-5 flex items-center justify-center text-[#6B7280] shrink-0 mt-0.5">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <span className="text-xs font-medium tracking-[-0.01em] text-[#6B7280] uppercase block mb-1">
                {label}
            </span>
            {isLink ? (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium tracking-[-0.02em] text-[#EEEFF1] hover:text-[#864AFF] hover:underline underline-offset-2 block break-words"
                >
                    {value}
                </a>
            ) : typeof value === 'string' ? (
                <span className="text-sm font-medium tracking-[-0.02em] text-[#EEEFF1] block break-words leading-relaxed">
                    {value}
                </span>
            ) : (
                value
            )}
        </div>
    </div>
);

// Attio-style company tag
const CompanyTag: React.FC<{ name: string; logoUrl?: string }> = ({ name, logoUrl }) => (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#1D2E55] shadow-[inset_0px_0px_0px_1px_rgb(43,62,109)]">
        {logoUrl ? (
            <img src={logoUrl} alt="" className="w-4 h-4 rounded-sm object-cover" />
        ) : (
            <div className="w-4 h-4 rounded-sm bg-[#266DF0]/30 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-[#C2D6FF]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
            </div>
        )}
        <span className="text-sm font-medium tracking-[-0.02em] text-[#C2D6FF]">{name}</span>
    </div>
);

// Skeleton row for loading state
const SkeletonRow: React.FC = () => (
    <div className="flex items-center gap-3 py-2.5">
        <div className="w-5 h-5 rounded bg-white/5 animate-shimmer shrink-0" />
        <div className="w-[90px] h-4 rounded bg-white/5 animate-shimmer shrink-0" />
        <div className="flex-1 h-4 rounded bg-white/5 animate-shimmer" />
    </div>
);

export const Preview: React.FC<PreviewProps> = ({
    data,
    onAdd,
    isLoading,
    isExisting,
    isFetching
}) => {
    const showSkeleton = isFetching || (!data.firstName && !data.lastName);

    return (
        <div className="fixed right-5 top-16 w-[420px] bg-[#1A1D21] rounded-xl shadow-[rgb(47,48,51)_0px_0px_0px_1px_inset,rgba(0,0,0,0.16)_0px_0px_0px_1px,rgba(0,0,0,0.48)_0px_4px_8px_-4px,rgba(0,0,0,0.64)_0px_4px_12px_-2px] overflow-hidden font-sans z-[2147483647] pointer-events-auto animate-fade-in-up">

            {/* Header with Yena branding */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#27282B]">
                <div className="flex items-center gap-2">
                    <img
                        src={chrome.runtime.getURL('icons/icon-32.png')}
                        alt="Yena"
                        className="w-5 h-5 object-contain"
                    />
                    <span className="text-sm font-semibold tracking-[-0.02em] text-[#EEEFF1]">Yena</span>
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded-md hover:bg-white/5 transition-colors">
                        <svg className="w-4 h-4 text-[#A2A4A7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-white/5 transition-colors">
                        <svg className="w-4 h-4 text-[#A2A4A7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center py-4">
                {showSkeleton ? (
                    <div className="h-5 w-32 rounded-full bg-white/5 animate-shimmer" />
                ) : (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tracking-[-0.02em] ${isExisting
                        ? 'bg-[#1D4034] shadow-[inset_0px_0px_0px_1px_rgb(36,74,58)] text-[#A7F2CF]'
                        : 'bg-[#4E1B30] shadow-[inset_0px_0px_0px_1px_rgb(100,38,64)] text-[#FFBFDA]'
                        }`}>
                        {isExisting ? (
                            <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                In Yena
                            </>
                        ) : (
                            <>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                Record Suggestion
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Avatar */}
            <div className="flex justify-center pb-4">
                <div className={`w-16 h-16 rounded-2xl overflow-hidden shadow-[inset_0px_0px_0px_1px_#27282B] ${showSkeleton ? 'animate-shimmer bg-white/5' : 'bg-[#27282B]'}`}>
                    {!showSkeleton && (
                        data.profilePictureUrl ? (
                            <img src={data.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <span className="text-xl font-semibold text-[#EEEFF1]">
                                    {data.firstName?.[0]}{data.lastName?.[0]}
                                </span>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Name */}
            <div className="text-center px-4 pb-4">
                {showSkeleton ? (
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-40 rounded bg-white/5 animate-shimmer" />
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-2">
                        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#EEEFF1]">
                            {data.firstName} {data.lastName}
                        </h2>
                        {data.connectionDegree && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#266DF0]/10 border border-[#266DF0]/20 text-xs font-medium text-[#C2D6FF]">
                                {data.connectionDegree}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Separator */}
            <div className="h-px bg-[#27282B] mx-4" />

            {/* Info Rows */}
            <div className="px-4 py-2">
                {showSkeleton ? (
                    <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </>
                ) : (
                    <>
                        {data.headline && (
                            <InfoRow
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                }
                                label="Description"
                                value={data.headline}
                            />
                        )}
                        {data.location && (
                            <InfoRow
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                }
                                label="Location"
                                value={data.location}
                            />
                        )}
                        {data.currentCompany && (
                            <InfoRow
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                }
                                label="Company"
                                value={<CompanyTag name={data.currentCompany} />}
                            />
                        )}
                        {data.experiences?.[0]?.title && (
                            <InfoRow
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                }
                                label="Job title"
                                value={data.experiences[0].title}
                            />
                        )}
                        <InfoRow
                            icon={
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                </svg>
                            }
                            label="LinkedIn"
                            value={(data.firstName?.toLowerCase() || '') + (data.lastName?.toLowerCase() || '')}
                            isLink
                            href={data.linkedinUrl}
                        />
                    </>
                )}
            </div>

            {/* CTA Button */}
            <div className="px-4 pt-2 pb-2">
                <button
                    onClick={onAdd}
                    disabled={isLoading || showSkeleton}
                    className={`w-full h-[36px] rounded-lg text-sm font-semibold tracking-[-0.02em] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${isExisting
                        ? 'bg-[#1A1D21] text-[#EEEFF1] shadow-[inset_0px_0px_0px_1px_#2F3033] hover:bg-[#27282B]'
                        : 'bg-[#266DF0] text-white shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.1)] hover:bg-[#3B7DF5]'
                        }`}
                >
                    {isLoading ? (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : showSkeleton ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Loading...
                        </>
                    ) : isExisting ? (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View in Yena
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Person to Yena
                        </>
                    )}
                </button>
            </div>

            {/* Harvest Queue - Compact - DISABLED: Feature not synced with main app yet */}
            {/* <div className="px-4 pb-2">
                <HarvestQueueSection variant="compact" />
            </div> */}

            {/* Secondary Action */}
            <div className="px-4 pb-4">
                <button className="w-full py-2.5 text-sm font-medium tracking-[-0.02em] text-[#A2A4A7] hover:text-[#EEEFF1] hover:bg-white/5 rounded-lg transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Create record manually
                </button>
            </div>
        </div>
    );
};
