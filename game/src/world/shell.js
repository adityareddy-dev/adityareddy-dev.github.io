import * as THREE from 'three';
import { FloorBatch, around } from './batch.js';
import * as tex from './textures.js';
import { WALL, HOUSE, SPLIT, DOWN, STAIR, DOORS, WINDOWS, PAINT, INK } from './plan.js';

const T = WALL.thick;
const OUT = { minX: HOUSE.minX - T, maxX: HOUSE.maxX + T, minZ: HOUSE.minZ - T, maxZ: HOUSE.maxZ + T };
const SKIRT = { h: 0.07, d: 0.012 };
const CELLAR_TOP = -0.015;
const STRIPE = 0.5;

// A box given along the wall, up, and across it.
function on(batch, axis, a0, a1, y0, y1, c0, c1, hex, opts) {
  if (axis === 'x') batch.box((a0 + a1) / 2, (y0 + y1) / 2, (c0 + c1) / 2, a1 - a0, y1 - y0, c1 - c0, hex, opts);
  else batch.box((c0 + c1) / 2, (y0 + y1) / 2, (a0 + a1) / 2, c1 - c0, y1 - y0, a1 - a0, hex, opts);
}

// A straight wall with holes. Axis x runs along X between z lo and hi, axis z the other way.
function wall(batch, { axis, lo, hi, from, to, y0, y1, front, back, cap = PAINT.cap, holes = [], ends = [], skirt = '', floor = 0 }) {
  const put = (a, b, ya, yb, c) => {
    if (b - a < 1e-6 || yb - ya < 1e-6) return;
    if (axis === 'x') batch.faces(a, ya, lo, b, yb, hi, { pz: c.front, nz: c.back, py: c.top, ny: c.under, nx: c.start, px: c.end });
    else batch.faces(lo, ya, a, hi, yb, b, { px: c.front, nx: c.back, py: c.top, ny: c.under, nz: c.start, pz: c.end });
  };
  const base = (a, b) => {
    if (b - a < 1e-6 || y0 > floor + 1e-6 || y1 <= floor) return;
    const col = PAINT.trim;
    for (const side of skirt) {
      const c0 = side === 'f' ? hi : lo - SKIRT.d;
      const c1 = side === 'f' ? hi + SKIRT.d : lo;
      if (axis === 'x') batch.faces(a, floor, c0, b, floor + SKIRT.h, c1, { pz: col, nz: col, py: col, nx: col, px: col });
      else batch.faces(c0, floor, a, c1, floor + SKIRT.h, b, { px: col, nx: col, py: col, nz: col, pz: col });
    }
  };
  const cuts = holes.filter((h) => h.to > from && h.from < to).sort((a, b) => a.from - b.from);
  let at = from;
  let start = ends[0];
  for (const h of cuts) {
    const bottom = h.bottom ?? -Infinity;
    put(at, h.from, y0, y1, { front, back, top: cap, start, end: PAINT.trim });
    base(at, h.from);
    if (bottom > y0) {
      put(h.from, h.to, y0, Math.min(bottom, y1), { front, back, top: bottom < y1 ? PAINT.trim : cap });
      if (bottom > floor + SKIRT.h) base(h.from, h.to);
    }
    if (h.top < y1) {
      put(h.from, h.to, Math.max(h.top, y0), y1, { front, back, top: cap, under: h.top > y0 ? PAINT.trim : undefined });
    }
    at = h.to;
    start = PAINT.trim;
  }
  put(at, to, y0, y1, { front, back, top: cap, start, end: ends[1] });
  base(at, to);
}

