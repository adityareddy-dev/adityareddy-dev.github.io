import { INK, PAINT } from './plan.js';

const HALF = Math.PI / 2;

// Same numbers every load, so the shelves never reshuffle.
function dice(seed) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const SPINES = [0xc8463c, 0x3f6f8f, 0xe0a93b, 0x5aa867, 0xf1ede4, 0x8a6fc0, 0x33373f, 0xd97b4a, 0x4f7fd0, 0x2f8f8a];

// Everything below is drawn round its own origin. Place it with batch.at().

export function pendant(b, glow, hex = INK.mustard, drop = 0.5) {
  b.cyl(0, 0.1 + drop / 2, 0, 0.005, drop, INK.black, { seg: 6 });
  b.cyl(0, 0.06, 0, 0.1, 0.11, hex, { top: 0.3, seg: 18 });
  glow.ball(0, 0.005, 0, 0.042, 0xfff0c8);
}

// A framed picture flat on a wall that faces +Z.
export function picture(b, w, h, { frame = INK.walnut, art = 1 } = {}) {
  b.box(0, 0, 0.011, w, h, 0.022, frame, { r: 0.006 });
  b.box(0, 0, 0.0225, w - 0.04, h - 0.04, 0.004, INK.paper);
  const iw = w - 0.09;
  const ih = h - 0.09;
  const z = 0.0255;
  if (art === 1) {
    b.box(0, 0, z, iw, ih, 0.002, 0xf3d9b1);
    b.cyl(iw * 0.2, ih * 0.14, z + 0.001, ih * 0.2, 0.002, 0xe8704a, { axis: 'z', seg: 20 });
    b.box(0, -ih * 0.32, z + 0.002, iw, ih * 0.36, 0.002, 0x3f6f8f);
    b.box(0, -ih * 0.4, z + 0.003, iw, ih * 0.2, 0.002, 0x2f5672);
  } else if (art === 2) {
    b.box(0, 0, z, iw, ih, 0.002, 0xe9e2d4);
    b.box(-iw * 0.28, -ih * 0.1, z + 0.001, iw * 0.24, ih * 0.8, 0.002, INK.teal);
    b.box(0.02, -ih * 0.22, z + 0.001, iw * 0.24, ih * 0.56, 0.002, INK.mustard);
    b.box(iw * 0.31, ih * 0.02, z + 0.001, iw * 0.2, ih * 0.9, 0.002, INK.coral);
    b.box(0, ih * 0.38, z + 0.002, iw * 0.9, ih * 0.05, 0.002, INK.black);
  } else if (art === 3) {
    b.box(0, 0, z, iw, ih, 0.002, 0x27344a);
    b.cyl(-iw * 0.1, 0, z + 0.001, Math.min(iw, ih) * 0.32, 0.002, 0xf2b84b, { axis: 'z', seg: 24 });
    b.box(iw * 0.28, -ih * 0.24, z + 0.002, iw * 0.2, iw * 0.2, 0.002, 0xe8704a);
  }
}

// A rod and two gathered curtains for a window in a wall that faces +Z.
export function curtains(b, from, to, top, bottom, hex, dark) {
  const y = top + 0.075;
  b.cyl((from + to) / 2, y, 0.055, 0.008, to - from + 0.4, INK.walnut, { axis: 'x', seg: 8 });
  for (const x of [from - 0.2, to + 0.2]) b.ball(x, y, 0.055, 0.016, INK.walnut, { detail: 1 });
  const drop = y - bottom + 0.1;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? from : to;
    for (let i = 0; i < 3; i += 1) {
      const x = edge + side * (0.02 + i * 0.05);
      b.box(x, y - drop / 2, i % 2 ? 0.045 : 0.062, 0.056, drop, 0.03, i % 2 ? dark : hex, { r: 0.012 });
    }
  }
}

export function wardrobe(b) {
  b.box(0, 0.02, 0, 0.66, 0.04, 0.3, INK.walnut);
  b.box(0, 0.54, 0, 0.7, 1.0, 0.34, INK.wood, { r: 0.012 });
  b.box(0, 1.05, 0, 0.74, 0.03, 0.37, INK.walnut, { r: 0.008 });
  for (const s of [-1, 1]) {
    b.box(s * 0.172, 0.55, 0.172, 0.325, 0.92, 0.012, 0xe2bd90, { r: 0.005 });
    b.ball(s * 0.035, 0.56, 0.186, 0.013, INK.brass, { detail: 1 });
  }
}

