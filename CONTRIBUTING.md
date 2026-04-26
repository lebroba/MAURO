# Contributing to MAURO

## GPL clean-room policy

**Never read source from GPL-licensed procgen tools** (SotE, SongsOfGPL, Gleba, or any other tool whose license is GPL/AGPL).

- Concepts from devlogs, blog posts, talks, and academic papers are fine — those are ideas, not code.
- Reading another developer's GPL'd implementation contaminates the clean-room derivation and forces MAURO under the GPL.
- If you need to study how something works, find a non-GPL reference or work from first principles.

This policy is load-bearing. See `docs/ARCHITECTURE_PRINCIPLES.md` §7.

## Exact-pin policy for byte-affecting dependencies

Any dependency whose output bytes affect MAURO's procgen output (RNG libs, noise libs, geo libs, hashing libs) is **pinned exactly** in `package.json` — no `^`, no `~`. The repo's `.npmrc` enforces `save-exact=true` so `pnpm add <pkg>` defaults to exact pins.

- Document the rationale on the pin line itself with a comment in CHANGELOG when bumped.
- Cross-architecture CI verifies byte-identical output (target: v1, not MVP).
- See `docs/ARCHITECTURE_PRINCIPLES.md` §8 for the full policy.

## Pull request workflow

1. Branch from `main` with the prefix `feat/`, `fix/`, `chore/`, or `docs/`.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` before opening the PR.
3. Use Conventional Commits in the squash-merge title: `feat(sim): add betweenness centrality for chokepoint detection`.
4. Reviewer pre-checks: GPL clean-room compliance, exact-pin policy, and that no LLM call is on the state-mutation path.
5. Use `/ship` from the gstack pipeline to land non-trivial changes.

## Issue reporting

Open a GitHub issue with:

- What you expected to happen
- What actually happened
- Repro steps (with the exact MAURO version + master seed if procgen-related)
- Screenshots / logs where relevant
