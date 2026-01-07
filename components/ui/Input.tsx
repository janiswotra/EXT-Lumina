import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
    label?: string;
    error?: boolean;
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, startAdornment, endAdornment, ...props }, ref) => {
        return (
            <div className="flex flex-col gap-1 w-full">
                {label && (
                    <label className="text-xs font-medium text-[#A2A4A7] tracking-[-0.02em] ml-0.5">
                        {label}
                    </label>
                )}
                <div
                    className={cn(
                        "relative flex items-center gap-1.5 w-full",
                        "bg-transparent rounded-lg h-[32px]",
                        "shadow-[inset_0px_0px_0px_1px_#27282B]",
                        "transition-shadow duration-140",
                        "hover:shadow-[inset_0px_0px_0px_1px_#2F3033]",
                        "focus-within:shadow-[inset_0px_0px_0px_1px_#864AFF]",
                        error && "shadow-[inset_0px_0px_0px_1px_rgb(105,38,35)]",
                        startAdornment && "pl-2",
                        endAdornment && "pr-2"
                    )}
                >
                    {startAdornment && (
                        <span className="flex-shrink-0 text-[#A2A4A7]">
                            {startAdornment}
                        </span>
                    )}
                    <input
                        ref={ref}
                        className={cn(
                            "flex-1 w-full h-full bg-transparent",
                            "text-sm font-medium tracking-[-0.02em] text-[#EEEFF1]",
                            "placeholder:text-[rgba(255,255,255,0.29)]",
                            "px-2.5 outline-none border-none",
                            className
                        )}
                        {...props}
                    />
                    {endAdornment && (
                        <span className="flex-shrink-0 text-[#A2A4A7]">
                            {endAdornment}
                        </span>
                    )}
                </div>
            </div>
        );
    }
);
Input.displayName = "Input";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
    ({ className, label, error, ...props }, ref) => {
        return (
            <div className="flex flex-col gap-1 w-full">
                {label && (
                    <label className="text-xs font-medium text-[#A2A4A7] tracking-[-0.02em] ml-0.5">
                        {label}
                    </label>
                )}
                <div
                    className={cn(
                        "relative w-full",
                        "bg-transparent rounded-lg",
                        "shadow-[inset_0px_0px_0px_1px_#27282B]",
                        "transition-shadow duration-140",
                        "hover:shadow-[inset_0px_0px_0px_1px_#2F3033]",
                        "focus-within:shadow-[inset_0px_0px_0px_1px_#864AFF]",
                        error && "shadow-[inset_0px_0px_0px_1px_rgb(105,38,35)]"
                    )}
                >
                    <textarea
                        ref={ref}
                        className={cn(
                            "w-full bg-transparent resize-none",
                            "text-sm font-medium tracking-[-0.02em] text-[#EEEFF1]",
                            "placeholder:text-[rgba(255,255,255,0.29)]",
                            "px-2.5 py-2 outline-none border-none leading-relaxed",
                            className
                        )}
                        {...props}
                    />
                </div>
            </div>
        );
    }
);
TextArea.displayName = "TextArea";
