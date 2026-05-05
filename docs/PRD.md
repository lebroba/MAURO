# MAURO — Product Requirements

## MVP feature list

_Foundations_

- Email + OAuth auth, multi-tenant from day one (user → workspaces → worlds).
- Time-versioned world state — every entity (nation, border, leadership, factbook value, relationship) is event-sourced with timestamps. All reads are as-of-date.

_Geography_

- Real-Earth-derived: NASA SRTM (1-arcsec land) / ETOPO (combined) / GEBCO (bathymetry) public-domain tiles. Crop, rotate, mirror, composite to build a fantasy world.
- Stage 3.5a Resources pass: Poisson placement of magic nodes + mineral / lumber / fishery / arable deposits, biome-affinity-weighted.
- Stage 3.5b Terrain Analysis: chokepoint / pass / strategic-hub detection via betweenness centrality (Brandes' algorithm).
- World Magic Level slider on world creation (low / standard / high / wild).

_Nation creation_

- Draw / lasso a region → Territorial Audit (resources, key terrain, G-baseline) → optional "Align to Audit" → 4-module interview grouping the DIME+FIL+MCG framework (Diplomacy / Information / Military / Economy / Finance / Intelligence / Law Enforcement / Magic / Culture / Geography). The 4 modules are: Sovereignty & Foundation (D, C, L), War Machine & Arcana (M, M*, I²), Prosperity & Flow (E, F), Environment & Perception (G, I).
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

## Explicitly OUT of MVP

Plate tectonics, AI/diffusion geography generation, pre-history auto-generation, multi-renderer styles (parchment, satellite, Tolkien, isometric), civilization simulation layer, in-play magic-pool reallocation (one-shot at creation only — schema accommodates, UI doesn't expose), VTT integration, Pathfinder / non-5E support, N-claimant contested territories (MVP supports 2), border snapping to geographic features. _[User to extend.]_

## Success criteria

- Beta GM creates 3+ nations in <30 minutes per nation.
- World-state scrubber returns correct as-of-date data for any timestamp.
- LLM narration regeneration is reproducible (same inputs → same prose, modulo model temperature pinned to 0).
