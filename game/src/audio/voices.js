import { mtof } from './util.js';

// decay is roughly the time to fall 40 dB.
const TC = 4.6;

function envelope(param, t, peak, attack, hold, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
  param.setTargetAtTime(0, t + attack + hold, decay / TC);
  return t + attack + hold + decay * 1.5 + 0.02;
}

function makeFilter(ac, t, f, fallback) {
  const node = ac.createBiquadFilter();
  node.type = f.type || 'lowpass';
  node.frequency.setValueAtTime(f.freq, t);
  if (f.to) node.frequency.exponentialRampToValueAtTime(f.to, t + (f.glide ?? fallback));
  node.Q.value = f.q ?? 0.7;
  return node;
}

export function tone(g, o) {
  const { ac } = g;
  const t = o.t;
  const decay = o.decay ?? 0.1;
  const osc = ac.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? decay));
  if (o.steps) for (const [freq, at] of o.steps) osc.frequency.setValueAtTime(freq, t + at);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const amp = ac.createGain();
  const end = envelope(amp.gain, t, o.gain ?? 0.1, o.attack ?? 0.004, o.hold ?? 0, decay);
  let head = osc;
  if (o.filter) {
    head = makeFilter(ac, t, o.filter, decay);
    osc.connect(head);
  }
  head.connect(amp);
  amp.connect(o.dest || g.sfxIn);
  osc.onended = () => amp.disconnect();
  osc.start(t);
  osc.stop(end);
  return end;
}

export function noiseHit(g, o) {
  const { ac } = g;
  const t = o.t;
  const decay = o.decay ?? 0.1;
  const src = ac.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  const filter = makeFilter(ac, t, { type: o.type || 'bandpass', freq: o.freq ?? 1000, to: o.to, glide: o.glide, q: o.q ?? 1 }, decay);
  const amp = ac.createGain();
  const end = envelope(amp.gain, t, o.gain ?? 0.1, o.attack ?? 0.002, o.hold ?? 0, decay);
  src.connect(filter).connect(amp).connect(o.dest || g.sfxIn);
  src.onended = () => amp.disconnect();
  src.start(t, g.rand() * 1.5);
  src.stop(end);
  return end;
}

// A small glassy bell, used by chimes and arpeggios.
export function bell(g, t, midi, gain, decay = 0.6, dest) {
  const f = mtof(midi);
  tone(g, { t, freq: f, gain, decay, dest });
  tone(g, { t, freq: f * 2.76, gain: gain * 0.25, decay: decay * 0.3, dest });
  tone(g, { t, freq: f * 2, type: 'triangle', gain: gain * 0.12, decay: decay * 0.5, dest });
}

// Soft electric piano: detuned sine and triangle with a short tine on top.
export function keyNote(g, t, midi, vel, len) {
  const { ac } = g;
  const f = mtof(midi);
  const peak = vel * 0.07;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.007);
  amp.gain.setTargetAtTime(peak * 0.42, t + 0.007, 0.32);
  amp.gain.setTargetAtTime(0, t + len, 0.26);
  const end = t + len + 1.4;

  const a = ac.createOscillator();
  a.frequency.value = f;
  a.detune.value = -4 + g.rand() * 2;
  const b = ac.createOscillator();
  b.type = 'triangle';
  b.frequency.value = f;
  b.detune.value = 5 + g.rand() * 2;
  const bLevel = ac.createGain();
  bLevel.gain.value = 0.28;
  const c = ac.createOscillator();
  c.frequency.value = f * 4.02;
  const cLevel = ac.createGain();
  cLevel.gain.setValueAtTime(0.22, t);
  cLevel.gain.setTargetAtTime(0, t, 0.035);

  a.connect(amp);
  b.connect(bLevel).connect(amp);
  c.connect(cLevel).connect(amp);
  amp.connect(g.keysIn);
  a.onended = () => amp.disconnect();
  for (const o of [a, b, c]) {
    o.start(t);
    o.stop(end);
  }
}

