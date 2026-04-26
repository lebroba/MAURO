import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MAURO',
  description: 'Map Authoring & Universe Reality Orchestrator',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
