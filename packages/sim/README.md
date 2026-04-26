# @mauro/sim

Rules engine, WorldQuery API, deterministic RNG, and event-sourcing primitives for MAURO.

## Modules

- `rng/` — Splitmix64 stage-seed derivation, Xoshiro256\*\* RNG (xoshiro pending implementation)
- `events/` — event types, rules engine, deterministic state-delta computation (pending)
- `query/` — WorldQuery API; the canonical read interface for every other package (pending)
- `nation/` — DIME-Plus interview state, factbook generation, gazetteer (pending)

## Determinism contract

Every public function whose output depends on RNG must be byte-identical given the same `(masterSeed, stageSalt, eventSequence)`. See `docs/ARCHITECTURE_PRINCIPLES.md` §4.
