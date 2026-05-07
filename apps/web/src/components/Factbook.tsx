'use client'

import { useState } from 'react'
import { renderFactbook, type GeoJSONPolygon, type InterviewState } from '@mauro/sim'

export interface NationDisplay {
  eventId: number
  name: string
  atDate: string
  /** Hex color (e.g. "#B8442C") — used for both factbook accent and map overlay. */
  color: string
  /** GeoJSON polygon for the nation territory; rendered on the world map. */
  polygon: GeoJSONPolygon
  interview: InterviewState
}

interface FactbookProps {
  nations: NationDisplay[]
}

export function Factbook({ nations }: FactbookProps) {
  const [selected, setSelected] = useState<NationDisplay | null>(null)

  if (nations.length === 0) {
    return (
      <aside className="bg-surface border-hairline border-l p-6">
        <div className="label-caps mb-3 text-xs">FACTBOOK</div>
        <div className="text-muted font-serif text-sm italic">
          No nations yet. Use Establish Nation to begin.
        </div>
      </aside>
    )
  }

  if (selected) {
    const fb = renderFactbook(selected.name, selected.interview)
    return (
      <aside className="bg-surface border-hairline overflow-y-auto border-l p-6">
        <button
          onClick={() => setSelected(null)}
          className="label-caps text-muted mb-4 text-xs"
        >
          ← All nations
        </button>
        <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
          {fb.sectionI}
          {fb.sectionII}
          {fb.sectionIII}
        </pre>
      </aside>
    )
  }

  return (
    <aside className="bg-surface border-hairline border-l p-6">
      <div className="label-caps mb-3 text-xs">FACTBOOK</div>
      <ul>
        {nations.map((n) => (
          <li key={n.eventId} className="border-hairline border-b">
            <button
              onClick={() => setSelected(n)}
              className="hover:bg-bg w-full px-2 py-3 text-left transition-colors"
            >
              <div className="font-display text-base">{n.name}</div>
              <div className="text-muted font-mono text-xs">{n.atDate}</div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
