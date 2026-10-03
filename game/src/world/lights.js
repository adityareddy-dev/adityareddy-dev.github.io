import * as THREE from 'three';
import { HOUSE, DOWN, STAIR } from './plan.js';

// The day, hour by hour. dir points at the sun, lamp says how far the lamps are up.
const DAY = [
  { t: 300, dir: [-0.9, 0.2, -0.25], sun: 0xffb489, power: 0.5, sky: 0x8f9cc4, hemi: 0.42, env: 0.3, back: 0x3d4662, lamp: 1 },
  { t: 390, dir: [-0.84, 0.44, -0.2], sun: 0xffe3c6, power: 1.6, sky: 0xc4d6f5, hemi: 0.75, env: 0.45, back: 0x6f8ba3, lamp: 0.25 },
  { t: 450, dir: [-0.78, 0.6, -0.14], sun: 0xf6f8ff, power: 2.05, sky: 0xcfe0ff, hemi: 0.9, env: 0.5, back: 0x7b9bb2, lamp: 0 },
  { t: 600, dir: [-0.45, 0.85, 0.28], sun: 0xfffaf0, power: 2.3, sky: 0xe4edff, hemi: 0.9, env: 0.5, back: 0x86a8bb, lamp: 0 },
  { t: 780, dir: [0.15, 0.95, 0.45], sun: 0xfff4e0, power: 2.4, sky: 0xfff7ea, hemi: 0.9, env: 0.5, back: 0x90b0bd, lamp: 0 },
  { t: 960, dir: [0.62, 0.62, 0.2], sun: 0xffd9a8, power: 2.2, sky: 0xffe9cf, hemi: 0.85, env: 0.5, back: 0xa99a86, lamp: 0 },
  { t: 1080, dir: [0.82, 0.34, -0.3], sun: 0xffa35f, power: 1.75, sky: 0xffc9a0, hemi: 0.62, env: 0.4, back: 0x9a726c, lamp: 0.65 },
  { t: 1140, dir: [0.86, 0.17, -0.42], sun: 0xff7b47, power: 0.7, sky: 0xa594bd, hemi: 0.45, env: 0.3, back: 0x4b4366, lamp: 1 },
  { t: 1170, dir: [0.86, 0.1, -0.45], sun: 0xff6a3d, power: 0, sky: 0x7a7fb0, hemi: 0.38, env: 0.25, back: 0x2c2c48, lamp: 1 },
  { t: 1170.01, dir: [-0.4, 0.8, 0.45], sun: 0x8fa8ff, power: 0, sky: 0x7a7fb0, hemi: 0.38, env: 0.25, back: 0x2c2c48, lamp: 1 },
  { t: 1210, dir: [-0.4, 0.8, 0.45], sun: 0x8fa8ff, power: 0.35, sky: 0x5b6a9c, hemi: 0.24, env: 0.22, back: 0x1a1c2c, lamp: 1 },
  { t: 1440, dir: [-0.2, 0.85, 0.5], sun: 0x8fa8ff, power: 0.35, sky: 0x5b6a9c, hemi: 0.24, env: 0.22, back: 0x1a1c2c, lamp: 1 },
];
const CELLAR = { dir: [0.4, 1, 0.55], sun: 0xf0f4ff, power: 1.15, sky: 0xdfe6f2, hemi: 0.5, env: 0.28, back: 0x17141a, lamp: 1 };
const GROUND = { day: new THREE.Color(0x6a6070), night: new THREE.Color(0x2a2838) };
const BOXES = {
  up: new THREE.Box3(new THREE.Vector3(HOUSE.minX - 1.2, DOWN, HOUSE.minZ - 1.2), new THREE.Vector3(HOUSE.maxX + 1.2, 1.7, HOUSE.maxZ + 1.2)),
  down: new THREE.Box3(new THREE.Vector3(STAIR.minX - 0.4, DOWN - 0.1, HOUSE.minZ - 0.4), new THREE.Vector3(HOUSE.maxX + 0.4, 0.1, HOUSE.maxZ + 0.4)),
};
const LAMP = { up: 0xffc98a, cool: 0xeaf2ff };

const c0 = new THREE.Color();
const c1 = new THREE.Color();
const corner = new THREE.Vector3();
const view = new THREE.Matrix4();

function mix(out, a, b, k) {
  return out.copy(c0.set(a)).lerp(c1.set(b), k);
}

