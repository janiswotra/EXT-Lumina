/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Yena Light Palette
        attio: {
          bg: {
            base: '#f7f8fa',
            surface: '#ffffff',
            elevated: '#fafbfc',
            hover: '#f5f7fa',
            active: '#f5f7fa',
          },
          text: {
            primary: '#181c25',
            secondary: '#4a5364',
            tertiary: '#687182',
            quaternary: '#7e8799',
          },
          border: {
            default: '#dde1e8',
            hover: '#c5cad4',
            subtle: '#e8ebf1',
          },
          accent: {
            DEFAULT: '#ff6a26',
            hover: '#e85814',
            muted: '#ff9a6c',
            glow: 'rgba(255, 106, 38, 0.2)',
          },
          success: { DEFAULT: '#059669', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
          warning: { DEFAULT: '#d97706', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
          error: { DEFAULT: '#dc2626', hover: '#ef4444', bg: '#fef2f2' },
          blue: { DEFAULT: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
          pink: { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        attio: '-0.02em',
      },
      boxShadow: {
        'attio-btn': '0px 1px 2px rgba(0, 0, 0, 0.05), inset 0px 0px 0px 1px #dde1e8',
        'attio-btn-accent': '0px 1px 3px rgba(37, 99, 235, 0.15), 0px 1px 2px rgba(0, 0, 0, 0.05)',
        'attio-btn-error': '0px 1px 3px rgba(220, 38, 38, 0.15), 0px 1px 2px rgba(0, 0, 0, 0.05)',
        'attio-popup':
          '0px 0px 0px 1px #dde1e8, 0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'attio-tooltip': '0px 0px 0px 1px #dde1e8, 0px 1px 3px rgba(0, 0, 0, 0.1)',
        'attio-inset': 'inset 0px 0px 0px 1px #dde1e8',
        'attio-inset-hover': 'inset 0px 0px 0px 1px #c5cad4',
        'attio-inset-focus': 'inset 0px 0px 0px 1px #ff6a26',
      },
      borderRadius: {
        'attio-sm': '6px',
        attio: '8px',
        'attio-md': '9px',
        'attio-lg': '12px',
        'attio-xl': '16px',
      },
      animation: {
        'fade-in': 'fadeIn 80ms ease forwards',
        'fade-out': 'fadeOut 80ms ease forwards',
        'slide-up': 'slideUp 80ms ease forwards',
        'slide-down': 'slideDown 80ms ease forwards',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.5s ease infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeOut: { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '100% 0' }, '100%': { backgroundPosition: '-100% 0' } },
      },
      transitionDuration: {
        '80': '80ms',
        '140': '140ms',
      },
      transitionTimingFunction: {
        attio: 'cubic-bezier(0.7, 0, 0.39, 0.98)',
      },
    },
  },
  plugins: [],
};