function windowFrame(batch, glass, axis, lo, hi, w) {
  const mid = (lo + hi) / 2;
  const f = 0.035;
  const c0 = lo - 0.012;
  const c1 = hi + 0.012;
  on(batch, axis, w.from - f, w.from, w.bottom - f, w.top + f, c0, c1, PAINT.trim);
  on(batch, axis, w.to, w.to + f, w.bottom - f, w.top + f, c0, c1, PAINT.trim);
  on(batch, axis, w.from, w.to, w.top, w.top + f, c0, c1, PAINT.trim);
  on(batch, axis, w.from - f - 0.015, w.to + f + 0.015, w.bottom - f, w.bottom, c0, hi + 0.05, PAINT.trim);
  const m = (w.from + w.to) / 2;
  on(batch, axis, m - 0.011, m + 0.011, w.bottom, w.top, mid - 0.014, mid + 0.014, PAINT.trim);
  if (w.top - w.bottom > 0.45) {
    const y = w.bottom + (w.top - w.bottom) * 0.62;
    on(batch, axis, w.from, w.to, y - 0.011, y + 0.011, mid - 0.014, mid + 0.014, PAINT.trim);
  }
  on(glass, axis, w.from, w.to, w.bottom, w.top, mid - 0.004, mid + 0.004, 0xffffff);
}

// Trim round an open doorway, split at the height the wall drops to.
function doorCasing(low, high, axis, lo, hi, d) {
  const f = 0.04;
  const c0 = lo - 0.012;
  const c1 = hi + 0.012;
  for (const [a0, a1] of [[d.from - f, d.from], [d.to, d.to + f]]) {
    // A hair above the low wall, so the two tops don't flicker.
    on(low, axis, a0, a1, 0, WALL.stub + 0.003, c0, c1, PAINT.trim);
    on(high, axis, a0, a1, WALL.stub + 0.003, d.top + f, c0, c1, PAINT.trim);
  }
  on(high, axis, d.from, d.to, d.top, d.top + f, c0, c1, PAINT.trim);
  on(low, axis, d.from, d.to, 0, 0.006, lo, hi, INK.woodDark);
}

