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

type CivTier = NonNullable<InterviewState['civTier']>

const CIV_TIERS: ReadonlyArray<{ value: CivTier; label: string }> = [
  { value: 'bone', label: 'Age of Bone (Tribal)' },
  { value: 'iron', label: 'Age of Iron (Feudal-Early)' },
  { value: 'stone', label: 'Age of Steele (Feudal-High)' },
  { value: 'aether', label: 'Age of Aether (High Magic)' },
]

export function ModuleWar({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 2 · WAR MACHINE & ARCANA" title="The Sword">
      <div className="space-y-6">
        <ChoiceCardGroup
          label="Civilization tier"
          value={state.civTier}
          onChange={(v) => onChange({ civTier: v })}
          options={CIV_TIERS}
          columns={2}
        />

        <Slider
          label="Military (M)"
          value={state.M ?? null}
          onChange={(v) => onChange({ M: v })}
          flashing={flashedFields?.has('M')}
          minLabel="Militia"
          maxLabel="Legions"
        />
        <Slider
          label="Intelligence (I²)"
          value={state.I2 ?? null}
          onChange={(v) => onChange({ I2: v })}
          flashing={flashedFields?.has('I2')}
          minLabel="Whispers"
          maxLabel="Spymaster"
        />
      </div>
    </Accordion>
  )
}
