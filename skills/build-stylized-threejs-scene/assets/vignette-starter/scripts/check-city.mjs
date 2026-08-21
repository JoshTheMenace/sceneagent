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
 *   6. per-district budget checks against the plan's budgets.
 *
 *   node scripts/check-city.mjs                 # the whole city
 *   node scripts/check-city.mjs --district <id> # one district's subset
 *     (its envelope, its waypoints, its sockets, its budget — for a
 *     district agent mid-build)
 *
 *   exit 0 pass · 1 defects found · 2 crashed before checking
 *
 * Scene convention: the city's src/scene.js exports buildVignette(scene)
 * (so main.js is unchanged) whose return includes `groundAt`, `colliders`
 * (owner-stamped by composeCity) and `city: { order, stats, warnings }`.
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
    vignette = buildVignette(scene);
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

  console.log(`\nRESULT: ${failed ? 'FAIL — defects above' : 'PASS — plan, anchors, seams, spatial audit, routes and budgets all green'}`);
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error('[check-city] crashed before checking:', error);
  process.exit(2);
}