export function basket(b) {
  b.cyl(0, 0.1, 0, 0.1, 0.2, 0xc9a878, { top: 1.2, seg: 14 });
  b.ring(0, 0.2, 0, 0.12, 0.012, 0xb08f62, { rotX: HALF });
  b.ball(0, 0.2, 0, 0.1, INK.white, { sy: 0.45, detail: 1 });
}

export function slippers(b, hex = INK.coral) {
  for (const x of [-0.035, 0.035]) {
    b.box(x, 0.012, 0, 0.05, 0.024, 0.11, hex, { r: 0.012 });
    b.box(x, 0.03, -0.022, 0.054, 0.03, 0.06, hex, { r: 0.014 });
  }
}

export function mug(b, hex = INK.white) {
  b.cyl(0, 0.022, 0, 0.02, 0.044, hex, { seg: 12 });
  b.ring(0.024, 0.022, 0, 0.012, 0.004, hex);
  b.cyl(0, 0.043, 0, 0.016, 0.003, 0x5a3a28, { seg: 12 });
}

export function vase(b, hex = INK.teal) {
  b.cyl(0, 0.05, 0, 0.032, 0.1, hex, { top: 0.6, seg: 12 });
  const blooms = [[-0.03, 0.2, 0.01, INK.coral], [0.025, 0.23, -0.015, INK.mustard], [0.0, 0.26, 0.02, INK.white], [0.04, 0.17, 0.03, INK.coral]];
  for (const [x, y, z, c] of blooms) {
    b.cyl(x / 2, 0.1 + (y - 0.1) / 2, z / 2, 0.003, y - 0.1, INK.leafDark, { seg: 5 });
    b.ball(x, y, z, 0.022, c, { detail: 1 });
  }
}

// A range hood on a wall that faces +Z, up to the given height.
export function hood(b, top) {
  b.box(0, 0.05, 0.19, 0.43, 0.1, 0.38, INK.chrome, { r: 0.012 });
  b.box(0, 0.1 + (top - 0.1) / 2, 0.1, 0.17, top - 0.1, 0.18, INK.chrome);
}

// A shelf on a wall that faces +Z.
export function wallShelf(b, w) {
  b.box(0, 0, 0.065, w, 0.02, 0.13, INK.walnut, { r: 0.005 });
  for (const s of [-1, 1]) b.box(s * (w / 2 - 0.05), -0.035, 0.04, 0.014, 0.06, 0.08, INK.steel);
}

export function coatHooks(b) {
  b.box(0, 0, 0.012, 0.5, 0.06, 0.024, INK.walnut, { r: 0.006 });
  for (let i = 0; i < 4; i += 1) {
    const x = -0.18 + i * 0.12;
    b.cyl(x, 0, 0.045, 0.008, 0.05, INK.brass, { axis: 'z', seg: 8 });
    b.ball(x, 0, 0.072, 0.012, INK.brass, { detail: 1 });
  }
}

// The leaf of the front door, in an opening this wide and tall. It faces +Z.
export function frontDoor(b, glass, w, h) {
  const body = 0x3f6c94;
  const panel = 0x35608a;
  b.box(0, h / 2, 0, w - 0.01, h - 0.006, 0.045, body, { r: 0.006 });
  b.box(0, h * 0.27, 0.024, w - 0.14, h * 0.36, 0.008, panel, { r: 0.004 });
  b.box(0, h * 0.62, 0.024, w - 0.14, h * 0.2, 0.008, panel, { r: 0.004 });
  glass.box(0, h * 0.86, 0, w - 0.16, h * 0.12, 0.05, 0xffffff);
  b.box(0, h * 0.86, 0.0, w - 0.13, h * 0.15, 0.03, PAINT.trim);
  b.cyl(w / 2 - 0.07, h * 0.47, 0.04, 0.012, 0.04, INK.brass, { axis: 'z', seg: 10 });
  b.ball(w / 2 - 0.07, h * 0.47, 0.066, 0.02, INK.brass, { detail: 1 });
  const f = 0.04;
  b.box(-w / 2 - f / 2, (h + f) / 2, 0.035, f, h + f, 0.08, PAINT.trim);
  b.box(w / 2 + f / 2, (h + f) / 2, 0.035, f, h + f, 0.08, PAINT.trim);
  b.box(0, h + f / 2, 0.035, w, f, 0.08, PAINT.trim);
}