function lawn(material) {
  const step = 0.8;
  const x0 = -13.2;
  const z0 = -10;
  const cols = 35;
  const rows = 25;
  const position = [];
  const uv = [];
  const color = [];
  const normal = [];
  const fade = (x, z) => {
    const dx = Math.max(OUT.minX - x, 0, x - OUT.maxX);
    const dz = Math.max(OUT.minZ - z, 0, z - OUT.maxZ);
    const d = Math.hypot(dx, dz);
    const t = Math.min(1, Math.max(0, (d - 2.2) / 3.6));
    return 1 - t * t * (3 - 2 * t);
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ax = x0 + c * step;
      const az = z0 + r * step;
      const bx = ax + step;
      const bz = az + step;
      // Nothing under the house, or it shows down the stairwell.
      for (const [px, pz, qx, qz] of around([ax, az, bx, bz], [OUT.minX, OUT.minZ, OUT.maxX, OUT.maxZ])) {
        const corners = [[px, qz], [qx, qz], [qx, pz], [px, qz], [qx, pz], [px, pz]];
        if (!corners.some(([x, z]) => fade(x, z) > 0)) continue;
        for (const [x, z] of corners) {
          position.push(x, -WALL.plinth, z);
          normal.push(0, 1, 0);
          uv.push(x / 2.4, -z / 2.4);
          color.push(1, 1, 1, fade(x, z));
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = -2;
  mesh.name = 'lawn';
  return mesh;
}

// Floors, walls, the stairs and the lawn. Fills the batches and returns the rest.
export function buildShell(b) {
  const colliders = [];
  const floors = { up: [], down: [], shaft: [], yard: [] };
  const floorMaterial = (map, roughness = 0.85) => new THREE.MeshStandardMaterial({ map, roughness, metalness: 0 });
  const holeRect = [STAIR.minX, STAIR.topZ, STAIR.maxX, HOUSE.maxZ];

  // Ground floor.
  const bedWood = new FloorBatch(1.5);
  bedWood.rect(OUT.minX, OUT.minZ, SPLIT.a, OUT.maxZ);
  const tileZone = [SPLIT.a, OUT.minZ, 0.4, -0.55];
  const tile = new FloorBatch(0.72);
  tile.rect(...tileZone);
  const liveWood = new FloorBatch(1.5);
  for (const piece of around([SPLIT.a, OUT.minZ, SPLIT.b, OUT.maxZ], tileZone)) {
    for (const r of around(piece, holeRect)) liveWood.rect(...r);
  }
  const carpet = new FloorBatch(0.62);
  carpet.rect(SPLIT.b, OUT.minZ, OUT.maxX, OUT.maxZ);
  floors.up.push(
    bedWood.mesh(floorMaterial(tex.woodFloor({ base: '#d8b98e', seed: 7 }), 0.7), 'floor bedroom'),
    tile.mesh(floorMaterial(tex.tileFloor({}), 0.45), 'floor kitchen'),
    liveWood.mesh(floorMaterial(tex.woodFloor({ base: '#bf8a5c', seed: 19 }), 0.65), 'floor living'),
    carpet.mesh(floorMaterial(tex.carpetFloor({ base: '#8794a6' }), 1), 'floor workspace'),
  );
  b.up.box(-1.05, 0.003, -0.55, 2.9, 0.006, 0.035, INK.chrome);
  b.up.box(0.4, 0.003, -1.56, 0.035, 0.006, 2.02, INK.chrome);

  // Outer walls. The two the camera looks over stay low.
  const outer = { y0: -WALL.plinth, back: PAINT.outside };
  wall(b.up, { ...outer, axis: 'x', lo: OUT.minZ, hi: HOUSE.minZ, from: OUT.minX, to: SPLIT.a, y1: WALL.height, front: PAINT.bedroom, holes: [WINDOWS.bedroomBack], ends: [PAINT.outside], skirt: 'f' });
  wall(b.up, { ...outer, axis: 'x', lo: OUT.minZ, hi: HOUSE.minZ, from: SPLIT.a, to: SPLIT.b, y1: WALL.height, front: PAINT.kitchen, holes: [WINDOWS.kitchen, { ...DOORS.front, bottom: 0.004 }], skirt: 'f' });
  wall(b.up, { ...outer, axis: 'x', lo: OUT.minZ, hi: HOUSE.minZ, from: SPLIT.b, to: OUT.maxX, y1: WALL.height, front: PAINT.workspace, holes: [WINDOWS.workspace], ends: [null, PAINT.outside], skirt: 'f' });
  wall(b.up, { ...outer, axis: 'z', lo: OUT.minX, hi: HOUSE.minX, from: HOUSE.minZ, to: OUT.maxZ, y1: WALL.height, front: PAINT.bedroom, holes: [WINDOWS.bedroomWest], ends: [null, PAINT.outside], skirt: 'f' });
  wall(b.up, { axis: 'x', lo: HOUSE.maxZ, hi: OUT.maxZ, from: HOUSE.minX, to: OUT.maxX, y0: -WALL.plinth, y1: WALL.stub, front: PAINT.outside, back: PAINT.outside, ends: [null, PAINT.outside] });
  wall(b.up, { axis: 'z', lo: HOUSE.maxX, hi: OUT.maxX, from: HOUSE.minZ, to: HOUSE.maxZ, y0: -WALL.plinth, y1: WALL.stub, front: PAINT.outside, back: PAINT.outside });
  windowFrame(b.up, b.upGlass, 'x', OUT.minZ, HOUSE.minZ, WINDOWS.bedroomBack);
  windowFrame(b.up, b.upGlass, 'x', OUT.minZ, HOUSE.minZ, WINDOWS.kitchen);
  windowFrame(b.up, b.upGlass, 'x', OUT.minZ, HOUSE.minZ, WINDOWS.workspace);
  windowFrame(b.up, b.upGlass, 'z', OUT.minX, HOUSE.minX, WINDOWS.bedroomWest);

  // Inner walls. The top part of each is its own mesh so it can drop.
  const inner = [
    { at: SPLIT.a, door: DOORS.bedroom, front: PAINT.kitchen, back: PAINT.bedroom, high: b.wallA },
    { at: SPLIT.b, door: DOORS.workspace, front: PAINT.workspace, back: PAINT.kitchen, high: b.wallB },
  ];
  for (const w of inner) {
    const run = { axis: 'z', lo: w.at - T / 2, hi: w.at + T / 2, from: HOUSE.minZ, to: HOUSE.maxZ, front: w.front, back: w.back, holes: [w.door] };
    wall(b.up, { ...run, y0: 0, y1: WALL.stub, skirt: 'fb' });
    wall(w.high, { ...run, y0: WALL.stub - 0.005, y1: WALL.height, ends: [null, PAINT.cap] });
    doorCasing(b.up, w.high, 'z', run.lo, run.hi, w.door);
    colliders.push(
      { minX: run.lo, maxX: run.hi, minZ: OUT.minZ, maxZ: w.door.from, floor: 0 },
      { minX: run.lo, maxX: run.hi, minZ: w.door.to, maxZ: OUT.maxZ, floor: 0 },
    );
  }

  colliders.push(
    { minX: OUT.minX, maxX: OUT.maxX, minZ: OUT.minZ, maxZ: HOUSE.minZ },
    { minX: OUT.minX, maxX: OUT.maxX, minZ: HOUSE.maxZ, maxZ: OUT.maxZ },
    { minX: HOUSE.maxX, maxX: OUT.maxX, minZ: OUT.minZ, maxZ: OUT.maxZ },
    { minX: OUT.minX, maxX: HOUSE.minX, minZ: OUT.minZ, maxZ: OUT.maxZ, floor: 0 },
  );

  // The stairs and the wall they run down. These show on both storeys.
  const well = STAIR.minX - T;
  wall(b.shaft, { axis: 'z', lo: well, hi: STAIR.minX, from: OUT.minZ, to: OUT.maxZ, y0: DOWN, y1: DOWN + STRIPE, front: 0x6f7f96, back: PAINT.earth, skirt: 'f', floor: DOWN });
  wall(b.shaft, { axis: 'z', lo: well, hi: STAIR.minX, from: OUT.minZ, to: OUT.maxZ, y0: DOWN + STRIPE, y1: CELLAR_TOP, front: PAINT.basement, back: PAINT.earth });
  const treads = STAIR.steps - 1;
  for (let i = 0; i < treads; i += 1) {
    const z0 = STAIR.topZ + i * STAIR.run;
    const top = -(i + 1) * STAIR.rise;
    b.shaft.faces(STAIR.minX, DOWN, z0, STAIR.maxX, top, z0 + STAIR.run, { pz: PAINT.trim, px: INK.walnut });
    b.shaft.box(STAIR.midX, top + 0.012, z0 + STAIR.run / 2 + 0.012, STAIR.maxX - STAIR.minX, 0.024, STAIR.run + 0.024, INK.wood, { r: 0.008 });
  }
  b.shaft.faces(STAIR.minX, DOWN, STAIR.topZ - 0.02, STAIR.maxX, -0.001, STAIR.topZ, { px: INK.walnut, pz: PAINT.trim, nz: INK.walnut });
  const slope = Math.atan2(STAIR.rise, STAIR.run);
  const length = Math.hypot(STAIR.run, STAIR.rise) * treads;
  const midZ = STAIR.topZ + (STAIR.run * treads) / 2;
  const midY = -(STAIR.rise * treads) / 2;
  b.shaft.box(STAIR.minX + 0.045, midY + 0.34, midZ, 0.03, 0.03, length, INK.walnut, { rotX: slope, r: 0.012 });
  b.shaft.box(STAIR.maxX - 0.03, midY + 0.36, midZ + 0.06, 0.03, 0.035, length - 0.3, INK.walnut, { rotX: slope, r: 0.012 });
  for (const i of [1, 3, 5, 7]) {
    const z = STAIR.topZ + (i + 0.5) * STAIR.run;
    const foot = -(i + 1) * STAIR.rise;
    b.shaft.box(STAIR.maxX - 0.03, foot + 0.2, z, 0.024, 0.4, 0.024, INK.steel);
    b.shaft.box(STAIR.minX + 0.03, foot + 0.4, z, 0.05, 0.02, 0.02, INK.steel);
  }
  const landing = new FloorBatch(2.4);
  landing.rect(STAIR.minX, STAIR.topZ, STAIR.maxX, OUT.maxZ, DOWN);
  const concrete = floorMaterial(tex.concreteFloor({}), 0.9);
  floors.shaft.push(landing.mesh(concrete, 'floor landing'));

  // The rail round the stair hole upstairs.
  const railX = STAIR.minX - 0.05;
  b.up.box(railX, 0.36, (STAIR.topZ + HOUSE.maxZ) / 2, 0.035, 0.035, HOUSE.maxZ - STAIR.topZ, INK.walnut, { r: 0.012 });
  b.up.box(railX, 0.012, (STAIR.topZ + HOUSE.maxZ) / 2, 0.05, 0.024, HOUSE.maxZ - STAIR.topZ, INK.walnut);
  for (let z = STAIR.topZ + 0.02; z < HOUSE.maxZ; z += 0.36) b.up.box(railX, 0.18, z, 0.024, 0.36, 0.024, INK.steel);
  b.up.box(railX, 0.21, STAIR.topZ, 0.05, 0.42, 0.05, INK.walnut, { r: 0.01 });
  colliders.push(
    { minX: well, maxX: STAIR.minX, minZ: STAIR.topZ - 0.03, maxZ: OUT.maxZ },
    { minX: STAIR.maxX, maxX: STAIR.maxX + T, minZ: STAIR.topZ, maxZ: STAIR.topZ + STAIR.run * treads },
  );

  // Basement.
  const cellarFloor = new FloorBatch(2.4);
  for (const r of around([STAIR.minX, OUT.minZ, OUT.maxX, OUT.maxZ], holeRect)) cellarFloor.rect(...r, DOWN);
  const mat = [3.3, -1.05, 7.3, 2.3];
  const rubber = new FloorBatch(1);
  rubber.rect(...mat, DOWN + 0.014);
  floors.down.push(cellarFloor.mesh(concrete, 'floor basement'), rubber.mesh(floorMaterial(tex.rubberFloor({}), 0.95), 'floor gym'));
  b.down.faces(mat[0], DOWN, mat[1], mat[2], DOWN + 0.014, mat[3], { px: INK.rubber, pz: INK.rubber, nx: INK.rubber, nz: INK.rubber });
  const door = { ...DOORS.backOffice, bottom: DOWN, top: DOWN + DOORS.backOffice.top };
  const cellarBack = { axis: 'x', lo: OUT.minZ, hi: HOUSE.minZ, from: well, to: OUT.maxX, back: PAINT.earth, holes: [door], ends: [null, PAINT.earth] };
  wall(b.down, { ...cellarBack, y0: DOWN, y1: DOWN + STRIPE, front: 0x6f7f96, skirt: 'f', floor: DOWN });
  wall(b.down, { ...cellarBack, y0: DOWN + STRIPE, y1: CELLAR_TOP, front: PAINT.basement });
  wall(b.down, { axis: 'x', lo: HOUSE.maxZ, hi: OUT.maxZ, from: STAIR.minX, to: OUT.maxX, y0: DOWN - 0.3, y1: DOWN + WALL.stub, front: PAINT.earth, back: PAINT.earth, ends: [null, PAINT.earth] });
  wall(b.down, { axis: 'z', lo: HOUSE.maxX, hi: OUT.maxX, from: HOUSE.minZ, to: HOUSE.maxZ, y0: DOWN - 0.3, y1: DOWN + WALL.stub, front: PAINT.earth, back: PAINT.earth });
  colliders.push(
    { minX: OUT.minX, maxX: STAIR.minX, minZ: OUT.minZ, maxZ: OUT.maxZ, floor: DOWN },
    { minX: STAIR.minX, maxX: STAIR.maxX, minZ: OUT.minZ, maxZ: STAIR.topZ, floor: DOWN },
  );

  // Lawn round the house, fading out at the edges.
  const grass = new THREE.MeshStandardMaterial({ map: tex.grass({}), vertexColors: true, transparent: true, roughness: 1, metalness: 0 });
  floors.yard.push(lawn(grass));

  // Unseen slab under the ground floor, so the stairwell gets shade.
  const slab = new FloorBatch(1);
  for (const r of around([OUT.minX, OUT.minZ, OUT.maxX, OUT.maxZ], holeRect)) slab.rect(...r, -0.05);
  const shade = slab.mesh(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }), 'stairwell shade');
  shade.castShadow = true;
  shade.receiveShadow = false;
  floors.up.push(shade);

  return { colliders, floors, door, mat };
}
