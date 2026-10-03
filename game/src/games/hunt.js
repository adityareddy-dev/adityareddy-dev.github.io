// The hunt. A made-up shop's checkout hangs on one click. Feel it, attach the tool, name the component, fix it.
import { el, loadCSS } from '../core/dom.js';
import { clamp, num, pick, shuffle, fmtMs, sfx, after, armButton } from './b/kit.js';
import { FALLBACK, FIXES, QUICK, STEPS, HINTS } from './b/hunt-data.js';
import { createGraph } from './b/hunt-graph.js';
import { createShop } from './b/hunt-shop.js';

const TOOL = 'react-inp-blame';
const PHASES = ['input delay', 'processing', 'presentation'];
const PHASE_CLASS = { 'input delay': 'in', processing: 'proc', presentation: 'pres' };
const STEP_GAP = 0.55;
const READ_GAP = 0.75;
const TIRED = 'Low energy. The clock runs faster.';
const FOGGY = 'Low focus. The readout takes longer to sink in.';
const LUCKY = 'Right answer with nothing measured, which is luck. Attach the tool next time.';

function settings(config) {
  const c = config && typeof config === 'object' ? config : {};
  const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
  const suspects = list(c.suspects, FALLBACK.suspects).filter((s) => s && s.id);
  const culprit = suspects.some((s) => s.id === c.culprit) ? c.culprit : suspects.find((s) => !s.alibi)?.id || suspects.at(-1).id;
  const readout = { ...FALLBACK.readout, ...(c.readout || {}) };
  readout.lines = list(c.readout?.lines, FALLBACK.readout.lines);
  readout.numbers = { ...FALLBACK.readout.numbers, ...(c.readout?.numbers || {}) };
  const fixed = { ...FALLBACK.after, ...(c.after || {}) };
  fixed.lines = list(c.after?.lines, FALLBACK.after.lines);
  fixed.numbers = { ...FALLBACK.after.numbers, ...(c.after?.numbers || {}) };
  const fixes = list(c.fixes, FIXES).filter((f) => f && f.label);
  return {
    shop: { ...FALLBACK.shop, ...(c.shop || {}) },
    incident: { ...FALLBACK.incident, ...(c.incident || {}) },
    limit: Math.max(5, num(c.timeLimitSec, FALLBACK.timeLimitSec)),
    penalty: Math.max(0, num(c.wrongGuessPenaltySec, FALLBACK.wrongGuessPenaltySec)),
    clueDelay: Math.max(0, num(c.lowFocusClueDelayMs, FALLBACK.lowFocusClueDelayMs)) / 1000,
    points: { ...FALLBACK.points, ...(c.points || {}) },
    suspects,
    culprit,
    clues: list(c.clues, FALLBACK.clues),
    wrongGuess: list(c.wrongGuess, FALLBACK.wrongGuess),
    readout,
    fixed,
    fixes: fixes.some((f) => f.correct) ? fixes : FIXES,
    timeout: c.timeout || FALLBACK.timeout,
    solved: list(c.solved, FALLBACK.solved),
  };
}

// "input delay       38 ms" becomes { key, value }. An empty line is a gap.
function parseRow(line) {
  const text = String(line ?? '').trim();
  if (!text) return null;
  const m = /^(\S+(?: \S+)*?)\s{2,}(.*)$/.exec(text);
  return m ? { key: m[1], value: m[2].replace(/\s{2,}/g, '   ') } : { key: '', value: text };
}

