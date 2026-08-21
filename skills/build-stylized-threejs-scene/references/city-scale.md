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
2. **Kit stage** (one agent, before any district). Build `src/kit/`: the
   city's building generators, signage tables (via `core/texkit.js`), and
   street-furniture vocabulary. Districts import from the kit only. This is
   what keeps building #37 a seeded variation of an authored type instead of
   an invention — and what keeps fifty buildings from reading as copy-paste:
   variation lives in seeds and parameters, identity lives in the kit.
3. **District builds** (parallel agents). Each agent gets: the whole plan (for
   context), its own district entry (its contract), and the kit. It authors
   one module via `defineDistrict(...)` and works exactly like a vignette
   build — blockout → compose → art-direct → story — inside its envelope, with
   its own contracted cameras and the standard per-scene gates. The wrapped
   ctx stamps everything it registers with the district id and warns when it
   builds outside its envelope: measure the land, stay in the parcel.
4. **Integration** (coordinator). `composeCity` topo-sorts districts by
   `after`, builds them in order, and asserts every anchor as each district
   lands — the "where one district's platform stops, the next one's must
   start" rule, mechanized. Then `scripts/check-city.mjs` runs the whole gate
   suite: plan validity, anchors, seam checks, the global spatial audit, a
   city-wide flood fill over every district's waypoints, and per-district
   budget checks.
5. **Review** (independent, never a builder). Per-district scoring first —
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

**Owner** — every collider, platform, cut, and scene group a district
registers carries its id. Every gate failure reports the owner. Archaeology
("whose box is this?") was a multi-turn cost in the flagship's history; it is
free now.

## Rules that keep quality flat across fifty buildings

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
