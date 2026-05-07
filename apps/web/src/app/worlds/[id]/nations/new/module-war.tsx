'use client'

import { Accordion } from '@/components/Accordion'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

export function ModuleWar({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 2 · WAR MACHINE & ARCANA" title="The Sword">
      <div className="space-y-6">
        <div>
          <label className="label-caps mb-2 block text-xs">Civilization tier</label>
          <select
            value={state.civTier ?? ''}
            onChange={(e) => onChange({ civTier: e.target.value as InterviewState['civTier'] })}
            className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
          >
            <option value="" disabled>Select…</option>
            <option value="bone">Age of Bone (Tribal)</option>
            <option value="iron">Age of Iron (Feudal-Early)</option>
            <option value="stone">Age of Steele (Feudal-High)</option>
            <option value="aether">Age of Aether (High Magic)</option>
          </select>
        </div>

        <Slider
          label="Military (M)"
          value={state.M ?? null}
          onChange={(v) => onChange({ M: v })}
          flashing={flashedFields?.has('M')}
        />
        <Slider
          label="Intelligence (I²)"
          value={state.I2 ?? null}
          onChange={(v) => onChange({ I2: v })}
          flashing={flashedFields?.has('I2')}
        />
      </div>
    </Accordion>
  )
}
