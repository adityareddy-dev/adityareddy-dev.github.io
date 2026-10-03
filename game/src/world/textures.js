import * as THREE from 'three';

// Same numbers every visit, so the house never changes between loads.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = anisotropy;
  return t;
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function speckle(g, rand, w, h, count, colours, alpha, size = 1) {
  for (let i = 0; i < count; i += 1) {
    g.globalAlpha = alpha * (0.5 + rand() * 0.5);
    g.fillStyle = colours[Math.floor(rand() * colours.length)];
    const s = size * (0.6 + rand() * 0.8);
    g.fillRect(rand() * w, rand() * h, s, s);
  }
  g.globalAlpha = 1;
}

export function woodFloor({ base = '#c99a6b', seed = 7, rows = 8 } = {}) {
  const [c, g] = canvas(512, 512);
  const rand = seeded(seed);
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    const first = rand() * 512;
    const cuts = [first, first + 150 + rand() * 60, first + 330 + rand() * 60];
    cuts.forEach((from, i) => {
      const to = i < cuts.length - 1 ? cuts[i + 1] : first + 512;
      g.fillStyle = shade(base, (rand() - 0.5) * 0.085);
      g.fillRect(from, r * rowH, to - from, rowH);
      g.fillRect(from - 512, r * rowH, to - from, rowH);
    });
    for (const cut of cuts) {
      g.fillStyle = 'rgba(40,22,8,0.22)';
      g.fillRect(cut % 512, r * rowH, 1.5, rowH);
    }
    g.fillStyle = 'rgba(40,22,8,0.2)';
    g.fillRect(0, r * rowH, 512, 1.5);
    for (let i = 0; i < 9; i += 1) {
      g.fillStyle = `rgba(60,34,14,${0.025 + rand() * 0.035})`;
      g.fillRect(0, r * rowH + 4 + rand() * (rowH - 8), 512, 1);
    }
  }
  return finish(c);
}

export function tileFloor({ base = '#ebe5da', grout = '#cbc3b5', seed = 11 } = {}) {
  const [c, g] = canvas(256, 256);
  const rand = seeded(seed);
  g.fillStyle = grout;
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      g.fillStyle = shade(base, (rand() - 0.5) * 0.035);
      g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x * 128 + 2, y * 128 + 2, 124, 3);
    }
  }
  speckle(g, rand, 256, 256, 500, ['#ffffff', '#b9b1a3'], 0.08);
  return finish(c);
}

export function carpetFloor({ base = '#8d9aa8', seed = 23 } = {}) {
  const [c, g] = canvas(256, 256);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, rand, 256, 256, 9000, [shade(base, 0.08), shade(base, -0.08), shade(base, 0.03)], 0.35, 1.6);
  g.strokeStyle = 'rgba(20,25,35,0.10)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return finish(c);
}

export function rubberFloor({ seed = 31 } = {}) {
  const [c, g] = canvas(512, 512);
  const rand = seeded(seed);
  g.fillStyle = '#34373e';
  g.fillRect(0, 0, 512, 512);
  speckle(g, rand, 512, 512, 2600, ['#7b8491', '#59606b', '#4f83cc', '#c9a15a'], 0.7, 2);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 3;
  for (const p of [0, 256]) {
    g.strokeRect(p, -4, 256, 520);
    g.strokeRect(-4, p, 520, 256);
  }
  return finish(c);
}

export function concreteFloor({ base = '#a9a6a0', seed = 43 } = {}) {
  const [c, g] = canvas(512, 512);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 46; i += 1) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 40 + rand() * 90;
    const dark = rand() > 0.5;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, dark ? 'rgba(60,58,54,0.07)' : 'rgba(255,255,255,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  speckle(g, rand, 512, 512, 4000, ['#ffffff', '#6f6c66'], 0.12, 1.4);
  return finish(c);
}

