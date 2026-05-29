/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // Komon Lab palette: muted indigo + warm ivory + sumi
        ink: {
          50: '#f6f5f1',
          100: '#ecebe2',
          200: '#d8d5c5',
          300: '#b8b2a0',
          400: '#8a836e',
          500: '#5e5848',
          600: '#3f3a30',
          700: '#2a2620',
          800: '#1a1814',
          900: '#0e0d0a',
        },
        indigo: {
          // Aizome-inspired
          50: '#f1f3f7',
          100: '#dde2ec',
          200: '#b6c0d4',
          300: '#869aba',
          400: '#5b7299',
          500: '#3f5680',
          600: '#314466',
          700: '#26344e',
          800: '#1c2738',
          900: '#131a26',
        },
        ivory: '#faf7f0',
        sumi: '#1a1814',
        accent: '#a64f43', // bengara red, used sparingly
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: {
        prose: '68ch',
        readable: '72ch',
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme('colors.ink.700'),
            a: { color: theme('colors.indigo.600') },
            'h1, h2, h3, h4': { color: theme('colors.sumi'), fontFamily: theme('fontFamily.serif').join(', ') },
          },
        },
      }),
    },
  },
  plugins: [],
};
