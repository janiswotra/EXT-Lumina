import React, { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '../../utils/cn';

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

    const filteredOptions = useMemo(() => options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.sublabel?.toLowerCase().includes(search.toLowerCase())
    ), [options, search]);

    if (!isOpen) return null;


    return (
        <div className="absolute inset-0 z-50 flex flex-col pointer-events-auto" role="dialog" aria-modal="true" aria-label={title}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative flex-1 flex flex-col m-4 mt-16 bg-white rounded-xl shadow-[0px_0px_0px_1px_#dde1e8,0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8ebf1]">
                    <h3 className="text-base font-semibold tracking-[-0.02em] text-[#181c25]">{title}</h3>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#4a5364] hover:text-[#181c25] transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-3 py-2.5 border-b border-[#e8ebf1]">
                    <div className="relative flex items-center">
                        <svg className="absolute left-2.5 w-4 h-4 text-[#4a5364]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full h-[36px] pl-8 pr-3 bg-white rounded-lg text-base font-medium text-[#181c25] placeholder:text-[#7e8799] shadow-[inset_0px_0px_0px_1px_#dde1e8] focus:shadow-[inset_0px_0px_0px_1px_#2563eb] focus:outline-none transition-shadow duration-140"
                        />
                    </div>
                </div>

                {/* Options List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin w-5 h-5 text-[#4a5364]" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : filteredOptions.length === 0 ? (
                        <div className="text-center py-8 text-base font-medium tracking-[-0.02em] text-[#4a5364]">
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
                                        ? "bg-[#eff6ff] border border-[#bfdbfe] text-[#181c25]"
                                        : "hover:bg-[#f5f7fa] text-[#181c25]"
                                )}
                            >
                                {/* Icon or Color Dot */}
                                {option.icon ? (
                                    <span className="text-[#4a5364]">{option.icon}</span>
                                ) : option.color ? (
                                    <span
                                        className="w-3 h-3 mt-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: option.color }}
                                    />
                                ) : (
                                    <span className="w-2.5 h-2.5 mt-2 rounded-full bg-[#2563eb] shrink-0" />
                                )}

                                {/* Label */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[15px] leading-[1.32] font-semibold text-[#181c25] break-words pr-1">{option.label}</p>
                                    {option.sublabel && (
                                        <p className="mt-1 text-[13px] leading-[1.4] font-medium text-[#687182] break-words pr-1">{option.sublabel}</p>
                                    )}
                                </div>

                                {/* Selected Check */}
                                {selectedId === option.id && (
                                    <svg className="w-4 h-4 text-[#2563eb] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2.5 border-t border-[#e8ebf1] flex items-center justify-end text-sm font-medium text-[#4a5364]">
                    <span>ESC to close</span>
                </div>
            </div>
        </div>
    );
};
