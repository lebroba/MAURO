import type { Config } from 'tailwindcss'

// MAURO design system — see DESIGN.md.
// Cartographic Intelligence aesthetic. Two serifs (Fraunces + Source Serif 4),
// one grotesque (Inter Tight), one mono (JetBrains Mono). Warm-paper neutrals
// + two restrained accents (stamp red, verdigris).

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Both `class="dark"` and `data-theme="dark"` flip the theme; we use the
  // attribute approach so the toggle is settable via plain HTML/JS without
  // touching className.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // CSS-variable-backed so light/dark switching is instant via [data-theme].
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        hairline: 'var(--color-hairline)',
        stamp: 'var(--color-stamp)',
        verdigris: 'var(--color-verdigris)',
      },
      fontFamily: {
        // Variables injected by next/font/google in app/layout.tsx.
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        serif: ['var(--font-source-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        sans: ['var(--font-inter-tight)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.045em',
        tighter: '-0.025em',
      },
      // DESIGN.md: 2px max border-radius except scrubber pins (use rounded-full).
      // We don't override the default scale — code review enforces no >2px usage.
    },
  },
  plugins: [],
}

export default config
