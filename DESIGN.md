# Design System — MAURO

## Product Context

- **What this is:** A worldbuilding workspace for tabletop RPG game masters and worldbuilding novelists. Real-Earth-derived geography, multi-nation factbook outputs, time-versioned simulation with LLM-narrated events.
- **Who it's for:** Long-campaign D&D 5E GMs (12+ months, named factions, political tension) who currently juggle a Notion wiki, an Inkarnate map, and a hand-drawn timeline. Bridge persona: worldbuilding novelists tracking nation continuity across books. They are sophisticated; their primary tool is Notion, not parchment.
- **Space/industry:** TTRPG creative tooling. Direct competitors: Inkarnate, Wonderdraft (parchment-fantasy aesthetic), Azgaar (utilitarian web tool), World Anvil (cluttered), LegendKeeper (clean editorial), Kanka (web-app modern).
- **Project type:** Web app (editor surface — interactive map page is primary), eventually with factbook/gazetteer text-output surfaces.

## Aesthetic Direction

- **Direction:** **Cartographic Intelligence.** The love child of a 1970s CIA World Factbook, a Royal Geographical Society field journal, and the terminal of a working analyst at 2 AM. Editorial restraint with operational density. Paper is a material, not a metaphor.
- **Decoration level:** **Intentional but restrained.** Hairline rules in muted ink; small caps for data labels; drop caps on long-form gazetteer prose. No textures, no gradients, no parchment, no decorative borders, no rounded-bubbly anything.
- **Mood:** Quiet authority. A GM opening MAURO for the first time should feel "someone serious made this for someone serious." Not delight, not excitement — **recognition**: *finally, a tool that respects how much of this I already know.*
- **Reference:** The 2026 design consultation arrived at this direction from two independent voices that converged. Reference signals: classical cartographic atlases, the discontinued (Feb 2026) CIA World Factbook, Monocle Magazine editorial register, Linear's typographic precision, distinctly NOT Inkarnate's parchment-fantasy. See `docs/superpowers/specs/2026-04-29-design-consultation.md` for the full conversation log if reproduced.

## Typography

Two serifs, one grotesque, one mono. Display and body are both serif — deliberate inversion of the SaaS norm where sans does everything and serif is a "luxury accent." Here, serif IS the voice.

- **Display / Hero:** **Fraunces** (variable, optical-sizing). Free, hosted via Google Fonts. Use `opsz` axis at 144 for hero/display sizes (50-144px), 60 for section titles (24-50px), 9-14 for body fallback if needed. The variable font means one file does multiple jobs.
- **Body:** **Source Serif 4**. Free, supports italic with true cuts (not synthesized). 15-18px for paragraph copy, line-height 1.55-1.7.
- **Data / Tables / Code:** **JetBrains Mono**. Free, tabular figures (`font-feature-settings: 'tnum' 1`), excellent at small sizes. Used for: coordinates, populations, dates, demographic tables, code blocks.
- **UI labels / Small caps:** **Inter Tight**. Free, used at 0.7-0.875rem with `letter-spacing: 0.16em` to `0.2em` and `text-transform: uppercase` for section labels (SOVEREIGNTY · TERRAIN · FIELD NOTES) and small caps moments.
- **Loading:** Google Fonts via `<link>` in `apps/web/src/app/layout.tsx`. Bunny Fonts is an acceptable privacy-respecting mirror if needed later.

**Font scale (rem at 16px root):**

| Role | Family | Size | Weight | Line height | Notes |
|---|---|---|---|---|---|
| Hero display | Fraunces | clamp(4rem, 11vw, 9rem) | 700 | 0.92 | letter-spacing: -0.045em; opsz 144 |
| Section title (h1) | Fraunces | clamp(2.25rem, 4vw, 3rem) | 600 | 1.05 | opsz 96 |
| Section title (h2) | Fraunces | clamp(1.75rem, 3vw, 2.5rem) | 600 | 1.1 | opsz 60 |
| Subhead (h3) | Fraunces | 1.5rem (24px) | 600 | 1.2 | opsz 48 |
| Factbook entry name | Fraunces | 1.625rem (26px) | 600 | 1.05 | opsz 60 |
| Body paragraph | Source Serif 4 | 1rem-1.125rem | 400 | 1.6-1.7 | italics for tone |
| Field notes | Source Serif 4 italic | 0.9375rem | 400 italic | 1.55 | italics carry voice |
| Section eyebrow | Inter Tight | 0.7rem (11px) | 600 | 1 | letter-spacing: 0.24em; uppercase |
| UI label | Inter Tight | 0.7-0.875rem | 600 | 1.2 | letter-spacing: 0.16em; uppercase |
| Data row | JetBrains Mono | 0.75-0.875rem | 400 | 1.5 | tnum 1 |
| Coordinates | JetBrains Mono | 0.7rem | 400 | 1 | tnum 1; letter-spacing: 0.06em |

