'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ScrubberStop {
  /** Position 0..1 along the scrubber's range. */
  position: number
  /** Short label shown under the pin (e.g. "T+0042"). */
  label: string
}

interface ScrubberProps {
  /** Event stops (e.g. T+0000, T+0001). Drag snaps to the nearest. */
  stops: ScrubberStop[]
  /** Index of the currently-selected stop. -1 means "no events" (just T0). */
  selectedIndex: number
  /** Fired when the user drags (or clicks) the scrubber to a different stop. */
  onSelect?: (index: number) => void
}

// Per DESIGN.md: 1px hairline, no transport chrome (no play/pause/skip),
// pins are circles (the only allowed border-radius >2px exception), stamp
// red for the selected stop, verdigris for the live drag position.

export function Scrubber({ stops, selectedIndex, onSelect }: ScrubberProps) {
  const lineRef = useRef<HTMLDivElement>(null)
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  const positionFromClientX = useCallback((clientX: number): number => {
    const el = lineRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const raw = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(1, raw))
  }, [])

  const snapToNearestStop = useCallback(
    (position: number): number => {
      if (stops.length === 0) return -1
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < stops.length; i++) {
        const d = Math.abs(stops[i]!.position - position)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      return bestIdx
    },
    [stops],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (stops.length < 2 || !onSelect) return
      e.preventDefault()
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      isDraggingRef.current = true
      const pos = positionFromClientX(e.clientX)
      setDragPosition(pos)
    },
    [stops.length, onSelect, positionFromClientX],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      const pos = positionFromClientX(e.clientX)
      setDragPosition(pos)
    },
    [positionFromClientX],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      const pos = positionFromClientX(e.clientX)
      setDragPosition(null)
      const snappedIdx = snapToNearestStop(pos)
      if (snappedIdx >= 0 && snappedIdx !== selectedIndex && onSelect) {
        onSelect(snappedIdx)
      }
    },
    [positionFromClientX, snapToNearestStop, selectedIndex, onSelect],
  )

  // Cancel drag if pointer leaves the window or component unmounts mid-drag.
  useEffect(() => {
    const cancel = () => {
      isDraggingRef.current = false
      setDragPosition(null)
    }
    window.addEventListener('pointercancel', cancel)
    return () => window.removeEventListener('pointercancel', cancel)
  }, [])

  const draggable = stops.length >= 2 && !!onSelect

  return (
    <div
      className={`bg-surface border-hairline relative flex h-14 items-center border-t px-8 ${
        draggable ? 'cursor-pointer select-none' : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div ref={lineRef} className="bg-hairline relative h-px flex-1">
        {/* Major endpoint tick marks */}
        <div
          className="bg-muted absolute h-3 w-px"
          style={{ left: '0%', top: '-5.5px' }}
        />
        <div
          className="bg-muted absolute h-3 w-px"
          style={{ left: '100%', top: '-5.5px' }}
        />
        {/* Minor tick at every stop */}
        {stops.map((s, i) => (
          <div
            key={`tick-${i}`}
            className="bg-muted absolute h-2 w-px"
            style={{ left: `${s.position * 100}%`, top: '-3.5px' }}
          />
        ))}

        {/* Selected (stamp red) pin — current sim-date */}
        {selectedIndex >= 0 && stops[selectedIndex] ? (
          <Pin
            position={stops[selectedIndex]!.position}
            label={stops[selectedIndex]!.label}
            color="var(--color-stamp)"
          />
        ) : null}

        {/* Live (verdigris) drag indicator — only visible while dragging */}
        {dragPosition !== null ? (
          <Pin
            position={dragPosition}
            label="drag"
            color="var(--color-verdigris)"
          />
        ) : null}
      </div>
    </div>
  )
}

function Pin({
  position,
  label,
  color,
}: {
  position: number
  label: string
  color: string
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute h-3 w-3 rounded-full"
        style={{
          left: `${position * 100}%`,
          top: '-5.5px',
          background: color,
          boxShadow: '0 0 0 4px var(--color-surface)',
          transform: 'translateX(-50%)',
        }}
      />
      <div
        className="font-mono pointer-events-none absolute whitespace-nowrap text-[0.65rem] tabular-nums"
        style={{
          left: `${position * 100}%`,
          top: '14px',
          color,
          letterSpacing: '0.06em',
          transform: 'translateX(-50%)',
        }}
      >
        {label}
      </div>
    </>
  )
}
