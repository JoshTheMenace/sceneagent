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
 *   - vista cameras have positions, targets and non-placeholder subjects;
 *   - `surrounds.owner` names a real district — the negative space inside
 *     the footprint but outside every envelope has to belong to somebody;
 *   - `boundary_features[]` name a real, distinct owner and mate, and the
 *     declared line actually lies on the boundary those two share, with no
 *     two features overlapping on the same line;
 *   - `city.compass.north_xz` is a non-zero 2-vector and `city.sun` is a
 *     compass point (or degrees) at a plausible elevation — the light rig
 *     is derived from these (src/core/sunrig.js), never hand-placed;
 *   - `terrain`: REQUIRED, owned by the coordinator and never by a
 *     district, with a level for EVERY district and exactly one crossing
 *     per socket pair.  Ground left to districts is the defect this whole
 *     stage exists to remove, so a plan with no terrain block is not a
 *     valid plan;
 *   - `sight_corridors[]`: endpoints, width, clear height, and the real
 *     districts each one crosses — every one of which gets the `why`
 *     verbatim in its brief, because a cross-district requirement written
 *     into one agent's brief is a requirement that agent cannot honour;
 *   - `landmarks_citywide[]`: the object plus at least one reader (a vista
 *     or a district).  Before check-city could raycast these, the field
 *     had no reader at all and was decoration;
 *   - `interactions[]`: at least one per district, inside its envelope.
 *     The first city built this way shipped ZERO interactables and the
 *     runtime's whole KeyE system was dead code, because no brief asked;
 *   - `massing[]`: optional rough blocks a coordinator sketches so an
 *     isolated district agent (`composeCity({ only })`) composes its edges
 *     against something.  Warned when absent, because it is only
 *     detectably missing at the moment somebody builds alone.
 *
 *   node scripts/validate-city-plan.mjs [path/to/city-plan.json]
 *     exit 0 valid · 1 invalid · 2 unreadable/crashed
 *
 * Returns { ok, failures, warnings }.  Only `failures` change exit status.
 */

import fs from 'node:fs';

// The template's unedited prompt text ("Replace with…", "Describe…",
// "Name the…", plus the waypoint stub "Name a place…").
const PLACEHOLDER = /^\s*(replace|describe|name (the|a))\b/i;
const EPS = 0.05;       // geometric tolerance for "on the boundary"
const AGREE_EPS = 0.01; // numeric agreement between paired sockets
const AT_EPS = 0.75;    // the two ends of a pair describe ONE crossing

// Mirrors BEARINGS in src/core/sunrig.js, which is the consumer.  Inlined
// rather than imported on purpose: this gate runs at PLAN time, before a
// line of the city's source exists, and must not depend on src/.
const BEARINGS = new Set(['n', 'north', 'ne', 'northeast', 'e', 'east', 'se', 'southeast',
  's', 'south', 'sw', 'southwest', 'w', 'west', 'nw', 'northwest']);
const SUN_EL_MIN = 5;   // below this the shadows run off the footprint entirely
const SUN_EL_MAX = 80;  // above it there is no rake left to art-direct to

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);

const CROSSING_KINDS = new Set(['ramp', 'road', 'path', 'stairs']);
const SURROUNDS_KINDS = new Set(['water', 'moor', 'flat', 'sand', 'scrub']);

