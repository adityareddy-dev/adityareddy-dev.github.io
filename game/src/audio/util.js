// Small helpers shared by the music and the sound effects.

export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const pick = (list, rand) => list[Math.floor(rand() * list.length) % list.length];

export function noiseBuffer(ac, seconds, rand) {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

// Record noise: a dark hiss with pops scattered through it.
export function crackleBuffer(ac, seconds, rand) {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  for (let i = 0; i < length; i++) {
    low += (rand() * 2 - 1 - low) * 0.06;
    data[i] = low * 0.35;
  }
  const pops = Math.floor(seconds * 11);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(rand() * length);
    const big = rand() < 0.12;
    const amp = (big ? 0.9 : 0.3) * (0.4 + rand() * 0.6);
    const size = big ? 40 + Math.floor(rand() * 60) : 4 + Math.floor(rand() * 14);
    const sign = rand() < 0.5 ? -1 : 1;
    for (let k = 0; k < size && at + k < length; k++) {
      data[at + k] += sign * amp * Math.exp(-k / (size / 4)) * (k % 2 ? -0.5 : 1);
    }
  }
  for (let i = 0; i < length; i++) data[i] = clamp(data[i], -1, 1);
  return buffer;
}

// A stereo room tail that gets darker as it fades.
export function impulse(ac, seconds, decay, rand) {
  const rate = ac.sampleRate;
  const length = Math.floor(rate * seconds);
  const pre = Math.floor(rate * 0.018);
  const buffer = ac.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const x = i / length;
      low += (rand() * 2 - 1 - low) * (0.55 - 0.45 * x);
      data[i] = i < pre ? 0 : low * (1 - x) ** decay;
    }
  }
  return buffer;
}

// Straight up to 0.8, then a soft knee that never passes 0.95.
export function softClipCurve(size = 4096) {
  const curve = new Float32Array(size);
  const knee = 0.8;
  const room = 0.18;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
