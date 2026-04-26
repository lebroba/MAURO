# MAURO — Algorithmic Carry-forward from project_aria

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
