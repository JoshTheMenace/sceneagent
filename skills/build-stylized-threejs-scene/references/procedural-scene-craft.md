# Procedural scene craft

## Contents

- Asset policy
- Coordinate and scale contract
- Builder architecture
- Geometry selection
- Determinism and variation
- Placement and constraints
- Texture generation
- Animation-ready structure
- Failure patterns

## Asset policy

Default to code-native construction:

- Three.js primitives and transformed/merged BufferGeometry;
- Shape/extrude, lathe, curve/tube, custom indexed geometry, and instancing;
- generated CanvasTextures, DataTextures, and shaders;
- deterministic placement data and parameterized factories.

Use external meshes, textures, generated images, or downloaded packs only with
explicit authorization. Record source, license, modification, and consuming
module. Never silently download an asset to make the scene look finished.

## Coordinate and scale contract

Choose one world unit, normally one metre. Define:

- ground plane and up axis;
- player eye height, body radius, step height, and movement speed;
- standard door, kerb, stair, railing, path, and vehicle dimensions;
- scene footprint and allowed vertical range;
- object-facing convention, such as local +Z for building frontages;
- where placement data lives and how rotations are represented.

Keep geometry authored near a local origin. Place it once through a group or
builder transform. Do not scatter compensating offsets through child meshes.

## Builder architecture

Separate four concerns:

1. **Canonical data:** scene contract, route, landmarks, palette, placement rows.
2. **Factories:** reusable objects authored in local coordinates.
3. **Builders:** compose factories into a place and register runtime data.
4. **Composition root:** owns build order, global batching, lifecycle, and API.

Return useful metadata with render objects: bounds, collider footprint, height,
interaction pivots, sockets, update hook, and stable semantic name.

Prefer a small context API such as:

```js
ctx.add(object)
ctx.collide(bounds)
ctx.platform(surface)
ctx.interact(entry)
ctx.update(step)
ctx.groundAt(x, z)
```

Make build order explicit when a later builder reads surfaces or data created by
an earlier one. Store shared joins in one canonical module instead of copying
coordinates across districts.

## Geometry selection

Match representation to visual job:

- Box/cylinder/cone: stylized structural masses and small manufactured parts.
- Shape + extrude: signs, fascia, trim, custom silhouettes, shallow architecture.
- Lathe: pottery, lamps, posts, bottles, rotational fittings.
- Curve + tube: cables, rails, pipes, branches, winding trim.
- Custom BufferGeometry: terrain, roads, roofs, continuous irregular surfaces.
- InstancedMesh: many repeated objects with shared geometry/material.
- Merged geometry: static repeated parts grouped by material.

Spend topology on silhouette, attachment, curvature, and cast-shadow behavior.
Do not subdivide hidden planar surfaces while hero contours remain crude.

Use separate meshes when a part needs a distinct material, pivot, interaction,
visibility state, or semantic identity. Merge parts when they are static,
material-identical, and never need independent control.

## Determinism and variation

Use seeded RNG for every procedural choice. Treat the seed as authored data.
Randomness should select within a controlled grammar, not decide composition.

Vary systems at different scales:

- family: building/plant/prop type;
- structure: width, height, bay count, roof or canopy profile;
- material: palette role and constrained tone variation;
- dressing: a limited set of plausible attachments;
- aging: local wear, lean, missing element, or repair.

Keep important variant arrays append-only when placement data stores numeric
indices. Prefer named variants in new systems when practical.

## Placement and constraints

Establish surfaces before seating content. Query final ground/surface height
instead of assuming Y=0. Register obstacles and walkable surfaces explicitly.

For each placement, check:

- route and player clearance;
- overlap with existing bounds;
- support/contact with ground or parent surface;
- door, stair, ramp, and interaction reachability;
- hero-camera silhouette and occlusion;
- plausible functional relationship to nearby objects;
- reverse-view finish.

Use local plot coordinates for rotated lots and repeated frontages. Convert to
world coordinates in one helper, including collider/bounds conversion.

### Assemblies come from the kit, never from hand-placed parts

Roof planes, stairs and terrain banks are NEVER hand-placed with guessed
positions and rotations. A hand-placed roof plane fails silently: the rotation
is *almost* right, the plane floats or gaps at the ridge, and no error fires —
the starter's architecture kit (`src/builders.js`) exists because this is the
single most common breakage in generated scenes. Use it:

- `gableRoof` / `shedRoof`: plane size and rotation are derived from the ridge
  and eave joints (`slopeLen = hypot(halfSpan, rise)`,
  `rotation = atan2(rise, halfSpan)` with the sign per side derived, not
  guessed). Align walls to the returned `userData` heights (`ridgeY`,
  `highWallY`, `lowWallY`) instead of re-deriving them.
- `stairs`: treads overlap 40 mm and each registers a walkable platform —
  treads that merely meet are a knife edge that height queries fall through.
- `bankWedge`: the top face exactly spans its `from`→`to` joints and every
  face is closed, so no missing-ground gap can appear at a terrace bank.
- `seatOnGround`: EVERY scattered prop (bush, rock, crate) is seated through
  it — it queries the ground instead of trusting a remembered height, and
  refuses spots steeper than `maxSlope` rather than leaving a prop hanging
  off a bank on one corner.

The same discipline generalizes: any assembly with two or more connected
members is built from named joints, with every member drawn between two
points — a shared end is then shared by construction.

## Texture generation

Generate texture art at the aspect ratio of its consuming surface. Set color
space deliberately: sRGB for visible albedo/emissive color; linear/data treatment
for masks, normals, roughness, and height.

Use procedural texture families for signs, posters, windows, road paint, wear,
and material breakup. Cache immutable textures by stable semantic parameters.
Avoid machine-specific fonts for identity-critical text unless the project ships
the font or accepts fallback variation.

Do not fake deep geometry with a printed rectangle when the feature affects
silhouette, parallax, contact shadow, interaction, or physical plausibility.

## Animation-ready structure

Give moving parts explicit pivots and stable names. Keep placement transforms on
an outer group and animation transforms on an inner pivot. Return one batched
update function rather than attaching an independent animation loop to each prop.

Define interaction state transitions separately from mesh construction. Make
reset, pause, hidden-tab behavior, and repeated activation deterministic.

## Failure patterns

- One enormous scene function containing geometry, placement, input, and state.
- Unseeded random layout that changes on every reload.
- Uniform scatter used as “detail.”
- External assets introduced without permission or provenance.
- Unique materials/geometries for every repeated object.
- Child offsets compensating for an unclear local coordinate convention.
- Visual geometry with no matching collider, or collider with no visible reason.
- Animation applied to baked/merged geometry without preserving a pivot.
- Rebuilding a reusable system separately in every district.
