import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefaf5',
          100: '#d5f2e6',
          200: '#ade4cf',
          300: '#7ccfb3',
          400: '#49b294',
          500: '#27947a',
          600: '#1a7762',
          700: '#166051',
          800: '#154c42',
          900: '#123f38',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
