import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
    return twMerge(clsx(inputs));
}

export interface PickerOption {
    id: string;
    label: string;
    sublabel?: string;
    icon?: React.ReactNode;
    color?: string;
}

interface PickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (option: PickerOption) => void;
    title: string;
    options: PickerOption[];
    selectedId?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    isLoading?: boolean;
}

export const PickerModal: React.FC<PickerModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    title,
    options,
    selectedId,
    searchPlaceholder = 'Search...',
    emptyMessage = 'No items found',
    isLoading = false,
}) => {
    const [search, setSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
        if (!isOpen) {
            setSearch('');
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.sublabel?.toLowerCase().includes(search.toLowerCase())
    );


    return (
        <div className="absolute inset-0 z-50 flex flex-col pointer-events-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative flex-1 flex flex-col m-4 mt-16 bg-[#1F2125] rounded-xl shadow-[rgb(47,48,51)_0px_0px_0px_1px_inset,rgba(0,0,0,0.16)_0px_0px_0px_1px,rgba(0,0,0,0.48)_0px_4px_8px_-4px,rgba(0,0,0,0.64)_0px_4px_12px_-2px] overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#27282B]">
                    <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#EEEFF1]">{title}</h3>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5 text-[#A2A4A7] hover:text-[#EEEFF1] transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-3 py-2.5 border-b border-[#27282B]">
                    <div className="relative flex items-center">
                        <svg className="absolute left-2.5 w-4 h-4 text-[#A2A4A7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full h-[36px] pl-8 pr-3 bg-transparent rounded-lg text-sm font-medium text-[#EEEFF1] placeholder:text-[rgba(255,255,255,0.29)] shadow-[inset_0px_0px_0px_1px_#27282B] focus:shadow-[inset_0px_0px_0px_1px_#7FA1F0] focus:outline-none transition-shadow duration-140"
                        />
                    </div>
                </div>

                {/* Options List */}
                <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin w-5 h-5 text-[#A2A4A7]" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : filteredOptions.length === 0 ? (
                        <div className="text-center py-8 text-sm font-medium tracking-[-0.02em] text-[#A2A4A7]">
                            {emptyMessage}
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => {
                                    onSelect(option);
                                    onClose();
                                }}
                                className={cn(
                                    "w-full flex items-start min-h-[54px] gap-3 px-4 py-3 rounded-xl text-left transition-all duration-140",
                                    selectedId === option.id
                                        ? "bg-[#5F86E5]/12 shadow-[inset_0px_0px_0px_1px_rgba(127,161,240,0.38)] text-[#EEEFF1]"
                                        : "hover:bg-[#27282B] text-[#EEEFF1]"
                                )}
                            >
                                {/* Icon or Color Dot */}
                                {option.icon ? (
                                    <span className="text-[#A2A4A7]">{option.icon}</span>
                                ) : option.color ? (
                                    <span
                                        className="w-3 h-3 mt-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: option.color }}
                                    />
                                ) : (
                                    <span className="w-2.5 h-2.5 mt-2 rounded-full bg-[#7FA1F0] shrink-0" />
                                )}

                                {/* Label */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[15px] leading-[1.32] font-semibold text-[#ECEFF3] break-words pr-1">{option.label}</p>
                                    {option.sublabel && (
                                        <p className="mt-1 text-[13px] leading-[1.4] font-medium text-[#A9AFB8] break-words pr-1">{option.sublabel}</p>
                                    )}
                                </div>

                                {/* Selected Check */}
                                {selectedId === option.id && (
                                    <svg className="w-4 h-4 text-[#7FA1F0] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2.5 border-t border-[#27282B] flex items-center justify-between text-xs font-medium text-[#A2A4A7]">
                    <span>Up/Down navigate</span>
                    <span>ESC to close</span>
                </div>
            </div>
        </div>
    );
};
