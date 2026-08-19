---
name: scene-quality-loop
description: Build and rigorously refine explorable stylized Three.js environments. Use for procedural WebGL places needing composition, art direction, environmental storytelling, physically credible prop assemblies, close-range polish, traversal, interaction, performance, and evidence-based visual iteration.
---

# Scene quality loop

Build one memorable, believable place—not an asset collection or a stage set.

Copy the repository's stylized-scene starter when available and replace its subject completely. Prefer deterministic code-native geometry and generated textures unless external assets are approved.

Write a one-sentence promise naming place, mood, visitor role, and discovery. Convert it into `scene-contract.json`: metre-scale footprint, arrival camera, 3–5 landmarks, arrival/compression/reveal/afterimage route, palette, lighting logic, physical story clues, reversible interaction, budgets, and five canonical cameras.

For any compound prop, suspended object, vehicle, mechanism, or story-critical detail, read [references/polish-protocol.md](references/polish-protocol.md). Create `detail-inventory.json`, `assemblies.json`, `inspection-cameras.json`, and `polish-review.json` from `assets/`. Validate them with `scripts/validate_polish.py <scene-directory>`.

For scenes with several assemblies, reusable pieces, or independently authored regions, also read [references/spatial-contracts.md](references/spatial-contracts.md). Require a measured `spatial-report.json` before visual scoring; declarations such as `grounded: true` are not evidence.

Build in gated passes:

1. **Blockout:** boundaries, route, colliders, primary masses, landmark silhouettes, cameras.
2. **Structure:** correct scale, origins, supports, openings, component hierarchy, attachment anchors.
3. **Assembly:** construct every compound prop from functional parts; derive related transforms from shared dimensions instead of independent coordinates.
4. **Art:** coherent light, palette, material hierarchy, selective contours, weather and wear.
5. **Story:** add habitation and work evidence, then micro-details that belong to real surfaces or assemblies.
6. **Runtime:** traversal, collision, interaction, reset, resize, reduced motion, bounded rendering cost.

Serve over HTTP and package four evidence sheets: canonical views, route sweep, hero-prop inspections, and diagnostics. Inspect at thumbnail, player-eye, and close-prop scales. Reject hidden subjects, ambiguous routes, accidental occlusion, unsupported or floating objects, intersections, disconnected components, nonfunctional implied mechanisms, and details represented only by unexplained marks.

Run deterministic grounding, overlap, anchor, clearance, visibility, reset, and performance checks. Use an independent prop/assembly critic when possible; do not let the composition reviewer certify physical correctness.

Acceptance requires the normal visual score of at least `0.78` plus the polish validator: zero critical defects, every polish gate true, total polish at least `0.80`, and no polish category below `0.70`. Recapture all affected evidence after repairs. Report measured facts, visual judgments, source identity, limitations, and anything unverified.
