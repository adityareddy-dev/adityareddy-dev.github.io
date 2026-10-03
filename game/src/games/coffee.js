// Coffee. Hold to build pressure, let go in the green. Three pulls refill energy.
import { el, loadCSS } from '../core/dom.js';
import { clamp, num, pick, sfx, after, armButton } from './b/kit.js';

const KINDS = ['perfect', 'good', 'over', 'under'];

const DEFAULTS = {
  pours: 3,
  timeLimitSec: 30,
  barSpeed: [1, 1.35, 1.7],
  sweetZone: [0.22, 0.16, 0.11],
  perfectZone: 0.04,
  lowEnergySpeedMult: 1.2,
  results: {
    perfect: { points: 35, energy: 15, text: "That's the one. Right on the line." },
    good: { points: 20, energy: 10, text: "Drinkable. I've had worse from better machines." },
    over: { points: 5, energy: 4, text: "It's on the counter now. The counter doesn't need caffeine." },
    under: { points: 5, energy: 4, text: 'Half a cup. An espresso, if anyone asks.' },
  },
  streak: { allPerfectBonus: 40, text: "Three for three. Barista's on shift." },
  done: ["Coffee's in. I'm a person again."],
  counts: { coffees: 1 },
};

const LABELS = { perfect: 'Perfect', good: 'Good', over: 'Too much', under: 'Too little' };
const HOW = 'Hold to build pressure, then let go while the needle is in the green.';
const TAP = "A tap won't do it. Hold it down.";
const COLD = 'Took too long. The machine went back to sleep.';
const SPILLED = 'More on the counter than in the cup. It still counts as coffee.';
const TIRED = 'Low energy. The needle climbs faster.';

// How fast pressure builds, and where the safety valve gives up.
const RATE = 1.1;
const BURST = 0.955;
const MIN_HOLD = 0.12;
const SHOW_FOR = 1.3;

// The cup. Inner floor and brim in drawing units, and how far up the line sits.
const CUP = { floor: 243, brim: 201, line: 0.74 };

const GAUGE = { cx: 110, cy: 108 };
const sweep = (v) => -120 + 240 * clamp(v, 0, 1);

function polar(v, r) {
  const a = (sweep(v) * Math.PI) / 180;
  return [GAUGE.cx + r * Math.sin(a), GAUGE.cy - r * Math.cos(a)];
}

