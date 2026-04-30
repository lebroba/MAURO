'use client'

interface ScrubberEvent {
  /** Position 0..1 along the scrubber's range. */
  position: number
  /** Short label shown under the pin (e.g. "T+0042"). */
  label: string
  /** "stamp" = current sim-date pin (red), "live" = drag position (verdigris). */
  variant: 'stamp' | 'live'
}

interface ScrubberProps {
  events: ScrubberEvent[]
  /** Optional minor tick marks (positions 0..1). Decorative — show event boundaries. */
  ticks?: number[]
}

// Visual-only scrubber for Item 7. Drag interactivity ships in Item 8 (which
// will swap the MapView's imageUrl as the user drags between event states).
//
// Per DESIGN.md: 1px hairline, no transport chrome (no play/pause/skip
// buttons), pins are circles (the only allowed exception to the 2px
// border-radius rule), stamp red for the current sim-date pin, verdigris
// for live drag position.

export function Scrubber({ events, ticks = [] }: ScrubberProps) {
  return (
    <div className="bg-surface border-hairline relative flex h-14 items-center border-t px-8">
      <div className="bg-hairline relative h-px flex-1">
        {/* Tick marks at event boundaries */}
        {ticks.map((t, i) => (
          <div
            key={`tick-${i}`}
            className="bg-muted absolute h-2 w-px"
            style={{ left: `${t * 100}%`, top: '-3.5px' }}
          />
        ))}
        {/* Range endpoints get major tick marks */}
        <div
          className="bg-muted absolute h-3 w-px"
          style={{ left: '0%', top: '-5.5px' }}
        />
        <div
          className="bg-muted absolute h-3 w-px"
          style={{ left: '100%', top: '-5.5px' }}
        />

        {/* Event pins */}
        {events.map((e, i) => {
          const color =
            e.variant === 'stamp' ? 'var(--color-stamp)' : 'var(--color-verdigris)'
          return (
            <div key={`event-${i}`}>
              <div
                className="absolute h-3 w-3 rounded-full"
                style={{
                  left: `${e.position * 100}%`,
                  top: '-5.5px',
                  background: color,
                  boxShadow: '0 0 0 4px var(--color-surface)',
                  transform: 'translateX(-50%)',
                }}
                title={e.label}
              />
              <div
                className="font-mono absolute whitespace-nowrap text-[0.65rem] tabular-nums"
                style={{
                  left: `${e.position * 100}%`,
                  top: '14px',
                  color,
                  letterSpacing: '0.06em',
                  transform: 'translateX(-50%)',
                }}
              >
                {e.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
