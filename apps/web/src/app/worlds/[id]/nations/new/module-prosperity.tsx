'use client'

import { Accordion } from '@/components/Accordion'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

export function ModuleProsperity({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 3 · PROSPERITY & FLOW" title="The Sledgehammer">
      <div className="space-y-6">
        <Slider
          label="Economic (E)"
          value={state.E ?? null}
          onChange={(v) => onChange({ E: v })}
          flashing={flashedFields?.has('E')}
          minLabel="Subsistence"
          maxLabel="Mercantile"
        />

        <div>
          <label className="label-caps mb-2 block text-xs">Currency display name</label>
          <input
            type="text"
            value={state.currency ?? 'Gold Pieces'}
            onChange={(e) => onChange({ currency: e.target.value })}
            className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
          />
        </div>
      </div>
    </Accordion>
  )
}
