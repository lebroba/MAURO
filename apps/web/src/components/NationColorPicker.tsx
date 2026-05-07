'use client'

interface NationColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

// Cartographic-intelligence palette — desaturated heraldic colors that all
// sit comfortably on the warm-paper hillshade. Verdigris (#3B6B5A) is
// deliberately absent: the hillshade renderer reserves it as the canonical
// ocean fill, so a verdigris polygon would visually disappear over water.
const SWATCHES: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#B8442C', name: 'Stamp red' },
  { hex: '#9C3848', name: 'Crimson' },
  { hex: '#3B4D6B', name: 'Indigo' },
  { hex: '#C77E2D', name: 'Saffron' },
  { hex: '#5B3A4F', name: 'Plum' },
  { hex: '#7C8A66', name: 'Sage' },
  { hex: '#7A5A2F', name: 'Bronze' },
  { hex: '#4A4D52', name: 'Slate' },
]

export function NationColorPicker({ value, onChange }: NationColorPickerProps) {
  const isCustom = !SWATCHES.some((s) => s.hex.toLowerCase() === value.toLowerCase())

  return (
    <div>
      <label className="label-caps mb-2 block text-xs">Nation color</label>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((s) => {
          const selected = s.hex.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={s.hex}
              type="button"
              onClick={() => onChange(s.hex)}
              aria-label={s.name}
              aria-pressed={selected}
              title={s.name}
              className={[
                'h-7 w-7 border transition-transform',
                selected ? 'border-ink scale-110' : 'border-hairline hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: s.hex, borderRadius: '2px' }}
            />
          )
        })}
        <label
          className={[
            'border-hairline relative flex h-7 w-7 cursor-pointer items-center justify-center border',
            isCustom ? 'border-ink' : '',
          ].join(' ')}
          style={{ borderRadius: '2px' }}
          title="Custom color"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom color"
          />
          <span
            className="h-3.5 w-3.5"
            style={{
              background:
                'conic-gradient(from 0deg, #b8442c, #c77e2d, #7c8a66, #9c3848, #3b4d6b, #5b3a4f, #b8442c)',
              borderRadius: '2px',
            }}
          />
        </label>
      </div>
    </div>
  )
}
