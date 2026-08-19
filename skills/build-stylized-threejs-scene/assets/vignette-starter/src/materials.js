/**
 * Compatibility shim. The material system lives in src/core/toon.js (the
 * flagship's cel/flat factories, ported verbatim) and outlines live in
 * src/core/outline.js — import those directly in new code. This file only
 * keeps the starter's original call signatures working: `cel(color, opts)`
 * here versus `cel({ color, ...opts })` in core. ONE implementation.
 */
import { cel as celCore, flat as flatCore } from './core/toon.js';
import { hullOutline } from './core/outline.js';

export { gradientMap, shadowTintActive } from './core/toon.js';

/** Cel-shaded toon material; the default for almost everything. */
export function cel(color, options = {}) {
  return celCore({ color, ...options });
}

/** Unlit flat material for skies, backdrops, and glow cards. */
export function flat(color, options = {}) {
  return flatCore({ color, ...options });
}

/**
 * Heavier deliberate contour for hero props (the screen-space ink pass
 * already outlines everything). Kept under the old name; new code should
 * call hullOutline / hullOutlineTree from core/outline.js directly.
 */
export function addInk(mesh, options = {}) {
  hullOutline(mesh, options);
  return mesh;
}
