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
    "focus:outline-none focus-visible:outline focus-visible:outline-[#ff6a26] focus-visible:outline-1 focus-visible:outline-offset-1",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    "active:scale-[0.98]",
    "shrink-0"
  );

  const variants = {
    primary: cn(
      "bg-[#ff6a26] text-white",
      "shadow-[0px_1px_3px_rgba(255,106,38,0.2),0px_1px_2px_rgba(0,0,0,0.05)]",
      "hover:bg-[#e85814]"
    ),
    secondary: cn(
      "bg-white text-[#181c25]",
      "shadow-[0px_1px_2px_rgba(0,0,0,0.05),inset_0px_0px_0px_1px_#dde1e8]",
      "hover:bg-[#f5f7fa]"
    ),
    ghost: cn(
      "bg-transparent text-[#4a5364]",
      "hover:bg-black/[0.04] hover:text-[#181c25]"
    ),
    danger: cn(
      "bg-[#dc2626] text-white",
      "shadow-[0px_1px_3px_rgba(220,38,38,0.15),0px_1px_2px_rgba(0,0,0,0.05)]",
      "hover:bg-[#ef4444]"
    ),
  };

  const sizes = {
    xs: "px-2 py-0.5 text-sm rounded-md h-[22px]",
    sm: "px-3 py-1 text-sm rounded-lg h-[30px]",
    md: "px-3 py-1.5 text-base rounded-lg h-[36px]",
    lg: "px-4 py-2 text-base rounded-[9px] h-[40px]",
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