export function doormat(b, hex = 0x8a6a4a) {
  b.box(0, 0.006, 0, 0.5, 0.012, 0.28, hex, { r: 0.005 });
  b.box(0, 0.0125, 0, 0.42, 0.002, 0.2, 0x9c7c5c);
}

// The whiteboard's frame and tray, on a wall that faces +Z. The board itself is a textured plane.
export function whiteboardFrame(b, w, h) {
  b.box(0, 0, 0.011, w + 0.04, h + 0.04, 0.022, INK.chrome, { r: 0.008 });
  b.box(0, -h / 2 - 0.02, 0.045, w * 0.7, 0.016, 0.05, INK.chrome, { r: 0.004 });
  const pens = [INK.blue, INK.red, INK.green, INK.black];
  pens.forEach((hex, i) => b.cyl(-w * 0.2 + i * 0.1, -h / 2 - 0.004, 0.05, 0.008, 0.07, hex, { axis: 'x', seg: 8 }));
  b.box(w * 0.24, -h / 2 + 0.002, 0.05, 0.09, 0.028, 0.035, INK.steelDark, { r: 0.006 });
}

// Six frames in two rows, on a wall that faces +Z. Only the first `filled` hold anything.
export function badgeFrames(b, filled = 0) {
  const w = 0.24;
  const h = 0.28;
  let n = 0;
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const x = (c - 1) * 0.36;
      const y = (0.5 - r) * 0.36;
      b.box(x, y, 0.01, w, h, 0.02, n % 2 ? INK.walnut : INK.black, { r: 0.006 });
      b.box(x, y, 0.0205, w - 0.05, h - 0.05, 0.004, INK.paper);
      if (n < filled) {
        b.cyl(x, y + 0.03, 0.025, 0.05, 0.006, INK.brass, { axis: 'z', seg: 18 });
        b.cyl(x, y + 0.03, 0.029, 0.032, 0.004, 0xe3c56e, { axis: 'z', seg: 18 });
        b.box(x - 0.022, y - 0.045, 0.024, 0.03, 0.08, 0.004, INK.blue, { rotZ: -0.25 });
        b.box(x + 0.022, y - 0.045, 0.024, 0.03, 0.08, 0.004, INK.blue, { rotZ: 0.25 });
      }
      n += 1;
    }
  }
}

export function paper(b) {
  b.box(0, 0.002, 0, 0.11, 0.004, 0.15, INK.paper);
  b.box(-0.012, 0.0045, -0.052, 0.06, 0.001, 0.012, 0x3a4250);
  for (let i = 0; i < 6; i += 1) b.box(0, 0.0045, -0.028 + i * 0.016, i % 3 === 2 ? 0.06 : 0.084, 0.001, 0.005, 0x9aa1ad);
}

export function mouse(b) {
  b.box(0, 0.01, 0, 0.035, 0.02, 0.055, INK.steelDark, { r: 0.009 });
}

// A row of books standing along +X, spines toward +Z.
export function bookRow(b, length, seed, { tall = 0.15, depth = 0.11 } = {}) {
  const rand = dice(seed);
  let x = 0;
  while (x < length - 0.02) {
    const t = 0.017 + rand() * 0.02;
    const h = tall * (0.66 + rand() * 0.34);
    if (x + t > length) break;
    const hex = SPINES[Math.floor(rand() * SPINES.length)];
    const d = depth * (0.82 + rand() * 0.18);
    b.box(x + t / 2, h / 2, (depth - d) / -2, t, h, d, hex);
    x += t + 0.002;
    if (rand() < 0.1) {
      const lean = 0.03 + rand() * 0.02;
      if (x + lean + 0.03 > length) break;
      b.box(x + lean, h * 0.48, 0, 0.022, h, depth * 0.9, SPINES[Math.floor(rand() * SPINES.length)], { rotZ: -0.3 });
      x += lean + 0.05;
    }
  }
}

