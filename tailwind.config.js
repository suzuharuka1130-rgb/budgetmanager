/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // 既存のカスタムCSSを尊重するため preflight（リセット）は無効化
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#166534', dark: '#0f4d28' },
      },
    },
  },
  plugins: [],
}
