import { el } from './dom.js';
import { trapTab } from '../ui/util.js';

// Runs one mini-game at a time in a framed overlay and pauses the world while it's up.
export function createRounds(ctx) {
  const { bus, state, engine, config } = ctx;
  const layer = document.getElementById('round-layer');
  const registry = new Map();
  let active = null;

  function register(round) {
    if (!round || !round.id || typeof round.mount !== 'function' || typeof round.start !== 'function') {
      throw new Error('A round needs id, mount(container, ctx) and start(run).');
    }
    registry.set(round.id, round);
    return round;
  }

  // The world is paused by "round" itself. Anything else on top pauses the round too.
  const heldUp = () => engine.pausedBy.some((reason) => reason !== 'round');

  function tick(dt) {
    if (!active) return;
    const hold = heldUp();
    if (hold !== active.paused) {
      active.paused = hold;
      try {
        hold ? active.round.pause?.() : active.round.resume?.();
      } catch (err) {
        console.error(`round "${active.id}" pause hook threw`, err);
      }
      bus.emit(hold ? 'round:pause' : 'round:resume', { id: active.id });
    }
    if (hold) return;
    active.elapsed += dt;
    for (const fn of [...active.frames]) {
      try {
        fn(dt, active.elapsed);
      } catch (err) {
        console.error(`round "${active.id}" frame threw`, err);
      }
    }
  }
  engine.onUpdate(tick, { order: 45, always: true, name: 'rounds' });

  // Ends the running round with a result of our choosing, whatever the game is doing.
  function finish(result = {}) {
    active?.settle({ success: true, score: 0, detail: null, ...result });
  }

  function abort(reason) {
    active?.settle({ success: false, score: 0, detail: { aborted: reason || true }, aborted: true });
  }

  async function run(id, opts = {}) {
    const round = registry.get(id);
    if (!round) throw new Error(`No round called "${id}".`);
    if (active) throw new Error(`Round "${active.id}" is still running.`);

    const title = opts.title || round.title || id;
    const titleNode = el('h2', { class: 'round-title' }, title);
    const closeButton = el('button', { class: 'btn quiet round-close', type: 'button', onclick: () => abort('closed') }, 'Give up');
    closeButton.hidden = opts.closable === false;
    const timerFill = el('i');
    const timer = el('div', { class: 'round-timer', hidden: true, 'aria-hidden': 'true' }, timerFill);
    const container = el('div', { class: 'round-body' });
    const frame = el(
      'section',
      { class: `round round-${id}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
      el('header', { class: 'round-head' }, titleNode, closeButton),
      timer,
      container,
    );

    const stopper = new AbortController();
    let settle;
    const forced = new Promise((resolve) => {
      settle = resolve;
    });

    active = { id, round, frame, frames: new Set(), elapsed: 0, paused: false, settle };
    const m = config.meters;
    const runInfo = {
      id,
      opts,
      frame,
      energy: state.energy,
      focus: state.focus,
      irritation: state.irritation,
      lowEnergy: state.energy < m.energy.lowAt,
      lowFocus: state.focus < m.focus.lowAt,
      difficulty: opts.difficulty ?? Math.min(1, Math.max(0, 1 - state.energy / state.energyMax)),
      config: ctx.data?.story?.rounds?.[id] || null,
      signal: stopper.signal,
      get paused() {
        return !!active && active.paused;
      },
      get elapsed() {
        return active ? active.elapsed : 0;
      },
      // fn(dt, elapsed) every frame while the round isn't held up. Cleared when the round ends.
      onFrame(fn) {
        active?.frames.add(fn);
        return () => active?.frames.delete(fn);
      },
      // Share of the time left, 1 down to 0. null hides the bar.
      setTimer(left) {
        timer.hidden = left === null || left === undefined;
        if (timer.hidden) return;
        const share = Math.min(1, Math.max(0, Number(left) || 0));
        timerFill.style.transform = `scaleX(${share})`;
        timer.classList.toggle('low', share < 0.25);
      },
      setTitle(text) {
        titleNode.textContent = text;
        frame.setAttribute('aria-label', text);
      },
      // A result screen has its own way out, so the header button can go.
      setClosable(on) {
        closeButton.hidden = !on || opts.closable === false;
      },
    };

    const cameFrom = document.activeElement;
    trapTab(frame);
    layer.append(frame);
    layer.hidden = false;
    frame.focus({ preventScroll: true });
    ctx.interact?.clear();
    engine.pause('round');
    state.set({ round: id });
    bus.emit('round:start', { id, title, opts });

    let result;
    try {
      await round.mount(container, ctx);
      result = await Promise.race([Promise.resolve(round.start(runInfo)), forced]);
    } catch (err) {
      console.error(`round "${id}" failed`, err);
      result = { success: false, score: 0, detail: { error: String(err?.message || err) } };
    }
    try {
      round.stop?.();
    } catch (err) {
      console.error(`round "${id}" stop threw`, err);
    }
    stopper.abort();
    frame.remove();
    layer.hidden = true;
    const back = cameFrom?.isConnected && cameFrom !== document.body ? cameFrom : document.getElementById('game-canvas');
    back?.focus?.({ preventScroll: true });
    active = null;
    engine.resume('round');
    state.set({ round: null });

    const out = {
      id,
      success: !!result?.success,
      score: Math.round(Number(result?.score) || 0),
      detail: result?.detail ?? null,
      aborted: !!result?.aborted,
    };
    bus.emit('round:end', out);
    return out;
  }

  return {
    register,
    run,
    finish,
    abort,
    layer,
    has: (id) => registry.has(id),
    get: (id) => registry.get(id) || null,
    list: () => [...registry.values()].map((r) => ({ id: r.id, title: r.title || r.id })),
    get active() {
      return active ? { id: active.id, title: active.round.title || active.id } : null;
    },
    get paused() {
      return !!active && active.paused;
    },
  };
}