export function bookStack(b, seed, count = 3) {
  const rand = dice(seed);
  let y = 0;
  for (let i = 0; i < count; i += 1) {
    const h = 0.018 + rand() * 0.014;
    b.box((rand() - 0.5) * 0.02, y + h / 2, (rand() - 0.5) * 0.02, 0.13 - rand() * 0.02, h, 0.1 - rand() * 0.015, SPINES[Math.floor(rand() * SPINES.length)], { rotY: (rand() - 0.5) * 0.4 });
    y += h;
  }
  return y;
}

export function stopwatch(b) {
  b.box(0, 0.008, 0, 0.07, 0.016, 0.04, INK.walnut, { r: 0.005 });
  b.cyl(0, 0.075, 0, 0.055, 0.02, INK.chrome, { axis: 'z', seg: 22 });
  b.cyl(0, 0.075, 0.011, 0.045, 0.003, INK.paper, { axis: 'z', seg: 22 });
  b.box(0.012, 0.086, 0.014, 0.004, 0.036, 0.002, INK.red, { rotZ: -0.7 });
  b.cyl(0, 0.138, 0, 0.012, 0.02, INK.chrome, { seg: 8 });
  b.cyl(0.04, 0.122, 0, 0.008, 0.016, INK.chrome, { seg: 8, rotZ: -0.7 });
}

export function cardboard(b, w, h, d) {
  b.box(0, h / 2, 0, w, h, d, 0xc79f6e, { r: 0.006 });
  b.box(0, h + 0.0005, 0, w * 0.16, 0.002, d, 0xe2c79b);
}

export function alarmClock(b, lit) {
  b.box(0, 0.035, 0, 0.09, 0.07, 0.05, INK.steelDark, { r: 0.014 });
  lit.box(0, 0.037, 0.026, 0.066, 0.034, 0.002, 0x9ff0c0);
}

export function treadmill(b, lit) {
  b.box(0, 0.05, 0.05, 0.44, 0.08, 1.05, INK.steelDark, { r: 0.02 });
  b.box(0, 0.094, 0.08, 0.32, 0.01, 0.9, INK.black);
  b.box(0, 0.06, -0.5, 0.4, 0.12, 0.14, INK.steel, { r: 0.03 });
  for (const s of [-1, 1]) {
    b.box(s * 0.19, 0.1, 0.08, 0.05, 0.022, 0.92, INK.steel, { r: 0.008 });
    b.box(s * 0.19, 0.38, -0.4, 0.035, 0.62, 0.035, INK.chrome, { rotX: -0.18, r: 0.01 });
    b.cyl(s * 0.19, 0.6, -0.26, 0.014, 0.36, INK.black, { axis: 'z', seg: 8 });
  }
  b.box(0, 0.7, -0.47, 0.42, 0.15, 0.05, INK.steelDark, { rotX: -0.5, r: 0.015 });
  lit.box(0, 0.7135, -0.4455, 0.22, 0.075, 0.004, 0x8fe6ff, { rotX: -0.5 });
}

function dumbbell(b, x, y, z, size, hex) {
  b.cyl(x, y, z, 0.009, 0.15, INK.chrome, { axis: 'z', seg: 8 });
  for (const s of [-1, 1]) b.cyl(x, y, z + s * 0.055, size, 0.045, hex, { axis: 'z', seg: 6 });
}

export function dumbbellRack(b) {
  for (const s of [-1, 1]) {
    b.box(s * 0.53, 0.26, 0, 0.03, 0.52, 0.28, INK.steelDark, { r: 0.008 });
    b.box(s * 0.53, 0.015, 0, 0.05, 0.03, 0.34, INK.steelDark);
  }
  const tints = [INK.black, INK.black, INK.blue, INK.red, INK.mustard];
  const shelves = [[0.15, 0.05, 0.052], [0.4, -0.03, 0.04]];
  for (const [y, z, big] of shelves) {
    b.box(0, y, z, 1.06, 0.02, 0.2, INK.steel, { rotX: 0.22 });
    for (let i = 0; i < 5; i += 1) {
      const size = big - i * 0.004;
      dumbbell(b, -0.4 + i * 0.2, y + size + 0.012, z, size, y < 0.3 ? INK.black : tints[i]);
    }
  }
}

