/* ------------------------------------------------------------------ *
 * Seam checks: are the socket contracts actually honored?
 *
 * A socket (see references/city-scale.md) is a point on a shared district
 * boundary where a route crosses: an axis, a clear width, a ground
 * elevation, declared in PAIRS.  The plan validator proves the pairing on
 * paper; this file proves it in the built world.  Two measured tests per
 * socket pair:
 *
 *   GROUND CONTINUITY — point pairs straddling the boundary line
 *     (±STRADDLE_M along the crossing axis) sampled across the socket's
 *     full width at 0.5 m steps.  |Δ ground| across any pair must stay
 *     under the walker's step height (0.38), and each side must sit
 *     within socket.y ± Y_TOL_M — a stairs socket whose flight tops out
 *     0.6 m low passes a screenshot and fails here with the number.
 *
 *   CORRIDOR CLEARANCE — the corridor (socket width across the boundary
 *     tangent × CORRIDOR_DEPTH_M into each side) must keep a clear
 *     passage.  Every collider is inflated by the walker's RADIUS on all
 *     sides (a 1.4 m board in a 2.1 m alley leaves 0.02 m — the flagship
 *     learned this three separate times), the corridor is sliced along
 *     its depth, and the clear passage is the MINIMUM over slices of the
 *     widest contiguous gap.  It fails when that drops below
 *     width − 1 m.
 *
 * Failure messages carry owners, positions and exact numbers — the same
 * discipline as core/spatialcheck.js.  Pure math, no WebGL: runs in-page
 * and headless (scripts/check-city.mjs).
 * ------------------------------------------------------------------ */

const RADIUS = 0.34;        // src/player.js
const STEP_M = 0.38;        // tallest rise the walker climbs
const STRADDLE_M = 0.25;    // sample distance each side of the boundary line
const WIDTH_STEP_M = 0.5;   // sample spacing across the socket width
const Y_TOL_M = 0.25;       // each side must sit within socket.y ± this
const CORRIDOR_DEPTH_M = 3; // corridor reach into each district
const SLICE_M = 0.25;       // corridor depth slice spacing

const r2 = (v) => Math.round(v * 100) / 100;

