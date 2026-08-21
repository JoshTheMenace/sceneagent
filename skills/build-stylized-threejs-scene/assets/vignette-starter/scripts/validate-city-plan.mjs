#!/usr/bin/env node
/**
 * Plan-level gate for city-plan.json (see references/city-scale.md).
 * Runs BEFORE any district is built: a bad plan is revised, never patched
 * around.  Pure JSON checks, no three.js:
 *
 *   - schema shape (city, districts, envelopes, sockets, anchors,
 *     waypoints, budgets, vista cameras);
 *   - placeholder rejection on name / promise / brief / subjects — the
 *     template's own prompt text must not survive into a real plan;
 *   - envelope overlap: any pair intersecting with positive area fails
 *     (adjacent edges are fine — that is what a boundary is);
 *   - socket pairing: every mate exists, is reciprocal, agrees on kind /
 *     width / y within tolerance, and both ends sit on the shared boundary
 *     segment between the two envelopes;
 *   - `after` references exist and contain no cycle;
 *   - every district has at least one waypoint and one anchor;
 *   - vista cameras have positions, targets and non-placeholder subjects.
 *
 *   node scripts/validate-city-plan.mjs [path/to/city-plan.json]
 *     exit 0 valid · 1 invalid · 2 unreadable/crashed
 */

import fs from 'node:fs';

// The template's unedited prompt text ("Replace with…", "Describe…",
// "Name the…", plus the waypoint stub "Name a place…").
const PLACEHOLDER = /^\s*(replace|describe|name (the|a))\b/i;
const EPS = 0.05;       // geometric tolerance for "on the boundary"
const AGREE_EPS = 0.01; // numeric agreement between paired sockets
const AT_EPS = 0.75;    // the two ends of a pair describe ONE crossing

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);

