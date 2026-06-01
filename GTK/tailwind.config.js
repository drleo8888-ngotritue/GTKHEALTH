/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bộ màu Goertek Brand Identity
        goertek: {
          green: '#39B54A',    // Màu xanh logo chủ đạo (Intense Green)
          dark: '#54585A',     // Màu chữ đậm / Tiêu đề (Dark Gray)
          gray: '#808285',     // Màu chữ phụ (Medium Gray)
          light: '#F3F4F6',    // Màu nền App (Background)
          accent: '#00A651'    // Màu xanh đậm hơn chút cho hover
        },
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'], // Font chuẩn doanh nghiệp
      }
    },
  },
  plugins: [],
}