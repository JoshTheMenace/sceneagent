import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Spatial audit.
 *
 * Screenshots miss metre-scale embedding and floating (measured in
 * the medieval-river-town spatial-contract findings): a
 * hovering shrub or a cart buried in a wall renders as a perfectly
 * plausible frame from six review cameras.  So this is measured, not
 * looked at.  Six tests — the first four are failures (exit 1), the
 * last two are warnings (printed, exit 0):
 *
 *   GROUND CONTACT — every audit unit gets a vertical ray down from its
 *     world-bbox bottom (centre, plus 4 inset corners when wider than
 *     1 m).  Best gap to the first non-self surface > 0.06 m => FLOAT
 *     (no point of support anywhere); EVERY probed point more than
 *     0.25 m under its surface => BURIED (any grounded corner clears a
 *     unit, so an assembly straddling two terrace levels is legal).
 *   RUN CONTACT — a LINEAR unit (XZ aspect > 3, longer than 2 m,
 *     taller than 0.3 m, or userData.linear = true) must follow the
 *     ground for its whole length, not just touch it somewhere: one
 *     probe every 0.5 m along the base line.  Any station more than
 *     0.08 m off its support => FLOAT-RUN; more than 0.3 m under it =>
 *     BURIED-RUN.  This is the "a swept barrier needs a swept collider"
 *     lesson applied to seating — a level wall over falling ground is
 *     grounded at one end and see-through under the rest, and the
 *     point check passes it.  (Runs are audited straight: an L of two
 *     runs that touch clusters into one unit and can fall under the
 *     aspect gate.)
 *   OVERLAP — pairwise world-bbox intersection between TAGGED units
 *     > 15 % of the smaller volume => two assemblies interpenetrating.
 *     AABB only, so it is coarse for rotated shapes, and pooled island
 *     clusters are excluded: an L-shaped cluster's AABB overstates it so
 *     badly that every flag was a bbox artifact when tried.
 *   GROUND SEAMS — a 0.5 m grid over the contract footprint, one ray
 *     straight down per sample: nothing hit above y = -0.5 => HOLE
 *     (missing ground); with a groundAt() available, a first hit more
 *     than 0.5 m below the claimed walkable height => SEAM (the player
 *     walks on air there).  Samples inside colliders are skipped — the
 *     walkable footprint is what is audited.
 *   UNEXPLAINED-MASS (warning) — a bare block: a single island or
 *     anonymous loose mesh taller than 0.8 m with over 1.5 m³ / 1.5 m²
 *     to it, block-like (mesh volume > 60 % of its bbox — bank wedges
 *     fail this), whose top plane has nothing seated on or over it.  A
 *     terrace mass capped by its floor layer is explained; a ramp's
 *     support box poking through its own ramp is not.  It may be
 *     legitimate — but it must be decided, not unnoticed.
 *   EMBEDDED (warning) — a scatter-scale island (bbox <= 2 m³) with
 *     more than 20 % of its own volume inside SUPPORT solids (terrain,
 *     banks, landmark masses — anything outside the unit sets), by
 *     vertical-parity test over sample points that fall inside the
 *     island's own geometry.  Parity only consults CLOSED support
 *     meshes (edge-parity checked): an open sheet — a roof plane —
 *     reads as "inside" for everything above it and poisons the test.
 *     Catches a bush cone clipping into a bank's side face, which
 *     BURIED cannot see: BURIED only looks down.
 *
 * What is an audit unit?  Two conventions, both supported:
 *
 *   1. Tagged objects: any Object3D with `userData.prop = true` (or a
 *      name starting with 'prop:').  The topmost tagged node is the
 *      unit — its whole subtree is one assembly.  Deliberately airborne
 *      things (a hung sign, a bird) set `userData.airborne = true` to
 *      opt out of ground contact (they still join the overlap test).
 *   2. Pooled scenes (one merged mesh per material, no per-prop
 *      Object3Ds): pass `islandSets: ['props', 'pines', ...]` — name
 *      prefixes of the merged meshes.  Each mesh is split into geometry
 *      islands (triangles sharing a vertex), and islands from the same
 *      set whose XZ bboxes touch are clustered into one unit; ground
 *      contact probes the cluster's lowest island — its foot — so a
 *      pine (trunk + tiers stacked in plan) audits as one grounded
 *      assembly while a lone hovering bush cone audits alone.
 *      `linearSets: ['terrain', ...]` additionally audits the RUNS
 *      inside otherwise-support meshes: small islands (under 20 m² /
 *      3 m short side — ground slabs and banks stay support) are
 *      clustered by 3D touch so a wall picks up its own coping and
 *      base courses, and every elongated cluster gets the run check.
 *
 * Everything not tagged and not in a set is support: terrain, water,
 * walls — the rays land on it.  Pure math, no WebGL: runs in-page
 * (window.__vignette.checkSpatial) and headless
 * (scripts/check-spatial.mjs).
 * ------------------------------------------------------------------ */

