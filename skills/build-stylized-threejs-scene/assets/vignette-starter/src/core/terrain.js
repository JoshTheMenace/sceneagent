import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * TERRAIN — one continuous ground surface over the whole city.
 *
 * This is stage 2 of the city pipeline (references/city-scale.md) and it
 * runs BEFORE the kit and before any district.  It exists because of one
 * measured finding, quoted from the independent review of the first city
 * built by decomposition:
 *
 *   "Ground is a per-district responsibility. Disjoint envelopes, each
 *    district platforming its own rectangle, nothing owning what lies
 *    between or beyond. That one decision produces the floating slabs in
 *    all four overhead frames, the headland's severed ground, net-lofts'
 *    void behind its wall, both blank-plane seam descents, and the row's
 *    missing harbour."
 *
 * The decisive part of that finding is the last sentence of the review's
 * note on it: **no district agent could have fixed it from inside its
 * parcel.**  A district can only build to its own envelope, so ground
 * left to districts is ground that stops at every boundary — and the gap
 * between two envelopes, and everything beyond the outermost one, is
 * owned by nobody and therefore built by nobody.  The fix is not a rule
 * telling districts to be careful.  It is taking the ground away from
 * them: districts DRESS this surface (pads, kerbs, steps, revetments,
 * paving laid ON it) and never platform their own rectangle.
 *
 * WHAT IS BUILT HERE, and why each piece is here
 * ----------------------------------------------
 *   levels      each district id gets a flat height over its envelope, so
 *               a district's anchors are answered by construction rather
 *               than by the district remembering to lay a slab;
 *   crossings   the terrain builds BOTH HALVES of every socket crossing —
 *               the ramp or the flight and the landings at each end.  A
 *               seam made by one builder cannot disagree with itself;
 *               two districts each building their own half can, and that
 *               is what a seam bug IS;
 *   surrounds   everything inside city.footprint_m but outside every
 *               envelope, blended continuously out of the nearest levels
 *               and into the surrounds treatment — sea, moor, flat.  This
 *               is the half that no district could ever have built;
 *   apron+skirt a ring past the footprint falling away, and vertical walls
 *               down to a floor, so the world is a CLOSED SOLID.  A town
 *               that ends at a mesh boundary reads as a severed edge from
 *               any camera above eye height.
 *
 * THE TWO TECHNIQUES, both proven on `harbor-town`'s headland district,
 * where they killed seventeen seam defects at once:
 *
 *  (a) A CONFORMING GRID.  Grid lines are placed at the footprint edges,
 *      at every envelope edge, at every crossing rect edge and at every
 *      stair tread edge, and only THEN is each gap subdivided to <= cell.
 *      Nothing straddles a designed edge, so a district promised 1.2 m
 *      gets exactly 1.2 m — not 1.2 rounded off a cell that half-covers
 *      its neighbour.  Quads are split on ALTERNATING diagonals: split
 *      them all the same way and the ground grows a diagonal grain that a
 *      depth-difference ink pass draws as parallel creases.
 *
 *  (b) THE WALKED SURFACE IS THE MINIMUM OF THE FIELD AT A CELL'S FOUR
 *      CORNERS.  Those corners are the drawn mesh's own nodes, and the
 *      mesh interpolates them, so min(corners) <= the drawn surface
 *      everywhere inside the cell — the height query is PROVABLY never
 *      above the ground the eye sees.  Take the cell's centre height
 *      instead and on a 1-in-1.4 face the query stands the player up to
 *      0.8 m in the air, which is exactly the "walkable height X but
 *      first surface at Y" defect the spatial audit reports.
 *
 * A NOTE ON STAIR GOING.  Every flight built here has a going of at least
 * MIN_GOING_M.  This is a hard constraint, not a taste: the route flood
 * fill (and the walker it models) advances 0.35 m per test, so a going of
 * 0.33 puts two treads inside one stride and the rise it measures is
 * twice the real one — over the step limit.  The flight renders perfectly,
 * climbs perfectly by hand, and the gate calls it unclimbable.
 *
 * USAGE
 *   const terrain = buildTerrain({ plan, ctx, materials });
 *   terrain.terrainHeightAt(x, z)   // the walked ground, anywhere
 * `composeCity` calls this for you and routes `ctx.groundAt` through it.
 * ------------------------------------------------------------------ */

