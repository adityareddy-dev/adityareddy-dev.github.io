// Code review round. One line in each diff is the bug. Find it before the timer does.
import { el, loadCSS } from '../core/dom.js';
import { highlight } from './a/highlight.js';
import { svg } from './a/sketch.js';
import { REVIEW } from './a/fallback.js';

const usable = (d) =>
  d && Array.isArray(d.lines) && d.lines.length > 0 && Number.isInteger(d.bugLine) && d.bugLine >= 0 && d.bugLine < d.lines.length;

function settings(config) {
  const c = config && typeof config === 'object' ? config : {};
  const diffs = (Array.isArray(c.diffs) ? c.diffs : []).filter(usable);
  const copy = { ...REVIEW.copy, ...(c.copy || {}) };
  const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
  return {
    ...REVIEW,
    ...c,
    diffs: diffs.length ? diffs : REVIEW.diffs,
    points: { ...REVIEW.points, ...(c.points || {}) },
    streak: { ...REVIEW.streak, ...(c.streak || {}) },
    copy: { ...copy, correct: list(copy.correct, REVIEW.copy.correct), wrong: list(copy.wrong, REVIEW.copy.wrong) },
  };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The ones you haven't had lately come first.
function pickDiffs(cfg, ctx, run) {
  const all = cfg.diffs;
  if (Array.isArray(run.opts?.diffs)) {
    const named = run.opts.diffs.map((id) => all.find((d) => d.id === id)).filter(Boolean);
    if (named.length) return named;
  }
  const want = Math.max(1, Math.min(all.length, Number(run.opts?.count) || Number(cfg.diffsPerRound) || 3));
  const saved = ctx.save?.get('review.seen', []);
  const seen = Array.isArray(saved) ? saved : [];
  const fresh = shuffle(all.filter((d) => !seen.includes(d.id)));
  const stale = shuffle(all.filter((d) => seen.includes(d.id)));
  const picked = [...fresh, ...stale].slice(0, want);
  const ids = picked.map((d) => d.id);
  ctx.save?.set('review.seen', fresh.length > want ? [...seen, ...ids] : ids);
  return picked;
}

function createGame(root, ctx, run, resolve) {
  const cfg = settings(run.config);
  const diffs = pickDiffs(cfg, ctx, run);
  const points = cfg.points;
  const tired = !!run.lowEnergy;
  const perDiff = Math.max(5, Number(tired ? cfg.lowEnergySecondsPerDiff : cfg.secondsPerDiff) || 18);
  const penalty = Number(cfg.wrongPenaltySec) || 3;
  const signal = run.signal;
  const sfx = (name) => ctx.audio?.sfx?.(name);

  let index = -1;
  let phase = 'idle';
  let held = false;
  let over = false;
  let left = perDiff;
  let grace = 0;
  let lastWholeSecond = 0;
  let rows = [];
  let current = null;
  let copyTurn = Math.floor(Math.random() * 7);
  const results = [];
  const timers = new Set();
  const after = (seconds, fn) => {
    const t = { left: seconds, fn };
    timers.add(t);
    return t;
  };

  root.classList.toggle('tired', tired);

  // Rough edges for the stamp, so it looks inked and not printed.
  root.append(
    svg(
      'svg',
      { class: 'rv-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' },
      svg(
        'filter',
        { id: 'rv-rough', x: '-10%', y: '-10%', width: '120%', height: '120%' },
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.85', numOctaves: 2, seed: 4, result: 'grain' }),
        svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'grain', scale: 2.4, result: 'rough' }),
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.32', numOctaves: 1, seed: 9, result: 'blotch' }),
        svg('feColorMatrix', { in: 'blotch', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.5', result: 'worn' }),
        svg('feComposite', { in: 'rough', in2: 'worn', operator: 'in' }),
      ),
    ),
  );

  const pips = el('div', { class: 'rv-pips', 'aria-hidden': 'true' }, diffs.map(() => el('i')));
  const prTitle = el('span', { class: 'rv-pr-title' });
  const prMeta = el('span', { class: 'rv-pr-meta' });
  const fileName = el('span', { class: 'rv-file-name' });
  const fileStat = el('span', { class: 'rv-file-stat' });
  const code = el('div', { class: 'rv-code', role: 'group', 'aria-label': 'The diff. Pick the line with the bug.' });
  const stamp = el('div', { class: 'rv-stamp', 'aria-hidden': 'true' });
  const panel = el(
    'div',
    { class: 'rv-pr' },
    el('header', { class: 'rv-pr-head' }, el('span', { class: 'rv-state' }, 'Open'), prTitle, prMeta, pips),
    el('div', { class: 'rv-file' }, el('span', { class: 'rv-file-icon', 'aria-hidden': 'true' }), fileName, fileStat),
    el('div', { class: 'rv-code-wrap' }, code, stamp),
  );
  const comment = el('div', { class: 'rv-comment', 'aria-live': 'polite' });
  const nextButton = el('button', { class: 'btn primary rv-next', type: 'button', hidden: true, onclick: () => next() }, 'Next diff');
  root.append(
    el(
      'div',
      { class: 'rv-top' },
      el('p', { class: 'rv-how' }, cfg.how || ''),
      tired ? el('span', { class: 'rv-chip' }, "Tired. It's a bit blurry and the clock's fast.") : null,
    ),
    panel,
    el('div', { class: 'rv-foot' }, comment, nextButton),
  );

  const turn = (list) => {
    copyTurn += 1;
    return list[copyTurn % list.length];
  };

  function paintPips() {
    [...pips.children].forEach((pip, i) => {
      const r = results[i];
      pip.className = r ? (r.found ? 'good' : 'bad') : i === index ? 'on' : '';
    });
  }

  function row(text, number, sign, extra) {
    return [el('span', { class: 'rv-num' }, String(number)), el('span', { class: 'rv-sign' }, sign), highlight(text), extra || null];
  }

  function showDiff(i) {
    index = i;
    const d = diffs[i];
    current = { id: d.id, kind: d.kind || '', file: d.file || '', found: false, timedOut: false, wrong: 0, secondsLeft: 0, points: 0 };
    left = perDiff;
    lastWholeSecond = Math.ceil(left);
    grace = 0.45 + d.lines.length * 0.03;
    root.classList.remove('shown');
    code.classList.remove('done');
    prTitle.textContent = d.title || 'Untitled change';
    prMeta.textContent = `${i + 1} of ${diffs.length}`;
    fileName.textContent = d.file || 'file.js';
    fileStat.textContent = `+${d.lines.length}`;
    rows = d.lines.map((text, j) =>
      el(
        'button',
        { class: 'rv-line', type: 'button', style: `--i:${j}`, dataset: { line: String(j) }, 'aria-label': `Line ${j + 1}. ${text.trim()}`, onclick: () => pick(j) },
        row(text, j + 1, '+'),
      ),
    );
    code.replaceChildren(el('div', { class: 'rv-hunk' }, `@@ -0,0 +1,${d.lines.length} @@`), ...rows);
    code.scrollLeft = 0;
    if (run.frame) run.frame.scrollTop = 0;
    stamp.className = 'rv-stamp';
    stamp.textContent = '';
    comment.replaceChildren(el('p', { class: 'rv-prompt' }, i === 0 ? "Which line's the bug?" : 'Next one. Same question.'));
    nextButton.hidden = true;
    paintPips();
    run.setTimer(1);
    phase = 'pick';
  }

  function verdict({ tone, head, body, aside, score }) {
    const last = index === diffs.length - 1;
    const found = results.filter((r) => r.found).length;
    const all = found === diffs.length;
    const bonus = Number(cfg.streak.allCorrectBonus) || 0;
    comment.replaceChildren(
      el(
        'div',
        { class: 'rv-verdict', dataset: { tone } },
        el(
          'p',
          { class: 'rv-verdict-head' },
          head,
          current.kind ? el('span', { class: 'rv-kind' }, current.kind) : null,
          score ? el('span', { class: 'rv-score' }, `+${score}`) : null,
        ),
        el('p', { class: 'rv-explain' }, body),
        aside ? el('p', { class: 'rv-aside' }, aside) : null,
        last
          ? el(
              'p',
              { class: 'rv-tally' },
              all && cfg.streak.text ? `${cfg.streak.text} ` : `${found} of ${diffs.length} found. `,
              all && bonus ? el('span', { class: 'rv-score' }, `+${bonus}`) : null,
            )
          : null,
      ),
    );
    nextButton.textContent = last ? 'Back to work' : 'Next diff';
    nextButton.hidden = false;
    if (last) run.setClosable?.(false);
    nextButton.focus({ preventScroll: true });
    nextButton.scrollIntoView?.({ block: 'nearest' });
  }

  // Shows where the bug was and what the line should have been.
  function reveal() {
    const d = diffs[index];
    const bug = rows[d.bugLine];
    for (const r of rows) r.disabled = true;
    code.classList.add('done');
    root.classList.add('shown');
    bug.classList.add('bug');
    bug.querySelector('.rv-sign').textContent = '-';
    if (d.fix) bug.after(el('div', { class: 'rv-line fix' }, row(d.fix, d.bugLine + 1, '+')));
    // The stamp lands on the half of the diff the bug isn't in.
    stamp.style.top = d.bugLine < d.lines.length / 2 ? '76%' : '25%';
    run.setTimer(left / perDiff);
  }

  function thud() {
    panel.classList.remove('thud');
    void panel.offsetWidth;
    panel.classList.add('thud');
  }

  function correct() {
    const d = diffs[index];
    phase = 'shown';
    const secs = Math.max(0, Math.floor(left));
    const base = Number(points.correct) || 0;
    const bonus = secs * (Number(points.secondsLeftBonus) || 0);
    const lost = current.wrong * Math.abs(Number(points.wrong) || 0);
    current.found = true;
    current.secondsLeft = secs;
    current.points = base + bonus - lost;
    results.push(current);
    paintPips();
    reveal();
    const head = turn(cfg.copy.correct);
    stamp.textContent = head.replace(/[.!]+$/, '');
    stamp.className = 'rv-stamp good show';
    thud();
    sfx('stamp');
    after(0.32, () => sfx('success'));
    const parts = [`${base} for the bug, ${bonus} for the ${secs} seconds left.`];
    if (lost) parts.push(`Minus ${lost} for the wrong ${current.wrong === 1 ? 'line' : 'lines'}.`);
    verdict({ tone: 'good', head, body: d.explanation || '', aside: parts.join(' '), score: base + bonus });
  }

  function wrong(j) {
    const line = rows[j];
    current.wrong += 1;
    left = Math.max(0, left - penalty);
    line.classList.add('miss');
    line.disabled = true;
    const flash = el('span', { class: 'rv-penalty', 'aria-hidden': 'true' }, `-${penalty}s`);
    line.append(flash);
    after(0.9, () => flash.remove());
    const bar = run.frame?.querySelector('.round-timer');
    if (bar) {
      bar.classList.remove('rv-hit');
      void bar.offsetWidth;
      bar.classList.add('rv-hit');
    }
    sfx('fail');
    comment.replaceChildren(
      el('p', { class: 'rv-prompt miss' }, turn(cfg.copy.wrong)),
      el('p', { class: 'rv-aside' }, `That cost ${penalty} seconds. Keep looking.`),
    );
  }

  function timeout() {
    const d = diffs[index];
    phase = 'shown';
    left = 0;
    current.timedOut = true;
    current.points = -current.wrong * Math.abs(Number(points.wrong) || 0) + (Number(points.timeout) || 0);
    results.push(current);
    paintPips();
    reveal();
    stamp.textContent = 'LGTM';
    stamp.className = 'rv-stamp limp show';
    sfx('fail');
    verdict({ tone: 'bad', head: cfg.copy.timeout || 'Out of time.', body: d.explanation || '' });
  }

  function pick(j) {
    if (phase !== 'pick' || held || over) return;
    if (j === diffs[index].bugLine) correct();
    else if (!rows[j].classList.contains('miss')) wrong(j);
  }

  function next() {
    if (phase !== 'shown' || held || over) return;
    if (index < diffs.length - 1) {
      sfx('ui_tap');
      showDiff(index + 1);
    } else end();
  }

  function end() {
    over = true;
    const total = diffs.length;
    const found = results.filter((r) => r.found).length;
    const all = found === total;
    let score = results.reduce((sum, r) => sum + r.points, 0);
    if (all) score += Number(cfg.streak.allCorrectBonus) || 0;
    const missed = total - found;
    let line = 'Found none of them. It all shipped.';
    if (all) line = cfg.streak.text || `Found all ${total}.`;
    else if (found) line = `Found ${found} of ${total}. ${missed === 1 ? 'The other one shipped.' : 'The rest shipped.'}`;
    const success = found >= Math.min(total, Math.max(1, Math.ceil(total * 0.6)));
    resolve({
      success,
      score: Math.max(0, score),
      detail: {
        found,
        total,
        wrong: results.reduce((sum, r) => sum + r.wrong, 0),
        timeouts: results.filter((r) => r.timedOut).length,
        diffs: results.map(({ id, kind, found: hit, wrong: misses, secondsLeft }) => ({ id, kind, found: hit, wrong: misses, secondsLeft })),
        counts: { reviewed: total },
        line,
        emote: success ? 'idea' : 'sweat',
      },
    });
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (held || phase !== 'pick') return;
      if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
      const open = rows.filter((r) => !r.disabled);
      if (!open.length) return;
      const at = open.indexOf(document.activeElement);
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const to = at < 0 ? (step > 0 ? 0 : open.length - 1) : (at + step + open.length) % open.length;
      open[to].focus();
      e.preventDefault();
    },
    { signal },
  );

  run.onFrame((dt) => {
    for (const t of [...timers]) {
      t.left -= dt;
      if (t.left > 0) continue;
      timers.delete(t);
      t.fn();
    }
    if (phase !== 'pick') return;
    if (grace > 0) {
      grace -= dt;
      return;
    }
    left -= dt;
    run.setTimer(left / perDiff);
    const whole = Math.ceil(left);
    if (whole !== lastWholeSecond) {
      lastWholeSecond = whole;
      if (whole <= 5 && whole > 0) sfx('beat_tick');
    }
    if (left <= 0) timeout();
  });

  showDiff(0);

  return {
    hold(on) {
      held = on;
    },
    destroy() {
      over = true;
      timers.clear();
    },
  };
}

let game = null;
let root = null;
let context = null;

export default {
  id: 'review',
  title: 'Code review',

  async mount(container, ctx) {
    context = ctx;
    root = el('div', { class: 'rv' });
    container.append(root);
    await loadCSS('./a/review.css', import.meta.url);
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
