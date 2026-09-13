/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#06132E",
          900: "#0B2457", // NAVY2 — deep gradient stop
          800: "#123B82", // NAVY — primary
          700: "#1C4FA3", // NAVY_LIGHT
          600: "#5679C4", // NAVY_ACCENT
          100: "#CEDAF0",
          50: "#E8EEF8",  // NAVY_SOFT
        },
        gold: {
          400: "#FFC857",
          500: "#FFB020",
          600: "#F59300",
          50: "#FFF3DC",
        },
        teal: {
          500: "#14B8A6",
          50: "#E6FBF8",
        },
        ink: "#101828",
        muted: "#475569",
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"],
      },
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #123B82 0%, #0B2457 100%)",
        "gold-gradient": "linear-gradient(135deg, #FFC857 0%, #F59300 100%)",
      },
      boxShadow: {
        soft: "0 2px 15px -3px rgba(16, 24, 40, 0.05), 0 4px 6px -2px rgba(16, 24, 40, 0.03)",
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -8px rgba(16, 24, 40, 0.10)",
        glow: "0 0 24px -4px rgba(255, 176, 32, 0.4)",
        "blue-glow": "0 8px 24px -6px rgba(18, 59, 130, 0.35)",
        "focus-ring": "0 0 0 4px rgba(18, 59, 130, 0.12)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "toast-in": "toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
