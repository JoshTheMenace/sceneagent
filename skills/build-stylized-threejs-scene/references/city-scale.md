# City scale — many districts, many agents, one place

Read this when the brief is bigger than one agent can hold: more than ~10
buildings, more than one narrative zone, or the word "city", "town", or
"world". The vignette workflow does not scale by trying harder — Tokyo (eight
shophouses) consumed one full builder context. A city is built by
decomposition, and everything below exists to make the seams — the place
decomposition fails — machine-checked instead of hoped-for.

The evidence behind this design: three independent experiments (rillford's
staged prefab delegation, the medieval-river-town spatial-contract findings,
and the spatial-contracts reference) converged on typed parcel handoffs; and
the flagship-scale world this pipeline descends from was built exactly this
way — district modules that measure the land, a load-bearing build order, and
a trap table full of the joint-ownership bugs that happen when nobody owns a
seam.

## The pipeline

1. **City brief → `city-plan.json`** (coordinator). One agent turns the user's
   prompt into the plan: districts with envelopes, narrative briefs, sockets,
   anchors, waypoints, budgets, and city-wide vista cameras. Validate with
   `scripts/validate-city-plan.mjs` — it rejects overlapping envelopes,
   unpaired sockets, dependency cycles, and placeholder prose. Revise the plan,
   never patch districts around a bad plan.
2. **Terrain stage** (coordinator, before anything else is built). One
   continuous ground surface over the whole footprint **including the
   surrounds**, with every district's level and both halves of every socket
   crossing already in it. Districts *dress* this ground — pads, kerbs, steps,
   revetments laid on it — and never platform their own rectangle.
   This is the single most valuable rule on the page, and it was learned the
   expensive way: in the first city built this way ground was left to each
   district, and because a district can only build to its own envelope the
   result was floating slabs in every overhead frame, a headland whose rock
   ended in mid-air over the water, a void behind a boundary wall, and blank
   planes at the foot of two seam descents. An independent review named it the
   city's single highest-impact defect and noted that **no district agent could
   have fixed it from inside its parcel.**

