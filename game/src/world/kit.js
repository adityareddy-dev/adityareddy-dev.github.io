import * as THREE from 'three';
import { KIT } from './plan.js';

const UP = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const ab = new THREE.Vector3();
const ac = new THREE.Vector3();
const n = new THREE.Vector3();

// Walks every triangle of a model in its own space.
function triangles(model, fn) {
  model.parts.forEach((part, index) => {
    const pos = part.geometry.attributes.position;
    const idx = part.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(part.matrix);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(part.matrix);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(part.matrix);
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const area = n.length() / 2;
      if (area < 1e-9) continue;
      n.normalize();
      fn(a, b, c, n, area, index);
    }
  });
}

// Loads the furniture models once and bakes copies of them into batches.
export async function loadKit(ctx, keys) {
  const models = new Map();
  await Promise.all(
    keys.map(async (key) => {
      const data = await ctx.assets.gltf(key);
      if (!data?.scene) return;
      data.scene.updateMatrixWorld(true);
      const parts = [];
      const box = new THREE.Box3();
      data.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        let geometry = o.geometry;
        if (!geometry.attributes.normal) {
          geometry = geometry.clone();
          geometry.computeVertexNormals();
        }
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        box.union(geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
        const material = [].concat(o.material)[0];
        parts.push({ geometry, matrix: o.matrixWorld.clone(), name: material?.name || '', color: material?.color ? material.color.getHex() : 0xcccccc });
      });
      if (parts.length) models.set(key, { parts, box, scale: ctx.assets.entry(key)?.scale ?? 1 });
    }),
  );

  function sizeOf(key) {
    const model = models.get(key);
    if (model) return model.box.getSize(new THREE.Vector3()).multiplyScalar(model.scale).toArray();
    return ctx.assets.entry(key)?.size || [0.4, 0.4, 0.4];
  }

  function placement(model, x, y, z, rot, s, stretch) {
    const k = s * model.scale;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(UP, rot),
      new THREE.Vector3(k * stretch[0], k * stretch[1], k * stretch[2]),
    );
    const box = model.box;
    return m.multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  }

  // Bakes a model standing on x, y, z by the middle of its base. Returns the floor it covers.
  function put(target, key, x, y, z, { rot = 0, s = 1, stretch = [1, 1, 1], tint = {} } = {}) {
    const model = models.get(key);
    const size = sizeOf(key);
    const w = size[0] * s * stretch[0];
    const h = size[1] * s * stretch[1];
    const d = size[2] * s * stretch[2];
    if (model) {
      const m = placement(model, x, y, z, rot, s, stretch);
      for (const part of model.parts) {
        const hex = tint[part.name] !== undefined ? tint[part.name] : KIT[part.name] ?? part.color;
        if (hex === false) continue;
        const batch = part.name === 'glass' ? target.glass : part.name === 'lamp' ? target.glow : target.solid;
        batch.add(part.geometry, new THREE.Matrix4().multiplyMatrices(m, part.matrix), hex);
      }
    } else {
      target.solid.box(x, y + h / 2, z, w, h, d, KIT.wood, { r: Math.min(0.02, h / 4), rotY: rot });
    }
    const cos = Math.abs(Math.cos(rot));
    const sin = Math.abs(Math.sin(rot));
    const hw = (cos * w + sin * d) / 2;
    const hd = (sin * w + cos * d) / 2;
    return { x, z, minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, top: y + h, missing: !model };
  }

  // Heights of the wide flat tops in a model, lowest first. Shelves, seats and table tops.
  function levels(key, share = 0.3) {
    const model = models.get(key);
    if (!model) return [];
    const size = model.box.getSize(new THREE.Vector3());
    const sums = new Map();
    triangles(model, (p, q, r, normal, area) => {
      if (normal.y < 0.95) return;
      const y = Math.round((p.y - model.box.min.y) * 100) / 100;
      sums.set(y, (sums.get(y) || 0) + area);
    });
    return [...sums]
      .filter(([, area]) => area > size.x * size.z * share)
      .map(([y]) => y * model.scale)
      .sort((p, q) => p - q);
  }

  // The biggest flat face that looks forward, as a plane to lay a picture on.
  function screen(key, x, y, z, { rot = 0, s = 1, inset = 0.92 } = {}) {
    const model = models.get(key);
    if (!model) return null;
    const groups = new Map();
    const v = new THREE.Vector3();
    triangles(model, (p, q, r, normal, area, index) => {
      if (normal.z < 0.5 || Math.abs(normal.x) > 0.05) return;
      const d = normal.dot(p);
      const id = `${index}:${normal.y.toFixed(2)}:${Math.round(d * 400)}`;
      let g = groups.get(id);
      if (!g) {
        v.copy(UP).addScaledVector(normal, -UP.dot(normal)).normalize();
        g = { area: 0, normal: normal.clone(), up: v.clone(), d, u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
        groups.set(id, g);
      }
      g.area += area;
      for (const point of [p, q, r]) {
        g.u0 = Math.min(g.u0, point.x);
        g.u1 = Math.max(g.u1, point.x);
        const t = point.dot(g.up);
        g.v0 = Math.min(g.v0, t);
        g.v1 = Math.max(g.v1, t);
      }
    });
    let best = null;
    for (const g of groups.values()) if (!best || g.area > best.area) best = g;
    if (!best) return null;
    const centre = new THREE.Vector3((best.u0 + best.u1) / 2, 0, 0)
      .addScaledVector(best.up, (best.v0 + best.v1) / 2)
      .addScaledVector(best.normal, best.d + 0.003);
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), best.up, best.normal).setPosition(centre);
    return {
      matrix: placement(model, x, y, z, rot, s, [1, 1, 1]).multiply(local),
      w: (best.u1 - best.u0) * inset,
      h: (best.v1 - best.v0) * inset,
    };
  }

  return { put, levels, screen, sizeOf, has: (key) => models.has(key) };
}
