/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060A12',
          900: '#0C1220',
          850: '#11182B',
          800: '#18223C',
          750: '#1F2C4C',
          700: '#2A3B66',
          600: '#3D528A',
        },
        brand: {
          500: '#3B82F6',
          400: '#60A5FA',
          300: '#93C5FD',
        },
        cyan: {
          500: '#06B6D4',
          400: '#22D3EE',
          300: '#67E8F9',
        },
        status: {
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
          indigo: '#6366F1',
          purple: '#8B5CF6',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-brand': '0 0 20px -3px rgba(59, 130, 246, 0.3)',
        'glow-cyan': '0 0 20px -3px rgba(6, 182, 212, 0.3)',
        'glow-emerald': '0 0 20px -3px rgba(16, 185, 129, 0.25)',
      }
    },
  },
  plugins: [],
}
