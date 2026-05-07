'use client'

import { Accordion } from '@/components/Accordion'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

const ECONOMIC_FLAVOR: Record<number, string> = {
  1: 'Subsistence: we eat what we grow. No more.',
  3: 'Local trade: markets run on barter and copper.',
  5: 'Mercantile: caravans, ports, a working mint.',
  8: 'Wealthy: foreign banks open branches in our capital.',
  10: 'Empire of coin: our currency is the world’s reserve.',
}

export function ModuleProsperity({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 3 · PROSPERITY & FLOW" title="The Sledgehammer" defaultOpen>
      <div className="space-y-6">
        <Slider
          label="Economic (E)"
          value={state.E ?? null}
          onChange={(v) => onChange({ E: v })}
          flashing={flashedFields?.has('E')}
          flavorMap={ECONOMIC_FLAVOR}
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
