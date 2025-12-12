import React from 'react';
import { CandidateProfile } from '../types';

interface PreviewProps {
    data: CandidateProfile;
    onAdd: () => void;
    isLoading?: boolean;
    isExisting?: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ data, onAdd, isLoading, isExisting }) => {
    return (
        <div className="fixed right-5 top-20 w-[320px] bg-[#1a1b1e] rounded-xl shadow-2xl border border-[#2c2e33] overflow-hidden font-sans z-[2147483647] pointer-events-auto animate-in fade-in slide-in-from-right-5 duration-200">
            {/* Header Badge */}
            <div className={`px-4 py-2 flex items-center justify-center border-b border-[#2c2e33] ${isExisting ? 'bg-emerald-500/10' : 'bg-indigo-500/10'}`}>
                {isExisting ? (
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Existing Record
                    </span>
                ) : (
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        New Candidate
                    </span>
                )}
            </div>

            <div className="p-5">
                {/* Profile Info */}
                <div className="flex flex-col items-center text-center mb-5">
                    <div className="w-16 h-16 rounded-full bg-[#25262b] flex items-center justify-center text-white text-xl font-bold shadow-lg mb-3 overflow-hidden border-2 border-[#2c2e33]">
                        {data.profilePictureUrl ? (
                            <img src={data.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span>{data.firstName?.[0]}{data.lastName?.[0]}</span>
                        )}
                    </div>
                    <h3 className="text-gray-100 font-bold text-lg leading-tight">{data.firstName} {data.lastName}</h3>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed px-2">{data.headline}</p>
                </div>

                {/* Details List */}
                <div className="space-y-3 mb-6">
                    {data.currentCompany && (
                        <div className="flex items-center gap-3 text-xs text-gray-300">
                            <div className="w-6 flex justify-center text-gray-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            </div>
                            <span className="truncate">{data.currentCompany}</span>
                        </div>
                    )}
                    {data.location && (
                        <div className="flex items-center gap-3 text-xs text-gray-300">
                            <div className="w-6 flex justify-center text-gray-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <span className="truncate">{data.location}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-300">
                        <div className="w-6 flex justify-center text-gray-500">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                        </div>
                        <a href={data.linkedInUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline truncate transition-colors">
                            View LinkedIn Profile
                        </a>
                    </div>
                </div>

                {/* Action Button */}
                {!isExisting ? (
                    <button
                        onClick={onAdd}
                        disabled={isLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-indigo-900/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                <span>Add {data.firstName} to Lumina</span>
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        onClick={onAdd}
                        className="w-full bg-[#2c2e33] hover:bg-[#373a40] text-gray-200 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-[#373a40]"
                    >
                        <span>View in Lumina</span>
                    </button>
                )}

            </div>
        </div>
    );
};
