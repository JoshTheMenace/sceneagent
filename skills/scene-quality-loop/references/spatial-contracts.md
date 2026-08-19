# Spatial contracts

Use two contract layers. An **assembly contract** says how a thing is built: sockets, anchors, parent-child transforms, and functional relationships. A **placement contract** says how the finished thing occupies the world: support, allowed contact, forbidden overlap, clearance, and route access. A visually convincing object can fail either layer.

## Minimal representation

Give each reusable piece a stable ID and local-space data:

- one oriented box or small compound set of simple collision bodies;
- support anchors such as wheels, feet, foundations, or hanging points;
- semantic tags and collision layers;
- required contacts, allowed contacts, forbidden targets, and clearance in metres;
- named sockets with type, pose, and compatible socket types;
- an optional reserved corridor for doors, mechanisms, or traversal.

For a socket connection, derive the child transform from the parent socket and the inverse child socket. Do not independently type both transforms. Keep render geometry, collision bodies, support anchors, and interaction anchors under the same root.

## Fail-closed validation

Validate after world transforms are final and before static batching. Missing geometry, unknown targets, absent support surfaces, or skipped checks mean `notValidated`, never pass.

1. Broad-phase with spatial hashing or axis-aligned bounds.
2. Narrow-phase with oriented boxes or compound proxies; use mesh queries only where simple proxies are insufficient.
3. Check every support anchor against an approved surface and tolerance.
4. Check required socket/anchor distance and orientation.
5. Check forbidden overlap and minimum clearance by semantic layer.
6. Sweep route and interaction corridors, including open/closed states.
7. Confirm render geometry remains inside its declared envelope.

Prefer deterministic candidate search that rejects invalid placements. Never conceal a hero-prop defect by pushing it arbitrarily or changing the camera. Preserve the rejected fixture as a mutation test.

## Scaling into a game world

Use the hierarchy `world → district → parcel/route → assembly → component`. Infrastructure has one owner. Agents receive bounded parcels plus immutable road, water, elevation, socket, route, palette, and budget manifests. Each parcel publishes boundary sockets and a spatial report. Integrate only when parcel checks and seam checks pass.

Use procedural grammars or constraint solvers only inside approved parcels. Build deterministically from seeds and dependency hashes so failed pieces can be regenerated without rebuilding the world. Add streaming partitions and hierarchical LOD after authored seams, navigation, grounding, overlap, and art-direction gates are reliable.

Visual review remains essential for composition and taste, but it cannot certify physical correctness. Store source identity, verifier version, coverage, measured checks, violations, and canonical diagnostic views with every accepted build.
