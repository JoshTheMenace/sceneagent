#!/usr/bin/env node
/**
 * Headless spatial audit: builds the vignette in Node (vertical-ray math
 * needs no WebGL) and runs the same checkSpatial() the page exposes as
 * window.__vignette.checkSpatial.
 *
 *   node scripts/check-spatial.mjs   # exit 0 pass · 1 defects found · 2 crashed
 *
 * Both this and the in-page call run src/core/spatialcheck.js against the
 * scene src/scene.js builds, so they agree by construction.
 */

// Canvas2D no-op stub: geometry never depends on what a canvas contains, so
// generated textures can "draw" into nothing when a scene adds them.
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

try {
  const THREE = await import('three');
  const { buildVignette } = await import('../src/scene.js');
  const { createSpatialCheck } = await import('../src/core/spatialcheck.js');

  const scene = new THREE.Scene();
  const vignette = buildVignette(scene);
  scene.updateMatrixWorld(true);

  const { checkSpatial } = createSpatialCheck({
    scene,
    groundAt: vignette.groundAt,
    colliders: vignette.colliders,
    footprint: vignette.footprint,
    islandSets: vignette.auditIslands,
    linearSets: vignette.auditLinear,
  });

  const result = checkSpatial();
  console.log(result.report);
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error('[check-spatial] crashed before auditing:', error);
  process.exit(2);
}
