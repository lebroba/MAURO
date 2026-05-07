'use client'

import { Accordion } from '@/components/Accordion'
import { ChoiceCardGroup } from '@/components/ChoiceCardGroup'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

type Species = NonNullable<InterviewState['species']>

const SPECIES: ReadonlyArray<{ value: Species; label: string }> = [
  { value: 'human', label: 'Human' },
  { value: 'elf', label: 'Elf' },
  { value: 'dwarf', label: 'Dwarf' },
  { value: 'halfling', label: 'Halfling' },
  { value: 'dragonborn', label: 'Dragonborn' },
  { value: 'gnome', label: 'Gnome' },
  { value: 'half-elf', label: 'Half-Elf' },
  { value: 'half-orc', label: 'Half-Orc' },
  { value: 'tiefling', label: 'Tiefling' },
  { value: 'aasimar', label: 'Aasimar' },
  { value: 'goliath', label: 'Goliath' },
  { value: 'orc', label: 'Orc' },
]

export function ModuleEnvironment({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 4 · ENVIRONMENT & PERCEPTION" title="The Anchor">
      <div className="space-y-6">
        <Slider
          label="Information (I)"
          value={state.I ?? null}
          onChange={(v) => onChange({ I: v })}
          flashing={flashedFields?.has('I')}
          minLabel="Word-of-mouth"
          maxLabel="Skein"
        />

        <ChoiceCardGroup
          label="Dominant species"
          value={state.species}
          onChange={(v) => onChange({ species: v })}
          options={SPECIES}
          columns={4}
        />
      </div>
    </Accordion>
  )
}
