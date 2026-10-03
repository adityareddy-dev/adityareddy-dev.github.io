// Basement gym. Plates fall in lanes, hit the key as each one reaches the bar. Raises the energy cap.
import { el, loadCSS } from '../core/dom.js';
import { clamp, num, pick, sfx, preciseClock, armButton, fitCanvas } from './b/kit.js';

const DEFAULTS = {
  how: 'Hit the key when the plate reaches the bar.',
  bpm: 96,
  beats: 24,
  lanes: ['A', 'S', 'D'],
  hitWindowMs: { perfect: 70, good: 150 },
  lowEnergyWindowMult: 0.75,
  points: { perfect: 6, good: 3, miss: 0 },
  streak: { every: 8, bonus: 15 },
  energyCost: 8,
  energyCapBonus: { bronze: 5, silver: 10, gold: 20 },
  tiers: { bronze: 0.4, silver: 0.65, gold: 0.85 },
  results: {
    gold: "Clean sets. I'll be insufferable about this until lunch.",
    silver: 'Solid. Nothing pulled, nothing dropped.',
    bronze: "I showed up. That's most of it.",
    none: "That wasn't a workout, that was a visit.",
  },
  callouts: { perfect: ['Clean', 'Easy'], good: ['Fine', 'Counts'], miss: ['Nope'] },
};

