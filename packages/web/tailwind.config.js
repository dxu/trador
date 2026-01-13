/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: {
          50: '#f0f4ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#0c0a20',
        },
        volt: {
          400: '#a3e635',
          500: '#84cc16',
        },
        ember: {
          400: '#fb923c',
          500: '#f97316',
        },
      },
      fontFamily: {
        'display': ['Clash Display', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgb(163 230 53 / 0.4), 0 0 20px rgb(163 230 53 / 0.2)' },
          '100%': { boxShadow: '0 0 10px rgb(163 230 53 / 0.6), 0 0 40px rgb(163 230 53 / 0.3)' },
        },
      },
    },
  },
  plugins: [],
}