const FLOAT_GAP_M = 0.06;
const BURIED_M = 0.25;
const PROBE_UP_M = 0.3; // down-ray origin above the bbox bottom; must exceed BURIED_M
const RUN_STEP_M = 0.5;
const RUN_FLOAT_M = 0.08;
const RUN_BURIED_M = 0.3;
const RUN_PROBE_UP_M = 0.45; // must exceed RUN_BURIED_M
const RUN_MIN_LEN_M = 2;
const RUN_ASPECT = 3;
const RUN_MIN_H_M = 0.3;
const OVERLAP_FRAC = 0.15;
const WIDE_M = 1.0;
const CORNER_INSET_M = 0.08;
const GRID_M = 0.5;
const SEAM_FROM_Y = 30; // above everything, so roofs and peaks cannot swallow the origin
const HOLE_FLOOR_Y = -0.5;
const SEAM_DROP_M = 0.5; // deliberate shallow depressions (a stream bed) stay legal
const MASS_MIN_H_M = 0.8;
const MASS_MIN_VOL_M3 = 1.5;
const MASS_MIN_FOOT_M2 = 1.5;
const MASS_SOLIDITY = 0.6; // mesh volume / bbox volume: a tilted wedge reads ~0.2
const MASS_COVER_M = 0.08; // a surface this close to the top plane counts as seated on it
const EMBED_MAX_VOL_M3 = 2;
// measured on the village: a cone seated correctly on a 1-in-2 bank must
// sink a little (one buried lattice sample, ~14 %), while a visibly
// clipped cone reads ~25 %.  0.3 missed every clipped bush; the lattice
// quantises at ~1/7, so 0.2 is the step between the two.
const EMBED_FRAC = 0.2;
const GROUND_SCALE_FOOT_M2 = 20; // linearSets islands bigger than this are support, not runs
const GROUND_SCALE_SIDE_M = 3;
const CELL_M = 2; // XZ triangle-index cell
const CLUSTER_MARGIN_M = 0.02;
const TOUCH3D_MARGIN_M = 0.005; // tight: corner-adjacent wall runs must NOT chain into an L

const round2 = (v) => Math.round(v * 100) / 100;
const boxCentre = (box) => box.getCenter(new THREE.Vector3()).toArray().map(round2);

function label(object) {
  for (let o = object; o; o = o.parent) if (o.name) return o.name;
  return object.type;
}

/* Every ray in this audit is vertical, and merged pooled meshes have
 * world-sized bounds that defeat Raycaster's per-mesh culling — so index
 * every world-space triangle into XZ cells once and answer down-rays with
 * a 2D point-in-triangle test.  Vertical triangles (walls) are skipped;
 * a plumb ray cannot meaningfully rest on one. */
