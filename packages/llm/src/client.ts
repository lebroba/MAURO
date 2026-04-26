export interface OllamaClientOptions {
  host?: string
  model: string
}

export interface OllamaClient {
  readonly host: string
  readonly model: string
}

export function createOllamaClient(options: OllamaClientOptions): OllamaClient {
  return {
    host: options.host ?? 'http://localhost:11434',
    model: options.model,
  }
}
