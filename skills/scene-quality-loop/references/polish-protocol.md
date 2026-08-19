# Polish protocol

Use this protocol whenever a scene contains compound props, mechanisms, suspended elements, story clues, or objects seen within roughly five metres.

## 1. Inventory before implementation

List every identity-defining detail at three scales:

- **Macro:** landmark masses, route edges, rooflines, large openings.
- **Meso:** doors, stalls, carts, signs, drains, storage, machinery.
- **Micro:** fasteners, hinges, brackets, spokes, clips, seams, handles, wear.

Every item must name its implementation and inspection cameras. Do not count a texture mark as structural geometry when it changes silhouette, joins parts, carries weight, or enables motion.

## 2. Treat props as assemblies

Give each compound prop one local coordinate convention, root, dimensions, components, anchors, relationships, support, and tolerances. Derive related transforms from the same measurements.

Examples:

- A cart needs body, underframe, axle, hubs, wheels, spokes or solid wheel construction, paired shafts, crossbar or harness point, and a grounded rest state.
- A clothesline needs two explicit anchors or a freestanding frame, sagging line, clips, and cloth attached at its top edge.
- A sign needs a wall/post anchor and bracket.
- A waterwheel needs axle, hubs, rim, spokes, paddles, water contact, and a supported bearing relationship.

Every object must answer: what supports it, what is it attached to, how was it assembled, and could it perform its implied job?

## 3. Deterministic audits

Automate facts instead of asking vision to infer them:

- anchor-to-anchor distance within tolerance;
- wheel/hub/axle centres aligned;
- lowest contact point near the support surface;
- no unintended bounding-volume overlaps;
- no prop origin inside a wall or collider;
- clearance through routes after adding props;
- raycast visibility from the position where an interaction occurs;
- reset and interaction end states;
- performance at every evidence camera.

Keep dynamic objects out of static batching. Record audit results in runtime evidence.

## 4. Evidence coverage

Generate four contact sheets rather than many unrelated screenshots:

1. **Canonical:** arrival, context, route, detail, reverse.
2. **Route sweep:** sample the traversable route every 3–5 m; alternate forward, reverse, and side views.
3. **Hero props:** front, rear, both sides, elevated, and ground-contact views for every landmark mechanism and story-critical assembly.
4. **Diagnostics:** flat/unlit geometry, attachment anchors, bounding boxes/colliders, and interaction states.

Review at thumbnail size for hierarchy, player-eye size for experience, and close crop for construction. A useful wide shot cannot clear a close-prop defect.

## 5. Defect policy

Classify defects:

- **Critical:** impossible assembly, floating/sunk hero object, disconnected support, blocked route, broken interaction, missing required evidence.
- **Major:** visibly intersecting parts, wrong scale/orientation, generic hero prop, important blank surface, inconsistent material construction.
- **Minor:** small tangent, repeated spacing, weak fastener, limited variation.

Acceptance requires zero critical defects. Repair every major defect affecting a hero or route before adding unrelated detail. Do not improve the scalar score by hiding a defect from the chosen cameras.

## 6. Reviewer separation

When possible, use separate reviewers for macro composition, prop assembly, and runtime/traversal. Give them raw artifacts and public criteria, not the builder's intended fixes. Calibrate automated scores against free exploration and user-found defects.
