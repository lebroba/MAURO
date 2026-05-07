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

const CIV_TIERS: ReadonlyArray<{ value: CivTier; label: string; description: string }> = [
  { value: 'bone', label: 'Age of Bone', description: 'Tribal. Stone tools, oral law, kinship over kingdom.' },
  { value: 'iron', label: 'Age of Iron', description: 'Feudal-Early. Iron weapons, manors, the first written codes.' },
  { value: 'stone', label: 'Age of Steele', description: 'Feudal-High. Plate, masonry, guilds, contested kingdoms.' },
  { value: 'aether', label: 'Age of Aether', description: 'High Magic. Skein-craft is industry. Wizards are infrastructure.' },
]

const MILITARY_FLAVOR: Record<number, string> = {
  1: 'Peasant levies: pitchforks and prayer.',
  3: 'Local militias: town guards and part-time scouts.',
  5: 'Standing army: disciplined, professional soldiers.',
  8: 'War engine: military service is the national lifeblood.',
  10: 'God-killers: unstoppable legions and siege titans.',
}

const INTEL_FLAVOR: Record<number, string> = {
  1: 'Oblivious: rumors travel faster than our news.',
  3: 'Limited: one spymaster and three good informants.',
  5: 'Watchful: a functional network of spies and scouts.',
  8: 'Embedded: agents in every neighbor’s court.',
  10: 'Omniscient: we know what your king ate for breakfast.',
}

export function ModuleWar({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 2 · WAR MACHINE & ARCANA" title="The Sword" defaultOpen>
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
          flavorMap={MILITARY_FLAVOR}
        />
        <Slider
          label="Intelligence (I²)"
          value={state.I2 ?? null}
          onChange={(v) => onChange({ I2: v })}
          flashing={flashedFields?.has('I2')}
          flavorMap={INTEL_FLAVOR}
        />
      </div>
    </Accordion>
  )
}
