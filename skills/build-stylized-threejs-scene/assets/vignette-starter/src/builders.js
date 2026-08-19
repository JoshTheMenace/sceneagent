import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInk } from './materials.js';

/* ---- builder context -----------------------------------------------------
 * One ctx per scene: collects meshes, colliders, interactables, per-frame
 * updaters, and reset handlers, and reports diagnostics. Pass it to every
 * build function instead of touching the scene graph directly.
 */
export function createBuilder(root) {
  const colliders = [];
  const interactables = [];
  const platforms = [];
  const updaters = [];
  const resets = [];

  return {
    root,
    colliders,
    interactables,
    platforms,
    add(object, name) {
      if (name) object.name = name;
      root.add(object);
      return object;
    },
    collide(x0, z0, x1, z1) {
      colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
    },
    /** A walkable raised surface: axis-aligned box top at height `top`. */
    platform(x0, z0, x1, z1, top) {
      platforms.push({
        x0: Math.min(x0, x1), z0: Math.min(z0, z1),
        x1: Math.max(x0, x1), z1: Math.max(z0, z1), top,
      });
    },
    /**
     * Ground height at (x, z): the max over registered platforms, else 0.
     * The test is inclusive on all four edges — treads that merely *meet*
     * would otherwise be a knife edge a grid sampler falls through.
     */
    groundAt(x, z) {
      let y = 0;
      for (const p of platforms) {
        if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > y) y = p.top;
      }
      return y;
    },
    interact(entry) {
      interactables.push(entry);
      return entry;
    },
    update(step) {
      updaters.push(step);
    },
    reset(step) {
      resets.push(step);
    },
    step(dt) {
      for (const update of updaters) update(dt);
    },
    resetAll() {
      for (const reset of resets) reset();
    },
    diagnostics(renderer) {
      let meshes = 0;
      let triangles = 0;
      const materials = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        meshes += 1;
        const geometry = object.geometry;
        triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      });
      return {
        meshes,
        triangles,
        materials: materials.size,
        renderer: {
          calls: renderer.info.render.calls,
          lines: renderer.info.render.lines,
          points: renderer.info.render.points,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
      };
    },
  };
}

/* ---- geometry helpers --------------------------------------------------- */

const boxGeometries = new Map();

function boxGeometry(width, height, depth) {
  const key = `${width}:${height}:${depth}`;
  if (!boxGeometries.has(key)) boxGeometries.set(key, new THREE.BoxGeometry(width, height, depth));
  return boxGeometries.get(key);
}

