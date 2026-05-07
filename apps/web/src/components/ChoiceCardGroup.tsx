'use client'

interface ChoiceOption<V extends string> {
  value: V
  label: string
  /** One-line italic flavor displayed beneath the title in the card. */
  description?: string
}

interface ChoiceCardGroupProps<V extends string> {
  label: string
  value: V | undefined
  onChange: (next: V) => void
  options: ReadonlyArray<ChoiceOption<V>>
  /** Visual columns at md breakpoint and above. Defaults to 2. */
  columns?: 2 | 3 | 4
  /** When true, renders the --stamp left-border flash for cascading rule firing. */
  flashing?: boolean
}

const COL_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
}

export function ChoiceCardGroup<V extends string>({
  label,
  value,
  onChange,
  options,
  columns = 2,
  flashing,
}: ChoiceCardGroupProps<V>) {
  return (
    <div className={flashing ? 'border-stamp -ml-1 border-l-2 pl-1 transition-all duration-500' : ''}>
      <div className="label-caps mb-2 text-xs">{label}</div>
      <div role="radiogroup" aria-label={label} className={`grid gap-2 ${COL_CLASS[columns]}`}>
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={[
                'flex flex-col gap-1.5 border px-3 py-2.5 text-left transition-colors',
                'hover:border-verdigris',
                selected
                  ? 'border-stamp bg-surface'
                  : 'border-hairline',
              ].join(' ')}
              style={{ borderRadius: '2px' }}
            >
              <span className="font-display text-base leading-tight">
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-muted font-serif text-xs italic leading-snug">
                  {opt.description}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
