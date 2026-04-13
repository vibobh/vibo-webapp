/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        vibo: {
          primary: "#4b0415",
          "primary-light": "#6b1a30",
          "primary-dark": "#2a0210",
          cream: "#f7f0e6",
          mint: "#e8f5f0",
          rose: "#fdf2f4",
          gold: "#c4a87c",
        },
      },
      fontFamily: {
        en: ["var(--font-en)", "system-ui", "-apple-system", "sans-serif"],
        /** IBM Plex Sans Arabic — loaded via next/font in layout (`--font-arabic`) */
        ar: [
          "var(--font-arabic)",
          '"IBM Plex Sans Arabic"',
          "Tahoma",
          "sans-serif",
        ],
      },
      keyframes: {
        "marquee-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-right": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "float-medium": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-18px)" },
        },
        "float-fast": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        /** Auth showcase: seamless vertical loops (duplicate content = 2× height) */
        "showcase-scroll-up": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        "showcase-scroll-down": {
          "0%": { transform: "translateY(-50%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        "marquee-left": "marquee-left 40s linear infinite",
        "marquee-right": "marquee-right 40s linear infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
        "float-medium": "float-medium 5s ease-in-out infinite",
        "float-fast": "float-fast 4s ease-in-out infinite",
        "showcase-scroll-up": "showcase-scroll-up 55s linear infinite",
        "showcase-scroll-down": "showcase-scroll-down 55s linear infinite",
      },
    },
  },
  plugins: [],
};
