import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#1a0d20",
          card: "#2a1a35",
          deep: "#13081a",
        },
        accent: {
          pink: "#ff4d8d",
          orange: "#ff8c42",
          green: "#2dbd5f",
          green2: "#1a9248",
          purple: "#7d4eff",
          blue: "#4ea1ff",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-party": "linear-gradient(135deg, #ff4d8d 0%, #ff8c42 100%)",
        "gradient-done": "linear-gradient(135deg, #2dbd5f 0%, #1a9248 100%)",
        "gradient-cool": "linear-gradient(135deg, #7d4eff 0%, #4ea1ff 100%)",
      },
      borderRadius: {
        xl2: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
