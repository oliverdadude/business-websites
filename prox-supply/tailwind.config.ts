import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#08090b", 900: "#0d0f13", 850: "#111419", 800: "#161a20", 700: "#1e232b", 600: "#2a313b", 500: "#3a434f" },
        fog: { 100: "#eef0f3", 200: "#d5d9df", 300: "#aab1bc", 400: "#828b98", 500: "#5f6876" },
        brand: { 300: "#ffd58a", 400: "#ffc25c", 500: "#f5a524", 600: "#d48806", 700: "#9c6404" },
        ok: "#34d399",
        warn: "#fbbf24",
        bad: "#f87171",
        info: "#60a5fa",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { rise: "rise .35s ease-out both", pulseDot: "pulseDot 1.6s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
