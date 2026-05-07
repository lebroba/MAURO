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

const GOVERNMENTS: ReadonlyArray<{ value: Government; label: string }> = [
  { value: 'anarchic', label: 'Anarchic Commune' },
  { value: 'feudal', label: 'Feudal Monarchy' },
  { value: 'magocracy', label: 'Magocracy' },
  { value: 'theocracy', label: 'Theocracy' },
  { value: 'totalitarian', label: 'Totalitarian Hegemony' },
]

const RELIGIONS: ReadonlyArray<{ value: Religion; label: string }> = [
  { value: 'pantheon', label: 'The Pantheon' },
  { value: 'sovereign', label: 'The Sovereign Host' },
  { value: 'cult', label: 'Cult of the Outsider' },
  { value: 'secular', label: 'Secular / Philosophical' },
]

export function ModuleSovereignty({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 1 · SOVEREIGNTY & FOUNDATION" title="The Core" defaultOpen>
      <div className="space-y-6">
        <ChoiceCardGroup
          label="Government"
          value={state.government}
          onChange={(v) => onChange({ government: v })}
          options={GOVERNMENTS}
          columns={3}
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
          minLabel="Provincial"
          maxLabel="Imperial"
        />
        <Slider
          label="External Stance (D)"
          value={state.D ?? null}
          onChange={(v) => onChange({ D: v })}
          flashing={flashedFields?.has('D')}
          minLabel="Isolationist"
          maxLabel="Expansionist"
        />
      </div>
    </Accordion>
  )
}
