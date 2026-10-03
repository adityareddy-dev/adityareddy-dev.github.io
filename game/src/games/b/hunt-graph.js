// The frame time strip under the pretend page. Bars scroll left, a long frame stands up red.
import { fitCanvas, fmtMs } from './kit.js';

const STEP = 0.11;
const CAP = 110;
const BAR = 7;
const GAP = 2;

const tone = (ms) => (ms > 200 ? '#ff6369' : ms > 100 ? '#f2b33d' : '#3fb37f');

export function createGraph(canvas) {
  const bars = [];
  const queue = [];
  let acc = 0;
  let live = null;

  const calm = () => 5 + Math.random() * 6;
  for (let i = 0; i < 120; i += 1) bars.push({ ms: calm() });

  function push(bar) {
    bars.push(bar);
    if (bars.length > 160) bars.shift();
  }

  function draw() {
    const { g, width: W, height: H } = fitCanvas(canvas);
    const base = H - 4;
    const top = 16;
    const y = (ms) => base - (Math.min(ms, CAP) / CAP) * (base - top);
    g.clearRect(0, 0, W, H);

    g.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    g.textBaseline = 'middle';
    for (const [ms, label] of [[16, '16 ms'], [50, '50 ms']]) {
      g.strokeStyle = 'rgba(245, 245, 247, 0.14)';
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(0, y(ms) + 0.5);
      g.lineTo(W, y(ms) + 0.5);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(245, 245, 247, 0.42)';
      g.textAlign = 'left';
      g.fillText(label, 4, y(ms) - 6);
    }

    const count = Math.ceil(W / (BAR + GAP));
    const shown = bars.slice(-count);
    let x = W - shown.length * (BAR + GAP);
    let label = null;
    for (const bar of shown) {
      const h = Math.max(2, base - y(bar.ms));
      g.fillStyle = tone(bar.ms);
      g.fillRect(x, base - h, BAR, h);
      if (bar.ms > CAP) {
        g.fillStyle = '#ffd7d9';
        g.fillRect(x, base - h - 3, BAR, 2);
      }
      if (bar.ms > 50) label = { x, ms: bar.ms, live: bar === live };
      x += BAR + GAP;
    }
    if (label) {
      const text = fmtMs(label.ms);
      g.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      const w = g.measureText(text).width;
      const tx = Math.max(54, Math.min(W - w - 6, label.x - w - 8));
      const ty = Math.max(9, Math.min(base - 10, y(label.ms) + 2));
      g.fillStyle = 'rgba(20, 20, 26, 0.85)';
      g.fillRect(tx - 4, ty - 8, w + 8, 16);
      g.fillStyle = tone(label.ms);
      g.textAlign = 'left';
      g.fillText(text, tx, ty);
    }
  }

  return {
    update(dt) {
      if (!live) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          push({ ms: queue.length ? queue.shift() : calm() });
        }
      }
      draw();
    },
    // A quick interaction: one taller bar.
    bump(ms) {
      queue.push(ms);
    },
    // A frame that hasn't finished yet. Nothing scrolls until it does.
    hold() {
      live = { ms: 0 };
      push(live);
    },
    grow(ms) {
      if (live) live.ms = ms;
    },
    release(ms) {
      if (live) live.ms = ms;
      live = null;
      acc = 0;
    },
    get busy() {
      return !!live;
    },
  };
}