export function validatePlan(plan) {
  const failures = [];
  const warnings = [];
  const fail = (msg) => failures.push(msg);
  const warn = (msg) => warnings.push(msg);

  if (!plan || typeof plan !== 'object') return { ok: false, failures: ['plan is not an object'], warnings };

  /* ---- city block ---- */
  const city = plan.city;
  if (!city || typeof city !== 'object') fail('city: missing');
  else {
    if (!isStr(city.name)) fail('city.name: missing');
    else if (PLACEHOLDER.test(city.name)) fail(`city.name is template placeholder text: "${city.name}"`);
    if (!isStr(city.promise)) fail('city.promise: missing');
    else if (PLACEHOLDER.test(city.promise)) fail(`city.promise is template placeholder text: "${city.promise}"`);
    if (!isVec(city.footprint_m, 2)) fail('city.footprint_m: must be [width, depth] numbers');

    /* compass + sun: the light rig is DERIVED from these (src/core/sunrig.js).
     * A palette note promising "low sun from the south-east" against a rig
     * aimed south-west is a bug that belongs to nobody — every district art
     * directs to the light it can see and the contradiction never surfaces. */
    const compass = city.compass;
    if (!compass || typeof compass !== 'object') {
      fail('city.compass: missing — every compass word in this plan ("the east faces", "the north quay") ' +
        'is meaningless without north_xz, and the sun rig is derived from it');
    } else if (!isVec(compass.north_xz, 2)) {
      fail(`city.compass.north_xz: must be a 2-vector [x, z], got ${JSON.stringify(compass.north_xz)}`);
    } else if (Math.hypot(compass.north_xz[0], compass.north_xz[1]) < 1e-6) {
      fail(`city.compass.north_xz is ${JSON.stringify(compass.north_xz)} — zero length has no direction, ` +
        'so sunPosition() cannot resolve a bearing and every compass word in the plan is unanchored');
    }
    const sun = city.sun;
    if (!sun || typeof sun !== 'object') {
      fail('city.sun: missing — the directional light is derived from { bearing, elevation_deg }, never hand-placed');
    } else {
      if (isNum(sun.bearing)) {
        if (sun.bearing < -360 || sun.bearing > 360) fail(`city.sun.bearing: ${sun.bearing} is not a bearing in degrees (-360..360)`);
      } else if (!isStr(sun.bearing)) {
        fail('city.sun.bearing: missing — name a compass point (north … north-west) or give degrees clockwise from north');
      } else if (!BEARINGS.has(sun.bearing.toLowerCase().replace(/[^a-z]/g, ''))) {
        fail(`city.sun.bearing "${sun.bearing}" is not one of the eight compass points ` +
          '(north, north-east, east, south-east, south, south-west, west, north-west) nor a number of degrees');
      }
      if (!isNum(sun.elevation_deg)) fail('city.sun.elevation_deg: missing — the rake is the whole light design');
      else if (sun.elevation_deg < SUN_EL_MIN || sun.elevation_deg > SUN_EL_MAX) {
        fail(`city.sun.elevation_deg ${sun.elevation_deg} is outside ${SUN_EL_MIN}..${SUN_EL_MAX} — ` +
          'below that the shadows leave the footprint altogether, above it there is no rake to art-direct to');
      }
    }
  }

  /* ---- districts ---- */
  if (!Array.isArray(plan.districts) || plan.districts.length === 0) {
    fail('districts: missing or empty');
    return { ok: false, failures, warnings };
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

    /* interactions — every district contributes at least one.  The first
     * city built this way shipped ZERO interactables and the runtime's
     * whole KeyE system was dead code in a finished town, because no brief
     * asked for any.  check-city then fails a district that declares one
     * here and registers none, which is the other half of the contract. */
    if (!Array.isArray(d.interactions) || d.interactions.length === 0) {
      fail(`${where}: needs at least one entry in interactions[] — "what is the one thing a player can do here". ` +
        'A district with none contributes nothing to the runtime interaction system, and a city of them leaves it dead code.');
    } else {
      for (const it of d.interactions) {
        const iw = `${where} interaction "${it?.name ?? '?'}"`;
        if (!isStr(it?.name)) { fail(`${iw}: name missing`); continue; }
        if (PLACEHOLDER.test(it.name)) { fail(`${iw}: name is template placeholder text: "${it.name}"`); continue; }
        if (!isVec(it.at, 2)) { fail(`${iw}: at must be [x, z]`); continue; }
        if (e && isNum(e.x0) && (it.at[0] < e.x0 - EPS || it.at[0] > e.x1 + EPS || it.at[1] < e.z0 - EPS || it.at[1] > e.z1 + EPS)) {
          fail(`${iw}: at ${JSON.stringify(it.at)} is outside "${d.id}"'s envelope — an interaction belongs to the district that owns the ground under it`);
        }
      }
    }

    /* massing — the neighbour stubs an isolated district agent composes
     * against.  Absent, `composeCity({ only })` renders this district as
     * empty space for whoever is building next door. */
    if (d.massing !== undefined && !Array.isArray(d.massing)) {
      fail(`${where}: massing must be an array of { x, z, w, d, h } blocks`);
    } else if (Array.isArray(d.massing)) {
      for (const m of d.massing) {
        const mw = `${where} massing block`;
        if (!isNum(m?.x) || !isNum(m?.z) || !isNum(m?.w) || !isNum(m?.d) || !isNum(m?.h)) {
          fail(`${mw}: must be { x, z, w, d, h } numbers, got ${JSON.stringify(m)}`); continue;
        }
        if (m.w <= 0 || m.d <= 0 || m.h <= 0) { fail(`${mw} at (${m.x}, ${m.z}): w, d and h must be positive`); continue; }
        if (e && isNum(e.x0) && (m.x < e.x0 - 2 || m.x > e.x1 + 2 || m.z < e.z0 - 2 || m.z > e.z1 + 2)) {
          fail(`${mw} centred (${m.x}, ${m.z}) is outside "${d.id}"'s envelope — a stub in the wrong place ` +
            'is worse than none: the neighbour composes against a mass that will never be there');
        }
      }
    } else if (plan.districts.length > 1) {
      warn(`district "${d.id}": no massing[] — an agent building any OTHER district alone ` +
        '(composeCity({ only })) will compose its edges against empty space where this one stands. ' +
        'Rough it out: massing: [{ x, z, w, d, h }, …].');
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

  /* ---- surrounds: somebody owns the negative space ---- */
  const surrounds = plan.surrounds;
  if (!surrounds || typeof surrounds !== 'object' || !isStr(surrounds.owner)) {
    fail('surrounds: missing — everything inside city.footprint_m but outside every envelope (sea, moor, ' +
      'backdrop, sky edge) belongs to no district, and unowned negative space renders as a hard edge: ' +
      'the district nearest it builds to the limit of its 2 m envelope tolerance trying to hide the cut. ' +
      'Add { "owner": "<district-id>" } naming the district that builds it.');
  } else if (PLACEHOLDER.test(surrounds.owner)) {
    fail(`surrounds.owner is template placeholder text: "${surrounds.owner}"`);
  } else if (!ids.has(surrounds.owner)) {
    fail(`surrounds.owner "${surrounds.owner}" is not a district in this plan — have: ${[...ids].join(', ')}`);
  }

  /* ---- boundary features: exactly one owner, on a real shared edge ----
   * `along` is the axis the feature RUNS ALONG (not a socket's crossing
   * axis): along 'z' is a line at x = at spanning z from..to; along 'x' is
   * a line at z = at spanning x from..to. */
  const featureIds = new Set();
  const features = [];
  if (plan.boundary_features !== undefined && !Array.isArray(plan.boundary_features)) {
    fail('boundary_features: must be an array (omit it entirely if this city has none)');
  }
  for (const f of Array.isArray(plan.boundary_features) ? plan.boundary_features : []) {
    const fw = `boundary feature "${f?.id ?? '?'}"`;
    if (!isStr(f?.id)) { fail(`${fw}: id missing`); continue; }
    if (featureIds.has(f.id)) fail(`${fw}: duplicate id`);
    featureIds.add(f.id);
    if (!isStr(f.kind)) fail(`${fw}: kind missing — say what it is (retaining-wall, kerb, railing, revetment)`);
    let shapeOk = true;
    if (!isStr(f.owner) || !ids.has(f.owner)) { fail(`${fw}: owner "${f.owner}" is not a district in this plan — exactly one district builds a boundary feature`); shapeOk = false; }
    if (!isStr(f.mate) || !ids.has(f.mate)) { fail(`${fw}: mate "${f.mate}" is not a district in this plan — the mate is the district that must NOT build here`); shapeOk = false; }
    if (isStr(f.owner) && f.owner === f.mate) { fail(`${fw}: owner and mate are both "${f.owner}" — a boundary is between two districts`); shapeOk = false; }
    if (f.along !== 'x' && f.along !== 'z') { fail(`${fw}: along must be 'x' or 'z' (the axis the feature runs along)`); shapeOk = false; }
    if (!isNum(f.at)) { fail(`${fw}: at (the constant coordinate of the line) must be a number`); shapeOk = false; }
    if (!isNum(f.from) || !isNum(f.to) || f.from >= f.to) { fail(`${fw}: from/to must be numbers with from < to`); shapeOk = false; }
    if (!shapeOk) continue;

    const a = plan.districts.find((d) => d.id === f.owner)?.envelope;
    const b = plan.districts.find((d) => d.id === f.mate)?.envelope;
    if (!a || !b || !isNum(a.x0) || !isNum(b.x0)) continue; // envelope already failed above

    // the line's constant axis: along 'z' => a shared x-edge, along 'x' => a shared z-edge
    const [aLo, aHi, bLo, bHi] = f.along === 'z' ? [a.x0, a.x1, b.x0, b.x1] : [a.z0, a.z1, b.z0, b.z1];
    const axis = f.along === 'z' ? 'x' : 'z';
    const edge = Math.abs(aHi - bLo) <= EPS ? aHi : Math.abs(aLo - bHi) <= EPS ? aLo : null;
    if (edge === null) {
      fail(`${fw}: "${f.owner}" and "${f.mate}" share no ${axis}-edge — their envelopes are ` +
        `${axis} ${aLo}..${aHi} and ${axis} ${bLo}..${bHi}, so there is no boundary here to build a ${f.kind} on`);
      continue;
    }
    if (Math.abs(f.at - edge) > EPS) {
      fail(`${fw}: at ${axis} = ${f.at} is not on the boundary "${f.owner}"/"${f.mate}" share, which is ${axis} = ${edge} ` +
        `— a feature off the shared line is inside one district and is not a boundary feature at all`);
      continue;
    }
    // and the run has to lie within the stretch the two actually share
    const [pLo, pHi] = f.along === 'z'
      ? [Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)]
      : [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)];
    if (pHi - pLo <= EPS) {
      fail(`${fw}: "${f.owner}" and "${f.mate}" touch at ${axis} = ${edge} but overlap over no length of ${f.along} — they meet at a corner, not along an edge`);
      continue;
    }
    if (f.from < pLo - EPS || f.to > pHi + EPS) {
      fail(`${fw}: runs ${f.along} ${f.from}..${f.to} but "${f.owner}" and "${f.mate}" only share ` +
        `${f.along} ${pLo}..${pHi} — the overhang is on a boundary with somebody else, or with nobody`);
      continue;
    }
    features.push(f);
  }
  // two features on the same line overlapping is the double-wall the whole
  // declaration exists to prevent
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      const p = features[i];
      const q = features[j];
      if (p.along !== q.along || Math.abs(p.at - q.at) > EPS) continue;
      const lo = Math.max(p.from, q.from);
      const hi = Math.min(p.to, q.to);
      if (hi - lo > EPS) {
        fail(`boundary features "${p.id}" (${p.owner}) and "${q.id}" (${q.owner}) both stand on ` +
          `${p.along === 'z' ? 'x' : 'z'} = ${p.at} over ${p.along} ${lo}..${hi} — exactly one district builds a boundary feature; two is a double wall`);
      }
    }
  }

  /* ---- terrain: stage 2, and it is not optional ----------------------
   * "Ground is a per-district responsibility. Disjoint envelopes, each
   * district platforming its own rectangle, nothing owning what lies
   * between or beyond." — the independent review of the first city built
   * this way, naming its single highest-impact defect.  A plan with no
   * terrain block hands every district that decision back. */
  const terrain = plan.terrain;
  if (!terrain || typeof terrain !== 'object') {
    fail('terrain: missing — ONE continuous ground surface over the whole footprint INCLUDING the surrounds is ' +
      'built before any district and never by a district. Without it each district platforms its own rectangle, ' +
      'nothing owns what lies between or beyond them, and the result is floating slabs in every overhead frame, ' +
      'severed ground at the outer edges and voids behind boundary walls — none of which a district agent can fix ' +
      'from inside its parcel. Add { "terrain": { "owner": "coordinator", "levels": [{ "id", "y" }…], "crossings": [{ "socket", "kind" }…] } }.');
  } else {
    if (isStr(terrain.owner) && ids.has(terrain.owner)) {
      fail(`terrain.owner is "${terrain.owner}", which is a district. The terrain is the coordinator's: a district ` +
        'that owns the ground builds it to its own envelope and stops, which is the defect terrain-first removes.');
    } else if (!isStr(terrain.owner)) {
      fail('terrain.owner: missing — say "coordinator"');
    }

    /* levels: every district, exactly once.  A district with no level has
     * undefined ground and will lay its own. */
    if (!Array.isArray(terrain.levels) || terrain.levels.length === 0) {
      fail('terrain.levels: missing — each district id gets a flat level y over its envelope');
    } else {
      const seenLevel = new Set();
      for (const L of terrain.levels) {
        if (!isStr(L?.id) || !isNum(L?.y)) { fail(`terrain.levels entry must be { id, y }: ${JSON.stringify(L)}`); continue; }
        if (!ids.has(L.id)) { fail(`terrain.levels names "${L.id}", which is not a district in this plan`); continue; }
        if (seenLevel.has(L.id)) fail(`terrain.levels has two entries for "${L.id}" — a district has one level`);
        seenLevel.add(L.id);
      }
      for (const id of ids) {
        if (!seenLevel.has(id)) {
          fail(`terrain.levels has no entry for district "${id}", so its ground is undefined and it will lay its own`);
        }
      }
      /* an anchor is a promise about GROUND, and the terrain is what
       * answers it: catch the contradiction on paper rather than as a
       * throw halfway through a build */
      for (const d of plan.districts) {
        const L = terrain.levels.find?.((x) => x?.id === d.id);
        if (!L || !isNum(L.y)) continue;
        const socketY = new Set((d.sockets ?? []).filter((s) => isNum(s.y)).map((s) => s.y));
        for (const a of Array.isArray(d.anchors) ? d.anchors : []) {
          if (!isNum(a?.expect_top)) continue;
          const tol = isNum(a.tol) ? a.tol : 0.05;
          if (Math.abs(a.expect_top - L.y) <= tol) continue;
          if ([...socketY].some((y) => Math.abs(a.expect_top - y) <= Math.max(tol, 0.3))) continue;
          warn(`district "${d.id}" anchor (${a.x}, ${a.z}) expects ${a.expect_top} but terrain.levels puts "${d.id}" ` +
            `at ${L.y} and no socket here promises that height either — the terrain answers anchors now, so this ` +
            'one will fail at composition unless a crossing or the district\'s own dressing reaches it.');
        }
      }
    }

    /* crossings: exactly one per socket PAIR.  Two entries for one pair is
     * the double-wall mistake in another costume; zero leaves the two
     * levels meeting at a cliff with no way across. */
    if (terrain.crossings !== undefined && !Array.isArray(terrain.crossings)) {
      fail('terrain.crossings: must be an array (omit it entirely if this city has no sockets)');
    } else {
      const byPair = new Map();
      for (const c of Array.isArray(terrain.crossings) ? terrain.crossings : []) {
        const cw = `terrain.crossing "${c?.socket ?? '?'}"`;
        if (!isStr(c?.socket)) { fail(`${cw}: socket missing`); continue; }
        const ref = socketIndex.get(c.socket);
        if (!ref) { fail(`${cw}: names a socket that is not in this plan`); continue; }
        if (!isStr(c.kind) || !CROSSING_KINDS.has(c.kind)) {
          fail(`${cw}: kind must be one of ${[...CROSSING_KINDS].join(', ')}, got ${JSON.stringify(c.kind)}`);
        }
        if (c.grade !== undefined && (!isNum(c.grade) || c.grade <= 0 || c.grade > 0.5)) {
          fail(`${cw}: grade must be a number in (0, 0.5] — 1/8 is the default and 1/6 is the steepest a vehicle takes`);
        }
        if (c.going !== undefined && (!isNum(c.going) || c.going < 0.36)) {
          fail(`${cw}: going ${c.going} is under 0.36 m. The route gate strides 0.35 m, so one stride crosses two ` +
            'treads and measures twice the rise — a perfectly good flight is then reported unclimbable.');
        }
        if (c.rise !== undefined && (!isNum(c.rise) || c.rise <= 0 || c.rise > 0.35)) {
          fail(`${cw}: rise must be a number in (0, 0.35]`);
        }
        const key = [c.socket, ref.socket.mate].sort().join('|');
        if (byPair.has(key)) {
          fail(`${cw}: the pair ${key.replace('|', ' <> ')} already has a crossing ("${byPair.get(key)}") — ` +
            'the terrain builds BOTH halves of one crossing, so declaring it from each end builds it twice');
        }
        byPair.set(key, c.socket);
      }
      for (const [id, { socket: s }] of socketIndex) {
        if (!isStr(s.mate)) continue;
        const key = [id, s.mate].sort().join('|');
        if (!byPair.has(key)) {
          fail(`socket "${id}" <> "${s.mate}" has no entry in terrain.crossings — the ground either side of a ` +
            'socket is at two different levels and nothing joins them. Add { "socket": "' + id + '", "kind": "…" }.');
        }
      }
    }

    if (terrain.surrounds !== undefined) {
      const s = terrain.surrounds;
      if (typeof s !== 'object' || s === null) fail('terrain.surrounds: must be an object { kind, y?, water_y?, blend_m? }');
      else {
        if (s.kind !== undefined && (!isStr(s.kind) || !SURROUNDS_KINDS.has(s.kind))) {
          fail(`terrain.surrounds.kind must be one of ${[...SURROUNDS_KINDS].join(', ')}, got ${JSON.stringify(s.kind)}`);
        }
        for (const k of ['y', 'water_y', 'blend_m', 'roughness_m']) {
          if (s[k] !== undefined && !isNum(s[k])) fail(`terrain.surrounds.${k} must be a number`);
        }
      }
    }
    if (terrain.cell_m !== undefined && (!isNum(terrain.cell_m) || terrain.cell_m < 0.5 || terrain.cell_m > 8)) {
      fail('terrain.cell_m must be a number in 0.5..8 — the target lattice size on open ground');
    }
  }

  /* ---- sight corridors ----------------------------------------------
   * A cross-district requirement written into ONE district's brief is a
   * requirement that agent cannot honour: the first city told the headland
   * that its lighthouse "must read from the row", which is a fact about
   * the row's massing. */
  if (plan.sight_corridors !== undefined && !Array.isArray(plan.sight_corridors)) {
    fail('sight_corridors: must be an array (omit it entirely if this city has none)');
  }
  const corridorIds = new Set();
  for (const c of Array.isArray(plan.sight_corridors) ? plan.sight_corridors : []) {
    const cw = `sight corridor "${c?.id ?? '?'}"`;
    if (!isStr(c?.id) || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) { fail(`${cw}: id must be kebab-case`); continue; }
    if (corridorIds.has(c.id)) fail(`${cw}: duplicate id`);
    corridorIds.add(c.id);
    if (!isVec(c.from, 2)) fail(`${cw}: from must be [x, z]`);
    if (!isVec(c.to, 2)) fail(`${cw}: to must be [x, z]`);
    if (isVec(c.from, 2) && isVec(c.to, 2) && Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) < 1) {
      fail(`${cw}: from and to are the same point — a corridor is a line of sight between two places`);
    }
    if (!isNum(c.half_width) || c.half_width <= 0) fail(`${cw}: half_width must be a positive number`);
    if (!isNum(c.min_clear_h) || c.min_clear_h <= 0) fail(`${cw}: min_clear_h must be a positive number (the world y the corridor is kept clear at)`);
    if (!Array.isArray(c.districts) || c.districts.length === 0) {
      fail(`${cw}: districts[] must name every district this corridor crosses — each one gets the \`why\` verbatim in its brief`);
    } else {
      for (const id of c.districts) if (!ids.has(id)) fail(`${cw}: districts names "${id}", which is not a district in this plan`);
      if (c.districts.length === 1) {
        warn(`${cw} crosses only "${c.districts[0]}" — a corridor inside one district is that district's own composition, not a contract`);
      }
    }
    if (!isStr(c.why)) fail(`${cw}: why missing — say what this corridor exists to let the player see`);
    else if (PLACEHOLDER.test(c.why) || /^\s*say what\b/i.test(c.why)) fail(`${cw}: why is template placeholder text: "${c.why.slice(0, 60)}…"`);
  }

  /* ---- landmark contracts -------------------------------------------
   * check-city raycasts these now.  An entry with no reader is exactly
   * what the field was before: decoration. */
  const vistaNames = new Set((plan.vista_cameras ?? []).map((v) => v?.name).filter(isStr));
  for (const d of plan.districts) {
    if (d.landmarks_citywide === undefined) continue;
    if (!Array.isArray(d.landmarks_citywide)) { fail(`district "${d.id}": landmarks_citywide must be an array`); continue; }
    for (const l of d.landmarks_citywide) {
      const lw = `district "${d.id}" landmark`;
      if (typeof l === 'string') {
        fail(`${lw} "${l}" is a bare string. A landmark names the vistas and districts it must READ FROM: ` +
          '{ "object": "…", "must_read_from_vistas": [], "must_read_from_districts": [] }. Written as a string ' +
          'nothing can check it, which is how the field came to be decoration.');
        continue;
      }
      if (!l || typeof l !== 'object' || !isStr(l.object)) { fail(`${lw}: object missing — name the Object3D check-city should raycast to`); continue; }
      const vistas = l.must_read_from_vistas ?? [];
      const from = l.must_read_from_districts ?? [];
      if (!Array.isArray(vistas) || !Array.isArray(from)) { fail(`${lw} "${l.object}": must_read_from_vistas and must_read_from_districts must be arrays`); continue; }
      if (vistas.length === 0 && from.length === 0) {
        fail(`${lw} "${l.object}": names no vista and no district to read from, so nothing checks it. ` +
          'A landmark contract with no reader is decoration.');
      }
      for (const v of vistas) if (!vistaNames.has(v)) fail(`${lw} "${l.object}": must_read_from_vistas names "${v}", which is not a vista camera in this plan`);
      for (const id of from) {
        if (!ids.has(id)) fail(`${lw} "${l.object}": must_read_from_districts names "${id}", which is not a district in this plan`);
        else if (id === d.id) warn(`${lw} "${l.object}" must read from its own district "${d.id}" — that is composition, not a city contract`);
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
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
  const { ok, failures, warnings } = validatePlan(plan);
  const count = plan.districts?.length ?? 0;
  const sockets = (plan.districts ?? []).reduce((n, d) => n + (d.sockets?.length ?? 0), 0);
  const features = (plan.boundary_features ?? []).length;
  console.log(`city plan: ${count} districts, ${sockets} sockets, ${features} boundary features, ` +
    `${(plan.terrain?.levels ?? []).length} terrain levels, ${(plan.terrain?.crossings ?? []).length} crossings, ` +
    `${(plan.sight_corridors ?? []).length} sight corridors, ` +
    `${(plan.vista_cameras ?? []).length} vistas, surrounds owned by "${plan.surrounds?.owner ?? '—'}" — ${file}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  for (const w of warnings ?? []) console.log(`WARN ${w}`);
  if (ok) console.log('PASS — plan is well-formed: envelopes disjoint, sockets paired, terrain levels every district and ' +
    'crosses every socket, boundary features on real shared edges and singly owned, surrounds owned, sight corridors and ' +
    'landmark contracts readable, every district interacts, compass and sun resolvable, no cycles, no placeholder prose');
  process.exit(ok ? 0 : 1);
}
