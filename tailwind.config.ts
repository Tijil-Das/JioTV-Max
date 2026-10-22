import type { Config } from 'tailwindcss'

/**
 * Design tokens — "StreamDeck TV" black screening room.
 * Background is true black. Brand accent is a single red.
 * Everything else is neutral gray.
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#000000',
          s1:       '#0A0A0B',
          s2:       '#111113',
          s3:       '#18181B'
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          strong:  'rgba(255,255,255,0.14)'
        },
        text: {
          1: '#F4F4F5',
          2: '#A1A1A6',
          3: '#66666C',
          // backward-compat aliases
          primary:   '#F4F4F5',
          secondary: '#A1A1A6',
          muted:     '#66666C'
        },
        red: {
          DEFAULT: '#E11D2E',
          hover:   '#EF3340',
          press:   '#B8121F',
          tint:    'rgba(225,29,46,0.12)',
          line:    'rgba(225,29,46,0.55)'
        },
        // keep these aliases so we don't break imports
        accent: {
          DEFAULT: '#E11D2E',
          glow:    '#EF3340',
          alt:     '#E11D2E'
        },
        live:    '#E11D2E',
        success: '#4ADE80',
        warning: '#FBBF24',
        danger:  '#F87171'
      },
      borderRadius: {
        sm:    '8px',
        card:  '12px',
        panel: '16px',
        pill:  '999px'
      },
      boxShadow: {
        // single canonical shadow — depth from layered near-black surfaces
        card:   '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.9)',
        glass:  '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.9)',
        glow:   'none'
      },
      backgroundImage: {
        // hero bottom scrim
        'hero-fade': 'linear-gradient(to top, #000000 0%, rgba(0,0,0,0.6) 30%, transparent 70%)',
        // NO gradient on buttons or accents — solid red only
        'accent-gradient': 'none'
      },
      fontFamily: {
        sans:    ['"Inter Variable"', 'Inter', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Variable"', 'Inter', 'Segoe UI', 'sans-serif']
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)'
      },
      keyframes: {
        livePulse: {
          '0%':   { transform: 'scale(1)',   opacity: '0.9' },
          '70%':  { transform: 'scale(2.4)', opacity: '0' },
          '100%': { transform: 'scale(2.4)', opacity: '0' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        livePulse: 'livePulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        shimmer:   'shimmer 1.4s linear infinite'
      }
    }
  },
  plugins: []
} satisfies Config