export function bassNote(g, t, midi, vel, len, pulse = false) {
  const { ac } = g;
  const f = mtof(midi);
  const amp = ac.createGain();
  const peak = vel * (pulse ? 0.11 : 0.14);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.012);
  amp.gain.setTargetAtTime(peak * 0.6, t + 0.012, 0.3);
  amp.gain.setTargetAtTime(0, t + len, pulse ? 0.03 : 0.07);
  const end = t + len + (pulse ? 0.2 : 0.5);

  const lp = ac.createBiquadFilter();
  lp.Q.value = pulse ? 3 : 0.8;
  lp.frequency.setValueAtTime(pulse ? 1300 : 800, t);
  lp.frequency.setTargetAtTime(pulse ? 260 : 300, t, pulse ? 0.05 : 0.12);

  const a = ac.createOscillator();
  a.type = pulse ? 'sawtooth' : 'sine';
  a.frequency.value = f;
  const b = ac.createOscillator();
  b.type = 'triangle';
  b.frequency.value = f;
  b.detune.value = 3;
  const bLevel = ac.createGain();
  bLevel.gain.value = pulse ? 0.5 : 0.35;
  a.connect(lp);
  b.connect(bLevel).connect(lp);
  lp.connect(amp).connect(g.bassIn);
  a.onended = () => amp.disconnect();
  for (const o of [a, b]) {
    o.start(t);
    o.stop(end);
  }
}

export function leadNote(g, t, midi, vel, len, dest) {
  const f = mtof(midi);
  const to = dest || g.leadIn;
  const hold = len * 0.3;
  const decay = len * 0.7 + 0.3;
  tone(g, { t, type: 'triangle', freq: f, attack: 0.018, hold, decay, gain: 0.11 * vel, dest: to, filter: { type: 'lowpass', freq: 2400 } });
  tone(g, { t, freq: f, detune: 6, attack: 0.018, hold, decay, gain: 0.07 * vel, dest: to });
}

export function kick(g, t, vel) {
  const { ac } = g;
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.5 * vel, t + 0.003);
  amp.gain.setTargetAtTime(0, t + 0.003, 0.085);
  osc.connect(amp).connect(g.drumIn);
  osc.onended = () => amp.disconnect();
  osc.start(t);
  osc.stop(t + 0.55);
  noiseHit(g, { t, type: 'lowpass', freq: 2200, decay: 0.012, gain: 0.07 * vel, dest: g.drumIn });
}

export function snare(g, t, vel) {
  noiseHit(g, { t, type: 'bandpass', freq: 1700, q: 0.9, decay: 0.17, gain: 0.2 * vel, dest: g.drumIn });
  tone(g, { t, type: 'triangle', freq: 220, to: 175, decay: 0.08, gain: 0.09 * vel, dest: g.drumIn });
}

export function rim(g, t, vel) {
  noiseHit(g, { t, type: 'bandpass', freq: 2400, q: 3, decay: 0.045, gain: 0.16 * vel, dest: g.drumIn });
  tone(g, { t, type: 'triangle', freq: 820, decay: 0.035, gain: 0.07 * vel, dest: g.drumIn });
}

export function hat(g, t, vel, open = false) {
  noiseHit(g, { t, type: 'highpass', freq: 7200, q: 0.6, decay: open ? 0.28 : 0.04, gain: 0.07 * vel, dest: g.drumIn });
}

// The nagging two-note figure for the irritated mood.
export function nag(g, t, midi, vel) {
  tone(g, { t, type: 'square', freq: mtof(midi), attack: 0.006, decay: 0.11, gain: 0.06 * vel, dest: g.layerIn, filter: { type: 'lowpass', freq: 2600, q: 1.5 } });
}

export function tick(g, t, vel, accent) {
  tone(g, { t, freq: accent ? 3000 : 2300, decay: 0.022, gain: 0.09 * vel, dest: g.layerIn });
}
