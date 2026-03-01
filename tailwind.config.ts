import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-soft": "var(--color-primary-soft)",
        accent: "var(--color-accent)",
        borderparty: "var(--color-border)",
        backgroundparty: "var(--color-party-bg)",
      },
    },
  },
  plugins: [],
};

export default config;