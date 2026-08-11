/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0d2340',
        navy: '#112e50',
        teal: '#19b6aa',
        'teal-dark': '#0c8e88',
        mist: '#f4f8f9',
        sand: '#fffaf2',
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 24px 70px rgba(13, 35, 64, 0.10)',
        card: '0 16px 38px rgba(13, 35, 64, 0.07)',
      },
    },
  },
  plugins: [],
}
