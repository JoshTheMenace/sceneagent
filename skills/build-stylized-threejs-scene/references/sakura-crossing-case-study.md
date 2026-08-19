# Sakura Crossing case study

## Contents

- Why the project is useful
- Transferable principles
- Architecture lessons
- Art-direction lessons
- World-building lessons
- What not to copy

## Why the project is useful

Sakura Crossing is a strong reference because it combines visual composition,
procedural code, traversal, interaction, and environmental story in one browser
scene. Its quality comes from accumulated decisions and focused correction
rounds, not from one generation pass or unusually complex dependencies.

The repository uses Three.js and Vite with almost all visible art generated from
geometry, Canvas2D textures, materials, shaders, and placement data. Read the
repository's `docs/codebase/` guides when available for exact module ownership.

## Transferable principles

### Author a place, not an asset collection

Objects are positioned for sight lines, route function, scale, use, and story.
The initial railway-crossing view has foreground anchors, a route, overlapping
landmarks, canopy closure, and controlled distant depth. Later districts connect
as lived-in land rather than isolated set pieces.

### Keep one visual system

The scene combines quantized toon lighting, colored shadow bands, selective
inverted-hull outlines, screen-space depth ink, atmospheric fade, and a restrained
grade. These techniques agree on a hand-painted animation-background goal.

### Separate authoring from presentation complexity

Builders operate in simple flat metre-based coordinates. One projection layer
bends the completed world onto a small planet. The player, collision, placement,
and height queries remain understandable. The specific planet is optional; the
general lesson is to isolate complex presentation transforms behind one seam.

### Make build order explicit

Later districts read surfaces and joins created by earlier ones. Global traffic
runs only after every road and apron exists. Vegetation requests are aggregated
after districts so repeated trees can be batched. The composition root documents
these dependencies rather than treating call order as incidental.

### Generate detail through reusable grammars

Houses, shops, props, vehicles, vegetation, signs, and ground works use reusable
factories with stable conventions and deterministic seeds. Variation occurs
inside coherent systems rather than through arbitrary object generation.

### Treat story as physical state

Shutters, vending trays, maintenance tools, posters, parked vehicles, festival
preparation, service paths, and waterworks reveal who uses the town and what is
happening. The scene deliberately contains no people; occupancy is inferred from
evidence.

### Measure spatial invariants

The project records flood-fill reachability, hill keep-outs, tunnel clearance,
vehicle overlap, ground contact, and render/performance facts. Comments frequently
explain a placement through a sight line or measured interference.

## Architecture lessons

- Use one composition root and a small builder context.
- Centralize palette, material factories, procedural texture factories, and
  primitive helpers.
- Keep canonical landform/route data pure and reusable by render and gameplay.
- Aggregate repeated geometry globally where possible.
- Preserve explicit pivots for animation before baking/merging transforms.
- Expose stable diagnostics and review-camera coordinates.
- Distinguish obstacles, walkable platforms, cuts, and analytic terrain height.

## Art-direction lessons

- Tint shadows toward a coherent cool hue instead of only reducing brightness.
- Keep pale foliage/high-key masses from receiving inappropriate muddy shadows.
- Derive screen-space lines from geometry/depth behavior and fade them with
  distance so backgrounds remain quiet.
- Use hero outlines selectively.
- Let lighting, fog, sky, palette, and post-processing share color roles.
- Supersample within a pixel budget and apply final anti-aliasing to line work.
- Generate sign and surface art at runtime when code-native editability matters.

## World-building lessons

- Establish scale and coordinate conventions early.
- Build ground and circulation before seating props.
- Design districts around a reason: crossing, shrine, school route, bus movement,
  supermarket, hill, lake, or water infrastructure.
- Add residential/connective land between hero places.
- Place vegetation and traffic as town-wide distributions, not isolated local
  decorations.
- Preserve reverse views and service/back areas; they make the hero view credible.
- Use repeated corrections to remove clipping, blocked paths, accidental mergers,
  and implausible object relationships.

## What not to copy

Do not require every scene to use:

- a spherical world;
- Japanese subject matter;
- cel shading or outlines;
- the same large module count;
- thousands of lines of procedural textures;
- a railway, town, or empty-of-people premise.

Do not copy the project's scale as a baseline. The skill's default vignette should
capture its discipline at a much smaller scope.

Also avoid inheriting its accumulated risks: very large modules, implicit build
order, duplicated join coordinates, module-lifetime caches, limited automated
tests, and transform hazards after the planet bake. Preserve the principles while
using a smaller, more explicit scene contract and evaluation harness.
