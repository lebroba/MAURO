# MAURO — TODOs

Captured deferrals. Each item names a specific future moment that brings it back.

## v0.1 (after first feature ships)

### NPC roster — 10 attribute heads + Head of Country

**What:** Extend the DIME-Plus interview to capture 11 named NPCs per nation: one head per DIME+FIL+MCG attribute (Diplomat, Spymaster/Information chief, General/Military head, Treasurer/Economy head, Comptroller/Finance head, Intelligence director, Justice/Law Enforcement chief, Magus/Magic head, Cultural Minister, Geographer) + Head of Country. Names + brief sigils/notes surface in the factbook as a new "Notable Figures" section.

**Why:** Schwif-T's strongest specific content ask in the 4/18/2026 Discord transcript was *"Key figure Population (5-10 important people or archetypes you will meet)"*. The 10-attribute DIME+FIL+MCG framework naturally generates this roster — naming the head of each attribute IS the NPC list. This wasn't in the original PRD or the canonical project_aria spec; emerged during the 2026-05-04 office-hours framework correction.

**Pros:** Direct hit on Schwif-T's stated content ask. Trivially derives from the framework already in scope. Each NPC gets a "role" tag (e.g., "Head of Diplomacy") which doubles as a mechanical handle for future v1 work (diplomacy actions need a diplomat to enact them).

**Cons:** Adds 11 text inputs to the interview UI; expands the factbook output; potentially overlaps with player/NPC management features that are out of scope for the entire v0/v1 product.

**Context:** Captured during /plan-eng-review on 2026-05-04. The framework correction section of `docs/superpowers/specs/2026-05-04-dime-thin-slice-design.md` calls this out as Phase 2 work. Schwif-T's Discord transcript is the primary demand evidence; he hasn't seen MAURO's specific implementation of "named heads" yet, so do not commit to the exact framing until he tries the thin slice and gives feedback.

**Depends on:** Thin-slice DIME shipped + Schwif-T tested it. His feedback may reshape the framing (e.g., "I want 5 figures total, not 11" or "I want figures with relationship edges between them").

**Originating review:** /plan-eng-review 2026-05-04, TODO candidate 1.

---

### Keyboard polygon-draw fallback — accessibility

**What:** Add a keyboard-accessible alternative to the mouse/touch freehand polygon-draw. Two viable approaches:
1. **Click-to-add-vertices keyboard mode:** Tab focuses map → Enter starts add-vertex mode → Arrow keys move a crosshair → Enter places a vertex → Esc closes the polygon.
2. **Bounding-rectangle-by-coordinates form:** keyboard users get a separate form with two lat/lon corner inputs that produces a rectangular polygon. Lossy spatial fidelity but functional.

**Why:** DESIGN.md principle 7: *"Accessibility is not optional."* The thin slice ships freehand polygon-draw as mouse/touch only — fundamentally pointer-input. Keyboard users have no path to the Establish Nation feature.

**Pros:** Closes a real WCAG gap; keeps the product usable by GMs who don't use a mouse. Approach 1 is closer to the lasso UX; approach 2 is simpler but compromises spatial fidelity.

**Cons:** Either approach is 30-100 lines of keyboard-mode logic. Schwif-T uses a mouse, so this won't be hit by the primary beta user. Easy to defer until a non-mouse user reports it.

**Context:** Captured during /plan-design-review on 2026-05-04, Pass 6 issue. The thin slice's mouse/touch polygon-draw lives in `apps/web/src/components/MapView.tsx` (or successor file) — keyboard mode would attach to the same component.

**Depends on:** A non-mouse user (or accessibility audit) reporting this. Don't build speculatively.

**Originating review:** /plan-design-review 2026-05-04, Pass 6.

---

### Persistent interview drafts — IndexedDB autosave

**What:** Add IndexedDB-backed autosave to the DIME-Plus interview. Per spec §13, this is the `NationDraftStarted` / `NationFieldChanged` event pattern with local-only persistence (separate from the canonical NationCreated event that ships at submit). Recover-on-reload restores the GM's in-progress slider values and dropdown picks.

**Why:** Approach A in the 2026-05-04 design doc deliberately ships *without* draft persistence to keep the wedge tight. The trade-off is that any browser crash, accidental refresh, or back-button-mid-interview loses work. For Schwif-T's first session (likely 20-30 min of slider tuning per nation), this could be a real UX hit.

**Pros:** Removes a known UX cliff; standard local-first pattern; matches the canonical project_aria spec design.