const TIER_NAMES = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', none: 'No medal' };
const TIRED = 'Low energy. The timing is tighter.';
const COLORS = ['#ffb463', '#66b8ff', '#3fb37f', '#e58ad0', '#f2d33d'];
const ARROWS = {
  3: [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']],
  4: [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowUp', '↑'], ['ArrowRight', '→']],
};

const COUNT_IN = 4;
const LEAD = 0.6;
const TRAVEL = 1.5;
const TAU = Math.PI * 2;

function settings(config) {
  const c = config && typeof config === 'object' ? config : {};
  const lanes = Array.isArray(c.lanes) && c.lanes.length >= 2 && c.lanes.length <= 5 ? c.lanes.map((k) => String(k).toUpperCase().slice(0, 1)) : DEFAULTS.lanes;
  return {
    how: typeof c.how === 'string' && c.how ? c.how : DEFAULTS.how,
    bpm: clamp(num(c.bpm, DEFAULTS.bpm), 50, 180),
    beats: clamp(Math.round(num(c.beats, DEFAULTS.beats)), 4, 64),
    lanes,
    windows: { ...DEFAULTS.hitWindowMs, ...(c.hitWindowMs || {}) },
    lowMult: num(c.lowEnergyWindowMult, DEFAULTS.lowEnergyWindowMult),
    points: { ...DEFAULTS.points, ...(c.points || {}) },
    streak: { ...DEFAULTS.streak, ...(c.streak || {}) },
    energyCost: num(c.energyCost, DEFAULTS.energyCost),
    capBonus: { ...DEFAULTS.energyCapBonus, ...(c.energyCapBonus || {}) },
    tiers: { ...DEFAULTS.tiers, ...(c.tiers || {}) },
    results: { ...DEFAULTS.results, ...(c.results || {}) },
    callouts: { ...DEFAULTS.callouts, ...(c.callouts || {}) },
  };
}

// One plate a beat. Never the same lane three times running.
function chart(beats, lanes, interval) {
  const notes = [];
  for (let i = 0; i < beats; i += 1) {
    let lane = Math.floor(Math.random() * lanes);
    const a = notes[i - 1]?.lane;
    const b = notes[i - 2]?.lane;
    if (lane === a && a === b) lane = (lane + 1 + Math.floor(Math.random() * (lanes - 1))) % lanes;
    notes.push({ i, lane, time: (COUNT_IN + i) * interval, state: 'pending', at: 0 });
  }
  return notes;
}

function plate(g, x, y, r, color, alpha = 1, scale = 1) {
  const R = r * scale;
  g.globalAlpha = alpha;
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.fillStyle = color;
  g.fill();
  g.beginPath();
  g.arc(x, y, R * 0.76, 0, TAU);
  g.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  g.lineWidth = R * 0.1;
  g.stroke();
  g.beginPath();
  g.arc(x, y, R * 0.9, -2.5, -1.3);
  g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  g.lineWidth = 2;
  g.stroke();
  g.beginPath();
  g.arc(x, y, R * 0.36, 0, TAU);
  g.fillStyle = '#dcd8d0';
  g.fill();
  g.beginPath();
  g.arc(x, y, R * 0.15, 0, TAU);
  g.fillStyle = '#26232d';
  g.fill();
  g.globalAlpha = 1;
}

function play(container, ctx, run) {
  const cfg = settings({ ...(run.config || {}), ...(run.opts?.config || {}) });
  const L = cfg.lanes.length;
  const arrows = ARROWS[L] || [];

  const comboValue = el('b', {}, '0');
  const repsValue = el('b', {}, `0/${cfg.beats}`);
  const tierFill = el('i');
  const tierTrack = el('div', { class: 'gy-track' }, tierFill);
  for (const tier of ['bronze', 'silver', 'gold']) {
    tierTrack.append(el('span', { class: `gy-mark gy-${tier}`, style: { left: `${clamp(num(cfg.tiers[tier], 0), 0, 1) * 100}%` } }, el('em', {}, TIER_NAMES[tier])));
  }
  const hud = el(
    'div',
    { class: 'gy-hud' },
    el('div', { class: 'gy-stat gy-combo' }, el('span', {}, 'In a row'), comboValue),
    el('div', { class: 'gy-tier' }, tierTrack),
    el('div', { class: 'gy-stat gy-reps' }, el('span', {}, 'Reps'), repsValue),
  );
  const canvas = el('canvas', { class: 'gy-canvas', 'aria-label': 'Plates falling toward a bar' });
  const pads = el(
    'div',
    { class: 'gy-pads', style: { gridTemplateColumns: `repeat(${L}, 1fr)` } },
    cfg.lanes.map((key, i) =>
      el(
        'button',
        { class: 'gy-pad', type: 'button', dataset: { lane: String(i) }, 'aria-label': `Lane ${i + 1}, key ${key}` },
        el('b', {}, key),
        arrows[i] ? el('small', {}, arrows[i][1]) : null,
      ),
    ),
  );
  pads.querySelectorAll('.gy-pad').forEach((pad, i) => pad.style.setProperty('--lane', COLORS[i % COLORS.length]));
  const field = el('div', { class: 'gy-field', style: { maxWidth: `${L * 132}px` } }, canvas, pads);
  const tired = el('p', { class: 'gy-tired', hidden: true }, TIRED);
  const stage = el('div', { class: 'gy-stage' }, hud, field, tired);
  const how = el('p', { class: 'gb-how' }, cfg.how, el('span', { class: 'gy-touch' }, ' Tapping a lane works too.'));
  const root = el('div', { class: 'gy' }, how, stage);
  container.append(root);

  let live = null;

  function start() {
    const now = preciseClock(run);
    const interval = 60 / cfg.bpm;
    const mult = run.lowEnergy ? cfg.lowMult : 1;
    const perfectW = (num(cfg.windows.perfect, 70) * mult) / 1000;
    const goodW = (num(cfg.windows.good, 150) * mult) / 1000;
    const notes = chart(cfg.beats, L, interval);
    const total = (COUNT_IN + cfg.beats) * interval + 0.5;
    const t0 = run.elapsed + LEAD;
    const song = () => now() - t0;
    tired.hidden = !run.lowEnergy;

    return new Promise((resolve) => {
      const flash = new Array(L).fill(0);
      const texts = [];
      const rings = [];
      const drops = [];
      let combo = 0;
      let best = 0;
      let score = 0;
      let bonuses = 0;
      let nextBeat = 0;
      let pulse = 0;
      let done = false;
      const tally = { perfect: 0, good: 0, miss: 0 };

      function paint() {
        comboValue.textContent = String(combo);
        repsValue.textContent = `${tally.perfect + tally.good}/${cfg.beats}`;
        const share = (tally.perfect + tally.good) / cfg.beats;
        tierFill.style.transform = `scaleX(${share})`;
        for (const tier of ['bronze', 'silver', 'gold']) {
          tierTrack.querySelector(`.gy-${tier}`).classList.toggle('reached', share >= num(cfg.tiers[tier], 2));
        }
      }

      function judge(note, state, t) {
        note.state = state;
        note.at = t;
        tally[state] += 1;
        if (state === 'miss') {
          combo = 0;
        } else {
          combo += 1;
          best = Math.max(best, combo);
          score += num(cfg.points[state], 0);
          rings.push({ lane: note.lane, at: t, perfect: state === 'perfect' });
          if (state === 'perfect') {
            for (let k = 0; k < 3; k += 1) {
              drops.push({ lane: note.lane, at: t, vx: (Math.random() - 0.5) * 120, vy: -150 - Math.random() * 90 });
            }
          }
          const every = Math.max(1, Math.round(num(cfg.streak.every, 8)));
          if (combo % every === 0) {
            const bonus = num(cfg.streak.bonus, 0);
            score += bonus;
            bonuses += 1;
            texts.push({ lane: note.lane, at: t, text: `${combo} in a row, +${bonus}`, kind: 'streak', lift: 26 });
            sfx(ctx, 'success');
          }
        }
        texts.push({ lane: note.lane, at: t, text: pick(cfg.callouts[state], ''), kind: state, lift: 0 });
        comboValue.classList.remove('bump');
        void comboValue.offsetWidth;
        comboValue.classList.add('bump');
        paint();
      }

      function hit(lane) {
        if (done || run.paused || lane < 0 || lane >= L) return;
        const t = song();
        flash[lane] = 1;
        let near = null;
        for (const note of notes) {
          if (note.state !== 'pending') continue;
          if (note.time - t > goodW) break;
          const gap = Math.abs(note.time - t);
          if (gap <= goodW && (!near || gap < Math.abs(near.time - t))) near = note;
        }
        if (!near) return;
        if (near.lane !== lane) {
          judge(near, 'miss', t);
          return;
        }
        judge(near, Math.abs(near.time - t) <= perfectW ? 'perfect' : 'good', t);
      }

      function finish() {
        if (done) return;
        done = true;
        run.setTimer(null);
        const hits = tally.perfect + tally.good;
        const share = hits / cfg.beats;
        let tier = 'none';
        for (const name of ['bronze', 'silver', 'gold']) if (share >= num(cfg.tiers[name], 2)) tier = name;
        const cap = tier === 'none' ? 0 : num(cfg.capBonus[tier], 0);
        const line = cfg.results[tier] || DEFAULTS.results[tier];
        sfx(ctx, tier === 'gold' ? 'level_up' : tier === 'none' ? 'fail' : 'success');
        stage.classList.add('is-done');

        const go = el('button', { class: 'btn primary gy-done', type: 'button' }, 'Back upstairs');
        root.append(
          el(
            'div',
            { class: 'gb-result' },
            el('div', { class: 'gy-medal', dataset: { tier } }, el('i', { 'aria-hidden': 'true' }), el('h3', {}, line)),
            el(
              'div',
              { class: 'gb-chips' },
              el('span', { class: `gb-chip ${tier === 'none' ? 'bad' : 'good'}` }, TIER_NAMES[tier]),
              cap ? el('span', { class: 'gb-chip warm' }, `+${cap} energy cap`) : null,
              el('span', { class: 'gb-chip' }, `${hits} of ${cfg.beats} hit`),
              el('span', { class: 'gb-chip' }, `Best run ${best}`),
              el('span', { class: 'gb-chip' }, `${score} points`),
            ),
            el('div', { class: 'round-actions' }, go),
          ),
        );
        armButton(go, run, () => {
          sfx(ctx, 'ui_tap');
          resolve({
            success: tier !== 'none',
            score,
            detail: {
              energyMax: cap,
              energy: -Math.abs(cfg.energyCost),
              emote: 'sweat',
              line,
              tier,
              hits,
              beats: cfg.beats,
              share: Math.round(share * 100) / 100,
              perfect: tally.perfect,
              good: tally.good,
              miss: tally.miss,
              bestCombo: best,
              streakBonuses: bonuses,
            },
          });
        });
      }

      function draw(t, dt) {
        const { g, width: W, height: H } = fitCanvas(canvas);
        const laneW = W / L;
        const barY = H - Math.min(64, H * 0.2);
        const R = Math.min(laneW * 0.3, 30);
        const speed = (barY + R) / TRAVEL;
        const cx = (lane) => (lane + 0.5) * laneW;

        g.clearRect(0, 0, W, H);
        for (let i = 0; i < L; i += 1) {
          g.fillStyle = i % 2 ? '#262430' : '#211f2a';
          g.fillRect(i * laneW, 0, laneW, H);
          if (flash[i] > 0.01) {
            const glow = g.createLinearGradient(0, barY, 0, barY - 190);
            glow.addColorStop(0, COLORS[i % COLORS.length]);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            g.globalAlpha = flash[i] * 0.4;
            g.fillStyle = glow;
            g.fillRect(i * laneW, barY - 190, laneW, 190);
            g.globalAlpha = 1;
          }
          flash[i] = Math.max(0, flash[i] - dt * 5);
        }
        g.fillStyle = 'rgba(0, 0, 0, 0.22)';
        g.fillRect(0, barY + 5, W, H - barY);

        // The bar, with a ring in each lane where the plate should land.
        const steel = g.createLinearGradient(0, barY - 6, 0, barY + 6);
        steel.addColorStop(0, '#f1eee8');
        steel.addColorStop(0.5, '#b9b4ab');
        steel.addColorStop(1, '#7c7870');
        g.shadowColor = `rgba(255, 220, 160, ${0.75 * pulse})`;
        g.shadowBlur = 18 * pulse;
        g.fillStyle = steel;
        g.beginPath();
        if (g.roundRect) g.roundRect(6, barY - 5, W - 12, 10, 5);
        else g.rect(6, barY - 5, W - 12, 10);
        g.fill();
        g.shadowBlur = 0;
        for (let i = 0; i < L; i += 1) {
          g.beginPath();
          g.arc(cx(i), barY, R + 4, 0, TAU);
          g.strokeStyle = COLORS[i % COLORS.length];
          g.globalAlpha = 0.5 + flash[i] * 0.5;
          g.lineWidth = 2.5;
          g.stroke();
          g.globalAlpha = 1;
        }
        pulse = Math.max(0, pulse - dt * 4.5);

        for (const note of notes) {
          const color = COLORS[note.lane % COLORS.length];
          if (note.state === 'pending') {
            const y = barY - (note.time - t) * speed;
            if (y < -R) continue;
            plate(g, cx(note.lane), y, R, color);
          } else if (note.state === 'miss') {
            const age = t - note.at;
            if (age > 0.4) continue;
            const y = barY - (note.time - t) * speed;
            plate(g, cx(note.lane), y, R, '#6d6977', 1 - age / 0.4);
          } else {
            const age = t - note.at;
            if (age > 0.2) continue;
            plate(g, cx(note.lane), barY, R, color, 1 - age / 0.2, 1 + age * 1.6);
          }
        }

        for (let i = rings.length - 1; i >= 0; i -= 1) {
          const ring = rings[i];
          const age = (t - ring.at) / 0.38;
          if (age >= 1) {
            rings.splice(i, 1);
            continue;
          }
          g.beginPath();
          g.arc(cx(ring.lane), barY, R + 4 + age * R * 1.3, 0, TAU);
          g.strokeStyle = ring.perfect ? '#ffe9a8' : '#ffffff';
          g.globalAlpha = (1 - age) * 0.9;
          g.lineWidth = ring.perfect ? 4 : 2.5;
          g.stroke();
          g.globalAlpha = 1;
        }

        for (let i = drops.length - 1; i >= 0; i -= 1) {
          const drop = drops[i];
          const age = t - drop.at;
          if (age >= 0.7) {
            drops.splice(i, 1);
            continue;
          }
          const x = cx(drop.lane) + drop.vx * age;
          const y = barY - R + drop.vy * age + 420 * age * age;
          g.globalAlpha = 1 - age / 0.7;
          g.fillStyle = '#9fd4ff';
          g.beginPath();
          g.moveTo(x, y - 6);
          g.quadraticCurveTo(x + 4.5, y + 1, x, y + 4);
          g.quadraticCurveTo(x - 4.5, y + 1, x, y - 6);
          g.fill();
          g.globalAlpha = 1;
        }

        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = texts.length - 1; i >= 0; i -= 1) {
          const item = texts[i];
          const span = item.kind === 'streak' ? 1 : 0.6;
          const age = (t - item.at) / span;
          if (age >= 1 || !item.text) {
            texts.splice(i, 1);
            continue;
          }
          g.font = `${item.kind === 'streak' ? 800 : 600} ${item.kind === 'streak' ? 14 : 15}px Inter, system-ui, sans-serif`;
          g.fillStyle = { perfect: '#ffe08a', good: '#eceaf2', miss: '#f3a3a6', streak: '#ffffff' }[item.kind];
          g.globalAlpha = 1 - age * age;
          const half = g.measureText(item.text).width / 2 + 6;
          g.fillText(item.text, clamp(cx(item.lane), half, W - half), barY - R - 20 - item.lift - age * 22);
          g.globalAlpha = 1;
        }

        if (t < COUNT_IN * interval) {
          const beat = Math.floor(t / interval);
          const label = t < 0 ? 'Ready' : String(COUNT_IN - beat);
          const into = t < 0 ? 0 : (t - beat * interval) / interval;
          g.font = `800 ${t < 0 ? 34 : 64}px Inter, system-ui, sans-serif`;
          g.fillStyle = '#f5f5f7';
          g.globalAlpha = t < 0 ? 0.85 : 1 - into * 0.75;
          g.fillText(label, W / 2, H * 0.36);
          g.globalAlpha = 1;
        }
      }

      run.onFrame((dt) => {
        if (done) return;
        const t = song();
        while (nextBeat < COUNT_IN + cfg.beats && t >= nextBeat * interval) {
          sfx(ctx, 'beat_tick');
          pulse = 1;
          nextBeat += 1;
        }
        for (const note of notes) {
          if (note.state === 'pending' && t > note.time + goodW) judge(note, 'miss', t);
        }
        run.setTimer(1 - clamp(t / total, 0, 1));
        draw(t, dt);
        if (t >= total) finish();
      });

      const { signal } = run;
      const keys = new Map();
      cfg.lanes.forEach((key, i) => {
        keys.set(`Key${key}`, i);
        keys.set(`Digit${i + 1}`, i);
        if (arrows[i]) keys.set(arrows[i][0], i);
      });
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !keys.has(e.code)) return;
          e.preventDefault();
          hit(keys.get(e.code));
        },
        { signal },
      );
      pads.addEventListener(
        'pointerdown',
        (e) => {
          const pad = e.target.closest?.('.gy-pad');
          if (!pad) return;
          e.preventDefault();
          hit(Number(pad.dataset.lane));
        },
        { signal },
      );
      canvas.addEventListener(
        'pointerdown',
        (e) => {
          const box = canvas.getBoundingClientRect();
          e.preventDefault();
          hit(Math.floor(((e.clientX - box.left) / box.width) * L));
        },
        { signal },
      );

      live = {
        peek: () => ({
          t: song(),
          interval,
          goodW,
          perfectW,
          combo,
          best,
          score,
          done,
          tally: { ...tally },
          notes: notes.map((n) => ({ lane: n.lane, time: n.time, state: n.state })),
          keys: cfg.lanes.map((k) => `Key${k}`),
        }),
      };
      run.setTimer(1);
      paint();
      draw(song(), 0);
    });
  }

  return {
    result: start(),
    peek: () => live?.peek() || null,
  };
}

let mounted = null;
let game = null;

export default {
  id: 'gym',
  title: 'Basement gym',

  async mount(container, ctx) {
    await Promise.all([loadCSS('./b/common.css', import.meta.url), loadCSS('./b/gym.css', import.meta.url)]);
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
