import { describe, expect, it } from 'vitest'
import { createOllamaClient } from './client'

describe('createOllamaClient', () => {
  it('returns a client object configured with the provided host and model', () => {
    const client = createOllamaClient({ host: 'http://localhost:11434', model: 'gemma:latest' })
    expect(client.host).toBe('http://localhost:11434')
    expect(client.model).toBe('gemma:latest')
  })

  it('defaults host to localhost:11434 when omitted', () => {
    const client = createOllamaClient({ model: 'gemma:latest' })
    expect(client.host).toBe('http://localhost:11434')
  })
})
