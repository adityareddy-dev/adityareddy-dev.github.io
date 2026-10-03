// Small helpers shared by the coffee, gym and hunt rounds.

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);

export const pick = (list, fallback = '') =>
  Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : fallback;

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const fmtMs = (ms) => `${Math.round(ms).toLocaleString('en-US')} ms`;

export function sfx(ctx, name) {
  try {
    ctx?.audio?.sfx?.(name);
  } catch {
    // A sound that won't play isn't worth stopping a round for.
  }
}

// Seconds into the round right now, finer than one frame. Key presses land between frames.
export function preciseClock(run) {
  let seen = run.elapsed;
  let at = performance.now();
  run.onFrame((dt, elapsed) => {
    seen = elapsed;
    at = performance.now();
  });
  return () => (run.paused ? seen : seen + Math.min(0.05, (performance.now() - at) / 1000));
}

// Calls fn once after some round time. Stops with the round and holds while it's paused.
export function after(run, seconds, fn) {
  let t = 0;
  const off = run.onFrame((dt) => {
    t += dt;
    if (t < seconds) return;
    off();
    fn();
  });
  return off;
}

// The button that ends a round. It wakes up after a beat so a key still held down can't skip the result.
export function armButton(button, run, onGo, guard = 0.6) {
  button.disabled = true;
  run.setClosable?.(false);
  after(run, guard, () => {
    button.disabled = false;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  button.addEventListener('click', () => onGo(), { signal: run.signal, once: true });
}

// A canvas sized to its box and the pixel ratio. Returns { g, width, height } in CSS pixels.
export function fitCanvas(canvas, maxRatio = 2) {
  const ratio = Math.min(maxRatio, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { g, width, height };
}
