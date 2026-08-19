# Composition and environmental story

## Contents

- Scene promise
- Scene contract
- Spatial hierarchy
- Arrival composition
- Exploration route
- Environmental storytelling
- Detail hierarchy
- Failure patterns

## Scene promise

Write one sentence describing what the visitor should feel and discover. Make it
specific enough to reject plausible but wrong additions.

Good: “Arrive at a rain-cleared hillside tram stop at dusk, then discover from
maintenance clues that the line will close after tonight.”

Weak: “A beautiful cozy tram scene with lots of detail.”

Use the promise to decide what belongs. Every major element should establish the
place, guide the route, reinforce the mood, or reveal story.

## Scene contract

Define these before implementation:

- **Experience:** promise, duration, intended emotion, and visitor role.
- **Place:** location type, time, weather, season, cultural/fictional context.
- **Footprint:** approximate width/depth and vertical range in metres.
- **Arrival:** camera position/target/FOV and intended visual hierarchy.
- **Landmarks:** three to five distinguishable masses or destinations.
- **Route:** start, visual beats, optional branch, return/end condition.
- **Art direction:** style, palette roles, lighting logic, silhouette rules.
- **Story clues:** macro, meso, and micro evidence placed along the route.
- **Interactions:** target, verb, response, and meaning.
- **Constraints:** asset policy, performance target, input, browser, accessibility.
- **Review:** named cameras and observable success criteria.

Store the contract as data, not only prose, so scripts and agents can inspect it.

## Spatial hierarchy

Build from large to small:

1. **World envelope:** ground, horizon, enclosing masses, sky, route boundary.
2. **Primary masses:** architecture, landform, large vegetation, infrastructure.
3. **Landmarks:** unique silhouettes or color/value accents that orient visitors.
4. **Connective tissue:** paths, walls, fences, thresholds, service spaces.
5. **Use evidence:** furniture, storage, signage, maintenance, wear, parked objects.
6. **Micro-detail:** fasteners, litter, small plants, decals, seams.

Do not use micro-detail to compensate for weak primary masses. Review each layer
with all smaller layers hidden or absent.

## Arrival composition

Treat the first frame as a designed illustration that also promises movement.
Establish:

- a foreground anchor that gives scale and depth;
- a primary landmark or directional opening;
- a middle-ground route the visitor can understand;
- a background closure or atmospheric release;
- unequal visual weights and useful negative space;
- overlapping silhouettes rather than isolated catalog objects;
- one restrained accent that attracts the eye.

Use occlusion deliberately. Hide part of a destination so movement produces a
reveal. Keep critical routes and landmarks from merging into similar values or
silhouettes. Test at thumbnail size; the hierarchy should survive lost detail.

Compose from the actual player eye height and FOV. An editor-like orbit view can
hide poor scale, empty foregrounds, and accidental alignments.

## Exploration route

Design a short spatial sentence:

1. **Arrival:** establish place and immediate direction.
2. **Invitation:** show a path, light, sign, sound source, or partial landmark.
3. **Compression:** pass through a narrower or quieter threshold.
4. **Reveal:** open onto the hero destination or new spatial relationship.
5. **Afterimage:** provide a detail, interaction, or reverse view that reinterprets
   what the visitor passed.

Use at least three distinct beats. Avoid corridors that reveal everything at
once. Give branches a visible reason and an intelligible way back. Let paths be
legible through geometry, value, light, and landmarks before adding HUD arrows.

## Environmental storytelling

Tell a small story through physical evidence. Ask:

- Who uses this place, even if nobody is visible?
- What happened recently?
- What is maintained, improvised, neglected, celebrated, or forbidden?
- Which object is out of its expected state, and why?
- What repeated system makes the place culturally or functionally specific?

Distribute clues by scale:

- **Macro:** closed platform, festival preparation, flood barrier, construction.
- **Meso:** stacked chairs, half-raised shutter, tools, delivery crates, notices.
- **Micro:** water line, chalk mark, missing poster corner, cup ring, worn paint.

Prefer evidence with spatial consequences. A shutter changes access and light; a
parked service cart narrows a route; wet ground changes reflections and color.

Avoid random prop confetti. Cluster objects around plausible use, storage,
maintenance, shelter, and circulation zones. Leave quiet areas so detailed areas
feel intentional.

## Detail hierarchy

Budget detail by importance:

- Hero landmark: distinctive macro form, meso structure, selected micro-detail.
- Route edges: enough use evidence to sustain story and scale.
- Background masses: silhouette, value, and limited large detail only.
- Ground: route-readable variation, not uniform noise.
- Repeated props: shared construction with controlled variants.

Use asymmetry at the scene level and consistency within systems. For example,
all utility poles may share construction rules while their service drops and
attached notices vary contextually.

## Composition checks

Review these views independently:

- **Arrival:** does the promise read immediately?
- **Context:** does the whole footprint have hierarchy rather than even density?
- **Route beats:** does each movement produce new information?
- **Reverse:** does the scene still cohere when viewed back toward the start?
- **Detail:** do story clues read at their intended distance?

## Failure patterns

- Building an asset list without a scene promise.
- Centering every important object and filling every gap.
- Equal detail density everywhere.
- Using fog, bloom, or color grading to hide weak composition.
- Making every route the same width and value.
- Placing signs or clutter without a plausible owner or use.
- Designing only the hero screenshot and leaving its reverse as unfinished backs.
- Adding a larger footprint instead of deepening the existing place.
