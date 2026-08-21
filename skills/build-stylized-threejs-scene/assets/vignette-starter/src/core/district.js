import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * City scale: district descriptors and the composer.
 *
 * A city is built by decomposition (see the skill's references/
 * city-scale.md): a coordinator writes city-plan.json, parallel agents
 * each own one district module, and this file is where the two meet.
 * `defineDistrict` is what a district agent exports; `composeCity` is
 * what the city's scene.js calls instead of building directly.
 *
 * Everything here exists to make the seams loud:
 *   - a plan district with no registered module (or vice versa) THROWS —
 *     the flagship's "a module nobody imports builds nothing, silently"
 *     sat unnoticed for a whole round;
 *   - every collider / platform / cut / interactable a district registers
 *     is stamped { owner: id } and every group it adds is renamed
 *     `district:<id>:<...>`, so every later gate failure names its owner
 *     ("whose box is this?" archaeology was a multi-turn cost);
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

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

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
 * Compose the city: match plan districts to registered modules (both ways,
 * loudly), topo-sort by `after`, build each district through a wrapped ctx
 * that stamps ownership and polices the envelope, assert each district's
 * anchors as it lands, and collect per-district stats for budget checks.
 *
 * @param {object} args
 * @param {object} args.plan       the parsed city-plan.json
 * @param {object[]} args.districts array of defineDistrict descriptors
 * @param {object} args.ctx        the createBuilder ctx for the whole city
 * @returns {{ order: string[], stats: object, warnings: object[] }}
 */
export function composeCity({ plan, districts, ctx }) {
  if (!plan || !Array.isArray(plan.districts) || plan.districts.length === 0) {
    throw new Error('composeCity: plan.districts is missing or empty');
  }
  const entries = new Map(plan.districts.map((d) => [d.id, d]));
  const modules = new Map();
  for (const d of districts ?? []) {
    if (modules.has(d.id)) throw new Error(`composeCity: district module "${d.id}" registered twice`);
    modules.set(d.id, d);
  }

  // Both directions, and both are fatal.  A plan district with no module is
  // a hole in the city; a module with no plan entry has no contract at all.
  const unbuilt = [...entries.keys()].filter((id) => !modules.has(id));
  const unplanned = [...modules.keys()].filter((id) => !entries.has(id));
  if (unbuilt.length || unplanned.length) {
    const lines = [];
    if (unbuilt.length) lines.push(`plan districts with NO registered module (they would silently not exist): ${unbuilt.join(', ')}`);
    if (unplanned.length) lines.push(`registered modules with NO plan entry (no contract, no envelope, no gates): ${unplanned.join(', ')}`);
    throw new Error(`composeCity: plan and modules disagree —\n  ${lines.join('\n  ')}`);
  }

  // `after` edges: union of the plan's (the contract) and the module's (what
  // the code actually leans on) — either one alone can under-declare.
  const edges = new Map();
  for (const [id, entry] of entries) {
    const deps = new Set([...(entry.after ?? []), ...modules.get(id).after]);
    for (const dep of deps) {
      if (!entries.has(dep)) throw new Error(`composeCity: district "${id}" is \`after\` unknown district "${dep}"`);
    }
    edges.set(id, [...deps]);
  }
  const order = topoSort([...entries.keys()], edges);

  const warnings = [];
  const stats = {};
  const warn = (district, kind, detail, position) => warnings.push({ district, kind, detail, position });

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
    wrapped.interact = (interactableEntry) => {
      interactableEntry.owner = id;
      return ctx.interact(interactableEntry);
    };
    wrapped.add = (object, name) => {
      addCount += 1;
      const base = name ?? object.name ?? `part-${addCount}`;
      const result = ctx.add(object, `district:${id}:${base}`);
      added.push(object);
      return result;
    };

    module.build(wrapped, { plan, entry });

    // Envelope check for added groups AFTER the build: geometry is often
    // attached to a group after ctx.add, so bounds are only real now.
    const box = new THREE.Box3();
    for (const object of added) {
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
    for (const object of added) {
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

  return { order, stats, warnings };
}