/** Largest contiguous clear interval of [t0, t1] minus `blocked` intervals. */
function maxClearGap(t0, t1, blocked) {
  const spans = blocked
    .map(([a, b]) => [Math.max(a, t0), Math.min(b, t1)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let cursor = t0;
  let best = 0;
  let bestAt = t0;
  for (const [a, b] of spans) {
    if (a - cursor > best) { best = a - cursor; bestAt = cursor; }
    cursor = Math.max(cursor, b);
  }
  if (t1 - cursor > best) { best = t1 - cursor; bestAt = cursor; }
  return { gap: best, at: bestAt };
}

/**
 * Check every socket pair in the plan against the built world.
 *
 * @param {object} args
 * @param {object} args.plan  parsed city-plan.json
 * @param {object} args.ctx   anything with { groundAt(x, z), colliders } —
 *                            the composeCity ctx, or the scene's exports
 * @param {object} [args.scene] accepted for future mesh-level checks; the
 *                            current tests are query-based and do not need it
 * @returns {{ ok, results, report }}
 */
export function checkSeams({ plan, ctx, scene = null }) { // eslint-disable-line no-unused-vars
  const { groundAt, colliders } = ctx;
  const index = new Map(); // socket id -> { socket, district }
  for (const district of plan.districts) {
    for (const socket of district.sockets ?? []) index.set(socket.id, { socket, district });
  }

  const results = [];
  const seen = new Set();
  for (const district of plan.districts) {
    for (const socket of district.sockets ?? []) {
      const pairKey = [socket.id, socket.mate].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const mateRef = index.get(socket.mate);
      const owners = `${district.id} <-> ${mateRef ? mateRef.district.id : '??'}`;
      const failures = [];
      if (!mateRef) {
        results.push({
          socket: socket.id, mate: socket.mate, owners, kind: socket.kind, at: socket.at, ok: false,
          failures: [`mate socket "${socket.mate}" does not exist in the plan (run validate-city-plan)`],
        });
        continue;
      }

      const alongX = socket.axis === 'x'; // route crosses along x => boundary is an x = const line
      const [ax, az] = socket.at;
      const bLine = alongX ? ax : az;    // boundary coordinate on the crossing axis
      const center = alongX ? az : ax;   // socket center on the tangent axis
      const w2 = socket.width / 2;

      /* ground continuity across the boundary line */
      let worstDelta = null;
      let worstLevel = null;
      for (let t = -w2 + WIDTH_STEP_M / 2; t < w2; t += WIDTH_STEP_M) {
        const tan = center + t;
        const pA = alongX ? [bLine - STRADDLE_M, tan] : [tan, bLine - STRADDLE_M];
        const pB = alongX ? [bLine + STRADDLE_M, tan] : [tan, bLine + STRADDLE_M];
        const gA = groundAt(pA[0], pA[1]);
        const gB = groundAt(pB[0], pB[1]);
        const delta = Math.abs(gA - gB);
        if (delta >= STEP_M && (!worstDelta || delta > worstDelta.delta)) worstDelta = { delta, pA, pB, gA, gB };
        for (const [p, g] of [[pA, gA], [pB, gB]]) {
          const off = Math.abs(g - socket.y);
          if (off > Y_TOL_M && (!worstLevel || off > worstLevel.off)) worstLevel = { off, p, g };
        }
      }
      if (worstDelta) {
        failures.push(
          `GROUND DISCONTINUITY: ground jumps ${r2(worstDelta.delta)} m across the boundary ` +
          `(limit ${STEP_M}) — ${r2(worstDelta.gA)} at (${r2(worstDelta.pA[0])}, ${r2(worstDelta.pA[1])}) vs ` +
          `${r2(worstDelta.gB)} at (${r2(worstDelta.pB[0])}, ${r2(worstDelta.pB[1])})`);
      }
      if (worstLevel) {
        failures.push(
          `GROUND OFF CONTRACT: socket promises y = ${socket.y} ±${Y_TOL_M} at the line, but ground is ` +
          `${r2(worstLevel.g)} at (${r2(worstLevel.p[0])}, ${r2(worstLevel.p[1])}) — off by ${r2(worstLevel.off)} m`);
      }

      /* corridor clearance: min over depth slices of the widest clear gap */
      const t0 = center - w2;
      const t1 = center + w2;
      const d0 = bLine - CORRIDOR_DEPTH_M;
      const d1 = bLine + CORRIDOR_DEPTH_M;
      let minClear = null;
      const blockers = new Set();
      for (let d = d0 + SLICE_M / 2; d < d1; d += SLICE_M) {
        const blocked = [];
        for (const c of colliders) {
          const cd0 = (alongX ? c.x0 : c.z0) - RADIUS;
          const cd1 = (alongX ? c.x1 : c.z1) + RADIUS;
          if (d <= cd0 || d >= cd1) continue; // collider does not reach this slice
          const ct0 = (alongX ? c.z0 : c.x0) - RADIUS;
          const ct1 = (alongX ? c.z1 : c.x1) + RADIUS;
          if (ct1 <= t0 || ct0 >= t1) continue;
          blocked.push([ct0, ct1, c]);
        }
        const { gap } = maxClearGap(t0, t1, blocked.map(([a, b]) => [a, b]));
        if (!minClear || gap < minClear.gap) {
          minClear = { gap, d };
          if (gap < socket.width - 1) {
            for (const [, , c] of blocked) {
              blockers.add(`${c.owner ?? 'unowned'} collider x ${r2(c.x0)}..${r2(c.x1)}, z ${r2(c.z0)}..${r2(c.z1)}`);
            }
          }
        }
      }
      if (minClear && minClear.gap < socket.width - 1) {
        const sliceAt = alongX ? `x = ${r2(minClear.d)}` : `z = ${r2(minClear.d)}`;
        failures.push(
          `CORRIDOR BLOCKED: clear passage narrows to ${r2(minClear.gap)} m at ${sliceAt} ` +
          `(socket width ${socket.width}, limit ${r2(socket.width - 1)}, walker radius ${RADIUS} applied) — ` +
          `blocking: ${[...blockers].join('; ') || 'colliders at the corridor edges'}`);
      }

      results.push({
        socket: socket.id, mate: socket.mate, owners, kind: socket.kind, at: socket.at,
        ok: failures.length === 0, failures,
      });
    }
  }

  const lines = [`seam check: ${results.length} socket pair${results.length === 1 ? '' : 's'}`];
  for (const r of results) {
    lines.push(`${r.ok ? 'PASS' : 'FAIL'} ${r.socket} <> ${r.mate} [${r.kind}] at (${r.at.join(', ')}) — ${r.owners}`);
    for (const f of r.failures) lines.push(`  - ${f}`);
  }
  const ok = results.every((r) => r.ok);
  if (ok) lines.push('PASS — ground continuous and corridors clear at every socket');
  return { ok, results, report: lines.join('\n') };
}