export function grass({ base = '#6c9f58', seed = 53 } = {}) {
  const [c, g] = canvas(512, 512);
  const rand = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i += 1) {
    g.globalAlpha = 0.25 + rand() * 0.3;
    g.fillStyle = [shade(base, 0.07), shade(base, -0.07), shade(base, 0.03), '#86b566'][Math.floor(rand() * 4)];
    g.fillRect(rand() * 512, rand() * 512, 1.6, 3 + rand() * 5);
  }
  g.globalAlpha = 1;
  return finish(c);
}

// A soft dark patch that sits under furniture.
export function softShadow() {
  const [c, g] = canvas(64, 64);
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = 14;
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(17, 17, 30, 30);
  g.fillRect(17, 17, 30, 30);
  return finish(c, { repeat: false, srgb: false, anisotropy: 1 });
}

export function softDot() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(c, { repeat: false, anisotropy: 1 });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function whiteboard() {
  const [c, g] = canvas(512, 256);
  const rand = seeded(61);
  g.fillStyle = '#fbfbf8';
  g.fillRect(0, 0, 512, 256);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const pen = (colour, width = 4) => {
    g.strokeStyle = colour;
    g.lineWidth = width;
  };
  const wobble = () => (rand() - 0.5) * 3;
  const node = (x, y, w, h, colour) => {
    pen(colour);
    g.beginPath();
    g.moveTo(x + wobble(), y + wobble());
    g.lineTo(x + w + wobble(), y + wobble());
    g.lineTo(x + w + wobble(), y + h + wobble());
    g.lineTo(x + wobble(), y + h + wobble());
    g.closePath();
    g.stroke();
    g.globalAlpha = 0.5;
    g.beginPath();
    g.moveTo(x + 10, y + h / 2);
    g.lineTo(x + w - 10, y + h / 2 + wobble());
    g.stroke();
    g.globalAlpha = 1;
  };
  const arrow = (x0, y0, x1, y1, colour) => {
    pen(colour, 3);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 - 12 * Math.cos(a - 0.5), y1 - 12 * Math.sin(a - 0.5));
    g.moveTo(x1, y1);
    g.lineTo(x1 - 12 * Math.cos(a + 0.5), y1 - 12 * Math.sin(a + 0.5));
    g.stroke();
  };
  node(40, 96, 84, 52, '#2f6fd0');
  node(196, 40, 92, 52, '#2f6fd0');
  node(196, 156, 92, 52, '#2f6fd0');
  node(372, 96, 96, 56, '#1f9d6b');
  arrow(128, 112, 192, 72, '#333a45');
  arrow(128, 134, 192, 178, '#333a45');
  arrow(292, 68, 368, 112, '#333a45');
  arrow(292, 182, 368, 138, '#333a45');
  pen('#d8483e', 4);
  g.beginPath();
  g.ellipse(242, 182, 66, 40, -0.1, 0.2, Math.PI * 2.1);
  g.stroke();
  g.fillStyle = 'rgba(90,100,115,0.10)';
  g.fillRect(300, 14, 190, 30);
  return finish(c, { repeat: false });
}

export function codeScreen() {
  const [c, g] = canvas(256, 160);
  const rand = seeded(71);
  g.fillStyle = '#141925';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#1d2433';
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 14, 34, 146);
  const colours = ['#7cc4ff', '#f2b33d', '#9ae6b4', '#c9b6ff', '#d7dce5', '#ff9d8a'];
  for (let line = 0; line < 13; line += 1) {
    let x = 42 + Math.floor(rand() * 3) * 12;
    const y = 22 + line * 10.5;
    const words = 2 + Math.floor(rand() * 4);
    for (let w = 0; w < words; w += 1) {
      const len = 10 + rand() * 38;
      g.fillStyle = colours[Math.floor(rand() * colours.length)];
      g.globalAlpha = 0.9;
      g.fillRect(x, y, len, 4.5);
      x += len + 6;
      if (x > 236) break;
    }
  }
  g.globalAlpha = 1;
  return finish(c, { repeat: false });
}

