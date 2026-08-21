/**
 * The sun, derived from the plan's own compass.
 *
 * A city plan says things like "low sun from the south-east rakes the east
 * faces".  That sentence is meaningless until the plan also says which way
 * north is, and it is worse than meaningless if the light rig disagrees with
 * it: every district art-directs to the light it can see, nobody owns the
 * contradiction, and it only surfaces when someone reads the plan and the rig
 * side by side.  So the rig is computed here from `city.compass` and
 * `city.sun` and is never hand-placed.
 */

const BEARINGS = {
  n: 0, north: 0, ne: 45, northeast: 45, e: 90, east: 90, se: 135, southeast: 135,
  s: 180, south: 180, sw: 225, southwest: 225, w: 270, west: 270, nw: 315, northwest: 315,
};

/** Bearing in degrees clockwise from north, from a name or a number. */
export function bearingOf(spec) {
  if (typeof spec === 'number') return spec;
  const key = String(spec).toLowerCase().replace(/[^a-z]/g, '');
  if (!(key in BEARINGS)) throw new Error(`sunrig: unknown bearing "${spec}"`);
  return BEARINGS[key];
}

/**
 * Where to stand the directional light so it shines FROM the plan's bearing.
 * With north = n in the xz plane, east is n turned a quarter clockwise seen
 * from above -- (-nz, nx) -- and a bearing is measured clockwise from north,
 * so the horizontal direction is n·cos(b) + e·sin(b).
 */
export function sunPosition({ compass, sun }, distance = 60) {
  const [nx, nz] = compass?.north_xz ?? [0, -1];
  const len = Math.hypot(nx, nz);
  if (!len) throw new Error('sunrig: compass.north_xz has zero length');
  const n = [nx / len, nz / len];
  const e = [-n[1], n[0]];
  const b = (bearingOf(sun?.bearing ?? 'south-east') * Math.PI) / 180;
  const el = ((sun?.elevation_deg ?? 22) * Math.PI) / 180;
  const flat = distance * Math.cos(el);
  return [
    (n[0] * Math.cos(b) + e[0] * Math.sin(b)) * flat,
    distance * Math.sin(el),
    (n[1] * Math.cos(b) + e[1] * Math.sin(b)) * flat,
  ];
}

/** The fill sits in the opposite quarter, lower and cooler. */
export function fillPosition(plan, distance = 40) {
  const p = sunPosition(plan, distance);
  return [-p[0], Math.abs(p[1]) * 0.55, -p[2]];
}

/** A shadow cascade that covers the whole footprint rather than a vignette. */
export function shadowRadius(footprint_m = [40, 40]) {
  return Math.max(4, (Math.max(footprint_m[0], footprint_m[1]) / 2) * 1.15);
}
