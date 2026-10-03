import * as THREE from 'three';
import { Batch } from './batch.js';
import * as tex from './textures.js';
import * as props from './props.js';
import { HOUSE, DOWN, DOORS, WINDOWS, WALL, INK, STAIR } from './plan.js';

const HALF = Math.PI / 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Runs fn with every batch in the list moved to the same spot.
function at(list, x, y, z, rot, fn) {
  const run = (i) => (i === list.length ? fn(...list) : list[i].at(x, y, z, rot, () => run(i + 1)));
  run(0);
}

// Puts the furniture in and registers everything the player can use.
export function furnish(ctx, { kit, b, materials, groups, colliders, shell }) {
  const story = ctx.data?.story || {};
  const content = ctx.data?.content || {};
  const decals = { up: [], down: [] };
  const up = { solid: b.up, glass: b.upGlass, glow: b.upGlow, lit: b.upLit, floor: 0, decals: decals.up, parent: groups.upper };
  const down = { solid: b.down, glass: b.downGlass, glow: b.downGlow, lit: b.downLit, floor: DOWN, decals: decals.down, parent: groups.lower };
  const anchors = {};
  const lamps = [];
  const life = { screens: [] };

  const solid = (t, f, pad = 0.02) =>
    colliders.push({ minX: f.minX + pad, maxX: f.maxX - pad, minZ: f.minZ + pad, maxZ: f.maxZ - pad, floor: t.floor });
  const shade = (t, f, grow = 1) =>
    t.decals.push([(f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, (f.maxX - f.minX) * grow, (f.maxZ - f.minZ) * grow]);
  const area = (x0, z0, x1, z1) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const top = (key, fallback) => {
    const l = kit.levels(key);
    return l.length ? l[l.length - 1] : fallback;
  };

  // Stands a model on the floor at x, z. Pass y for things that sit on furniture.
  function place(t, key, x, z, o = {}) {
    const onFloor = o.y === undefined;
    const f = kit.put(t, key, x, onFloor ? t.floor : o.y, z, o);
    if (onFloor && o.solid !== false) solid(t, f, o.pad);
    if (onFloor && o.shade !== false) shade(t, f);
    return f;
  }

  function picture(map, w, h, matrix, lit = false) {
    const material = lit ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    if (matrix) mesh.applyMatrix4(matrix);
    mesh.receiveShadow = !lit;
    return mesh;
  }

  function screenOn(group, key, map, x, y, z, o) {
    const s = kit.screen(key, x, y, z, o);
    if (!s) return null;
    const mesh = picture(map, s.w, s.h, s.matrix, true);
    group.add(mesh);
    life.screens.push(mesh);
    return mesh;
  }

  const unit = new THREE.BoxGeometry(1, 1, 1);
  function usable(t, def, build) {
    const own = { ...t, solid: new Batch() };
    const group = new THREE.Group();
    group.name = def.id;
    build(own, group);
    const mesh = own.solid.mesh(materials.paint, { name: def.id });
    if (mesh) group.add(mesh);
    const [hx, hy, hz, hw, hh, hd] = def.hit;
    const hit = new THREE.Mesh(unit, materials.hit);
    hit.position.set(hx, hy, hz);
    hit.scale.set(hw, hh, hd);
    hit.visible = false;
    hit.name = `${def.id} hit`;
    group.add(hit);
    (def.parent || t.parent).add(group);
    ctx.interact.add({
      id: def.id,
      label: def.label,
      prompt: def.prompt,
      app: def.app,
      object: group,
      position: v3(...def.at),
      stand: v3(...def.stand),
      radius: def.radius,
    });
    return group;
  }

  // Bedroom.
  const bedTop = top('bed', 0.26);
  usable(
    up,
    { id: 'bed', label: 'Bed', prompt: 'Call it a day', at: [-4.86, 0, -1.25], stand: [-4.72, 0, -0.5], radius: 0.95, hit: [-4.86, 0.2, -1.25, 1.14, 0.42, 0.98] },
    (t) => {
      const f = kit.put(t, 'bed', -4.86, 0, -1.25, { rot: HALF, tint: { carpet: 0x5d7fb8, carpetDarker: 0x4c6ba3 } });
      solid(t, f, 0.03);
      shade(t, f);
    },
  );
  const standTop = top('nightstand', 0.38);
  place(up, 'nightstand', -5.36, -2.05, { rot: HALF });
  const bedLamp = place(up, 'lamp', -5.37, -2.05, { y: standTop, rot: HALF, s: 1.1 });
  lamps.push({ id: 'bedroom', position: v3(-5.37, bedLamp.top - 0.09, -2.05), size: 0.55, storey: 'up' });
  place(up, 'nightstand', -5.36, -0.44, { rot: HALF });
  at([b.up, b.upLit], -5.38, standTop, -0.52, HALF, (g, lit) => props.alarmClock(g, lit));
  b.up.at(-5.36, standTop, -0.32, 0.3, (g) => props.bookStack(g, 5, 2));
  b.up.at(-3.05, 0, -2.325, 0, (g) => props.wardrobe(g));
  solid(up, area(-3.4, -2.5, -2.7, -2.15), 0);
  shade(up, area(-3.42, -2.5, -2.68, -2.13));
  const dresser = place(up, 'tv_cabinet', -5.37, 1.95, { rot: HALF });
  b.up.at(-5.38, dresser.top, 2.15, 0, (g) => props.vase(g, INK.mustard));
  b.up.at(-5.36, dresser.top, 1.78, 0.5, (g) => props.bookStack(g, 9, 3));
  b.up.cyl(-5.49, 0.82, 1.95, 0.19, 0.022, INK.walnut, { axis: 'x', seg: 26 });
  b.up.cyl(-5.478, 0.82, 1.95, 0.165, 0.008, 0xd3e4ee, { axis: 'x', seg: 26 });
  place(up, 'bench', -4.12, -1.25, { rot: HALF, tint: { carpet: INK.mustard, carpetDarker: 0xc48f2c } });
  place(up, 'rug_round', -3.75, 0.9, { s: 1.4, solid: false, shade: false, tint: { carpet: 0xe9dcc6, carpetDarker: 0xc9b393 } });
  place(up, 'plant', -2.8, 2.15, { s: 0.95, pad: 0.04 });
  b.up.at(-2.82, 0, -1.72, 0, (g) => props.basket(g));
  solid(up, area(-2.92, -1.82, -2.72, -1.62), 0);
  shade(up, area(-2.95, -1.85, -2.69, -1.59));
  b.up.at(-4.52, 0, -0.56, 2.2, (g) => props.slippers(g));
  b.up.at(HOUSE.minX, 0.86, -1.25, HALF, (g) => props.picture(g, 0.6, 0.36, { art: 1 }));
  b.up.at(-5.02, 0.9, HOUSE.minZ, 0, (g) => props.picture(g, 0.26, 0.32, { art: 3, frame: INK.black }));
  let w = WINDOWS.bedroomBack;
  b.up.at(0, 0, HOUSE.minZ, 0, (g) => props.curtains(g, w.from, w.to, w.top, w.bottom, 0xe9c46a, 0xd9b04e));
  w = WINDOWS.bedroomWest;
  b.up.at(HOUSE.minX, 0, 0, HALF, (g) => props.curtains(g, -w.to, -w.from, w.top, w.bottom, 0xe9c46a, 0xd9b04e));

  // Kitchen.
  const cabinet = { wood: 0x5c7c8c, woodDark: 0x4a6877 };
  const counterTop = top('counter', 0.43);
  usable(
    up,
    { id: 'fridge', label: 'Fridge', prompt: 'Find lunch', at: [-2.17, 0, -2.3], stand: [-2.17, 0, -1.88], radius: 0.6, hit: [-2.17, 0.56, -2.32, 0.54, 1.12, 0.38] },
    (t) => {
      const f = kit.put(t, 'fridge', -2.17, 0, -2.326, { s: 1.2 });
      solid(t, f, 0);
      shade(t, f);
    },
  );
  const line = [
    ['counter', -1.685],
    ['sink', -1.255],
    ['counter', -0.825],
    ['stove', -0.395],
  ];
  for (const [key, x] of line) place(up, key, x, -2.275, { tint: cabinet, solid: false, shade: false });
  solid(up, area(-1.9, -2.5, -0.18, -2.05), 0);
  shade(up, area(-1.95, -2.5, -0.13, -2.0));
  place(up, 'counter_upper', -1.685, -2.39, { y: 0.8, tint: cabinet });
  b.up.box(-1.04, 0.535, HOUSE.minZ + 0.004, 1.72, 0.17, 0.008, 0xdde9e4);
  b.up.at(-0.395, 0.9, HOUSE.minZ, 0, (g) => props.hood(g, WALL.height - 0.9));
  place(up, 'toaster', -1.72, -2.3, { y: counterTop });
  b.up.at(-1.5, counterTop, -2.16, 0.6, (g) => props.mug(g, INK.coral));
  usable(
    up,
    { id: 'coffeeMachine', label: 'Coffee machine', prompt: 'Make coffee', at: [-0.825, 0, -2.2], stand: [-0.825, 0, -1.82], radius: 0.55, hit: [-0.825, counterTop + 0.12, -2.28, 0.28, 0.26, 0.32] },
    (t) => {
      const f = kit.put(t, 'coffee_machine', -0.825, counterTop, -2.29, { s: 1.2, tint: { metal: 0x2f3138, metalMedium: INK.mustard } });
      life.steam = v3(-0.825, f.top + 0.02, -2.27);
      t.solid.at(-0.64, counterTop, -2.2, 2.4, (g) => props.mug(g, INK.white));
    },
  );
  place(up, 'trashcan', 0.12, -2.36, { s: 0.7 });
  at([b.up], 0.2, 0.8, HOUSE.minZ, 0, (g) => {
    props.wallShelf(g, 0.5);
    g.at(-0.16, 0.01, 0.07, 0.4, (m) => props.mug(m, INK.white));
    g.at(-0.04, 0.01, 0.07, 1.4, (m) => props.mug(m, INK.mustard));
    g.at(0.08, 0.01, 0.07, -0.6, (m) => props.mug(m, INK.teal));
    g.cyl(0.19, 0.04, 0.07, 0.028, 0.06, 0xc9744e, { top: 1.25, seg: 10 });
    g.ball(0.19, 0.1, 0.07, 0.04, INK.leaf, { detail: 1 });
  });
  life.clock = { position: v3(0.88, 1.17, HOUSE.minZ + 0.004), radius: 0.095 };
  b.up.cyl(0.88, 1.17, HOUSE.minZ + 0.012, 0.105, 0.024, INK.walnut, { axis: 'z', seg: 26 });
  b.up.cyl(0.88, 1.17, HOUSE.minZ + 0.024, 0.09, 0.004, INK.paper, { axis: 'z', seg: 26 });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    b.up.box(0.88 + Math.sin(a) * 0.075, 1.17 + Math.cos(a) * 0.075, HOUSE.minZ + 0.027, 0.006, i % 3 ? 0.012 : 0.02, 0.002, INK.black, { rotZ: -a });
  }
  const barTop = top('kitchen_bar', 0.42);
  for (const x of [-1.635, -1.205, -0.775]) place(up, 'kitchen_bar', x, -1.0, { tint: cabinet, solid: false, shade: false });
  solid(up, area(-1.85, -1.105, -0.56, -0.895), 0);
  shade(up, area(-1.9, -1.15, -0.51, -0.85));
  for (const x of [-1.52, -0.9]) place(up, 'stool', x, -0.68, { s: 0.78, tint: { carpet: INK.mustard, carpetDarker: 0xc48f2c }, pad: 0.03 });
  b.up.at(-0.8, barTop, -1.0, 0, (g) => {
    g.cyl(0, 0.022, 0, 0.07, 0.044, INK.white, { top: 1.5, seg: 16 });
    g.ball(-0.03, 0.06, 0.01, 0.03, 0xd9483b, { detail: 1 });
    g.ball(0.03, 0.06, -0.015, 0.03, 0xe8943a, { detail: 1 });
    g.ball(0.005, 0.07, 0.035, 0.028, 0x8fbf4a, { detail: 1 });
  });
  b.up.at(-1.6, barTop, -0.98, 2.2, (g) => props.mug(g, INK.blue));
  at([b.up, b.upGlow], -1.2, 0.98, -1.0, 0, (g, glow) => props.pendant(g, glow, 0x35454f, 0.45));
  lamps.push({ id: 'kitchen', position: v3(-1.2, 0.97, -1.0), size: 0.5, storey: 'up' });

  // Living room, the open half of the kitchen.
  const cabTop = top('tv_cabinet', 0.31);
  place(up, 'tv_cabinet', -2.315, 1.3, { rot: HALF });
  const tv = tex.television();
  life.tv = tv;
  usable(
    up,
    { id: 'tv', label: 'TV', prompt: "See what's on", at: [-2.3, 0, 1.3], stand: [-1.94, 0, 1.3], radius: 0.6, hit: [-2.32, cabTop + 0.24, 1.3, 0.16, 0.48, 0.72] },
    (t, group) => {
      kit.put(t, 'tv', -2.33, cabTop, 1.3, { rot: HALF });
      screenOn(group, 'tv', tv.texture, -2.33, cabTop, 1.3, { rot: HALF, inset: 0.96 });
    },
  );
  const tableTop = top('coffee_table', 0.23);
  place(up, 'coffee_table', -1.45, 1.3, { rot: HALF });
  b.up.at(-1.47, tableTop, 1.12, 0.4, (g) => props.bookStack(g, 21, 2));
  b.up.at(-1.42, tableTop, 1.45, -0.7, (g) => props.mug(g, INK.white));
  b.up.box(-1.5, tableTop + 0.008, 1.3, 0.03, 0.014, 0.1, INK.steelDark, { r: 0.005, rotY: 0.3 });
  const seat = top('sofa', 0.2);
  usable(
    up,
    { id: 'sofa', label: 'Sofa', prompt: 'Sit for a minute', at: [-0.55, 0, 1.3], stand: [-1.0, 0, 1.3], radius: 0.65, hit: [-0.55, 0.24, 1.3, 0.44, 0.48, 1.0] },
    (t) => {
      const f = kit.put(t, 'sofa', -0.55, 0, 1.3, { rot: -HALF, tint: { carpet: 0x3f8f8a, carpetDarker: 0x347a76 } });
      solid(t, f, 0.02);
      shade(t, f);
      kit.put(t, 'pillow', -0.47, seat, 0.98, { rot: -HALF + 0.25, s: 0.8, tint: { carpet: INK.mustard } });
      kit.put(t, 'pillow', -0.47, seat, 1.64, { rot: -HALF - 0.2, s: 0.8, tint: { carpet: 0xf2ece0 } });
    },
  );
  anchors.sofa = { position: v3(-0.63, seat, 1.3), facing: -HALF };
  place(up, 'rug', -1.32, 1.3, { rot: HALF, s: 1.12, solid: false, shade: false, tint: { carpet: 0x4a6480, carpetDarker: 0xe9dcc6 } });
  const livingLamp = place(up, 'lamp_floor', -0.42, 2.26, { pad: 0.01 });
  lamps.push({ id: 'living', position: v3(-0.42, livingLamp.top - 0.3, 2.26), size: 0.7, storey: 'up' });
  usable(
    up,
    { id: 'plant', label: 'Plant', prompt: 'Check on the plant', at: [0.45, 0, 2.1], stand: [0.45, 0, 1.72], radius: 0.6, hit: [0.45, 0.36, 2.1, 0.3, 0.72, 0.3] },
    (t) => {
      const f = kit.put(t, 'plant', 0.45, 0, 2.1, { s: 1.1, tint: { wood: 0xc9744e } });
      solid(t, f, 0.05);
      shade(t, f);
    },
  );
  const diningTop = top('table', 0.33);
  place(up, 'table', 1.15, 0.75);
  for (const [x, z, rot] of [[0.95, 0.38, 0], [1.36, 0.38, 0], [0.95, 1.12, Math.PI], [1.36, 1.12, Math.PI]]) {
    place(up, 'chair', x, z, { rot, pad: 0.03 });
  }
  b.up.at(1.15, diningTop, 0.75, 0, (g) => props.vase(g, INK.teal));

  const door = DOORS.front;
  const doorX = (door.from + door.to) / 2;
  usable(
    up,
    { id: 'frontDoor', label: 'Front door', prompt: 'Think about going outside', at: [doorX, 0, -2.45], stand: [doorX, 0, -2.1], radius: 0.55, hit: [doorX, 0.52, -2.53, 0.6, 1.06, 0.14] },
    (t) => at([t.solid, t.glass], doorX, 0.004, HOUSE.minZ - WALL.thick / 2, 0, (g, glass) => props.frontDoor(g, glass, door.to - door.from, door.top - 0.004)),
  );
  b.up.at(doorX, 0, -2.3, 0, (g) => props.doormat(g));
  b.up.at(1.62, 0.8, HOUSE.minZ, 0, (g) => props.coatHooks(g));

  const shelfLevels = kit.levels('bookshelf_open');
  usable(
    up,
    { id: 'portfolioShelf', label: 'Projects', prompt: 'Look at the projects', app: 'portfolio', at: [2.3, 0, -2.375], stand: [2.3, 0, -1.98], radius: 0.65, hit: [2.3, 0.55, -2.375, 0.44, 1.12, 0.28] },
    (t, group) => {
      const f = kit.put(t, 'bookshelf_open', 2.3, 0, -2.375, {});
      solid(t, f, 0);
      shade(t, f);
      const y = (i, fallback) => shelfLevels[i] ?? fallback;
      kit.put(t, 'laptop', 2.3, y(2, 0.45), -2.38, { s: 0.85 });
      screenOn(group, 'laptop', tex.codeScreen(), 2.3, y(2, 0.45), -2.38, { s: 0.85 });
      t.solid.at(2.24, y(1, 0.24), -2.37, 0.3, (g) => props.stopwatch(g));
      t.solid.at(2.4, y(1, 0.24), -2.38, 0, (g) => props.bookStack(g, 31, 2));
      t.solid.at(2.2, y(0, 0.03), -2.37, 0, (g) => props.bookRow(g, 0.2, 77, { tall: 0.13, depth: 0.1 }));
      t.solid.at(2.3, f.top + 0.12, HOUSE.minZ + 0.03, 0, (g) => g.box(0, 0, 0, 0.24, 0.24, 0.02, INK.black, { r: 0.006, rotX: -0.12 }));
      const print = picture(tex.sitePrint(), 0.2, 0.2);
      print.position.set(2.3, f.top + 0.12, HOUSE.minZ + 0.042);
      print.rotation.x = -0.12;
      group.add(print);
    },
  );

  // Workspace.
  const board = { x: 4.74, y: 0.78, w: 1.3, h: 0.7 };
  usable(
    up,
    { id: 'whiteboard', label: 'Whiteboard', prompt: 'Draw the system', at: [board.x, 0, -2.45], stand: [board.x, 0, -2.0], radius: 0.75, hit: [board.x, board.y, -2.46, board.w + 0.06, board.h + 0.1, 0.1] },
    (t, group) => {
      t.solid.at(board.x, board.y, HOUSE.minZ, 0, (g) => props.whiteboardFrame(g, board.w, board.h));
      const face = picture(tex.whiteboard(), board.w - 0.02, board.h - 0.02);
      face.material.roughness = 0.32;
      face.position.set(board.x, board.y, HOUSE.minZ + 0.0235);
      group.add(face);
    },
  );
  const deskTop = top('desk', 0.38);
  usable(
    up,
    { id: 'desk', label: 'Desk', prompt: 'Read the resume', app: 'resume', at: [5.765, 0, -2.3], stand: [5.7, 0, -1.86], radius: 0.6, hit: [5.765, 0.24, -2.3, 0.72, 0.5, 0.4] },
    (t) => {
      const f = kit.put(t, 'desk', 5.765, 0, -2.305, {});
      solid(t, f, 0);
      shade(t, f);
      t.solid.at(5.7, deskTop, -2.24, 0.12, (g) => props.paper(g));
      t.solid.at(5.93, deskTop, -2.22, -0.5, (g) => props.mug(g, INK.blue));
      t.solid.at(5.52, deskTop, -2.2, 0.5, (g) => props.bookStack(g, 44, 2));
    },
  );
  const deskLamp = place(up, 'lamp', 5.52, -2.4, { y: deskTop, s: 1.05 });
  lamps.push({ id: 'workspace', position: v3(5.52, deskLamp.top - 0.09, -2.4), size: 0.5, storey: 'up' });
  place(up, 'desk', 6.495, -2.305, { pad: 0 });
  usable(
    up,
    { id: 'monitor', label: 'Monitors', prompt: 'Look at the screen', app: 'contributions', at: [6.5, 0, -2.3], stand: [6.3, 0, -1.86], radius: 0.6, hit: [6.5, deskTop + 0.16, -2.36, 0.76, 0.34, 0.16] },
    (t, group) => {
      const screens = [
        [6.31, 0.16, tex.codeScreen()],
        [6.69, -0.16, tex.flameScreen()],
      ];
      for (const [x, rot, map] of screens) {
        kit.put(t, 'monitor', x, deskTop, -2.37, { rot, s: 0.95, tint: { metal: 0x1b1f27 } });
        screenOn(group, 'monitor', map, x, deskTop, -2.37, { rot, s: 0.95, inset: 0.94 });
      }
      kit.put(t, 'keyboard', 6.48, deskTop, -2.19, {});
      t.solid.at(6.72, deskTop, -2.19, 0.1, (g) => props.mouse(g));
    },
  );
  life.deskGlow = v3(6.5, deskTop + 0.004, -2.24);
  const chair = place(up, 'chair_office', 6.75, -1.7, { rot: Math.PI - 0.45, tint: { carpet: 0x3b4252, carpetDarker: 0x2f3542 }, pad: 0.03 });
  anchors.deskChair = { position: v3(chair.x, top('chair_office', 0.22), chair.z), facing: Math.PI - 0.45 };
  place(up, 'trashcan', 7.04, -2.36, { s: 0.62 });
  const workLamp = place(up, 'lamp_floor', 7.3, -2.3, { pad: 0.01 });
  lamps.push({ id: 'office', position: v3(7.3, workLamp.top - 0.3, -2.3), size: 0.7, storey: 'up', minor: true });
  place(up, 'rug_round', 6.35, -1.55, { s: 1.6, solid: false, shade: false, tint: { carpet: 0x59657a, carpetDarker: 0xe0a93b } });
  b.up.at(7.12, 0.9, HOUSE.minZ, 0, (g) => props.picture(g, 0.3, 0.4, { art: 2, frame: INK.white }));

  const caseLevels = kit.levels('bookshelf');
  usable(
    up,
    { id: 'bookshelf', label: 'Bookshelf', prompt: 'Read the articles', app: 'articles', at: [3.505, 0, -2.375], stand: [3.505, 0, -1.95], radius: 0.65, hit: [3.505, 0.44, -2.37, 0.84, 0.9, 0.28] },
    (t) => {
      [3.3, 3.71].forEach((x, n) => {
        const f = kit.put(t, 'bookshelf', x, 0, -2.375, {});
        solid(t, f, 0);
        shade(t, f);
        caseLevels.slice(0, -1).forEach((y, i) => {
          t.solid.at(x - 0.16, y, -2.36, 0, (g) => props.bookRow(g, 0.32, 100 + n * 10 + i, { tall: 0.16, depth: 0.12 }));
        });
        if (n === 0) t.solid.at(x, f.top, -2.375, 0.4, (g) => props.bookStack(g, 61, 3));
        else t.solid.at(x, f.top, -2.375, 0, (g) => {
          g.cyl(0, 0.04, 0, 0.045, 0.08, 0xc9744e, { top: 1.2, seg: 10 });
          g.ball(0, 0.12, 0, 0.065, INK.leaf, { detail: 1 });
          g.ball(0.04, 0.16, 0.02, 0.04, INK.leafDark, { detail: 1 });
        });
      });
    },
  );
  const judged = Array.isArray(content.judging) ? content.judging.length : 0;
  usable(
    up,
    {
      id: 'badgeWall',
      label: judged ? 'Judging badges' : 'Empty frames',
      prompt: judged ? 'Look at the badges' : 'Look at the frames',
      app: 'judging',
      at: [3.1, 0, 0.1],
      stand: [3.5, 0, 0.1],
      radius: 0.7,
      hit: [3.08, 0.78, 0.1, 0.08, 0.7, 1.02],
      parent: groups.wallB,
    },
    (t) => t.solid.at(3 + WALL.thick / 2, 0.78, 0.1, HALF, (g) => props.badgeFrames(g, judged)),
  );
  // A corner to read in. Kept low so the stairs behind the wall stay in view.
  const couch = place(up, 'sofa', 3.36, 1.25, { rot: HALF, tint: { carpet: 0x66728a, carpetDarker: 0x566279 }, pad: 0.02 });
  const couchSeat = top('sofa', 0.2);
  kit.put(up, 'pillow', 3.3, couchSeat, 0.93, { rot: HALF + 0.2, s: 0.8, tint: { carpet: INK.mustard } });
  place(up, 'rug', 4.25, 1.25, { rot: HALF, s: 1.15, solid: false, shade: false, tint: { carpet: 0xd9cdb8, carpetDarker: 0x59657a } });
  place(up, 'coffee_table', 4.2, 1.25, { rot: HALF, s: 0.9 });
  b.up.at(4.2, top('coffee_table', 0.23) * 0.9, 1.1, 0.5, (g) => props.bookStack(g, 71, 3));
  b.up.at(4.22, top('coffee_table', 0.23) * 0.9, 1.5, 1.9, (g) => props.mug(g, INK.teal));
  anchors.couch = { position: v3(couch.x + 0.08, couchSeat, couch.z), facing: HALF };
  const benchTop = top('table', 0.33);
  place(up, 'table', 7.1, 0.9, { rot: HALF, pad: 0.01 });
  life.workbench = (() => {
    const group = new THREE.Group();
    group.name = 'workbench laptop';
    kit.put(up, 'laptop', 7.12, benchTop, 0.78, { rot: -HALF });
    screenOn(group, 'laptop', tex.flameScreen(), 7.12, benchTop, 0.78, { rot: -HALF });
    groups.upper.add(group);
    return group;
  })();
  b.up.at(7.05, benchTop, 1.12, 0.3, (g) => props.cardboard(g, 0.2, 0.13, 0.16));
  b.up.at(7.2, benchTop, 0.52, 1.1, (g) => props.mug(g, INK.coral));
  place(up, 'chair', 6.72, 0.82, { rot: HALF, pad: 0.03 });
  place(up, 'plant', 7.2, 2.2, { s: 1.0, pad: 0.04 });
  at([b.up], 3.4, 0, 2.26, 0, (g) => props.cardboard(g, 0.3, 0.22, 0.26));
  solid(up, area(3.25, 2.13, 3.55, 2.39), 0);
  shade(up, area(3.22, 2.1, 3.58, 2.42));

  // Basement.
  const D = DOWN;
  usable(
    down,
    { id: 'treadmill', label: 'Treadmill', prompt: 'Run in place', at: [3.47, D, -1.8], stand: [3.47, D, -1.05], radius: 0.85, hit: [3.47, D + 0.4, -1.8, 0.48, 0.8, 1.1] },
    (t) => {
      at([t.solid, t.lit], 3.47, D, -1.82, 0, (g, lit) => props.treadmill(g, lit));
      solid(t, area(3.25, -2.38, 3.69, -1.28), 0);
      shade(t, area(3.2, -2.42, 3.74, -1.24));
    },
  );
  anchors.treadmill = { position: v3(3.47, D + 0.1, -1.72), facing: Math.PI };
  b.down.at(4.75, D, -2.32, 0, (g) => props.dumbbellRack(g));
  solid(down, area(4.18, -2.5, 5.32, -2.16), 0);
  shade(down, area(4.15, -2.5, 5.35, -2.1));
  b.down.box(4.75, D + 0.82, HOUSE.minZ + 0.012, 1.5, 0.72, 0.024, INK.steelDark, { r: 0.008 });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.66), materials.mirror);
  mirror.position.set(4.75, D + 0.82, HOUSE.minZ + 0.0255);
  groups.lower.add(mirror);
  at([b.down, b.downLit], 4.75, D + 1.3, HOUSE.minZ, 0, (g, lit) => props.tubeLight(g, lit, 1.1));
  lamps.push({ id: 'tube', position: v3(4.75, D + 1.24, HOUSE.minZ + 0.2), size: 0, storey: 'down' });
  usable(
    down,
    { id: 'gymBench', label: 'Gym bench', prompt: 'Do a few sets', at: [5.4, D, 0.45], stand: [5.4, D, 1.2], radius: 0.85, hit: [5.4, D + 0.34, 0.4, 1.34, 0.7, 1.0] },
    (t) => {
      t.solid.at(5.4, D, 0.4, 0, (g) => props.benchPress(g));
      solid(t, area(5.06, -0.12, 5.74, 0.86), 0);
      shade(t, area(4.95, -0.2, 5.85, 0.95));
    },
  );
  anchors.gymBench = { position: v3(5.4, D + 0.27, 0.55), facing: 0 };
  at([b.down, b.downGlow], 5.4, D + 1.22, 0.4, 0, (g, glow) => props.pendant(g, glow, INK.steelDark, 0.3));
  lamps.push({ id: 'gym', position: v3(5.4, D + 1.2, 0.4), size: 0.5, storey: 'down' });
  b.down.at(6.72, D + 0.014, 1.55, 0.18, (g) => props.yogaMat(g));
  b.down.at(6.3, D + 0.014, 2.1, 0.1, (g) => props.rolledMat(g));
  b.down.at(6.98, D + 0.014, 0.95, 0, (g) => props.waterBottle(g));
  b.down.ball(6.95, D + 0.214, -0.75, 0.2, INK.mustard);
  solid(down, area(6.8, -0.9, 7.1, -0.6), 0);
  shade(down, area(6.72, -0.98, 7.18, -0.52));
  [[6.95, 0.0, 1.1, INK.black], [7.12, 0.24, 0.85, INK.red], [6.82, 0.3, 0.7, INK.blue]].forEach(([x, z, s, hex]) => {
    b.down.at(x, D + 0.014, z, x, (g) => props.kettlebell(g, s, hex));
  });
  solid(down, area(6.76, -0.08, 7.2, 0.36), 0.02);
  b.down.at(4.1, D + 0.014, 2.08, 0, (g) => props.plyoBox(g));
  solid(down, area(3.91, 1.89, 4.29, 2.27), 0);
  shade(down, area(3.86, 1.84, 4.34, 2.32));
  at([b.down, b.downLit], 2.56, D, -2.05, 0, (g, lit) => props.boiler(g, lit));
  b.down.at(2.6, D, -1.1, 0, (g) => props.cardboard(g, 0.42, 0.3, 0.36));
  b.down.at(2.56, D + 0.3, -1.08, 0.3, (g) => props.cardboard(g, 0.28, 0.2, 0.26));
  b.down.cyl(4.85, D + 1.4, HOUSE.minZ + 0.06, 0.022, 5.3, 0xb8693c, { axis: 'x', seg: 8 });
  b.down.cyl(4.85, D + 1.33, HOUSE.minZ + 0.05, 0.014, 5.3, INK.chrome, { axis: 'x', seg: 8 });
  for (const x of [3.2, 5.7, 7.2]) b.down.box(x, D + 1.38, HOUSE.minZ + 0.035, 0.03, 0.12, 0.07, INK.steelDark);
  const rack = place(down, 'bookshelf_open', 7.06, -2.375, {});
  shelfLevels.slice(0, 3).forEach((y, i) => {
    b.down.at(7.06 + (i % 2 ? 0.04 : -0.03), D + y, -2.38, i * 0.2, (g) => props.cardboard(g, 0.22 - i * 0.03, 0.14, 0.18));
  });
  b.down.at(7.06, rack.top, -2.38, 0, (g) => props.kettlebell(g, 0.7, INK.steel));

  const vault = shell.door;
  const vaultX = (vault.from + vault.to) / 2;
  const vaultW = vault.to - vault.from;
  const vaultH = vault.top - vault.bottom;
  usable(
    down,
    {
      id: 'backOfficeDoor',
      label: story.door?.label || 'Staff only',
      prompt: 'Try the door',
      at: [vaultX, D, -2.5],
      stand: [vaultX, D, -2.1],
      radius: 0.6,
      hit: [vaultX, D + vaultH / 2, -2.52, vaultW + 0.1, vaultH + 0.06, 0.16],
    },
    (t, group) => {
      t.solid.at(vaultX, D, HOUSE.minZ, 0, (g) => props.vaultDoor(g, vaultW, vaultH));
      const sign = picture(tex.sign(story.door?.sign || 'Staff only'), 0.42, 0.14);
      sign.position.set(vaultX, D + 0.72, HOUSE.minZ - 0.03 + 0.0265);
      group.add(sign);
    },
  );
  at([b.down, b.downLit], vaultX - vaultW / 2 - 0.16, D + 0.52, HOUSE.minZ, 0, (g, lit) => props.keypad(g, lit));
  life.led = v3(vaultX - vaultW / 2 - 0.16, D + 0.565, HOUSE.minZ + 0.027);
  b.down.at(vaultX, D + vaultH + 0.14, HOUSE.minZ, 0, (g) => props.cageLamp(g));
  life.alarm = v3(vaultX, D + vaultH + 0.1, HOUSE.minZ + 0.045);
  lamps.push({ id: 'door', position: v3(vaultX, D + vaultH + 0.1, HOUSE.minZ + 0.25), size: 0.3, storey: 'down', tint: 0xff5a48 });
  const stripe = picture(tex.hazard(), vaultW + 0.3, 0.12);
  stripe.rotation.x = -HALF;
  stripe.position.set(vaultX, D + 0.003, HOUSE.minZ + 0.14);
  groups.lower.add(stripe);
  life.doorGlow = v3(vaultX, D + 0.006, HOUSE.minZ + 0.16);
  lamps.push({ id: 'stairs', position: v3(STAIR.midX + 0.1, D + 1.25, -1.4), size: 0, storey: 'down' });

  // Garden.
  const yard = -WALL.plinth;
  [[-4.4, -4.5, 1.15, INK.leaf], [5.2, -4.7, 1.3, 0x4f9f6a], [9.6, -1.6, 1.0, INK.leaf], [-7.4, 0.6, 1.05, 0x4f9f6a], [1.4, -5.6, 0.9, INK.leafDark]].forEach(([x, z, s, hex]) => {
    b.yard.at(x, yard, z, x, (g) => props.tree(g, s, hex));
  });
  [[-5.0, 3.2, 1.0], [-2.2, 3.35, 0.8], [3.4, 3.3, 0.9], [8.2, 2.4, 1.0], [8.3, -0.6, 0.8], [8.15, -2.9, 1.1], [-6.3, -1.4, 0.9], [-0.6, -3.3, 0.9], [2.4, -3.2, 0.8]].forEach(([x, z, s], i) => {
    b.yard.at(x, yard, z, i, (g) => props.bush(g, s, i % 2 ? INK.leaf : 0x4f9f6a));
  });
  [[0.5, 3.15], [6.1, 3.2], [-3.7, 3.25], [8.25, 0.9]].forEach(([x, z], i) => b.yard.at(x, yard, z, i % 2 ? HALF : 0, (g) => props.flowers(g, 11 + i, 7)));
  for (let i = 0; i < 6; i += 1) {
    b.yard.at(doorX + Math.sin(i * 1.7) * 0.08, yard, -2.95 - i * 0.42, i * 0.9, (g) => props.stone(g, 0.95 + (i % 2) * 0.15));
  }
  b.yard.at(doorX + 0.5, yard, -5.3, 0, (g) => props.mailbox(g));
  b.yard.at(-9.0, yard, 4.6, 0, (g) => props.fence(g, 8.6));
  b.yard.at(2.4, yard, 4.6, 0, (g) => props.fence(g, 8.4));

  const spawns = {
    start: { position: v3(-4.8, bedTop, -1.17), facing: HALF, pose: 'lie' },
    bedside: { position: v3(-4.72, 0, -0.5), facing: 2.4 },
    bedroom: { position: v3(-3.9, 0, 0.3), facing: 0.6 },
    kitchen: { position: v3(0.1, 0, -1.3), facing: 0.4 },
    workspace: { position: v3(5.2, 0, -1.2), facing: 0.3 },
    basement: { position: v3(3.9, DOWN, 0.9), facing: 0.8 },
  };
  spawns.bed = spawns.start;
  anchors.bed = spawns.start;

  return { spawns, anchors, lamps, life, decals };
}
