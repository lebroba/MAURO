import type { Metadata } from 'next'
import { Fraunces, Source_Serif_4, JetBrains_Mono, Inter_Tight } from 'next/font/google'
import './globals.css'

// MAURO typography stack — see DESIGN.md.
// Variable axes: Fraunces exposes optical-sizing so a single file does both
// hero display (opsz 144) and section-title (opsz 60) duty.

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MAURO',
  description: 'A worldbuilding workspace for tabletop GMs and worldbuilding novelists.',
}

const fontVars = `${fraunces.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${interTight.variable}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" className={fontVars}>
      {/* suppressHydrationWarning — browser extensions (Grammarly, Titans Quick
          View, color pickers, etc.) commonly inject data-* attrs on <body>
          after page load. Without this, React warns on every page. The
          suppression is scoped to <body> only; child components still get
          full hydration validation. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
