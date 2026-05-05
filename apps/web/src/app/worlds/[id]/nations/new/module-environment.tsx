'use client'

import { Accordion } from '@/components/Accordion'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

export function ModuleEnvironment({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 4 · ENVIRONMENT & PERCEPTION" title="The Anchor">
      <div className="space-y-6">
        <Slider
          label="Information (I)"
          value={state.I ?? null}
          onChange={(v) => onChange({ I: v })}
          flashing={flashedFields?.has('I')}
        />

        <div>
          <label className="label-caps mb-2 block text-xs">Dominant species</label>
          <select
            value={state.species ?? ''}
            onChange={(e) => onChange({ species: e.target.value as InterviewState['species'] })}
            className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
          >
            <option value="" disabled>Select…</option>
            <option value="human">Human</option>
            <option value="elf">Elf</option>
            <option value="dwarf">Dwarf</option>
            <option value="halfling">Halfling</option>
            <option value="dragonborn">Dragonborn</option>
            <option value="gnome">Gnome</option>
            <option value="half-elf">Half-Elf</option>
            <option value="half-orc">Half-Orc</option>
            <option value="tiefling">Tiefling</option>
            <option value="aasimar">Aasimar</option>
            <option value="goliath">Goliath</option>
            <option value="orc">Orc</option>
          </select>
        </div>
      </div>
    </Accordion>
  )
}
