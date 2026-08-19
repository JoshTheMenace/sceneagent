# Vignette starter

Seed template for a small explorable stylized Three.js scene. The grey-box it
ships with exists only to prove the loop — render, movement, collision,
interaction, review cameras, `__shot`, `checkAllCameras` — before any art goes
in. Fill `scene-brief.md` and `scene-contract.template.json` (save as
`scene-contract.json`), then replace `src/scene.js`.

```bash
npm install
npm run dev      # http://127.0.0.1:5178
npm run build
```

## The rendering stack (src/core/)

Ported from the Sakura Crossing flagship — the cel look is the stack, not a
style you add later:

- **`core/toon.js`** — `cel()` / `flat()` material factories. `cel()` is a
  MeshToonMaterial with a quantized gradient ramp *plus* a patched shader
  chunk that tints the dark bands toward violet instead of black. Never
  construct a Mesh{Standard,Toon}Material directly; everything goes through
  these two. `shadowTintActive()` must return true — a loud console error
  means a three.js upgrade broke the patch and the look is silently gone.
- **`core/post.js`** — the `Pipeline`: scene → ink pass (second difference of
  linearised depth, so lines fire on silhouettes and creases, never on
  oblique planes) → grade pass (split-tone, lift, vignette, manual
  linear→sRGB) → FXAA. `main.js` renders through it; calling
  `renderer.render` directly loses the line work and the grade. Toggle passes
  with `pipeline.enabled.ink/grade/fxaa` or `__shot('x', w, h, { ink: false })`.
- **`core/outline.js`** — `hullOutline(mesh)` inverted-hull contours for hero
  props, on top of the screen-space ink.
- **`core/camcheck.js`** — the camera-legibility gate (below).
- **`src/palette.js`** — role-based palette with the value-ladder rules in its
  header. Replace the placeholder values from the contract's
  `art_direction.palette_roles`; keep the roles.
- **`src/materials.js`** — compatibility shim over `core/toon.js` only; new
  code imports from `core/` directly.

The lighting rig is data (`RIG` in `main.js`): warm quantized key with the
only shadow map, strong cool fill from the opposite quarter, weak below-front
bounce, hemisphere with a violet ground. Retune it there.

## Architecture kit (src/builders.js)

Roof planes, stairs and terrain banks are **never hand-placed** — a guessed
rotation does not look wrong, it looks *almost* right, and the gap only shows
from one camera. Every part in these helpers is derived from shared joints
(ridge line, eave line, tread edges, the `from`→`to` span), so misalignment
is impossible by construction:

- `gableRoof({ w, d, pitch, ridgeAxis, mat, ridgeMat, trimMat })` — two
  planes + ridge cap + optional bargeboards, origin at the wall-top center.
  Read `userData.ridgeY` for the gable apex; never re-derive it.
- `shedRoof({ w, d, pitch, downhill, mat })` — single plane; read
  `userData.highWallY` / `lowWallY` for the two wall heights.
- `stairs({ w, rise, run, steps, dir, at, mat, ctx })` — solid treads
  overlapping 40 mm (treads that merely meet are a knife edge height queries
  fall through); registers one `ctx.platform` per tread.
- `bankWedge({ from, to, w, mat })` — terrace bank/ramp whose top face
  exactly spans the two joints, closed on every face (winding derived from
  the centroid, so it cannot be built inside-out).
- `seatOnGround(obj, groundAt, { sink, maxSlope })` — **every scattered prop
  goes through this**; it seats by querying the ground and refuses spots
  steeper than `maxSlope` instead of leaving a prop hanging off a bank.

`createBuilder` also carries `ctx.platform(x0, z0, x1, z1, top)` and
`ctx.groundAt(x, z)` so walkable raised surfaces are registered data, not
just geometry.

## Camera-legibility gate

The most-repeated failure across scene reviews is a review camera that does
not show its subject — and a wrong camera does not look wrong, it returns a
perfectly composed frame of something else. So every review camera in the
contract declares a `subject`: the `Object3D.name` it exists to show
(`validate_scene_contract.py` rejects a missing or placeholder subject).

Three checks per camera (`src/core/camcheck.js`): the position is not inside
a registered collider; a ray to the subject first hits the subject's own
subtree (or lands within 0.5 m of its bounding box) and the subject is inside
the field of view; and a 5×3 grid of rays through the frustum — more than a
third hitting geometry within 1.2 m means the frame is blocked.

Run it, in one call, before trusting any camera:

```js
// in the page (browser console / javascript tool), dev server running:
window.__vignette.checkAllCameras()          // { ok, cameras, report }
window.__vignette.checkCamera('arrival')     // { ok, failures: [...] }
```

```bash
# or headless — same code, no browser, exit 1 on failure:
node scripts/check-cameras.mjs
```

Then `__shot` each camera and READ the images — the gate proves the subject
is hittable, only your eyes prove the frame is good:

```js
for (const name of Object.keys(window.__vignette.reviewCameras))
  await __shot(name, 1280, 720, { review: name });
// then read .shots/<name>.jpg
```

## Verifying visual changes

