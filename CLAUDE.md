# CLAUDE.md

## What MAURO is

Worldbuilding workspace for TTRPG GMs (5E primary, MVP) and worldbuilding novelists. Real-Earth-derived geography + multi-nation factbook + time-versioned simulation + LLM-narrated events. See `docs/BRD.md` for full positioning.

## Hard rules — these come up enough to inline

1. **GPL clean-room.** Never read source from SotE, SongsOfGPL, Gleba, or other GPL'd procgen tools. Concepts from devlogs / academic papers are fine. Full policy: `docs/ARCHITECTURE_PRINCIPLES.md` §7.
2. **Determinism contract.** RNG-driven code uses splitmix64 stage-seeding + xoshiro256\*\* RNG. Byte-affecting dependencies pinned exactly with `--save-exact`. Pin policy lives in the manifest, not folklore.
3. **LLM never produces state.** Rules engine produces state deltas; LLM produces narrative prose only.
4. **Time-versioned by default.** No in-place mutations to persistent world state. Every change is an event with a timestamp.
5. **Substrate-first.** Pipeline stages communicate through the WorldQuery API, not by reaching into each other's data.
6. **Mask is source-of-truth for is-land.** See `docs/CARRY_FORWARD.md` for context.
7. **World is spherical, 2D is a render.** Coordinates are `(lon, lat)`. Noise wraps at lon = ±180. Densities are cosine-latitude weighted. Plate tectonics uses Euler rotations on a sphere, never 2D translation (this one cannot be retrofitted). Polar zones (~10°) are render-distortion zones by policy. Full rules and hex-grid tradeoff: `docs/ARCHITECTURE_PRINCIPLES.md` §10.

## Pointers

- `docs/BRD.md` — what we're building and for whom
- `docs/PRD.md` — MVP feature list and out-of-scope
- `docs/PERSONAS.md` — primary / bridge / future personas
- `docs/TECH_STACK.md` — chosen stack with rationale
- `docs/ARCHITECTURE_PRINCIPLES.md` — load-bearing rules
- `docs/CARRY_FORWARD.md` — algorithmic insights from project_aria
- `docs/ROADMAP.md` — MVP / v1 / v2 staging

## gstack workflow expectations

- Ideation → `/office-hours` (saves to `docs/superpowers/specs/`)
- Design system → `/design-consultation` (writes `docs/DESIGN.md`)
- Pre-implementation review → `/plan-ceo-review`, `/plan-design-review`, `/plan-eng-review`, or `/autoplan` for the chained version
- Implementation → superpowers TDD + writing-plans skills
- QA → `/qa` (test-fix-verify loop) or `/qa-only` (report only)
- Ship → `/ship` → `/land-and-deploy` → `/canary`

## Coding conventions

- TypeScript strict mode, Prettier + ESLint + import-sort.
- Files focused on one job; if a file passes ~300 lines, ask whether it's doing too much.
- No comments explaining WHAT (well-named identifiers do that). Comments only for non-obvious WHY.
- Test names describe behavior, not implementation.
- Commit messages: `<type>(<scope>): <subject>` (e.g., `feat(sim): add betweenness centrality for chokepoint detection`).

## Testing rules

- Unit + integration: Vitest. E2E: Playwright.
- Procgen / rules-engine code gets **characteristic-stat tests** in addition to byte-identical seed-pinned tests.
- TDD per the superpowers `test-driven-development` skill — tests before implementation for non-trivial work.

## What NOT to do

- No reading source from GPL'd procgen tools.
- No mutating world state in place.
- No LLM-in-state-path.
- No "modernizing" the exact-pin policy without explicit discussion.
- No introducing dependencies that aren't on the manifest's pin list without justification.
- No new top-level docs without checking whether an existing one is the right home.

## Design System

**Always read `DESIGN.md` before making any visual or UI decisions.** All font choices, colors, spacing, layout, and aesthetic direction are defined there. Do not deviate without explicit user approval.

Aesthetic direction is **Cartographic Intelligence** — paper as substrate, not parchment as costume. Two serifs (Fraunces + Source Serif 4), one grotesque (Inter Tight), one mono (JetBrains Mono). Warm-paper neutrals + two restrained accents (stamp red `#B8442C`, verdigris `#3B6B5A`). Border-radius is 2px max except for circular scrubber pins.

**Forbidden patterns** that AI-assisted UI work tends to default to and that MAURO explicitly rejects:
- Purple/violet gradients
- 3-column icon-in-circle feature grids
- Glassmorphism, frosted backgrounds, or any background blur
- `border-radius` above 2px on rectangles (buttons, cards, inputs, panels)
- `Inter` (regular, not Inter Tight) as a primary font
- Centered hero sections with three-feature card grids
- "Built for ___" or "AI-powered ___" marketing copy
- Emoji icons in UI (✨, 🚀, 🎯, etc.) — no exceptions in app surfaces

In `/qa` mode, flag any code that doesn't match `DESIGN.md`.
