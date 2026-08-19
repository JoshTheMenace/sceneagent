import * as THREE from 'three';
// Placeholder cameras only. Once the real contract is written, save it as
// scene-contract.json and point this import at it.
import contract from '../scene-contract.template.json' with { type: 'json' };
import { box, createBuilder } from './builders.js';
import { cel } from './core/toon.js';
import { PAL } from './palette.js';

/**
 * Grey-box placeholder scene: a ground plane, one primary mass, one accent
 * object. Replace all of it with the real vignette — it exists only to prove
 * the loop (render, movement, collision, interaction, review cameras, __shot,
 * checkAllCameras) before any art goes in.
 */

// The template's `subject` fields are placeholder text (the validator rejects
// them unedited).  The grey-box supplies its own so the camera gate is
// exercised from birth; a real scene writes real subjects into its contract.
const GREYBOX_SUBJECTS = {
  arrival: 'primary-mass',
  context: 'primary-mass',
  detail: 'accent-object',
  reverse: 'primary-mass',
};

export function buildVignette(scene) {
  const root = new THREE.Group();
  root.name = 'vignette';
  scene.add(root);
  const ctx = createBuilder(root);

  ctx.add(box(40, 0.4, 40, cel({ color: PAL.groundMid }), 0, -0.2, 0), 'ground');
  // userData.prop marks a spatial-audit unit (see core/spatialcheck.js):
  // every standing assembly gets it; ground/terrain never does.
  const primary = ctx.add(box(6, 4, 5, cel({ color: PAL.primary }), 0, 2, -6, true), 'primary-mass');
  primary.userData.prop = true;
  const accentMaterial = cel({ color: PAL.accent, emissive: PAL.accent, emissiveIntensity: 0, cache: false });
  const accent = ctx.add(box(0.8, 1.4, 0.8, accentMaterial, 3.4, 0.7, -2, true), 'accent-object');
  accent.userData.prop = true;

  // One placeholder interaction so the E-key loop is exercised from birth.
  let lit = false;
  ctx.interact({
    name: 'accent-object',
    hitbox: accent,
    label: 'E · toggle the accent',
    action() {
      lit = !lit;
      accentMaterial.emissiveIntensity = lit ? 0.8 : 0;
    },
  });
  ctx.reset(() => {
    lit = false;
    accentMaterial.emissiveIntensity = 0;
  });

  // Walls at the footprint edge, plus the two placeholder objects.
  ctx.collide(-20, -20, 20, -19.5);
  ctx.collide(-20, 19.5, 20, 20);
  ctx.collide(-20, -20, -19.5, 20);
  ctx.collide(19.5, -20, 20, 20);
  ctx.collide(-3, -8.5, 3, -3.5);
  ctx.collide(3, -2.4, 3.8, -1.6);

  return {
    root,
    colliders: ctx.colliders,
    interactables: ctx.interactables,
    update: (dt) => ctx.step(dt),
    reset: () => ctx.resetAll(),
    state: () => ({ accentLit: lit }),
    diagnostics: (renderer) => ctx.diagnostics(renderer),
    footprintHeight: contract.footprint_m.height,
    footprint: contract.footprint_m, // spatial-audit seam grid covers this
    reviewCameras: Object.fromEntries(contract.review_cameras.map((view) => [
      view.name,
      { ...view, subject: GREYBOX_SUBJECTS[view.name] ?? view.subject },
    ])),
  };
}
