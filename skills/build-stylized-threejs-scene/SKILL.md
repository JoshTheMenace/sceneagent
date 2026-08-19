---
name: build-stylized-threejs-scene
description: Build or substantially improve small, polished, explorable, stylized Three.js environments using code-native procedural geometry, coherent art direction, environmental storytelling, interaction, and evidence-gated visual iteration. Use when asked to create a Three.js scene, atmospheric 3D vignette, explorable environment, procedural world fragment, stylized WebGL place, or to raise an existing Three.js scene to authored visual quality. Do not use for isolated object reconstruction from reference images, photorealistic neural world generation, or minor Three.js bug fixes.
---

# Build a stylized Three.js scene

Create one excellent place. Optimize for authored composition, atmosphere, and
coherence — not object count. This entry is deliberately compact: the measured
result behind it (`docs/evidence/skill-context-tests.md` at the repo root) is that the
engineering scaffold transfers through a short skill, composition transfers
only through *renders* — so the loop below is the mechanism, and more prose is
not.

**Start.** New project: copy `assets/vignette-starter/` into the requested
location (never edit the starter in place). It ships the cel/ink/grade
renderer, a walker with colliders, review cameras, dev-only `__shot` frame
capture, and the camera-legibility gate — the full loop is provable before any
art goes in. Existing project: extend its stable primitives; establish
before-evidence first. Never add external assets without explicit
authorization; record source and license for any that are approved.
Use
`scripts/scene_loop.py` to persist stage state across a multi-session build.

**Run this sequence.** Stage detail lives in `references/` — read on demand,
and read `references/sakura-crossing-case-study.md` whenever the bar is "as
good as Sakura Crossing":

1. **Promise** — one sentence: place, mood, visitor role, discovery.
2. **Contract** — `scene-contract.json`: arrival camera, metre-scale footprint,
   landmarks, four route beats, palette roles, lighting logic, story clues, one
   interaction, budgets, and five named review cameras *each with a `subject`*.
   **Every route beat is also a gated camera** — a beat is a view a player
   stands in, and the route's *ending* beat is the most-shipped blank-wall
   failure in this pipeline's history: both measured builds plateaued at
   ~0.775 with an uncomposed closing look-back. If the contract promises "the
   look back from X", that frame carries a `subject` and passes the same
   legibility gate as the heroes. Validate with
   `scripts/validate_scene_contract.py`; revise the contract rather than
   patching implementation around a bad premise.
3. **Blockout** — ground, route, boundaries, major masses, colliders. The
   route must be walkable before any detail exists.
4. **Compose** — from player eye height: foreground scale, a partially hidden
   destination, unequal masses, overlap, negative space, and a finished
   horizon in every review direction.
5. **Art-direct** — one palette with a narrow value ladder, one readable key
   light, violet-tinted shade (never black), selective silhouettes,
   atmospheric depth. Match the promised time and weather in the render, not
   just in the contract.
6. **Story** — meso-scale evidence of use before tiny props; cluster clues
   where work, shelter, storage, or circulation explain them. Then one
   forgiving interaction that changes the meaning of the place.
7. **Prove** — the loop below, until the gates pass.

**The loop.** No tested first pass has ever met the bar; budget two to three
repair passes by design:

- Capture every contracted camera with `__shot` and run
  `window.__vignette.checkAllCameras()`. A frame that fails to show its
  subject, is blocked at the near plane, or was shot from inside geometry
  **blocks the pass** — fix the camera or the scene, not the check.
- **Capture beyond the contracted cameras** — hero cameras are composed to
  flatter, and assembly defects live where they never look. Every full pass
  also captures: an **orbit sweep** (four high shots at 90° around the scene
  centroid — this is where broken roofs, ridge gaps and terrain seams show),
  a **route sweep** (one frame at each route beat *plus one looking back the
  way you came*), and one **low frame looking up at the rooflines**. A
  player walks everywhere; frames only from the contract's viewpoints are a
  staged photograph, not evidence of a place.
- Run `window.__vignette.checkSpatial()` (or `node scripts/check-spatial.mjs`):
  floating props, buried props, interpenetrating assemblies and holes in the
  ground are mechanical findings, not visual judgment — a failure blocks the
  pass.
- Read the images — an unread render is not evidence. Name the single
  highest-impact defect, fix it at the earliest failed stage (never add
  detail to hide weak massing, or fog to hide an unfinished boundary),
  recapture, repeat.
- Construction discipline the images will test: roof planes, stairs and
  terrain banks come from the starter's architecture kit (`gableRoof`,
  `stairs`, `bankWedge`) — never hand-placed planes with guessed rotations;
  every scattered prop is seated with `seatOnGround`, which refuses
  too-steep faces instead of floating on them.

**Score against outcomes**: composition 22%, sense of place 18%, art direction
16%, exploration/story 14%, runtime 12%, maintainability 10%, performance 8%
(draw calls per camera, not FPS — frame-rate samples do not discriminate).
Acceptance: overall ≥ 0.78, no category below 0.55, composition/place/art each
≥ 0.70 — scored by an evaluator who did not build the scene. Builder
self-scores measure ~0.2 high and do not count. Physical correctness requires
a measured `spatial-report.json` (see the `scene-quality-loop` skill);
`grounded: true` declarations are not evidence. Disqualify an attractive scene
that does not build, initialize, traverse, or reset.

**Report honestly**: exact values changed, which gates ran, what those gates
cannot see, and what remains unverified. A successful build is not visual
completion. If tooling prevents render inspection, say visual quality is
unverified and stop short of a completion claim.
