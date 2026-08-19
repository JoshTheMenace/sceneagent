import * as THREE from 'three';
import { buildVignette } from './scene.js';
import { Walker } from './player.js';
import { PAL } from './palette.js';
import { Pipeline } from './core/post.js';
import { shadowTintActive } from './core/toon.js';
import { setOutlineResolution } from './core/outline.js';
import { createCameraCheck } from './core/camcheck.js';
import { createSpatialCheck } from './core/spatialcheck.js';
import { skyTexture } from './textures.js';
import './style.css';

/* ------------------------------------------------------------------ *
 * Entry point.  Rendering goes scene -> ink -> grade -> fxaa through the
 * Pipeline (see core/post.js); never call renderer.render directly or the
 * frame loses its line work and grade.
 *
 * Lighting is the classic two-light anime setup: one warm quantised key
 * for the sun, one cool bounce fill from the opposite side, and a
 * hemisphere with a violet ground colour so nothing in shadow ever goes
 * black.  The rig is data (RIG below): retune it there, not by scattering
 * light edits through the file.
 * ------------------------------------------------------------------ */

const canvas = document.querySelector('#view');
const prompt = document.querySelector('#prompt');
canvas.dataset.command = '';
canvas.dataset.commandResult = '';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // the grade pass owns the transfer function
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);
if (!shadowTintActive()) console.error('[main] cel shadow tint is OFF — see the [toon] error above');

const scene = new THREE.Scene();
scene.background = skyTexture(hex(PAL.sky.top), hex(PAL.sky.mid), hex(PAL.sky.haze));
scene.fog = new THREE.Fog(PAL.fog, 26, 100);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 110);
camera.rotation.order = 'YXZ';

function hex(value) { return '#' + value.toString(16).padStart(6, '0'); }

/* --------------------------------- light ---------------------------------
 * sun: the only shadow caster.  fill: cool, from the opposite quarter, and
 * deliberately strong — it carries most of the shadow side of every surface,
 * because an anime background has *coloured* shadows, not dark ones.
 * bounce: weak, from below-front, so undersides never go flat black.
 * hemi: violet ground colour for the same reason.
 */
const RIG = {
  sun: { color: PAL.sun, intensity: 2.0, position: [-14, 19, 13], shadows: 22 },
  fill: { color: PAL.fill, intensity: 0.9, position: [12, 8, -11] },
  bounce: { color: PAL.bounce, intensity: 0.3, position: [3, -5, 12] },
  hemi: { sky: PAL.hemiSky, ground: PAL.hemiGround, intensity: 1.0 },
};

const sun = new THREE.DirectionalLight(RIG.sun.color, RIG.sun.intensity);
sun.position.fromArray(RIG.sun.position);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const s = RIG.sun.shadows;
sun.shadow.camera.left = -s;
sun.shadow.camera.right = s;
sun.shadow.camera.top = s;
sun.shadow.camera.bottom = -s;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);

const fill = new THREE.DirectionalLight(RIG.fill.color, RIG.fill.intensity);
fill.position.fromArray(RIG.fill.position);
scene.add(fill, fill.target);

const bounce = new THREE.DirectionalLight(RIG.bounce.color, RIG.bounce.intensity);
bounce.position.fromArray(RIG.bounce.position);
scene.add(bounce, bounce.target);

const hemi = new THREE.HemisphereLight(RIG.hemi.sky, RIG.hemi.ground, RIG.hemi.intensity);
scene.add(hemi);

/* --------------------------------- world --------------------------------- */
const vignette = buildVignette(scene);
const player = new Walker(camera, canvas, vignette.colliders);

const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 30, fadeEnd: 80, skyDepth: 105 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

const camcheck = createCameraCheck({
  scene,
  cameras: vignette.reviewCameras,
  colliders: vignette.colliders,
  footprintHeight: vignette.footprintHeight,
});

const raycaster = new THREE.Raycaster();
raycaster.far = 3;
const hitboxes = vignette.interactables.map((entry) => entry.hitbox);
const reviewName = new URLSearchParams(location.search).get('review');
const reviewView = reviewName ? vignette.reviewCameras[reviewName] : null;
let hovered = null;
let promptText = '';

if (reviewView) {
  camera.position.fromArray(reviewView.position);
  camera.lookAt(new THREE.Vector3().fromArray(reviewView.target));
  camera.fov = reviewView.fov ?? 52;
  camera.updateProjectionMatrix();
  document.body.dataset.review = reviewName;
}

function setPrompt(value) {
  if (value === promptText) return;
  promptText = value;
  prompt.textContent = value;
}

function requestLock() {
  if (reviewView) return;
  canvas.focus();
  Promise.resolve(canvas.requestPointerLock()).catch(() => setPrompt('Pointer lock was blocked · focus the scene and press Enter to retry'));
}

function reset() {
  player.reset();
  vignette.reset();
}

