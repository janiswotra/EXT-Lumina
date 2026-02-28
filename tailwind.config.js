/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Attio Deep Space Palette
        attio: {
          bg: {
            base: '#09090b',       // Absolute darkest
            surface: '#1A1D21',    // Card/elevated surfaces
            elevated: '#1F2125',   // Dropdowns/popovers
            hover: '#27282B',      // Hover states
            active: '#27282B',     // Active states
          },
          text: {
            primary: '#EEEFF1',    // Primary text
            secondary: '#A2A4A7',  // Muted text
            tertiary: 'rgba(255, 255, 255, 0.55)', // Subtle text
            quaternary: 'rgba(255, 255, 255, 0.29)', // Placeholder
          },
          border: {
            default: '#2F3033',    // Default borders
            hover: '#46474A',      // Hover borders
            subtle: '#27282B',     // Subtle borders
          },
          accent: {
            DEFAULT: '#864AFF',    // Primary purple
            hover: '#9B69FF',      // Purple hover
            muted: '#B28CFF',      // Muted purple
            glow: 'rgba(134, 74, 255, 0.32)', // Glow effect
          },
          // Status colors
          success: {
            DEFAULT: '#02AD6E',
            bg: 'rgb(29, 64, 52)',
            border: 'rgb(36, 74, 58)',
            text: '#A7F2CF',
          },
          warning: {
            DEFAULT: '#FFD269',
            bg: 'rgb(58, 45, 18)',
            border: 'rgb(82, 56, 23)',
            text: '#FFD269',
          },
          error: {
            DEFAULT: '#ED3B3B',
            hover: '#FF5454',
            bg: 'rgb(105, 38, 35)',
          },
          blue: {
            DEFAULT: '#266DF0',
            bg: 'rgb(29, 46, 85)',
            border: 'rgb(43, 62, 109)',
            text: '#C2D6FF',
          },
          pink: {
            bg: 'rgb(78, 27, 48)',
            border: 'rgb(100, 38, 64)',
            text: '#FFBFDA',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        'attio': '-0.02em',
      },
      boxShadow: {
        // Attio button shadows
        'attio-btn': 'inset 0px 0px 0px 1px #2F3033, 0px 0px 2px 0px rgb(0, 0, 0), 0px 1px 3px 0px rgba(0, 0, 0, 0.08)',
        'attio-btn-accent': 'inset 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 2px 4px -2px rgba(134, 74, 255, 0.12), 0px 3px 6px -2px rgba(134, 74, 255, 0.08)',
        'attio-btn-error': 'inset 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 2px 4px -2px rgba(105, 38, 35, 0.12), 0px 3px 6px -2px rgba(105, 38, 35, 0.08)',
        // Attio popup/card shadows
        'attio-popup': 'rgb(47, 48, 51) 0px 0px 0px 1px inset, rgba(0, 0, 0, 0.16) 0px 0px 0px 1px, rgba(0, 0, 0, 0.48) 0px 4px 8px -4px, rgba(0, 0, 0, 0.64) 0px 4px 12px -2px',
        'attio-tooltip': 'rgb(47, 48, 51) 0px 0px 0px 1px inset, rgb(0, 0, 0) 0px 0px 2px 0px, rgba(0, 0, 0, 0.08) 0px 1px 3px 0px',
        // Inset border effect
        'attio-inset': 'inset 0px 0px 0px 1px #2F3033',
        'attio-inset-hover': 'inset 0px 0px 0px 1px #46474A',
        'attio-inset-focus': 'inset 0px 0px 0px 1px #864AFF',
      },
      borderRadius: {
        'attio-sm': '6px',
        'attio': '8px',
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
        'shimmer': 'shimmer 1.5s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '100% 0' },
          '100%': { backgroundPosition: '-100% 0' },
        },
      },
      transitionDuration: {
        '80': '80ms',
        '140': '140ms',
      },
      transitionTimingFunction: {
        'attio': 'cubic-bezier(0.7, 0, 0.39, 0.98)',
      },
    },
  },
  plugins: [],
}