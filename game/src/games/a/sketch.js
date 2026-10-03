// Marker shapes as SVG path strings. Nothing lands in quite the same place twice.
const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child) node.append(child);
  }
  return node;
}

// Same seed, same wobble. A line keeps its shape while the box it hangs off moves.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const r1 = (n) => Math.round(n * 10) / 10;
const jit = (rnd, amp) => (rnd() * 2 - 1) * amp;

// One pass of the marker from a to b. A bend bows it out by that much at the middle.
export function stroke(x1, y1, x2, y2, rnd, amp = 1.5, bend = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const a = Math.min(amp, len * 0.08);
  const nx = -dy / len;
  const ny = dx / len;
  const bow = jit(rnd, a * 1.6 + len * 0.012) + (bend * 4) / 3;
  const at = (t, off) => [x1 + dx * t + nx * off, y1 + dy * t + ny * off];
  const [c1x, c1y] = at(0.3 + jit(rnd, 0.08), bow + jit(rnd, a));
  const [c2x, c2y] = at(0.7 + jit(rnd, 0.08), bow + jit(rnd, a));
  const sx = x1 + jit(rnd, a);
  const sy = y1 + jit(rnd, a);
  const ex = x2 + jit(rnd, a);
  const ey = y2 + jit(rnd, a);
  return `M${r1(sx)} ${r1(sy)}C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(ex)} ${r1(ey)}`;
}

// Four sides, each a little long at the corners.
export function rect(x, y, w, h, rnd, amp = 1.4) {
  const over = () => 1 + rnd() * 2.5;
  return [
    stroke(x - over(), y, x + w + over(), y, rnd, amp),
    stroke(x + w, y - over(), x + w, y + h + over(), rnd, amp),
    stroke(x + w + over(), y + h, x - over(), y + h, rnd, amp),
    stroke(x, y + h + over(), x, y - over(), rnd, amp),
  ].join('');
}

// A ring that overlaps itself where the hand came back round.
export function loop(cx, cy, rx, ry, rnd, amp = 2) {
  const steps = 10;
  const start = rnd() * Math.PI * 2;
  const points = [];
  for (let i = 0; i <= steps + 1; i++) {
    const angle = start + (i / steps) * Math.PI * 2;
    const grow = 1 + (i / steps) * 0.05;
    points.push([cx + Math.cos(angle) * rx * grow + jit(rnd, amp), cy + Math.sin(angle) * ry * grow + jit(rnd, amp)]);
  }
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const mx = (x + points[i + 1][0]) / 2;
    const my = (y + points[i + 1][1]) / 2;
    d += `Q${r1(x)} ${r1(y)} ${r1(mx)} ${r1(my)}`;
  }
  return d;
}

export function arrowHead(x, y, angle, size, rnd) {
  const a1 = angle + Math.PI - 0.46 + jit(rnd, 0.08);
  const a2 = angle + Math.PI + 0.46 + jit(rnd, 0.08);
  return (
    stroke(x + Math.cos(a1) * size, y + Math.sin(a1) * size, x, y, rnd, 0.7) +
    stroke(x, y, x + Math.cos(a2) * size, y + Math.sin(a2) * size, rnd, 0.7)
  );
}

export function cross(cx, cy, r, rnd) {
  return stroke(cx - r, cy - r, cx + r, cy + r, rnd, 1.6) + stroke(cx + r, cy - r, cx - r, cy + r, rnd, 1.6);
}

export function tick(cx, cy, r, rnd) {
  const kx = cx - r * 0.3;
  const ky = cy + r * 0.7;
  return stroke(cx - r, cy, kx, ky, rnd, 0.8) + stroke(kx, ky, cx + r, cy - r * 0.9, rnd, 0.8);
}

// Where a line from the middle of a box toward a point leaves the box.
export function edgePoint(box, tx, ty, gap = 4) {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  if (!dx && !dy) return [box.cx, box.cy];
  const hw = box.w / 2 + gap;
  const hh = box.h / 2 + gap;
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return [box.cx + dx * s, box.cy + dy * s];
}