**Font blacklist for MAURO** (these will not appear, even if Google Fonts ranks them well): Inter (regular), Roboto, Open Sans, Lato, Montserrat, Poppins, Comic Sans, Papyrus, Lobster, Cinzel, Almendra, IM Fell, Uncial Antiqua, MedievalSharp, anything tagged "fantasy" on Google Fonts.

## Color

- **Approach:** Restrained. Map hillshades carry the chromatic weight; chrome stays out of the map's way. Two accents — both used sparingly.

**Light mode (paper):**

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#F2EDE4` | Page background — unbleached cartridge paper |
| `--surface` | `#E8E1D3` | Raised surfaces (cards, mockups, sticky panels) — vellum |
| `--text` | `#1B1916` | Primary text — warm ink-black |
| `--text-muted` | `#6B6358` | Secondary text, captions, labels |
| `--hairline` | `#C9BFAC` | 1px rules, borders, dividers |
| `--stamp` | `#B8442C` | Oxidized red — single accent, sparingly |
| `--verdigris` | `#3B6B5A` | Live-edit / drag-position accent, sparingly |

**Dark mode (ink):**

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#161513` | Page background — warm near-black |
| `--surface` | `#1F1D1A` | Raised surfaces |
| `--text` | `#EFE9DC` | Primary text — warm cream |
| `--text-muted` | `#9A9286` | Secondary text |
| `--hairline` | `#2E2A24` | 1px rules |
| `--stamp` | `#B8442C` | Same — oxidized red works on both backgrounds |
| `--verdigris` | `#3B6B5A` | Same — verdigris works on both backgrounds |

**Accent semantics (load-bearing — do not freelance):**
- **Stamp red `#B8442C`:** Pinned states. The current sim-date pin on the scrubber. Unread-event dots in the ledger. Stamp-style buttons for irreversible actions ("Trigger event"). The accent dot in the eyebrow. The single italic period after "Mauro" in the hero.
- **Verdigris `#3B6B5A`:** Live / in-flight states. The drag-position pin on the scrubber while the user is dragging. "Currently being edited" indicators on form fields and ledger entries. Active-cursor breadcrumbs in future multi-user contexts.
- **Together:** Cartographic source material — ink-red marks borders/territory; verdigris-teal marks rivers/water/coast. Two semantics, two colors, historically grounded.

**Dark mode strategy:** Hand-tuned (not algorithmic invert). Reduce saturation ~10% on chromatic accents; use warm-near-black (`#161513`) instead of pure black to keep the paper feel. Hairlines drop ~3 stops in luminance to stay legible without screaming.

## Spacing

- **Base unit:** 4px (use `0.25rem` increments).
- **Density:** Comfortable but not airy. Slightly tighter than Notion or Linear default; closer to a printed atlas's leading.
- **Scale:** 4 (xs) · 8 (sm) · 12 (md-) · 16 (md) · 24 (lg) · 32 (xl) · 48 (2xl) · 64 (3xl) · 96 (4xl).
- **Section padding:** 64px vertical, 32px horizontal (mobile: 32 / 20).
- **Reading line measure:** 60-72ch on body text; allow 76ch for italic field-notes prose.

## Layout