function arc(from, to, r) {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  const large = (to - from) * 240 > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function ticks() {
  let d = '';
  for (let i = 0; i <= 24; i += 1) {
    const major = i % 2 === 0;
    const [x1, y1] = polar(i / 24, major ? 63 : 67);
    const [x2, y2] = polar(i / 24, 72);
    d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d;
}

const MACHINE = `
<svg class="cf-art" viewBox="22 14 276 270" aria-hidden="true">
  <defs>
    <linearGradient id="cf-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f2eb"/><stop offset="1" stop-color="#c8c1b6"/></linearGradient>
    <linearGradient id="cf-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#45404d"/><stop offset="1" stop-color="#2a2731"/></linearGradient>
    <linearGradient id="cf-brew" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f4024"/><stop offset="1" stop-color="#2c170c"/></linearGradient>
    <clipPath id="cf-inside"><path d="M130 201 L190 201 L185 238 Q184.5 243 180 243 L140 243 Q135.5 243 135 238 Z"/></clipPath>
  </defs>
  <rect x="26" y="258" width="268" height="22" rx="5" fill="#4b3a31"/>
  <rect x="26" y="258" width="268" height="4" rx="2" fill="#70584a"/>
  <g class="cf-rig">
    <rect x="58" y="22" width="204" height="6" rx="3" fill="#8d8a86"/>
    <rect x="70" y="24" width="4" height="12" fill="#8d8a86"/>
    <rect x="246" y="24" width="4" height="12" fill="#8d8a86"/>
    <rect x="64" y="100" width="192" height="150" rx="8" fill="url(#cf-body)"/>
    <rect x="44" y="34" width="232" height="80" rx="16" fill="url(#cf-steel)"/>
    <path d="M44 98 H276 V102 Q276 114 264 114 H56 Q44 114 44 102 Z" fill="#b3aca1"/>
    <circle class="cf-led" cx="74" cy="64" r="6"/>
    <circle cx="74" cy="64" r="9" fill="none" stroke="#a9a297" stroke-width="1.5"/>
    <rect x="104" y="52" width="112" height="24" rx="12" fill="#2b2a2f"/>
    <rect class="cf-bar" x="110" y="58" width="0" height="12" rx="6" fill="#ffb463"/>
    <g fill="#a9a297"><rect x="232" y="54" width="26" height="3" rx="1.5"/><rect x="232" y="62" width="26" height="3" rx="1.5"/><rect x="232" y="70" width="26" height="3" rx="1.5"/><rect x="232" y="78" width="26" height="3" rx="1.5"/></g>
    <path d="M86 114 V168 Q86 178 78 186" fill="none" stroke="#b3aca1" stroke-width="4" stroke-linecap="round"/>
    <rect x="128" y="114" width="64" height="16" rx="3" fill="#8d8a86"/>
    <rect x="122" y="130" width="76" height="14" rx="5" fill="#2b2a2f"/>
    <rect x="194" y="132" width="64" height="10" rx="5" fill="#1d1d1f"/>
    <path d="M151 144 h18 l-3 9 h-12 z" fill="#2b2a2f"/>
  </g>
  <rect x="80" y="246" width="160" height="12" rx="3" fill="#8d8a86"/>
  <g stroke="#6f6c69" stroke-width="1.5"><path d="M96 250v5M112 250v5M128 250v5M144 250v5M160 250v5M176 250v5M192 250v5M208 250v5M224 250v5"/></g>
  <g class="cf-steam">
    <path d="M146 190 q-7 -11 0 -22 q7 -11 0 -22"/>
    <path d="M160 186 q-7 -11 0 -22 q7 -11 0 -22"/>
    <path d="M174 190 q-7 -11 0 -22 q7 -11 0 -22"/>
  </g>
  <rect class="cf-stream" x="158.6" y="152" width="2.8" height="0" rx="1.4" fill="#4f2c18"/>
  <g class="cf-cup">
    <ellipse class="cf-puddle" cx="160" cy="247" rx="46" ry="3.2" fill="#4f2c18"/>
    <g clip-path="url(#cf-inside)">
      <rect class="cf-band" x="127" y="0" width="66" height="0" fill="rgba(63,179,127,0.34)"/>
      <rect class="cf-fill" x="127" y="243" width="66" height="0" fill="url(#cf-brew)"/>
      <rect class="cf-crema" x="127" y="243" width="66" height="0" fill="#d7a063"/>
    </g>
    <path class="cf-mark" d="M131 0 H189" stroke="#eafff4" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="M127 198 L193 198 L187.5 240 Q187 246 181 246 L139 246 Q133 246 132.5 240 Z" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.62)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M134 204 L137.5 234" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round"/>
    <path class="cf-drip" d="M193.5 200 q3.5 16 -1.5 34" fill="none" stroke="#4f2c18" stroke-width="2.6" stroke-linecap="round"/>
    <path class="cf-drip" d="M126.5 200 q-3 14 1.5 28" fill="none" stroke="#4f2c18" stroke-width="2.6" stroke-linecap="round"/>
  </g>
</svg>`;

const DIAL = `
<svg class="cf-dial" viewBox="0 0 220 200" role="img" aria-label="Pressure gauge">
  <defs>
    <linearGradient id="cf-bezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a6672"/><stop offset="1" stop-color="#2b2931"/></linearGradient>
  </defs>
  <circle cx="110" cy="108" r="88" fill="url(#cf-bezel)"/>
  <circle cx="110" cy="108" r="79" fill="#fbf7f0"/>
  <path d="${ticks()}" stroke="#3a3840" stroke-width="1.6" stroke-linecap="round"/>
  <path d="${arc(BURST, 1, 58)}" fill="none" stroke="#e5484d" stroke-width="6"/>
  <path class="cf-zone" d="" fill="none" stroke="#3fb37f" stroke-width="14"/>
  <path class="cf-sweet" d="" fill="none" stroke="#14784a" stroke-width="14"/>
  <text x="71" y="138" class="cf-num">0</text>
  <text x="149" y="138" class="cf-num">12</text>
  <text x="110" y="158" class="cf-unit">bar</text>
  <g class="cf-needle">
    <path d="M110 34 L106.2 112 Q110 118 113.8 112 Z" fill="#1d1d1f"/>
  </g>
  <circle cx="110" cy="108" r="9" fill="#1d1d1f"/>
  <circle cx="110" cy="108" r="3.5" fill="#8d8a86"/>
</svg>`;

function settings(config) {
  const c = config && typeof config === 'object' ? config : {};
  const list = (value, fallback) => (Array.isArray(value) && value.length ? value.map((v, i) => num(v, fallback[i] ?? fallback.at(-1))) : fallback);
  const results = {};
  for (const kind of KINDS) results[kind] = { ...DEFAULTS.results[kind], ...(c.results?.[kind] || {}) };
  return {
    pours: clamp(Math.round(num(c.pours, DEFAULTS.pours)), 1, 5),
    limit: Math.max(3, num(c.timeLimitSec, DEFAULTS.timeLimitSec)),
    speeds: list(c.barSpeed, DEFAULTS.barSpeed),
    zones: list(c.sweetZone, DEFAULTS.sweetZone),
    perfect: clamp(num(c.perfectZone, DEFAULTS.perfectZone), 0.01, 0.2),
    lowMult: num(c.lowEnergySpeedMult, DEFAULTS.lowEnergySpeedMult),
    results,
    streak: { ...DEFAULTS.streak, ...(c.streak || {}) },
    done: Array.isArray(c.done) && c.done.length ? c.done : DEFAULTS.done,
    counts: c.counts && typeof c.counts === 'object' ? c.counts : DEFAULTS.counts,
  };
}

function build(container, ctx) {
  const status = el('p', { class: 'cf-status', role: 'status' });
  const pop = el('div', { class: 'cf-pop', 'aria-hidden': 'true' });
  const machine = el('div', { class: 'cf-machine' });
  machine.innerHTML = MACHINE;
  machine.append(pop);
  const dialWrap = el('div', { class: 'cf-gauge' });
  dialWrap.innerHTML = DIAL;
  const shots = el('ol', { class: 'cf-shots', 'aria-label': 'Pulls' });
  const tired = el('p', { class: 'cf-tired', hidden: true }, TIRED);
  const pull = el('button', { class: 'cf-pull', type: 'button' }, el('span', {}, 'Hold to pull'));
  const side = el('div', { class: 'cf-side' }, dialWrap, shots, tired, pull);
  const stage = el('div', { class: 'cf-stage' }, machine, side);
  const how = el('p', { class: 'gb-how' }, HOW, el('span', { class: 'gb-keys' }, ' ', el('span', { class: 'kbd' }, 'Space'), ' works too.'));
  const root = el('div', { class: 'cf' }, how, stage, status);
  container.append(root);

  const $ = (selector) => root.querySelector(selector);
  const parts = {
    needle: $('.cf-needle'),
    zone: $('.cf-zone'),
    sweet: $('.cf-sweet'),
    fill: $('.cf-fill'),
    crema: $('.cf-crema'),
    band: $('.cf-band'),
    mark: $('.cf-mark'),
    stream: $('.cf-stream'),
    bar: $('.cf-bar'),
    cup: $('.cf-cup'),
  };

  let live = null;

  function start(run) {
    const cfg = settings({ ...(run.config || {}), ...(run.opts?.config || {}) });
    const speedMult = run.lowEnergy ? cfg.lowMult : 1;
    tired.hidden = !run.lowEnergy;
    const slots = [];
    for (let i = 0; i < cfg.pours; i += 1) {
      const slot = el('li', { dataset: { state: 'todo' } }, el('i', { class: 'cf-mini' }), el('span', {}, `Pull ${i + 1}`));
      slots.push(slot);
      shots.append(slot);
    }

    return new Promise((resolve) => {
      const pulls = [];
      let index = 0;
      let phase = 'ready';
      let source = null;
      let held = 0;
      let p = 0;
      let shown = 0;
      let needle = 0;
      let left = cfg.limit;
      let zone = { center: 0.68, width: 0.2 };
      let finished = false;

      const rate = () => RATE * cfg.speeds[Math.min(index, cfg.speeds.length - 1)] * speedMult;
      const levelFor = (value) => clamp((value / zone.center) * CUP.line, 0, 1.06);
      const yFor = (lvl) => CUP.floor - lvl * (CUP.floor - CUP.brim);

      function say(text) {
        status.textContent = text;
      }

      function setZone() {
        const width = clamp(cfg.zones[Math.min(index, cfg.zones.length - 1)], 0.05, 0.4);
        const center = 0.58 + Math.random() * 0.18;
        zone = { center, width };
        const half = width / 2;
        parts.zone.setAttribute('d', arc(center - half, center + half, 56));
        parts.sweet.setAttribute('d', arc(center - cfg.perfect / 2, center + cfg.perfect / 2, 56));
        const top = yFor(levelFor(center + half));
        const bottom = yFor(levelFor(center - half));
        parts.band.setAttribute('y', top.toFixed(2));
        parts.band.setAttribute('height', (bottom - top).toFixed(2));
        const y = yFor(CUP.line).toFixed(2);
        parts.mark.setAttribute('d', `M131 ${y} H189`);
      }

      function begin() {
        phase = 'ready';
        p = 0;
        held = 0;
        source = null;
        setZone();
        stage.dataset.result = '';
        stage.classList.remove('is-pulling', 'in-zone');
        parts.cup.classList.remove('swap');
        void parts.cup.getBoundingClientRect();
        parts.cup.classList.add('swap');
        slots.forEach((slot, i) => {
          if (i === index) slot.dataset.state = 'now';
        });
        pull.firstChild.textContent = 'Hold to pull';
        if (index === 0) say("First pull. Take your time. The needle won't.");
        else if (index === cfg.pours - 1) say('Last pull. It builds faster and the green is thinner.');
        else say(`Pull ${index + 1}. This one builds faster.`);
      }

      function press(from) {
        if (finished || phase !== 'ready' || run.paused) return;
        phase = 'holding';
        source = from;
        held = 0;
        p = 0;
        stage.classList.add('is-pulling');
        pull.firstChild.textContent = 'Let go in the green';
        sfx(ctx, 'coffee_pour');
      }

      function cancel() {
        if (phase !== 'holding') return;
        phase = 'ready';
        p = 0;
        source = null;
        stage.classList.remove('is-pulling', 'in-zone');
        pull.firstChild.textContent = 'Hold to pull';
      }

      function release(from) {
        if (phase !== 'holding' || (from && source && from !== source)) return;
        if (held < MIN_HOLD) {
          cancel();
          say(TAP);
          return;
        }
        judge();
      }

      function judge(forced) {
        const half = zone.width / 2;
        let kind = forced;
        if (!kind) {
          if (p < zone.center - half) kind = 'under';
          else if (p > zone.center + half) kind = 'over';
          else if (Math.abs(p - zone.center) <= cfg.perfect / 2) kind = 'perfect';
          else kind = 'good';
        }
        pulls.push(kind);
        phase = 'shown';
        shown = 0;
        source = null;
        stage.classList.remove('is-pulling', 'in-zone');
        stage.dataset.result = kind;
        slots[index].dataset.state = kind;
        slots[index].lastChild.textContent = LABELS[kind];
        pop.textContent = LABELS[kind];
        pop.dataset.kind = kind;
        pop.classList.remove('show');
        void pop.offsetWidth;
        pop.classList.add('show');
        pull.firstChild.textContent = LABELS[kind];
        say(cfg.results[kind].text);
        sfx(ctx, kind === 'perfect' || kind === 'good' ? 'success' : 'fail');
      }

      function summary(timedOut) {
        if (finished) return;
        finished = true;
        phase = 'done';
        run.setTimer(null);
        stage.classList.remove('is-pulling', 'in-zone');
        stage.classList.add('is-done');
        pull.disabled = true;

        const tally = (kind) => pulls.filter((k) => k === kind).length;
        const decent = tally('perfect') + tally('good');
        const allPerfect = pulls.length === cfg.pours && tally('perfect') === cfg.pours;
        const bonus = allPerfect ? num(cfg.streak.allPerfectBonus, 0) : 0;
        const energy = pulls.reduce((sum, kind) => sum + num(cfg.results[kind].energy, 0), 0);
        const score = pulls.reduce((sum, kind) => sum + num(cfg.results[kind].points, 0), 0) + bonus;
        const success = decent >= Math.ceil((cfg.pours * 2) / 3);
        let line = SPILLED;
        if (allPerfect) line = cfg.streak.text;
        else if (success) line = pick(cfg.done, DEFAULTS.done[0]);
        else if (timedOut && !pulls.length) line = COLD;
        if (allPerfect) sfx(ctx, 'level_up');

        say(timedOut ? COLD : '');
        const go = el('button', { class: 'btn primary cf-done', type: 'button' }, 'Drink it');
        root.append(
          el(
            'div',
            { class: 'gb-result' },
            el('h3', {}, line),
            el(
              'div',
              { class: 'gb-chips' },
              el('span', { class: 'gb-chip warm' }, `+${energy} energy`),
              el('span', { class: 'gb-chip' }, `${score} points`),
              bonus ? el('span', { class: 'gb-chip good' }, `All perfect, +${bonus}`) : null,
            ),
            el('div', { class: 'round-actions' }, go),
          ),
        );
        armButton(go, run, () => {
          sfx(ctx, 'ui_tap');
          resolve({
            success,
            score,
            detail: {
              energy,
              emote: pulls.length ? 'coffee' : null,
              line,
              counts: pulls.length ? { ...cfg.counts } : {},
              pulls: [...pulls],
              perfect: tally('perfect'),
              good: tally('good'),
              timedOut: !!timedOut,
            },
          });
        });
      }

      function draw(dt) {
        const target = phase === 'ready' ? 0 : p;
        needle = phase === 'ready' ? needle + (target - needle) * Math.min(1, dt * 9) : target;
        const wobble = phase === 'holding' ? Math.sin(held * 46) * 0.004 * (0.4 + p) : 0;
        parts.needle.setAttribute('transform', `rotate(${sweep(needle + wobble).toFixed(2)} ${GAUGE.cx} ${GAUGE.cy})`);

        const h = (phase === 'ready' ? 0 : levelFor(p)) * (CUP.floor - CUP.brim);
        parts.fill.setAttribute('y', (CUP.floor - h).toFixed(2));
        parts.fill.setAttribute('height', h.toFixed(2));
        parts.crema.setAttribute('y', (CUP.floor - h).toFixed(2));
        parts.crema.setAttribute('height', Math.min(h, 3.4).toFixed(2));

        const pouring = phase === 'holding';
        const surface = CUP.floor - h;
        parts.stream.setAttribute('height', pouring ? Math.max(0, surface - 152).toFixed(2) : '0');
        parts.stream.setAttribute('width', pouring ? (2.4 + Math.sin(held * 30) * 0.5).toFixed(2) : '0');
        parts.bar.setAttribute('width', (100 * clamp(needle, 0, 1)).toFixed(1));
        const inside = pouring && Math.abs(p - zone.center) <= zone.width / 2;
        stage.classList.toggle('in-zone', inside);
      }

      run.onFrame((dt) => {
        if (finished) return;
        if (phase === 'ready' || phase === 'holding') {
          left -= dt;
          run.setTimer(left / cfg.limit);
          if (left <= 0) {
            if (phase === 'holding') judge();
            draw(dt);
            summary(true);
            return;
          }
        }
        if (phase === 'holding') {
          held += dt;
          p = 1 - Math.exp(-rate() * held);
          if (p >= BURST) judge('over');
        } else if (phase === 'shown') {
          shown += dt;
          if (shown >= SHOW_FOR) {
            index += 1;
            if (index >= cfg.pours) {
              draw(dt);
              summary(false);
              return;
            }
            begin();
          }
        }
        draw(dt);
      });

      const { signal } = run;
      const down = (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        press('pointer');
      };
      pull.addEventListener('pointerdown', down, { signal });
      machine.addEventListener('pointerdown', down, { signal });
      pull.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
      machine.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
      window.addEventListener('pointerup', () => release('pointer'), { signal });
      window.addEventListener('pointercancel', () => release('pointer'), { signal });
      window.addEventListener('blur', cancel, { signal });
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.code !== 'Space' && e.code !== 'Enter') return;
          const control = e.target?.closest?.('button, a, input, select, textarea');
          if (control && control !== pull) return;
          e.preventDefault();
          if (!e.repeat) press('key');
        },
        { signal },
      );
      window.addEventListener(
        'keyup',
        (e) => {
          if (e.code === 'Space' || e.code === 'Enter') release('key');
        },
        { signal },
      );

      live = {
        cancel,
        peek: () => ({ phase, index, p, zone: { ...zone }, perfect: cfg.perfect, pulls: [...pulls], left, finished }),
      };
      run.setTimer(1);
      begin();
      after(run, 0.05, () => draw(0));
    });
  }

  return {
    start,
    pause: () => live?.cancel(),
    peek: () => live?.peek() || null,
    stop() {
      live = null;
    },
  };
}

let game = null;

export default {
  id: 'coffee',
  title: 'Coffee',

  async mount(container, ctx) {
    await Promise.all([loadCSS('./b/common.css', import.meta.url), loadCSS('./b/coffee.css', import.meta.url)]);
    game = build(container, ctx);
  },

  start(run) {
    return game.start(run);
  },

  pause() {
    game?.pause();
  },

  stop() {
    game?.stop();
    game = null;
  },

  // What the round is doing right now. Tests read it.
  peek() {
    return game?.peek() || null;
  },
};
