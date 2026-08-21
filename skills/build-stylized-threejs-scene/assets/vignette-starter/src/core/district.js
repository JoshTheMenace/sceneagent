import * as THREE from 'three';
import { buildTerrain } from './terrain.js';

/* ------------------------------------------------------------------ *
 * City scale: district descriptors and the composer.
 *
 * A city is built by decomposition (see the skill's references/
 * city-scale.md): a coordinator writes city-plan.json, parallel agents
 * each own one district module, and this file is where the two meet.
 * `defineDistrict` is what a district agent exports; `composeCity` is
 * what the city's scene.js calls instead of building directly.
 *
 * TERRAIN FIRST.  `composeCity` builds core/terrain.js BEFORE any
 * district and routes `ctx.groundAt` through it, so a district arrives
 * to ground that already exists at its contracted level, with both
 * halves of every socket crossing already in it.  Districts DRESS that
 * ground.  A district that platforms its own rectangle gets a warning
 * with the reason, because the review of the first city built this way
 * named per-district ground its single highest-impact defect and noted
 * that no district agent could have fixed it from inside its parcel.
 *
 * Everything here exists to make the seams loud:
 *   - a plan district with no registered module (or vice versa) THROWS —
 *     the flagship's "a module nobody imports builds nothing, silently"
 *     sat unnoticed for a whole round;
 *   - every collider / platform / cut / interactable a district registers
 *     is stamped { owner: id } and every group it adds is renamed
 *     `district:<id>:<...>`, so every later gate failure names its owner
 *     ("whose box is this?" archaeology was a multi-turn cost).  That goes
 *     down to the MESHES: the kit's merged output is named `pool-0`,
 *     `pool-1` … in every district, so "blocked by pool-0" named nothing
 *     until composeCity started stamping them `<id>:<group>:<old>`;
 *   - `ctx.interact` refuses an entry with no `hitbox`.  main.js raycasts
 *     `interactables.map((e) => e.hitbox)` every frame; one district
 *     omitted it and the page blanked from inside the render loop with a
 *     single console line that named nothing.  An undocumented contract
 *     that fails at 60 Hz is worth a throw at registration;
 *   - a registration whose center falls more than ENVELOPE_TOL_M outside
 *     the district's envelope is collected as a warning (eaves and
 *     overhangs legitimately cross by a little; a building does not);
 *   - every anchor is asserted the moment its district finishes building —
 *     "where one district's platform stops, the next one's must start",
 *     mechanized. Anchor failures THROW with district, anchor, expected
 *     and actual, because building districts on top of a broken handoff
 *     only buries it.
 * ------------------------------------------------------------------ */

const ENVELOPE_TOL_M = 2;

/* A district platform bigger than this is not dressing, it is ground.  The
 * number is a judgement: a forecourt pad, a loading apron or a terrace step
 * is a few square metres; 30 m² is a 5.5 m square, which is already most of
 * a small courtyard.  It WARNS rather than throws because a legitimately
 * large made surface exists (a quay apron, a market floor) and the point is
 * to make the author say so, not to forbid it. */
const GROUND_PLATFORM_M2 = 30;

// The kit merges its geometry per material and names the results `pool-0`,
// `pool-1`, … — in EVERY district.  So a gate failure reads "blocked by
// pool-0" and cannot say whose it is; the first city to hit this cost a
// hand-written raycast to answer "which district's pool-0?".  Anything
// matching this, or nameless, gets stamped with its district on the way in.
const ANONYMOUS = /^pool-\d+$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Give every anonymous mesh under a district's group an owner in its name:
 * `<district-id>:<groupName>:<oldNameOrIndex>`.  One traverse per added
 * group, run AFTER the build rather than inside ctx.add, because the kit
 * routinely attaches pooled meshes to a group it has already handed over —
 * at add time most groups are still empty.  Idempotent: a renamed mesh no
 * longer matches, so a second pass is free.
 *
 * One interaction to know: spatialcheck's `islandSets` / `linearSets` match a
 * mesh by its own name OR an ancestor's, so declare sets by the GROUP name a
 * district passes to ctx.add — a set literally called 'pool' would stop
 * matching once these are stamped.
 */
