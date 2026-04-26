# @mauro/llm

Ollama client, prompt templates, and fine-tune harness for MAURO.

## Determinism contract

The LLM produces narrative prose only — never state. Rules engine in `@mauro/sim` produces state deltas deterministically; this package consumes those deltas to generate prose summaries. Temperature pinned to 0 for prose regeneration.

## Layout

- `src/client.ts` — Ollama HTTP client wrapper (stub for MVP)
- `prompts/` — prompt templates per event type (pending)
- `training/` — LoRA fine-tune scripts and curated `(event, delta, prose)` corpus (pending)

## Production hosting

Currently TBD — see `docs/TECH_STACK.md`. Local dev uses Ollama on the developer's machine.
