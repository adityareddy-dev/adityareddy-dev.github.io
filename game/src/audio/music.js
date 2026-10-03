// The generative lo-fi loop. One running transport, moods blend over it.
import { clamp, pick } from './util.js';
import { keyNote, bassNote, leadNote, kick, snare, rim, hat, nag, tick, bell, noiseHit } from './voices.js';

export const MOOD_NAMES = ['chill', 'irritated', 'urgent', 'win', 'night'];

const MOODS = {
  chill: { bpm: 75, swing: 0.6, keysCut: 1700, tone: 7500, verb: 0.3, crackle: 0.1, hats: 0.55, kick: 1, snare: 0.9, lead: 0.6, ost: 0, tick: 0, pulse: 0, sparse: 0, sparkle: 0 },
  irritated: { bpm: 75, swing: 0.58, keysCut: 1900, tone: 8500, verb: 0.24, crackle: 0.12, hats: 1, kick: 1, snare: 1, lead: 0.25, ost: 1, tick: 0, pulse: 0, sparse: 0, sparkle: 0 },
  urgent: { bpm: 100, swing: 0.52, keysCut: 4200, tone: 14000, verb: 0.18, crackle: 0.05, hats: 0.8, kick: 1.05, snare: 1, lead: 0.2, ost: 0, tick: 1, pulse: 1, sparse: 0, sparkle: 0 },
  win: { bpm: 80, swing: 0.56, keysCut: 4800, tone: 14000, verb: 0.4, crackle: 0.06, hats: 0.5, kick: 0.9, snare: 0.7, lead: 0, ost: 0, tick: 0, pulse: 0, sparse: 0, sparkle: 1 },
  night: { bpm: 62, swing: 0.6, keysCut: 1100, tone: 5200, verb: 0.62, crackle: 0.14, hats: 0.12, kick: 0.5, snare: 0.4, lead: 0.5, ost: 0, tick: 0, pulse: 0, sparse: 1, sparkle: 0 },
};
const PARAMS = Object.keys(MOODS.chill);

// [bass root, upper voicing], all MIDI notes.
const CHORDS = {
  Fmaj7: [41, [53, 57, 60, 64]],
  Em7: [40, [55, 59, 62, 64]],
  Dm9: [38, [53, 57, 60, 64]],
  Cmaj7: [36, [55, 59, 60, 64]],
  Am9: [45, [55, 60, 64, 71]],
  G13: [43, [53, 59, 64, 69]],
  Fm7: [41, [53, 56, 60, 63]],
  Am7: [45, [57, 60, 64, 67]],
  Dm7: [38, [57, 60, 62, 65]],
  E7b9: [40, [56, 59, 62, 65]],
  Bbmaj7: [46, [57, 58, 62, 65]],
  Cmaj9: [36, [55, 59, 62, 64]],
  Fmaj9: [41, [57, 60, 64, 67]],
  Fm6: [41, [56, 60, 62, 65]],
  G6: [43, [55, 59, 62, 64]],
  Cadd9: [36, [55, 60, 62, 64, 67]],
};

// One string per bar, "A|B" splits a bar in two.
const PROGS = {
  chill: [
    ['Fmaj7', 'Em7', 'Dm9', 'Cmaj7'],
    ['Dm9', 'G13', 'Cmaj7', 'Am9'],
    ['Fmaj7', 'Fm7', 'Em7', 'Am9'],
    ['Am9', 'Fmaj7', 'Cmaj7', 'G13'],
    ['Fmaj7', 'Em7', 'Dm9', 'G13|Fm7'],
  ],
  urgent: [
    ['Am7', 'Fmaj7', 'Dm7', 'E7b9'],
    ['Am7', 'Am7', 'Bbmaj7', 'E7b9'],
    ['Dm7', 'Am7', 'Fmaj7', 'E7b9'],
  ],
  night: [
    ['Cmaj9', 'Am9', 'Fmaj9', 'Fm6'],
    ['Fmaj9', 'Em7', 'Dm9', 'Cmaj9'],
  ],
  win: [['Fmaj7|G6', 'Cadd9']],
};

// Chord hits per bar: [step, length in steps, velocity].
const COMP = {
  chill: [
    [[0, 7, 1], [7, 3, 0.6], [10, 6, 0.8]],
    [[0, 10, 1], [10, 6, 0.7]],
    [[0, 3, 0.9], [3, 5, 0.7], [8, 6, 0.85], [14, 2, 0.5]],
    [[0, 14, 1], [14, 2, 0.55]],
    [[0, 6, 1], [6, 4, 0.65], [11, 5, 0.75]],
  ],
  urgent: [
    [[0, 2, 1], [3, 2, 0.7], [6, 2, 0.8], [8, 2, 0.9], [11, 2, 0.7], [14, 2, 0.8]],
    [[0, 3, 1], [6, 2, 0.8], [10, 2, 0.8], [12, 4, 0.9]],
  ],
  night: [[[0, 16, 0.9]], [[0, 12, 0.9], [12, 4, 0.45]]],
  win: [[[0, 8, 1], [8, 8, 1]]],
};

