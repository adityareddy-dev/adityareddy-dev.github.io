import * as THREE from 'three';
import { Batch } from './batch.js';
import * as tex from './textures.js';
import { WALL, HOUSE, SPLIT, DOWN, STAIR } from './plan.js';
import { loadKit } from './kit.js';
import { buildShell } from './shell.js';
import { furnish } from './furnish.js';
import { createLights } from './lights.js';
import { createLife } from './life.js';

const KEYS = [
  'bed', 'nightstand', 'lamp', 'lamp_floor', 'desk', 'chair_office', 'monitor', 'laptop', 'keyboard', 'bookshelf', 'bookshelf_open',
  'sofa', 'coffee_table', 'tv', 'tv_cabinet', 'counter', 'counter_upper', 'sink', 'stove', 'fridge', 'coffee_machine', 'kitchen_bar',
  'table', 'chair', 'stool', 'plant', 'rug', 'rug_round', 'bench', 'trashcan', 'toaster', 'pillow',
];
export const MODELS = KEYS;
const BATCHES = ['up', 'upGlass', 'upGlow', 'upLit', 'wallA', 'wallB', 'shaft', 'down', 'downGlass', 'downGlow', 'downLit', 'yard'];
const EDGE = 0.16;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Soft dark patches under the furniture, all in one mesh.
function contactShadows(list, y, map) {
  if (!list.length) return null;
  const position = [];
  const uv = [];
  const band = 0.28;
  const outside = band * 0.47;
  for (const [cx, cz, w, d] of list) {
    const inside = (size) => Math.min(band - outside, size / 2);
    const xs = [cx - w / 2 - outside, cx - w / 2 + inside(w), cx + w / 2 - inside(w), cx + w / 2 + outside];
    const zs = [cz - d / 2 - outside, cz - d / 2 + inside(d), cz + d / 2 - inside(d), cz + d / 2 + outside];
    const t = [0, 0.5, 0.5, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        if (xs[i + 1] - xs[i] < 1e-5 || zs[j + 1] - zs[j] < 1e-5) continue;
        const corners = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j + 1], [i + 1, j], [i, j]];
        for (const [a, b] of corners) {
          position.push(xs[a], y, zs[b]);
          uv.push(t[a], t[b]);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const material = new THREE.MeshBasicMaterial({ map, color: 0x1a1420, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, material);
  mesh.renderOrder = 1;
  mesh.name = 'contact shadows';
  return mesh;
}

export async function createWorld(ctx) {
  const { scene, bus } = ctx;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const groups = {};
  for (const name of ['ground', 'upper', 'shaft', 'lower']) {
    groups[name] = new THREE.Group();
    groups[name].name = name;
    root.add(groups[name]);
  }
  for (const name of ['wallA', 'wallB']) {
    groups[name] = new THREE.Group();
    groups[name].name = name;
    groups.upper.add(groups[name]);
  }

  const glow = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissive: 0xffc98a, emissiveIntensity: 0.12 });
  const materials = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }),
    glowUp: glow(),
    glowDown: glow(),
    lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.08, metalness: 0.95 }),
    hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  };
  materials.glowDown.emissiveIntensity = 1.5;

  const b = Object.fromEntries(BATCHES.map((name) => [name, new Batch()]));
  const kit = await loadKit(ctx, KEYS);
  const shell = buildShell(b);
  const colliders = shell.colliders;
  const made = furnish(ctx, { kit, b, materials, groups, colliders, shell });
  const { spawns, anchors } = made;

  const bake = (group, batch, material, name, shadows = true) => {
    const mesh = batch.mesh(material, { cast: shadows, receive: shadows, name });
    if (mesh) group.add(mesh);
  };
  bake(groups.upper, b.up, materials.paint, 'upstairs');
  bake(groups.upper, b.upGlass, materials.glass, 'upstairs glass', false);
  bake(groups.upper, b.upGlow, materials.glowUp, 'upstairs lamps', false);
  bake(groups.upper, b.upLit, materials.lit, 'upstairs lit', false);
  bake(groups.wallA, b.wallA, materials.paint, 'bedroom wall');
  bake(groups.wallB, b.wallB, materials.paint, 'workspace wall');
  bake(groups.shaft, b.shaft, materials.paint, 'stairs');
  bake(groups.lower, b.down, materials.paint, 'basement');
  bake(groups.lower, b.downGlass, materials.glass, 'basement glass', false);
  bake(groups.lower, b.downGlow, materials.glowDown, 'basement lamps', false);
  bake(groups.lower, b.downLit, materials.lit, 'basement lit', false);
  bake(groups.ground, b.yard, materials.paint, 'garden');
  const lay = (group, list) => list.filter(Boolean).forEach((mesh) => group.add(mesh));
  lay(groups.upper, shell.floors.up);
  lay(groups.shaft, shell.floors.shaft);
  lay(groups.lower, shell.floors.down);
  lay(groups.ground, shell.floors.yard);
  const shadowMap = tex.softShadow();
  lay(groups.upper, [contactShadows(made.decals.up, 0.018, shadowMap)]);
  lay(groups.lower, [contactShadows(made.decals.down, DOWN + 0.018, shadowMap)]);

  const lights = createLights(ctx, { root, lamps: made.lamps, materials });
  const life = createLife(ctx, { groups, materials, life: made.life, lamps: made.lamps, lights });

  const room = (id, name, floor, minX, maxX) => ({
    id,
    name,
    floor,
    bounds: { minX, maxX, minZ: HOUSE.minZ, maxZ: HOUSE.maxZ },
    center: new THREE.Vector3((minX + maxX) / 2, floor, 0),
  });
  const rooms = {
    bedroom: room('bedroom', 'Bedroom', 0, HOUSE.minX, SPLIT.a),
    kitchen: room('kitchen', 'Kitchen', 0, SPLIT.a, SPLIT.b),
    workspace: room('workspace', 'Workspace', 0, SPLIT.b, HOUSE.maxX),
    basement: room('basement', 'Basement', DOWN, STAIR.minX, HOUSE.maxX),
  };

  const stair = {
    top: new THREE.Vector3(STAIR.midX, 0, STAIR.topZ - 0.15),
    mid: new THREE.Vector3(STAIR.midX, DOWN / 2, STAIR.topZ + STAIR.run * 5),
    bottom: new THREE.Vector3(STAIR.midX, DOWN, STAIR.bottomZ + 0.15),
  };
  const links = [
    { a: stair.mid, b: stair.bottom },
    { a: stair.mid, b: stair.top },
    { a: stair.top, b: stair.bottom },
  ];
  const onStairs = (p) => p.x > STAIR.minX && p.x < STAIR.maxX && p.z > STAIR.topZ;

  function heightAt(p) {
    if (onStairs(p)) {
      const f = clamp((p.z - STAIR.topZ) / STAIR.run, 0, STAIR.steps);
      const i = Math.floor(f);
      const k = Math.min(1, (f - i) / 0.4);
      return Math.max(DOWN, -STAIR.rise * (i + k * k * (3 - 2 * k)));
    }
    return p.y > DOWN / 2 ? 0 : DOWN;
  }

  let storey = 'up';
  let cutaway = 'bedroom';
  let relit = true;
  // The basement takes over three steps down, before anything upstairs can hide him.
  const below = (y) => y < (storey === 'down' ? -0.3 : -0.5);

  function roomAt(p) {
    if (p.x < HOUSE.minX - 0.4 || p.x > HOUSE.maxX + 0.4 || p.z < HOUSE.minZ - 0.4 || p.z > HOUSE.maxZ + 0.4) return null;
    if (below(p.y)) return 'basement';
    if (p.x < SPLIT.a) return 'bedroom';
    return p.x < SPLIT.b ? 'kitchen' : 'workspace';
  }

  // A hidden storey also moves off the layer clicks are tested on.
  function show(group, on) {
    group.visible = on;
    group.traverse((o) => o.layers.set(on ? 0 : 1));
  }

  const walls = [
    { group: groups.wallA, s: 1, want: 1, down: 'bedroom', shown: true },
    { group: groups.wallB, s: 1, want: 1, down: 'kitchen', shown: true },
  ];
  function poseWall(w, force) {
    const on = w.s > 0.02;
    w.group.scale.y = Math.max(0.02, w.s);
    w.group.position.y = WALL.stub * (1 - w.group.scale.y);
    if (storey !== 'up' || (!force && w.shown === on)) return;
    w.shown = on;
    show(w.group, on);
  }
  function aimWalls(id, snap) {
    if (id && id !== 'basement') for (const w of walls) w.want = w.down === id ? 0 : 1;
    if (snap) {
      for (const w of walls) {
        w.s = w.want;
        poseWall(w);
      }
    }
  }

  function setStorey(next) {
    storey = next;
    const up = next === 'up';
    show(groups.lower, !up);
    show(groups.ground, up);
    show(groups.upper, up);
    if (up) walls.forEach((w) => poseWall(w, true));
    lights.setStorey(next, ctx.clock?.now ?? 420);
    relit = true;
  }

  function setCutaway(id) {
    cutaway = id;
    if (!id) return;
    const next = id === 'basement' ? 'down' : 'up';
    if (next !== storey) {
      setStorey(next);
      aimWalls(id, true);
    } else aimWalls(id, false);
  }

  bus?.on?.('player:teleport', (e) => {
    const p = e?.position || ctx.player?.position;
    if (!p) return;
    const next = below(p.y) ? 'down' : 'up';
    if (next !== storey) setStorey(next);
    aimWalls(roomAt(p), true);
    tuckIn();
  });

  // Dropped on the bed standing up, he lies down instead and gets up beside it.
  function tuckIn() {
    const player = ctx.player;
    const bed = spawns.start;
    if (!player?.lieAt || !player.teleport || player.anim !== 'idle') return;
    if (player.position.distanceToSquared(bed.position) > 1e-4) return;
    player.teleport(spawns.bedside.position, spawns.bedside.facing);
    player.lieAt(bed.position, bed.facing);
  }
  let tucked = false;

  const up = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const down = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DOWN);
  const ramp = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, STAIR.run, STAIR.rise).normalize(), new THREE.Vector3(0, 0, STAIR.topZ));
  const hit = new THREE.Vector3();

  // The flight itself in the basement, and the hole it leaves upstairs.
  const underFlight = (p) => onStairs(p) && p.z < STAIR.bottomZ;
  const inHole = (p) => onStairs(p) && p.z < HOUSE.maxZ;

  // A floor spot he can stand on. Otherwise the nearest one that isn't on the stairs,
  // or the path finder picks a spot halfway down them.
  function standable(p, onFlight) {
    const blocked = (q) => onFlight(q) || !!ctx.collide?.blocked?.(q);
    if (!blocked(p)) return p;
    const q = p.clone();
    for (let r = 0.05; r <= 3; r += 0.05) {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        q.set(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
        if (!blocked(q)) return q;
      }
    }
    return p;
  }

  // Where a click lands. A click on the stairs means the other end of them.
  function groundAt(ray) {
    if (storey === 'down') {
      if (ray.intersectPlane(ramp, hit) && onStairs(hit) && hit.y > DOWN + 0.2 && hit.y < 0) return stair.top.clone();
      if (!ray.intersectPlane(down, hit)) return null;
      if (underFlight(hit)) return stair.top.clone();
      const p = new THREE.Vector3(clamp(hit.x, STAIR.minX + EDGE, HOUSE.maxX - EDGE), DOWN, clamp(hit.z, HOUSE.minZ + EDGE, HOUSE.maxZ - EDGE));
      return standable(p, underFlight);
    }
    if (!ray.intersectPlane(up, hit)) return null;
    if (inHole(hit)) return stair.bottom.clone();
    const p = new THREE.Vector3(clamp(hit.x, HOUSE.minX + EDGE, HOUSE.maxX - EDGE), 0, clamp(hit.z, HOUSE.minZ + EDGE, HOUSE.maxZ - EDGE));
    return standable(p, inHole);
  }

  function update(dt) {
    const p = ctx.player?.position;
    if (p) {
      const next = below(p.y) ? 'down' : 'up';
      if (next !== storey) {
        setStorey(next);
        aimWalls(roomAt(p), true);
      }
    }
    if (lights.update(ctx.clock?.now ?? 420)) relit = true;
    if (storey === 'up') {
      const ease = 1 - Math.exp(-9 * dt);
      for (const w of walls) {
        if (w.s === w.want) continue;
        w.s += (w.want - w.s) * ease;
        if (Math.abs(w.want - w.s) < 0.004) w.s = w.want;
        poseWall(w);
      }
    }
    life.update(dt, { storey, relit });
    relit = false;
  }

  show(groups.lower, false);
  aimWalls('bedroom', true);
  lights.setStorey('up', ctx.clock?.now ?? 420);
  life.aimBeams();

  return {
    root,
    rooms,
    colliders,
    bounds: { ...HOUSE },
    spawns,
    links,
    roomAt,
    heightAt,
    groundAt,
    update,
    setCutaway(id) {
      setCutaway(id);
      if (!tucked) {
        tucked = true;
        tuckIn();
      }
    },
    // Extras beyond the contract.
    anchors,
    lights,
    get storey() {
      return storey;
    },
    get cutaway() {
      return cutaway;
    },
  };
}
