/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Source Sans 3', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      colors: {
        // Warm Neutrals
        ivory: '#fafaf8',
        cream: '#f5f4f1',
        sand: '#e8e6e1',
        stone: '#d4d2cd',
        ash: '#9a9890',
        slate: '#6b6962',
        charcoal: '#3d3b36',
        ink: '#1a1917',
        
        // Navy (Primary)
        navy: {
          50: '#f4f6f9',
          100: '#e8ebf0',
          200: '#c9d0dc',
          300: '#9aa7bb',
          400: '#6b7c96',
          500: '#4a5d78',
          600: '#3a4a62',
          700: '#2f3c50',
          800: '#283242',
          900: '#1e2532',
          950: '#141821',
        },
        
        // Gold (Accent - Subtle)
        gold: {
          50: '#fdfcf9',
          100: '#f9f6ef',
          200: '#f0e9d8',
          300: '#e4d7bb',
          400: '#d4c09a',
          500: '#b8a070',
          600: '#9a8357',
          700: '#7d6a47',
          800: '#66563c',
          900: '#544834',
        },
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'sm': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
      },
      fontSize: {
        'base': ['1rem', { lineHeight: '1.6' }],
        'lg': ['1.125rem', { lineHeight: '1.5' }],
        'xl': ['1.25rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.35' }],
        '3xl': ['1.875rem', { lineHeight: '1.25' }],
        '4xl': ['2.25rem', { lineHeight: '1.2' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
    },
  },
  plugins: [],
};
