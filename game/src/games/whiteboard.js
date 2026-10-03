// Whiteboard round. Put the boxes up, join them, then see if the design takes the traffic.
import { el, loadCSS } from '../core/dom.js';
import { svg, seeded, hash, stroke, rect, loop, arrowHead, cross, tick, edgePoint } from './a/sketch.js';
import { WHITEBOARD } from './a/fallback.js';

const HAND_FONT = 'https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap';

const INK = {
  browser: '#2b2e36',
  cdn: '#1f66c1',
  loadBalancer: '#7447c2',
  app: '#1c8a57',
  app2: '#1c8a57',
  cache: '#dd7a17',
  queue: '#1f66c1',
  worker: '#8a5a2b',
  database: '#cf3b3b',
};

// Doodles in a 24 by 24 box.
const ICONS = {
  browser: 'M3 5h18v14H3zM3 9.5h18M5.6 7.3h.1M8.2 7.3h.1',
  cdn: 'M7.5 18a4.2 4.2 0 0 1-.4-8.4 5.6 5.6 0 0 1 10.8 1.1 3.7 3.7 0 0 1-.4 7.3z',
  loadBalancer: 'M2.5 12h7M9.5 12l9-6.5M9.5 12h9.5M9.5 12l9 6.5M16 4.6l2.6.9-.9 2.5M16.6 10l2.4 2-2.4 2M17.6 16l.9 2.5-2.6.9',
  app: 'M8.5 6l-5 6 5 6M15.5 6l5 6-5 6',
  app2: 'M8.5 6l-5 6 5 6M15.5 6l5 6-5 6',
  cache: 'M13.5 2.5L5 13.5h6l-1.5 8L18.5 10h-6z',
  queue: 'M2.5 8.5h5v7h-5zM9.5 8.5h5v7h-5zM16.5 8.5h5v7h-5z',
  worker: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9',
  database: 'M5 6.5C5 4.6 8.1 3 12 3s7 1.6 7 3.5v11c0 1.9-3.1 3.5-7 3.5s-7-1.6-7-3.5zM5 6.5C5 8.4 8.1 10 12 10s7-1.6 7-3.5M5 12c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5',
  box: 'M4 6h16v12H4z',
};

