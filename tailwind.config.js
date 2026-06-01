/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        medical: {
          green: '#39B54A',
          dark: '#383838',
          gray: '#8C8C90',
          light: '#D0D2D3',
          danger: '#EF4444',
          warning: '#F59E0B'
        }
      }
    }
  },
  plugins: [],
}