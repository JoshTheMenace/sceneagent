#!/usr/bin/env node
/**
 * Headless camera-legibility gate: builds the vignette in Node (raycasting
 * needs no WebGL) and runs the same checkAllCameras() the page exposes.
 *
 *   node scripts/check-cameras.mjs        # exit 0 on pass, 1 on any failure
 *
 * The in-page version (window.__vignette.checkAllCameras()) is the one to
 * use while iterating with the dev server; this script is for CI-style
 * verification and for scenes whose page is awkward to automate.  Both run
 * src/core/camcheck.js against the scene src/scene.js builds, so they agree
 * by construction.
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

const THREE = await import('three');
const { buildVignette } = await import('../src/scene.js');
const { createCameraCheck } = await import('../src/core/camcheck.js');

const scene = new THREE.Scene();
const vignette = buildVignette(scene);
scene.updateMatrixWorld(true);

const { checkAllCameras } = createCameraCheck({
  scene,
  cameras: vignette.reviewCameras,
  colliders: vignette.colliders,
  footprintHeight: vignette.footprintHeight,
});

const result = checkAllCameras();
console.log(result.report);
process.exit(result.ok ? 0 : 1);
