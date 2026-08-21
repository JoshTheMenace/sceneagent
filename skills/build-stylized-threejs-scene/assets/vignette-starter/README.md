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

## Signage kit (src/core/texkit.js)

Generated signage is the cheapest, highest-value specificity lever a scene
has — the best sense-of-place score measured across ~17 scored scenes (0.81,
the Tokyo test) was carried almost entirely by Canvas2D signs. Name the
tenants and owners: a board that says 喫茶 やまびこ or "HARBOUR OFFICE" does
more for a street than any amount of geometry. Invented names only — no real
brands, no people.

The kit (re-exported through `src/textures.js`) is the Sakura Crossing
flagship's texture kernel, parameterized:

- **Kernel** — `make(w, h, draw, opts)` → CanvasTexture (sRGB, anisotropy 4);
  `cached(key, w, h, draw)` memoized; `fitText` (shrink-to-fit),
  `centered` (fitted + letterspaced), `vertical` (CJK stacking), `rule`,
  `hex`/`col`, and `JP_FONT` — a font stack with JP fallbacks so CJK renders
  everywhere with zero binary assets.
- **Composites** — fill these as data, one call per tenant:
  - `signPlate({ title, sub, bg, ink, accent, border })` — bordered shop
    plate, native aspect **4:1** (512×128).
  - `fascia({ title, sub, bg, ink, panelJoints })` — frontage board with bar
    rules and optional panel seams, native aspect **6.4:1** (1024×160).
  - `noticeBoard({ lines, bg, ink, pin })` — pinned paper, 2–6 short lines,
    native aspect **3:4** (384×512).
  - `banner({ text, bg, ink, vertical })` — noren with genuinely transparent
    slits (use a transparent material), **2:1** (512×256); vertical nobori
    stacking CJK, **1:4** (192×768).

**The aspect rule:** each texture must land on a face matching its native
aspect — a 4:1 plate on a tall post face is a 24-fold crush that renders as
an unreadable smear, not an error. If a sign is a blur, compare the two
aspect ratios before touching anything else.

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

### Builders added

Every one of these was written independently by a district agent building a
real four-district city, which is the signal that it belongs to everybody
rather than to one district. Same discipline as the rest of the kit: derived
from joints, pooled per material, and registering only the colliders it
should.

- `stairRail({ from, to, h, post, rail, posts, sink, mat, side })` — **a
  handrail that climbs.** Takes the flight's two end joints on its walking
  surface; the rake is `atan2(dy, hypot(dx, dz))` and is never an argument,
  because an angle passed in can disagree with the joints it rides. `side` is
  a lateral offset along the plan normal, so `±(w/2 + 0.05)` gives a rail on
  each edge. The posts stand on a raked **stringer** and that member is
  load-bearing in two senses: a rail carried on posts alone has a base line
  that alternates between post feet and the rail's own underside, the spatial
  audit cannot fit a rake to it, and it then judges a climbing rail against a
  level base and fails it every time. The stringer is tessellated along its
  length for the same reason — a 5 m member with two vertices has nothing in
  the middle of it for any per-station sampler to find. `userData.joints`
  carries both ends so a second flight butts to the first.
- `wallRun({ points, h, thick, coping, copingOver, piers, stepMax, panel, mat, copingMat, ctx, collide })`
  — **a boundary wall that steps with the ground.** Every panel is seated on
  its own ground (`base = min(groundAt) − 0.06`, `top = max(groundAt) + h`),
  so the coping steps up the slope and the foot follows it down instead of
  becoming a level beam see-through under half its length. Panel length comes
  from the fall under that panel, not from a constant, and neighbours that
  agree are folded back into one — so a flat wall is one mesh and one swept
  unit while a stepped wall is the courses it really is. Ends and corners
  always get a **pier**: a wall that stops in mid-air reads as a grey card
  standing on the paving. One collider per panel, each the AABB of its own
  rotated box. The coping does not cast — a 60 mm overhang at this cascade
  size renders its own shadow as sawtooth.