function stampAnonymousMeshes(object, districtId, groupName) {
  let i = 0;
  object.traverse((o) => {
    if (!o.isMesh) return;
    const own = typeof o.name === 'string' ? o.name : '';
    if (own && !ANONYMOUS.test(own)) { i += 1; return; }
    o.name = `${districtId}:${groupName}:${own || i}`;
    i += 1;
  });
}

function checkEnvelopeShape(envelope, where) {
  if (!envelope || !isNum(envelope.x0) || !isNum(envelope.z0) || !isNum(envelope.x1) || !isNum(envelope.z1)) {
    throw new Error(`${where}: envelope must be { x0, z0, x1, z1 } numbers, got ${JSON.stringify(envelope)}`);
  }
  if (envelope.x0 >= envelope.x1 || envelope.z0 >= envelope.z1) {
    throw new Error(`${where}: envelope must have x0 < x1 and z0 < z1, got ${JSON.stringify(envelope)}`);
  }
}

/**
 * Declare a district module. Validates the shape and returns a frozen
 * descriptor; `composeCity` matches it to the plan entry with the same id.
 *
 * @param {object} spec
 * @param {string} spec.id        kebab-case id, must match a plan district
 * @param {object} spec.envelope  { x0, z0, x1, z1 } — must match the plan's
 * @param {string[]} [spec.after] district ids that must build first
 * @param {object[]} [spec.sockets] socket declarations (usually the plan's)
 * @param {object[]} [spec.anchors] extra { x, z, expect_top, tol } promises
 *                                  asserted in addition to the plan's
 * @param {(ctx, { plan, entry }) => void} spec.build the district builder;
 *        receives the wrapped ctx and its own plan entry
 */
export function defineDistrict({ id, envelope, after = [], sockets = [], anchors = [], build }) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`defineDistrict: id must be a kebab-case string, got ${JSON.stringify(id)}`);
  }
  checkEnvelopeShape(envelope, `defineDistrict("${id}")`);
  if (!Array.isArray(after) || after.some((a) => typeof a !== 'string')) {
    throw new Error(`defineDistrict("${id}"): after must be an array of district ids`);
  }
  if (!Array.isArray(sockets) || !Array.isArray(anchors)) {
    throw new Error(`defineDistrict("${id}"): sockets and anchors must be arrays`);
  }
  for (const a of anchors) {
    if (!isNum(a.x) || !isNum(a.z) || !isNum(a.expect_top)) {
      throw new Error(`defineDistrict("${id}"): anchor must be { x, z, expect_top, tol? }, got ${JSON.stringify(a)}`);
    }
  }
  if (typeof build !== 'function') {
    throw new Error(`defineDistrict("${id}"): build must be a function`);
  }
  return Object.freeze({ id, envelope: Object.freeze({ ...envelope }), after: Object.freeze([...after]), sockets, anchors, build });
}

function topoSort(ids, edges) {
  // edges: id -> ids that must come FIRST.  DFS with an explicit stack path
  // so a cycle reports its whole loop, not just "cycle detected".
  const order = [];
  const state = new Map(); // 0 unvisited / 1 on stack / 2 done
  const path = [];
  const visit = (id) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const loop = path.slice(path.indexOf(id)).concat(id);
      throw new Error(`composeCity: \`after\` dependency cycle: ${loop.join(' -> ')}`);
    }
    state.set(id, 1);
    path.push(id);
    for (const dep of edges.get(id) ?? []) visit(dep);
    path.pop();
    state.set(id, 2);
    order.push(id);
  };
  for (const id of ids) visit(id);
  return order;
}

const rectCenter = (x0, z0, x1, z1) => [(x0 + x1) / 2, (z0 + z1) / 2];

function outsideEnvelope(cx, cz, envelope) {
  const dx = Math.max(envelope.x0 - cx, cx - envelope.x1, 0);
  const dz = Math.max(envelope.z0 - cz, cz - envelope.z1, 0);
  const d = Math.hypot(dx, dz);
  return d > ENVELOPE_TOL_M ? d : 0;
}

/**
 * Rough blocks standing in for a district that is not being built this
 * pass.  A district agent working alone otherwise composes its interior
 * well and its edges against NOTHING — measured, that is where
 * decomposition loses its ~0.07 of composition score, identically in every
 * district, and it is the one loss that does not shrink as districts are
 * added.  A stub is not a building: it is the right mass at the right
 * height across the boundary, so the agent's frames contain what a
 * neighbour will actually put there.
 */