// When a box gets no traffic, this is the one that takes its share and suffers for it.
const SPILL = { cache: 'database', app: 'app2', app2: 'app', cdn: 'app' };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeBack = (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;

function settings(config) {
  const c = config && typeof config === 'object' ? config : {};
  const puzzles = Array.isArray(c.puzzles) && c.puzzles.length ? c.puzzles : WHITEBOARD.puzzles;
  return {
    ...WHITEBOARD,
    ...c,
    puzzles,
    pieces: { ...WHITEBOARD.pieces, ...(c.pieces || {}) },
    points: { ...WHITEBOARD.points, ...(c.points || {}) },
  };
}

// Later in the day means a harder board. A second go on the same day moves along too.
function pickPuzzle(cfg, ctx, run) {
  const list = cfg.puzzles;
  const want = run.opts?.puzzle;
  if (typeof want === 'number' && list[want]) return list[want];
  if (typeof want === 'string') {
    const hit = list.find((p) => p.id === want);
    if (hit) return hit;
  }
  const plays = Number(ctx.save?.get('whiteboard.plays', 0)) || 0;
  const progress = clamp(Number(ctx.clock?.progress) || 0, 0, 0.999);
  const byDay = Math.floor(progress * list.length);
  return list[Math.max(byDay, plays % list.length)];
}

function createGame(root, ctx, run, resolve) {
  const cfg = settings(run.config);
  const puzzle = pickPuzzle(cfg, ctx, run);
  const points = cfg.points;
  const tired = !!run.lowEnergy;
  const amp = tired ? 2.7 : 1.5;
  const signal = run.signal;
  const sfx = (name) => ctx.audio?.sfx?.(name);
  const labelOf = (id) => cfg.pieces[id]?.label || id;
  const hintOf = (id) => cfg.pieces[id]?.hint || '';
  const ids = [...new Set(Array.isArray(puzzle.pieces) ? puzzle.pieces : [])];
  const n = Math.max(1, ids.length);
  const limit = (Number(cfg.timeLimitSec) || 60) + Math.max(0, n - 4) * 4;
  const clockRate = tired ? 1.2 : 1;
  const random = seeded((Date.now() ^ hash(puzzle.id || 'wb')) >>> 0);

  let phase = 'build';
  let held = false;
  let left = limit;
  let lastWholeSecond = Math.ceil(limit);
  let tries = 0;
  let drag = null;
  let selected = null;
  let sim = null;
  let outcome = null;
  let primary = () => {};
  let edgeCount = 0;
  let over = false;

  // ---- the page around the board ----
  const chips = el(
    'div',
    { class: 'wb-chips' },
    puzzle.traffic?.label ? el('span', { class: 'wb-chip' }, puzzle.traffic.label) : null,
    tired ? el('span', { class: 'wb-chip wb-chip-tired' }, "Tired. The clock's fast and the hand's shaky.") : null,
  );
  const brief = el('div', { class: 'wb-brief' }, el('p', { class: 'wb-brief-text' }, puzzle.brief || ''), chips);
  const frame = el('div', { class: 'wb-frame' });
  const help = el('div', { class: 'wb-help', 'aria-live': 'polite' });
  const note = el('div', { class: 'wb-note', role: 'status', hidden: true });
  const wipeButton = el('button', { class: 'btn quiet wb-wipe', type: 'button', onclick: () => wipe() }, 'Wipe the lines');
  const sendButton = el('button', { class: 'btn primary wb-send', type: 'button', onclick: () => primary() }, cfg.runButton || 'Send traffic');
  const foot = el('div', { class: 'wb-foot' }, help, note, el('div', { class: 'wb-actions' }, wipeButton, sendButton));
  root.append(brief, frame, foot);

  const helpTip = 'Tap a line to rub it out. Grab a magnet to move a box.';
  function setHelp(main, sub, tone) {
    help.replaceChildren(el('p', { class: 'wb-help-main' }, main), ...(sub ? [el('p', { class: 'wb-help-sub' }, sub)] : []));
    help.dataset.tone = tone || '';
  }
  const restHelp = () => setHelp(cfg.how || '', helpTip);
  restHelp();

  // ---- sizes, worked out from the room there is ----
  run.setTimer(1);
  const bodyW = root.clientWidth || 700;
  const narrow = bodyW < 560;
  root.classList.toggle('wb-narrow', narrow);
  const rim = narrow ? 6 : 10;
  const W = clamp(Math.floor(bodyW - rim * 2), 250, 960);
  const gap = narrow ? 8 : 10;
  const minCw = narrow ? 58 : 96;
  const maxCw = narrow ? 88 : 126;
  let perRow = clamp(Math.floor((W - 12) / (minCw + gap)), 2, n);
  const trayRows = Math.ceil(n / perRow);
  perRow = Math.ceil(n / trayRows);
  const cw = Math.min(maxCw, Math.floor((W - 12) / perRow) - gap);
  const ch = narrow ? 42 : 52;
  const trayH = trayRows * (ch + gap) + 18;
  const chrome = run.frame.getBoundingClientRect().height;
  const areaH = Math.round(clamp(window.innerHeight - 32 - chrome - trayH - 6, narrow ? 250 : 210, narrow ? 340 : 330));
  const H = areaH + trayH;
  const showIcon = cw >= 104;
  const fontSize = narrow ? 14 : cw >= 104 ? 17 : 15;
  const grid = narrow ? 10 : 20;
  const bounds = { minX: cw / 2 + 6, maxX: W - cw / 2 - 6, minY: ch / 2 + 14, maxY: areaH - ch / 2 - 8 };
  const snap = (v) => Math.round(v / grid) * grid;

  // ---- the board ----
  const board = svg('svg', {
    class: 'wb-board',
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    role: 'group',
    'aria-label': `Whiteboard. ${puzzle.title || ''}`,
  });
  const gDoodles = svg('g', { class: 'wb-doodles' });
  const gTray = svg('g', { class: 'wb-tray' });
  const gEdges = svg('g');
  const gGhost = svg('g');
  const gCards = svg('g');
  const gDots = svg('g', { class: 'wb-dots' });
  const gLive = svg('g');
  const gFx = svg('g');
  const gTop = svg('g');
  board.append(gDoodles, gTray, gEdges, gGhost, gCards, gDots, gLive, gFx, gTop);
  frame.append(board);

  const titleY = narrow ? 26 : 32;
  const title = svg('text', { class: 'wb-title', x: 16, y: titleY, text: puzzle.title || '' });
  const underline = svg('path', { class: 'wb-scrawl' });
  const count = svg('text', { class: 'wb-count', x: 16, y: titleY + (narrow ? 24 : 28) });
  gDoodles.append(title, underline);
  // The count stays readable with a box parked under it.
  gTop.append(count);
  if (W >= 640) {
    const r = seeded(91);
    gDoodles.append(
      svg(
        'g',
        { class: 'wb-keep', transform: `translate(${W - 132} 14) rotate(3)` },
        svg('path', { d: rect(0, 0, 112, 26, r, 1.1) }),
        svg('text', { x: 56, y: 18.5, 'text-anchor': 'middle', text: 'DO NOT ERASE' }),
      ),
    );
  }
  gTray.append(
    svg('rect', { class: 'wb-tray-bg', x: 0, y: areaH, width: W, height: trayH }),
    svg('line', { class: 'wb-tray-edge', x1: 0, y1: areaH + 0.5, x2: W, y2: areaH + 0.5 }),
  );

  if (!narrow) {
    const y = areaH + trayH / 2;
    const pen = (x, tilt, ink) =>
      svg(
        'g',
        { class: 'wb-pen', transform: `translate(${x} ${y}) rotate(${tilt})` },
        svg('rect', { x: 0, y: -5, width: 62, height: 10, rx: 4, fill: '#f4f5f7' }),
        svg('rect', { x: 9, y: -5, width: 30, height: 10, fill: ink, opacity: 0.85 }),
        svg('rect', { x: 46, y: -5.5, width: 20, height: 11, rx: 3, fill: ink }),
      );
    gTray.append(
      pen(18, -4, '#2456c9'),
      pen(26, 9, '#d23b3b'),
      svg(
        'g',
        { class: 'wb-rubber', transform: `translate(${W - 78} ${y - 12}) rotate(-3)` },
        svg('rect', { width: 56, height: 22, rx: 4, fill: '#3d4150' }),
        svg('rect', { y: 15, width: 56, height: 7, rx: 3, fill: '#d9dce3' }),
      ),
    );
  }

  const liveLine = svg('path', { class: 'wb-ink wb-live' });
  const liveHead = svg('path', { class: 'wb-ink wb-live' });
  gLive.append(liveLine, liveHead);

  // ---- tweens, so a pause holds them too ----
  const tweens = new Set();
  function tween(seconds, step, done, ease = easeOut) {
    const t = { t: 0, seconds, step, done, ease };
    tweens.add(t);
    return t;
  }
  const after = (seconds, fn) => tween(seconds, () => {}, fn);
  function runTweens(dt) {
    for (const t of [...tweens]) {
      t.t += dt;
      const k = Math.min(1, t.t / t.seconds);
      t.step(t.ease(k));
      if (k >= 1) {
        tweens.delete(t);
        t.done?.();
      }
    }
  }

  // ---- cards ----
  const cards = new Map();
  const edges = new Map();

  function labelNode(id) {
    const text = labelOf(id);
    const iconW = showIcon ? 30 : 0;
    const avail = cw - 16 - iconW;
    const cx = -cw / 2 + 8 + iconW + avail / 2;
    let lines = [text];
    let small = false;
    const aside = /^(.*?)\s*(\(.+\))$/.exec(text);
    if (aside && aside[1]) {
      lines = [aside[1], aside[2]];
      small = true;
    } else if (text.includes(' ') && text.length * fontSize * 0.5 > avail) {
      const words = text.split(' ');
      let best = 1;
      for (let i = 1; i < words.length; i++) {
        const head = words.slice(0, i).join(' ').length;
        if (Math.abs(head - text.length / 2) < Math.abs(words.slice(0, best).join(' ').length - text.length / 2)) best = i;
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const node = svg('text', { class: 'wb-label', 'text-anchor': 'middle', 'font-size': fontSize });
    const two = lines.length > 1;
    const lineSize = two ? fontSize * 0.92 : fontSize;
    lines.forEach((line, i) => {
      const size = i === 1 && small ? fontSize * 0.74 : lineSize;
      const y = two ? (i === 0 ? -fontSize * 0.14 : fontSize * (small ? 0.74 : 0.84)) : fontSize * 0.33;
      node.append(svg('tspan', { x: cx, y, 'font-size': size, 'data-size': size, 'data-avail': avail, text: line }));
    });
    return node;
  }

  // Shrinks any label that runs past its box. Runs again when the handwriting font lands.
  function fitLabels() {
    for (const span of board.querySelectorAll('.wb-label tspan')) {
      const size = Number(span.dataset.size);
      const avail = Number(span.dataset.avail);
      span.setAttribute('font-size', size);
      const width = span.getComputedTextLength();
      if (width > avail) span.setAttribute('font-size', Math.max(size * 0.62, (size * avail) / width).toFixed(2));
    }
    const width = title.getComputedTextLength();
    underline.setAttribute('d', stroke(13, titleY + 7, 18 + width + 8, titleY + 6, seeded(hash(puzzle.id || 'wb')), 1.3));
  }

  function paintCard(card, withEdges = true) {
    card.g.setAttribute(
      'transform',
      `translate(${card.x.toFixed(1)} ${card.y.toFixed(1)}) rotate(${card.rot.toFixed(2)}) scale(${card.scale.toFixed(3)})`,
    );
    if (!withEdges) return;
    for (const e of edges.values()) {
      if (e.from === card.id || e.to === card.id) layEdge(e);
    }
  }

  function fly(card, x, y, { seconds = 0.2, rot = card.rot, scale = 1, ease = easeBack, then } = {}) {
    if (card.tw) tweens.delete(card.tw);
    const from = { x: card.x, y: card.y, rot: card.rot, scale: card.scale };
    card.tw = tween(
      seconds,
      (k) => {
        card.x = from.x + (x - from.x) * k;
        card.y = from.y + (y - from.y) * k;
        card.rot = from.rot + (rot - from.rot) * k;
        card.scale = from.scale + (scale - from.scale) * k;
        paintCard(card);
      },
      () => {
        card.tw = null;
        then?.();
      },
      ease,
    );
  }

  function settleNow(card) {
    if (!card.tw) return;
    tweens.delete(card.tw);
    card.tw = null;
    card.x = card.px;
    card.y = card.py;
    card.rot = card.placed ? card.tilt : 0;
    card.scale = 1;
    paintCard(card);
  }

  ids.forEach((id, i) => {
    const r = seeded(hash(id) + 11);
    const ink = INK[id] || INK.browser;
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const k = i - row * perRow;
    const home = { x: W / 2 + (k - (inRow - 1) / 2) * (cw + gap), y: areaH + 14 + row * (ch + gap) + ch / 2 };
    const top = titleY + 22;
    const slot = { x: 0, y: 0 };
    if (narrow) {
      // A phone gets a grid that reads like a snake, so neighbours sit next to each other.
      const cols = clamp(Math.floor((W - 12) / (cw + 26)), 2, 3);
      const lines = Math.ceil(n / cols);
      const line = Math.floor(i / cols);
      const col = line % 2 ? cols - 1 - (i % cols) : i % cols;
      slot.x = clamp(((col + 0.5) * W) / cols, bounds.minX, bounds.maxX);
      slot.y = clamp(top + ((line + 0.5) * (areaH - top - 6)) / lines, bounds.minY, bounds.maxY);
    } else {
      slot.x = clamp(12 + ((i + 0.5) * (W - 24)) / n, bounds.minX, bounds.maxX);
      slot.y = clamp(top + (((i % 2) + 0.5) * (areaH - top - 6)) / 2, bounds.minY, bounds.maxY);
    }
    const hint = hintOf(id);
    const g = svg(
      'g',
      { class: 'wb-card', 'data-card': id, tabindex: 0, role: 'button', 'aria-label': `${labelOf(id)}. ${hint}` },
      svg('rect', { class: 'wb-card-shadow', x: -cw / 2 + 1.5, y: -ch / 2 + 2.5, width: cw, height: ch, rx: 5 }),
      svg('path', { class: 'wb-card-halo', d: loop(0, 0, cw / 2 + 8, ch / 2 + 8, r, 2.2) }),
      svg('rect', { class: 'wb-card-paper', x: -cw / 2, y: -ch / 2, width: cw, height: ch, rx: 5 }),
      svg('path', { class: 'wb-card-line', d: rect(-cw / 2 + 4, -ch / 2 + 4, cw - 8, ch - 8, r, amp * 0.6), stroke: ink }),
      showIcon
        ? svg('path', { class: 'wb-card-icon', d: ICONS[id] || ICONS.box, stroke: ink, transform: `translate(${-cw / 2 + 10} -12)` })
        : null,
      labelNode(id),
      svg(
        'g',
        { class: 'wb-grip', 'data-grip': true, transform: `translate(0 ${-ch / 2})` },
        svg('circle', { class: 'wb-grip-hit', r: 13 }),
        svg('circle', { class: 'wb-grip-dot', r: 6.5, fill: ink }),
        svg('circle', { class: 'wb-grip-shine', r: 1.8, cx: -2, cy: -2.2 }),
      ),
    );
    const card = { id, g, ink, home, slot, x: home.x, y: home.y, px: home.x, py: home.y, rot: 0, scale: 1, placed: false, tilt: (r() - 0.5) * 3.4, tw: null };
    cards.set(id, card);
    gCards.append(g);
    paintCard(card, false);
  });
  fitLabels();
  document.fonts?.ready?.then(() => !over && fitLabels());
  document.fonts?.addEventListener?.('loadingdone', () => !over && fitLabels(), { signal });

  const boxOf = (card) => ({ cx: card.x, cy: card.y, w: cw, h: ch });

  function cardAt(x, y, pad, skip) {
    let best = null;
    let bestD = Infinity;
    for (const card of cards.values()) {
      if (!card.placed || card === skip) continue;
      if (Math.abs(x - card.x) > cw / 2 + pad || Math.abs(y - card.y) > ch / 2 + pad) continue;
      const d = Math.hypot(x - card.x, y - card.y);
      if (d < bestD) {
        best = card;
        bestD = d;
      }
    }
    return best;
  }

  // Nearest spot on the grid that isn't on top of another box.
  function freeSpot(card, x, y) {
    let px = clamp(snap(x), bounds.minX, bounds.maxX);
    let py = clamp(snap(y), bounds.minY, bounds.maxY);
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const other of cards.values()) {
        if (other === card || !other.placed) continue;
        const ox = cw + 8 - Math.abs(px - other.px);
        const oy = ch + 16 - Math.abs(py - other.py);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) px += (px >= other.px ? 1 : -1) * ox;
        else py += (py >= other.py ? 1 : -1) * oy;
        moved = true;
      }
      px = clamp(px, bounds.minX, bounds.maxX);
      py = clamp(py, bounds.minY, bounds.maxY);
      if (!moved) break;
    }
    return [px, py];
  }

  function lift(card) {
    card.g.classList.add('lifted');
    gCards.append(card.g);
    card.scale = 1.07;
    paintCard(card, false);
    sfx('ui_tap');
  }

  function place(card, x, y) {
    const [px, py] = freeSpot(card, x, y);
    card.placed = true;
    card.px = px;
    card.py = py;
    card.g.classList.remove('lifted');
    card.g.classList.add('placed');
    fly(card, px, py, { seconds: 0.22, rot: card.tilt, scale: 1 });
    layAll();
    sfx('stamp');
    clearGhost();
  }

  function sendHome(card) {
    for (const e of [...edges.values()]) {
      if (e.from === card.id || e.to === card.id) removeEdge(e, true);
    }
    card.placed = false;
    card.px = card.home.x;
    card.py = card.home.y;
    card.g.classList.remove('lifted', 'placed', 'selected');
    if (selected === card) selected = null;
    fly(card, card.home.x, card.home.y, { seconds: 0.24, rot: 0, scale: 1, ease: easeOut });
    layAll();
  }

  function select(card) {
    if (selected) selected.g.classList.remove('selected');
    selected = card || null;
    if (selected) selected.g.classList.add('selected');
  }

  // ---- lines ----
  // How far a line has to bow to get round a box that sits in its way.
  function bendFor(e, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    let bend = 0;
    for (const c of cards.values()) {
      if (!c.placed || c.down || c.id === e.from || c.id === e.to) continue;
      const along = ((c.px - x1) * dx + (c.py - y1) * dy) / len;
      const half = (Math.abs(dx) * cw + Math.abs(dy) * ch) / (2 * len);
      if (along < -half * 0.6 || along > len + half * 0.6) continue;
      const off = (c.px - x1) * nx + (c.py - y1) * ny;
      const reach = (Math.abs(nx) * cw + Math.abs(ny) * ch) / 2 + 9;
      if (Math.abs(off) >= reach) continue;
      const t = clamp(along / len, 0.5 - 0.3, 0.5 + 0.3);
      const edge = clamp(t + (t < 0.5 ? -1 : 1) * (half / len) * 0.7, 0.14, 0.86);
      const want = ((off > 0 ? -1 : 1) * (reach - Math.abs(off))) / (4 * edge * (1 - edge));
      if (Math.abs(want) > Math.abs(bend)) bend = want;
    }
    return clamp(bend, -ch * 1.9, ch * 1.9);
  }

  function layEdge(e) {
    const a = cards.get(e.from);
    const b = cards.get(e.to);
    const [x1, y1] = edgePoint(boxOf(a), b.x, b.y, 4);
    const [x2, y2] = edgePoint(boxOf(b), a.x, a.y, 9);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bend = bendFor(e, x1, y1, x2, y2);
    const bx = (-dy / len) * bend;
    const by = (dx / len) * bend;
    e.bend = bend;
    const r = seeded(e.seed);
    e.p1.setAttribute('d', stroke(x1, y1, x2, y2, r, amp, bend));
    e.p2.setAttribute('d', stroke(x1, y1, x2, y2, r, amp, bend));
    e.head.setAttribute('d', arrowHead(x2, y2, Math.atan2(dy * 0.3 - by * 1.33, dx * 0.3 - bx * 1.33), narrow ? 9 : 11, r));
    const mx = (x1 + x2) / 2 + bx * 2;
    const my = (y1 + y2) / 2 + by * 2;
    e.hit.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }

  function layAll() {
    for (const e of edges.values()) layEdge(e);
  }

  function addEdge(from, to) {
    const k = pairKey(from.id, to.id);
    if (from === to || edges.has(k)) return null;
    edgeCount += 1;
    const e = { k, from: from.id, to: to.id, seed: hash(k) + edgeCount * 97 };
    e.hit = svg('path', { class: 'wb-edge-hit' });
    e.p1 = svg('path', { class: 'wb-ink wb-draw', pathLength: 1 });
    e.p2 = svg('path', { class: 'wb-ink wb-ink-2 wb-draw', pathLength: 1 });
    e.head = svg('path', { class: 'wb-ink wb-head wb-draw', pathLength: 1 });
    e.g = svg(
      'g',
      {
        class: 'wb-edge',
        'data-edge': k,
        tabindex: 0,
        role: 'button',
        'aria-label': `Line from ${labelOf(e.from)} to ${labelOf(e.to)}. Press Enter to rub it out.`,
      },
      svg('title', { text: 'Rub out' }),
      e.hit,
      e.p1,
      e.p2,
      e.head,
    );
    gEdges.append(e.g);
    edges.set(k, e);
    layEdge(e);
    sfx('marker_squeak');
    clearGhost(k);
    return e;
  }

  function removeEdge(e, quiet) {
    if (!edges.delete(e.k)) return;
    e.g.classList.add('wb-rubbed');
    e.g.removeAttribute('tabindex');
    after(0.24, () => e.g.remove());
    if (!quiet) sfx('dismiss');
  }

  function wipe() {
    if (phase !== 'build' || held || !edges.size) return;
    for (const e of [...edges.values()]) removeEdge(e, true);
    sfx('dismiss');
    select(null);
    restHelp();
  }

  function clearGhost(k) {
    if (k && gGhost.dataset.edge && gGhost.dataset.edge !== k) return;
    gGhost.replaceChildren();
    delete gGhost.dataset.edge;
  }

  function showGhost(aId, bId) {
    const a = cards.get(aId);
    const b = cards.get(bId);
    if (!a?.placed || !b?.placed) return;
    const A = { cx: a.px, cy: a.py, w: cw, h: ch };
    const B = { cx: b.px, cy: b.py, w: cw, h: ch };
    const [x1, y1] = edgePoint(A, b.px, b.py, 5);
    const [x2, y2] = edgePoint(B, a.px, a.py, 5);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    gGhost.dataset.edge = pairKey(aId, bId);
    gGhost.replaceChildren(
      svg('path', { class: 'wb-ghost', d: stroke(x1, y1, x2, y2, seeded(5), 1) }),
      svg('circle', { class: 'wb-ghost-dot', cx: mx, cy: my, r: 11 }),
      svg('text', { class: 'wb-ghost-mark', x: mx, y: my + 6, 'text-anchor': 'middle', text: '?' }),
    );
  }

  // ---- pointer ----
  function toBoard(e) {
    const r = board.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / (r.width || W), ((e.clientY - r.top) * H) / (r.height || H)];
  }

  function showLive(card, x, y) {
    const target = cardAt(x, y, 14, card);
    if (drag.target !== target) {
      drag.target?.g.classList.remove('target');
      target?.g.classList.add('target');
      drag.target = target;
    }
    const [x1, y1] = edgePoint(boxOf(card), target ? target.x : x, target ? target.y : y, 4);
    let x2 = x;
    let y2 = y;
    if (target) [x2, y2] = edgePoint(boxOf(target), card.x, card.y, 9);
    const r = seeded(4242);
    liveLine.setAttribute('d', stroke(x1, y1, x2, y2, r, amp));
    liveHead.setAttribute('d', arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), narrow ? 9 : 11, r));
  }

  function hideLive() {
    liveLine.removeAttribute('d');
    liveHead.removeAttribute('d');
  }

  function tapCard(card) {
    if (!card.placed) {
      lift(card);
      place(card, card.slot.x, card.slot.y);
      return;
    }
    if (selected && selected !== card) {
      const made = addEdge(selected, card);
      if (!made) sfx('ui_tap');
      select(null);
    } else if (selected === card) {
      select(null);
    } else {
      select(card);
      sfx('ui_tap');
    }
  }

  function showPieceHelp(card) {
    if (phase !== 'build') return;
    const hint = hintOf(card.id);
    setHelp(`${labelOf(card.id)}${hint ? '.' : ''} ${hint}`.trim(), card.placed ? 'Drag from it to another box to draw a line.' : 'Drag it onto the board, or just tap it.', 'piece');
  }

  function cancelDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.target?.g.classList.remove('target');
    hideLive();
    if (d.kind === 'place') sendHome(d.card);
    else if (d.kind === 'move') {
      d.card.g.classList.remove('lifted');
      fly(d.card, d.card.px, d.card.py, { rot: d.card.tilt, scale: 1 });
    }
    try {
      board.releasePointerCapture(d.pointerId);
    } catch {
      // The pointer was already gone.
    }
  }

  board.addEventListener(
    'pointerdown',
    (e) => {
      if (held || phase !== 'build' || drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cardEl = e.target.closest?.('[data-card]');
      const edgeEl = e.target.closest?.('[data-edge]');
      const [x, y] = toBoard(e);
      if (cardEl) {
        const card = cards.get(cardEl.dataset.card);
        if (!card) return;
        settleNow(card);
        const grip = !!e.target.closest('[data-grip]');
        const kind = !card.placed ? 'place' : grip ? 'move' : 'link';
        drag = { kind, card, x0: x, y0: y, dx: card.x - x, dy: card.y - y, moved: false, pointerId: e.pointerId, target: null };
        if (kind !== 'link') lift(card);
        showPieceHelp(card);
      } else if (edgeEl && edges.has(edgeEl.dataset.edge)) {
        drag = { kind: 'erase', edge: edges.get(edgeEl.dataset.edge), x0: x, y0: y, moved: false, pointerId: e.pointerId };
      } else {
        select(null);
        return;
      }
      try {
        board.setPointerCapture(e.pointerId);
      } catch {
        // Not every pointer can be captured.
      }
      e.preventDefault();
    },
    { signal },
  );

  board.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const [x, y] = toBoard(e);
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 7) drag.moved = true;
      if (!drag.moved) return;
      if (drag.kind === 'place' || drag.kind === 'move') {
        const card = drag.card;
        card.x = clamp(x + drag.dx, cw / 2 - 4, W - cw / 2 + 4);
        card.y = clamp(y + drag.dy, ch / 2 + 6, H - ch / 2 + 4);
        const lean = clamp((card.x - (card.lastX ?? card.x)) * 1.2, -7, 7);
        card.rot += (lean - card.rot) * 0.25;
        card.lastX = card.x;
        paintCard(card);
      } else if (drag.kind === 'link') {
        showLive(drag.card, x, y);
      }
    },
    { signal },
  );

  function release(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    try {
      board.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    if (d.kind === 'erase') {
      if (!d.moved) removeEdge(d.edge);
      return;
    }
    const card = d.card;
    card.lastX = undefined;
    if (d.kind === 'place' || d.kind === 'move') {
      if (!d.moved && d.kind === 'place') place(card, card.slot.x, card.slot.y);
      else if (!d.moved) {
        card.g.classList.remove('lifted');
        fly(card, card.px, card.py, { rot: card.tilt, scale: 1 });
      } else if (card.y < areaH - ch * 0.2) place(card, card.x, card.y);
      else sendHome(card);
      return;
    }
    hideLive();
    d.target?.g.classList.remove('target');
    if (!d.moved) {
      tapCard(card);
      return;
    }
    if (d.target) {
      const made = addEdge(card, d.target);
      if (!made) sfx('ui_tap');
      select(null);
    }
  }
  board.addEventListener('pointerup', release, { signal });
  board.addEventListener('pointercancel', () => cancelDrag(), { signal });

  board.addEventListener(
    'pointerover',
    (e) => {
      if (drag || phase !== 'build' || e.pointerType !== 'mouse') return;
      const cardEl = e.target.closest?.('[data-card]');
      if (cardEl) showPieceHelp(cards.get(cardEl.dataset.card));
    },
    { signal },
  );
  board.addEventListener(
    'pointerleave',
    () => {
      if (!drag && phase === 'build' && help.dataset.tone === 'piece') restHelp();
    },
    { signal },
  );

  board.addEventListener(
    'keydown',
    (e) => {
      if (held || phase !== 'build') return;
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      const cardEl = e.target.closest?.('[data-card]');
      const edgeEl = e.target.closest?.('[data-edge]');
      if (cardEl) {
        e.preventDefault();
        tapCard(cards.get(cardEl.dataset.card));
      } else if (edgeEl && edges.has(edgeEl.dataset.edge)) {
        e.preventDefault();
        removeEdge(edges.get(edgeEl.dataset.edge));
      }
    },
    { signal },
  );

  // ---- judging ----
  function judge() {
    const has = (pair) => Array.isArray(pair) && edges.has(pairKey(pair[0], pair[1]));
    const the = (id) => `the ${labelOf(id)}`;
    for (const f of puzzle.forbidden || []) {
      if (!has(f.edge)) continue;
      return {
        ok: false,
        kind: 'forbidden',
        edge: f.edge,
        at: f.at,
        text: f.text || cfg.defaultFailure,
        hint: `Rub out the line between ${the(f.edge[0])} and ${the(f.edge[1])}.`,
      };
    }
    const gaps = [...(puzzle.missing || []), ...(puzzle.required || []).map((edge) => ({ edge, text: cfg.defaultFailure }))];
    for (const m of gaps) {
      if (!Array.isArray(m.edge) || has(m.edge)) continue;
      const loose = m.edge.filter((id) => cards.has(id) && !cards.get(id).placed);
      const hint = loose.length
        ? `${loose.map((id) => labelOf(id)).join(' and ')} ${loose.length > 1 ? 'are' : 'is'} still in the tray.`
        : `Nothing connects ${the(m.edge[0])} to ${the(m.edge[1])}.`;
      return { ok: false, kind: 'missing', edge: m.edge, at: m.at, text: m.text || cfg.defaultFailure, hint };
    }
    const wanted = new Set([...(puzzle.required || []), ...(puzzle.optional || [])].map((pair) => pairKey(pair[0], pair[1])));
    const extras = [...edges.keys()].filter((k) => !wanted.has(k));
    return { ok: true, text: puzzle.success || 'It held.', extras };
  }

  // ---- traffic ----
  function pulse(card) {
    if (!card || card.tw || card.down || (card.pulsed && run.elapsed - card.pulsed < 0.14)) return;
    card.pulsed = run.elapsed;
    card.scale = 1.07;
    card.tw = tween(
      0.16,
      (k) => {
        card.scale = 1.07 - 0.07 * k;
        paintCard(card, false);
      },
      () => {
        card.tw = null;
      },
    );
  }

  function sendTraffic() {
    if (phase !== 'build' || held) return;
    cancelDrag();
    if (!edges.size) {
      setHelp("Nothing's connected yet.", 'Traffic needs somewhere to go. Draw a line first.', 'nudge');
      sfx('ui_tap');
      return;
    }
    phase = 'traffic';
    tries += 1;
    select(null);
    clearGhost();
    for (const card of cards.values()) settleNow(card);
    root.classList.add('wb-running');
    sendButton.disabled = true;
    wipeButton.disabled = true;
    sfx('ui_tap');

    const verdict = judge();
    const rps = Number(puzzle.traffic?.rps) || 200;
    const total = Math.round(clamp(8 + 16 * Math.log10(rps), 28, 72));
    const D = clamp(Number(puzzle.traffic?.durationSec) || 5, 3, 8) * 0.8;
    const srcId = ids[0];
    const src = cards.get(srcId);

    const adj = new Map();
    for (const card of cards.values()) if (card.placed) adj.set(card.id, []);
    for (const e of edges.values()) {
      adj.get(e.from)?.push(e.to);
      adj.get(e.to)?.push(e.from);
    }
    const level = new Map();
    if (src?.placed) {
      level.set(srcId, 0);
      const queue = [srcId];
      while (queue.length) {
        const id = queue.shift();
        for (const to of adj.get(id) || []) {
          if (level.has(to)) continue;
          level.set(to, level.get(id) + 1);
          queue.push(to);
        }
      }
    }
    const next = new Map();
    for (const [id, list] of adj) {
      next.set(id, level.has(id) ? list.filter((to) => level.get(to) === level.get(id) + 1).map((to) => ({ to, w: 1 })) : []);
    }

    let weak = null;
    if (!verdict.ok) {
      const [a, b] = verdict.edge;
      const la = level.get(a);
      const lb = level.get(b);
      if (verdict.kind === 'forbidden') {
        let lo = b;
        let hi = a;
        if (la !== undefined && (lb === undefined || la < lb)) {
          lo = a;
          hi = b;
        }
        if (la !== undefined || lb !== undefined) {
          const out = (next.get(lo) || []).filter((step) => step.to !== hi);
          out.push({ to: hi, w: 4 });
          next.set(lo, out);
        }
        weak = hi;
        edges.get(pairKey(a, b))?.g.classList.add('wb-suspect');
      } else {
        const near = la !== undefined && (lb === undefined || la <= lb) ? a : b;
        const far = near === a ? b : a;
        const spill = SPILL[far];
        if (spill && spill !== near && level.has(spill)) weak = spill;
        else if (level.has(near)) weak = near;
        else weak = src?.placed ? srcId : null;
      }
      if (verdict.at && cards.get(verdict.at)?.placed) weak = verdict.at;
      if (weak && !cards.get(weak)?.placed) weak = src?.placed ? srcId : null;
    }

    const speed = narrow ? 200 : 330;
    const dotR = narrow ? 3.2 : 4;
    const need = Math.max(6, Math.round(total * 0.2));
    const spawnAt = (i) => {
      const u = i / total;
      return u < 0.15 ? (u / 0.15) * 0.3 * D : (0.3 + ((u - 0.15) / 0.85) * 0.5) * D;
    };
    const centre = (id) => {
      const card = cards.get(id);
      return [card.px, card.py];
    };

    sim = { t: 0, spawned: 0, served: 0, piled: 0, dots: new Set(), fallen: false, fallT: 0, falling: null, ending: false };
    count.textContent = `0 of ${fmt(rps)} served`;
    count.classList.remove('bad');

    function setSegment(d) {
      const [x1, y1] = centre(d.path[d.seg]);
      const [x2, y2] = centre(d.path[d.seg + 1]);
      d.x1 = x1;
      d.y1 = y1;
      d.x2 = x2;
      d.y2 = y2;
      d.len = Math.hypot(x2 - x1, y2 - y1) || 1;
      // Follow the line where it bows round a box.
      const from = d.path[d.seg];
      const e = edges.get(pairKey(from, d.path[d.seg + 1]));
      d.bend = e?.bend ? (e.from === from ? e.bend : -e.bend) : 0;
      if (d.bend) {
        const [sx, sy] = edgePoint({ cx: x1, cy: y1, w: cw, h: ch }, x2, y2, 4);
        const [ex, ey] = edgePoint({ cx: x2, cy: y2, w: cw, h: ch }, x1, y1, 9);
        d.t0 = Math.hypot(sx - x1, sy - y1) / d.len;
        d.t1 = 1 - Math.hypot(ex - x2, ey - y2) / d.len;
      }
    }

    function drop(d) {
      d.state = 'fall';
      d.vx = (random() - 0.5) * 160;
      d.vy = -60 - random() * 150;
      d.el.classList.add('bad');
    }

    function pile(d, id) {
      const [cx, cy] = centre(id);
      d.state = 'pile';
      d.hx = cx + (random() - 0.5) * cw * 0.8;
      d.hy = cy + (random() - 0.5) * ch * 0.8;
      d.el.classList.add('bad');
      sim.piled += 1;
    }

    function serve(d) {
      d.state = 'served';
      d.fade = 0.2;
      d.el.classList.add('ok');
      sim.served += 1;
      count.textContent = `${fmt((sim.served / total) * rps)} of ${fmt(rps)} served`;
    }

    function spawn() {
      const i = sim.spawned;
      sim.spawned += 1;
      const node = svg('circle', { class: 'wb-dot', r: dotR });
      const d = { el: node, state: 'go', seg: 0, k: 0, off: (random() - 0.5) * 12, speed: speed * (0.82 + random() * 0.36), x: 0, y: 0 };
      gDots.append(node);
      sim.dots.add(d);
      if (i % 9 === 0) sfx('beat_tick');
      if (!src?.placed) {
        d.state = 'stray';
        d.x = -6;
        d.y = areaH * 0.5 + (random() - 0.5) * 40;
        d.life = 0.3 + random() * 0.2;
        return;
      }
      const path = [srcId];
      let at = srcId;
      while (at !== weak) {
        const out = next.get(at) || [];
        if (!out.length) break;
        let roll = random() * out.reduce((sum, step) => sum + step.w, 0);
        let pick = out[0];
        for (const step of out) {
          roll -= step.w;
          if (roll <= 0) {
            pick = step;
            break;
          }
        }
        at = pick.to;
        path.push(at);
        if (path.length > 12) break;
      }
      d.path = path;
      [d.x, d.y] = centre(srcId);
      pulse(src);
      if (path.length < 2) {
        if (verdict.ok) serve(d);
        else if (sim.fallen) drop(d);
        else pile(d, srcId);
        return;
      }
      setSegment(d);
    }

    function arrive(d) {
      const id = d.path[d.seg + 1];
      pulse(cards.get(id));
      if (id === weak) {
        if (sim.fallen) drop(d);
        else pile(d, id);
      } else if (d.seg + 2 >= d.path.length) serve(d);
      else {
        d.seg += 1;
        d.k = 0;
        setSegment(d);
      }
    }

    function collapse() {
      sim.fallen = true;
      sim.fallT = sim.t;
      sfx('fail');
      frame.classList.remove('wb-shake');
      void frame.offsetWidth;
      frame.classList.add('wb-shake');
      count.classList.add('bad');
      for (const d of sim.dots) if (d.state === 'pile') drop(d);
      const card = weak ? cards.get(weak) : null;
      if (card) {
        card.down = true;
        card.g.classList.add('down');
        gCards.append(card.g);
        for (const e of edges.values()) if (e.from === card.id || e.to === card.id) e.g.classList.add('wb-loose');
        sim.falling = { card, vy: -150, vx: (random() - 0.5) * 60, vr: (random() < 0.5 ? -1 : 1) * (150 + random() * 130) };
        const r = seeded(hash(card.id) + tries);
        gFx.append(svg('path', { class: 'wb-cross wb-draw', pathLength: 1, d: cross(card.px, card.py, Math.min(cw, ch) * 0.42, r) }));
      }
      if (verdict.kind === 'forbidden') {
        const e = edges.get(pairKey(verdict.edge[0], verdict.edge[1]));
        e?.g.classList.remove('wb-suspect');
        e?.g.classList.add('wb-bad');
      } else showGhost(verdict.edge[0], verdict.edge[1]);
    }

    function finish() {
      if (sim.ending) return;
      sim.ending = true;
      if (verdict.ok) {
        sfx('success');
        let i = 0;
        for (const card of cards.values()) {
          if (!card.placed || !level.has(card.id)) continue;
          const r = seeded(hash(card.id) + 3);
          const mark = svg('path', { class: 'wb-tick wb-draw', pathLength: 1, d: tick(card.px + cw / 2 - 4, card.py - ch / 2 - 1, narrow ? 6.5 : 9, r) });
          mark.style.animationDelay = `${i * 70}ms`;
          gFx.append(mark);
          i += 1;
        }
      }
      after(verdict.ok ? 0.75 : 0.2, () => {
        for (const d of sim?.dots || []) d.el.remove();
        sim = null;
        showResult(verdict);
      });
    }

    sim.step = (dt) => {
      const s = sim;
      s.t += dt;
      const spawning = !s.fallen || s.t < s.fallT + 0.5;
      while (spawning && s.spawned < total && s.t >= spawnAt(s.spawned)) spawn();

      for (const d of [...s.dots]) {
        if (d.state === 'go') {
          d.k += (d.speed * dt) / d.len;
          if (d.k >= 1) arrive(d);
          if (d.state === 'go') {
            const nx = -(d.y2 - d.y1) / d.len;
            const ny = (d.x2 - d.x1) / d.len;
            let off = d.off;
            if (d.bend && d.t1 > d.t0) {
              const u = clamp((d.k - d.t0) / (d.t1 - d.t0), 0, 1);
              off += 4 * u * (1 - u) * d.bend;
            }
            d.x = d.x1 + (d.x2 - d.x1) * d.k + nx * off;
            d.y = d.y1 + (d.y2 - d.y1) * d.k + ny * off;
          }
          if (d.state === 'go' && s.fallen && s.t > s.fallT + 1) drop(d);
        } else if (d.state === 'stray') {
          d.x += d.speed * dt;
          d.life -= dt;
          if (d.life <= 0) drop(d);
        } else if (d.state === 'pile') {
          d.x += (d.hx - d.x) * Math.min(1, dt * 12) + (random() - 0.5) * 1.6;
          d.y += (d.hy - d.y) * Math.min(1, dt * 12) + (random() - 0.5) * 1.6;
        } else if (d.state === 'fall') {
          d.vy += 1500 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          if (d.y > H + 14) {
            d.el.remove();
            s.dots.delete(d);
            continue;
          }
        } else if (d.state === 'served') {
          d.fade -= dt;
          if (d.fade <= 0) {
            d.el.remove();
            s.dots.delete(d);
            continue;
          }
          d.el.setAttribute('r', (dotR * (1 + (0.2 - d.fade) * 5)).toFixed(1));
          d.el.style.opacity = Math.max(0, d.fade / 0.2).toFixed(2);
        }
        d.el.setAttribute('cx', d.x.toFixed(1));
        d.el.setAttribute('cy', d.y.toFixed(1));
      }

      const weakCard = weak ? cards.get(weak) : null;
      if (weakCard && !s.fallen && s.piled > 0 && !weakCard.tw) {
        weakCard.rot = weakCard.tilt + Math.sin(s.t * 46) * Math.min(7, 1 + s.piled * 0.6);
        paintCard(weakCard, false);
      }
      if (!verdict.ok && !s.fallen && (s.piled >= need || s.t >= D * 0.72)) collapse();

      if (s.falling) {
        const f = s.falling;
        f.vy += 1700 * dt;
        f.card.x += f.vx * dt;
        f.card.y += f.vy * dt;
        f.card.rot += f.vr * dt;
        paintCard(f.card, false);
        if (f.card.y > H + 120) {
          f.card.g.style.display = 'none';
          s.falling = null;
        }
      }

      const idle = s.dots.size === 0;
      if (verdict.ok && s.spawned >= total && idle) finish();
      else if (!verdict.ok && s.fallen && ((idle && !s.falling && s.t > s.fallT + 0.9) || s.t > s.fallT + 2.6)) finish();
      else if (s.t > D + 9) finish();
    };
  }

  // ---- results ----
  function showNote({ tone, head, text, hint, extra, aside, score, button, action }) {
    help.hidden = true;
    note.hidden = false;
    note.dataset.tone = tone;
    const lines = [
      head ? el('p', { class: 'wb-note-head' }, head, score !== undefined ? el('span', { class: 'wb-score' }, `+${score}`) : null) : null,
      el('p', { class: 'wb-note-text' }, text),
      hint ? el('p', { class: 'wb-note-hint' }, el('b', {}, 'Hint. '), hint) : null,
      extra ? el('p', { class: 'wb-note-hint' }, extra) : null,
      aside ? el('p', { class: 'wb-note-aside' }, aside) : null,
    ];
    note.replaceChildren(...lines.filter(Boolean));
    wipeButton.hidden = true;
    sendButton.disabled = false;
    sendButton.textContent = button;
    primary = action;
    sendButton.focus({ preventScroll: true });
    sendButton.scrollIntoView?.({ block: 'nearest' });
  }

  function showResult(verdict) {
    phase = 'result';
    root.classList.remove('wb-running');
    if (verdict.ok || tries >= 2) run.setClosable?.(false);
    const secs = Math.max(0, Math.floor(left));
    if (verdict.ok) {
      const base = Number(tries === 1 ? points.survive : points.secondTry) || 0;
      const bonus = secs * (Number(points.secondsLeftBonus) || 0);
      outcome = { success: true, score: base + bonus, line: verdict.text, extraLines: verdict.extras.length };
      showNote({
        tone: 'good',
        head: tries === 1 ? 'It held.' : 'It held. Second try.',
        text: verdict.text,
        extra: verdict.extras.length ? cfg.extraEdgeText : '',
        aside: `${base} for holding, ${bonus} for the ${secs} seconds left.`,
        score: base + bonus,
        button: 'Back to work',
        action: end,
      });
    } else if (tries < 2) {
      showNote({ tone: 'bad', head: 'It fell over.', text: verdict.text, hint: verdict.hint, button: 'Fix it', action: retry });
    } else {
      const score = Number(points.fail) || 0;
      outcome = { success: false, score, line: verdict.text };
      showNote({ tone: 'bad', head: 'It fell over again.', text: verdict.text, hint: verdict.hint, score, button: 'Back to work', action: end });
    }
  }

  function retry() {
    if (phase !== 'result') return;
    gFx.replaceChildren();
    count.textContent = '';
    for (const e of edges.values()) e.g.classList.remove('wb-loose');
    for (const card of cards.values()) {
      if (!card.down) continue;
      card.down = false;
      card.g.classList.remove('down');
      card.g.style.display = '';
      card.x = card.px;
      card.y = card.py - 46;
      card.rot = card.tilt - 8;
      card.scale = 1;
      fly(card, card.px, card.py, { seconds: 0.3, rot: card.tilt });
      sfx('stamp');
    }
    left = Math.max(left, Math.min(limit, 20));
    lastWholeSecond = Math.ceil(left);
    note.hidden = true;
    help.hidden = false;
    setHelp('Second try.', 'Same board. Fix the weak spot and send it again.', 'nudge');
    wipeButton.hidden = false;
    wipeButton.disabled = false;
    sendButton.textContent = cfg.runButton || 'Send traffic';
    primary = sendTraffic;
    phase = 'build';
    frame.scrollIntoView?.({ block: 'nearest' });
  }

  function timeUp() {
    phase = 'result';
    cancelDrag();
    select(null);
    sfx('fail');
    const score = tries ? Number(points.fail) || 0 : 0;
    outcome = { success: false, score, line: cfg.timeout, timedOut: true };
    showNote({ tone: 'bad', text: cfg.timeout, button: 'Back to work', action: end });
  }

  function end() {
    if (over || !outcome) return;
    over = true;
    const plays = Number(ctx.save?.get('whiteboard.plays', 0)) || 0;
    ctx.save?.set('whiteboard.plays', plays + 1);
    const detail = {
      puzzle: puzzle.id,
      survived: outcome.success,
      tries,
      secondsLeft: Math.max(0, Math.floor(left)),
      extraLines: outcome.extraLines || 0,
      timedOut: !!outcome.timedOut,
      line: outcome.line,
      emote: outcome.success ? 'idea' : 'sweat',
    };
    if (!outcome.success) detail.irritation = 4;
    resolve({ success: outcome.success, score: outcome.score, detail });
  }

  primary = sendTraffic;

  run.onFrame((dt) => {
    runTweens(dt);
    if (phase === 'build') {
      left -= dt * clockRate;
      run.setTimer(left / limit);
      const whole = Math.ceil(left);
      if (whole !== lastWholeSecond) {
        lastWholeSecond = whole;
        if (whole <= 5 && whole > 0) sfx('beat_tick');
      }
      if (left <= 0) {
        left = 0;
        timeUp();
      }
    }
    sim?.step(dt);
  });

  return {
    hold(on) {
      held = on;
      if (on) cancelDrag();
    },
    destroy() {
      over = true;
      tweens.clear();
      sim = null;
      drag = null;
    },
  };
}

let game = null;
let root = null;
let context = null;

export default {
  id: 'whiteboard',
  title: 'Whiteboard',

  async mount(container, ctx) {
    context = ctx;
    root = el('div', { class: 'wb' });
    container.append(root);
    loadCSS(HAND_FONT);
    await loadCSS('./a/whiteboard.css', import.meta.url);
  },

  start(run) {
    return new Promise((resolve) => {
      game = createGame(root, context, run, resolve);
    });
  },

  stop() {
    game?.destroy();
    game = null;
    root = null;
    context = null;
  },

  pause() {
    game?.hold(true);
  },

  resume() {
    game?.hold(false);
  },
};
