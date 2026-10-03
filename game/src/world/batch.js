import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const colour = new THREE.Color();
const point = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const local = new THREE.Matrix4();
const full = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const euler = new THREE.Euler();
const where = new THREE.Vector3();
const size = new THREE.Vector3();

const cache = new Map();
function shape(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Collects coloured triangles from many small shapes and bakes them into one mesh.
export class Batch {
  constructor() {
    this.position = [];
    this.normal = [];
    this.color = [];
    this.base = null;
  }

  get empty() {
    return this.position.length === 0;
  }

  // Everything added inside fn is moved to x, y, z and turned by rotY first.
  at(x, y, z, rotY, fn) {
    const before = this.base;
    const m = new THREE.Matrix4().makeRotationY(rotY || 0).setPosition(x, y, z);
    this.base = before ? before.clone().multiply(m) : m;
    fn(this);
    this.base = before;
    return this;
  }

  add(geometry, matrix, hex) {
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const index = geometry.index;
    let m = matrix || null;
    if (this.base) m = m ? full.multiplyMatrices(this.base, m) : this.base;
    if (m) normalMatrix.getNormalMatrix(m);
    colour.set(hex);
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 1) {
      const k = index ? index.getX(i) : i;
      point.fromBufferAttribute(pos, k);
      if (m) point.applyMatrix4(m);
      this.position.push(point.x, point.y, point.z);
      point.fromBufferAttribute(nor, k);
      if (m) point.applyMatrix3(normalMatrix).normalize();
      this.normal.push(point.x, point.y, point.z);
      this.color.push(colour.r, colour.g, colour.b);
    }
    return this;
  }

  place(geometry, x, y, z, sx, sy, sz, hex, { rotX = 0, rotY = 0, rotZ = 0 } = {}) {
    turn.setFromEuler(euler.set(rotX, rotY, rotZ));
    local.compose(where.set(x, y, z), turn, size.set(sx, sy, sz));
    return this.add(geometry, local, hex);
  }

  // A box by its centre. r rounds the edges.
  box(x, y, z, w, h, d, hex, opts = {}) {
    const r = Math.min(opts.r || 0, w / 2, h / 2, d / 2);
    if (r > 0) {
      const key = `rbox:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
      return this.place(shape(key, () => new RoundedBoxGeometry(w, h, d, 2, r)), x, y, z, 1, 1, 1, hex, opts);
    }
    return this.place(shape('box', () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, w, h, d, hex, opts);
  }

  // A cylinder by its centre. axis is the way it points.
  cyl(x, y, z, radius, height, hex, { axis = 'y', seg = 14, top = 1, ...rest } = {}) {
    const g = shape(`cyl:${seg}:${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg));
    const opts = { ...rest };
    if (axis === 'x') opts.rotZ = (opts.rotZ || 0) + Math.PI / 2;
    if (axis === 'z') opts.rotX = (opts.rotX || 0) + Math.PI / 2;
    return this.place(g, x, y, z, radius, height, radius, hex, opts);
  }

  ball(x, y, z, radius, hex, { sx = 1, sy = 1, sz = 1, detail = 2, ...rest } = {}) {
    const g = shape(`ball:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.place(g, x, y, z, radius * sx, radius * sy, radius * sz, hex, rest);
  }

  ring(x, y, z, radius, tube, hex, opts = {}) {
    const g = shape(`ring:${(tube / radius).toFixed(2)}`, () => new THREE.TorusGeometry(1, tube / radius, 8, 18));
    return this.place(g, x, y, z, radius, radius, radius, hex, opts);
  }

  // One flat face. Corners go round anticlockwise seen from the side the normal points to.
  quad(a, b, c, d, n, hex) {
    colour.set(hex);
    for (const p of [a, b, c, a, c, d]) {
      this.position.push(p[0], p[1], p[2]);
      this.normal.push(n[0], n[1], n[2]);
      this.color.push(colour.r, colour.g, colour.b);
    }
    return this;
  }

  // A box from corner to corner with a colour per side. A missing side is left open.
  faces(x0, y0, z0, x1, y1, z1, c) {
    if (x1 - x0 <= 1e-6 || y1 - y0 <= 1e-6 || z1 - z0 <= 1e-6) return this;
    if (c.px != null) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], c.px);
    if (c.nx != null) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], c.nx);
    if (c.py != null) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c.py);
    if (c.ny != null) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c.ny);
    if (c.pz != null) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c.pz);
    if (c.nz != null) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c.nz);
    return this;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material, { cast = true, receive = true, name = '' } = {}) {
    if (this.empty) return null;
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = name;
    return mesh;
  }
}

// Flat textured quads on the floor, all sharing one material.
export class FloorBatch {
  constructor(tile = 1) {
    this.tile = tile;
    this.position = [];
    this.uv = [];
  }

  rect(x0, z0, x1, z1, y = 0) {
    if (x1 - x0 <= 1e-6 || z1 - z0 <= 1e-6) return this;
    const t = this.tile;
    for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]]) {
      this.position.push(x, y, z);
      this.uv.push(x / t, -z / t);
    }
    return this;
  }

  mesh(material, name = '') {
    if (!this.position.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const count = this.position.length / 3;
    const normal = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) normal[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  }
}

// The parts of a rectangle left over once a hole is cut out of it.
export function around(rect, hole) {
  const [x0, z0, x1, z1] = rect;
  const hx0 = Math.max(x0, hole[0]);
  const hz0 = Math.max(z0, hole[1]);
  const hx1 = Math.min(x1, hole[2]);
  const hz1 = Math.min(z1, hole[3]);
  if (hx0 >= hx1 || hz0 >= hz1) return [rect];
  return [
    [x0, z0, hx0, z1],
    [hx1, z0, x1, z1],
    [hx0, z0, hx1, hz0],
    [hx0, hz1, hx1, z1],
  ].filter((r) => r[2] - r[0] > 1e-6 && r[3] - r[1] > 1e-6);
}