/* ---- constants ---------------------------------------------------- */

const CELL_DEFAULT_M = 2.0;   // target lattice size on open ground
const APRON_M = 5.0;          // ring built past the footprint edge
const MIN_GOING_M = 0.36;     // > the route gate's 0.35 m stride
const TREAD_PAD_M = 0.04;     // treads OVERLAP, never merely meet
const SCARP_M = 0.06;         // the cell that draws a level change as a face
const LANDING_M = 0.8;        // flat at the socket line, both sides
const QUANT_M = 0.05;         // walk-height quantum (merges runs of cells)
const RAMP_GRADE = 1 / 8;     // default ramp/road steepness
const STEP_RISE_M = 0.18;     // default stair rise
const MAX_CELL_RISE_M = 0.12; // corridor cells subdivide to at most this fall
const BLEND_DEFAULT_M = 10;   // envelope edge -> full surrounds treatment

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, t) => {
  if (b <= a) return t >= b ? 1 : 0;
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const distOutside = (x, z, r) => Math.hypot(
  Math.max(r.x0 - x, x - r.x1, 0),
  Math.max(r.z0 - z, z - r.z1, 0));

/** Deterministic PRNG — the same city must produce the same ground twice. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quartic-ish elliptical dome: round on top, dies to zero with a tangent. */
function dome(x, z, cx, cz, rx, rz, h) {
  const t = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2;
  return t <= 0 ? 0 : h * t ** 1.55;
}

/** Grid axis: hard cuts first, then every gap subdivided to <= cell. */
function axisLines(lo, hi, cuts, cell) {
  const set = new Set([lo, hi]);
  for (const c of cuts) {
    if (!isNum(c)) continue;
    if (c > lo + 1e-4 && c < hi - 1e-4) set.add(Math.round(c * 10000) / 10000);
  }
  const keys = [...set].sort((a, b) => a - b);
  const out = [keys[0]];
  for (let i = 1; i < keys.length; i += 1) {
    const span = keys[i] - keys[i - 1];
    const n = Math.max(1, Math.ceil(span / cell - 1e-9));
    for (let k = 1; k <= n; k += 1) out.push(keys[i - 1] + (span * k) / n);
  }
  return out;
}

/** Index of the last array entry <= v, clamped to a valid cell index. */
function lastBelow(arr, v) {
  let lo = 0;
  let hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid; else hi = mid;
  }
  return lo;
}

/* ---- default materials -------------------------------------------- *
 * core/ must not import the app's palette, so tones are supplied by the
 * caller.  These fallbacks exist so a headless gate can build the terrain
 * with no materials module loaded at all.
 */
const DEFAULT_TONES = {
  ground: 0x9aa08f,
  paving: 0x8d8f8a,
  bank: 0x7d7a68,
  surrounds: 0x74806b,
  shore: 0xa9a189,
  skirt: 0x53544f,
  water: 0x4a6b78,
};

function toneMaterials(materials) {
  const out = {};
  for (const [key, hex] of Object.entries(DEFAULT_TONES)) {
    out[key] = materials?.[key] ?? new THREE.MeshStandardMaterial({
      color: hex, roughness: 1, metalness: 0, flatShading: true,
    });
  }
  return out;
}

/* ==================================================================== *
 * buildTerrain
 * ==================================================================== */

/**
 * Build the city's single ground surface.
 *
 * @param {object} args
 * @param {object} args.plan       parsed city-plan.json (city, districts, terrain)
 * @param {object} args.ctx        the createBuilder ctx for the whole city
 * @param {object} [args.materials] tone -> THREE.Material:
 *        { ground, paving, bank, surrounds, shore, skirt, water }
 * @returns {{
 *   terrainHeightAt: (x: number, z: number) => number,
 *   group: THREE.Group, footprint: object, levels: object[],
 *   crossings: object[], stats: object
 * }}
 */