function buildMassingStub({ entry, ctx, groundAt, material }) {
  const blocks = entry.massing ?? [];
  if (!blocks.length) return null;
  const group = new THREE.Group();
  const mat = material ?? new THREE.MeshStandardMaterial({
    color: 0x8b8f88, roughness: 1, metalness: 0, flatShading: true,
  });
  for (const [i, b] of blocks.entries()) {
    const base = groundAt(b.x, b.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    box.position.set(b.x, base + b.h / 2, b.z);
    box.name = `district:${entry.id}:massing-${i}`;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    ctx.collide(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2);
    ctx.colliders[ctx.colliders.length - 1].owner = entry.id;
    ctx.colliders[ctx.colliders.length - 1].stub = true;
  }
  ctx.add(group, `district:${entry.id}:massing-stub`);
  return group;
}

/**
 * Compose the city: build the terrain, match plan districts to registered
 * modules (both ways, loudly), topo-sort by `after`, build each district
 * through a wrapped ctx that stamps ownership and polices the envelope,
 * assert each district's anchors as it lands, and collect per-district
 * stats for budget checks.
 *
 * @param {object} args
 * @param {object} args.plan       the parsed city-plan.json
 * @param {object[]} args.districts array of defineDistrict descriptors
 * @param {object} args.ctx        the createBuilder ctx for the whole city
 * @param {object} [args.terrainMaterials] tone -> material for core/terrain.js
 * @param {string} [args.only]     build ONE district in full and every other
 *        as its `massing` stub — what a district agent runs mid-build so its
 *        edges compose against something instead of against nothing
 * @returns {{ order, stats, warnings, terrain, only }}
 */
export function composeCity({ plan, districts, ctx, terrainMaterials = null, only = null }) {
  if (!plan || !Array.isArray(plan.districts) || plan.districts.length === 0) {
    throw new Error('composeCity: plan.districts is missing or empty');
  }
  const entries = new Map(plan.districts.map((d) => [d.id, d]));
  if (only !== null && !entries.has(only)) {
    throw new Error(`composeCity: only "${only}" is not a district in this plan — have: ${[...entries.keys()].join(', ')}`);
  }
  const modules = new Map();
  for (const d of districts ?? []) {
    if (modules.has(d.id)) throw new Error(`composeCity: district module "${d.id}" registered twice`);
    modules.set(d.id, d);
  }

  /* ---- TERRAIN FIRST -------------------------------------------------
   * Before a single district runs, and never by a district.  Everything
   * below — anchors, groundAt, the stubs' seating — reads this surface. */
  const terrain = buildTerrain({ plan, ctx, materials: terrainMaterials });

  /* `ctx.groundAt` is the max over registered platforms with a floor of 0,
   * which is wrong the moment the ground goes below datum (a harbour bed, a
   * moor).  Route it through the terrain instead: the terrain is the floor,
   * and whatever a district lays on top raises it. */
  const groundAt = (x, z) => {
    let y = terrain.terrainHeightAt(x, z);
    for (const p of ctx.platforms) {
      if (p.owner === 'terrain') continue;
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > y) y = p.top;
    }
    return y;
  };
  ctx.groundAt = groundAt;

  // Both directions, and both are fatal.  A plan district with no module is
  // a hole in the city; a module with no plan entry has no contract at all.
  // In `only` mode the absent modules are the POINT, so only the named one
  // has to be registered.
  const unbuilt = [...entries.keys()].filter((id) => !modules.has(id) && (only === null || id === only));
  const unplanned = [...modules.keys()].filter((id) => !entries.has(id));
  if (unbuilt.length || unplanned.length) {
    const lines = [];
    if (unbuilt.length) lines.push(`plan districts with NO registered module (they would silently not exist): ${unbuilt.join(', ')}`);
    if (unplanned.length) lines.push(`registered modules with NO plan entry (no contract, no envelope, no gates): ${unplanned.join(', ')}`);
    throw new Error(`composeCity: plan and modules disagree —\n  ${lines.join('\n  ')}`);
  }

  // `after` edges: union of the plan's (the contract) and the module's (what
  // the code actually leans on) — either one alone can under-declare.
  const buildIds = only === null ? [...entries.keys()] : [only];
  const edges = new Map();
  for (const id of buildIds) {
    const entry = entries.get(id);
    const deps = new Set([...(entry.after ?? []), ...modules.get(id).after]);
    for (const dep of deps) {
      if (!entries.has(dep)) throw new Error(`composeCity: district "${id}" is \`after\` unknown district "${dep}"`);
    }
    // in `only` mode the dependencies are stubs, not builds: keep the edge
    // check (a typo is still a typo) and drop the ordering it would impose
    edges.set(id, only === null ? [...deps] : []);
  }
  const order = topoSort(buildIds, edges);

  const warnings = [];
  const stats = {};
  const warn = (district, kind, detail, position) => warnings.push({ district, kind, detail, position });

  /* the neighbours, as rough massing, BEFORE the district that has to
   * compose against them — so its own frames contain them */
  const stubs = [];
  if (only !== null) {
    for (const [id, entry] of entries) {
      if (id === only) continue;
      const g = buildMassingStub({ entry, ctx, groundAt, material: terrainMaterials?.stub });
      if (g) { stubs.push(id); stats[id] = { stub: true, blocks: entry.massing.length }; continue; }
      stats[id] = { stub: true, blocks: 0 };
      warn(id, 'NO-MASSING',
        `district "${id}" has no \`massing\` in the plan, so "${only}" is composing its edges against empty ` +
        'space — the one quality loss decomposition causes that does not shrink as districts are added. ' +
        'Add districts[].massing: [{ x, z, w, d, h }] roughing out its blocks.',
        rectCenter(entry.envelope.x0, entry.envelope.z0, entry.envelope.x1, entry.envelope.z1));
    }
  }

  for (const id of order) {
    const entry = entries.get(id);
    const module = modules.get(id);
    const envelope = entry.envelope;
    checkEnvelopeShape(envelope, `composeCity plan district "${id}"`);
    const e = module.envelope;
    if (Math.abs(e.x0 - envelope.x0) > 0.01 || Math.abs(e.z0 - envelope.z0) > 0.01 ||
        Math.abs(e.x1 - envelope.x1) > 0.01 || Math.abs(e.z1 - envelope.z1) > 0.01) {
      warn(id, 'ENVELOPE-MISMATCH',
        `module envelope ${JSON.stringify(e)} differs from the plan's ${JSON.stringify(envelope)} — the plan is the contract and wins`,
        rectCenter(envelope.x0, envelope.z0, envelope.x1, envelope.z1));
    }

    const added = [];
    let addCount = 0;
    const before = { colliders: ctx.colliders.length, platforms: ctx.platforms.length, interactables: ctx.interactables.length };

    const checkRect = (kind, x0, z0, x1, z1) => {
      const [cx, cz] = rectCenter(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
      const d = outsideEnvelope(cx, cz, envelope);
      if (d) {
        warn(id, 'OUTSIDE-ENVELOPE',
          `${kind} centered (${cx.toFixed(2)}, ${cz.toFixed(2)}) is ${d.toFixed(2)} m outside envelope ` +
          `x ${envelope.x0}..${envelope.x1}, z ${envelope.z0}..${envelope.z1} (tolerance ${ENVELOPE_TOL_M} m)`,
          [cx, cz]);
      }
    };

    const wrapped = Object.create(ctx);
    wrapped.districtId = id;
    wrapped.collide = (x0, z0, x1, z1, ...rest) => {
      const result = ctx.collide(x0, z0, x1, z1, ...rest);
      ctx.colliders[ctx.colliders.length - 1].owner = id;
      checkRect('collider', x0, z0, x1, z1);
      return result;
    };
    wrapped.platform = (x0, z0, x1, z1, top, ...rest) => {
      const result = ctx.platform(x0, z0, x1, z1, top, ...rest);
      ctx.platforms[ctx.platforms.length - 1].owner = id;
      checkRect('platform', x0, z0, x1, z1);
      /* A district platforming its own rectangle is the defect this whole
       * stage exists to remove: it ends at the envelope, and what lies
       * between and beyond it is then built by nobody. */
      const area = Math.abs(x1 - x0) * Math.abs(z1 - z0);
      if (area > GROUND_PLATFORM_M2) {
        const [cx, cz] = rectCenter(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
        warn(id, 'LAYING-GROUND',
          `platform x ${Math.min(x0, x1)}..${Math.max(x0, x1)}, z ${Math.min(z0, z1)}..${Math.max(z0, z1)} ` +
          `is ${area.toFixed(0)} m² (limit ${GROUND_PLATFORM_M2}) at top ${top} — you are laying ground, which is ` +
          'the terrain\'s job. A district plate stops at the envelope and nothing owns what lies between or ' +
          'beyond it: that is the floating-slab defect. Set the level in plan.terrain.levels and DRESS this ' +
          'surface instead (paving, kerbs, steps laid on it) — or, if it really is one made surface, say so here.',
          [cx, cz]);
      }
      return result;
    };
    if (typeof ctx.cut === 'function') {
      wrapped.cut = (spec, ...rest) => {
        const result = ctx.cut(spec, ...rest);
        if (ctx.cuts?.length) ctx.cuts[ctx.cuts.length - 1].owner = id;
        if (spec && isNum(spec.x0)) checkRect('cut', spec.x0, spec.z0, spec.x1, spec.z1);
        return result;
      };
    }
    /* An interactable's `hitbox` is the undocumented half of this contract:
     * main.js raycasts `interactables.map((e) => e.hitbox)` EVERY FRAME, and
     * an entry without one throws inside the render loop — the page blanks
     * with one uninformative console line and no hint which district did it.
     * So it is checked here, at registration, where the district is known. */
    wrapped.interact = (interactableEntry) => {
      const what = interactableEntry?.label ?? interactableEntry?.name ?? '(unlabelled)';
      if (!interactableEntry || typeof interactableEntry !== 'object') {
        throw new Error(`composeCity: district "${id}" called ctx.interact with ${JSON.stringify(interactableEntry)} — an interactable is an object`);
      }
      if (!interactableEntry.hitbox || interactableEntry.hitbox.isObject3D !== true) {
        throw new Error(
          `composeCity: district "${id}" registered interactable "${what}" with no usable \`hitbox\` ` +
          `(got ${interactableEntry.hitbox === undefined ? 'undefined' : JSON.stringify(interactableEntry.hitbox)}). ` +
          'Every interactable needs `hitbox`: an Object3D the per-frame raycast in main.js can test — ' +
          'usually the mesh the player looks at, or an invisible box sized to it.');
      }
      interactableEntry.owner = id;
      return ctx.interact(interactableEntry);
    };
    wrapped.add = (object, name) => {
      addCount += 1;
      const base = name ?? object.name ?? `part-${addCount}`;
      const result = ctx.add(object, `district:${id}:${base}`);
      added.push({ object, base });
      return result;
    };

    module.build(wrapped, { plan, entry });

    // Envelope check and the anonymous-mesh stamp for added groups AFTER the
    // build: geometry is often attached to a group after ctx.add, so bounds
    // (and the pooled meshes themselves) are only real now.
    const box = new THREE.Box3();
    for (const { object, base } of added) {
      stampAnonymousMeshes(object, id, base);
      object.updateMatrixWorld(true);
      box.setFromObject(object);
      if (box.isEmpty()) continue;
      checkRect(`group "${object.name}"`, box.min.x, box.min.z, box.max.x, box.max.z);
    }

    // Anchor asserts, plan's plus the module's own — the moment the district
    // lands, not at the end: a later district built on a broken handoff
    // would bury the cause under its own geometry.
    for (const anchor of [...(entry.anchors ?? []), ...module.anchors]) {
      const tol = anchor.tol ?? 0.05;
      const actual = ctx.groundAt(anchor.x, anchor.z);
      if (Math.abs(actual - anchor.expect_top) > tol) {
        const error = new Error(
          `composeCity: ANCHOR FAILED in district "${id}" at (${anchor.x}, ${anchor.z}): ` +
          `expected ground top ${anchor.expect_top} ±${tol}, groundAt returned ${actual.toFixed(3)} ` +
          `(off by ${(actual - anchor.expect_top).toFixed(3)} m)`);
        error.composeCity = true;
        throw error;
      }
    }

    let meshes = 0;
    let triangles = 0;
    for (const { object } of added) {
      object.traverse((o) => {
        if (!o.isMesh) return;
        meshes += 1;
        const g = o.geometry;
        triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
      });
    }
    stats[id] = {
      meshes,
      triangles,
      colliders: ctx.colliders.length - before.colliders,
      platforms: ctx.platforms.length - before.platforms,
      interactables: ctx.interactables.length - before.interactables,
      groups: added.length,
    };
  }

  return { order, stats, warnings, terrain, only, stubs };
}