// Colours the bits a developer's eye goes to: component names, the grade, the file and line.
function rich(text) {
  const out = [];
  const re = /(<[A-Z]\w*>)|\((poor|good|needs improvement)\)|([\w./-]+\.[jt]sx?:\d+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(el('span', { class: 'rb-comp' }, m[1]));
    else if (m[2]) out.push(el('span', { class: `rb-grade ${m[2] === 'good' ? 'good' : 'poor'}` }, m[2]));
    else out.push(el('span', { class: 'rb-file' }, m[3]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function rowNode(row) {
  const ms = /^([\d,.]+ ms)\s*(.*)$/.exec(row.value);
  const value = ms ? [el('span', { class: 'rb-num' }, ms[1]), ' ', ...rich(ms[2])] : rich(row.value);
  const node = el('div', { class: 'rb-row' }, el('span', { class: 'rb-k' }, row.key), el('span', { class: 'rb-v' }, value));
  if (PHASE_CLASS[row.key]) node.classList.add('rb-phase', PHASE_CLASS[row.key]);
  if (row.key === 'blame') node.classList.add('rb-blame');
  return node;
}

// share is how long this one took next to the slow one, so the fixed bar comes out short.
function phaseBar(numbers, share = 1) {
  const parts = [
    ['in', num(numbers.inputDelayMs, 0)],
    ['proc', num(numbers.processingMs, 0)],
    ['pres', num(numbers.presentationMs, 0)],
  ];
  const bar = el(
    'div',
    { class: 'rb-bar', 'aria-hidden': 'true' },
    parts.map(([name, ms]) => {
      const seg = el('i', { class: name });
      seg.style.flexGrow = String(Math.max(ms, 1));
      return seg;
    }),
  );
  if (share < 1) bar.style.maxWidth = `${Math.max(24, Math.round(440 * share))}px`;
  return bar;
}

// Splits the readout into what shows at once and what prints line by line, with each clue beside its line.
function plan(cfg) {
  const rows = cfg.readout.lines.map(parseRow);
  const used = new Set();
  const tail = (clue) => String(clue.id || '').replace(/^clue-/, '');
  const clueFor = (key) => cfg.clues.find((c) => !used.has(c) && (tail(c) === key || tail(c) === key.split(' ')[0]));
  const loose = (clue) => ({ rows: [{ key: tail(clue) === 'render' ? 'renders' : tail(clue) || 'clue', value: clue.text || '' }], clue });
  const head = [];
  const steps = [];
  let i = 0;
  while (i < rows.length && rows[i] && !PHASES.includes(rows[i].key)) head.push(rows[i++]);
  let group = null;
  for (; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) {
      group = null;
    } else if (PHASES.includes(row.key)) {
      const clue = clueFor(row.key);
      if (clue) used.add(clue);
      steps.push({ rows: [row], clue });
      group = null;
    } else if (row.key === 'blame') {
      for (const clue of cfg.clues) {
        if (used.has(clue)) continue;
        used.add(clue);
        steps.push(loose(clue));
      }
      group = { rows: [row], blame: true };
      steps.push(group);
    } else if (group) {
      group.rows.push(row);
    } else {
      group = { rows: [row] };
      steps.push(group);
    }
  }
  for (const clue of cfg.clues) if (!used.has(clue)) steps.push(loose(clue));
  if (!steps.some((s) => s.blame)) steps.push({ rows: [{ key: 'blame', value: `<${cfg.culprit}>` }], blame: true });
  return { head, steps };
}

function play(container, ctx, run) {
  const cfg = settings({ ...(run.config || {}), ...(run.opts?.config || {}) });
  const N = cfg.readout.numbers;
  const A = cfg.fixed.numbers;
  const project = (ctx.data?.content?.projects || []).find((p) => p?.name === TOOL);
  const toolUrl = project?.demo || project?.url || null;
  const culprit = cfg.suspects.find((s) => s.id === cfg.culprit);
  const culpritLabel = culprit.label || `<${culprit.id}>`;
  const drain = run.lowEnergy ? 1.2 : 1;

  let resolve;
  const result = new Promise((done) => (resolve = done));

  let phase = 'hunting';
  let left = cfg.limit;
  let attached = false;
  let felt = false;
  let fullShown = false;
  let blameShown = false;
  let afterShown = false;
  let wrong = 0;
  let wrongFix = 0;
  let early = false;
  let rage = 0;
  let slowClicks = 0;
  let freeze = null;
  let ended = false;
  const pending = [];
  const reveals = [];
  const cleared = new Set();

  // ---- the pretend browser and its drawer ----
  const shop = createShop({ shop: cfg.shop, onAct, signal: run.signal });
  const graphCanvas = el('canvas', { class: 'hd-graph', 'aria-hidden': 'true' });
  const graph = createGraph(graphCanvas);
  const thread = el('b', {}, 'idle');
  const attachBtn = el('button', { class: 'hd-attach', type: 'button', onclick: () => attach() }, `Attach ${TOOL}`);
  const toolLink = toolUrl ? el('a', { class: 'hd-link', href: toolUrl, target: '_blank', rel: 'noopener' }, 'what is it ↗') : null;
  const log = el('div', { class: 'hd-log', role: 'log', tabindex: '0', 'aria-label': 'Tool output' });
  const empty = el('p', { class: 'hd-empty' }, 'Nothing attached. The graph knows when a frame ran long. It has no idea who did it.');
  log.append(empty);
  const drawer = el(
    'div',
    { class: 'hd' },
    el('div', { class: 'hd-bar' }, el('span', { class: 'hd-title' }, 'Frame time'), el('span', { class: 'hd-thread' }, 'main thread ', thread), el('span', { class: 'hd-gap' }), toolLink, attachBtn),
    graphCanvas,
    log,
  );
  shop.root.append(drawer);

  // ---- the side: steps, the page, suspects, the fix ----
  const stepNodes = STEPS.map((text, i) => el('li', {}, el('i', {}, String(i + 1)), el('span', {}, text)));
  const hint = el('p', { class: 'hunt-hint', role: 'status' });
  const notes = [run.lowEnergy ? TIRED : '', run.lowFocus ? FOGGY : ''].filter(Boolean);
  const tired = notes.length ? el('p', { class: 'hunt-tired' }, notes.join(' ')) : null;
  const incident = el(
    'div',
    { class: 'hunt-card hunt-incident' },
    el('span', { class: 'hunt-tag' }, 'Page'),
    el('b', {}, `${cfg.incident.title} · ${cfg.shop.name}`),
    el('p', {}, cfg.incident.summary),
  );

  const rows = new Map();
  const list = el(
    'ul',
    { class: 'hunt-list' },
    cfg.suspects.map((s) => {
      const blame = el('button', { class: 'btn hs-blame', type: 'button', 'aria-label': `Blame ${s.id}`, onclick: () => accuse(s.id) }, 'Blame');
      const alibi = el('span', { class: 'hs-alibi' });
      const row = el('li', { class: 'hs', dataset: { id: s.id } }, el('span', { class: 'hs-text' }, el('code', {}, s.label || `<${s.id}>`), el('span', { class: 'hs-desc' }, s.desc || ''), alibi), blame);
      const lit = (on) => () => shop.light(s.id, on);
      row.addEventListener('pointerenter', lit(true));
      row.addEventListener('pointerleave', lit(false));
      blame.addEventListener('focus', lit(true));
      blame.addEventListener('blur', lit(false));
      rows.set(s.id, { row, blame, alibi, suspect: s });
      return row;
    }),
  );
  const cost = cfg.penalty ? el('small', {}, `A wrong guess costs ${cfg.penalty} seconds.`) : null;
  const suspects = el('div', { class: 'hunt-card hunt-suspects' }, el('div', { class: 'hunt-cardhead' }, el('h3', {}, 'Suspects'), cost), list);

  const verdict = el('div', { class: 'hunt-card hunt-verdict', hidden: true }, el('span', { class: 'hunt-tag bad' }, 'Culprit'), el('code', {}, culpritLabel), el('p', {}, cfg.readout.verdict));
  const fixList = el('div', { class: 'hunt-fixes' });
  const fixCard = el('div', { class: 'hunt-card hunt-fix', hidden: true }, el('h3', {}, 'The fix'), fixList);
  const options = shuffle(cfg.fixes).map((fix) => {
    const reply = el('small', { class: 'hf-reply' });
    const button = el('button', { class: 'hf-opt', type: 'button', dataset: { fix: fix.id || '' }, onclick: () => choose(option) }, el('span', {}, rich(fix.label)), reply);
    const option = { fix, button, reply };
    fixList.append(button);
    return option;
  });
  const final = el('div', { class: 'hunt-final', hidden: true });
  const side = el('aside', { class: 'hunt-side' }, el('ol', { class: 'hunt-steps' }, stepNodes), hint, tired, incident, suspects, verdict, fixCard, final);
  const root = el('div', { class: 'hunt', dataset: { phase } }, el('div', { class: 'hunt-main' }, shop.root), side);
  container.append(root);

  const say = (text, tone = '') => {
    hint.textContent = text;
    hint.dataset.tone = tone;
    if (tone) {
      hint.classList.remove('flash');
      void hint.offsetWidth;
      hint.classList.add('flash');
    }
  };

  // Lights the steps and picks the hint from where things stand.
  function sync() {
    root.dataset.phase = phase;
    const done = [felt, attached, ['named', 'fixed', 'verified'].includes(phase), phase === 'verified'];
    const now = done.indexOf(false);
    stepNodes.forEach((node, i) => {
      node.classList.toggle('done', done[i]);
      node.classList.toggle('now', i === now && phase !== 'timeout');
    });
    if (phase === 'verified') say(HINTS.verified);
    else if (phase === 'fixed') say(HINTS.fixed);
    else if (phase === 'named') say(HINTS.named);
    else if (phase === 'timeout') say(HINTS.timeout);
    else if (blameShown) say(HINTS.ready);
    else if (fullShown) say(HINTS.reading);
    else if (attached) say(felt ? HINTS.attachedWarm : HINTS.attachedCold);
    else say(felt ? HINTS.felt : HINTS.start);
  }

  // Scrolls a node into the middle of the frame, only when it's out of sight. Phones mostly.
  function reveal(node) {
    const box = node.getBoundingClientRect();
    const frame = run.frame?.getBoundingClientRect?.();
    const top = Math.max(0, frame?.top ?? 0) + 64;
    const bottom = Math.min(window.innerHeight, frame?.bottom ?? window.innerHeight) - 12;
    if (box.top < top || box.bottom > bottom) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function print(node) {
    empty.remove();
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  const quickLine = (target, ms, grade, tail) =>
    el('div', { class: 'rb-line' }, el('span', { class: 'rb-what' }, `click on ${target}`), el('span', { class: 'rb-ms' }, fmtMs(ms)), el('span', { class: `rb-grade ${grade}` }, grade), tail ? el('span', { class: 'rb-dim' }, rich(tail)) : null);

  function attach(silent) {
    if (attached || ended) return;
    attached = true;
    const chip = el(toolUrl ? 'a' : 'span', { class: 'hd-chip', ...(toolUrl ? { href: toolUrl, target: '_blank', rel: 'noopener', title: 'Opens the real thing in a new tab' } : {}) }, el('i'), TOOL, toolUrl ? ' ↗' : '');
    attachBtn.replaceWith(chip);
    toolLink?.remove();
    drawer.classList.add('attached');
    print(el('div', { class: 'rb-sys' }, `${TOOL} attached. Watching every click on this page.`));
    if (!silent) {
      sfx(ctx, 'stamp');
      sync();
    }
  }

  function clear(id, how) {
    const entry = rows.get(id);
    if (!entry || cleared.has(id) || id === cfg.culprit) return;
    cleared.add(id);
    entry.row.classList.add('cleared', how);
    entry.alibi.textContent = entry.suspect.alibi || '';
    entry.blame.disabled = true;
    entry.blame.textContent = how === 'wrong' ? 'Wrong' : 'Cleared';
  }

  // Builds the full readout once. Each step is kept so a timeout can print the rest in one go.
  function fullReadout() {
    fullShown = true;
    const { head, steps } = plan(cfg);
    let wait = STEP_GAP;
    const block = el(
      'div',
      { class: 'rb-block' },
      el('div', { class: 'rb-head' }, el('span', { class: 'rb-name' }, TOOL), el('span', { class: 'rb-title' }, cfg.readout.header), el('span', { class: 'rb-grade poor' }, 'poor')),
      head.map(rowNode),
      phaseBar(N),
    );
    print(block);
    for (const step of steps) {
      const show = () => {
        for (const row of step.rows) block.append(rowNode(row));
        for (const id of step.clue?.clears || []) clear(id, 'tool');
        if (step.blame) {
          blameShown = true;
          shop.mark(cfg.culprit, 'blamed');
          rows.get(cfg.culprit)?.row.classList.add('pointed');
        }
        log.scrollTop = log.scrollHeight;
        if (ended || phase !== 'hunting') return;
        if (step.blame) sync();
        else if (step.clue?.meaning) say(step.clue.meaning, 'clue');
      };
      const reveal = { done: false, run: () => !reveal.done && ((reveal.done = true), show()) };
      reveals.push(reveal);
      pending.push({ delay: wait + (step.clue && run.lowFocus ? cfg.clueDelay : 0), fn: reveal.run });
      wait = STEP_GAP + (step.clue?.meaning ? READ_GAP : 0);
    }
  }

  function slowDone() {
    const hung = freeze;
    freeze = null;
    shop.setFrozen(false);
    graph.release(N.totalMs);
    thread.textContent = 'idle';
    drawer.classList.remove('blocked');
    slowClicks += 1;
    felt = true;
    const extra = hung.rage ? `You clicked ${hung.rage} more ${hung.rage === 1 ? 'time' : 'times'} while it hung. So do the customers.` : 'Thanks for waiting.';
    shop.placed({ text: 'Order placed.', sub: extra, count: 150 });
    if (!attached) {
      print(el('div', { class: 'rb-sys warn' }, `Long frame, ${fmtMs(N.totalMs)}. No idea whose.`));
    } else if (!fullShown) {
      fullReadout();
      reveal(log);
    } else {
      print(quickLine('button.place-order', N.totalMs, 'poor', blameShown ? culpritLabel : 'same as above'));
    }
    if (phase === 'hunting') sync();
  }

  function placeOrder() {
    if (freeze) return;
    sfx(ctx, 'ui_tap');
    if (phase === 'fixed' || phase === 'verified') {
      graph.bump(A.totalMs);
      shop.placed({ text: 'Order placed.', sub: 'That was quick.', count: 22 });
      if (!attached) attach(true);
      if (!afterShown) {
        afterShown = true;
        print(
          el(
            'div',
            { class: 'rb-block rb-fixed' },
            el('div', { class: 'rb-head' }, el('span', { class: 'rb-name' }, TOOL), el('span', { class: 'rb-title' }, cfg.fixed.label), el('span', { class: 'rb-grade good' }, 'good')),
            cfg.fixed.lines.map(parseRow).filter(Boolean).slice(0, 2).map(rowNode),
            phaseBar(A, num(A.totalMs, 96) / Math.max(1, num(N.totalMs, 1284))),
            cfg.fixed.lines.map(parseRow).filter(Boolean).slice(2).map(rowNode),
          ),
        );
      } else {
        print(quickLine('button.place-order', A.totalMs, 'good', 'nothing to blame'));
      }
      if (phase === 'fixed') verified();
      return;
    }
    freeze = { t: 0, total: num(N.totalMs, 1284) / 1000, rage: 0 };
    shop.setFrozen(true);
    graph.hold();
    thread.textContent = 'blocked';
    drawer.classList.add('blocked');
  }

  function onAct(e) {
    if (ended) return;
    if (e.rage) {
      rage += 1;
      if (freeze) freeze.rage += 1;
      return;
    }
    if (e.order) {
      placeOrder();
      return;
    }
    const ms = Math.round(num(QUICK[e.target], 16) + Math.random() * 6 - 3);
    graph.bump(ms);
    sfx(ctx, 'ui_tap');
    if (attached) print(quickLine(e.target, ms, 'good', 'nothing to blame'));
  }

  function accuse(id) {
    if (ended || phase !== 'hunting') return;
    if (id !== cfg.culprit) {
      wrong += 1;
      left -= cfg.penalty;
      clear(id, 'wrong');
      shop.light(id, false);
      sfx(ctx, 'fail');
      side.classList.remove('shake');
      void side.offsetWidth;
      side.classList.add('shake');
      say(`${cfg.wrongGuess[(wrong - 1) % cfg.wrongGuess.length]} That cost ${cfg.penalty} seconds.`, 'bad');
      return;
    }
    phase = 'named';
    early = !blameShown;
    sfx(ctx, 'success');
    shop.mark(cfg.culprit, 'blamed');
    shop.light(cfg.culprit, false);
    incident.hidden = true;
    suspects.hidden = true;
    verdict.hidden = false;
    fixCard.hidden = false;
    sync();
    options[0]?.button.focus({ preventScroll: true });
  }

  function choose(option) {
    if (ended || phase !== 'named' || option.button.disabled) return;
    option.reply.textContent = option.fix.reply || '';
    if (!option.fix.correct) {
      wrongFix += 1;
      option.button.classList.add('wrong');
      option.button.disabled = true;
      sfx(ctx, 'fail');
      return;
    }
    phase = 'fixed';
    option.button.classList.add('right');
    for (const other of options) other.button.disabled = true;
    option.reply.textContent = option.fix.reply || cfg.readout.fixHint || '';
    shop.mark(cfg.culprit, 'fixed');
    shop.nudge(true);
    sfx(ctx, 'stamp');
    sync();
    shop.orderButton.focus({ preventScroll: true });
    reveal(shop.orderButton);
  }

  function score(success) {
    const P = cfg.points;
    const spare = Math.max(0, Math.floor(left));
    const base = success ? num(P.solve, 300) + spare * num(P.secondsLeftBonus, 3) : num(P.timeout, 60);
    const fines = (wrong + (success ? wrongFix : 0)) * num(P.wrongGuess, -40);
    const call = success && early ? num(P.earlyCall, 0) : 0;
    return { points: Math.max(0, Math.round(base + fines + call)), spare, call };
  }

  function wrap(success, line, extra) {
    const { points, spare, call } = score(success);
    run.setTimer(null);
    const go = el('button', { class: 'btn primary hunt-done', type: 'button' }, success ? 'Go ship it' : 'Fine');
    const times = Math.round(num(N.totalMs, 1284) / Math.max(1, num(A.totalMs, 96)));
    const share = clamp(num(A.totalMs, 96) / Math.max(1, num(N.totalMs, 1284)), 0.02, 1);
    final.replaceChildren(
      el(
        'div',
        { class: 'gb-result' },
        el('h3', {}, line),
        success
          ? el(
              'div',
              { class: 'ha' },
              el('div', { class: 'ha-row before' }, el('span', {}, 'Before'), el('div', { class: 'ha-track' }, el('i', { style: { width: '100%' } })), el('b', {}, fmtMs(N.totalMs))),
              el('div', { class: 'ha-row after' }, el('span', {}, 'After'), el('div', { class: 'ha-track' }, el('i', { style: { width: `${share * 100}%` } })), el('b', {}, fmtMs(A.totalMs))),
              el('p', {}, `About ${times} times quicker. Same button.`),
            )
          : null,
        extra ? el('p', {}, extra) : null,
        toolUrl ? el('p', { class: 'hunt-real' }, el('a', { href: toolUrl, target: '_blank', rel: 'noopener' }, TOOL), " is real. The shop isn't.") : null,
        el(
          'div',
          { class: 'gb-chips' },
          el('span', { class: 'gb-chip' }, `${points} points`),
          success ? el('span', { class: 'gb-chip good' }, `${spare} s to spare`) : null,
          call ? el('span', { class: 'gb-chip good' }, `Named it before the tool did, +${call}`) : null,
          wrong ? el('span', { class: 'gb-chip bad' }, `${wrong} wrong ${wrong === 1 ? 'guess' : 'guesses'}`) : null,
          success && wrongFix ? el('span', { class: 'gb-chip bad' }, `${wrongFix} wrong ${wrongFix === 1 ? 'fix' : 'fixes'}`) : null,
        ),
        el('div', { class: 'round-actions' }, go),
      ),
    );
    final.hidden = false;
    armButton(go, run, () => {
      ended = true;
      sfx(ctx, 'ui_tap');
      resolve({
        success,
        score: points,
        detail: {
          line,
          emote: success ? 'idea' : 'scribble',
          culprit: cfg.culprit,
          solved: success,
          secondsLeft: spare,
          wrongGuesses: wrong,
          wrongFixes: wrongFix,
          attached,
          slowClicks,
          rageClicks: rage,
          beforeMs: num(N.totalMs, 1284),
          afterMs: success ? num(A.totalMs, 96) : null,
        },
      });
    });
  }

  function verified() {
    phase = 'verified';
    shop.nudge(false);
    fixCard.hidden = true;
    sfx(ctx, 'level_up');
    sync();
    wrap(true, pick(cfg.solved, FALLBACK.solved[0]), slowClicks && fullShown ? '' : LUCKY);
  }

  function timeout() {
    phase = 'timeout';
    left = 0;
    run.setTimer(0);
    pending.length = 0;
    if (freeze) {
      freeze = null;
      shop.setFrozen(false);
      graph.release(N.totalMs);
      thread.textContent = 'idle';
      drawer.classList.remove('blocked');
    }
    if (!attached) attach(true);
    if (!fullShown) fullReadout();
    pending.length = 0;
    for (const reveal of reveals) reveal.run();
    for (const entry of rows.values()) entry.blame.disabled = true;
    incident.hidden = true;
    suspects.hidden = true;
    verdict.hidden = false;
    sfx(ctx, 'fail');
    sync();
    wrap(false, cfg.timeout, '');
  }

  run.onFrame((dt) => {
    if (ended) return;
    shop.update(dt);
    if (freeze) {
      freeze.t += dt;
      graph.grow(Math.min(freeze.t, freeze.total) * 1000);
      if (freeze.t >= freeze.total) slowDone();
    }
    graph.update(dt);
    if (pending.length) {
      pending[0].delay -= dt;
      if (pending[0].delay <= 0) pending.shift().fn();
    }
    if (phase === 'hunting') {
      left -= dt * drain;
      run.setTimer(left / cfg.limit);
      if (left <= 0) timeout();
    }
  });

  run.setTimer(1);
  sync();
  // Keyboard players start on the button, once any key that opened the round is let go.
  after(run, 0.6, () => {
    if (!ended && !freeze && !root.contains(document.activeElement)) shop.orderButton.focus({ preventScroll: true });
  });

  return {
    result,
    peek: () => ({
      phase,
      left,
      attached,
      felt,
      fullShown,
      blameShown,
      frozen: !!freeze,
      wrong,
      wrongFix,
      rage,
      slowClicks,
      culprit: cfg.culprit,
      cleared: [...cleared],
      fixes: options.map((o) => ({ id: o.fix.id, correct: !!o.fix.correct })),
    }),
  };
}

let mounted = null;
let game = null;

export default {
  id: 'hunt',
  title: 'The hunt',

  async mount(container, ctx) {
    await Promise.all([loadCSS('./b/common.css', import.meta.url), loadCSS('./b/hunt.css', import.meta.url)]);
    mounted = { container, ctx };
  },

  start(run) {
    game = play(mounted.container, mounted.ctx, run);
    return game.result;
  },

  stop() {
    game = null;
    mounted = null;
  },

  // What the round is doing right now. Tests read it.
  peek() {
    return game?.peek() || null;
  },
};