const PENTA = [64, 67, 69, 72, 74, 76, 79, 81, 84];
const FADE = 2;

const onehot = (name) => Object.fromEntries(MOOD_NAMES.map((m) => [m, m === name ? 1 : 0]));

export function createMusic(g, { onMood } = {}) {
  const { rand } = g;
  let from = onehot('chill');
  let to = from;
  let t0 = 0;
  let current = 'chill';
  let nextTime = 0;
  let step = 0;
  let bar = 0;
  let started = false;
  let progMood = null;
  let prog = null;
  let pos = 0;
  let chord = null;
  let comp = COMP.chill[0];
  const lead = { idx: 4, busyUntil: 0, on: true };

  function weightsAt(t) {
    const k = clamp((t - t0) / FADE);
    const w = {};
    for (const m of MOOD_NAMES) w[m] = from[m] + (to[m] - from[m]) * k;
    return w;
  }

  function blend(w) {
    const p = {};
    for (const key of PARAMS) {
      let v = 0;
      for (const m of MOOD_NAMES) v += w[m] * MOODS[m][key];
      p[key] = v;
    }
    return p;
  }

  function ramp(param, a, b, t, dur, exp) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(a, t);
    if (exp) param.exponentialRampToValueAtTime(b, t + dur);
    else param.linearRampToValueAtTime(b, t + dur);
  }

  function setMood(name, t, immediate = false) {
    if (!MOODS[name]) return false;
    const now = Math.max(0, t);
    const a = blend(immediate ? onehot(name) : weightsAt(now));
    from = immediate ? onehot(name) : weightsAt(now);
    to = onehot(name);
    t0 = now;
    current = name;
    const b = blend(to);
    const dur = immediate ? 0.02 : FADE;
    const P = g.params;
    ramp(P.keysCut, a.keysCut, b.keysCut, now, dur, true);
    ramp(P.tone, a.tone, b.tone, now, dur, true);
    ramp(P.verb, a.verb, b.verb, now, dur);
    ramp(P.crackle, a.crackle, b.crackle, now, dur);
    ramp(P.delayTime, (60 / a.bpm) * 0.75, (60 / b.bpm) * 0.75, now, dur);
    if (name === 'win' && !immediate) stinger(now + 0.04);
    return true;
  }

  function stinger(t) {
    [72, 76, 79, 84, 88].forEach((m, i) => bell(g, t + i * 0.07, m, 0.06 - i * 0.006, 1.2, g.leadIn));
    noiseHit(g, { t, type: 'highpass', freq: 6500, attack: 0.35, decay: 0.6, gain: 0.03, dest: g.drumIn });
  }

  function chordFrom(barText, half) {
    const parts = barText.split('|');
    return CHORDS[parts[Math.min(half, parts.length - 1)]];
  }

  function newProg(key) {
    const list = PROGS[key];
    if (list.length === 1) return list[0];
    let next = pick(list, rand);
    if (next === prog) next = pick(list, rand);
    return next;
  }

  // Runs on each half bar. Returns true when the chord changed.
  function harmony(t) {
    const key = current === 'irritated' ? 'chill' : current;
    if (key !== progMood) {
      progMood = key;
      prog = progMood === 'chill' && !chord ? PROGS.chill[0] : newProg(key);
      pos = 0;
      comp = pick(COMP[key], rand);
    } else {
      pos++;
      if (pos >= prog.length * 2) {
        if (progMood === 'win') {
          setMood('chill', t);
          if (onMood) onMood('chill');
          return harmony(t);
        }
        prog = newProg(progMood);
        pos = 0;
      }
      if (pos % 2 === 0) comp = pick(COMP[progMood], rand);
    }
    const next = chordFrom(prog[Math.floor(pos / 2)], pos % 2);
    const changed = next !== chord;
    chord = next;
    return changed;
  }

  function drums(s, at, p, thin) {
    let k = 0;
    if (s === 0) k = 1;
    else if (s === 10) k = 0.75 * thin;
    else if (s === 7 && rand() < 0.3) k = 0.4 * thin;
    if (s % 4 === 0 && s) k = Math.max(k, p.pulse * 0.85);
    if (k > 0.02) kick(g, at, k * p.kick);

    if (s === 4 || s === 12) {
      if (thin > 0.02) snare(g, at, p.snare * thin * (0.9 + rand() * 0.15));
      if (s === 12 && p.sparse > 0.02) rim(g, at, 0.9 * p.sparse);
    }
    if (s === 15 && rand() < 0.15 * thin) snare(g, at, 0.22 * p.snare);

    const h = p.hats;
    if (s % 2 === 0) {
      if (rand() < Math.min(1, h * 1.6)) hat(g, at, (s % 4 === 2 ? 0.8 : 0.55) * (0.8 + rand() * 0.3));
    } else if (rand() < (h - 0.45) * 1.3) {
      hat(g, at, 0.35 * (0.7 + rand() * 0.4));
    }
    if (s === 14 && rand() < 0.12 * h) hat(g, at, 0.5, true);
  }

  function bass(s, at, dur, p, thin, changed) {
    if (!chord) return;
    const root = chord[0];
    const groove = 1 - p.pulse;
    if (groove > 0.02) {
      let hit = null;
      if (s === 0) hit = [root, 7, 1];
      else if (changed) hit = [root, 6, 0.9];
      else if (s === 7 && rand() < 0.45 * thin) hit = [root + 12, 2, 0.55];
      else if (s === 10 && rand() < 0.8 * thin) hit = [root + (rand() < 0.5 ? 7 : 0), 4, 0.8];
      else if (s === 14 && rand() < 0.3 * thin) hit = [root + 7, 2, 0.5];
      if (hit) bassNote(g, at, hit[0], hit[2] * groove, hit[1] * dur * (1 + p.sparse * 1.6));
    }
    if (p.pulse > 0.02 && s % 2 === 0) {
      bassNote(g, at, root + (s % 4 === 2 ? 12 : 0), p.pulse * (s % 4 === 0 ? 1 : 0.7), dur * 1.5, true);
    }
  }

  function keys(s, at, dur, p, changed) {
    if (!chord) return;
    let hit = comp.find((h) => h[0] === s);
    if (!hit && changed) hit = [s, 8 - (s % 8), 0.9];
    if (!hit) return;
    const [, len, v] = hit;
    const strum = 0.011 + p.sparse * 0.03 + rand() * 0.006;
    const notes = chord[1];
    const lift = p.sparkle > 0.5 ? 12 : 0;
    notes.forEach((m, i) => {
      keyNote(g, at + i * strum, m + (i === notes.length - 1 ? lift : 0), v * (0.82 + rand() * 0.22), len * dur * 0.95);
    });
  }

  function nearestChordTone(idx) {
    const pcs = new Set([chord[0] % 12, ...chord[1].map((m) => m % 12)]);
    for (let d = 0; d < PENTA.length; d++) {
      for (const j of [idx - d, idx + d]) {
        if (j >= 0 && j < PENTA.length && pcs.has(PENTA[j] % 12)) return j;
      }
    }
    return idx;
  }

  function melody(s, at, dur, p, thin) {
    if (s === 0 && bar % 2 === 0) lead.on = rand() < 0.62;
    if (!chord || !lead.on || p.lead < 0.05 || s % 2 || at < lead.busyUntil) return;
    if (rand() > 0.42 * p.lead * (0.45 + thin * 0.55)) return;
    let idx = lead.idx + pick([-2, -1, -1, 0, 1, 1, 2], rand);
    idx = Math.round(clamp(idx, 0, PENTA.length - 1));
    if (s % 8 === 0) idx = nearestChordTone(idx);
    lead.idx = idx;
    const len = (2 + Math.floor(rand() * 3)) * dur * (1 + p.sparse);
    leadNote(g, at, PENTA[idx], 0.8 + rand() * 0.2, len);
    lead.busyUntil = at + len * 0.9;
  }

  function layers(s, at, p) {
    if (!chord) return;
    if (p.ost > 0.02) {
      const top = chord[1][chord[1].length - 1] + 12;
      nag(g, at, s % 2 ? top : top + 1, p.ost * (s % 4 === 0 ? 1 : 0.65));
    }
    if (p.tick > 0.02 && s % 2 === 0) tick(g, at, p.tick * (s % 4 === 0 ? 1 : 0.5), s % 8 === 0);
    if (p.sparkle > 0.3 && current === 'win' && s % 2 === 0) {
      const notes = chord[1];
      const m = notes[(s / 2) % notes.length] + (s < 8 ? 12 : 24);
      bell(g, at, m, 0.03 * p.sparkle, 0.5, g.leadIn);
    }
  }

  function doStep(s, t, dur) {
    const changed = s % 8 === 0 ? harmony(t) : false;
    const p = blend(weightsAt(t));
    const at = Math.max(t, t + (s % 2 ? (p.swing - 0.5) * 2 * dur : 0) + (rand() - 0.5) * 0.006);
    const thin = 1 - p.sparse;
    drums(s, at, p, thin);
    bass(s, at, dur, p, thin, changed);
    keys(s, at, dur, p, changed);
    melody(s, at, dur, p, thin);
    layers(s, at, p);
  }

  return {
    setMood,
    get mood() {
      return current;
    },
    get chord() {
      return chord;
    },
    start(t) {
      started = true;
      nextTime = t;
      step = 0;
      bar = 0;
    },
    // Schedules every step that starts before `end`. `now` lets it skip ahead after a stall.
    scheduleUntil(end, now) {
      if (!started) return;
      if (now !== undefined && nextTime < now - 0.05) nextTime = now + 0.03;
      let guard = 0;
      while (nextTime < end && guard++ < 256) {
        const p = blend(weightsAt(nextTime));
        const dur = 60 / p.bpm / 4;
        doStep(step, nextTime, dur);
        nextTime += dur;
        step = (step + 1) % 16;
        if (step === 0) bar++;
      }
    },
  };
}
