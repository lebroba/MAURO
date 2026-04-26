# MAURO — Business Requirements

## Positioning

> MAURO is a worldbuilding workspace for tabletop GMs and worldbuilding novelists. GMs draw worlds from real-Earth geography, populate them with CIA-factbook-style nations, and run a time-versioned simulation that tracks history as the campaign unfolds.

## Why-now thesis

- Inkarnate / Wonderdraft / Azgaar own "draw a pretty map." None own "the map is alive — it has factions, history, and consequences."
- Local-LLM tooling (Gemma family on consumer GPUs) is now good enough to narrate consequence propagation without per-request cloud cost.
- Real-Earth public-domain heightmap data (NASA SRTM, ETOPO, GEBCO) makes Earth-quality geography free for MVP.

## Customer thesis

- _Primary:_ D&D 5E GMs running campaigns 1+ years long with named factions, evolving political situations, and a need for "what does the world look like after Session 17?" answers.
- _Bridge:_ worldbuilding novelists who want to track nation states + timeline coherence without ad-hoc spreadsheets and wikis.
- _Out of scope as a paying line:_ defense / wargaming customers (procurement-driven, FedRAMP, not the product shape).

## Scope guardrails — what MAURO is NOT

_(User flagged this section as critical — leave room for additions.)_

- Not a VTT (Foundry / Roll20 cover that). MAURO may export _to_ a VTT later.
- Not an encounter / combat tool (D&D Beyond, etc.).
- Not a campaign-session log (handled by Notion / Obsidian / VTTs).
- Not an AI-from-nothing world generator. The LLM mediates events; geography comes from real Earth.
- _[User to extend this list as constraints are discovered.]_

## Success criteria for kickoff

- 5-10 GM beta testers running a real campaign world in MAURO within ~3 months of starting code.
- Each beta GM creates ≥3 nations and runs the timeline scrubber at least once during a real session.
