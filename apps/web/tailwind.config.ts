import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#7C3AED",
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          300: "#C4B5FD",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          800: "#5B21B6",
          900: "#4C1D95",
        },
        graphite: {
          900: "#1E1B2E",
          800: "#241F3B",
          700: "#2E2748",
        },
        surface: {
          DEFAULT: "#FAFAFA",
          dark: "#121017",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)",
        "sidebar-gradient": "linear-gradient(180deg, #241F3B 0%, #1E1B2E 100%)",
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
