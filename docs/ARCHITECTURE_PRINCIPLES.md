# MAURO — Architecture Principles

Load-bearing rules. Violations need explicit justification, ideally captured as a follow-up principle.

1. **Substrate-first, render-second.** The data structure (cell graph + event log) is the product. The heightmap raster is one render of the substrate, not the canonical form.
2. **WorldQuery API is the foundation.** All reads go through it. Pipeline stages do not reach sideways into each other's data — only through the API. (Diagnosis from project_aria 2026-04-25 pivot: most regressions came from cross-stage data coupling.)
3. **Time-versioned state by default.** Mutable in-place updates forbidden at the persistence layer. Every change is an event with a timestamp.
4. **Determinism contract for procgen and rules-engine paths.** Same inputs (master seed, world params, event sequence) produce byte-identical outputs across runs and architectures. RNG is splitmix64-derived stage seeds → xoshiro256\*\* stage RNG.
5. **State and prose are separate.** Rules engine produces state deltas deterministically. LLM produces narrative prose. State is load-bearing; prose is regeneratable. Storing the prose is a cache, not a source of truth.
6. **Mask is source-of-truth for is-land. Elevation only provides relief.** (Carry-forward lesson — when elevation sign was used to gate land/ocean, swiss-cheese coastlines resulted.)
7. **GPL clean-room.** Concepts from devlogs / academic papers OK. Never read source from GPL-licensed procgen tools (SotE, SongsOfGPL, Gleba, etc.). Documented in `CONTRIBUTING.md`.
8. **Exact-pin policy for byte-affecting dependencies.** Any library that affects output bytes (RNG, noise, geo) is pinned exactly. Policy is documented in the manifest itself so contributors don't "modernize" it.
9. **Cross-architecture CI** (target: v1, not MVP). Verify byte-identical output on x86 + ARM via output-hash assertions.