3. **Kit stage** (one agent, before any district) — **and it is gated before
   districts start.** Build `src/kit/`: the
   city's building generators, signage tables (via `core/texkit.js`), and
   street-furniture vocabulary. Districts import from the kit only. This is
   what keeps building #37 a seeded variation of an authored type instead of
   an invention — and what keeps fifty buildings from reading as copy-paste:
   variation lives in seeds and parameters, identity lives in the kit.
   The kit agent finishes by running the spatial audit and the camera gate
   over a showcase scene containing one of every generator. Skip this and the
   whole fleet inherits the same defect: in the first city built this way,
   three of four district agents independently hand-patched the same two kit
   bugs (wall-mounted signs the audit read as floating units, and a shared
   prop whose default colour was another district's owned accent). A defect
   in the kit is a defect in every district, so it is the one stage whose
   gate cannot be deferred.
4. **District builds** (parallel agents). Each agent gets: the whole plan (for
   context), its own district entry (its contract), the kit, the finished
   terrain, and **stub massing for its neighbours** — rough blocks at the right
   heights across the boundary. A district that renders against empty space
   composes its interior well and its edges against nothing; that is measurably
   where decomposition loses quality, and it is the one loss that does not
   shrink as you add districts. It authors
   one module via `defineDistrict(...)` and works exactly like a vignette
   build — blockout → compose → art-direct → story — inside its envelope, with
   its own contracted cameras and the standard per-scene gates. The wrapped
   ctx stamps everything it registers with the district id and warns when it
   builds outside its envelope: measure the land, stay in the parcel.
5. **Integration** (coordinator). `composeCity` topo-sorts districts by
   `after`, builds them in order, and asserts every anchor as each district
   lands — the "where one district's platform stops, the next one's must
   start" rule, mechanized. Then `scripts/check-city.mjs` runs the whole gate
   suite: plan validity, anchors, seam checks, the global spatial audit, a
   city-wide flood fill over every district's waypoints, and per-district
   budget checks.
6. **Review** (independent, never a builder). Per-district scoring first —
   each district is a vignette-sized review, which is proven tractable — then
   the city pass: vista cameras (gated, with subjects), skyline read, seam
   walks. Repair passes are routed to the owning district's agent by the
   coordinator; the reviewer names one highest-impact defect per district per
   round.

## The contracts

**Envelope** — a district's parcel. The wrapped ctx warns on registration
outside it (2 m tolerance for eaves and overhangs). Envelopes may not overlap.

**Socket** — a point on a shared boundary where a route crosses, with an
axis, a clear width, and a ground elevation. Both sides must honor it: ground
continuous across the line (within step height), a corridor of `width` kept
clear of colliders for 3 m into each side, and the flood fill must actually
cross. Sockets are declared in pairs (`mate`) and the plan validator refuses
an unpaired one. A socket is the ONLY sanctioned way for routes to cross a
boundary — a route crossing anywhere else is a seam bug even if it happens to
work.

**Anchor** — a point where a district promises a ground height, asserted the
moment the district finishes building. Use them on every inbound edge you
depend on and every edge you promise to others.

**Boundary feature** — a wall, kerb, railing or revetment standing ON a shared
boundary, declared in `boundary_features` with exactly one `owner` and the
`mate` that must not build there. Sockets are not the only thing on a
boundary, and the first city built this way proved it: two districts each
raised a wall on the same line and composed correctly only by luck (one below
the terrace, one above it). Both building it is a double wall; neither is a
gap; and no gate can tell either from geometry alone — only the plan can.

**Surrounds** — everything inside the city footprint but outside every
envelope: sea, moor, backdrop. It has an owner too. Unowned negative space is
how a town ends in a visible cut, and the district nearest it will build to
the edge of its tolerance trying to hide it.

**Compass and sun** — `city.compass.north_xz` and `city.sun` are the plan's,
and the light rig is derived from them. A palette note promising "low sun from
the south-east" against a rig aimed south-west is a bug that belongs to nobody:
every district art-directs to the light it can see, and the contradiction only
surfaces when someone reads the plan and the rig side by side.

**Owner** — every collider, platform, cut, and scene group a district
registers carries its id. Every gate failure reports the owner. Archaeology
("whose box is this?") was a multi-turn cost in the flagship's history; it is
free now.

**Sight corridor** — a named volume kept clear so the player can see one part
of the town from another, listed in `sight_corridors` with every district it
crosses. It goes into **all** of their briefs verbatim. A cross-district
requirement written into only one district's brief is a requirement that agent
cannot honour: the first city told the *headland* that its lighthouse "must
read from the row", which is a fact about the row's massing.

**Landmark contract** — `landmarks_citywide` entries name the vistas and the
districts a landmark must read from, and `check-city` raycasts them. Before it
had a reader it was decoration.

## Rules that keep quality flat across fifty buildings

- **Composition is the thing decomposition breaks, so buy it back explicitly.**
  Measured: districts built in isolation held sense of place (0.76-0.82),
  maintainability (0.80-0.86) and performance at or above what a single agent
  spending its whole context on one scene achieved — and lost ~0.07 overall,
  all of it in composition, identically in every district. Terrain-first,
  neighbour stubs, sight corridors and a per-socket frame shot *from the
  neighbour's side* are the four mechanisms that buy it back; none of them is
  expensive and none of them is optional.
- **Every district contributes at least one interaction.** The first city
  shipped none at all — no brief asked, so the runtime's whole interaction
  system was dead code in a finished town.
- **Intent density is the budget that matters.** Each district brief must
  answer: who lives here, what were they doing ten minutes ago, what is
  written on things. A district agent that cannot answer from its brief asks
  the coordinator; it does not invent a contradiction of its neighbor.
- **The kit is append-only during district builds.** A district needing a new
  generator requests it; the kit agent adds it. Two districts inventing their
  own bakery generator is how a city stops being one place.
- **Boundary features belong to exactly one district.** A road on a boundary
  is owned by the district listed in its socket's declaring entry; the mate
  district butts to it. Both building it means z-fighting; neither means a
  gap. The plan says who owns every socket.
- **City landmarks are contracts too.** Anything in `landmarks_citywide` must
  be visible from the vista cameras that name it as subject — the vista gate
  enforces the skyline the plan promised.
- **Budget meshes, not triangles.** Measured on a real city: districts finished
  at 218/220 meshes while using 24k of a 150k triangle allowance. Meshes bind
  first because the kit pools per material, so a budget set by triangle count
  silently starves a district of dressing. A district that has to furnish a
  street wants ~400 meshes.
- **A vista's aim and its subject must agree.** A camera whose `target` points
  one way while its named `subject` sits another is a contract that cannot be
  honoured: the district agent keeps the corridor clear along the published
  aim, and the gate then fails on the subject. Derive the target from the
  subject, and treat a subject sitting near the frame edge as a warning that
  the camera is not really aimed at the thing it exists to show.
- **Budgets are per district and enforced at integration.** Merged/pooled
  geometry per material inside each district; the composed city must stay
  inside per-camera draw budgets at the vistas.

## Briefing a district agent

Give it: the full `city-plan.json`, its district id, the kit's README, and
this instruction: "You own district `<id>`. Build it as a vignette inside your
envelope: your contract's brief is your promise; your sockets and anchors are
non-negotiable; import all generators from the kit; run the standard gates
plus `check-city.mjs --district <id>` before you finish; your evidence set is
the standard contracted-cameras-plus-sweeps, framed inside your envelope. Do
not touch another district's files or ground."
