/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "#C9A84C",
          light: "#E2C97E",
        },
        marble: "#F0EBE1",
        obsidian: {
          DEFAULT: "#07060E",
          secondary: "#0F0D1A",
        },
        avax: "#E84142",
      },
      fontFamily: {
        cinzel: ['"Cinzel"', "serif"],
        instrument: ['"Instrument Serif"', "serif"],
        sans: ["Inter", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        bounce_slow: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(8px)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        bounce_slow: "bounce_slow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