- `pier({ w, d, h, at, cap, capOver, mat, capMat, ctx })` — the terminating
  pier, the gate post, and the way a wall is gapped for an opening; registers
  its own collider. **A gate needs 1.8 m of clear gap between pier faces**: a
  collider is inflated by the player's 0.34 m radius on every side, so the
  1.1 m opening that reads well on the page is 0.42 m of walkable ground — a
  gate you can see through and not walk through, and only a flood fill finds
  it.
- `bench({ w, seatH, back, at, facing, mat, ctx, collide })` — `facing` is the
  direction the sitter looks (`[dx, dz]` or radians) and the yaw is derived
  from it. Deliberately not a raw `ry`: a bench's rotation is a function of
  which side of the space it stands on, so a pair written with one constant is
  guaranteed wrong for one of them.
- `leanTo({ w, d, h, pitch, open, posts, at, mat, roofMat, ctx })` — an
  open-fronted working shelter. Roof from `shedRoof` with its `userData` read
  rather than re-derived; the side boards are cut one by one to the roof line,
  so the rake is followed exactly instead of a box poking through it.
  **Colliders for the back and sides only** — a box around an open-fronted
  structure is a shelter you cannot stand in, which renders perfectly and
  reads as unreachable in the fill with nothing reporting a problem.
- `stairs()` gained a **going guard**: in dev it warns when `run < 0.36`. The
  route gate strides 0.35 m, so a 0.28 m going puts two treads inside one
  stride and the rise it measures is doubled — a perfectly good flight is
  declared unclimbable. It warns rather than throws; a decorative flight
  nobody has to climb is legal.

