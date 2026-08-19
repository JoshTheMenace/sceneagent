import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Camera-legibility gate.
 *
 * The most-repeated failure in scene reviews is a review camera that does
 * not show its subject: inside a wall, behind a mass, or aimed at the back
 * of the thing its comment names.  A wrong camera does not look wrong -- it
 * returns a perfectly composed frame of something else -- so this is a
 * check, not a convention.  Three tests per camera:
 *
 *   (a) the camera position is not inside any registered collider;
 *   (b) a ray from the camera to its declared `subject` (an Object3D name
 *       from the contract) first hits that subject's own subtree, or lands
 *       within 0.5 m of its bounding box;
 *   (c) a 5x3 grid of rays through the frustum: if more than a third hit
 *       geometry within 1.2 m, the frame is blocked at the near plane.
 *
 * Pure three.js math, no WebGL: runs in-page (window.__vignette.checkCamera)
 * and headless in Node (scripts/check-cameras.mjs).
 * ------------------------------------------------------------------ */

// matches the contract template's unedited prompt text, same rule as
// validate_scene_contract.py
const PLACEHOLDER = /^\s*(replace|describe|define|name the)\b/i;

const GRID_X = [-1, -0.5, 0, 0.5, 1];
const GRID_Y = [-0.66, 0, 0.66];
const NEAR_BLOCK_M = 1.2;
const SUBJECT_SLACK_M = 0.5;

export function createCameraCheck({ scene, cameras, colliders = [], footprintHeight = Infinity, aspect = 16 / 9 }) {
  const probe = new THREE.PerspectiveCamera(52, aspect, 0.05, 500);

  function firstHit(raycaster) {
    return raycaster.intersectObject(scene, true).find((h) => h.distance > 1e-4) ?? null;
  }

  function inSubtree(object, root) {
    for (let o = object; o; o = o.parent) if (o === root) return true;
    return false;
  }

  function label(object) {
    for (let o = object; o; o = o.parent) if (o.name) return o.name;
    return object.type;
  }

  function checkCamera(name) {
    const view = cameras[name];
    if (!view) {
      return { name, ok: false, failures: [`no review camera named "${name}" — have: ${Object.keys(cameras).join(', ')}`] };
    }
    const failures = [];
    const pos = new THREE.Vector3().fromArray(view.position);
    const target = new THREE.Vector3().fromArray(view.target);
    probe.fov = view.fov ?? 52;
    probe.position.copy(pos);
    probe.lookAt(target);
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);

    // (a) inside a collider.  Colliders are XZ rects with no height, so a
    // deliberate overhead camera above the contract footprint is exempt.
    for (const c of colliders) {
      if (pos.x > c.x0 && pos.x < c.x1 && pos.z > c.z0 && pos.z < c.z1 && pos.y < (c.top ?? footprintHeight)) {
        failures.push(`camera position [${view.position.join(', ')}] is inside collider x ${c.x0}..${c.x1} z ${c.z0}..${c.z1} — move it outside the mass`);
        break;
      }
    }

    // (b) the ray to the declared subject
    if (!view.subject || !String(view.subject).trim()) {
      failures.push('no `subject` declared — every review camera must name the scene object it exists to show');
    } else if (PLACEHOLDER.test(view.subject)) {
      failures.push(`subject is still the template's placeholder text ("${view.subject}") — name a real Object3D`);
    } else {
      const subject = scene.getObjectByName(view.subject);
      if (!subject) {
        failures.push(`subject "${view.subject}" not found in the scene — check the object's .name`);
      } else {
        const box = new THREE.Box3().setFromObject(subject);
        const centre = box.getCenter(new THREE.Vector3());
        const dir = centre.clone().sub(pos);
        if (dir.lengthSq() < 1e-6) {
          failures.push(`camera sits exactly on subject "${view.subject}" — back it off`);
        } else {
          const hit = firstHit(new THREE.Raycaster(pos, dir.normalize()));
          if (!hit) {
            failures.push(`ray toward subject "${view.subject}" hit nothing — the subject may have no geometry along that line`);
          } else if (!inSubtree(hit.object, subject)) {
            const slack = box.clampPoint(hit.point, new THREE.Vector3()).distanceTo(hit.point);
            if (slack > SUBJECT_SLACK_M) {
              failures.push(`view of subject "${view.subject}" is blocked by "${label(hit.object)}" ${hit.distance.toFixed(2)} m from the camera (${slack.toFixed(2)} m short of the subject)`);
            }
          }
          // aim sanity: project the subject's centre into NDC — a subject the
          // ray can reach but the frustum does not contain is not in the frame
          const ndc = centre.clone().project(probe);
          if (ndc.z > 1) {
            failures.push(`subject "${view.subject}" is BEHIND the camera — it looks at [${view.target.join(', ')}], the subject centres at [${centre.toArray().map((v) => v.toFixed(1)).join(', ')}]`);
          } else if (Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) {
            failures.push(`subject "${view.subject}" is outside the camera's frame (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}) — the camera looks at [${view.target.join(', ')}], the subject centres at [${centre.toArray().map((v) => v.toFixed(1)).join(', ')}]`);
          }
        }
      }
    }

    // (c) near-plane obstruction across the frame
    let blocked = 0;
    const total = GRID_X.length * GRID_Y.length;
    const grid = new THREE.Raycaster();
    for (const gx of GRID_X) {
      for (const gy of GRID_Y) {
        grid.setFromCamera({ x: gx, y: gy }, probe);
        const hit = firstHit(grid);
        if (hit && hit.distance < NEAR_BLOCK_M) blocked += 1;
      }
    }
    if (blocked > total / 3) {
      failures.push(`${blocked}/${total} frustum rays hit geometry within ${NEAR_BLOCK_M} m — the frame is blocked at the near plane`);
    }

    return { name, ok: failures.length === 0, failures };
  }

  function checkAllCameras() {
    const results = Object.keys(cameras).map(checkCamera);
    const ok = results.every((r) => r.ok);
    return {
      ok,
      cameras: results,
      report: results
        .map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.failures.map((f) => `\n  - ${f}`).join('')}`)
        .join('\n'),
    };
  }

  return { checkCamera, checkAllCameras };
}
