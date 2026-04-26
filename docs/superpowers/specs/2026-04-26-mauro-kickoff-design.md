# MAURO — Kickoff Bundle Design Spec

**Date:** 2026-04-26
**Status:** Draft for user review
**Owner:** lebroba
**Context:** Design spec for the kickoff bundle of artifacts for the new MAURO repo at `E:\projects\MAURO`. Replaces and supersedes the project_aria pipeline (now reference-only per the 2026-04-25 architectural pivot).

---

## 1. Purpose

Produce the upstream artifacts needed to start MAURO development through the **gstack pipeline** (`/office-hours` → `/design-consultation` → plan reviews → implementation → `/qa` → `/ship` → `/land-and-deploy` → `/canary`).

This spec is **kickoff-artifacts only**. It does not execute any gstack pipeline stage. After approval, the writing-plans skill produces an implementation plan that will create the artifact files and bootstrap the repo skeleton at `E:\projects\MAURO`.

## 2. Deliverables

1. `CLAUDE.md` — project conventions for Claude
2. `docs/BRD.md` — business requirements
3. `docs/PRD.md` — product requirements
4. `docs/PERSONAS.md` — primary, bridge, and future personas
5. `docs/TECH_STACK.md` — chosen stack with rationale
6. `docs/ARCHITECTURE_PRINCIPLES.md` — load-bearing rules
7. `docs/CARRY_FORWARD.md` — algorithmic insights from project_aria
8. `docs/ROADMAP.md` — MVP / v1 / v2 / v3+ staging
9. `CONTRIBUTING.md` — GPL clean-room policy, exact-pin policy, PR workflow
10. `README.md` — quickstart for returning to the repo cold
11. Repo skeleton: monorepo with `apps/web/` (Next.js), `packages/{sim,llm,geo}/`, `supabase/`, `docs/`, `e2e/`, `scripts/`

## 3. Group A — Strategy & user

### 3.1 BRD.md content

**Positioning.**

> MAURO is a worldbuilding workspace for tabletop GMs and worldbuilding novelists. GMs draw worlds from real-Earth geography, populate them with CIA-factbook-style nations, and run a time-versioned simulation that tracks history as the campaign unfolds.

**Why-now thesis.**

- Inkarnate / Wonderdraft / Azgaar own "draw a pretty map." None own "the map is alive — it has factions, history, and consequences."
- Local-LLM tooling (Gemma family on consumer GPUs) is now good enough to narrate consequence propagation without per-request cloud cost.
- Real-Earth public-domain heightmap data (NASA SRTM, ETOPO, GEBCO) makes Earth-quality geography free for MVP.

**Customer thesis.**

- _Primary:_ D&D 5E GMs running campaigns 1+ years long with named factions, evolving political situations, and a need for "what does the world look like after Session 17?" answers.
- _Bridge:_ worldbuilding novelists who want to track nation states + timeline coherence without ad-hoc spreadsheets and wikis.
- _Out of scope as a paying line:_ defense / wargaming customers (procurement-driven, FedRAMP, not the product shape).

**Scope guardrails — what MAURO is NOT.** _(User flagged this section as critical — leave room for additions.)_

- Not a VTT (Foundry / Roll20 cover that). MAURO may export _to_ a VTT later.
- Not an encounter / combat tool (D&D Beyond, etc.).
- Not a campaign-session log (handled by Notion / Obsidian / VTTs).
- Not an AI-from-nothing world generator. The LLM mediates events; geography comes from real Earth.
- _[User to extend this list as constraints are discovered.]_

**Success criteria for kickoff.**

- 5-10 GM beta testers running a real campaign world in MAURO within ~3 months of starting code.
- Each beta GM creates ≥3 nations and runs the timeline scrubber at least once during a real session.

### 3.2 PERSONAS.md content

**1. The Long-Campaign 5E GM (primary, MVP-target).**
12+ month campaigns, named factions, political tension, players have inflicted real consequences on the world. Currently juggles a Notion wiki + an Inkarnate map + a hand-drawn timeline + their head. Needs: nation creation that produces stat-block-tier output (stab-ready), inter-nation relationships visible at a glance, "show me the world as of three sessions ago" without a heroic spreadsheet.

