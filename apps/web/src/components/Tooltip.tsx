'use client'

import { useEffect } from 'react'

interface TooltipProps {
  text: string
  /** Tooltip auto-dismisses after 6s; click anywhere else also dismisses. */
  show: boolean
  onDismiss: () => void
}

export function Tooltip({ text, show, onDismiss }: TooltipProps) {
  useEffect(() => {
    if (!show) return
    const timeout = setTimeout(onDismiss, 6000)
    const onClick = () => onDismiss()
    setTimeout(() => document.addEventListener('click', onClick, { once: true }), 100)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', onClick)
    }
  }, [show, onDismiss])

  if (!show) return null

  return (
    <div className="bg-surface border-hairline mt-2 border p-3 font-serif text-sm italic">
      {text}
    </div>
  )
}
