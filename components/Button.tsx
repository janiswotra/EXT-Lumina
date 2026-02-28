import React from 'react';
import { cn } from '../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  isLoading,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = cn(
    "inline-flex items-center justify-center gap-1.5",
    "font-medium tracking-[-0.02em]",
    "transition-all duration-200",
    "focus:outline-none focus-visible:outline focus-visible:outline-[#864AFF] focus-visible:outline-1 focus-visible:outline-offset-1",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "active:scale-[0.98]",
    "shrink-0"
  );

  const variants = {
    primary: cn(
      "bg-[#864AFF] text-white",
      "shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.1),0px_2px_4px_-2px_rgba(134,74,255,0.12),0px_3px_6px_-2px_rgba(134,74,255,0.08)]",
      "hover:bg-[#9B69FF]"
    ),
    secondary: cn(
      "bg-[#1A1D21] text-[#EEEFF1]",
      "shadow-[inset_0px_0px_0px_1px_#2F3033,0px_0px_2px_0px_rgb(0,0,0),0px_1px_3px_0px_rgba(0,0,0,0.08)]",
      "hover:bg-[#27282B]"
    ),
    ghost: cn(
      "bg-transparent text-[#A2A4A7]",
      "hover:bg-white/5 hover:text-[#EEEFF1]"
    ),
    danger: cn(
      "bg-[#ED3B3B] text-white",
      "shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.1),0px_2px_4px_-2px_rgba(105,38,35,0.12),0px_3px_6px_-2px_rgba(105,38,35,0.08)]",
      "hover:bg-[#FF5454]"
    ),
  };

  const sizes = {
    xs: "px-2 py-0.5 text-xs rounded-md h-[20px]",
    sm: "px-3 py-1 text-xs rounded-lg h-[28px]",
    md: "px-3 py-1.5 text-sm rounded-lg h-[32px]",
    lg: "px-4 py-2 text-sm rounded-[9px] h-[36px]",
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};
