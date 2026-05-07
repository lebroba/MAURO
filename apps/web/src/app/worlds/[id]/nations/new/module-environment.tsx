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

const SPECIES: ReadonlyArray<{ value: Species; label: string; description: string }> = [
  { value: 'human', label: 'Human', description: 'Adaptable, prolific, the standard-bearers of compromise.' },
  { value: 'elf', label: 'Elf', description: 'Long-lived. The forest remembers what we forget.' },
  { value: 'dwarf', label: 'Dwarf', description: 'Stone-bound. Oaths in iron, debts in gold.' },
  { value: 'halfling', label: 'Halfling', description: 'Hearth-keepers. Quiet hands, generous tables.' },
  { value: 'dragonborn', label: 'Dragonborn', description: 'Scale-skinned. Honor in fire and lineage.' },
  { value: 'gnome', label: 'Gnome', description: 'Tinkers and witnesses. The world is a puzzle.' },
  { value: 'half-elf', label: 'Half-Elf', description: 'Two heritages, neither full. Bridge-walkers.' },
  { value: 'half-orc', label: 'Half-Orc', description: 'Strength and a second chance. Many become leaders.' },
  { value: 'tiefling', label: 'Tiefling', description: 'Bloodline-marked. Suspicion follows them.' },
  { value: 'aasimar', label: 'Aasimar', description: 'Touched by the celestial. Light walks behind them.' },
  { value: 'goliath', label: 'Goliath', description: 'Mountain-born. Climate is their first language.' },
  { value: 'orc', label: 'Orc', description: 'Tribal honor. Strength, song, and a long memory.' },
]

const INFORMATION_FLAVOR: Record<number, string> = {
  1: 'Word-of-mouth: news crosses the realm in months.',
  3: 'Town criers: bulletins reach every market square.',
  5: 'Postal roads: letters in days, not weeks.',
  8: 'Printing presses: pamphlets, broadsides, public discourse.',
  10: 'Skein-touched: magical relays, near-instant comms.',
}

export function ModuleEnvironment({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 4 · ENVIRONMENT & PERCEPTION" title="The Anchor" defaultOpen>
      <div className="space-y-6">
        <Slider
          label="Information (I)"
          value={state.I ?? null}
          onChange={(v) => onChange({ I: v })}
          flashing={flashedFields?.has('I')}
          flavorMap={INFORMATION_FLAVOR}
        />

        <ChoiceCardGroup
          label="Dominant species"
          value={state.species}
          onChange={(v) => onChange({ species: v })}
          options={SPECIES}
          columns={2}
        />
      </div>
    </Accordion>
  )
}