**Cons:** Adds an IndexedDB code path + a draft-state-vs-final-state distinction that interview UI logic must handle (e.g., "warn before exit if draft has unsaved changes").

**Context:** Captured during /plan-eng-review on 2026-05-04. Trigger condition: only build this if Schwif-T reports losing work on refresh during his thin-slice test. Don't build speculatively. The design doc's Premise 4 already documents the deliberate cut.

**Depends on:** Schwif-T's thin-slice feedback. If he says "ugh, I lost my work" → build. If he doesn't mention it → leave deferred.

**Originating review:** /plan-eng-review 2026-05-04, TODO candidate 2.

---

### WorldQuery snapshot caching

**What:** Add per-world snapshot caching to `WorldQuery.getWorldAsOf()` so replay cost doesn't grow linearly with event count.

**Why:** v0 reducer is fast (≤2 events per world, replay <100ms). Feature #2 (DIME-Plus nation creation) produces dozens of events per world. Without caching, replay against 50+ events with the source heightmap fetched from Supabase Storage will be 3-5 seconds — molasses on every world detail page load.

**Pros:** Pre-emptively solves a known problem before feature #2 ships. Cache invalidation is straightforward because events are append-only (the cache key is `(worldId, latestEventId)` — when a new event lands, the previous snapshot is naturally stale).

**Cons:** Adds a code path (cache read, miss handling, write). Subtle bugs around concurrent invalidation are possible if not carefully designed.

**Context:** v0's `WorldQuery` does: SELECT worlds → SELECT events → load source heightmap from Storage → fold events → hash. Step 3 is the most expensive (network + bytes). Caching strategy: store the post-replay heightmap bytes keyed by `(worldId, latestEventId)` in Supabase Storage `world-snapshots/`; new event invalidates by being a new key.

**Depends on:** feature #2 (DIME-Plus) sequencing. Only blocks if DIME-Plus arrives before scaling work.

**Originating review:** `/plan-eng-review` 2026-04-28, outside voice round 3.

---

### Multi-tile composer (v0.1 main feature)

**What:** Replace v0's single-tile dropdown with the multi-tile composer described in the original Approach A: pick up to 3 source tiles, rotate (0/90/180/270), mirror (none/horizontal/vertical), drop onto a canvas, position, see live preview.

**Why:** The composer was the visceral hook in the office-hours pitch — "stitch Patagonia to Norway." v0 ships a curated dropdown to validate the substrate; v0.1 ships the composer to validate the hook fully.

**Context:** Cut from v0 because (a) the composer alone is multi-week work and (b) the read-side pipeline (Edge Function tile crop, custom MapLibre heightmap source, Terrain-RGB encoding) was the single-largest scope risk. v0 deliberately ships static raster + offline prep so the composer can come back as additive work, not architectural surgery.

**Depends on:** v0 substrate validated by 3 GMs.

**Originating review:** office-hours 2026-04-28 round 1, scope cut.

---

### Custom SMTP for magic-link

**What:** Configure a custom SMTP provider (Resend, Postmark, SES) in `supabase/config.toml` instead of using Supabase's default SMTP.

**Why:** Supabase free-tier default SMTP throttles at ~3-4 emails/hour. Beta GMs will hit the limit on day 1 of trying to demo MAURO to their groups. The first time a user clicks "send link" twice in quick succession, the second one silently fails.

**Pros:** ~30 minutes of work. Removes the v0's most embarrassing known limitation.

**Cons:** Adds a third-party dependency. Costs $5-10/month for low-volume Resend or Postmark.

**Context:** Documented as a v0 known limitation in `Distribution Plan`. If shipping with default SMTP, the GM welcome email warns about double-clicking.

**Depends on:** GMs reporting hitting the limit (or pre-emptive fix before first deploy).

**Originating review:** `/plan-eng-review` 2026-04-28, outside voice round 3.

---

### Render retry sweep

**What:** A `/api/admin/retry-failed-renders` cron that detects worlds whose `WorldQuery` substrateHash has no PNG in Storage and re-renders them.

**Why:** v0's render strategy is synchronous-in-route with a defensive read-side fallback. Both are best-effort; an event row could exist with no PNG if the writer route 5xx'd between event commit and Storage upload AND no read ever triggers the fallback. Unlikely with 3 users; possible with 30+.

**Pros:** Defense in depth. Sweeps stuck states automatically.

**Cons:** Adds a cron + admin endpoint + alerting. Premature for 3-user beta.

**Context:** Round 3 outside voice flagged the trigger+webhook design as over-engineered for v0 — the synchronous-render fix doesn't add this cron. If beta scales past ~10 users with magic-link bugs, revisit.

