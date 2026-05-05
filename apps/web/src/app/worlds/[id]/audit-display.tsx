'use client'

import type { AuditOutput } from '@mauro/sim'

interface AuditDisplayProps {
  audit: AuditOutput
  onCancel: () => void
  onContinue: () => void
}

export function AuditDisplay({ audit, onCancel, onContinue }: AuditDisplayProps) {
  const dist = audit.elevationDistribution
  const water = dist.deepWater + dist.shallowWater
  const isWaterOnly = water >= 0.95

  return (
    <div className="bg-surface border-hairline absolute right-6 top-6 z-30 max-w-sm border p-6">
      <div className="label-caps mb-4 text-xs">TERRITORIAL AUDIT</div>
      <div className="font-mono text-xs leading-relaxed">
        <div>AREA       : {Math.round(audit.areaKm2)} km²</div>
        <div>WATER      : {Math.round(water * 100)}%</div>
        <div>LOWLAND    : {Math.round(dist.lowland * 100)}%</div>
        <div>MIDLAND    : {Math.round(dist.midland * 100)}%</div>
        <div>HIGHLAND   : {Math.round(dist.highland * 100)}%</div>
      </div>

      {audit.suggestions.length > 0 && (
        <div className="text-muted mt-4 font-serif text-sm italic">
          {audit.suggestions[0]?.prose}
        </div>
      )}

      {isWaterOnly ? (
        <div className="text-stamp mt-4 font-serif text-sm italic">
          Selected region appears to be water-only. Draw a polygon that includes land.
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="border-hairline text-text px-4 py-2 text-sm"
        >
          Cancel
        </button>
        {!isWaterOnly && (
          <button
            onClick={onContinue}
            className="border-text text-text border px-4 py-2 text-sm"
          >
            Review & continue →
          </button>
        )}
      </div>
    </div>
  )
}
