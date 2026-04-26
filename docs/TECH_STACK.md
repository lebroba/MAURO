# MAURO — Tech Stack

## Frontend

Next.js (App Router) + TypeScript. Picked for ecosystem mass and SaaS-scaffolding density over SvelteKit's reactivity edge. Compensate for the editor-surface reactivity gap with **Zustand** (global state) or **Jotai** (atoms), and `react-flow` for the relationships graph. Re-openable decision — flag for `/design-consultation` if SvelteKit becomes compelling once editor surfaces are wireframed.

## Backend

Supabase (Postgres + Auth + Storage + Edge Functions + Realtime). One vendor, low ops cost. Edge Functions handle anything that can't be done client-side (raster crop pipeline, LLM proxy in production).

## Database schema shape

Event-sourced. Every entity has an append-only event log; current state is a materialized view over events as-of-now. World-state scrubber reads materialized views as-of any past timestamp.

## Geography stack

- Tile sources: NASA SRTM, GEBCO, ETOPO. Public domain.
- Server-side raster: `sharp` for image ops, `geotiff.js` (or wasm-gdal) for georeferenced reads.
- Client display: **MapLibre GL JS** with a custom heightmap-tile source.

## LLM stack

- Local dev: **Ollama** runtime + fine-tuned Gemma (current generation; user identified Gemma 4 as target — pin the exact base model in the manifest once chosen).
- Fine-tuning: LoRA via Unsloth or Axolotl on a hand-curated corpus of `(event, state-delta, prose-summary)` tuples.
- Production hosting: **TBD — `/design-consultation` resolves**. Three live options: (a) self-host on a single GPU box behind the API, (b) Modal / Replicate / Together / Hyperbolic, (c) WebGPU-in-browser if the model is small enough. Each has cost / latency / determinism implications.
- **Determinism rule:** LLM produces _prose only_, never state. Rules engine produces state deltas deterministically. Temperature pinned to 0 for prose regeneration; same inputs → same outputs.

## Determinism utilities (carry-forward port)

TypeScript implementations of `splitmix64` (stage-seed derivation) and `xoshiro256**` (RNG). Pin exact versions of any byte-affecting library in `package.json` with `--save-exact` and document the pin policy in `CONTRIBUTING.md`.

## Testing

Vitest for unit / integration; Playwright for E2E (works with gstack `/qa` and `/browse`). Characteristic-stat tests for any procgen output (asserts statistical properties don't drift across refactors).

## Deploy

Vercel for Next.js + Supabase cloud. `/setup-deploy` will configure when ready.