**Depends on:** beta user count >10 OR observed broken-image reports.

**Originating review:** `/plan-eng-review` 2026-04-28.

---

### Sharp cold-start mitigation

**What:** Investigate options for reducing Vercel function cold-start latency on the render route. Options: Vercel fluid compute, AWS Lambda with provisioned concurrency, separate render worker (Fly.io / Render.com background worker).

**Why:** Sharp + libvips adds 500-2000ms to cold starts. v0 has 6 renders total in beta; every render is a cold start. v0.1 with multi-tile composer + more event types will see more renders; cold start latency starts to bite.

**Pros:** Lower perceived render latency.

**Cons:** Likely costs Vercel Pro ($20/month) or moves render outside Vercel entirely (deployment complexity).

**Depends on:** v0.1 tile composer being slow enough that users complain.

**Originating review:** `/plan-eng-review` 2026-04-28, outside voice round 3.

---

### Additional planetary tiles

**What:** Expand the tile registry beyond v0's five (Earth × 3, Mars × 1, Moon × 1) with additional public-domain DEMs from the rest of the solar system.

**Why:** v0 already establishes the wedge — "build your fantasy continent from real Mars" is unique to MAURO. Extending the catalog deepens the moat, gives returning beta GMs new substrate to play with, and is essentially zero marginal pipeline work because `prep-tiles.ts` already handles GeoTIFF input regardless of source body.

**Pros:** Each new body adds one tile entry, one CHECK constraint update, and one prep run. ~30 min/tile of work for a feature that GMs will keep finding for months. Several bodies have no Earth analog (no Earth ridge looks like Olympus Mons; no Earth crater looks like Tycho).

**Cons:** Hillshade lighting params need per-body tuning (lunar maria are nearly flat at MOLA's resolution — needs higher zFactor; Mars has wildly different relief scales between Tharsis bulge and northern lowlands). Some bodies (Venus, Titan) have unusual signal characteristics that the hillshade module may need tweaks to render well.

**Candidate bodies + iconic regions:**
- **More Mars regions** — Valles Marineris (4,000 km canyon), Hellas Basin (largest impact crater), Northern Lowlands (smooth alien plains)
- **More Moon regions** — Tycho crater + ray system, South Pole–Aitken basin, Mare Crisium
- **Mercury** — MESSENGER MDIS-derived global DEM. Heavily cratered, looks like the Moon but more so. Caloris basin is iconic.
- **Venus** — Magellan radar topography. Maxwell Montes (~11 km tall, taller than Everest). The whole surface is alien because it's volcanic and resurfaced.
- **Titan** — Cassini RADAR. Sparse coverage but iconic dunes and methane seas.
- **Pluto / Charon** — New Horizons topographic data. Sputnik Planitia (heart-shaped nitrogen ice plain), Cthulhu Macula (dark cratered highland).
- **Asteroids / comets** — Bennu, Itokawa, 67P/Churyumov–Gerasimenko. Small total surface, but the SHAPES are fundamentally weird (rubble-pile asteroids look nothing like any planet). Perfect for "isolated micro-world" campaigns.

**Sources (all public domain):** USGS Astrogeology Annex (https://astrogeology.usgs.gov/search/map/) is the single best entry point. PDS (Planetary Data System) backs everything. NASA's data-release policy is permissive across all missions.

**Slug naming convention:** `{body}-{feature}` per the v0 convention. Examples: `mars-valles`, `mars-hellas`, `moon-tycho`, `mercury-caloris`, `venus-maxwell`, `titan-ligeia`, `pluto-sputnik`, `bennu-full`.

**Depends on:** v0 ships and validates the pipeline against the initial 5-tile mix. Pull forward a body if a beta GM specifically requests it (high-signal demand).

**Originating moment:** 2026-04-29 — user asked "are there any other planets we could use?" while discussing GeoTIFF acquisition. Locked Mars + Moon for v0 and parked the rest here.

---

## v1 (per ROADMAP.md)

Captured here as cross-references; full descriptions live in `docs/ROADMAP.md`.

- Plate tectonics simulation.
- Diffusion-mediated terrain mutation.
- Pre-history auto-generation.
- In-play magic-pool reallocation.
- Border snapping to geographic features.
- N-claimant contested territories.
- Cross-architecture (ARM) determinism CI.

---

## v2+ (per ROADMAP.md)

- Multi-renderer styles (parchment / satellite / Tolkien / isometric).
- Civilization simulation layer.
- LLM control surface (natural-language → simulation parameters).
- PF2e + Cypher rule-system support.
