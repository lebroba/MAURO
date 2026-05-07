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
}: SliderProps) {
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
        value={value ?? Math.round((min + max) / 2)}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-hairline mt-1 h-px w-full accent-[--stamp]"
        aria-label={label}
      />
      {(minLabel || maxLabel) && (
        <div className="text-muted mt-1 flex justify-between font-sans text-[0.65rem] tracking-wider">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}