`npm run dev` mounts `POST /__shot`; `window.__shot(name, w, h, opts)`
renders one frame through the full pipeline and writes `.shots/name.jpg`.
Opts: `{ review: 'arrival' }` or `{ pos, lookAt, fov }`, plus
`{ ink: false }` / `{ grade: false }` to isolate a pass. A cel frame reads as
*drawn*: banded shading, ink lines on silhouettes, violet-tinted shadows, a
graded vignette — if it reads as low-poly 3D, check `shadowTintActive()` and
that the frame went through the Pipeline.

## Spatial audit

Screenshots miss metre-scale embedding and floating: a shrub hovering off a
bank or a cart buried in a wall renders as a perfectly plausible frame from
every review camera (measured in
So grounding is measured, not looked at. `src/core/spatialcheck.js` runs
three tests, all vertical-ray math, no WebGL:

- **Ground contact** — every audit unit gets a ray down from its world-bbox
  bottom (centre, plus four inset corners when wider than 1 m). Best gap to
  the first non-self surface over 0.06 m ⇒ `FLOAT`; every probed point more
  than 0.25 m under its surface ⇒ `BURIED` (any grounded corner clears a
  unit, so an assembly straddling two terrace levels is legal).
- **Run contact** — a *linear* unit (XZ aspect over 3:1, longer than 2 m,
  taller than 0.3 m, or `userData.linear = true`) must follow the ground for
  its whole length, not just touch it somewhere: one probe every 0.5 m along
  the base line. Any station more than 0.08 m off its support ⇒ `FLOAT-RUN`;
  more than 0.3 m under it ⇒ `BURIED-RUN`, both reporting station positions
  and the worst gap. This is the "a swept barrier needs a swept collider"
  lesson applied to seating — a level wall over falling ground is grounded at
  one end and see-through under the rest, and the point check passes it.
- **Overlap** — pairwise world-bbox intersection between tagged units over
  15 % of the smaller volume ⇒ `OVERLAP`. AABB only, so coarse for rotated
  shapes: a flag is worth a look, not an automatic revert.
- **Ground seams** — a 0.5 m grid over the contract footprint, one ray
  straight down per sample (samples inside colliders are skipped — the
  walkable ground is what is audited). Nothing hit above y −0.5 ⇒ `HOLE`;
  with a `groundAt()` exported from the scene, a first hit more than 0.5 m
  below the claimed walkable height ⇒ `SEAM`. Adjacent flagged samples merge
  into one patch per defect.
- **Unexplained masses** (warning, exit 0) — a bare block: taller than
  0.8 m with over 1.5 m³ / 1.5 m² to it, block-like (mesh volume over 60 %
  of its bbox — tilted bank wedges fail this), carrying no name or owner,
  whose top plane has nothing seated on or over it. A terrace mass capped
  by its floor layer is explained; a ramp's support box poking through its
  own ramp is not ⇒ `UNEXPLAINED-MASS`. It may be legitimate — the point is
  that it gets *decided*, not unnoticed.
- **Embedded scatter** (warning, exit 0) — a scatter-scale island (bbox
  ≤ 2 m³) with over 20 % of its own volume inside *support* solids (terrain,
  banks, landmark masses), by vertical-parity sampling ⇒ `EMBEDDED` — the
  bush-cone-clipping-into-a-bank case, which `BURIED` cannot see because it
  only looks down. Parity only consults closed support geometry (an open
  roof sheet would poison it), and the threshold is measured: a cone seated
  correctly on a 1-in-2 bank sinks ~14 % of itself, a visibly clipped one
  ~25 %.

**What is an audit unit?** Two conventions, both supported:

1. **Tagged objects**: set `userData.prop = true` on any standing assembly
   (or prefix its name with `prop:`). The topmost tagged node is the unit —
   its whole subtree audits as one assembly. Ground and terrain are never
   tagged; they are what the rays land on. Deliberately airborne things (a
   hung sign, a bird) set `userData.airborne = true` to opt out of ground
   contact. The grey-box tags `primary-mass` and `accent-object` so the gate
   is exercised from birth; tag every prop and building the real scene adds.
2. **Pooled scenes** (one merged mesh per material, no per-prop Object3Ds):
   export `auditIslands: ['props', 'pines', …]` from `buildVignette` — name
   prefixes of the merged meshes (a mesh also belongs if a named *ancestor*
   matches, so unnamed meshes inside a `houses` group count as houses). Each
   mesh splits into geometry islands (triangles sharing a vertex), islands
   whose XZ bboxes touch cluster into one unit, and ground contact probes
   the cluster's lowest island — its foot — so a pine (trunk + tiers stacked
   in plan) audits as one grounded assembly while a lone hovering bush cone
   audits alone. The overlap test skips clusters (their AABBs overstate
   L-shaped assemblies). Additionally, `auditLinear: ['terrain', …]` audits
   the *runs* inside otherwise-support meshes: small islands (under 20 m² /
   3 m short side — slabs and banks stay support) cluster by 3D touch so a
   wall picks up its own coping and base courses, and every elongated
   cluster gets the run check.

The scene also exports `footprint: contract.footprint_m` for the seam grid.
Run it before trusting any placement pass:

```js
// in the page, dev server running:
window.__vignette.checkSpatial()   // { ok, failures, stats, report }
```

```bash
# or headless — same code, no browser:
node scripts/check-spatial.mjs     # exit 0 pass · 1 defects found · 2 crashed
```

Every failure carries a measured distance and a rounded position — walk the
camera there with `__shot` to see the defect before fixing it.
