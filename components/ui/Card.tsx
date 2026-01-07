import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'surface' | 'elevated' | 'ghost';
    interactive?: boolean;
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
    className,
    variant = 'surface',
    interactive = false,
    children,
    ...props
}) => {
    const baseStyles = cn(
        "rounded-xl transition-all duration-140 relative overflow-hidden"
    );

    const variants = {
        surface: cn(
            "bg-[#1A1D21]",
            "shadow-[inset_0px_0px_0px_1px_#2F3033]"
        ),
        elevated: cn(
            "bg-[#1F2125]",
            "shadow-[rgb(47,48,51)_0px_0px_0px_1px_inset,rgba(0,0,0,0.16)_0px_0px_0px_1px,rgba(0,0,0,0.48)_0px_4px_8px_-4px,rgba(0,0,0,0.64)_0px_4px_12px_-2px]"
        ),
        ghost: cn(
            "bg-transparent"
        ),
    };

    const interactiveStyles = interactive ? cn(
        "cursor-pointer",
        "hover:bg-[#27282B]",
        "hover:shadow-[inset_0px_0px_0px_1px_#46474A]",
        "focus-visible:shadow-[inset_0px_0px_0px_1px_#864AFF] focus-visible:outline-none"
    ) : "";

    return (
        <div
            className={cn(baseStyles, variants[variant], interactiveStyles, className)}
            {...props}
        >
            {children}
        </div>
    );
};