Anything mounted or airborne inside these (the lean-to's roof) carries
`userData.airborne = true` so the audit does not read a carried part as a
float.

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

## City scale

When the brief is bigger than one agent can hold — more than ~10 buildings,
more than one narrative zone — the vignette workflow does not scale by trying
harder. Read `references/city-scale.md` in the skill for the full design; the
machinery lives here:

```
city brief -> city-plan.json          (coordinator writes the contracts)
           -> validate-city-plan.mjs  (plan gate: envelopes, sockets, terrain, cycles, placeholders)
           -> src/core/terrain.js     (ONE ground surface over the whole footprint, before anything else)
           -> src/kit/                (one agent builds the shared generators first)
           -> district modules        (parallel agents, one defineDistrict each; they DRESS the terrain)
           -> composeCity             (scene.js composes; anchors assert as each district lands)
           -> check-city.mjs          (integration gate: seams, spatial, flood fill, budgets,
                                       surrounds, sight corridors, landmarks, interactions)
```

A district module is a `defineDistrict` descriptor; a city's `scene.js` calls
`composeCity` instead of building directly and keeps the `buildVignette`
export shape so `main.js` is unchanged:

```js
// src/districts/harbor.js
import { defineDistrict } from '../core/district.js';
export const harbor = defineDistrict({
  id: 'harbor',
  envelope: { x0: -16, z0: 16, x1: 16, z1: 40 },
  after: ['old-town'],           // build order = groundAt order
  build(ctx) {
    // ctx is wrapped: every collide/platform/interact is stamped
    // { owner: 'harbor' }, every add() is named 'district:harbor:<name>',
    // and anything centered >2 m outside the envelope collects a warning.
    ctx.add(stairs({ w: 3, rise: 0.15, run: 0.3, steps: 8, dir: 'z-', at: [2, 0, 18.4], mat, ctx }), 'quay-stairs');
  },
});

// src/scene.js — takes an options bag so one district can be built alone
export function buildVignette(scene, { only = null } = {}) {
  const MODULES = [oldTown, harbor, hillside];
  const city = composeCity({
    plan,
    districts: only ? MODULES.filter((m) => m.id === only) : MODULES,
    ctx,
    terrainMaterials: { ground, paving, bank, surrounds, shore, skirt, water },
    only,
  });
  return { ...usualVignetteExports, plan, city }; // check-city.mjs needs `city`
}
```

## Terrain

**One continuous ground surface over the whole city, built before any
district and never by a district.** `src/core/terrain.js`, driven entirely by
the plan's `terrain` block, and it is the single most valuable rule on the
page. It was learned expensively: in the first city built by decomposition
ground was left to each district, and an independent review named the result
its highest-impact defect —

> "Ground is a per-district responsibility. Disjoint envelopes, each district
> platforming its own rectangle, nothing owning what lies between or beyond.
> That one decision produces the floating slabs in all four overhead frames,
> the headland's severed ground, net-lofts' void behind its wall, both blank-
> plane seam descents, and the row's missing harbour."

The decisive part is the rest of that note: **no district agent could have
fixed it from inside its parcel.** A district can only build to its own
envelope, so the gap between two envelopes and everything beyond the outermost
one is owned by nobody and built by nobody. The fix is not a rule telling
districts to be careful; it is taking the ground away from them.

```jsonc
"terrain": {
  "owner": "coordinator",            // never a district — the gate fails that
  "cell_m": 2.0,                     // target lattice on open ground
  "levels": [                        // EVERY district, exactly once
    { "id": "quay",    "y": 0.0 },
    { "id": "terrace", "y": 1.6 },
    { "id": "upper",   "y": 3.2 }
  ],
  "crossings": [                     // one entry per socket PAIR
    { "socket": "terrace-quay-stairs", "kind": "stairs", "going": 0.42, "rise": 0.18 },
    { "socket": "upper-terrace-road",  "kind": "road",   "grade": 0.14 }
  ],
  "surrounds": { "kind": "water", "water_y": -0.5, "y": -2.6, "blend_m": 7 }
}
```

`composeCity` calls it for you and routes `ctx.groundAt` through it, so a
district arrives to ground that already stands at its contracted level with
both halves of every crossing already in it. The API is one function:

```js
const { terrainHeightAt, group, stats } = buildTerrain({ plan, ctx, materials });
terrainHeightAt(x, z);   // the walked ground, anywhere in the world
```

What it builds, and why each piece is there:

- **Levels** — each district's envelope held flat at its `y`. Anchors are then
  answered by construction rather than by a district remembering to lay a slab.
- **Crossings** — the terrain builds **both halves** of every socket crossing:
  a graded ramp for `ramp`/`road`/`path`, a flight for `stairs`, with a landing
  at the line on each side. A seam made by one builder cannot disagree with
  itself. Two districts each building their own half can, and that is what a
  seam bug *is*. Every flight's going is clamped to **0.36 m**: the route gate
  strides 0.35, so a 0.33 going puts two treads in one stride, measures twice
  the rise, and calls a perfectly good flight unclimbable.
- **Surrounds** — everything inside `footprint_m` but outside every envelope,
  blended continuously out of the nearest levels and into the treatment
  (`water` / `moor` / `flat` / `sand` / `scrub`) over `blend_m`. This is the
  half no district could ever have built. A `water` surround also lays a water
  plane four times the footprint: sized to the footprint its own straight edge
  lands in every overhead frame and reads as exactly the severed edge the
  apron exists to remove.
- **Apron and skirt** — a ring past the footprint falling away, plus vertical
  walls down to a floor, so the world is a **closed solid**. A town that ends
  at a mesh boundary reads as a cut from any camera above eye height.

where together they killed seventeen seam defects at once:

- **A conforming grid.** Grid lines go in at the footprint edges, at every
  envelope edge (plus a hairline either side, so a level change draws as a
  vertical face instead of ramping across a whole cell), at every crossing
  rect edge and at every stair tread edge — and *only then* is each gap
  subdivided to `cell_m`. Nothing straddles a designed edge, so a district
  promised 1.6 m gets exactly 1.6 m. Quads split on **alternating** diagonals:
  split them all one way and the ground grows a diagonal grain the ink pass
  draws as parallel creases.
- **The walked surface is the minimum of the field at a cell's four corners.**
  Those corners are the drawn mesh's own nodes and the mesh interpolates them,
  so `min(corners)` ≤ the drawn surface everywhere inside the cell: the height
  query is *provably* never above the ground the eye sees. Take the cell's
  centre height instead and on a 1-in-1.4 face the query stands the player up
  to 0.8 m in the air — which is exactly the "walkable height X but first
  surface at Y" defect the spatial audit reports.

**Districts dress this ground.** Pads, kerbs, steps, paving and revetments
*laid on* it; never a platform under it. `composeCity` warns on any single
district platform over ~30 m²:

```
WARN [terrace] LAYING-GROUND: platform x -20..20, z -12..14 is 1040 m² (limit 30)
  at top 1.6 — you are laying ground, which is the terrain's job. A district
  plate stops at the envelope and nothing owns what lies between or beyond it:
  that is the floating-slab defect. Set the level in plan.terrain.levels and
  DRESS this surface instead — or, if it really is one made surface, say so here.
```

### Neighbour stubs

Measured, districts built in isolation hold sense of place, maintainability
and performance, and lose ~0.07 of *composition* — identically in every
district, and it is the one loss that does not shrink as districts are added.
The cause is simple: an agent alone composes its interior against its own
work and its **edges against nothing**.

So `districts[].massing` in the plan is a rough block-out — the right mass at
the right height, nothing more — and

```
node scripts/check-city.mjs --district upper
```

composes with `only: 'upper'`: the terrain in full, `upper` in full, and every
other district as its `massing` stubs, collider-registered and owner-stamped
like anything else. The agent's own frames then contain what its neighbours
will actually put there. A district with no `massing` gets a `NO-MASSING`
warning naming the district that is now composing against empty space. When
every district is present, `massing` is ignored entirely.

The contracts, mechanized:

- **Envelope** — the parcel. Registrations outside it warn (2 m tolerance);
  overlapping envelopes fail the plan gate.
- **Socket** — a paired boundary crossing (`kind`, `axis`, `width`, `y`,
  `mate`). `core/seams.js` measures ground continuity across the line
  (straddling sample pairs over the full width, step-height limit, `y` ±0.25)
  and corridor clearance (walker radius applied, clear passage ≥ width − 1 m
  for 3 m into each side).
- **Anchor** — a promised ground height, asserted by `composeCity` the moment
  the owning district finishes building. A point anchor and a seam check
  catch different spellings of the same bug: a stair flight topping out 0.6 m
  low trips the anchor; a flight built half the socket's width passes every
  anchor and fails the seam sweep.
- **Missing module** — a plan district with no registered module (or a module
  with no plan entry) throws. A module nobody imports builds nothing,
  silently; here it is loud.
- **Surrounds** — `surrounds.owner` names the district that builds everything
  inside `footprint_m` but outside every envelope: sea, moor, backdrop. The
  plan gate refuses a plan without it. Unowned negative space is not neutral —
  the district nearest it builds to the limit of its 2 m envelope tolerance
  trying to hide the cut, which is how a quay came to end in water 2 m wide.
- **Boundary feature** — a wall, kerb, railing or revetment standing ON a
  shared boundary, with one `owner` and the `mate` that must not build there.
  `along` is the axis the feature RUNS ALONG (not a socket's crossing axis):
  `along: 'z'` is a line at `x = at` spanning `z` `from`..`to`. The gate checks
  the line is genuinely on the edge those two districts share, that the run
  fits the stretch they share, and that no two features overlap on one line.
  Two districts each raising a wall on the same line composed correctly by
  luck once; no geometric gate can tell a double wall from a thick one.

### City gates

Four checks that only a city needs, each of them a real failure paid for once:

- **Plan gate** (`scripts/validate-city-plan.mjs`, exit 0/1/2) — everything
  above plus `city.compass.north_xz` (a non-zero 2-vector) and `city.sun`
  (one of the eight compass points or degrees, elevation 5–80°). The light rig
  is *derived* from those two by `src/core/sunrig.js` and never hand-placed: a
  palette note promising "low sun from the south-east" against a rig aimed
  south-west is a bug that belongs to nobody, because every district art
  directs to the light it can see.
- **Vista aim** (`src/core/camcheck.js`) — a subject inside the frustum is a
  much weaker promise than a subject the camera is aimed at. Past |ndc| 0.72
  in either axis the check WARNS, past 0.95 it FAILS, and the ndc numbers are
  in the message either way. Warnings print and are returned in
  `checkAllCameras().warnings`; they do not change exit status. Derive a
  vista's `target` from its `subject` — a camera pointing one way with its
  subject sitting another makes the district keep a corridor clear along the
  published aim and then fails on the subject anyway.
- **Owner down to the mesh** (`src/core/district.js`) — the kit merges per
  material and names its output `pool-0`, `pool-1`… in *every* district, so
  "blocked by pool-0" named nothing. `composeCity` stamps every anonymous or
  `pool-N` mesh under an added group as `<district>:<group>:<old>`, one
  traverse per group after the build (a group is usually still empty at
  `ctx.add` time). The same wrapper throws if `ctx.interact` is handed an
  entry with no `hitbox` Object3D: `main.js` raycasts
  `interactables.map((e) => e.hitbox)` every frame, and without the check the
  page blanks from inside the render loop with one line of three.js internals.
- **Raked runs** (`src/core/spatialcheck.js`) — the FLOAT-RUN sweep used to
  judge every station of a linear unit against the unit's single lowest point,
  so a handrail that climbs its own flight floated at one end and buried at
  the other. Two districts "fixed" that by stripping the prop tag off the
  rail, which deletes it from the audit entirely. Now the run's own base line
  is sampled per station; if it is a consistent grade (R² ≥ 0.95, monotonic,
  over 0.5 m of rise) each station is judged against the FITTED base anchored
  at the run's lowest point, with the tolerance widened by the ground's own
  roughness about its line — a flight of steps is a line plus a sawtooth. The
  test is on the RUN's base, never the ground's, which is why a level beam
  over falling ground still fails: the ground under it is perfectly linear and
  its own base line is flat. The audit header reports how many runs were raked.

`scripts/check-city.mjs` is the integration gate (exit 0/1/2): plan validity,
the composeCity asserts, seams, the global spatial audit with owners resolved
by envelope, a city-wide flood fill (radius 0.34, step 0.38, visited keyed on
cell + height bucket) from the first district's first waypoint to EVERY
district's waypoints — a waypoint unreachable across a seam is the primary
failure this system exists to catch — and per-district budget checks. District
agents mid-build run `node scripts/check-city.mjs --district <id>` for their
own subset, composed against neighbour stubs.

Four more checks close gaps that nothing else covered:

- **Surrounds coverage.** The spatial audit's hole grid samples the union of
  *envelopes*, so the space between and beyond them — most of a city footprint,
  and all of the sea or moor — was checked by nothing at all, and
  `surrounds.owner` only proved the ownership was *assigned*, never that it was
  discharged. This samples the whole `city.footprint_m` by downcast; a hole
  outside every envelope reports against the surrounds owner by name.
- **Sight corridors.** Each `sight_corridors[]` entry is raycast from `from` to
  `to` at `min_clear_h` across five offsets over `half_width`, and a block
  names the mesh, the owning district and how far along it stands. This is how
  "the row must be able to see its own harbour" stops being prose: a
  cross-district requirement written into one agent's brief is a requirement
  that agent cannot honour, so the corridor lists every district it crosses and
  each of them gets the `why` verbatim.
- **Landmark contracts.** Each district's `landmarks_citywide[]` is raycast to
  from every vista that names it and from every waypoint of every district that
  names it (a claim about "reading from the row" is a claim about standing in
  the row). FAIL if no sample point sees it, WARN if fewer than half do. Before
  this the field had no reader at all and was decoration.
- **Interactions.** A district that declares `interactions[]` in the plan and
  registers none FAILS. The first city built this way shipped ZERO
  interactables and the runtime's whole KeyE system was dead code in a finished
  town, because no brief asked for any.

Plus one WARN that cannot be a FAIL: two districts with geometry over 0.5 m
tall within 0.5 m of a shared envelope edge, overlapping along it for more than
2 m, with no `boundary_features` entry declared there. A legitimate butt joint
looks identical from geometry alone — only the plan can tell it from a double
wall — but this points at the line and asks, which is what nothing did when the
real double wall went in.
