import * as THREE from 'three';

const cache = new Map();

/**
 * Draw-once canvas texture helper. All scene textures are generated with this
 * (signs, plaster, windows, surface grime) — no external image assets.
 */
export function canvasTexture(key, draw, width = 512, height = 256) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

/** Neutral vertical sky gradient used as background and environment. */
export function skyTexture(top = '#c9ced4', horizon = '#b8bec6', bottom = '#a9adb3') {
  const texture = canvasTexture(`sky-${top}-${horizon}-${bottom}`, (ctx, width, height) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, top);
    sky.addColorStop(0.55, horizon);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
  }, 1024, 512);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
