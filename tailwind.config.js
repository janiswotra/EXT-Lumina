/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Space Palette
        bg: {
          deep: '#020203',    // Absolute darkest
          base: '#050506',    // Primary canvas
          elevated: '#0a0a0c', // Cards/Modals
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.05)',
          hover: 'rgba(255,255,255,0.08)',
        },
        border: {
          subtle: 'rgba(255,255,255,0.06)',
          hover: 'rgba(255,255,255,0.10)',
          accent: 'rgba(94,106,210,0.30)',
        },
        foreground: {
          DEFAULT: '#EDEDEF',
          muted: '#8A8F98',
          subtle: 'rgba(255,255,255,0.60)',
        },
        accent: {
          DEFAULT: '#5E6AD2',
          bright: '#6872D9',
          glow: 'rgba(94,106,210,0.3)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 0 1px rgba(94,106,210,0.5), 0 4px 12px rgba(94,106,210,0.3), inset 0 1px 0 0 rgba(255,255,255,0.2)',
        'card': '0 0 0 1px rgba(255,255,255,0.06), 0 2px 20px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.2)',
        'card-hover': '0 0 0 1px rgba(255,255,255,0.1), 0 8px 40px rgba(0,0,0,0.5), 0 0 80px rgba(94,106,210,0.1)',
        'inner-light': 'inset 0 1px 0 0 rgba(255,255,255,0.1)',
      },
      animation: {
        'float': 'float 10s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-20px) rotate(1deg)' },
        }
      }
    },
  },
  plugins: [],
}