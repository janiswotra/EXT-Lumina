import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, ...props }, ref) => {
        return (
            <div className="space-y-1.5 w-full">
                {label && (
                    <label className="text-[11px] font-medium text-foreground-muted uppercase tracking-wider pl-1">
                        {label}
                    </label>
                )}
                <div className="relative group">
                    <input
                        ref={ref}
                        className={cn(
                            "w-full bg-bg-elevated border border-white/10 rounded-lg",
                            "text-sm text-foreground placeholder:text-foreground-subtle",
                            "px-3 py-2.5 outline-none transition-all duration-200",
                            "focus:border-accent/50 focus:ring-2 focus:ring-accent/20",
                            "group-hover:border-white/20",
                            className
                        )}
                        {...props}
                    />
                </div>
            </div>
        );
    }
);
Input.displayName = "Input";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
    ({ className, label, ...props }, ref) => {
        return (
            <div className="space-y-1.5 w-full">
                {label && (
                    <label className="text-[11px] font-medium text-foreground-muted uppercase tracking-wider pl-1">
                        {label}
                    </label>
                )}
                <div className="relative group">
                    <textarea
                        ref={ref}
                        className={cn(
                            "w-full bg-bg-elevated border border-white/10 rounded-lg",
                            "text-sm text-foreground placeholder:text-foreground-subtle",
                            "px-3 py-2.5 outline-none transition-all duration-200 resize-none leading-relaxed",
                            "focus:border-accent/50 focus:ring-2 focus:ring-accent/20",
                            "group-hover:border-white/20",
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