canvas.addEventListener('click', requestLock);
window.addEventListener('keydown', (event) => {
  const keyboardActive = document.pointerLockElement === canvas || document.activeElement === canvas;
  if (event.code === 'KeyE' && keyboardActive) hovered?.action();
  if (event.code === 'KeyR') reset();
  if (keyboardActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if ((event.code === 'Enter' || event.code === 'Space') && document.activeElement === canvas && document.pointerLockElement !== canvas) {
    event.preventDefault();
    requestLock();
  }
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  pipeline.setSize(width, height);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let frameCount = 0;
let lastFrameAt = performance.now();
const frameTimes = [];
let startupWorstMs = 0;
function sceneState() {
  return {
    ready: canvas.dataset.sceneReady === 'true',
    locked: document.pointerLockElement === canvas,
    playerPosition: player.position.toArray(),
    yaw: player.yaw,
    pitch: player.pitch,
    hovered: hovered?.name ?? null,
    reviewName,
    rendererSize: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    pixelRatio: renderer.getPixelRatio(),
    interaction: vignette.state(),
  };
}

function applyDiagnosticCommand() {
  const raw = canvas.dataset.command;
  if (!raw) return;
  canvas.dataset.command = '';
  try {
    const command = JSON.parse(raw);
    if (command.action === 'set-key') player.keys[command.pressed ? 'add' : 'delete'](command.code);
    else if (command.action === 'activate') vignette.interactables.find((entry) => entry.name === command.name)?.action();
    else if (command.action === 'reset') reset();
    canvas.dataset.commandResult = JSON.stringify({ ok: true, action: command.action });
  } catch (error) {
    canvas.dataset.commandResult = JSON.stringify({ ok: false, message: error.message });
  }
}

function frame() {
  const frameAt = performance.now();
  const frameMs = frameAt - lastFrameAt;
  lastFrameAt = frameAt;
  if (frameCount < 30) startupWorstMs = Math.max(startupWorstMs, frameMs);
  else {
    frameTimes.push(frameMs);
    if (frameTimes.length > 600) frameTimes.shift();
  }
  const dt = Math.min(clock.getDelta(), 0.05);
  applyDiagnosticCommand();
  if (!reviewView) player.update(dt);
  vignette.update(dt);
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  hovered = hit ? vignette.interactables[hitboxes.indexOf(hit.object)] : null;
  setPrompt(reviewView ? `Review · ${reviewName}` : document.pointerLockElement === canvas ? (hovered?.label ?? '') : 'Click or focus and press Enter · WASD to move · arrows to look · E interact · R reset');
  pipeline.render();
  frameCount += 1;
  if (frameCount % 60 === 0) {
    const stats = vignette.diagnostics(renderer);
    const sample = frameTimes.slice().sort((a, b) => a - b);
    const averageMs = frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length;
    stats.runtime = {
      averageFps: Math.round(1000 / averageMs),
      p95FrameMs: Number(sample[Math.floor(sample.length * 0.95)].toFixed(2)),
      worstFrameMs: Number(sample.at(-1).toFixed(2)),
      startupWorstMs: Number(startupWorstMs.toFixed(2)),
      samples: frameTimes.length,
      pixelRatio: renderer.getPixelRatio(),
    };
    canvas.dataset.stats = JSON.stringify(stats);
    canvas.dataset.state = JSON.stringify(sceneState());
  }
  canvas.dataset.sceneReady = 'true';
  requestAnimationFrame(frame);
}
frame();

window.__vignette = {
  scene,
  camera,
  renderer,
  pipeline,
  player,
  vignette,
  reviewCameras: vignette.reviewCameras,
  diagnostics: () => vignette.diagnostics(renderer),
  reset,
  resize,
  state: sceneState,
  shadowTintActive,
  // camera-legibility gate: run checkAllCameras() before trusting any review
  // camera — a wrong camera returns a perfectly composed frame of something else
  checkCamera: camcheck.checkCamera,
  checkAllCameras: camcheck.checkAllCameras,
  // spatial audit: measured ground contact / overlap / seam checks — a
  // floating or embedded prop renders as a plausible frame, so measure it
  checkSpatial: createSpatialCheck({
    scene,
    groundAt: vignette.groundAt,
    colliders: vignette.colliders,
    footprint: vignette.footprint,
    islandSets: vignette.auditIslands,
    linearSets: vignette.auditLinear,
  }).checkSpatial,
};

/* ---- dev-only frame capture ---------------------------------------------
 * `await __shot('name', 1280, 720, { pos: [x, y, z], lookAt: [x, y, z] })`
 * or `await __shot('arrival', 1280, 720, { review: 'arrival' })` renders one
 * frame through the full pipeline (or with `{ ink: false }` / `{ grade:
 * false }` to toggle passes) and POSTs it to the vite dev server, which
 * writes `.shots/name.jpg`. Read that file to see the scene — never trust a
 * change without looking.
 */
if (import.meta.env.DEV) {
  window.__shot = async (name = 'shot', width = 1280, height = 720, opts = {}) => {
    const saved = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
      forceScale: pipeline.forceScale,
      ink: pipeline.enabled.ink,
      grade: pipeline.enabled.grade,
    };
    try {
      const view = opts.review ? vignette.reviewCameras[opts.review] : null;
      if (view) {
        camera.position.fromArray(view.position);
        camera.lookAt(new THREE.Vector3().fromArray(view.target));
        camera.fov = view.fov ?? 52;
      }
      if (opts.pos) camera.position.fromArray(opts.pos);
      if (opts.lookAt) camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt));
      if (opts.fov) camera.fov = opts.fov;
      if (opts.ink !== undefined) pipeline.enabled.ink = opts.ink;
      if (opts.grade !== undefined) pipeline.enabled.grade = opts.grade;
      pipeline.forceScale = opts.scale || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      pipeline.setSize(width, height);
      setOutlineResolution(pipeline.size.x, pipeline.size.y);
      pipeline.render();
      const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
      const response = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data }) });
      return response.json();
    } finally {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.aspect = saved.aspect;
      pipeline.forceScale = saved.forceScale;
      pipeline.enabled.ink = saved.ink;
      pipeline.enabled.grade = saved.grade;
      camera.updateProjectionMatrix();
      resize();
    }
  };
}
