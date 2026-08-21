#!/usr/bin/env node
/**
 * City integration gate (see references/city-scale.md).  Builds the whole
 * city headless — same boot as check-spatial.mjs — and runs every check
 * that only means something once the districts stand together:
 *
 *   1. plan validity (the validate-city-plan checks, so a stale plan
 *      cannot slip past this gate);
 *   2. composeCity's own asserts — module/plan match, anchor promises —
 *      which run during the build and fail it loudly;
 *   3. seam checks: ground continuity and corridor clearance at every
 *      socket pair (src/core/seams.js);
 *   4. the global spatial audit (src/core/spatialcheck.js) over the union
 *      of all envelopes, failures annotated with the owning district;
 *   5. a city-wide flood fill — collider BFS at the walker's own numbers
 *      (RADIUS 0.34, step 0.38, visited keyed on cell + height bucket),
 *      seeded from the first district's first waypoint, reaching EVERY
 *      district's waypoints.  A waypoint unreachable across a seam is the
 *      primary failure this whole system exists to catch: hand-picked
 *      routes test what you already believe, a flood fill does not;
 *   6. per-district budget checks against the plan's budgets;
 *   7. SURROUNDS COVERAGE — the spatial audit's hole grid samples only the
 *      union of envelopes, so the space BETWEEN and BEYOND them is checked
 *      by nothing, and `surrounds.owner` proves ownership was assigned,
 *      not discharged.  This samples the whole `city.footprint_m`; a hole
 *      outside every envelope reports against the surrounds owner;
 *   8. SIGHT CORRIDORS — each `sight_corridors[]` entry raycast from
 *      `from` to `to` at `min_clear_h` across `half_width`, naming which
 *      district's geometry blocks it.  This is how "the row must be able
 *      to see its own harbour" becomes checkable rather than aspirational;
 *   9. LANDMARK CONTRACTS — each district's `landmarks_citywide[]` raycast
 *      from every vista that names it and from sample points in every
 *      district that names it.  Before this the field had no reader;
 *  10. INTERACTIONS — a district that declares `interactions[]` and
 *      registers none fails.  The first city built this way shipped ZERO
 *      interactables and the runtime's whole KeyE system was dead code;
 *  11. UNDECLARED BOUNDARY FEATURES (warn) — two districts with tall
 *      geometry on the same shared edge and no `boundary_features` entry.
 *      It cannot be a FAIL, because a legitimate butt joint looks exactly
 *      the same from geometry alone — only the plan can tell them apart —
 *      but it would have caught the real double wall.
 *
 *   node scripts/check-city.mjs                 # the whole city
 *   node scripts/check-city.mjs --district <id> # one district's subset
 *     (its envelope, its waypoints, its sockets, its budget — for a
 *     district agent mid-build; the scene composes with `only`, so its
 *     neighbours stand as stub massing)
 *
 *   exit 0 pass · 1 defects found · 2 crashed before checking
 *
 * Scene convention: the city's src/scene.js exports
 * buildVignette(scene, { only } = {}) — main.js still calls it with one
 * argument — whose return includes `groundAt`, `colliders` (owner-stamped
 * by composeCity) and `city: { order, stats, warnings, terrain }`.
 */

// Canvas2D no-op stub: geometry never depends on what a canvas contains.
const noop = () => stubContext;
const stubContext = new Proxy({}, {
  get: (t, prop) => {
    if (prop === 'canvas') return stubCanvas;
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 1 });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return noop;
  },
  set: () => true,
});
const stubCanvas = new Proxy({ width: 2, height: 2 }, {
  get: (t, prop) => (prop === 'getContext' ? () => stubContext : (prop in t ? t[prop] : noop)),
  set: (t, prop, v) => ((t[prop] = v), true),
});
globalThis.document = { createElement: () => stubCanvas, createElementNS: () => stubCanvas };
globalThis.window = globalThis;
globalThis.self = globalThis;

import fs from 'node:fs';

const RADIUS = 0.34; // src/player.js
const STEP = 0.38;
const CELL = 0.35;
const MARGIN = 2;

