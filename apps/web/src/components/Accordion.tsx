'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

interface AccordionProps {
  eyebrow: string // e.g., "MODULE 1 · SOVEREIGNTY & FOUNDATION"
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

export function Accordion({ eyebrow, title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = title.replace(/\s+/g, '-').toLowerCase()
  return (
    <section className="border-hairline border-t">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`accordion-${id}`}
        className="flex w-full items-baseline justify-between py-5 text-left"
      >
        <div>
          <div className="label-caps mb-1 text-xs">{eyebrow}</div>
          <div className="font-display text-2xl">{title}</div>
        </div>
        <span className="font-mono text-xl">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={`accordion-${id}`} className="pb-6">
          {children}
        </div>
      )}
    </section>
  )
}
