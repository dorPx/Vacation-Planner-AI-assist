import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          50: '#f0f9ff',
          100: '#B5D4F4',
          200: '#85B7EB',
          300: '#378ADD',
          400: '#185FA5',
          500: '#0C447C',
        },
        beige: {
          50: '#FDFAF5',
          100: '#F5F0E8',
          200: '#EDE5D5',
          300: '#D9CDB8',
        },
        brand: {
          black: '#1A1A1A',
          dark: '#2C2C2A',
          mid: '#5F5E5A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
