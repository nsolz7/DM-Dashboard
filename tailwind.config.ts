import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "crt-bg": "#0b1016",
        "crt-panel": "#16202c",
        "crt-panel-2": "#1f2a37",
        "crt-border": "#3e5268",
        "crt-accent": "#7ee787",
        "crt-warn": "#f7b955",
        "crt-danger": "#ff8d8d",
        "crt-text": "#edf6ff",
        "crt-muted": "#9db2c7"
      },
      boxShadow: {
        "pixel": "0 0 0 2px rgba(62,82,104,1), 6px 6px 0 0 rgba(11,16,22,0.8)"
      }
    }
  },
  plugins: []
};

export default config;