const districtArg = (() => {
  const i = process.argv.indexOf('--district');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const r2 = (v) => Math.round(v * 100) / 100;
let failed = false;
const section = (name) => console.log(`\n== ${name} ==`);
const FAIL = (msg) => { failed = true; console.log(`FAIL ${msg}`); };

try {
  /* ---- 1. the plan ---- */
  const planPath = new URL('../city-plan.json', import.meta.url);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const { validatePlan } = await import('./validate-city-plan.mjs');
  section('plan');
  const pv = validatePlan(plan);
  for (const f of pv.failures) FAIL(`plan: ${f}`);
  for (const w of pv.warnings ?? []) console.log(`WARN plan: ${w}`);
  if (pv.ok) console.log(`PASS plan valid — ${plan.districts.length} districts`);
  if (districtArg && !plan.districts.some((d) => d.id === districtArg)) {
    console.error(`[check-city] --district "${districtArg}" is not in the plan`);
    process.exit(2);
  }
  const selected = districtArg ? plan.districts.filter((d) => d.id === districtArg) : plan.districts;

  const envelopeOf = (x, z) => plan.districts.find((d) =>
    x >= d.envelope.x0 && x <= d.envelope.x1 && z >= d.envelope.z0 && z <= d.envelope.z1)?.id ?? 'no district';

  /* ---- 2. build (composeCity asserts run inside) ---- */
  section('build (composeCity anchors assert during it)');
  const THREE = await import('three');
  let vignette;
  const scene = new THREE.Scene();
  try {
    const { buildVignette } = await import('../src/scene.js');
    // `only` composes the named district in full and every other as its
    // stub massing — the isolated agent's own view of the city
    vignette = buildVignette(scene, districtArg ? { only: districtArg } : {});
    scene.updateMatrixWorld(true);
  } catch (error) {
    if (error.composeCity) {
      FAIL(error.message);
      console.log('\nRESULT: FAIL — the city did not finish building');
      process.exit(1);
    }
    throw error;
  }
  if (!vignette.city) {
    console.error('[check-city] scene.js did not return a `city` field — build the scene through composeCity');
    process.exit(2);
  }
  console.log(`PASS built in order: ${vignette.city.order.join(' -> ')}`);
  for (const w of vignette.city.warnings) {
    console.log(`WARN [${w.district}] ${w.kind}: ${w.detail}`);
  }

  /* ---- 3. seams ---- */
  section('seams');
  const { checkSeams } = await import('../src/core/seams.js');
  const seams = checkSeams({ plan, ctx: vignette, scene });
  // in --district mode, only the pairs that district is a party to count
  const seamResults = districtArg
    ? seams.results.filter((r) => r.owners.split(' <-> ').includes(districtArg))
    : seams.results;
  console.log(`seam check: ${seamResults.length} socket pair${seamResults.length === 1 ? '' : 's'}${districtArg ? ` involving ${districtArg}` : ''}`);
  for (const r of seamResults) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.socket} <> ${r.mate} [${r.kind}] at (${r.at.join(', ')}) — ${r.owners}`);
    for (const f of r.failures) console.log(`  - ${f}`);
  }
  if (seamResults.some((r) => !r.ok)) failed = true;
  else console.log('PASS — ground continuous and corridors clear at every socket');

  /* ---- 4. global spatial audit, owners resolved via envelope ---- */
  section(districtArg ? `spatial audit (${districtArg})` : 'spatial audit (whole city)');
  const { createSpatialCheck } = await import('../src/core/spatialcheck.js');
  const footprint = districtArg
    ? selected[0].envelope
    : plan.districts.reduce((acc, d) => ({
        x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
        x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
      }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const spatial = createSpatialCheck({
    scene,
    groundAt: vignette.groundAt,
    colliders: vignette.colliders,
    footprint,
    islandSets: vignette.auditIslands,
    linearSets: vignette.auditLinear,
  }).checkSpatial();
  console.log(spatial.report.split('\n')[0]);
  const inDistrict = (p) => !districtArg || envelopeOf(p[0], p[2] ?? p[1]) === districtArg;
  let spatialShown = 0;
  for (const f of spatial.failures) {
    if (!inDistrict(f.position)) continue;
    spatialShown += 1;
    FAIL(`${f.type} [owner: ${envelopeOf(f.position[0], f.position[2] ?? f.position[1])}] ${f.object} — ${f.detail} @ [${f.position.join(', ')}]`);
  }
  for (const w of spatial.warnings) {
    if (!inDistrict(w.position)) continue;
    console.log(`WARN ${w.type} [owner: ${envelopeOf(w.position[0], w.position[2] ?? w.position[1])}] ${w.object} — ${w.detail}`);
  }
  if (spatialShown === 0) console.log('PASS no spatial defects' + (districtArg ? ` inside ${districtArg}` : ''));

  /* ---- 5. flood fill over every district's waypoints ---- */
  section(districtArg ? `flood fill (${districtArg})` : 'flood fill (whole city)');
  const fillRect = districtArg
    ? { x0: selected[0].envelope.x0 - MARGIN, x1: selected[0].envelope.x1 + MARGIN,
        z0: selected[0].envelope.z0 - MARGIN, z1: selected[0].envelope.z1 + MARGIN }
    : { x0: footprint.x0 - MARGIN, x1: footprint.x1 + MARGIN, z0: footprint.z0 - MARGIN, z1: footprint.z1 + MARGIN };
  const seedWp = districtArg ? selected[0].waypoints[0] : plan.districts[0].waypoints[0];
  const seed = [seedWp.x, seedWp.z];
  const { colliders, groundAt } = vignette;

  // bucket the colliders — a fill that scans all of them per neighbour test
  // is quadratic and wedges long before it finishes
  const GRID = 4;
  const buckets = new Map();
  const bkey = (i, j) => `${i},${j}`;
  for (const c of colliders) {
    for (let i = Math.floor((c.x0 - RADIUS) / GRID); i <= Math.floor((c.x1 + RADIUS) / GRID); i += 1) {
      for (let j = Math.floor((c.z0 - RADIUS) / GRID); j <= Math.floor((c.z1 + RADIUS) / GRID); j += 1) {
        const k = bkey(i, j);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(c);
      }
    }
  }
  const blocked = (x, z) => {
    const list = buckets.get(bkey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!list) return false;
    for (const c of list) {
      if (x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS) return true;
    }
    return false;
  };

  const ci = (x) => Math.round((x - fillRect.x0) / CELL);
  const cj = (z) => Math.round((z - fillRect.z0) / CELL);
  const W = ci(fillRect.x1) + 1;
  const D = cj(fillRect.z1) + 1;
  if (blocked(seed[0], seed[1])) {
    FAIL(`the fill seed (${seed.join(', ')}) — "${seedWp.name}" — is inside a collider`);
  } else {
    // visited keyed on (cell, height bucket): one bit per cell cannot verify
    // a staircase — it claims the treads at ground height from the side and
    // then refuses to revisit them at the climb's height
    const seen = new Set();
    const reachable = new Map(); // cell -> best height reached
    const startY = groundAt(seed[0], seed[1]);
    const queue = [[ci(seed[0]), cj(seed[1]), startY]];
    seen.add(`${queue[0][0]},${queue[0][1]},${Math.round(startY / 0.3)}`);
    reachable.set(queue[0][0] * 100000 + queue[0][1], startY);
    let visits = 0;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
      const [i, j, y] = queue.pop();
      visits += 1;
      for (const [di, dj] of NB) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
        const nx = fillRect.x0 + ni * CELL;
        const nz = fillRect.z0 + nj * CELL;
        if (blocked(nx, nz)) continue;
        const ny = groundAt(nx, nz);
        if (ny - y > STEP) continue; // too tall a rise to climb
        const k = `${ni},${nj},${Math.round(ny / 0.3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const cellKey = ni * 100000 + nj;
        if (!reachable.has(cellKey) || reachable.get(cellKey) < ny) reachable.set(cellKey, ny);
        queue.push([ni, nj, ny]);
      }
    }
    console.log(`fill: ${reachable.size} cells reachable from "${seedWp.name}" (${seed.join(', ')}) over ` +
      `x ${r2(fillRect.x0)}..${r2(fillRect.x1)}, z ${r2(fillRect.z0)}..${r2(fillRect.z1)} at ${CELL} m, ` +
      `radius ${RADIUS}, step ${STEP} — ${visits} visits, ${colliders.length} colliders`);
    const reached = (x, z) => {
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          if (reachable.has((ci(x) + di) * 100000 + (cj(z) + dj))) return true;
        }
      }
      return false;
    };
    for (const d of selected) {
      for (const w of d.waypoints) {
        const ok = reached(w.x, w.z);
        if (ok) console.log(`PASS [${d.id}] ${w.name} (${w.x}, ${w.z})`);
        else FAIL(`[${d.id}] waypoint "${w.name}" (${w.x}, ${w.z}) is UNREACHABLE from the seed — a route across a seam is broken`);
      }
    }
  }

  /* ---- 6. budgets ---- */
  section('budgets');
  for (const d of selected) {
    const s = vignette.city.stats[d.id];
    if (!s) { FAIL(`[${d.id}] no stats recorded — was the district built?`); continue; }
    const over = [];
    if (s.meshes > d.budgets.max_meshes) over.push(`meshes ${s.meshes} > ${d.budgets.max_meshes}`);
    if (s.triangles > d.budgets.max_triangles) over.push(`triangles ${s.triangles} > ${d.budgets.max_triangles}`);
    if (over.length) FAIL(`[${d.id}] over budget: ${over.join(', ')}`);
    else console.log(`PASS [${d.id}] ${s.meshes} meshes / ${d.budgets.max_meshes}, ${s.triangles} triangles / ${d.budgets.max_triangles}, ${s.colliders} colliders, ${s.platforms} platforms`);
  }

  /* ================================================================= *
   * The city-wide checks: everything below is about the space BETWEEN
   * districts, which is precisely the space no district agent owns.
   * ================================================================= */

  const stubMode = !!districtArg;
  const raycaster = new THREE.Raycaster();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shoot = (origin, target) => {
    const dir = target.clone().sub(origin);
    const far = dir.length();
    raycaster.set(origin, dir.normalize());
    raycaster.far = far;
    raycaster.near = 0;
    return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3) ?? null;
  };
  const castDown = (x, z, fromY) => {
    raycaster.set(V(x, fromY, z), V(0, -1, 0));
    raycaster.far = fromY + 200;
    return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-3) ?? null;
  };
  /* composeCity renames every group `district:<id>:<base>` and stamps every
   * anonymous mesh `<id>:<group>:<n>`, so a hit can always name its owner —
   * "blocked by pool-0" named nothing until it did. */
  const districtIds = new Set(plan.districts.map((d) => d.id));
  const ownerOf = (object) => {
    for (let o = object; o; o = o.parent) {
      const n = typeof o.name === 'string' ? o.name : '';
      if (n.startsWith('terrain')) return 'terrain';
      const m = /^district:([a-z0-9-]+):/.exec(n);
      if (m && districtIds.has(m[1])) return m[1];
      const m2 = /^([a-z0-9-]+):/.exec(n);
      if (m2 && districtIds.has(m2[1])) return m2[1];
    }
    return 'unowned';
  };
  const nameOf = (object) => {
    for (let o = object; o; o = o.parent) if (o.name) return o.name;
    return '(unnamed)';
  };
  const inSubtree = (object, root) => {
    for (let o = object; o; o = o.parent) if (o === root) return true;
    return false;
  };

  /* ---- 7. surrounds coverage ----------------------------------------
   * The spatial audit samples the union of ENVELOPES. Everything between
   * and beyond them — which is the majority of most city footprints, and
   * all of the sea/moor/backdrop — was checked by nothing at all. */
  section('surrounds coverage (the whole footprint, not the parcels)');
  {
    // the WHOLE city, never the selected district: this check exists for
    // the ground nobody's envelope covers
    const u = plan.districts.reduce((acc, d) => ({
      x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
      x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
    }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
    const [fw, fd] = plan.city.footprint_m;
    const mx = (u.x0 + u.x1) / 2;
    const mz = (u.z0 + u.z1) / 2;
    const rect = {
      x0: Math.min(u.x0, mx - fw / 2), x1: Math.max(u.x1, mx + fw / 2),
      z0: Math.min(u.z0, mz - fd / 2), z1: Math.max(u.z1, mz + fd / 2),
    };
    const levels = (plan.terrain?.levels ?? []).map((l) => l.y).filter((v) => typeof v === 'number');
    const FLOOR_Y = (levels.length ? Math.min(...levels) : 0) - 3;
    const GRID = 1.5;
    const owner = plan.surrounds?.owner ?? 'nobody';
    const holes = [];
    let samples = 0;
    for (let x = rect.x0 + GRID / 2; x < rect.x1; x += GRID) {
      for (let z = rect.z0 + GRID / 2; z < rect.z1; z += GRID) {
        samples += 1;
        const hit = castDown(x, z, 120);
        if (hit && hit.point.y >= FLOOR_Y) continue;
        const inside = envelopeOf(x, z);
        holes.push({ x, z, y: hit ? hit.point.y : null, owner: inside === 'no district' ? `surrounds (${owner})` : inside });
      }
    }
    console.log(`sampled ${samples} points at ${GRID} m over x ${r2(rect.x0)}..${r2(rect.x1)}, z ${r2(rect.z0)}..${r2(rect.z1)} ` +
      `(footprint_m ${fw}×${fd}); floor threshold y ${r2(FLOOR_Y)}`);
    if (!holes.length) console.log(`PASS ground everywhere in the footprint — nothing ends in a cut, surrounds owner "${owner}"`);
    else {
      const byOwner = new Map();
      for (const h of holes) byOwner.set(h.owner, (byOwner.get(h.owner) ?? 0) + 1);
      for (const [who, n] of byOwner) {
        const first = holes.find((h) => h.owner === who);
        FAIL(`GROUND HOLE [owner: ${who}] ${n} sample${n === 1 ? '' : 's'} with no surface ` +
          `(${(n * GRID * GRID).toFixed(0)} m²), first at (${r2(first.x)}, ${r2(first.z)})` +
          `${first.y === null ? ' — nothing below at all' : ` — first surface at y ${r2(first.y)}, under the floor threshold`}`);
      }
    }
  }

  /* ---- 8. sight corridors -------------------------------------------
   * A cross-district requirement written into ONE district's brief is a
   * requirement that agent cannot honour. */
  section('sight corridors');
  {
    const list = (plan.sight_corridors ?? []).filter((c) => !stubMode || (c.districts ?? []).includes(districtArg));
    if (!list.length) console.log(`no sight corridors declared${stubMode ? ` crossing ${districtArg}` : ''}`);
    for (const c of list) {
      const [fx, fz] = c.from;
      const [tx, tz] = c.to;
      const len = Math.hypot(tx - fx, tz - fz);
      const nx = -(tz - fz) / len;
      const nz = (tx - fx) / len;
      const hw = c.half_width;
      const offsets = [-hw, -hw / 2, 0, hw / 2, hw];
      const blocks = [];
      for (const o of offsets) {
        const a = V(fx + nx * o, c.min_clear_h, fz + nz * o);
        const b = V(tx + nx * o, c.min_clear_h, tz + nz * o);
        const hit = shoot(a, b);
        if (hit && hit.distance < len - 0.15) {
          blocks.push(`offset ${o >= 0 ? '+' : ''}${r2(o)} m blocked ${r2(hit.distance)} m along by ` +
            `"${nameOf(hit.object)}" [owner: ${ownerOf(hit.object)}] at (${r2(hit.point.x)}, ${r2(hit.point.z)})`);
        }
      }
      if (!blocks.length) {
        console.log(`PASS ${c.id} — ${r2(len)} m clear at y ${c.min_clear_h} across ±${hw} m ` +
          `[crosses ${(c.districts ?? []).join(', ')}]`);
      } else {
        FAIL(`SIGHT CORRIDOR BLOCKED "${c.id}" (${c.why ?? 'no reason given'}) — ${blocks.join('; ')}`);
      }
    }
  }

  /* ---- 9. landmark contracts ----------------------------------------- */
  section('landmark contracts');
  {
    let any = 0;
    const vistas = new Map((plan.vista_cameras ?? []).map((v) => [v.name, v]));
    for (const d of selected) {
      for (const l of d.landmarks_citywide ?? []) {
        if (typeof l === 'string' || !l?.object) continue; // the validator already failed it
        any += 1;
        const target = scene.getObjectByName(l.object);
        if (!target) {
          FAIL(`LANDMARK MISSING [${d.id}] "${l.object}" is not in the scene — nothing with that name was added ` +
            '(composeCity names a district group `district:<id>:<name>`)');
          continue;
        }
        const box = new THREE.Box3().setFromObject(target);
        if (box.isEmpty()) { FAIL(`LANDMARK EMPTY [${d.id}] "${l.object}" has no geometry to see`); continue; }
        const c = box.getCenter(new THREE.Vector3());
        const top = c.clone(); top.y = box.max.y - (box.max.y - box.min.y) * 0.2;
        const aims = [top, c];
        const visibleFrom = (origin) => {
          for (const aim of aims) {
            const hit = shoot(origin, aim);
            if (!hit) return { ok: true };
            if (inSubtree(hit.object, target)) return { ok: true };
            if (hit.distance >= origin.distanceTo(aim) - 0.3) return { ok: true };
          }
          const hit = shoot(origin, top);
          return { ok: false, hit };
        };
        for (const vname of l.must_read_from_vistas ?? []) {
          const v = vistas.get(vname);
          if (!v) { FAIL(`LANDMARK [${d.id}] "${l.object}" names vista "${vname}", which is not in the plan`); continue; }
          const res = visibleFrom(V(...v.position));
          if (res.ok) console.log(`PASS [${d.id}] "${l.object}" reads from vista "${vname}"`);
          else {
            FAIL(`LANDMARK NOT VISIBLE [${d.id}] "${l.object}" from vista "${vname}" at [${v.position.join(', ')}] — ` +
              `blocked by "${nameOf(res.hit.object)}" [owner: ${ownerOf(res.hit.object)}] ${r2(res.hit.distance)} m out`);
          }
        }
        for (const from of l.must_read_from_districts ?? []) {
          const src = plan.districts.find((x) => x.id === from);
          if (!src) { FAIL(`LANDMARK [${d.id}] "${l.object}" names district "${from}", which is not in the plan`); continue; }
          /* sample points: that district's own waypoints, at eye height.
           * "Must read from the row" is a claim about standing in the row,
           * and its waypoints are the places the plan says you stand. */
          const pts = src.waypoints.map((w) => V(w.x, vignette.groundAt(w.x, w.z) + 1.7, w.z));
          const seenFrom = [];
          const blindAt = [];
          for (const [i, p] of pts.entries()) {
            const res = visibleFrom(p);
            if (res.ok) seenFrom.push(src.waypoints[i].name);
            else blindAt.push(`"${src.waypoints[i].name}" (blocked by "${nameOf(res.hit.object)}" [${ownerOf(res.hit.object)}])`);
          }
          if (!seenFrom.length) {
            FAIL(`LANDMARK NOT VISIBLE [${d.id}] "${l.object}" from ANY of ${pts.length} sample points in "${from}" — ${blindAt.join('; ')}`);
          } else {
            console.log(`PASS [${d.id}] "${l.object}" reads from ${seenFrom.length}/${pts.length} points in "${from}" (${seenFrom.join(', ')})`);
            if (seenFrom.length * 2 < pts.length) {
              console.log(`WARN [${d.id}] "${l.object}" is hidden from most of "${from}": ${blindAt.join('; ')}`);
            }
          }
        }
      }
    }
    if (!any) console.log('no landmark contracts declared' + (districtArg ? ` for ${districtArg}` : ''));
  }

  /* ---- 10. interactions ---------------------------------------------- */
  section('interactions');
  for (const d of selected) {
    const declared = (d.interactions ?? []).length;
    const built = vignette.city.stats[d.id]?.interactables ?? 0;
    if (declared > 0 && built === 0) {
      FAIL(`[${d.id}] declares ${declared} interaction${declared === 1 ? '' : 's'} in the plan ` +
        `(${d.interactions.map((i) => `"${i.name}"`).join(', ')}) and registered NONE. ` +
        'The runtime raycasts `interactables` every frame; a city where nobody registers one leaves that ' +
        'whole system as dead code — which is exactly what the first city built this way shipped. ' +
        'Register it with ctx.interact({ label, hitbox, action }).');
    } else if (declared === 0) {
      console.log(`WARN [${d.id}] declares no interactions in the plan — every district contributes at least one`);
    } else {
      console.log(`PASS [${d.id}] ${built} interactable${built === 1 ? '' : 's'} registered for ${declared} declared`);
    }
  }

  /* ---- 11. undeclared boundary features (WARN only) ------------------
   * Two districts each raising a wall on the same line composed correctly
   * only by luck in the first city built this way.  This cannot be a FAIL:
   * a legitimate butt joint — one district's wall, the other's building
   * face right behind it — looks identical from geometry alone, and only
   * the plan can tell the two apart.  So it points at the line and asks. */
  section('boundary features (declared vs. built)');
  if (stubMode) console.log(`skipped — "${districtArg}" is composed against stub massing, so a shared edge has no real neighbour on it`);
  else {
    const TALL_M = 0.5;
    const NEAR_M = 0.5;
    const MIN_RUN_M = 2;
    const byDistrict = new Map(plan.districts.map((d) => [d.id, []]));
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const owner = ownerOf(o);
      if (!byDistrict.has(owner)) return;      // terrain and unowned are not features
      box.setFromObject(o);
      if (box.isEmpty() || box.max.y - box.min.y <= TALL_M) return;
      byDistrict.get(owner).push({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, name: nameOf(o) });
    });
    const merge = (spans) => {
      const s = spans.slice().sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const [a, b] of s) {
        if (out.length && a <= out[out.length - 1][1] + 0.1) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
        else out.push([a, b]);
      }
      return out;
    };
    const declared = plan.boundary_features ?? [];
    let pairs = 0;
    let flagged = 0;
    for (let i = 0; i < plan.districts.length; i += 1) {
      for (let j = i + 1; j < plan.districts.length; j += 1) {
        const A = plan.districts[i];
        const B = plan.districts[j];
        const a = A.envelope;
        const b = B.envelope;
        for (const axis of ['x', 'z']) {
          const [aLo, aHi, bLo, bHi] = axis === 'x' ? [a.x0, a.x1, b.x0, b.x1] : [a.z0, a.z1, b.z0, b.z1];
          const edge = Math.abs(aHi - bLo) <= 0.05 ? aHi : Math.abs(aLo - bHi) <= 0.05 ? aLo : null;
          if (edge === null) continue;
          const along = axis === 'x' ? 'z' : 'x';
          const [pLo, pHi] = along === 'z'
            ? [Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)]
            : [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)];
          if (pHi - pLo <= 0.05) continue;
          pairs += 1;
          const spansOf = (id) => merge(byDistrict.get(id)
            .filter((m) => (axis === 'x' ? m.x0 - NEAR_M <= edge && edge <= m.x1 + NEAR_M
              : m.z0 - NEAR_M <= edge && edge <= m.z1 + NEAR_M))
            .map((m) => (along === 'z'
              ? [Math.max(m.z0, pLo), Math.min(m.z1, pHi)]
              : [Math.max(m.x0, pLo), Math.min(m.x1, pHi)]))
            .filter(([s, e2]) => e2 > s));
          const sa = spansOf(A.id);
          const sb = spansOf(B.id);
          for (const [a0, a1] of sa) {
            for (const [b0, b1] of sb) {
              const lo = Math.max(a0, b0);
              const hi = Math.min(a1, b1);
              if (hi - lo < MIN_RUN_M) continue;
              const covered = declared.some((f) => f.along === along && Math.abs(f.at - edge) <= 0.05 &&
                f.from <= lo + 0.1 && f.to >= hi - 0.1 &&
                ((f.owner === A.id && f.mate === B.id) || (f.owner === B.id && f.mate === A.id)));
              if (covered) continue;
              flagged += 1;
              console.log(`WARN UNDECLARED BOUNDARY FEATURE: "${A.id}" and "${B.id}" both have geometry over ` +
                `${TALL_M} m tall within ${NEAR_M} m of their shared ${axis} = ${r2(edge)} edge, overlapping over ` +
                `${along} ${r2(lo)}..${r2(hi)} (${r2(hi - lo)} m). If that is one wall it belongs to ONE of them — ` +
                `add a boundary_features entry { along: "${along}", at: ${r2(edge)}, from: ${r2(lo)}, to: ${r2(hi)}, ` +
                'owner, mate }. If it is genuinely two things butted together, declare it anyway and say so: both ' +
                'building it is a double wall, neither is a gap, and no gate can tell those apart from geometry.');
            }
          }
        }
      }
    }
    if (!flagged) console.log(`PASS ${pairs} shared edge${pairs === 1 ? '' : 's'} — no undeclared double-build on any of them`);
  }

  console.log(`\nRESULT: ${failed ? 'FAIL — defects above' : 'PASS — plan, anchors, seams, spatial audit, routes, budgets, surrounds, sight corridors, landmarks and interactions all green'}`);
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error('[check-city] crashed before checking:', error);
  process.exit(2);
}
