# MAURO

Worldbuilding workspace for tabletop GMs and worldbuilding novelists. Real-Earth-derived geography + multi-nation factbook + time-versioned simulation + LLM-narrated events.

For positioning and customer thesis, see [`docs/BRD.md`](docs/BRD.md).
For MVP scope, see [`docs/PRD.md`](docs/PRD.md).
For architecture rules, see [`docs/ARCHITECTURE_PRINCIPLES.md`](docs/ARCHITECTURE_PRINCIPLES.md).
For project conventions when working with Claude / Cursor / etc., see [`CLAUDE.md`](CLAUDE.md).

## Quickstart

```bash
# Install dependencies
pnpm install

# Run the web app
pnpm dev
# → opens http://localhost:3000 with the "Hello MAURO" page

# Run the smoke test
pnpm test:e2e
```

## Repo layout

```
mauro/
├── apps/web/              # Next.js App Router (the SaaS)
├── packages/
│   ├── sim/               # rules engine, WorldQuery API, RNG
│   ├── llm/               # Ollama client + prompts + fine-tune harness
│   └── geo/               # raster ops over real-Earth tiles
├── supabase/              # migrations, edge functions, seed
├── docs/                  # BRD, PRD, personas, tech stack, principles, carry-forward, roadmap
├── e2e/                   # Playwright smoke tests
├── CLAUDE.md              # project conventions
├── CONTRIBUTING.md        # GPL clean-room policy, exact-pin policy, PR workflow
└── README.md              # this file
```

## Status

Pre-MVP scaffolding only. The next development pass uses the gstack pipeline:

1. `/office-hours` — open ideation on first feature
2. `/design-consultation` — establish design system → `docs/DESIGN.md`
3. `/plan-eng-review`, `/plan-design-review` — lock implementation plans
4. Implementation → `/qa` → `/ship` → `/land-and-deploy`
