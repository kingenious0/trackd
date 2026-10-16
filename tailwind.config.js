/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--c-app) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        accent: "#00F29D",
        "accent-dark": "#00C888",
        "brand-dark": "#070B14",
        "brand-panel": "#0D1322",
        "brand-card": "#111827",
        secure: "#00F29D",
        danger: "#EF4444",
        warning: "#F59E0B"
      },
      boxShadow: {
        float: "0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)",
        soft: "0 1px 3px rgba(0, 0, 0, 0.3)",
        "glow-mint": "0 0 25px rgba(0, 242, 157, 0.35)",
        "glow-mint-sm": "0 0 12px rgba(0, 242, 157, 0.25)"
      },
      fontFamily: {
        sans: [
          "Google Sans",
          "Product Sans",
          "Inter",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};
