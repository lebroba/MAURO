'use client'

interface SliderProps {
  label: string
  value: number | null
  onChange: (v: number) => void
  min?: number
  max?: number
  /** When true, renders the --stamp left-border flash for cascading rule firing. */
  flashing?: boolean
  /** Optional anchor labels rendered beneath the track to ground 1 vs 10. */
  minLabel?: string
  maxLabel?: string
  /**
   * Optional value-keyed flavor text. Keys are integer thresholds; the rendered
   * flavor is the entry whose key is the largest ≤ current value. If provided,
   * supersedes minLabel/maxLabel.
   */
  flavorMap?: Record<number, string>
}

function pickFlavor(value: number, flavorMap: Record<number, string>): string {
  const keys = Object.keys(flavorMap)
    .map(Number)
    .sort((a, b) => a - b)
  let active = keys[0] ?? 0
  for (const k of keys) {
    if (value >= k) active = k
  }
  return flavorMap[active] ?? ''
}

export function Slider({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  flashing,
  minLabel,
  maxLabel,
  flavorMap,
}: SliderProps) {
  const displayValue = value ?? Math.round((min + max) / 2)
  const flavor = flavorMap ? pickFlavor(displayValue, flavorMap) : null

  return (
    <div className={flashing ? 'border-stamp -ml-1 border-l-2 pl-1 transition-all duration-500' : ''}>
      <div className="flex items-baseline justify-between">
        <span className="label-caps text-xs">{label}</span>
        <span className="font-mono text-sm tabular-nums">
          {value === null ? '—' : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={displayValue}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-hairline mt-1 h-px w-full accent-[--stamp]"
        aria-label={label}
      />
      {flavor !== null ? (
        <div
          className="text-muted mt-2 min-h-[1.4em] font-serif text-sm italic"
          aria-live="polite"
        >
          {flavor}
        </div>
      ) : (minLabel || maxLabel) ? (
        <div className="text-muted mt-1 flex justify-between font-sans text-[0.65rem] tracking-wider">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