- **Approach:** Hybrid — grid-disciplined for app surfaces (world detail page, settings, factbook), creative-editorial for marketing (when that exists; defer to v0.2).
- **App grid:** 12 columns on `>= 1024px`, 8 on `>= 720px`, 4 below. Gutter 16-24px.
- **World detail page columns:** `240px [ledger] · 1fr [map] · 280px [factbook]`. Below 880px: stack vertically.
- **Max content width:** 1280px on app shell; 720px on long-form prose (factbook entries, gazetteer reads).
- **Border radius:** **2px max.** Almost everything is square. Inputs, buttons, mockup panels, swatches — 0 to 2px corners. The only exception: scrubber pins are circles (stylistic; reads as a stamp). NO `border-radius: 8px`. NO `border-radius: 12px`. NO `border-radius: 9999px` on rectangles.
- **Top nav:** Replaced by a 36px-tall horizontal "ledger" bar at the page top. Breadcrumb left, current sim-date right. No avatar, no notification bell, no logo wordmark on app surfaces (the ledger's left text IS the logo + breadcrumb).
- **Sidebars:** Always visible on the world detail page. No hamburger menu collapse on desktop.

## Motion

- **Approach:** Minimal-functional. The map and the scrubber are the moving parts; UI itself stays still and grown-up.
- **Easing:** `ease-out` for enter (200ms), `ease-in` for exit (150ms), `ease-in-out` for move (250ms).
- **Duration:** micro 80-120ms (button hover, cursor color change), short 150-250ms (theme toggle, modal in/out), medium 250-400ms (scrubber pin smooth-snap to tick mark on release).
- **Forbidden:** Scroll-driven animations, entrance choreography on page load, parallax, motion that auto-plays. The product is a tool, not a presentation.
- **Reduced motion:** Respect `prefers-reduced-motion: reduce` — collapse all motion to instantaneous state changes except the user-driven scrubber drag.

## Component Patterns

- **Buttons:** Flat rectangles. 11-13px vertical padding, 22-26px horizontal. 1px border. Text uses Inter Tight 0.8125rem (13px) at 600 weight, letter-spacing 0.06em.
  - **Primary:** `--text` background, `--bg` text. Hover: opacity 0.85.
  - **Secondary (default):** Transparent background, `--text` border + text. Hover: invert.
  - **Ghost:** Transparent background, `--hairline` border, `--text` text. Hover: `--surface` background.
  - **Stamp:** `--stamp` background, light text (`#F2EDE4` regardless of theme). For irreversible / consequential actions only.
- **Inputs:** Paper-on-paper. `--bg` background (sits ON `--surface`), 1px `--hairline` border, 13-14px padding. Focus border switches to `--stamp`. Source Serif 4 16px text — yes, serif on form inputs. It's deliberate.
- **Cards / panels:** `--surface` background, 1px `--hairline` border, 0-2px corners. No elevation shadow except the world detail mockup's optional 1px box-shadow at the bottom (`0 1px 0 var(--hairline)`).
- **Hairlines:** 1px, `--hairline` color. Used as section dividers, panel edges, ledger separators. NOT used for visual texture (avoid the "everything is a box" failure mode).

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-29 | Initial design system created via `/design-consultation`. | Two independent design voices (primary + Claude subagent) converged on Cartographic Intelligence aesthetic from a 5-search competitive landscape. EUREKA moment: TTRPG worldbuilding tools default to parchment-fantasy because the category assumes "GMs want fantasy decor"; MAURO's actual customer (12+ month campaign GMs already in Notion) wants serious cartographic-editorial register. Paper as substrate, not costume. |
| 2026-04-29 | Free typography stack chosen over premium. | Fraunces (free, variable, optical-sizing) gets ~85% of the way to GT Sectra at $0. Source Serif 4 + JetBrains Mono + Inter Tight all free. Premium upgrade is a 10-line change in v0.1 once 3 GMs validate the direction. |
| 2026-04-29 | Two-accent system (stamp red + verdigris) instead of single-accent. | Two-accent is historically grounded in classical cartography (ink for borders, verdigris for water) and serves a real semantic need on the scrubber (current-pin vs. drag-pin). |
| 2026-04-29 | 36px top "ledger" replaces conventional top nav. | Page chrome should not announce itself. Breadcrumb + sim-date is the actual wayfinding info; everything else (avatar, bell, logo wordmark) is removable on app surfaces. |
| 2026-04-29 | Drag-only scrubber, no transport chrome. | Matches MAURO's substrate-first principle — the world is paper, you flip pages, you don't "play back" a tape. Discovery cost (some users may miss "drag it") is accepted; the right audience will figure it out. |

## What this design system is NOT

- **Not parchment.** No textured backgrounds. No drop shadows. No fantasy-themed decoration. The world is fantasy; the workspace is not.
- **Not SaaS-monochrome.** The warm-paper neutrals reject the Linear/Notion pure-black-and-white register. MAURO has a temperature.
- **Not utility-first generic.** Cluttered density is World Anvil's failure mode; we use density deliberately, type-driven, with editorial breathing room.
- **Not "AI-powered" branded.** No "✨" emoji, no "AI badge," no "Built with [model]" copy. The LLM is a tool inside the product, not a marketing surface.
