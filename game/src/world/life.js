import * as THREE from 'three';
import * as tex from './textures.js';
import { HOUSE, WINDOWS, INK } from './plan.js';

const PANES = [
  { axis: 'z', at: HOUSE.minX, w: WINDOWS.bedroomWest, inward: new THREE.Vector3(1, 0, 0), motes: 18 },
  { axis: 'x', at: HOUSE.minZ, w: WINDOWS.bedroomBack, inward: new THREE.Vector3(0, 0, 1), motes: 12 },
  { axis: 'x', at: HOUSE.minZ, w: WINDOWS.kitchen, inward: new THREE.Vector3(0, 0, 1), motes: 12 },
  { axis: 'x', at: HOUSE.minZ, w: WINDOWS.workspace, inward: new THREE.Vector3(0, 0, 1), motes: 12 },
];

const right = new THREE.Vector3();
const upward = new THREE.Vector3();
const p = new THREE.Vector3();
const q = new THREE.Vector3();
const travel = new THREE.Vector3();
const tint = new THREE.Color();

// Soft dots that always face the camera, all in one mesh.
class Puffs {
  constructor(count, map, additive) {
    this.count = count;
    this.position = new Float32Array(count * 12);
    this.color = new Float32Array(count * 16);
    const uv = new Float32Array(count * 8);
    const index = [];
    for (let i = 0; i < count; i += 1) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    const material = new THREE.MeshBasicMaterial({
      map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  begin(camera) {
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    upward.setFromMatrixColumn(camera.matrixWorld, 1);
  }

  set(i, x, y, z, size, r, g, b, alpha) {
    const s = size / 2;
    for (let k = 0; k < 4; k += 1) {
      const u = k === 1 || k === 2 ? s : -s;
      const v = k > 1 ? s : -s;
      const o = i * 12 + k * 3;
      this.position[o] = x + right.x * u + upward.x * v;
      this.position[o + 1] = y + right.y * u + upward.y * v;
      this.position[o + 2] = z + right.z * u + upward.z * v;
      const c = i * 16 + k * 4;
      this.color[c] = r;
      this.color[c + 1] = g;
      this.color[c + 2] = b;
      this.color[c + 3] = alpha;
    }
  }

  end() {
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

function flatGlow(map, hex, w, d) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map, color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

// The small moving things: steam, dust in the light, screens, the clock on the wall.
export function createLife(ctx, { groups, materials, life, lamps, lights }) {
  const dot = tex.softDot();
  let time = 0;

  // The kitchen clock.
  const handMaterial = new THREE.MeshStandardMaterial({ color: INK.black, roughness: 0.6 });
  const hand = (length, width) => {
    const g = new THREE.BoxGeometry(width, length, 0.004);
    g.translate(0, length / 2 - 0.01, 0);
    const mesh = new THREE.Mesh(g, handMaterial);
    mesh.position.copy(life.clock.position).setZ(life.clock.position.z + 0.026);
    groups.upper.add(mesh);
    return mesh;
  };
  const hourHand = hand(0.05, 0.009);
  const minuteHand = hand(0.072, 0.006);
  minuteHand.position.z += 0.003;

  // Light through the windows, as faint beams and a patch on the floor.
  const beamPosition = new Float32Array(PANES.length * 20 * 3);
  const beamColor = new Float32Array(PANES.length * 20 * 4);
  const beamIndex = [];
  PANES.forEach((pane, n) => {
    for (let f = 0; f < 5; f += 1) {
      const o = n * 20 + f * 4;
      beamIndex.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  });
  const beamGeometry = new THREE.BufferGeometry();
  beamGeometry.setAttribute('position', new THREE.BufferAttribute(beamPosition, 3).setUsage(THREE.DynamicDrawUsage));
  beamGeometry.setAttribute('color', new THREE.BufferAttribute(beamColor, 4).setUsage(THREE.DynamicDrawUsage));
  beamGeometry.setIndex(beamIndex);
  const beams = new THREE.Mesh(
    beamGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true }),
  );
  beams.frustumCulled = false;
  beams.renderOrder = 2;
  groups.upper.add(beams);

  const paneCorner = (pane, u, v, out) => {
    const along = pane.w.from + (pane.w.to - pane.w.from) * u;
    const y = pane.w.bottom + (pane.w.top - pane.w.bottom) * v;
    return pane.axis === 'x' ? out.set(along, y, pane.at) : out.set(pane.at, y, along);
  };
  const toFloor = (point, out, lift = 0.02) => out.copy(point).addScaledVector(travel, (point.y - lift) / -travel.y);

  function aimBeams() {
    const now = lights.now;
    travel.copy(now.dir).negate();
    const sunny = Math.min(1, now.power / 1.6);
    tint.copy(now.sun);
    PANES.forEach((pane, n) => {
      const facing = Math.min(1, Math.max(0, (travel.dot(pane.inward) - 0.08) * 2.4));
      const reach = pane.w.top / Math.max(0.05, -travel.y);
      pane.strength = facing * sunny * Math.min(1, Math.max(0, (6 - reach) / 2));
      const ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const top = ring.map(([u, v]) => paneCorner(pane, u, v, new THREE.Vector3()));
      const foot = top.map((corner) => toFloor(corner, new THREE.Vector3()));
      const write = (slot, point, alpha) => {
        const o = (n * 20 + slot) * 3;
        beamPosition[o] = point.x;
        beamPosition[o + 1] = point.y;
        beamPosition[o + 2] = point.z;
        const c = (n * 20 + slot) * 4;
        beamColor[c] = tint.r;
        beamColor[c + 1] = tint.g;
        beamColor[c + 2] = tint.b;
        beamColor[c + 3] = alpha * pane.strength;
      };
      for (let s = 0; s < 4; s += 1) {
        const t = (s + 1) % 4;
        write(s * 4, top[s], 0.11);
        write(s * 4 + 1, top[t], 0.11);
        write(s * 4 + 2, foot[t], 0.015);
        write(s * 4 + 3, foot[s], 0.015);
      }
      foot.forEach((point, s) => write(16 + s, point, 0.16));
    });
    beamGeometry.attributes.position.needsUpdate = true;
    beamGeometry.attributes.color.needsUpdate = true;
  }

  // Dust in the beams, lamp glows and steam.
  const motes = [];
  PANES.forEach((pane, n) => {
    for (let i = 0; i < pane.motes; i += 1) {
      const r = (k) => {
        const s = Math.sin((n * 131 + i * 17 + k * 7.3) * 12.9898) * 43758.5453;
        return s - Math.floor(s);
      };
      motes.push({ pane, u: r(1), v: r(2), s: r(3), speed: 0.012 + r(4) * 0.02, phase: r(5) * 6.28, size: 0.012 + r(6) * 0.014 });
    }
  });
  const glowsUp = lamps.filter((l) => l.storey === 'up' && l.size > 0);
  const glowsDown = lamps.filter((l) => l.storey === 'down' && l.size > 0);
  const sparkUp = new Puffs(motes.length + glowsUp.length, dot, true);
  const sparkDown = new Puffs(glowsDown.length + 1, dot, true);
  const STEAM = 7;
  const steam = new Puffs(STEAM, dot, false);
  groups.upper.add(sparkUp.mesh, steam.mesh);
  groups.lower.add(sparkDown.mesh);

  // Glow off the screens and under the back office door.
  const deskGlow = flatGlow(dot, 0x8fc4ff, 0.9, 0.36);
  deskGlow.position.copy(life.deskGlow);
  const tvGlow = flatGlow(dot, 0x9fc0ff, 0.8, 1.1);
  tvGlow.position.set(-1.95, 0.022, 1.3);
  groups.upper.add(deskGlow, tvGlow);
  const doorGlow = flatGlow(dot, 0xff5236, 1.1, 0.5);
  doorGlow.position.copy(life.doorGlow);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.014), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  led.position.copy(life.led);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 1), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
  bulb.position.copy(life.alarm);
  groups.lower.add(doorGlow, led, bulb);
  const doorLight = () => lights.points.find((l) => l.userData.id === 'door');

  let tvWait = 0;
  let lastMinute = -1;

  function update(dt, { storey, relit }) {
    time += dt;
    const camera = ctx.camera;
    const lamp = lights.now.lamp;

    if (storey === 'up') {
      tvWait -= dt;
      if (tvWait <= 0) {
        tvWait = 0.08;
        life.tv.draw(time);
      }
      const minutes = ctx.clock?.now ?? 420;
      if (Math.abs(minutes - lastMinute) >= 0.25) {
        lastMinute = minutes;
        hourHand.rotation.z = -((minutes % 720) / 720) * Math.PI * 2;
        minuteHand.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
      }
      if (relit) aimBeams();

      sparkUp.begin(camera);
      travel.copy(lights.now.dir).negate();
      tint.copy(lights.now.sun);
      motes.forEach((m, i) => {
        const k = m.pane.strength || 0;
        if (k < 0.02) {
          sparkUp.set(i, 0, -50, 0, 0, 0, 0, 0, 0);
          return;
        }
        const s = (m.s + time * m.speed) % 1;
        paneCorner(m.pane, m.u, m.v, p);
        toFloor(p, q, 0.05);
        p.lerp(q, s);
        p.x += Math.sin(time * 0.5 + m.phase) * 0.03;
        p.z += Math.cos(time * 0.4 + m.phase * 1.7) * 0.03;
        const twinkle = 0.55 + 0.45 * Math.sin(time * 1.3 + m.phase * 3);
        sparkUp.set(i, p.x, p.y, p.z, m.size, tint.r, tint.g, tint.b, k * 0.7 * Math.sin(Math.PI * s) * twinkle);
      });
      glowsUp.forEach((g, i) => {
        const breathe = 1 + Math.sin(time * 1.1 + i) * 0.03;
        sparkUp.set(motes.length + i, g.position.x, g.position.y, g.position.z, g.size * breathe, 1, 0.78, 0.5, lamp * 0.42);
      });
      sparkUp.end();

      steam.begin(camera);
      for (let i = 0; i < STEAM; i += 1) {
        const s = (time * 0.32 + i / STEAM) % 1;
        const sway = Math.sin(time * 1.4 + i * 2.1) * 0.02 * s;
        steam.set(i, life.steam.x + sway, life.steam.y + s * 0.34, life.steam.z + 0.02, 0.08 + s * 0.13, 0.42, 0.47, 0.58, Math.sin(Math.PI * s) * 0.7);
      }
      steam.end();

      deskGlow.material.opacity = 0.07 + lamp * 0.2;
      tvGlow.material.opacity = (0.05 + lamp * 0.22) * (0.85 + 0.15 * Math.sin(time * 7));
    } else {
      sparkDown.begin(camera);
      glowsDown.forEach((g, i) => {
        const red = g.id === 'door';
        const pulse = red ? 0.6 + 0.4 * Math.sin(time * 2.2) : 1;
        sparkDown.set(i, g.position.x, g.position.y, g.position.z, g.size, 1, red ? 0.35 : 0.8, red ? 0.25 : 0.55, 0.4 * pulse);
      });
      const blink = time % 1.6 < 0.18;
      sparkDown.set(glowsDown.length, life.led.x, life.led.y, life.led.z + 0.01, 0.06, 1, 0.2, 0.15, blink ? 0.7 : 0);
      sparkDown.end();
      led.material.color.setHex(blink ? 0xff3b30 : 0x4a1512);
      const pulse = 0.6 + 0.4 * Math.sin(time * 2.2);
      bulb.material.color.setRGB(1 * pulse, 0.25 * pulse, 0.2 * pulse);
      doorGlow.material.opacity = 0.22 + 0.1 * Math.sin(time * 3.1) + 0.05 * Math.sin(time * 11.3);
      const light = doorLight();
      if (light) light.intensity = (light.userData.base || 0) * pulse;
    }
  }

  aimBeams();
  return { update, aimBeams };
}