// Sun, sky and lamps, set from the clock.
export function createLights(ctx, { root, lamps, materials }) {
  const { scene } = ctx;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a6070, 0.85);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  root.add(hemi, sun, sun.target);

  const byStorey = { up: lamps.filter((l) => l.storey === 'up' && !l.minor), down: lamps.filter((l) => l.storey === 'down') };
  const points = [0, 1, 2, 3].map(() => {
    const light = new THREE.PointLight(LAMP.up, 0, 6.5, 2);
    root.add(light);
    return light;
  });
  const power = { bedroom: 3.2, kitchen: 3.2, living: 3.6, workspace: 3.4, tube: 2.4, gym: 2.2, door: 1.1, stairs: 1.2 };
  const tints = { tube: LAMP.cool, door: 0xff5a48, stairs: 0xffe2bd };

  const now = { dir: new THREE.Vector3(0, 1, 0), power: 0, lamp: 0, sun: new THREE.Color(), day: 1 };
  const back = new THREE.Color();
  let storey = 'up';
  let last = -1;

  function fitShadow(box) {
    const centre = box.getCenter(sun.target.position);
    sun.position.copy(centre).addScaledVector(now.dir, 24);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    view.lookAt(sun.position, centre, sun.up).setPosition(sun.position).invert();
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view);
      lo.min(corner);
      hi.max(corner);
    }
    const cam = sun.shadow.camera;
    cam.left = lo.x;
    cam.right = hi.x;
    cam.bottom = lo.y;
    cam.top = hi.y;
    cam.near = Math.max(0.5, -hi.z - 1);
    cam.far = -lo.z + 1;
    cam.updateProjectionMatrix();
  }

  function apply(k) {
    now.dir.set(k.dir[0], k.dir[1], k.dir[2]).normalize();
    now.power = k.power;
    now.lamp = k.lamp;
    now.sun.copy(k.sunColor);
    sun.color.copy(k.sunColor);
    sun.intensity = k.power;
    hemi.color.copy(k.skyColor);
    hemi.groundColor.copy(GROUND.night).lerp(GROUND.day, Math.min(1, k.hemi / 0.85));
    hemi.intensity = k.hemi;
    scene.environmentIntensity = k.env;
    if (scene.background?.isColor) scene.background.copy(k.backColor);
    else scene.background = k.backColor.clone();
    fitShadow(BOXES[storey]);

    const list = byStorey[storey];
    points.forEach((light, i) => {
      const lamp = list[i];
      if (!lamp) {
        light.intensity = 0;
        return;
      }
      light.position.copy(lamp.position);
      light.color.set(tints[lamp.id] ?? LAMP.up);
      light.userData.base = (power[lamp.id] ?? 2) * k.lamp;
      light.userData.id = lamp.id;
      light.intensity = light.userData.base;
    });
    materials.glowUp.emissiveIntensity = 0.12 + k.lamp * 1.5;
  }

  const frame = { sunColor: new THREE.Color(), skyColor: new THREE.Color(), backColor: back, dir: [0, 1, 0], power: 0, hemi: 0, env: 0, lamp: 0 };

  function at(minutes) {
    if (storey === 'down') {
      frame.sunColor.set(CELLAR.sun);
      frame.skyColor.set(CELLAR.sky);
      frame.backColor.set(CELLAR.back);
      Object.assign(frame, { dir: CELLAR.dir, power: CELLAR.power, hemi: CELLAR.hemi, env: CELLAR.env, lamp: CELLAR.lamp });
      return frame;
    }
    const t = Math.min(DAY[DAY.length - 1].t, Math.max(DAY[0].t, minutes));
    let i = 0;
    while (i < DAY.length - 2 && t > DAY[i + 1].t) i += 1;
    const a = DAY[i];
    const b = DAY[i + 1];
    const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    mix(frame.sunColor, a.sun, b.sun, k);
    mix(frame.skyColor, a.sky, b.sky, k);
    mix(frame.backColor, a.back, b.back, k);
    frame.dir = a.dir.map((v, n) => v + (b.dir[n] - v) * k);
    for (const key of ['power', 'hemi', 'env', 'lamp']) frame[key] = a[key] + (b[key] - a[key]) * k;
    return frame;
  }

  // Moves the light on when the clock has moved enough to see.
  function update(minutes, force = false) {
    if (!force && Math.abs(minutes - last) < 1) return false;
    last = minutes;
    apply(at(minutes));
    return true;
  }

  return {
    sun,
    hemi,
    points,
    now,
    update,
    setStorey(next, minutes) {
      storey = next;
      update(minutes, true);
    },
    // How daylight the house is, 0 at night and in the basement.
    get daylight() {
      return storey === 'down' ? 0 : Math.min(1, now.power / 1.6) * (1 - now.lamp * 0.6);
    },
  };
}
