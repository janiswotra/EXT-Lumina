import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'glass' | 'ghost';
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
    className,
    variant = 'default',
    children,
    ...props
}) => {
    const baseStyles = "rounded-2xl transition-all duration-300 relative overflow-hidden group";

    const variants = {
        default: "bg-surface hover:bg-surface-hover border border-border-subtle hover:border-border-hover shadow-card hover:shadow-card-hover hover:-translate-y-[2px]",
        glass: "bg-bg-elevated/80 backdrop-blur-md border border-white/5 shadow-card hover:border-white/10",
        ghost: "bg-transparent hover:bg-white/[0.02]",
    };

    return (
        <div
            className={cn(baseStyles, variants[variant], className)}
            {...props}
        >
            {/* Optional Top Edge Highlight for depth */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />

            {children}
        </div>
    );
};
