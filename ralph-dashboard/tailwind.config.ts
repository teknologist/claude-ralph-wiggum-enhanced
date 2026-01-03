import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          coral: '#E07A5F',
          'coral-dark': '#DA7756',
          cream: '#FAF9F6',
          dark: '#1A1A1A',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