**2. The Worldbuilding Novelist (bridge, MVP-adjacent).**
Writing a series; needs nation continuity across books, internally consistent geography, and a place to track who-rules-what-when as the timeline progresses across the books. Higher willingness to pay than GMs. Lighter on in-session usability; heavier on export / world-bible features. MVP serves them at lower fidelity than the GM persona — that's fine.

**3. The Pathfinder / Other-System GM (later expansion).**
Same shape as 5E GM but with PF2e / Cypher / homebrew rule systems. Out of scope for MVP. PF2e support arrives in v2 once 5E is solid.

## 4. Group B — Product & roadmap

### 4.1 PRD.md content

**MVP feature list.**

_Foundations_

- Email + OAuth auth, multi-tenant from day one (user → workspaces → worlds).
- Time-versioned world state — every entity (nation, border, leadership, factbook value, relationship) is event-sourced with timestamps. All reads are as-of-date.

_Geography_

- Real-Earth-derived: NASA SRTM (1-arcsec land) / ETOPO (combined) / GEBCO (bathymetry) public-domain tiles. Crop, rotate, mirror, composite to build a fantasy world.
- Stage 3.5a Resources pass: Poisson placement of magic nodes + mineral / lumber / fishery / arable deposits, biome-affinity-weighted.
- Stage 3.5b Terrain Analysis: chokepoint / pass / strategic-hub detection via betweenness centrality (Brandes' algorithm).
- World Magic Level slider on world creation (low / standard / high / wild).

_Nation creation_

- Draw / lasso a region → Territorial Audit (resources, key terrain, G-baseline) → optional "Align to Audit" → 4-module DIME-Plus interview (Sovereignty / War & Arcana / Prosperity / Environment & Perception).
- Government + religion drop-downs with derived L floor / cap.
- Pool taps (Geography / Resources / Magic) with GM-override checkboxes.
- 5 cascading rules (anarchy → L cap, theocratic → force religion, E≥5 → civ-tier floor, M\*≥7 → unlock telepathic-consensus, D=1 → disable embassy trigger).
- 5 magic-trigger map renders (sentinel filter, golden glow, ley line overlay, vanguard forts, the landmark).
- Three overlap modes (additive / subtractive / contested) on polygon intersection.
- Lasso & Label for GM-tagged features (Strategic Pass, Holy Site, Planar Rift, etc.).

_Outputs_

- Intelligence Briefing factbook (sovereignty / power projection / field notes).
- Gazetteer with three lenses (Commoner / Scholar / Tactician).
- Generic-archetype pantheon with master naming dictionary per world.

_Multi-nation + relationships_

- N nations per world, switcher, simultaneous map overlay.
- Relationships graph layer: diplomacy / trade route / active war / vassalage edges. View as map overlay or as a graph panel.

_Timeline + events_

- Calendar with current-date display + advance-by-N-days control.
- World-state scrubber across the campaign timeline.
- Event injection ("Nation A declares war on Nation B," etc.) — predefined rules engine applies deterministic deltas; tuned Gemma narrates the prose summary; both are stored, both are timestamped.

_5E content_

- 9 species (Human, Elf, Dwarf, Halfling, Tiefling, Dragonborn, Gnome, Half-Elf, Half-Orc), 5E pantheons, cp/sp/ep/gp/pp currency schema, civ-tier ages, SRD capital-defender stat block per nation.

**Explicitly OUT of MVP.**
Plate tectonics, AI/diffusion geography generation, pre-history auto-generation, multi-renderer styles (parchment, satellite, Tolkien, isometric), civilization simulation layer, in-play magic-pool reallocation (one-shot at creation only — schema accommodates, UI doesn't expose), VTT integration, Pathfinder / non-5E support, N-claimant contested territories (MVP supports 2), border snapping to geographic features. _[User to extend.]_

**Success criteria.**

- Beta GM creates 3+ nations in <30 minutes per nation.
- World-state scrubber returns correct as-of-date data for any timestamp.
- LLM narration regeneration is reproducible (same inputs → same prose, modulo model temperature pinned to 0).

### 4.2 ROADMAP.md content

- **v0 — MVP (~3 months from kickoff).** Everything in PRD. Closed beta of 5-10 GMs.
- **v1 — Moats & polish (~6 months post-MVP).** Plate tectonics simulation (the geography moat); diffusion-mediated terrain mutation (Earth tile + prompt → variant); pre-history auto-generation; in-play magic-pool reallocation; border snapping; N-claimant contested territories.
- **v2 — Surface expansion (~12 months post-MVP).** Multi-renderer styles (parchment / satellite / Tolkien / isometric / geological); civilization simulation layer (climate × geography → cultural plausibility); LLM control surface (natural-language → simulation parameters); PF2e + Cypher rule-system support.
- **v3+ — Signposted, not committed.** Time-as-dimension scrubbing into pre-MVP geological history; VTT integrations (Foundry / Roll20 export); game-studio API tier.

## 5. Group C — Engineering

### 5.1 TECH_STACK.md content

**Frontend.** Next.js (App Router) + TypeScript. Picked for ecosystem mass and SaaS-scaffolding density over SvelteKit's reactivity edge. Compensate for the editor-surface reactivity gap with **Zustand** (global state) or **Jotai** (atoms), and `react-flow` for the relationships graph. Re-openable decision — flag for `/design-consultation` if SvelteKit becomes compelling once editor surfaces are wireframed.

**Backend.** Supabase (Postgres + Auth + Storage + Edge Functions + Realtime). One vendor, low ops cost. Edge Functions handle anything that can't be done client-side (raster crop pipeline, LLM proxy in production).

**Database schema shape.** Event-sourced. Every entity has an append-only event log; current state is a materialized view over events as-of-now. World-state scrubber reads materialized views as-of any past timestamp.

**Geography stack.**

- Tile sources: NASA SRTM, GEBCO, ETOPO. Public domain.
- Server-side raster: `sharp` for image ops, `geotiff.js` (or wasm-gdal) for georeferenced reads.
- Client display: **MapLibre GL JS** with a custom heightmap-tile source.

**LLM stack.**

- Local dev: **Ollama** runtime + fine-tuned Gemma (current generation; user identified Gemma 4 as target — pin the exact base model in the manifest once chosen).
- Fine-tuning: LoRA via Unsloth or Axolotl on a hand-curated corpus of `(event, state-delta, prose-summary)` tuples.
- Production hosting: **TBD — `/design-consultation` resolves**. Three live options: (a) self-host on a single GPU box behind the API, (b) Modal / Replicate / Together / Hyperbolic, (c) WebGPU-in-browser if the model is small enough. Each has cost / latency / determinism implications.
- **Determinism rule:** LLM produces _prose only_, never state. Rules engine produces state deltas deterministically. Temperature pinned to 0 for prose regeneration; same inputs → same outputs.

**Determinism utilities (carry-forward port).** TypeScript implementations of `splitmix64` (stage-seed derivation) and `xoshiro256**` (RNG). Pin exact versions of any byte-affecting library in `package.json` with `--save-exact` and document the pin policy in `CONTRIBUTING.md`.

**Testing.** Vitest for unit / integration; Playwright for E2E (works with gstack `/qa` and `/browse`). Characteristic-stat tests for any procgen output (asserts statistical properties don't drift across refactors).

**Deploy.** Vercel for Next.js + Supabase cloud. `/setup-deploy` will configure when ready.

### 5.2 ARCHITECTURE_PRINCIPLES.md content

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

### 5.3 CARRY_FORWARD.md content

Knowledge (not code) preserved across the pivot from project_aria. Reference these as design inputs without grepping the old branch.

- **Splitmix64** finalizer for stage-seed derivation; **Xoshiro256\*\*** for the RNG itself.
- **Slerp** for great-circle interpolation; never lerp-on-cartesian-then-normalize.
- **3D unit-sphere noise sampling** instead of 2D pixel-space noise (eliminates dateline / pole artifacts). Relevant once we add sub-tile biome variation on top of Earth crops.
- **Asymmetric elevation diffusion** for mountain sharpness (downhill diffusion stronger than uphill). Reusable for v1 plate-tectonics polish.
- **PCA-aligned orogeny spines** with top-10% extreme sampling. Placeholder until plate tectonics — same envelope math (cosine envelope × ridge × falloff) ports cleanly with input shape changing from spine polylines to plate-boundary segments.
- **Round-robin BFS** (strict one-pop-per-seed-per-iteration) for parallel region growth. Reusable for v1 territory growth between plates.
- **Two-phase WASM pattern** (Phase 1: sample to `Box<[f32]>`, Phase 2: compose). The buffer boundary is the swap point for a future WebGPU compute path.
- **Radiometric calibration schema** for heightmap export: `#000000` = trench, `#808080` = sea level, `#FFFFFF` = peak; 16-bit TIFF for full precision.
- **Circular padding** for seamless dateline wrapping.
- **Mask is source-of-truth for is-land** — also enshrined as Architecture Principle #6.

## 6. Group D — Operational

### 6.1 CLAUDE.md content

**What MAURO is.** Worldbuilding workspace for TTRPG GMs (5E primary, MVP) and worldbuilding novelists. Real-Earth-derived geography + multi-nation factbook + time-versioned simulation + LLM-narrated events. See `docs/BRD.md` for full positioning.

**Hard rules — these come up enough to inline.**

1. **GPL clean-room.** Never read source from SotE, SongsOfGPL, Gleba, or other GPL'd procgen tools. Concepts from devlogs / academic papers are fine. Full policy: `docs/ARCHITECTURE_PRINCIPLES.md` §7.
2. **Determinism contract.** RNG-driven code uses splitmix64 stage-seeding + xoshiro256\*\* RNG. Byte-affecting dependencies pinned exactly with `--save-exact`. Pin policy lives in the manifest, not folklore.
3. **LLM never produces state.** Rules engine produces state deltas; LLM produces narrative prose only.
4. **Time-versioned by default.** No in-place mutations to persistent world state. Every change is an event with a timestamp.
5. **Substrate-first.** Pipeline stages communicate through the WorldQuery API, not by reaching into each other's data.
6. **Mask is source-of-truth for is-land.** See `docs/CARRY_FORWARD.md` for context.

**Pointers.**

- `docs/BRD.md` — what we're building and for whom
- `docs/PRD.md` — MVP feature list and out-of-scope
- `docs/PERSONAS.md` — primary / bridge / future personas
- `docs/TECH_STACK.md` — chosen stack with rationale
- `docs/ARCHITECTURE_PRINCIPLES.md` — load-bearing rules
- `docs/CARRY_FORWARD.md` — algorithmic insights from project_aria
- `docs/ROADMAP.md` — MVP / v1 / v2 staging

**gstack workflow expectations.**

- Ideation → `/office-hours` (saves to `docs/superpowers/specs/`)
- Design system → `/design-consultation` (writes `docs/DESIGN.md`)
- Pre-implementation review → `/plan-ceo-review`, `/plan-design-review`, `/plan-eng-review`, or `/autoplan` for the chained version
- Implementation → superpowers TDD + writing-plans skills
- QA → `/qa` (test-fix-verify loop) or `/qa-only` (report only)
- Ship → `/ship` → `/land-and-deploy` → `/canary`

**Coding conventions.**

- TypeScript strict mode, Prettier + ESLint + import-sort.
- Files focused on one job; if a file passes ~300 lines, ask whether it's doing too much.
- No comments explaining WHAT (well-named identifiers do that). Comments only for non-obvious WHY.
- Test names describe behavior, not implementation.
- Commit messages: `<type>(<scope>): <subject>` (e.g., `feat(sim): add betweenness centrality for chokepoint detection`).

**Testing rules.**

- Unit + integration: Vitest. E2E: Playwright.
- Procgen / rules-engine code gets **characteristic-stat tests** in addition to byte-identical seed-pinned tests.
- TDD per the superpowers `test-driven-development` skill — tests before implementation for non-trivial work.

**What NOT to do.**

- No reading source from GPL'd procgen tools.
- No mutating world state in place.
- No LLM-in-state-path.
- No "modernizing" the exact-pin policy without explicit discussion.
- No introducing dependencies that aren't on the manifest's pin list without justification.
- No new top-level docs without checking whether an existing one is the right home.

### 6.2 Repo skeleton

```
mauro/
├── apps/
│   └── web/                       # Next.js App Router (the SaaS)
│       ├── app/                   # routes
│       ├── components/
│       ├── lib/                   # client-side helpers
│       └── package.json
├── packages/
│   ├── sim/                       # rules engine, WorldQuery API, RNG, event sourcing
│   │   ├── src/
│   │   │   ├── rng/               # splitmix64, xoshiro256**
│   │   │   ├── events/            # event types, rules engine, deltas
│   │   │   ├── query/             # WorldQuery API
│   │   │   └── nation/            # DIME-Plus, factbook, gazetteer
│   │   ├── tests/
│   │   └── package.json
│   ├── llm/                       # Ollama client + prompts + fine-tune harness
│   │   ├── src/
│   │   ├── prompts/               # prompt templates per event type
│   │   ├── training/              # LoRA fine-tune scripts + curated corpus
│   │   └── package.json
│   └── geo/                       # raster ops (Earth tile crop / composite / mutate)
│       ├── src/
│       └── package.json
├── supabase/
│   ├── migrations/
│   ├── functions/                 # Edge Functions
│   └── seed.sql
├── docs/
│   ├── BRD.md
│   ├── PRD.md
│   ├── PERSONAS.md
│   ├── TECH_STACK.md
│   ├── ARCHITECTURE_PRINCIPLES.md
│   ├── CARRY_FORWARD.md
│   ├── ROADMAP.md
│   └── superpowers/
│       └── specs/                 # /office-hours, brainstorm specs land here
├── e2e/                           # Playwright tests
├── scripts/
├── CLAUDE.md
├── CONTRIBUTING.md                # GPL clean-room, exact-pin policy, PR workflow
├── README.md
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 7. Out of scope for this spec

- Executing any gstack pipeline stage (`/office-hours`, `/design-consultation`, plan reviews). This spec produces the _inputs_ to that pipeline.
- Authoring `docs/DESIGN.md` (the design system) — that's `/design-consultation`'s output, post-kickoff.
- Implementation of any feature. Implementation plan comes from the writing-plans skill, post-spec-approval.
- Production LLM hosting choice — deferred to `/design-consultation`.
- Pricing tier / monetization design — deferred.
- Beta plan / GM invitation list — deferred.
- Fine-tune corpus curation strategy — deferred (precondition: schema for events / state-deltas exists first).

## 8. Open questions parked

- **Framework re-open:** Next.js vs SvelteKit. Decision: Next.js for MVP. Re-openable at `/design-consultation` if editor surfaces argue otherwise.
- **MAURO acronym / naming meaning** — currently a name, not an acronym. User to decide whether it stands for anything.
- **Pricing tier** — free-tier scope, paid-tier features, monthly vs. annual, per-world charges, etc.
- **Beta plan** — closed beta first or open from day 1; how GMs are invited.
- **VTT integration timeline** — currently v3+; could pull forward if a Foundry-shaped partnership emerges.
- **Pathfinder / non-5E support** — currently v2; defensible to pull forward if 5E SRD content turns out narrower than expected.

## 9. Implementation transition

Once approved, the writing-plans skill produces an implementation plan covering:

1. Initialize MAURO directory at `E:\projects\MAURO` (`git init`, `pnpm init`, monorepo scaffolding).
2. Write each of the 11 deliverable files in §2.
3. Wire up the package skeleton (Next.js, Vitest, Playwright, Supabase CLI link, Ollama connectivity check).
4. Initial commit + README quickstart sufficient to `pnpm dev` and see a "Hello MAURO" page.

The plan reviews + execution itself happen via the gstack pipeline (`/plan-eng-review`, etc.) once the user is ready to drive them.
