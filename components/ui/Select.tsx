import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string; label: string }[];
    placeholder?: string;
}

// Helper to truncate long labels
const truncateLabel = (label: string, maxLength: number = 40): string => {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
};

export const Select: React.FC<SelectProps> = ({
    label,
    options,
    placeholder = 'Select...',
    className,
    disabled,
    ...props
}) => {
    return (
        <div className="flex flex-col gap-1 w-full">
            {label && (
                <label className="text-xs font-medium text-[#A2A4A7] tracking-[-0.02em] ml-0.5">
                    {label}
                </label>
            )}
            <div className="relative w-full">
                <select
                    className={cn(
                        "w-full h-[32px] px-2.5 pr-8 bg-transparent",
                        "text-sm font-medium tracking-[-0.02em] text-[#EEEFF1]",
                        "rounded-lg appearance-none cursor-pointer",
                        "shadow-[inset_0px_0px_0px_1px_#27282B]",
                        "transition-all duration-140",
                        "hover:shadow-[inset_0px_0px_0px_1px_#2F3033]",
                        "focus:shadow-[inset_0px_0px_0px_1px_#864AFF] focus:outline-none",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        className
                    )}
                    disabled={disabled}
                    {...props}
                >
                    <option value="" className="bg-[#1A1D21] text-[#A2A4A7]">
                        {placeholder}
                    </option>
                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            className="bg-[#1A1D21] text-[#EEEFF1]"
                            title={option.label}
                        >
                            {truncateLabel(option.label, 45)}
                        </option>
                    ))}
                </select>
                {/* Chevron Icon */}
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg
                        className="w-4 h-4 text-[#A2A4A7]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </div>
        </div>
    );
};
