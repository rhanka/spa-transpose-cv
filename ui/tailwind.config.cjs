/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'scalian-dark': '#1D1148',
        'scalian-purple': '#4B2882',
        'scalian-purple-light': '#635A84',
        'scalian-purple-border': '#E9E4F8',
        'scalian-purple-bg': '#F2F3FE',
        'scalian-green': '#60BB9B',
        'scalian-green-hover': '#6DD4AF',
        'scalian-gradient-start': '#E4005B',
        'scalian-gradient-end': '#61BA9A',
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'scalian': '0 20px 40px 0 rgba(29, 17, 72, 0.1)',
      },
    },
  },
  plugins: [require('autoprefixer')],
};
