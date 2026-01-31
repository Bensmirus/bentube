import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        "accent-foreground": "var(--accent-foreground)",
        // Warm cream color palette
        cream: {
          50: '#fefdfb',
          100: '#faf8f4',
          200: '#f5f0e8',
          300: '#ebe4d6',
          400: '#d9cdb8',
          500: '#c4b399',
          600: '#a89574',
          700: '#8b7759',
          800: '#6d5b43',
          900: '#4a3d2d',
        },
        warm: {
          50: '#fdfcfb',
          100: '#f8f6f3',
          200: '#f0ece5',
          300: '#e3dcd0',
          400: '#cfc3ae',
          500: '#b5a48a',
          600: '#968367',
          700: '#78654d',
          800: '#5a4a38',
          900: '#3d3226',
        },
        accent: {
          DEFAULT: '#c4956a',
          dark: '#a87b52',
          light: '#d4ad88',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    function ({ addUtilities }: any) {
      addUtilities({
        '.pb-safe': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
      })
    },
  ],
};
export default config;
