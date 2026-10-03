import { el, loadCSS } from '../core/dom.js';

const FALLBACK = {
  seconds: 3,
  label: 'Hold to deploy',
  shipped: 'Shipped',
  file: 'fix.js',
  diff: [],
  steps: ['Lint', 'Tests', 'Build', 'Deploy'],
  letGo: 'Let go too early.',
  doneButton: 'Done',
};

// The fix going out: hold the button while the pipeline runs.
export function createDeployRound(ctx) {
  let game = null;
  let parts = null;

  return {
    id: 'deploy',
    title: 'Ship the fix',

    async mount(container) {
      await loadCSS('./story.css', import.meta.url);
      const line = el('p', { class: 'dp-line' });
      const file = el('div', { class: 'dp-file' });
      const code = el('div', { class: 'dp-code' });
      const steps = el('ol', { class: 'dp-steps' });
      const fill = el('span', { class: 'dp-fill', 'aria-hidden': 'true' });
      const label = el('span', { class: 'dp-label' });
      const hold = el('button', { class: 'dp-hold', type: 'button' }, fill, label);
      const note = el('p', { class: 'dp-note', role: 'status' });
      const done = el('button', { class: 'btn primary dp-done', type: 'button', hidden: true });
      const root = el('div', { class: 'dp' }, line, el('div', { class: 'dp-diff' }, file, code), steps, hold, note, el('div', { class: 'round-actions' }, done));
      container.append(root);
      parts = { root, line, file, code, steps, fill, label, hold, note, done };
    },

    start(run) {
      const task = { ...FALLBACK, ...(run.opts?.task || {}) };
      const lines = Array.isArray(run.opts?.lines) ? run.opts.lines : [];
      const p = parts;
      const stepNodes = (task.steps || []).map((name) => el('li', {}, el('i', { 'aria-hidden': 'true' }), name));
      p.steps.replaceChildren(...stepNodes);
      p.file.textContent = task.file || '';
      p.code.replaceChildren(
        ...(task.diff || []).map((row) => {
          const kind = row.startsWith('+') ? 'add' : row.startsWith('-') ? 'del' : 'same';
          return el('div', { class: `dp-row dp-${kind}` }, el('b', {}, kind === 'add' ? '+' : kind === 'del' ? '-' : ' '), el('span', {}, row.slice(1)));
        }),
      );
      p.root.querySelector('.dp-diff').hidden = !(task.diff || []).length;
      p.label.textContent = task.label;
      p.done.textContent = task.doneButton;
      p.line.textContent = lines[0] || '';

      return new Promise((resolve) => {
        const seconds = Math.max(0.5, Number(task.seconds) || 3);
        let progress = 0;
        let holding = false;
        let phase = 'ready';
        let lit = -1;

        const paint = () => {
          p.fill.style.transform = `scaleX(${progress.toFixed(3)})`;
          const now = phase === 'green' ? stepNodes.length : Math.floor(progress * stepNodes.length);
          stepNodes.forEach((node, i) => {
            node.classList.toggle('is-done', i < now);
            node.classList.toggle('is-running', i === now && holding && phase !== 'green');
          });
          if (now > lit && now > 0) ctx.audio?.sfx?.('beat_tick');
          lit = now;
          p.hold.classList.toggle('is-holding', holding);
        };

        const press = (on) => {
          if (phase === 'green' || holding === on) return;
          holding = on;
          if (on) {
            p.note.textContent = '';
            ctx.audio?.sfx?.('ui_tap');
          } else if (progress > 0.04) p.note.textContent = task.letGo || '';
        };

        const finish = () => {
          phase = 'green';
          holding = false;
          progress = 1;
          p.root.classList.add('is-green');
          p.hold.disabled = true;
          p.label.textContent = task.shipped || '';
          p.line.textContent = lines[2] || lines[lines.length - 1] || '';
          p.note.textContent = '';
          p.done.hidden = false;
          ctx.audio?.sfx?.('success');
          paint();
          p.done.focus({ preventScroll: true });
        };

        run.onFrame((dt) => {
          if (phase === 'green') return;
          if (holding) {
            progress = Math.min(1, progress + dt / seconds);
            if (progress > 0.3 && lines[1] && p.line.textContent !== lines[1]) p.line.textContent = lines[1];
            if (progress >= 1) finish();
          } else if (progress > 0) progress = Math.max(0, progress - dt * 1.4);
          paint();
        });

        const signal = run.signal;
        p.hold.addEventListener(
          'pointerdown',
          (e) => {
            if (e.button) return;
            e.preventDefault();
            try {
              p.hold.setPointerCapture(e.pointerId);
            } catch {
              // Capture is a nicety.
            }
            press(true);
          },
          { signal },
        );
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) p.hold.addEventListener(name, () => press(false), { signal });
        p.hold.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
        const isHoldKey = (e) => e.code === 'Space' || e.code === 'Enter';
        window.addEventListener(
          'keydown',
          (e) => {
            if (!isHoldKey(e) || phase === 'green' || run.paused) return;
            e.preventDefault();
            press(true);
          },
          { signal },
        );
        window.addEventListener('keyup', (e) => isHoldKey(e) && press(false), { signal });
        window.addEventListener('blur', () => press(false), { signal });

        let closing = false;
        p.done.addEventListener(
          'click',
          () => {
            if (closing) return;
            closing = true;
            resolve({ success: true, score: 0, detail: { line: lines[2] || '', emote: 'heart' } });
          },
          { signal },
        );

        game = {
          press,
          peek: () => ({ phase, progress, holding }),
        };
        paint();
        p.hold.focus({ preventScroll: true });
      });
    },

    pause() {
      game?.press(false);
    },

    stop() {
      game = null;
      parts = null;
    },

    peek() {
      return game?.peek() || null;
    },
  };
}