function buildDowncast(scene) {
  const tris = [];
  const cells = new Map();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position || !mesh.visible) return;
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        v[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
      }
      const id = tris.push({
        ax: v[0].x, ay: v[0].y, az: v[0].z,
        bx: v[1].x, by: v[1].y, bz: v[1].z,
        cx: v[2].x, cy: v[2].y, cz: v[2].z,
        mesh, face: i / 3,
      }) - 1;
      const t = tris[id];
      const x0 = Math.floor(Math.min(t.ax, t.bx, t.cx) / CELL_M);
      const x1 = Math.floor(Math.max(t.ax, t.bx, t.cx) / CELL_M);
      const z0 = Math.floor(Math.min(t.az, t.bz, t.cz) / CELL_M);
      const z1 = Math.floor(Math.max(t.az, t.bz, t.cz) / CELL_M);
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cz = z0; cz <= z1; cz += 1) {
          const key = `${cx},${cz}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(id);
        }
      }
    }
  });

  function heightAtTri(t, x, z) {
    const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz);
    if (Math.abs(d) < 1e-9) return null; // vertical triangle
    const w0 = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / d;
    const w1 = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) return null;
    return w0 * t.ay + w1 * t.by + w2 * t.cy;
  }

  // highest surface at (x, z) strictly below fromY, skipping excluded faces
  function down(x, z, fromY, excluded = null) {
    const bucket = cells.get(`${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`);
    if (!bucket) return null;
    let best = null;
    for (const id of bucket) {
      const t = tris[id];
      const y = heightAtTri(t, x, z);
      if (y === null || y > fromY - 1e-4) continue;
      if (best && y <= best.y) continue;
      if (excluded && excluded(t.mesh, t.face)) continue;
      best = { y, mesh: t.mesh };
    }
    return best;
  }

  // surfaces crossed below (x, z, y) over faces `allow` accepts: an odd
  // count means the point is inside one of those solids (closed geometry)
  function crossingsBelow(x, z, y, allow) {
    const bucket = cells.get(`${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`);
    if (!bucket) return 0;
    let n = 0;
    for (const id of bucket) {
      const t = tris[id];
      if (!allow(t.mesh, t.face)) continue;
      const ty = heightAtTri(t, x, z);
      if (ty !== null && ty < y) n += 1;
    }
    return n;
  }

  return { down, crossingsBelow, triangles: tris.length };
}

/* ---- audit units --------------------------------------------------- */

// topmost tagged node wins; a tag inside a tag is part of the outer unit
function collectTagged(root) {
  const units = [];
  (function walk(object) {
    const tagged = object.userData?.prop === true || (typeof object.name === 'string' && object.name.startsWith('prop:'));
    if (tagged) {
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        units.push({
          name: label(object),
          object,
          box,
          tagged: true,
          linearTag: object.userData?.linear === true,
          airborne: object.userData?.airborne === true,
          isOwn: (mesh) => { for (let o = mesh; o; o = o.parent) if (o === object) return true; return false; },
        });
      }
      return;
    }
    for (const child of object.children) walk(child);
  })(root);
  return units;
}

class UnionFind {
  constructor(n) { this.parent = Int32Array.from({ length: n }, (_, i) => i); }
  find(i) { let p = this.parent; while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
  union(a, b) { this.parent[this.find(a)] = this.find(b); }
}

// split one merged mesh into triangle islands via shared (quantised) vertices
function meshIslands(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const count = index ? index.count : position.count;
  const triCount = Math.floor(count / 3);
  const uf = new UnionFind(triCount);
  const owner = new Map();
  const w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const boxes = [];
  const vols = []; // signed tetra volumes: per-island sums give real solid volume
  for (let tri = 0; tri < triCount; tri += 1) {
    const box = new THREE.Box3();
    for (let k = 0; k < 3; k += 1) {
      const vi = index ? index.getX(tri * 3 + k) : tri * 3 + k;
      const key = `${Math.round(position.getX(vi) * 1000)},${Math.round(position.getY(vi) * 1000)},${Math.round(position.getZ(vi) * 1000)}`;
      if (owner.has(key)) uf.union(tri, owner.get(key));
      else owner.set(key, tri);
      box.expandByPoint(w[k].fromBufferAttribute(position, vi).applyMatrix4(mesh.matrixWorld));
    }
    boxes.push(box);
    vols.push(w[0].dot(new THREE.Vector3().crossVectors(w[1], w[2])) / 6);
  }
  const islands = new Map();
  for (let tri = 0; tri < triCount; tri += 1) {
    const root = uf.find(tri);
    if (!islands.has(root)) islands.set(root, { mesh, box: new THREE.Box3(), faces: new Set(), vol: 0 });
    const island = islands.get(root);
    island.box.union(boxes[tri]);
    island.faces.add(tri);
    island.vol += vols[tri];
  }
  return [...islands.values()].map((island) => ((island.vol = Math.abs(island.vol)), island));
}

const xzTouch = (a, b) =>
  a.min.x <= b.max.x + CLUSTER_MARGIN_M && b.min.x <= a.max.x + CLUSTER_MARGIN_M &&
  a.min.z <= b.max.z + CLUSTER_MARGIN_M && b.min.z <= a.max.z + CLUSTER_MARGIN_M;

const touch3D = (a, b) =>
  a.min.x <= b.max.x + TOUCH3D_MARGIN_M && b.min.x <= a.max.x + TOUCH3D_MARGIN_M &&
  a.min.y <= b.max.y + TOUCH3D_MARGIN_M && b.min.y <= a.max.y + TOUCH3D_MARGIN_M &&
  a.min.z <= b.max.z + TOUCH3D_MARGIN_M && b.min.z <= a.max.z + TOUCH3D_MARGIN_M;

// islands whose bboxes touch are one assembly (a stacked pine grounds
// through its trunk; a lone hovering cone stands alone; a wall picks up
// its own coping and base courses)
function clusterIslands(setName, islands, touch) {
  const uf = new UnionFind(islands.length);
  for (let i = 0; i < islands.length; i += 1) {
    for (let j = i + 1; j < islands.length; j += 1) {
      if (touch(islands[i].box, islands[j].box)) uf.union(i, j);
    }
  }
  const groups = new Map();
  islands.forEach((island, i) => {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(island);
  });
  return [...groups.values()].map((members, i) => {
    const box = members.reduce((acc, m) => acc.union(m.box), new THREE.Box3());
    const faces = new Map(); // mesh -> Set(face)
    for (const m of members) {
      if (!faces.has(m.mesh)) faces.set(m.mesh, new Set());
      for (const f of m.faces) faces.get(m.mesh).add(f);
    }
    // ground contact probes the cluster's FOOT — its lowest island (a house
    // base, a pine trunk, a lone bush cone) at that island's own footprint.
    // The whole-cluster bbox is useless for it: two houses on different
    // terraces cluster together, and their joint bbox bottoms out under the
    // higher pad while its corners hang past the roof eaves.
    const foot = members.reduce((low, m) => (m.box.min.y < low.box.min.y ? m : low));
    const c = box.getCenter(new THREE.Vector3());
    return {
      name: `${setName}#${i} (${members.length} island${members.length === 1 ? '' : 's'} @ ${round2(c.x)}, ${round2(c.z)})`,
      box,
      probeBox: foot.box,
      members,
      tagged: false,
      linearTag: false,
      airborne: false,
      isOwn: (mesh, face) => faces.get(mesh)?.has(face) ?? false,
    };
  });
}

