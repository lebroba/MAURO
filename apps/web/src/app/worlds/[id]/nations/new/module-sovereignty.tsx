'use client'

import { Accordion } from '@/components/Accordion'
import { Slider } from '@/components/Slider'
import type { InterviewState } from '@mauro/sim'

interface ModuleProps {
  state: Partial<InterviewState>
  onChange: (patch: Partial<InterviewState>) => void
  flashedFields?: Set<string>
}

export function ModuleSovereignty({ state, onChange, flashedFields }: ModuleProps) {
  return (
    <Accordion eyebrow="MODULE 1 · SOVEREIGNTY & FOUNDATION" title="The Core" defaultOpen>
      <div className="space-y-6">
        <div>
          <label className="label-caps mb-2 block text-xs">Government</label>
          <select
            value={state.government ?? ''}
            onChange={(e) => onChange({ government: e.target.value as InterviewState['government'] })}
            className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
          >
            <option value="" disabled>Select…</option>
            <option value="anarchic">Anarchic Commune</option>
            <option value="feudal">Feudal Monarchy</option>
            <option value="magocracy">Magocracy</option>
            <option value="theocracy">Theocracy</option>
            <option value="totalitarian">Totalitarian Hegemony</option>
          </select>
        </div>

        <div>
          <label className="label-caps mb-2 block text-xs">Religion</label>
          <select
            value={state.religion ?? ''}
            onChange={(e) => onChange({ religion: e.target.value as InterviewState['religion'] })}
            className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
          >
            <option value="" disabled>Select…</option>
            <option value="pantheon">The Pantheon</option>
            <option value="sovereign">The Sovereign Host</option>
            <option value="cult">Cult of the Outsider</option>
            <option value="secular">Secular / Philosophical</option>
          </select>
        </div>

        <Slider
          label="National Prestige (C)"
          value={state.C ?? null}
          onChange={(v) => onChange({ C: v })}
          flashing={flashedFields?.has('C')}
        />
        <Slider
          label="External Stance (D)"
          value={state.D ?? null}
          onChange={(v) => onChange({ D: v })}
          flashing={flashedFields?.has('D')}
        />
      </div>
    </Accordion>
  )
}