export function box(width, height, depth, material, x = 0, y = 0, z = 0, ink = false) {
  const mesh = new THREE.Mesh(boxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = height > 0.3 && width * height * depth > 0.25;
  mesh.receiveShadow = true;
  return ink ? addInk(mesh) : mesh;
}

/** Merge many `[w, h, d, x, y, z, ry?]` boxes into one mesh (one draw call). */
export function mergedBoxes(specs, material) {
  const geometries = specs.map(([width, height, depth, x, y, z, rotation = 0]) => {
    const geometry = boxGeometry(width, height, depth).clone();
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
    geometry.translate(x, y, z);
    return geometry;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((geometry) => geometry.dispose());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A cylinder member spanning two joints. Build assemblies from joints, not
 * from part positions: a shared end is then shared by construction.
 */
export function tubeBetween(start, end, radius, material) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 7), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.receiveShadow = true;
  return mesh;
}

/* ---- architecture kit ----------------------------------------------------
 * Roof planes, stairs and terrain banks are NEVER hand-placed with guessed
 * rotations. Every part below is derived from shared joints and dimensions,
 * so misalignment is impossible by construction. Hand-placing these is the
 * single most common source of broken geometry in agent-built scenes:
 * floating roof planes, ridge caps at the wrong angle, knife-edge treads,
 * missing-ground gaps at terrace banks.
 */

/** Clone the cached box geometry, rotate about one axis, translate. */
function partGeometry(width, height, depth, axis, angle, x, y, z, yaw = 0) {
  const geometry = boxGeometry(width, height, depth).clone();
  if (angle) {
    const m = new THREE.Matrix4();
    if (axis === 'x') m.makeRotationX(angle);
    else if (axis === 'z') m.makeRotationZ(angle);
    else m.makeRotationY(angle);
    geometry.applyMatrix4(m);
  }
  geometry.translate(x, y, z);
  if (yaw) geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
  return geometry;
}

function meshFrom(geometries, material) {
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((geometry) => geometry.dispose());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Gable roof over a `w` (x) by `d` (z) wall footprint. Origin is the CENTER
 * OF THE WALL TOP: place the returned group at (cx, wallTopY, cz) and you
 * are done — every plane, the ridge cap and the trim are derived from the
 * ridge line and the eave lines, never positioned by eye.
 *
 * Derivation (all in the section across the ridge):
 *   halfSpan = span/2 + overhang          // span = footprint across the ridge
 *   rise     = tan(pitch) * halfSpan      // eave-to-ridge height
 *   slopeLen = hypot(halfSpan, rise)      // length of one roof plane
 *   slope    = atan2(rise, halfSpan)      // === pitch, but derived, not copied
 * The plane mid-surface crosses y = 0 exactly at the wall line (±span/2), so
 * the wall top edge sits embedded mid-thickness in the roof: no gap, no
 * poke-through. Ridge joint: (0, ridgeY = tan(pitch)*span/2). Eave joint:
 * (±halfSpan, ridgeY − rise) — i.e. the overhang droops tan(pitch)*overhang
 * BELOW the wall top, as a real eave does.
 * Each plane is a box (ridgeLen × thickness × slopeLen) centered on the
 * MIDPOINT of its ridge and eave joints and rotated s·slope about the ridge
 * axis (a box along z rotated +t about X sends its +z end DOWN, so the side
 * whose eave is at +z gets +slope). Rotating slopeLen about the joint
 * midpoint lands both box edges exactly on the two joints.
 *
 * Returns a group with `userData = { ridgeY, eaveY, rise, slopeLen }`; build
 * the gable-end wall (prism/steps) up to `ridgeY` so it too embeds
 * mid-thickness.
 *
 * @example
 *   const roof = gableRoof({ w: 6, d: 5, pitch: 0.61, mat: roofMat, ridgeMat: trimMat });
 *   roof.position.set(10, 3, -4);          // wall-top center of a 6x3x5 house
 *   ctx.add(roof, 'house-roof');           // roof.userData.ridgeY -> gable apex
 */
export function gableRoof({ w, d, pitch, overhang = 0.35, thickness = 0.12, ridgeAxis = 'x', mat, ridgeMat, trimMat }) {
  const along = ridgeAxis === 'x' ? w : d;      // footprint length along the ridge
  const span = ridgeAxis === 'x' ? d : w;       // footprint across the ridge
  const halfSpan = span / 2 + overhang;
  const rise = Math.tan(pitch) * halfSpan;
  const slopeLen = Math.hypot(halfSpan, rise);
  const slope = Math.atan2(rise, halfSpan);
  const ridgeY = Math.tan(pitch) * (span / 2);  // wall line crosses mid-surface at y=0
  const eaveY = ridgeY - rise;
  const ridgeLen = along + 2 * overhang;
  const yaw = ridgeAxis === 'z' ? Math.PI / 2 : 0;

  const planes = [];
  for (const s of [-1, 1]) {
    // plane center = midpoint of ridge joint (0, ridgeY) and eave joint (s*halfSpan, eaveY)
    planes.push(partGeometry(ridgeLen, thickness, slopeLen, 'x', s * slope, 0, (ridgeY + eaveY) / 2, (s * halfSpan) / 2, yaw));
  }
  if (trimMat) {
    // Bargeboards: same joints, same derived rotation, at the two gable ends.
    for (const e of [-1, 1]) {
      for (const s of [-1, 1]) {
        planes.push(partGeometry(0.055, thickness * 1.6, slopeLen + 0.02, 'x', s * slope,
          e * (ridgeLen / 2 + 0.028), (ridgeY + eaveY) / 2 - thickness * 0.15, (s * halfSpan) / 2, yaw));
      }
    }
  }

  const group = new THREE.Group();
  group.add(meshFrom(planes, mat));
  // Ridge cap: axis-aligned along the ridge, seated where the two top faces
  // cross the ridge plane: ridgeY + (thickness/2)/cos(slope).
  const capW = Math.max(0.2, thickness * 2.6);
  const capY = ridgeY + (thickness / 2) / Math.cos(slope);
  group.add(meshFrom([partGeometry(ridgeLen + 0.02, thickness, capW, 'x', 0, 0, capY, 0, yaw)], ridgeMat ?? mat));
  group.userData = { ridgeY, eaveY, rise, slopeLen };
  return group;
}

/**
 * Single-plane shed roof, same joint discipline as gableRoof. Origin at the
 * MID wall-top center: the plane mid-surface crosses y = 0 at the footprint
 * center, so the high wall must top out at `userData.highWallY`
 * (= tan(pitch)*span/2) and the low wall at `userData.lowWallY` — read them,
 * do not re-derive by hand. `downhill` is the direction the roof falls:
 * 'z+', 'z-', 'x+' or 'x-'.
 *
 * @example
 *   const roof = shedRoof({ w: 3, d: 2.5, pitch: 0.26, downhill: 'x+', mat });
 *   roof.position.set(0, 2.2, 0);                 // mid wall-top height
 *   // walls: high side to 2.2 + roof.userData.highWallY, low to 2.2 + lowWallY
 */
export function shedRoof({ w, d, pitch, overhang = 0.35, thickness = 0.12, downhill = 'z+', mat }) {
  const alongZ = downhill[0] === 'z';
  const span = alongZ ? d : w;
  const across = alongZ ? w : d;
  const dir = downhill[1] === '+' ? 1 : -1;
  // A shed plane spans the FULL footprint plus both overhangs — the gable
  // half-span derivation covers only half the walls (verified by raycast).
  const fullSpan = span + 2 * overhang;
  const rise = Math.tan(pitch) * fullSpan;
  const slopeLen = Math.hypot(fullSpan, rise);
  const slope = Math.atan2(rise, fullSpan);
  // Build falling toward +z (rx = +slope sends the +z end down), then yaw
  // into place: rotateY(+PI/2) maps +z to +x, rotateY(PI) maps +z to -z.
  const yaw = alongZ ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
  const group = new THREE.Group();
  group.add(meshFrom([partGeometry(across + 2 * overhang, thickness, slopeLen, 'x', slope, 0, 0, 0, yaw)], mat));
  group.userData = {
    rise,
    slopeLen,
    highWallY: Math.tan(pitch) * (span / 2),
    lowWallY: -Math.tan(pitch) * (span / 2),
  };
  return group;
}

/**
 * A straight flight of stairs, authored IN WORLD COORDINATES (no rotated
 * group — the walkable registrations must stay axis-aligned). `at` is the
 * ground-level center of the flight's bottom edge; `dir` is the direction of
 * climb ('z-', 'z+', 'x+', 'x-'). Each tread is a solid block from the
 * ground to its own top, and consecutive treads OVERLAP by 40 mm — treads
 * that merely meet are a knife edge that height queries fall through. The
 * top tread overlaps 40 mm into the landing for the same reason: make the
 * landing platform/terrace start at or before the flight's far edge.
 *
 * With `ctx` passed, one `ctx.platform(...)` is registered per tread, so
 * `ctx.groundAt` can walk the flight. Returns the mesh, with
 * `userData = { topY, topEdge }` (topEdge = along-axis coordinate of the far
 * edge, overlap included).
 *
 * @example
 *   stairs({ w: 2, rise: 0.18, run: 0.3, steps: 6, dir: 'z-', at: [4, 0, 2], mat, ctx });
 */
export function stairs({ w, rise, run, steps, dir = 'z-', at = [0, 0, 0], mat, ctx }) {
  const PAD = 0.04; // flagship rule: treads overlap, never meet
  const [ax, ay, az] = at;
  const alongZ = dir[0] === 'z';
  const sign = dir[1] === '+' ? 1 : -1;
  const specs = [];
  for (let i = 0; i < steps; i += 1) {
    const a0 = i * run;
    const a1 = (i + 1) * run + PAD;
    const top = ay + (i + 1) * rise;
    const mid = (a0 + a1) / 2;
    const cx = alongZ ? ax : ax + sign * mid;
    const cz = alongZ ? az + sign * mid : az;
    const h = top - ay;
    specs.push([alongZ ? w : a1 - a0, h, alongZ ? a1 - a0 : w, cx, ay + h / 2, cz]);
    if (ctx) {
      const x0 = alongZ ? ax - w / 2 : ax + sign * a0;
      const x1 = alongZ ? ax + w / 2 : ax + sign * a1;
      const z0 = alongZ ? az + sign * a0 : az - w / 2;
      const z1 = alongZ ? az + sign * a1 : az + w / 2;
      ctx.platform(x0, z0, x1, z1, top);
    }
  }
  const mesh = mergedBoxes(specs, mat);
  mesh.castShadow = true;
  mesh.userData = { topY: ay + steps * rise, topEdge: steps * run + PAD };
  return mesh;
}

/**
 * A closed terrain wedge whose TOP FACE exactly spans `from` -> `to` (both
 * [x, y, z]) at width `w` — for terrace banks and ramps. Sides, end caps and
 * bottom are all closed down to min(y) − skirt, so no missing-ground gap can
 * appear at any viewing angle. Face winding is derived from the centroid, so
 * it cannot be built inside-out. Authored in world coordinates.
 *
 * @example
 *   bankWedge({ from: [8, 1.5, -2], to: [8, 0, 4], w: 5, mat: earthMat });
 */
export function bankWedge({ from, to, w, mat, skirt = 0.15 }) {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  const dx = tx - fx;
  const dz = tz - fz;
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * (w / 2);
  const pz = (dx / len) * (w / 2);
  const base = Math.min(fy, ty) - skirt;

  const A1 = [fx + px, fy, fz + pz];
  const A2 = [fx - px, fy, fz - pz];
  const B1 = [tx + px, ty, tz + pz];
  const B2 = [tx - px, ty, tz - pz];
  const dn = (v) => [v[0], base, v[2]];
  const centroid = [(fx + tx) / 2, (base + Math.max(fy, ty)) / 2, (fz + tz) / 2];

  const positions = [];
  // Push one quad as two triangles, winding chosen so the normal points away
  // from the centroid — the flagship's quadTo rule: derive, never hand-wind.
  const quad = (a, b, c, d) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [a[0] - centroid[0], a[1] - centroid[1], a[2] - centroid[2]];
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    const tris = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of tris) positions.push(p[0], p[1], p[2]);
  };
  quad(A1, B1, B2, A2);                         // top
  quad(dn(A1), dn(A2), dn(B2), dn(B1));         // bottom
  quad(A1, dn(A1), dn(B1), B1);                 // side +
  quad(A2, B2, dn(B2), dn(A2));                 // side -
  quad(A1, A2, dn(A2), dn(A1));                 // cap at `from`
  quad(B1, dn(B1), dn(B2), B2);                 // cap at `to`

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); // non-indexed: per-face normals, which a wedge wants
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Seat an object on the ground by QUERY, not by eye: every scattered prop
 * (bushes, rocks, crates, barrels) goes through this — a prop seated from a
 * remembered ground height floats the moment the terrain under it changes.
 * Samples `groundAt(x, z)` at the object's origin and sinks it `sink` into
 * the surface so no hairline gap shows. With `maxSlope` set, the local slope
 * is measured (±0.3 m in both axes) and the function returns false WITHOUT
 * placing when the ground is too steep — skip that spot rather than leave a
 * prop hanging off a bank on one corner.
 *
 * @example
 *   const bush = makeBush();
 *   bush.position.set(x, 0, z);
 *   if (seatOnGround(bush, ctx.groundAt, { maxSlope: 0.5 })) ctx.add(bush);
 */
export function seatOnGround(obj, groundAt, { sink = 0.02, maxSlope } = {}) {
  const { x, z } = obj.position;
  if (maxSlope !== undefined) {
    const slope = Math.hypot(
      (groundAt(x + 0.3, z) - groundAt(x - 0.3, z)) / 0.6,
      (groundAt(x, z + 0.3) - groundAt(x, z - 0.3)) / 0.6,
    );
    if (slope > maxSlope) return false;
  }
  obj.position.y = groundAt(x, z) - sink;
  return true;
}
