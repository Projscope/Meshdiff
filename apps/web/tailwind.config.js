/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Brand re-theme (see MEMORY.md design-mockup note): a navy-tinted
        // neutral scale + blue accent, replacing the old Tailwind
        // neutral/emerald defaults everywhere those classes are used
        // (ink-* / accent-* were mechanically swapped in for neutral-* /
        // emerald-* across the app — see git history for the rename).
        //
        // `ink` is theme-reactive: each stop reads a CSS custom property
        // (defined in index.css) so the light/dark toggle can swap the
        // entire scale at once — no per-component dark:/light: classes
        // needed. `chrome` is a frozen copy of the scale's dark-mode
        // values, for the handful of spots (text on an accent-colored
        // button/badge, the embeddable badge mockups on EmbedBadgePage)
        // that must stay a fixed shade regardless of page theme.
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          950: "rgb(var(--ink-950) / <alpha-value>)",
        },
        chrome: {
          50: "#f5f7fb",
          100: "#e8ecf3",
          200: "#d1d8e4",
          300: "#aab5c8",
          400: "#7c879e",
          500: "#5a6478",
          600: "#444d5f",
          700: "#333b4a",
          800: "#262c38",
          900: "#1b1f27",
          950: "#15181e",
        },
        // Fixed, NOT theme-reactive — bg-accent-400/500 are the solid
        // button/badge fills paired with the permanently-dark `chrome-950`
        // text (see above), so they must stay this vivid in both themes or
        // that pairing loses contrast on hover.
        accent: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        // Theme-reactive counterpart, for accent used as foreground text
        // directly on the page/card background (text-accent-fg-400 etc.)
        // rather than as a button fill — accent-300/400 read fine as light
        // mint-green text on the dark theme's near-black background, but
        // are far too pale for AA contrast on the light theme's near-white
        // one. Only two stops exist since that covers every real text
        // usage (see index.css for the actual light/dark values).
        "accent-fg": {
          300: "rgb(var(--accent-fg-300) / <alpha-value>)",
          400: "rgb(var(--accent-fg-400) / <alpha-value>)",
        },
        // Same theme-reactive-text-color pattern as accent-fg, for amber
        // "warning" text (printability callouts, bounding-box deltas) —
        // Tailwind's stock amber-300/400 is used directly for solid
        // badge/button fills elsewhere (bg-amber-500 + fixed chrome-950
        // text) so that scale itself stays untouched; this is only for
        // amber used as plain text on the page/card background.
        "amber-fg": {
          300: "rgb(var(--amber-fg-300) / <alpha-value>)",
          400: "rgb(var(--amber-fg-400) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
