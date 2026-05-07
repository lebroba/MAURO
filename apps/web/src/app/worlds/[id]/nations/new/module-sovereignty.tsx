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

type Government = NonNullable<InterviewState['government']>
type Religion = NonNullable<InterviewState['religion']>

const GOVERNMENTS: ReadonlyArray<{ value: Government; label: string; description: string }> = [
  { value: 'anarchic', label: 'Anarchic Commune', description: 'No central authority. Decisions by consensus or might.' },
  { value: 'feudal', label: 'Feudal Monarchy', description: 'Hereditary rule. Vassalage chains, lord-knight loyalty.' },
  { value: 'magocracy', label: 'Magocracy', description: 'The Skein-touched rule. Arcane mastery is legitimacy.' },
  { value: 'theocracy', label: 'Theocracy', description: 'Clergy holds civil power. Doctrine is law.' },
  { value: 'totalitarian', label: 'Totalitarian Hegemony', description: 'One will, enforced. Dissent is sedition.' },
]

const RELIGIONS: ReadonlyArray<{ value: Religion; label: string; description: string }> = [
  { value: 'pantheon', label: 'The Pantheon', description: 'Many gods, each a domain. Temples spread across the realm.' },
  { value: 'sovereign', label: 'The Sovereign Host', description: 'One supreme god. Other powers are aspects or rivals.' },
  { value: 'cult', label: 'Cult of the Outsider', description: 'A single hidden truth. Outwardly normal, inwardly devoted.' },
  { value: 'secular', label: 'Secular / Philosophical', description: 'No state cult. Belief is private or replaced by reason.' },
]

const PRESTIGE_FLAVOR: Record<number, string> = {
  1: 'Provincial — backwater. Cartographers leave us blank.',
  3: 'Notable — our merchants are recognized in three markets.',
  5: 'Established — crowns are sent to our weddings.',
  8: 'Renowned — songs are sung of our rulers.',
  10: 'Imperial — we are the standard by which others measure.',
}

const STANCE_FLAVOR: Record<number, string> = {
  1: 'Total isolation: the world ends at our borders.',
  3: 'Wary protectionism: we trade only by necessity.',
  5: 'Balanced diplomacy: open borders, but guarded hearts.',
  8: 'Expansionist: seeking to bring our light to neighbors.',
  10: 'Imperial hegemony: all lands must eventually join us.',
}

export function ModuleSovereignty({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 1 · SOVEREIGNTY & FOUNDATION" title="The Core" defaultOpen>
      <div className="space-y-6">
        <ChoiceCardGroup
          label="Government"
          value={state.government}
          onChange={(v) => onChange({ government: v })}
          options={GOVERNMENTS}
          columns={2}
        />
        <ChoiceCardGroup
          label="Religion"
          value={state.religion}
          onChange={(v) => onChange({ religion: v })}
          options={RELIGIONS}
          columns={2}
        />

        <Slider
          label="National Prestige (C)"
          value={state.C ?? null}
          onChange={(v) => onChange({ C: v })}
          flashing={flashedFields?.has('C')}
          flavorMap={PRESTIGE_FLAVOR}
        />
        <Slider
          label="External Stance (D)"
          value={state.D ?? null}
          onChange={(v) => onChange({ D: v })}
          flashing={flashedFields?.has('D')}
          flavorMap={STANCE_FLAVOR}
        />
      </div>
    </Accordion>
  )
}
