import { el, loadCSS } from '../core/dom.js';

const EDGE = 10;

// A speech bubble in the page, pinned to a point over the head.
export function createBubble(ctx, anchorOf) {
  loadCSS('./player.css', import.meta.url);
  const text = el('span', { class: 'player-say-text' });
  const box = el('div', { class: 'player-say-box' }, text);
  const node = el('div', { class: 'player-say', role: 'status', hidden: true }, box);
  (document.getElementById('hud-layer') || document.body).append(node);

  const screen = {};
  let left = 0;
  let width = 0;
  let height = 0;
  let settle = null;
  let hideTimer = 0;

  function finish() {
    const done = settle;
    settle = null;
    done?.();
  }

  function hide() {
    left = 0;
    if (node.hidden) return finish();
    node.classList.remove('in');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (left <= 0) node.hidden = true;
    }, 200);
    finish();
  }

  function place() {
    const { engine } = ctx;
    const p = anchorOf();
    engine.worldToScreen(p, screen);
    const half = width / 2;
    const x = Math.min(Math.max(screen.x, half + EDGE), Math.max(half + EDGE, engine.width - half - EDGE));
    const y = Math.max(height + EDGE, screen.y);
    node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    const tail = Math.max(-half + 18, Math.min(half - 18, screen.x - x));
    box.style.setProperty('--tail', `${Math.round(tail)}px`);
  }

  ctx.engine.onUpdate(
    (dt, paused) => {
      if (node.hidden) return;
      place();
      if (left <= 0 || paused) return;
      left -= dt;
      if (left <= 0) hide();
    },
    { order: 55, always: true, name: 'player-say' },
  );

  return {
    node,
    get active() {
      return left > 0;
    },
    // Resolves when the bubble goes away.
    show(words, seconds) {
      finish();
      if (!words) {
        hide();
        return Promise.resolve();
      }
      const line = String(words);
      clearTimeout(hideTimer);
      text.textContent = line;
      node.hidden = false;
      width = box.offsetWidth;
      height = box.offsetHeight;
      left = seconds > 0 ? seconds : Math.min(7, Math.max(2.2, 1.4 + line.length * 0.055));
      place();
      node.classList.remove('in');
      void box.offsetWidth;
      node.classList.add('in');
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
    hide,
  };
}