export function flameScreen() {
  const [c, g] = canvas(256, 160);
  const rand = seeded(83);
  g.fillStyle = '#12151d';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#1d2433';
  g.fillRect(0, 0, 256, 14);
  const warm = ['#f2b33d', '#ee8a3a', '#e5644a', '#f6d06a', '#d9574f'];
  for (let row = 0; row < 9; row += 1) {
    let x = 8 + row * 5 + rand() * 8;
    const y = 24 + row * 14;
    while (x < 244 - row * 9) {
      const len = Math.min(244 - row * 9 - x, 14 + rand() * (90 - row * 7));
      g.fillStyle = warm[Math.floor(rand() * warm.length)];
      roundRect(g, x, y, len, 10, 2);
      g.fill();
      x += len + 3;
      if (rand() < 0.2) x += 16;
    }
  }
  g.fillStyle = '#e5484d';
  roundRect(g, 70, 38, 132, 10, 2);
  g.fill();
  return finish(c, { repeat: false });
}

// The blue curve from the site's own icon, on its dark blue.
export function sitePrint() {
  const [c, g] = canvas(128, 128);
  const rand = seeded(97);
  g.fillStyle = '#050710';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 110; i += 1) {
    g.globalAlpha = 0.25 + rand() * 0.5;
    g.fillStyle = rand() > 0.7 ? '#66b8ff' : '#9fb6d8';
    g.fillRect(rand() * 128, rand() * 128, 1.5, 1.5);
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#66b8ff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(16, 92);
  g.bezierCurveTo(32, 92, 40, 68, 52, 52);
  g.bezierCurveTo(62, 38, 68, 34, 76, 34);
  g.bezierCurveTo(84, 34, 88, 40, 94, 50);
  g.bezierCurveTo(102, 64, 110, 76, 120, 82);
  g.stroke();
  return finish(c, { repeat: false });
}

export function sign(text, { bg = '#b3261e', fg = '#ffffff' } = {}) {
  const [c, g] = canvas(384, 128);
  g.fillStyle = bg;
  roundRect(g, 0, 0, 384, 128, 14);
  g.fill();
  g.strokeStyle = fg;
  g.lineWidth = 5;
  roundRect(g, 9, 9, 366, 110, 9);
  g.stroke();
  const lines = String(text || '')
    .split(/\.\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sizePx = lines.length > 1 ? 38 : 48;
  g.font = `800 ${sizePx}px Inter, system-ui, sans-serif`;
  lines.forEach((line, i) => {
    const y = lines.length > 1 ? 42 + i * 46 : 66;
    g.fillText(line.toUpperCase(), 192, y, 340);
  });
  return finish(c, { repeat: false });
}

export function hazard() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#22242a';
  for (let x = -64; x < 320; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 64);
    g.lineTo(x + 96, 0);
    g.lineTo(x + 64, 0);
    g.closePath();
    g.fill();
  }
  return finish(c, { repeat: false });
}

// The television. draw(t) paints the next frame of a box drifting about.
export function television() {
  const [c, g] = canvas(160, 90);
  const texture = finish(c, { repeat: false, anisotropy: 1 });
  const tints = ['#66b8ff', '#ffb463', '#3fb37f', '#e5484d', '#c9b6ff'];
  const box = { x: 30, y: 20, vx: 34, vy: 23, tint: 0 };
  let last = 0;
  function draw(time) {
    const dt = Math.min(0.2, Math.max(0, time - last));
    last = time;
    box.x += box.vx * dt;
    box.y += box.vy * dt;
    if (box.x < 4 || box.x > 160 - 44) {
      box.vx *= -1;
      box.x = Math.min(160 - 44, Math.max(4, box.x));
      box.tint = (box.tint + 1) % tints.length;
    }
    if (box.y < 4 || box.y > 90 - 28) {
      box.vy *= -1;
      box.y = Math.min(90 - 28, Math.max(4, box.y));
      box.tint = (box.tint + 1) % tints.length;
    }
    g.fillStyle = '#0d1018';
    g.fillRect(0, 0, 160, 90);
    g.fillStyle = tints[box.tint];
    roundRect(g, box.x, box.y, 40, 24, 6);
    g.fill();
    g.fillStyle = '#0d1018';
    roundRect(g, box.x + 8, box.y + 7, 24, 10, 3);
    g.fill();
    texture.needsUpdate = true;
  }
  draw(0);
  return { texture, draw };
}