export function buildTerrain({ plan, ctx, materials = null }) {
  const spec = plan?.terrain;
  if (!spec || typeof spec !== 'object') {
    throw new Error(
      'buildTerrain: plan.terrain is missing. Ground is the coordinator\'s, not a district\'s — ' +
      'a plan with no terrain block has no continuous surface and every district will platform its own ' +
      'rectangle, which is the floating-slab defect this stage exists to remove. Add ' +
      '{ "terrain": { "owner": "coordinator", "levels": [...], "crossings": [...] } }.');
  }
  const cell = isNum(spec.cell_m) ? Math.max(0.5, spec.cell_m) : CELL_DEFAULT_M;
  const M = toneMaterials(materials);

  /* ---- 1. the footprint: the whole city, not the union of parcels ----
   * city.footprint_m is centred on the envelopes' own centre and then
   * UNIONED with them, so the surface always covers at least every parcel
   * however the coordinator sized the footprint. */
  const env = plan.districts.reduce((a, d) => ({
    x0: Math.min(a.x0, d.envelope.x0), z0: Math.min(a.z0, d.envelope.z0),
    x1: Math.max(a.x1, d.envelope.x1), z1: Math.max(a.z1, d.envelope.z1),
  }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const [fw, fd] = Array.isArray(plan.city?.footprint_m) ? plan.city.footprint_m : [0, 0];
  const mx = (env.x0 + env.x1) / 2;
  const mz = (env.z0 + env.z1) / 2;
  const footprint = {
    x0: Math.min(env.x0, mx - fw / 2), x1: Math.max(env.x1, mx + fw / 2),
    z0: Math.min(env.z0, mz - fd / 2), z1: Math.max(env.z1, mz + fd / 2),
  };

  /* ---- 2. levels: one flat height per district envelope -------------- */
  const levels = [];
  const levelById = new Map();
  for (const L of spec.levels ?? []) {
    const d = plan.districts.find((x) => x.id === L.id);
    if (!d) {
      throw new Error(`buildTerrain: terrain.levels names "${L.id}", which is not a district in this plan`);
    }
    if (levelById.has(L.id)) throw new Error(`buildTerrain: two terrain levels for district "${L.id}"`);
    const rect = { ...d.envelope, y: L.y, id: L.id, tone: L.tone ?? 'ground' };
    levels.push(rect);
    levelById.set(L.id, rect);
  }
  for (const d of plan.districts) {
    if (!levelById.has(d.id)) {
      throw new Error(
        `buildTerrain: district "${d.id}" has no entry in terrain.levels, so its ground is undefined. ` +
        'Every district gets a level here — that is what stops it laying its own.');
    }
  }
  const yValues = levels.map((L) => L.y);
  const minLevel = Math.min(...yValues);

  /* ---- 3. surrounds treatment ---------------------------------------- */
  const sur = spec.surrounds ?? {};
  const surKind = typeof sur.kind === 'string' ? sur.kind : 'flat';
  const waterY = isNum(sur.water_y) ? sur.water_y : minLevel - 0.35;
  const surY = isNum(sur.y) ? sur.y
    : surKind === 'water' ? waterY - 1.6
      : minLevel - 0.45;
  const blendM = isNum(sur.blend_m) ? Math.max(1, sur.blend_m) : BLEND_DEFAULT_M;

  /* Scattered domes, a third of them hollows, fading IN with distance from
   * the parcels.  Not decoration: a flat card forty metres across under a
   * three-band cel ramp is one tone with a hard edge and no shape at all,
   * and the surrounds is the largest single area in any city frame.  A sine
   * pair will not do — it gives every ridge the same bearing and the ink
   * pass draws them as straight parallel lines. */
  const ROUGH = (() => {
    const r = mulberry32(0x5eed17);
    const list = [];
    const w = footprint.x1 - footprint.x0 + 2 * APRON_M;
    const d = footprint.z1 - footprint.z0 + 2 * APRON_M;
    const n = Math.max(60, Math.round((w * d) / 55));
    const amp = isNum(sur.roughness_m) ? sur.roughness_m : 0.42;
    for (let i = 0; i < n; i += 1) {
      const rx = 2.2 + r() * 5.5;
      list.push([
        footprint.x0 - APRON_M + r() * w, footprint.z0 - APRON_M + r() * d,
        rx, 2.2 + r() * 5.5, (r() < 0.36 ? -1 : 1) * amp * (0.35 + r() * 0.65),
      ]);
    }
    return list;
  })();
  function roughAt(x, z) {
    let y = 0;
    for (const [cx, cz, rx, rz, h] of ROUGH) {
      if (Math.abs(x - cx) > rx || Math.abs(z - cz) > rz) continue;
      y += dome(x, z, cx, cz, rx, rz, h);
    }
    return y;
  }

  /* ---- 4. crossings: BOTH halves of every socket -------------------- *
   * The seam is made by construction here.  Two districts each building
   * their own half of a flight is exactly the arrangement that lets them
   * disagree, and a socket contract they both honour on paper is still two
   * separate pieces of geometry meeting by arithmetic.
   */
  const socketIndex = new Map();
  for (const d of plan.districts) {
    for (const s of d.sockets ?? []) socketIndex.set(s.id, { socket: s, district: d });
  }

  const crossings = [];     // { corridor, kind, ... , halves: [...] }
  const stairRects = [];    // tread regions: cells are skipped there
  const treads = [];        // { x0, z0, x1, z1, top }
  const corridors = [];     // landing + run rects, for tone and for cuts

  for (const c of spec.crossings ?? []) {
    const ref = socketIndex.get(c.socket);
    if (!ref) throw new Error(`buildTerrain: terrain.crossings names socket "${c.socket}", which is not in the plan`);
    const mateRef = socketIndex.get(ref.socket.mate);
    if (!mateRef) throw new Error(`buildTerrain: socket "${c.socket}" has no mate "${ref.socket.mate}" — a crossing has two sides`);
    const kind = c.kind ?? ref.socket.kind ?? 'path';
    const s = ref.socket;
    const alongX = s.axis === 'x';           // route crosses along x => boundary is x = const
    const line = alongX ? s.at[0] : s.at[1];
    const centre = alongX ? s.at[1] : s.at[0];
    const half = s.width / 2;

    const record = { id: s.id, mate: s.mate, kind, alongX, line, centre, width: s.width, y: s.y, halves: [] };
    for (const side of [ref, mateRef]) {
      const e = side.district.envelope;
      const target = levelById.get(side.district.id).y;
      const mid = alongX ? (e.x0 + e.x1) / 2 : (e.z0 + e.z1) / 2;
      const sign = mid >= line ? 1 : -1;
      const room = Math.abs((sign > 0 ? (alongX ? e.x1 : e.z1) : (alongX ? e.x0 : e.z0)) - line);
      const drop = target - s.y;

      let run = 0;
      let steps = 0;
      let rise = 0;
      let going = 0;
      if (Math.abs(drop) > 1e-6) {
        if (kind === 'stairs') {
          going = Math.max(MIN_GOING_M, isNum(c.going) ? c.going : 0.42);
          steps = Math.max(1, Math.ceil(Math.abs(drop) / (isNum(c.rise) ? c.rise : STEP_RISE_M)));
          rise = drop / steps;
          run = steps * going;
        } else {
          const grade = Math.abs(isNum(c.grade) ? c.grade : RAMP_GRADE);
          run = Math.max(1, Math.abs(drop) / Math.max(0.01, grade));
        }
      }
      const landing = Math.min(LANDING_M, Math.max(0, room - run - 0.2));
      if (run + landing > room + 1e-6) {
        throw new Error(
          `buildTerrain: crossing "${s.id}" needs ${(run + landing).toFixed(2)} m to fall ${drop.toFixed(2)} m ` +
          `into "${side.district.id}", which only offers ${room.toFixed(2)} m from the boundary to its far edge. ` +
          'Widen the envelope, move the socket, or steepen the crossing (grade / rise).');
      }
      const a0 = line + sign * landing;                    // where the run starts
      const a1 = a0 + sign * run;                          // where it reaches `target`
      const span = (lo, hi) => (lo < hi ? [lo, hi] : [hi, lo]);
      const [cLo, cHi] = span(line, a1);
      const corridor = alongX
        ? { x0: cLo, x1: cHi, z0: centre - half, z1: centre + half }
        : { x0: centre - half, x1: centre + half, z0: cLo, z1: cHi };
      const [rLo, rHi] = span(a0, a1);
      const runRect = alongX
        ? { x0: rLo, x1: rHi, z0: centre - half, z1: centre + half }
        : { x0: centre - half, x1: centre + half, z0: rLo, z1: rHi };

      const halfRec = {
        district: side.district.id, sign, target, landing, run, steps, rise, going,
        a0, a1, corridor, runRect, drop,
      };
      record.halves.push(halfRec);
      corridors.push({ ...corridor, kind });

      if (kind === 'stairs' && steps > 0) {
        stairRects.push({ ...runRect, half: halfRec, alongX });
        /* Treads OVERLAP by TREAD_PAD_M.  heightAt's platform test is
         * exclusive of nothing but a knife edge is still a knife edge: a
         * grid sampler lands exactly on a joint every single time, and a
         * flight whose treads merely meet reads as a hole partway up. */
        for (let i = 0; i < steps; i += 1) {
          const t0 = a0 + sign * (i * going);
          const t1 = a0 + sign * ((i + 1) * going + TREAD_PAD_M);
          const [lo, hi] = span(t0, t1);
          treads.push(alongX
            ? { x0: lo, x1: hi, z0: centre - half, z1: centre + half, top: s.y + (i + 1) * rise }
            : { x0: centre - half, x1: centre + half, z0: lo, z1: hi, top: s.y + (i + 1) * rise });
        }
      }
    }
    crossings.push(record);
  }

  const stairAt = (x, z) => {
    for (const r of stairRects) if (inRect(x, z, r)) return r;
    return null;
  };
  const crossingHalfAt = (x, z) => {
    for (const c of crossings) {
      for (const h of c.halves) if (inRect(x, z, h.corridor)) return { c, h };
    }
    return null;
  };
  const levelAt = (x, z) => {
    /* MAX over the levels containing the point, not the first match.  Two
     * envelopes share their boundary line exactly, so a node on it is
     * inside both: taking the max puts the node at the HIGHER level and
     * draws the change as a face on the lower side, which is what a
     * terrace edge is.  Taking "whichever was first" makes the face's
     * position depend on array order. */
    let y = null;
    for (const L of levels) if (inRect(x, z, L) && (y === null || L.y > y)) y = L.y;
    return y;
  };

  /* ---- 5. the field: the DRAWN surface ------------------------------ */
  function fieldAt(x, z) {
    const ch = crossingHalfAt(x, z);
    if (ch) {
      const { c, h } = ch;
      const a = c.alongX ? x : z;
      const t = h.run > 1e-9 ? clamp(((a - h.a0) * h.sign) / h.run, 0, 1) : 0;
      const y = c.y + (h.target - c.y) * t;
      // under a flight the field runs just below the treads, so the two are
      // never coplanar — a coin toss the renderer re-tosses every frame
      return c.kind === 'stairs' && h.steps > 0 && inRect(x, z, h.runRect) ? y - 0.05 : y;
    }
    const L = levelAt(x, z);
    if (L !== null) return L;

    // the surrounds: blended out of the nearest levels, into the treatment
    let wsum = 0;
    let ysum = 0;
    let dmin = Infinity;
    for (const l of levels) {
      const d = distOutside(x, z, l);
      if (d < dmin) dmin = d;
      const w = 1 / (d + 0.08) ** 2;
      wsum += w;
      ysum += w * l.y;
    }
    const near = wsum ? ysum / wsum : surY;
    const t = smoothstep(0, blendM, dmin);
    return near * (1 - t) + surY * t + roughAt(x, z) * t;
  }

  /* ---- 6. the conforming grid --------------------------------------- *
   * Every designed edge is a grid line before anything is subdivided.
   */
  const xcuts = [];
  const zcuts = [];
  for (const d of plan.districts) {
    // the envelope edge itself AND a hairline outside it: the thin cell
    // between them is what DRAWS a level change as a vertical face instead
    // of ramping it across a whole cell of the lower district's ground
    for (const v of [d.envelope.x0, d.envelope.x1]) xcuts.push(v, v - SCARP_M, v + SCARP_M);
    for (const v of [d.envelope.z0, d.envelope.z1]) zcuts.push(v, v - SCARP_M, v + SCARP_M);
  }
  for (const r of corridors) { xcuts.push(r.x0, r.x1); zcuts.push(r.z0, r.z1); }
  for (const t of treads) { xcuts.push(t.x0, t.x1); zcuts.push(t.z0, t.z1); }
  for (const c of crossings) {
    // subdivide a ramp finely enough that min-over-corners never sits far
    // under the drawn rake: one cell may fall at most MAX_CELL_RISE_M
    for (const h of c.halves) {
      if (c.kind === 'stairs' || h.run <= 1e-9) continue;
      const n = Math.max(1, Math.ceil(Math.abs(h.drop) / MAX_CELL_RISE_M));
      for (let i = 0; i <= n; i += 1) {
        const a = h.a0 + h.sign * (h.run * i) / n;
        if (c.alongX) xcuts.push(a); else zcuts.push(a);
      }
    }
    const half = c.width / 2;
    if (c.alongX) zcuts.push(c.centre - half, c.centre + half);
    else xcuts.push(c.centre - half, c.centre + half);
  }
  const XS = axisLines(footprint.x0, footprint.x1, xcuts, cell);
  const ZS = axisLines(footprint.z0, footprint.z1, zcuts, cell);

  /* ---- 7. the walked surface ---------------------------------------- *
   * min over the cell's four corners, quantised DOWN (which only ever
   * lowers, so the guarantee survives it) so a smooth slope produces runs
   * of equal-height cells that merge into single rects.
   */
  const quant = (v) => {
    const q = Math.floor(v / QUANT_M + 1e-6) * QUANT_M;
    return Math.round(q * 10000) / 10000;
  };
  const cellTop = (i, j) => {
    const a = fieldAt(XS[i], ZS[j]);
    const b = fieldAt(XS[i + 1], ZS[j]);
    const c = fieldAt(XS[i], ZS[j + 1]);
    const d = fieldAt(XS[i + 1], ZS[j + 1]);
    const lo = Math.min(a, b, c, d);
    // flat cell: answer its exact height, so a contracted 1.2 m terrace is
    // 1.2 m and not 1.15 because the quantum happened to fall there
    if (Math.max(a, b, c, d) - lo < 1e-9) return Math.round(lo * 10000) / 10000;
    return quant(lo);
  };

  /** The walked ground anywhere in the world — the terrain's whole API. */
  function terrainHeightAt(x, z) {
    for (const t of treads) if (inRect(x, z, t)) return t.top;
    const i = lastBelow(XS, x);
    const j = lastBelow(ZS, z);
    return cellTop(i, j);
  }

  /* ---- 8. drawn geometry, pooled per tone --------------------------- */
  const APX = [footprint.x0 - APRON_M, ...XS, footprint.x1 + APRON_M];
  const APZ = [footprint.z0 - APRON_M, ...ZS, footprint.z1 + APRON_M];
  const nodeY = (x, z) => {
    if (x < footprint.x0 || x > footprint.x1 || z < footprint.z0 || z > footprint.z1) {
      return surY - 1.1;   // the apron falls away, so nothing ends in a cut
    }
    return fieldAt(x, z);
  };
  const H = APZ.map((z) => APX.map((x) => nodeY(x, z)));

  const pools = new Map();
  const push = (key, a, b, c) => {
    if (!pools.has(key)) pools.set(key, []);
    const out = pools.get(key);
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const P = (i, j) => [APX[i], H[j][i], APZ[j]];

  for (let j = 0; j < APZ.length - 1; j += 1) {
    for (let i = 0; i < APX.length - 1; i += 1) {
      const p00 = P(i, j);
      const p10 = P(i + 1, j);
      const p01 = P(i, j + 1);
      const p11 = P(i + 1, j + 1);
      const cx = (APX[i] + APX[i + 1]) / 2;
      const cz = (APZ[j] + APZ[j + 1]) / 2;
      const cy = (p00[1] + p10[1] + p01[1] + p11[1]) / 4;
      const dx = (p10[1] - p00[1] + p11[1] - p01[1]) / (2 * Math.max(1e-6, APX[i + 1] - APX[i]));
      const dz = (p01[1] - p00[1] + p11[1] - p10[1]) / (2 * Math.max(1e-6, APZ[j + 1] - APZ[j]));
      const slope = Math.hypot(dx, dz);
      // decided ONCE per cell at its centre, never per triangle: a jittered
      // per-triangle choice comes out as a zip of alternating tones along
      // every boundary, which is what a tone boundary must never look like
      let key;
      if (crossingHalfAt(cx, cz)) key = 'paving';
      else if (levelAt(cx, cz) !== null) key = levels.find((l) => inRect(cx, cz, l))?.tone ?? 'ground';
      else if (slope > 0.5) key = 'bank';
      else if (surKind === 'water' && cy < waterY + 0.45) key = 'shore';
      else key = 'surrounds';
      // ALTERNATING diagonals: one direction everywhere gives the ground a
      // diagonal grain the ink pass draws as parallel creases down a slope
      if ((i + j) & 1) { push(key, p00, p11, p10); push(key, p00, p01, p11); }
      else { push(key, p00, p01, p10); push(key, p10, p01, p11); }
    }
  }

  /* skirt: vertical walls round the apron and a floor — a closed solid, so
   * the world has no severed edge from any camera above eye height */
  const FLOOR = surY - 4.0;
  const ring = [];
  const nx = APX.length;
  const nz = APZ.length;
  for (let i = 0; i < nx; i += 1) ring.push([APX[i], H[0][i], APZ[0]]);
  for (let j = 1; j < nz; j += 1) ring.push([APX[nx - 1], H[j][nx - 1], APZ[j]]);
  for (let i = nx - 2; i >= 0; i -= 1) ring.push([APX[i], H[nz - 1][i], APZ[nz - 1]]);
  for (let j = nz - 2; j >= 1; j -= 1) ring.push([APX[0], H[j][0], APZ[j]]);
  const ringCx = (APX[0] + APX[nx - 1]) / 2;
  const ringCz = (APZ[0] + APZ[nz - 1]) / 2;
  for (let n = 0; n < ring.length; n += 1) {
    const a = ring[n];
    const b = ring[(n + 1) % ring.length];
    const ad = [a[0], FLOOR, a[2]];
    const bd = [b[0], FLOOR, b[2]];
    // wind away from the solid's own axis, so a wall can never be inside-out
    const ox = (a[0] + b[0]) / 2 - ringCx;
    const oz = (a[2] + b[2]) / 2 - ringCz;
    if ((b[2] - a[2]) * ox - (b[0] - a[0]) * oz > 0) { push('skirt', a, ad, bd); push('skirt', a, bd, b); }
    else { push('skirt', a, bd, ad); push('skirt', a, b, bd); }
  }
  const f = (i, j) => [APX[i], FLOOR, APZ[j]];
  push('skirt', f(0, 0), f(nx - 1, nz - 1), f(nx - 1, 0));
  push('skirt', f(0, 0), f(0, nz - 1), f(nx - 1, nz - 1));

  /* the stair treads: drawn as one merged pool with the paving */
  const treadPool = [];
  const boxTris = (r, top, bottom) => {
    const v = [
      [r.x0, bottom, r.z0], [r.x1, bottom, r.z0], [r.x1, bottom, r.z1], [r.x0, bottom, r.z1],
      [r.x0, top, r.z0], [r.x1, top, r.z0], [r.x1, top, r.z1], [r.x0, top, r.z1],
    ];
    const quad = (a, b, c, d) => { treadPool.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]); };
    quad(4, 7, 6, 5);           // top
    quad(0, 1, 2, 3);           // bottom
    quad(0, 4, 5, 1);           // -z
    quad(2, 6, 7, 3);           // +z
    quad(3, 7, 4, 0);           // -x
    quad(1, 5, 6, 2);           // +x
  };
  for (const t of treads) boxTris(t, t.top, Math.min(t.top, surY) - 0.6);

  const group = new THREE.Group();
  group.name = 'terrain';
  let triangles = 0;
  const mesh = (list, mat, name) => {
    if (!list.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    geo.computeVertexNormals();   // non-indexed: this IS flat shading
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    triangles += list.length / 9;
    group.add(m);
  };
  for (const [key, list] of pools) mesh(list, M[key] ?? M.ground, `terrain:${key}`);
  mesh(treadPool, M.paving, 'terrain:treads');

  if (surKind === 'water') {
    /* Four times the footprint, deliberately: the ground's apron may end at
     * the world's edge but WATER may not be seen to. A water plane sized to
     * the footprint puts its own straight edge in every overhead and oblique
     * frame, which reads as exactly the severed edge the apron exists to
     * remove. Beyond the ground it costs two triangles. */
    const w = (footprint.x1 - footprint.x0 + 2 * APRON_M) * 4;
    const d = (footprint.z1 - footprint.z0 + 2 * APRON_M) * 4;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.water);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((footprint.x0 + footprint.x1) / 2, waterY, (footprint.z0 + footprint.z1) / 2);
    plane.name = 'terrain:water';
    plane.receiveShadow = true;
    group.add(plane);
    triangles += 2;
  }
  ctx.add(group, 'terrain');

  /* ---- 9. platform registrations for the walker --------------------- */
  const own = () => { ctx.platforms[ctx.platforms.length - 1].owner = 'terrain'; };
  for (const t of treads) { ctx.platform(t.x0, t.z0, t.x1, t.z1, t.top); own(); }

  let cells = 0;
  for (let j = 0; j < ZS.length - 1; j += 1) {
    const z0 = ZS[j];
    const z1 = ZS[j + 1];
    const cz = (z0 + z1) / 2;
    let runStart = -1;
    let runY = 0;
    const flush = (iEnd) => {
      if (runStart < 0) return;
      ctx.platform(XS[runStart], z0, XS[iEnd], z1, runY);
      own();
      cells += 1;
      runStart = -1;
    };
    for (let i = 0; i < XS.length - 1; i += 1) {
      const cx = (XS[i] + XS[i + 1]) / 2;
      // a cell inside a flight would be the MAX over the tread beside it and
      // would seal the climb: the treads ARE the ground there
      if (stairAt(cx, cz)) { flush(i); continue; }
      const y = cellTop(i, j);
      if (runStart >= 0 && Math.abs(y - runY) < 1e-9) continue;
      flush(i);
      runStart = i;
      runY = y;
    }
    flush(XS.length - 1);
  }

  const stats = {
    nodes: APX.length * APZ.length,
    cells: (XS.length - 1) * (ZS.length - 1),
    platforms: cells + treads.length,
    treads: treads.length,
    triangles: Math.round(triangles),
    meshes: group.children.length,
    tones: [...pools.keys()],
    cell_m: cell,
    footprint,
  };

  return { terrainHeightAt, group, footprint, levels, crossings, treads, stats };
}