export function validatePlan(plan) {
  const failures = [];
  const fail = (msg) => failures.push(msg);

  if (!plan || typeof plan !== 'object') return { ok: false, failures: ['plan is not an object'] };

  /* ---- city block ---- */
  const city = plan.city;
  if (!city || typeof city !== 'object') fail('city: missing');
  else {
    if (!isStr(city.name)) fail('city.name: missing');
    else if (PLACEHOLDER.test(city.name)) fail(`city.name is template placeholder text: "${city.name}"`);
    if (!isStr(city.promise)) fail('city.promise: missing');
    else if (PLACEHOLDER.test(city.promise)) fail(`city.promise is template placeholder text: "${city.promise}"`);
    if (!isVec(city.footprint_m, 2)) fail('city.footprint_m: must be [width, depth] numbers');
  }

  /* ---- districts ---- */
  if (!Array.isArray(plan.districts) || plan.districts.length === 0) {
    fail('districts: missing or empty');
    return { ok: false, failures };
  }
  const ids = new Set();
  const socketIndex = new Map(); // socket id -> { socket, district }
  for (const d of plan.districts) {
    const where = `district "${d?.id ?? '?'}"`;
    if (!isStr(d.id) || !/^[a-z0-9][a-z0-9-]*$/.test(d.id)) { fail(`${where}: id must be kebab-case`); continue; }
    if (ids.has(d.id)) fail(`${where}: duplicate id`);
    ids.add(d.id);
    if (!isStr(d.name)) fail(`${where}: name missing`);
    else if (PLACEHOLDER.test(d.name)) fail(`${where}: name is template placeholder text: "${d.name}"`);
    if (!isStr(d.brief)) fail(`${where}: brief missing`);
    else if (PLACEHOLDER.test(d.brief)) fail(`${where}: brief is template placeholder text: "${d.brief.slice(0, 60)}…"`);
    const e = d.envelope;
    if (!e || !isNum(e.x0) || !isNum(e.z0) || !isNum(e.x1) || !isNum(e.z1) || e.x0 >= e.x1 || e.z0 >= e.z1) {
      fail(`${where}: envelope must be { x0, z0, x1, z1 } with x0 < x1, z0 < z1`);
    }
    if (d.after !== undefined && (!Array.isArray(d.after) || d.after.some((a) => !isStr(a)))) fail(`${where}: after must be an array of ids`);
    if (!Array.isArray(d.waypoints) || d.waypoints.length === 0) fail(`${where}: needs at least one waypoint`);
    else {
      for (const w of d.waypoints) {
        if (!isStr(w.name) || !isNum(w.x) || !isNum(w.z)) fail(`${where}: waypoint must be { name, x, z }: ${JSON.stringify(w)}`);
        else if (PLACEHOLDER.test(w.name)) fail(`${where}: waypoint name is template placeholder text: "${w.name}"`);
      }
    }
    if (!Array.isArray(d.anchors) || d.anchors.length === 0) fail(`${where}: needs at least one anchor`);
    else {
      for (const a of d.anchors) {
        if (!isNum(a.x) || !isNum(a.z) || !isNum(a.expect_top)) fail(`${where}: anchor must be { x, z, expect_top, tol? }: ${JSON.stringify(a)}`);
      }
    }
    if (!d.budgets || !isNum(d.budgets.max_meshes) || !isNum(d.budgets.max_triangles)) {
      fail(`${where}: budgets must carry numeric max_meshes and max_triangles`);
    }
    for (const s of d.sockets ?? []) {
      const sw = `${where} socket "${s?.id ?? '?'}"`;
      if (!isStr(s.id)) { fail(`${sw}: id missing`); continue; }
      if (socketIndex.has(s.id)) fail(`${sw}: duplicate socket id "${s.id}"`);
      socketIndex.set(s.id, { socket: s, district: d });
      if (!isStr(s.kind)) fail(`${sw}: kind missing`);
      if (!isVec(s.at, 2)) fail(`${sw}: at must be [x, z]`);
      if (s.axis !== 'x' && s.axis !== 'z') fail(`${sw}: axis must be 'x' or 'z'`);
      if (!isNum(s.width) || s.width <= 1) fail(`${sw}: width must be a number > 1 (the clear-passage rule subtracts 1 m)`);
      if (!isNum(s.y)) fail(`${sw}: y (ground elevation at the crossing) missing`);
      if (!isStr(s.mate)) fail(`${sw}: mate missing — sockets are declared in pairs`);
    }
  }

  /* ---- envelope overlap: positive shared area between any pair fails ---- */
  const withEnvelope = plan.districts.filter((d) => d.envelope && isNum(d.envelope.x0));
  for (let i = 0; i < withEnvelope.length; i += 1) {
    for (let j = i + 1; j < withEnvelope.length; j += 1) {
      const a = withEnvelope[i].envelope;
      const b = withEnvelope[j].envelope;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > EPS && oz > EPS) {
        fail(`envelopes of "${withEnvelope[i].id}" and "${withEnvelope[j].id}" overlap by ` +
          `${(ox * oz).toFixed(1)} m² over x ${Math.max(a.x0, b.x0)}..${Math.min(a.x1, b.x1)}, ` +
          `z ${Math.max(a.z0, b.z0)}..${Math.min(a.z1, b.z1)} — envelopes may not overlap`);
      }
    }
  }

  /* ---- socket pairing ---- */
  const onSegment = (v, lo, hi) => v >= lo - EPS && v <= hi + EPS;
  for (const [id, { socket: s, district: d }] of socketIndex) {
    const sw = `district "${d.id}" socket "${id}"`;
    if (!isStr(s.mate)) continue;
    const mate = socketIndex.get(s.mate);
    if (!mate) { fail(`${sw}: mate "${s.mate}" does not exist — a socket may not be unpaired`); continue; }
    if (mate.district.id === d.id) fail(`${sw}: mate "${s.mate}" is in the same district`);
    if (mate.socket.mate !== id) fail(`${sw}: pairing is not reciprocal — mate "${s.mate}" points at "${mate.socket.mate}"`);
    if (mate.socket.kind !== s.kind) fail(`${sw}: kind "${s.kind}" disagrees with mate's "${mate.socket.kind}"`);
    if (isNum(mate.socket.width) && Math.abs(mate.socket.width - s.width) > AGREE_EPS) {
      fail(`${sw}: width ${s.width} disagrees with mate's ${mate.socket.width}`);
    }
    if (isNum(mate.socket.y) && Math.abs(mate.socket.y - s.y) > AGREE_EPS) {
      fail(`${sw}: y ${s.y} disagrees with mate's ${mate.socket.y}`);
    }
    if (isVec(s.at, 2) && isVec(mate.socket.at, 2)) {
      const dist = Math.hypot(s.at[0] - mate.socket.at[0], s.at[1] - mate.socket.at[1]);
      if (dist > AT_EPS) fail(`${sw}: at ${JSON.stringify(s.at)} is ${dist.toFixed(2)} m from mate's ${JSON.stringify(mate.socket.at)} — a pair describes one crossing`);
    }
    // both ends on the shared boundary segment between the two envelopes
    const a = d.envelope;
    const b = mate.district.envelope;
    if (a && b && isVec(s.at, 2) && (s.axis === 'x' || s.axis === 'z')) {
      const [sx, sz] = s.at;
      if (s.axis === 'x') {
        // route crosses along x: boundary is an x = const edge shared by both
        const edge = Math.abs(a.x1 - b.x0) <= EPS ? a.x1 : Math.abs(a.x0 - b.x1) <= EPS ? a.x0 : null;
        if (edge === null) fail(`${sw}: axis 'x' but envelopes of "${d.id}" and "${mate.district.id}" share no x-edge`);
        else {
          if (Math.abs(sx - edge) > EPS) fail(`${sw}: at x = ${sx} is not on the shared boundary x = ${edge}`);
          const lo = Math.max(a.z0, b.z0);
          const hi = Math.min(a.z1, b.z1);
          if (!onSegment(sz - s.width / 2, lo, hi) || !onSegment(sz + s.width / 2, lo, hi)) {
            fail(`${sw}: width ${s.width} at z = ${sz} does not fit the shared boundary segment z ${lo}..${hi}`);
          }
        }
      } else {
        const edge = Math.abs(a.z1 - b.z0) <= EPS ? a.z1 : Math.abs(a.z0 - b.z1) <= EPS ? a.z0 : null;
        if (edge === null) fail(`${sw}: axis 'z' but envelopes of "${d.id}" and "${mate.district.id}" share no z-edge`);
        else {
          if (Math.abs(sz - edge) > EPS) fail(`${sw}: at z = ${sz} is not on the shared boundary z = ${edge}`);
          const lo = Math.max(a.x0, b.x0);
          const hi = Math.min(a.x1, b.x1);
          if (!onSegment(sx - s.width / 2, lo, hi) || !onSegment(sx + s.width / 2, lo, hi)) {
            fail(`${sw}: width ${s.width} at x = ${sx} does not fit the shared boundary segment x ${lo}..${hi}`);
          }
        }
      }
    }
  }

  /* ---- after: refs exist, no cycles ---- */
  for (const d of plan.districts) {
    for (const a of d.after ?? []) {
      if (!ids.has(a)) fail(`district "${d.id}": after references unknown district "${a}"`);
    }
  }
  const state = new Map();
  const path = [];
  const visit = (id) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      fail(`\`after\` dependency cycle: ${path.slice(path.indexOf(id)).concat(id).join(' -> ')}`);
      return;
    }
    state.set(id, 1);
    path.push(id);
    const d = plan.districts.find((x) => x.id === id);
    for (const dep of d?.after ?? []) if (ids.has(dep)) visit(dep);
    path.pop();
    state.set(id, 2);
  };
  for (const id of ids) visit(id);

  /* ---- vista cameras ---- */
  for (const v of plan.vista_cameras ?? []) {
    const vw = `vista camera "${v?.name ?? '?'}"`;
    if (!isStr(v.name)) fail('vista camera: name missing');
    if (!isVec(v.position, 3)) fail(`${vw}: position must be [x, y, z]`);
    if (!isVec(v.target, 3)) fail(`${vw}: target must be [x, y, z]`);
    if (!isStr(v.subject)) fail(`${vw}: subject missing — a vista exists to show something`);
    else if (PLACEHOLDER.test(v.subject)) fail(`${vw}: subject is template placeholder text: "${v.subject}"`);
  }

  return { ok: failures.length === 0, failures };
}

/* ---- CLI ---- */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  const file = process.argv[2] ?? new URL('../city-plan.json', import.meta.url).pathname;
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`[validate-city-plan] cannot read ${file}: ${error.message}`);
    process.exit(2);
  }
  const { ok, failures } = validatePlan(plan);
  const count = plan.districts?.length ?? 0;
  const sockets = (plan.districts ?? []).reduce((n, d) => n + (d.sockets?.length ?? 0), 0);
  console.log(`city plan: ${count} districts, ${sockets} sockets, ${(plan.vista_cameras ?? []).length} vistas — ${file}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  if (ok) console.log('PASS — plan is well-formed: envelopes disjoint, sockets paired, no cycles, no placeholder prose');
  process.exit(ok ? 0 : 1);
}
