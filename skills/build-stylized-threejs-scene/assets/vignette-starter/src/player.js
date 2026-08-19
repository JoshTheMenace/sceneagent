import * as THREE from 'three';

const EYE = 1.62;
const RADIUS = 0.34;

export class Walker {
  constructor(camera, canvas, colliders) {
    this.camera = camera;
    this.canvas = canvas;
    this.colliders = colliders;
    this.spawn = new THREE.Vector3(0, 0, 14);
    this.position = this.spawn.clone();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.04;
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.bind();
    this.applyCamera();
  }

  bind() {
    this.onMouseMove = (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= event.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0022, -1.15, 1.05);
    };
    this.onKeyDown = (event) => {
      this.keys.add(event.code);
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onBlur = () => this.keys.clear();
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  resolve() {
    for (const collider of this.colliders) {
      const x0 = collider.x0 - RADIUS;
      const x1 = collider.x1 + RADIUS;
      const z0 = collider.z0 - RADIUS;
      const z1 = collider.z1 + RADIUS;
      if (this.position.x <= x0 || this.position.x >= x1 || this.position.z <= z0 || this.position.z >= z1) continue;
      const distances = [this.position.x - x0, x1 - this.position.x, this.position.z - z0, z1 - this.position.z];
      const edge = distances.indexOf(Math.min(...distances));
      if (edge === 0) this.position.x = x0;
      else if (edge === 1) this.position.x = x1;
      else if (edge === 2) this.position.z = z0;
      else this.position.z = z1;
    }
  }

  update(dt) {
    const active = document.pointerLockElement === this.canvas || document.activeElement === this.canvas;
    let forward = 0;
    let side = 0;
    if (active) {
      if (this.keys.has('KeyW')) forward += 1;
      if (this.keys.has('KeyS')) forward -= 1;
      if (this.keys.has('KeyD')) side += 1;
      if (this.keys.has('KeyA')) side -= 1;
      if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.5;
      if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.5;
      if (this.keys.has('ArrowUp')) this.pitch = THREE.MathUtils.clamp(this.pitch + dt, -1.15, 1.05);
      if (this.keys.has('ArrowDown')) this.pitch = THREE.MathUtils.clamp(this.pitch - dt, -1.15, 1.05);
    }
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const target = this.forward.multiplyScalar(forward).addScaledVector(this.right, side);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(this.keys.has('ShiftLeft') ? 5 : 2.6);
    this.velocity.lerp(target, 1 - Math.exp(-12 * dt));
    const steps = Math.max(1, Math.ceil(this.velocity.length() * dt / 0.18));
    for (let i = 0; i < steps; i += 1) {
      this.position.x += this.velocity.x * dt / steps;
      this.resolve();
      this.position.z += this.velocity.z * dt / steps;
      this.resolve();
    }
    this.applyCamera();
  }

  applyCamera() {
    this.camera.position.set(this.position.x, this.position.y + EYE, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  reset() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.04;
    this.applyCamera();
  }

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
