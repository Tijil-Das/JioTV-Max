import type { Config } from 'tailwindcss'

/**
 * Design tokens for the "Premium Cinema" language.
 * Keep every colour/spacing decision here so the UI stays consistent.
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#050507',
          raised: '#0B0B10',
          card: '#111118',
          elevated: '#17171F'
        },
        line: 'rgba(255,255,255,0.06)',
        text: {
          primary: '#F5F5F7',
          secondary: '#A1A1AA',
          muted: '#62626D'
        },
        accent: {
          DEFAULT: '#7C5CFF',
          glow: '#9D85FF',
          alt: '#22D3EE'
        },
        live: '#FF3B4E',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171'
      },
      borderRadius: {
        card: '16px',
        panel: '20px',
        pill: '999px'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(157,133,255,.5), 0 12px 40px -8px rgba(124,92,255,.55)',
        card: '0 10px 30px -12px rgba(0,0,0,.8)',
        glass: '0 8px 32px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)'
      },
      backgroundImage: {
        'hero-fade': 'linear-gradient(to top, #050507 0%, rgba(5,5,7,.75) 22%, transparent 70%)',
        'accent-gradient': 'linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)'
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'Inter', 'sans-serif']
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)'
      },
      keyframes: {
        livePulse: {
          '0%': { transform: 'scale(1)', opacity: '0.9' },
          '70%': { transform: 'scale(2.4)', opacity: '0' },
          '100%': { transform: 'scale(2.4)', opacity: '0' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        grainShift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(-2%, 1%)' },
          '50%': { transform: 'translate(1%, -2%)' },
          '75%': { transform: 'translate(2%, 2%)' }
        }
      },
      animation: {
        livePulse: 'livePulse 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        grain: 'grainShift 8s steps(4) infinite'
      }
    }
  },
  plugins: []
} satisfies Config
