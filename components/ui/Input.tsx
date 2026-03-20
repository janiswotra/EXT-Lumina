import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
    label?: string;
    error?: boolean;
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
}

let inputIdCounter = 0;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, startAdornment, endAdornment, id, ...props }, ref) => {
        const inputId = React.useMemo(() => id || `yena-input-${++inputIdCounter}`, [id]);
        return (
            <div className="flex flex-col gap-1 w-full">
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-[#4a5364] tracking-[-0.02em] ml-0.5">
                        {label}
                    </label>
                )}
                <div
                    className={cn(
                        "relative flex items-center gap-1.5 w-full",
                        "bg-white rounded-lg h-[36px]",
                        "shadow-[inset_0px_0px_0px_1px_#dde1e8]",
                        "transition-shadow duration-140",
                        "hover:shadow-[inset_0px_0px_0px_1px_#c5cad4]",
                        "focus-within:shadow-[inset_0px_0px_0px_1px_#2563eb]",
                        error && "shadow-[inset_0px_0px_0px_1px_#dc2626]",
                        startAdornment && "pl-2",
                        endAdornment && "pr-2"
                    )}
                >
                    {startAdornment && (
                        <span className="flex-shrink-0 text-[#4a5364]">
                            {startAdornment}
                        </span>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        aria-invalid={error || undefined}
                        className={cn(
                            "flex-1 w-full h-full bg-transparent",
                            "text-base font-medium tracking-[-0.02em] text-[#181c25]",
                            "placeholder:text-[#7e8799]",
                            "px-2.5 outline-none border-none",
                            className
                        )}
                        {...props}
                    />
                    {endAdornment && (
                        <span className="flex-shrink-0 text-[#4a5364]">
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
    ({ className, label, error, id, ...props }, ref) => {
        const textareaId = React.useMemo(() => id || `yena-textarea-${++inputIdCounter}`, [id]);
        return (
            <div className="flex flex-col gap-1 w-full">
                {label && (
                    <label htmlFor={textareaId} className="text-sm font-medium text-[#4a5364] tracking-[-0.02em] ml-0.5">
                        {label}
                    </label>
                )}
                <div
                    className={cn(
                        "relative w-full",
                        "bg-white rounded-lg",
                        "shadow-[inset_0px_0px_0px_1px_#dde1e8]",
                        "transition-shadow duration-140",
                        "hover:shadow-[inset_0px_0px_0px_1px_#c5cad4]",
                        "focus-within:shadow-[inset_0px_0px_0px_1px_#2563eb]",
                        error && "shadow-[inset_0px_0px_0px_1px_#dc2626]"
                    )}
                >
                    <textarea
                        ref={ref}
                        id={textareaId}
                        aria-invalid={error || undefined}
                        className={cn(
                            "w-full bg-transparent resize-none",
                            "text-base font-medium tracking-[-0.02em] text-[#181c25]",
                            "placeholder:text-[#7e8799]",
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
