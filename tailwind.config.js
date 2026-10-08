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
        accent: "#1a73e8",
        secure: "#1e8e3e",
        danger: "#d93025",
        warning: "#f9ab00"
      },
      boxShadow: {
        float: "0 4px 24px rgba(32, 33, 36, 0.16), 0 1px 3px rgba(32, 33, 36, 0.08)",
        soft: "0 1px 3px rgba(32, 33, 36, 0.1)"
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