// A flat bench with a loaded bar on its rack. The head end is toward -Z.
export function benchPress(b) {
  b.box(0, 0.24, 0.05, 0.26, 0.06, 0.9, INK.black, { r: 0.025 });
  b.box(0, 0.11, 0.42, 0.3, 0.22, 0.04, INK.steel, { r: 0.008 });
  b.box(0, 0.11, -0.3, 0.3, 0.22, 0.04, INK.steel, { r: 0.008 });
  b.box(0, 0.19, 0.05, 0.06, 0.04, 0.8, INK.steel);
  for (const s of [-1, 1]) {
    b.box(s * 0.31, 0.33, -0.3, 0.04, 0.66, 0.04, INK.steel, { r: 0.008 });
    b.box(s * 0.31, 0.015, -0.3, 0.06, 0.03, 0.42, INK.steel);
    b.box(s * 0.31, 0.6, -0.265, 0.05, 0.03, 0.07, INK.steelDark);
    b.cyl(s * 0.5, 0.635, -0.27, 0.125, 0.026, INK.blue, { axis: 'x', seg: 22 });
    b.cyl(s * 0.532, 0.635, -0.27, 0.1, 0.022, INK.mustard, { axis: 'x', seg: 22 });
    b.cyl(s * 0.565, 0.635, -0.27, 0.022, 0.03, INK.chrome, { axis: 'x', seg: 10 });
  }
  b.cyl(0, 0.635, -0.27, 0.011, 1.32, INK.chrome, { axis: 'x', seg: 10 });
}

export function kettlebell(b, s = 1, hex = INK.black) {
  b.ball(0, 0.075 * s, 0, 0.08 * s, hex, { sy: 0.92 });
  b.ring(0, 0.165 * s, 0, 0.045 * s, 0.013 * s, hex);
}

export function yogaMat(b, hex = INK.teal) {
  b.box(0, 0.005, 0, 0.36, 0.01, 0.95, hex, { r: 0.004 });
}

export function rolledMat(b, hex = INK.purple) {
  b.cyl(0, 0.045, 0, 0.045, 0.38, hex, { axis: 'x', seg: 14 });
  b.cyl(0, 0.045, 0, 0.02, 0.384, 0x6a55a0, { axis: 'x', seg: 10 });
}

export function plyoBox(b) {
  b.box(0, 0.16, 0, 0.38, 0.32, 0.38, INK.wood, { r: 0.012 });
  b.box(0, 0.16, 0.191, 0.2, 0.05, 0.004, INK.walnut);
  b.box(0, 0.321, 0, 0.34, 0.002, 0.34, INK.rubber);
}

export function waterBottle(b, hex = INK.blue) {
  b.cyl(0, 0.045, 0, 0.018, 0.09, hex, { seg: 10 });
  b.cyl(0, 0.1, 0, 0.012, 0.022, INK.white, { seg: 10 });
}

export function boiler(b, lit) {
  b.cyl(0, 0.03, 0, 0.21, 0.06, INK.steel, { seg: 20 });
  b.cyl(0, 0.43, 0, 0.2, 0.74, 0xe9e6df, { seg: 20 });
  b.ball(0, 0.8, 0, 0.2, 0xe9e6df, { sy: 0.35 });
  b.cyl(0.09, 1.12, 0, 0.024, 0.6, 0xb8693c, { seg: 8 });
  b.cyl(-0.08, 1.12, 0, 0.018, 0.6, INK.chrome, { seg: 8 });
  b.ring(0.09, 1.0, 0.03, 0.038, 0.008, INK.red);
  b.cyl(0.08, 0.52, 0.19, 0.04, 0.02, INK.white, { axis: 'z', seg: 14 });
  b.box(0.08, 0.3, 0.195, 0.1, 0.07, 0.02, INK.steelDark, { r: 0.006 });
  lit.box(0.08, 0.3, 0.206, 0.03, 0.014, 0.002, 0xffa14a);
}

// A strip light on a wall that faces +Z.
export function tubeLight(b, lit, w) {
  b.box(0, 0, 0.025, w, 0.045, 0.05, INK.white, { r: 0.008 });
  lit.cyl(0, -0.028, 0.03, 0.014, w - 0.08, 0xfdfdf5, { axis: 'x', seg: 8 });
}

