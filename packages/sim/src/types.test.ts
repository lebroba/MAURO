import { describe, expectTypeOf, it } from 'vitest'
import type { NationCreatedEvent, WorldEvent, WorldEventKind } from './types'

describe('NationCreatedEvent', () => {
  it('is a member of the WorldEvent union', () => {
    const e: WorldEvent = {
      kind: 'NationCreated',
      atDate: '1247-03-15',
      payload: {
        name: 'Iron Duchy',
        polygon: { type: 'Polygon', coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]] },
        interview: {
          D: 5, C: 6, M: 7, E: 4, I: 3, I2: 5,
          government: 'feudal',
          religion: 'pantheon',
          civTier: 'iron',
          species: 'human',
          currency: 'Gold Pieces',
        },
      },
    }
    expectTypeOf(e).toMatchTypeOf<WorldEvent>()
  })

  it('NationCreated is a valid WorldEventKind', () => {
    const k: WorldEventKind = 'NationCreated'
    expectTypeOf(k).toEqualTypeOf<WorldEventKind>()
  })

  it('discriminated narrowing on kind narrows payload', () => {
    function handle(e: WorldEvent) {
      if (e.kind === 'NationCreated') {
        // Inside this branch, payload.name should be string
        const _: string = e.payload.name
        return _
      }
      return null
    }
    expectTypeOf(handle).toBeFunction()
  })
})