function isRun(unit) {
  if (unit.linearTag) return true;
  const size = unit.box.getSize(new THREE.Vector3());
  const long = Math.max(size.x, size.z);
  const short = Math.max(Math.min(size.x, size.z), 1e-3);
  return long > RUN_MIN_LEN_M && long / short > RUN_ASPECT && size.y >= RUN_MIN_H_M;
}

// a mesh with no name of its own and no named ancestor has no owner;
// the composition root (the scene's direct child group) is a container,
// not an identity
function hasIdentity(mesh) {
  for (let o = mesh; o && !o.isScene; o = o.parent) {
    if (o.name && !(o.parent && o.parent.isScene)) return true;
    if (o.parent && o.parent.isScene) break;
  }
  return false;
}

// an island is closed iff every (quantised) edge bounds an even number of
// its triangles — parity insideness is only meaningful against closed
// geometry, and an open sheet (a roof plane) reads as "inside" for
// everything above it.  Per ISLAND, not per mesh: one open strip in a
// merged pooled mesh must not disqualify every closed bank beside it.
function islandIsClosed(island) {
  const position = island.mesh.geometry.attributes.position;
  const index = island.mesh.geometry.index;
  const key = (vi) => `${Math.round(position.getX(vi) * 1000)},${Math.round(position.getY(vi) * 1000)},${Math.round(position.getZ(vi) * 1000)}`;
  const edges = new Map();
  for (const face of island.faces) {
    const k = [0, 1, 2].map((j) => key(index ? index.getX(face * 3 + j) : face * 3 + j));
    for (let j = 0; j < 3; j += 1) {
      const a = k[j];
      const b = k[(j + 1) % 3];
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  for (const n of edges.values()) if (n % 2 !== 0) return false;
  return true;
}

function volumeOfMesh(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const count = index ? index.count : position.count;
  const w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let vol = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      w[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
    }
    vol += w[0].dot(new THREE.Vector3().crossVectors(w[1], w[2])) / 6;
  }
  return Math.abs(vol);
}

/* ---- the check ------------------------------------------------------ */

export function createSpatialCheck({ scene, groundAt = null, colliders = [], footprint = null, islandSets = null, linearSets = null }) {
  function checkSpatial() {
    const cast = buildDowncast(scene);
    const failures = [];
    const warnings = [];
    const fail = (type, object, detail, position) => failures.push({ type, object, detail, position: position.map(round2) });
    const warn = (type, object, detail, position) => warnings.push({ type, object, detail, position: position.map(round2) });

    const auditedMeshes = new Set(); // pooled meshes claimed by any set
    const unitMeshes = new Set(); // islandSets meshes: audit subjects, never support
    // a mesh belongs to a set if its own name matches OR an ancestor's does —
    // scenes flush pooled meshes into a named group, and an unnamed mesh
    // inside the 'houses' group (a rebuilt roof) is house geometry, not
    // support for its own eave trim
    const setMeshes = (setName) => {
      const matches = (o) => o.name === setName || o.name.startsWith(`${setName}-`);
      const meshes = [];
      scene.traverse((mesh) => {
        if (!mesh.isMesh) return;
        let inSet = false;
        for (let o = mesh; o && !o.isScene; o = o.parent) if (matches(o)) { inSet = true; break; }
        if (inSet) { meshes.push(mesh); auditedMeshes.add(mesh); }
      });
      return meshes;
    };

    const units = collectTagged(scene);
    const taggedCount = units.length;
    const massCandidates = [];
    const embedCandidates = [];
    for (const setName of islandSets ?? []) {
      const meshes = setMeshes(setName);
      meshes.forEach((mesh) => unitMeshes.add(mesh));
      const islands = meshes.flatMap(meshIslands);
      const clusters = clusterIslands(setName, islands, xzTouch);
      units.push(...clusters);
      for (const cluster of clusters) if (cluster.members.length === 1) massCandidates.push(cluster.members[0]);
      embedCandidates.push(...islands);
    }
    for (const setName of linearSets ?? []) {
      const islands = setMeshes(setName).flatMap(meshIslands);
      massCandidates.push(...islands);
      // ground-scale islands (slabs, meadows, banks) are support; the small
      // ones cluster by 3D touch so a wall owns its coping and bands, and
      // only elongated assemblies become run units
      const small = islands.filter((island) => {
        const s = island.box.getSize(new THREE.Vector3());
        return s.x * s.z <= GROUND_SCALE_FOOT_M2 && Math.min(s.x, s.z) <= GROUND_SCALE_SIDE_M;
      });
      units.push(...clusterIslands(`${setName}-run`, small, touch3D).filter(isRun));
    }

    /* ground contact: point check for compact units, station sweep for runs */
    let runCount = 0;
    for (const unit of units) {
      if (unit.airborne) continue;
      if (isRun(unit)) {
        runCount += 1;
        const box = unit.box;
        const size = box.getSize(new THREE.Vector3());
        const alongX = size.x >= size.z;
        const bottom = box.min.y;
        const mid = alongX ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2;
        const t0 = alongX ? box.min.x : box.min.z;
        const t1 = alongX ? box.max.x : box.max.z;
        const floats = [];
        const burieds = [];
        let total = 0;
        for (let t = t0 + RUN_STEP_M / 2; t < t1; t += RUN_STEP_M) {
          total += 1;
          const px = alongX ? t : mid;
          const pz = alongX ? mid : t;
          const hit = cast.down(px, pz, bottom + RUN_PROBE_UP_M, unit.isOwn);
          const gap = hit ? bottom - hit.y : Infinity;
          if (gap > RUN_FLOAT_M) {
            const above = cast.down(px, pz, box.max.y + 0.5, unit.isOwn);
            if (above && above.y > bottom + RUN_BURIED_M) burieds.push({ p: [px, bottom, pz], d: above.y - bottom });
            else floats.push({ p: [px, bottom, pz], gap });
          } else if (gap < -RUN_BURIED_M) {
            burieds.push({ p: [px, bottom, pz], d: -gap });
          }
        }
        const list = (marks) => marks.slice(0, 5).map((m) => `(${round2(m.p[0])}, ${round2(m.p[2])})`).join(' ') + (marks.length > 5 ? ' …' : '');
        if (floats.length) {
          const worst = floats.reduce((a, b) => (b.gap > a.gap ? b : a));
          fail('FLOAT-RUN', unit.name,
            `${floats.length}/${total} stations unsupported along the run, worst gap ${worst.gap === Infinity ? 'open air' : `${round2(worst.gap)} m`} — stations ${list(floats)}`,
            worst.p);
        }
        if (burieds.length) {
          const worst = burieds.reduce((a, b) => (b.d > a.d ? b : a));
          fail('BURIED-RUN', unit.name,
            `${burieds.length}/${total} stations more than ${RUN_BURIED_M} m under their surface, worst ${round2(worst.d)} m — stations ${list(burieds)}`,
            worst.p);
        }
        continue;
      }
      const box = unit.probeBox ?? unit.box;
      const bottom = box.min.y;
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const samples = [[cx, cz]];
      if (box.max.x - box.min.x > WIDE_M || box.max.z - box.min.z > WIDE_M) {
        const ix = Math.min(CORNER_INSET_M, (box.max.x - box.min.x) / 4);
        const iz = Math.min(CORNER_INSET_M, (box.max.z - box.min.z) / 4);
        samples.push(
          [box.min.x + ix, box.min.z + iz], [box.max.x - ix, box.min.z + iz],
          [box.min.x + ix, box.max.z - iz], [box.max.x - ix, box.max.z - iz],
        );
      }
      let minGap = Infinity; // most-supported probe: decides FLOAT
      let maxGap = -Infinity; // least-buried probe: decides BURIED
      let nearest = null;
      let clearest = null;
      for (const [sx, sz] of samples) {
        const hit = cast.down(sx, sz, bottom + PROBE_UP_M, unit.isOwn);
        if (!hit) continue;
        const gap = bottom - hit.y;
        if (gap < minGap) { minGap = gap; nearest = hit; }
        if (gap > maxGap) { maxGap = gap; clearest = hit; }
      }
      if (maxGap !== -Infinity && maxGap < -BURIED_M) {
        fail('BURIED', unit.name, `bottom sits ${round2(-maxGap)} m under "${label(clearest.mesh)}" at its clearest point`, [cx, bottom, cz]);
      } else if (minGap > FLOAT_GAP_M) {
        // the down-ray may have started under a surface — probe from above
        // the unit before calling it a float
        const above = cast.down(cx, cz, box.max.y + 0.5, unit.isOwn);
        const buriedUnder = above && above.y > bottom + BURIED_M;
        if (buriedUnder) fail('BURIED', unit.name, `bottom sits ${round2(above.y - bottom)} m under "${label(above.mesh)}"`, [cx, bottom, cz]);
        else if (minGap === Infinity) fail('FLOAT', unit.name, 'no support surface found below any probe point', [cx, bottom, cz]);
        else fail('FLOAT', unit.name, `hovers ${round2(minGap)} m above "${label(nearest.mesh)}" (limit ${FLOAT_GAP_M})`, [cx, bottom, cz]);
      }
    }

    /* overlap — tagged units only: an island cluster's AABB (often
     * L-shaped in plan) overstates it so badly that cluster pairs flag
     * bbox artifacts, not interpenetration */
    const inter = new THREE.Box3();
    const size = new THREE.Vector3();
    const volume = (box) => { box.getSize(size); return size.x * size.y * size.z; };
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        const a = units[i];
        const b = units[j];
        if (!a.tagged || !b.tagged) continue;
        if (!a.box.intersectsBox(b.box)) continue;
        const overlap = volume(inter.copy(a.box).intersect(b.box));
        const smaller = Math.min(volume(a.box), volume(b.box));
        if (smaller > 1e-6 && overlap > OVERLAP_FRAC * smaller) {
          fail('OVERLAP', `${a.name} × ${b.name}`,
            `bboxes share ${round2(overlap)} m³ — ${Math.round((overlap / smaller) * 100)} % of the smaller unit (limit ${OVERLAP_FRAC * 100} %)`,
            boxCentre(inter.copy(a.box).intersect(b.box)));
        }
      }
    }

    /* unexplained masses: bare blocks with no identity and an exposed top */
    const topSamples = (box) => {
      const ix = Math.min(CORNER_INSET_M, (box.max.x - box.min.x) / 4);
      const iz = Math.min(CORNER_INSET_M, (box.max.z - box.min.z) / 4);
      return [
        [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2],
        [box.min.x + ix, box.min.z + iz], [box.max.x - ix, box.min.z + iz],
        [box.min.x + ix, box.max.z - iz], [box.max.x - ix, box.max.z - iz],
      ];
    };
    const massCheck = (box, vol, isOwn, name) => {
      const s = box.getSize(new THREE.Vector3());
      if (s.y < MASS_MIN_H_M) return;
      if (!(vol > MASS_MIN_VOL_M3 || s.x * s.z > MASS_MIN_FOOT_M2)) return;
      const bboxVol = s.x * s.y * s.z;
      if (bboxVol < 1e-6 || vol / bboxVol < MASS_SOLIDITY) return; // wedges and shells are not blocks
      let exposed = 0;
      for (const [px, pz] of topSamples(box)) {
        const hit = cast.down(px, pz, box.max.y + 0.25, isOwn);
        if (!hit || hit.y < box.max.y - MASS_COVER_M) exposed += 1;
      }
      if (exposed === 0) return; // something is seated on / laid over it: explained
      warn('UNEXPLAINED-MASS', name,
        `bare ${round2(s.x)}×${round2(s.y)}×${round2(s.z)} m block, top exposed at ${exposed}/5 points with nothing seated on it — may be legitimate, but decide it`,
        boxCentre(box));
    };
    for (const island of massCandidates) {
      const c = island.box.getCenter(new THREE.Vector3());
      massCheck(island.box, island.vol, (mesh, face) => mesh === island.mesh && island.faces.has(face),
        `${label(island.mesh)} island @ (${round2(c.x)}, ${round2(c.z)})`);
    }
    scene.traverse((mesh) => { // anonymous loose meshes outside every set and tag
      if (!mesh.isMesh || auditedMeshes.has(mesh) || hasIdentity(mesh)) return;
      for (const unit of units) if (unit.tagged && unit.isOwn(mesh)) return;
      const box = new THREE.Box3().setFromObject(mesh);
      if (!box.isEmpty()) massCheck(box, volumeOfMesh(mesh), (m) => m === mesh, `unnamed ${mesh.geometry.type} @ (${boxCentre(box).join(', ')})`);
    });

    /* embedded scatter: parity-sample small islands against support solids.
     * Fraction is of the island's own volume — only sample points that land
     * inside its own geometry count (a cone fills a quarter of its bbox),
     * and support parity only consults CLOSED meshes outside the unit sets
     * (terrain and banks included; an open roof sheet would poison it). */
    // faces of OPEN islands in support meshes are excluded from parity;
    // computed only when an embed pass will actually run
    const openSupportFaces = new Map(); // mesh -> Set(face)
    if (embedCandidates.length) {
      scene.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.geometry?.attributes?.position || unitMeshes.has(mesh)) return;
        const bad = new Set();
        for (const island of meshIslands(mesh)) {
          if (!islandIsClosed(island)) for (const face of island.faces) bad.add(face);
        }
        if (bad.size) openSupportFaces.set(mesh, bad);
      });
    }
    const closedSupport = (mesh, face) => !unitMeshes.has(mesh) && !(openSupportFaces.get(mesh)?.has(face) ?? false);
    // asymmetric fractions: a 0.5 sample column lies exactly on a cone's
    // axis, where every base-fan triangle shares the centre vertex and the
    // crossing count degenerates to even — never sample on symmetry lines
    const F = [0.23, 0.52, 0.81];
    const EMBED_MIN_OWN = 5; // fewer own-volume samples than this is unsampleable, not clean
    for (const island of embedCandidates) {
      const b = island.box;
      const s = b.getSize(new THREE.Vector3());
      if (s.x * s.y * s.z > EMBED_MAX_VOL_M3) continue;
      const isOwnFace = (mesh, face) => mesh === island.mesh && island.faces.has(face);
      let insideOwn = 0;
      let insideBoth = 0;
      for (const fx of F) {
        for (const fy of F) {
          for (const fz of F) {
            const px = b.min.x + s.x * fx;
            const py = b.min.y + s.y * fy;
            const pz = b.min.z + s.z * fz;
            if (cast.crossingsBelow(px, pz, py, isOwnFace) % 2 !== 1) continue;
            insideOwn += 1;
            if (cast.crossingsBelow(px, pz, py, closedSupport) % 2 === 1) insideBoth += 1;
          }
        }
      }
      if (insideOwn < EMBED_MIN_OWN) continue; // too thin to sample meaningfully
      const frac = insideBoth / insideOwn;
      if (frac > EMBED_FRAC) {
        const c = b.getCenter(new THREE.Vector3());
        warn('EMBEDDED', `${label(island.mesh)} island @ (${round2(c.x)}, ${round2(c.z)})`,
          `~${Math.round(frac * 100)} % of its volume (${round2(s.x)}×${round2(s.y)}×${round2(s.z)} m) is inside support geometry (a bank or mass face)`,
          boxCentre(b));
      }
    }

    /* ground seams over the walkable footprint */
    let samples = 0;
    let skipped = 0;
    if (footprint) {
      const rect = footprint.width !== undefined
        ? { x0: -footprint.width / 2, x1: footprint.width / 2, z0: -footprint.depth / 2, z1: footprint.depth / 2 }
        : footprint;
      const marks = [];
      for (let x = rect.x0 + GRID_M / 2; x < rect.x1; x += GRID_M) {
        for (let z = rect.z0 + GRID_M / 2; z < rect.z1; z += GRID_M) {
          if (colliders.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)) { skipped += 1; continue; }
          samples += 1;
          const hit = cast.down(x, z, SEAM_FROM_Y);
          if (!hit || hit.y < HOLE_FLOOR_Y) {
            marks.push({ type: 'HOLE', x, z, detail: hit ? `first surface at y ${round2(hit.y)}` : 'no surface at all' });
          } else if (groundAt) {
            const claimed = groundAt(x, z);
            if (hit.y < claimed - SEAM_DROP_M) {
              marks.push({ type: 'SEAM', x, z, detail: `walkable height ${round2(claimed)} but first surface at y ${round2(hit.y)} ("${label(hit.mesh)}")` });
            }
          }
        }
      }
      // adjacent flagged samples are one defect: merge into patches
      const uf = new UnionFind(marks.length);
      for (let i = 0; i < marks.length; i += 1) {
        for (let j = i + 1; j < marks.length; j += 1) {
          if (marks[i].type === marks[j].type &&
              Math.abs(marks[i].x - marks[j].x) <= GRID_M * 1.01 &&
              Math.abs(marks[i].z - marks[j].z) <= GRID_M * 1.01) uf.union(i, j);
        }
      }
      const patches = new Map();
      marks.forEach((mark, i) => {
        const root = uf.find(i);
        if (!patches.has(root)) patches.set(root, []);
        patches.get(root).push(mark);
      });
      for (const patch of patches.values()) {
        const xs = patch.map((m) => m.x);
        const zs = patch.map((m) => m.z);
        fail(patch[0].type, 'ground',
          `${patch.length} sample${patch.length === 1 ? '' : 's'} over x ${round2(Math.min(...xs))}..${round2(Math.max(...xs))}, z ${round2(Math.min(...zs))}..${round2(Math.max(...zs))} — e.g. ${patch[0].detail}`,
          [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2]);
      }
    }

    const stats = {
      units: units.length,
      tagged: taggedCount,
      clusters: units.length - taggedCount,
      runs: runCount,
      triangles: cast.triangles,
      seamSamples: samples,
      seamSkippedInColliders: skipped,
      warnings: warnings.length,
    };
    const header = `spatial audit: ${stats.units} units (${stats.tagged} tagged, ${stats.clusters} pooled clusters, ${stats.runs} runs), ${stats.triangles} triangles, ${stats.seamSamples} seam samples (${stats.seamSkippedInColliders} inside colliders skipped)`;
    const lines = [header];
    for (const f of failures) lines.push(`FAIL ${f.type} ${f.object}\n  - ${f.detail} @ [${f.position.join(', ')}]`);
    for (const w of warnings) lines.push(`WARN ${w.type} ${w.object}\n  - ${w.detail} @ [${w.position.join(', ')}]`);
    if (!failures.length) lines.push(`PASS — every unit grounded, no interpenetration, no ground holes${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'} above for the builder to decide)` : ''}`);
    return { ok: failures.length === 0, failures, warnings, stats, report: lines.join('\n') };
  }

  return { checkSpatial };
}
