// Every sound effect, built fresh each time it plays.
import { tone, noiseHit, bell } from './voices.js';

export const SFX = {
  step(g, t) {
    const r = g.rand();
    noiseHit(g, { t, type: 'lowpass', freq: 340 + r * 160, q: 0.9, decay: 0.07, gain: 0.2 });
    tone(g, { t, freq: 90 + r * 25, to: 55, decay: 0.07, gain: 0.13 });
  },

  ui_tap(g, t) {
    tone(g, { t, freq: 1250, to: 880, glide: 0.04, decay: 0.06, gain: 0.16 });
    noiseHit(g, { t, type: 'highpass', freq: 4500, decay: 0.012, gain: 0.04 });
  },

  phone_buzz(g, t) {
    for (const at of [0, 0.22]) {
      const filter = { type: 'lowpass', freq: 420, q: 2 };
      tone(g, { t: t + at, type: 'sawtooth', freq: 148, attack: 0.012, hold: 0.13, decay: 0.05, gain: 0.09, filter });
      tone(g, { t: t + at, type: 'sawtooth', freq: 161, attack: 0.012, hold: 0.13, decay: 0.05, gain: 0.07, filter });
    }
  },

  notify(g, t) {
    bell(g, t, 88, 0.12, 0.5);
    bell(g, t + 0.09, 93, 0.1, 0.7);
  },

  dismiss(g, t) {
    noiseHit(g, { t, type: 'bandpass', freq: 2800, to: 450, glide: 0.16, q: 1.6, attack: 0.012, decay: 0.17, gain: 0.2 });
    tone(g, { t, freq: 720, to: 300, decay: 0.1, gain: 0.03 });
  },

  page_alarm(g, t) {
    const filter = { type: 'lowpass', freq: 2600, q: 1 };
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.29;
      tone(g, { t: at, type: 'square', freq: 880, attack: 0.008, hold: 0.1, decay: 0.04, gain: 0.07, filter });
      tone(g, { t: at + 0.14, type: 'square', freq: 660, attack: 0.008, hold: 0.1, decay: 0.05, gain: 0.07, filter });
    }
    tone(g, { t, type: 'triangle', freq: 110, attack: 0.02, hold: 0.7, decay: 0.2, gain: 0.12 });
  },

  success(g, t) {
    [72, 76, 79, 84].forEach((m, i) => bell(g, t + i * 0.075, m, 0.11 - i * 0.012, i === 3 ? 0.9 : 0.45));
  },

  fail(g, t) {
    const filter = { type: 'lowpass', freq: 1200 };
    tone(g, { t, type: 'triangle', freq: 311, attack: 0.01, hold: 0.12, decay: 0.12, gain: 0.16, filter });
    tone(g, { t: t + 0.2, type: 'triangle', freq: 294, to: 220, glide: 0.4, attack: 0.01, hold: 0.15, decay: 0.3, gain: 0.16, filter });
  },

  coffee_pour(g, t) {
    noiseHit(g, { t, type: 'bandpass', freq: 480, to: 1500, glide: 1.1, q: 5, attack: 0.06, hold: 0.85, decay: 0.25, gain: 0.32 });
    noiseHit(g, { t, type: 'lowpass', freq: 900, attack: 0.05, hold: 0.8, decay: 0.2, gain: 0.05 });
    for (let i = 0; i < 9; i++) {
      const f = 520 + g.rand() * 500 + i * 40;
      tone(g, { t: t + 0.1 + g.rand() * 0.9, freq: f, to: f * 1.5, glide: 0.03, decay: 0.04, gain: 0.025 });
    }
  },

  marker_squeak(g, t) {
    const f = 1700 + g.rand() * 300;
    const steps = [[f * 1.07, 0.03], [f * 0.96, 0.06], [f * 1.04, 0.09]];
    tone(g, { t, type: 'triangle', freq: f, steps, attack: 0.01, hold: 0.07, decay: 0.05, gain: 0.05, filter: { type: 'bandpass', freq: 2000, q: 2 } });
    noiseHit(g, { t, type: 'highpass', freq: 3200, attack: 0.01, hold: 0.06, decay: 0.05, gain: 0.025 });
  },

  stamp(g, t) {
    tone(g, { t, freq: 120, to: 45, glide: 0.12, decay: 0.22, gain: 0.4 });
    noiseHit(g, { t, type: 'lowpass', freq: 900, decay: 0.09, gain: 0.22 });
    noiseHit(g, { t, type: 'bandpass', freq: 2600, decay: 0.025, gain: 0.08 });
  },

  door_locked(g, t) {
    for (const at of [0, 0.085, 0.2]) {
      noiseHit(g, { t: t + at, type: 'bandpass', freq: 1150, q: 4, decay: 0.05, gain: 0.2 });
      tone(g, { t: t + at, freq: 175, to: 135, decay: 0.07, gain: 0.12 });
      tone(g, { t: t + at, type: 'triangle', freq: 1380, decay: 0.035, gain: 0.025 });
    }
  },

  beat_tick(g, t) {
    tone(g, { t, freq: 1600, decay: 0.035, gain: 0.3 });
    noiseHit(g, { t, type: 'highpass', freq: 6000, decay: 0.008, gain: 0.04 });
  },

  level_up(g, t) {
    [67, 72, 76, 79, 84, 88].forEach((m, i) => bell(g, t + i * 0.055, m, 0.09, i === 5 ? 1.1 : 0.4));
    for (const m of [72, 76, 79]) tone(g, { t: t + 0.3, type: 'triangle', freq: 440 * 2 ** ((m - 69) / 12), attack: 0.08, hold: 0.25, decay: 0.6, gain: 0.03 });
    noiseHit(g, { t, type: 'highpass', freq: 6500, attack: 0.25, decay: 0.35, gain: 0.03 });
  },
};

// The music dips under these so they read clearly.
export const DUCK = new Set(['page_alarm', 'success', 'fail', 'level_up']);