// The back office door, in an opening this wide and tall, facing +Z.
export function vaultDoor(b, w, h) {
  const steel = 0x3d4a5c;
  const plate = 0x55647a;
  b.box(0, h / 2, -0.03, w - 0.008, h - 0.006, 0.05, steel, { r: 0.006 });
  for (const y of [0.16, 0.9]) {
    b.box(0, y, 0, w - 0.12, 0.07, 0.012, plate, { r: 0.004 });
    for (const x of [-0.24, -0.08, 0.08, 0.24]) b.ball(x, y, 0.008, 0.009, INK.chrome, { detail: 1 });
  }
  b.cyl(0, 0.5, 0.03, 0.013, w - 0.24, INK.chrome, { axis: 'x', seg: 10 });
  for (const s of [-1, 1]) b.box(s * (w / 2 - 0.14), 0.5, 0.012, 0.03, 0.05, 0.04, INK.steelDark, { r: 0.006 });
  const f = 0.05;
  b.box(-w / 2 - f / 2, (h + f) / 2, 0.02, f, h + f, 0.1, INK.steelDark);
  b.box(w / 2 + f / 2, (h + f) / 2, 0.02, f, h + f, 0.1, INK.steelDark);
  b.box(0, h + f / 2, 0.02, w, f, 0.1, INK.steelDark);
}

export function keypad(b, lit) {
  b.box(0, 0, 0.012, 0.075, 0.12, 0.024, INK.steelDark, { r: 0.006 });
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 3; c += 1) lit.box(-0.019 + c * 0.019, -0.04 + r * 0.019, 0.025, 0.012, 0.012, 0.002, 0x9aa6b5);
  }
}

export function cageLamp(b) {
  b.box(0, 0, 0.012, 0.07, 0.05, 0.024, INK.steelDark, { r: 0.006 });
  b.ring(0, -0.03, 0.045, 0.036, 0.004, INK.steelDark, { rotX: HALF });
  b.ring(0, -0.055, 0.045, 0.03, 0.004, INK.steelDark, { rotX: HALF });
}

export function tree(b, s = 1, hex = INK.leaf) {
  b.cyl(0, 0.36 * s, 0, 0.075 * s, 0.72 * s, INK.bark, { top: 0.65, seg: 8 });
  b.ball(0, 1.02 * s, 0, 0.48 * s, hex, { detail: 1 });
  b.ball(0.27 * s, 0.84 * s, 0.1 * s, 0.33 * s, INK.leafDark, { detail: 1 });
  b.ball(-0.25 * s, 0.9 * s, -0.12 * s, 0.35 * s, hex, { detail: 1 });
  b.ball(0.03 * s, 1.36 * s, 0.03 * s, 0.3 * s, 0x6bb574, { detail: 1 });
}

export function bush(b, s = 1, hex = INK.leaf) {
  b.ball(0, 0.12 * s, 0, 0.2 * s, hex, { sy: 0.8, detail: 1 });
  b.ball(0.17 * s, 0.1 * s, 0.05 * s, 0.15 * s, INK.leafDark, { sy: 0.8, detail: 1 });
  b.ball(-0.15 * s, 0.09 * s, -0.04 * s, 0.14 * s, 0x6bb574, { sy: 0.8, detail: 1 });
}

export function flowers(b, seed, count = 6) {
  const rand = dice(seed);
  const tints = [INK.coral, INK.mustard, INK.white, INK.purple];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() - 0.5) * 0.7;
    const z = (rand() - 0.5) * 0.2;
    const h = 0.08 + rand() * 0.07;
    b.cyl(x, h / 2, z, 0.004, h, INK.leafDark, { seg: 5 });
    b.ball(x, h, z, 0.022, tints[Math.floor(rand() * tints.length)], { detail: 1 });
  }
}

export function stone(b, s = 1) {
  b.cyl(0, 0.008, 0, 0.16 * s, 0.016, INK.stone, { seg: 7 });
}

export function mailbox(b) {
  b.cyl(0, 0.2, 0, 0.018, 0.4, INK.walnut, { seg: 8 });
  b.box(0, 0.44, 0, 0.12, 0.1, 0.2, INK.blue, { r: 0.03 });
  b.box(0.066, 0.47, 0.03, 0.006, 0.06, 0.03, INK.red);
}

export function fence(b, length) {
  for (const y of [0.1, 0.22]) b.box(length / 2, y, 0, length, 0.03, 0.015, INK.white);
  for (let x = 0.04; x < length; x += 0.16) b.box(x, 0.15, 0.012, 0.045, 0.3, 0.012, INK.white, { r: 0.004 });
}
