// The whole mixer. Works on a live AudioContext or an OfflineAudioContext.
import { rng, noiseBuffer, crackleBuffer, impulse, softClipCurve } from './util.js';
import { createMusic } from './music.js';
import { SFX, DUCK } from './sfx.js';

// Effects sit a little above the music.
const MUSIC_GAIN = 1;
const SFX_GAIN = 3;

export function createGraph(ac, opts = {}) {
  const rand = rng(opts.seed ?? Math.floor(Math.random() * 4294967296));
  const gain = (v) => {
    const node = ac.createGain();
    node.gain.value = v;
    return node;
  };
  const filter = (type, freq, q = 0.7) => {
    const node = ac.createBiquadFilter();
    node.type = type;
    node.frequency.value = freq;
    node.Q.value = q;
    return node;
  };
  const send = (src, amount, dest) => src.connect(gain(amount)).connect(dest);

  // Master: volume, glue compressor, limiter, then a soft clip as the last guard.
  // The trims cancel the compressors' built-in makeup gain (measured, 1.777 and 1.218).
  const master = gain(opts.level ?? 1);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  const compTrim = gain(1 / 1.777);
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  const limiterTrim = gain(1 / 1.218);
  const clip = ac.createWaveShaper();
  clip.curve = softClipCurve();
  // raw skips the dynamics, only the level checks use it.
  if (opts.raw) master.connect(ac.destination);
  else master.connect(comp).connect(compTrim).connect(limiter).connect(limiterTrim).connect(clip).connect(ac.destination);

  const sfxIn = gain(SFX_GAIN);
  sfxIn.connect(master);

  // Music bus: tape wobble, tone filter, phone muffle, duck, level.
  const musicLevel = gain(0);
  musicLevel.connect(gain(MUSIC_GAIN)).connect(master);
  const duck = gain(1);
  duck.connect(musicLevel);
  const muffle = filter('lowpass', 20000, 0.5);
  muffle.connect(duck);
  const toneFilter = filter('lowpass', 7500, 0.5);
  toneFilter.connect(muffle);
  const wobble = ac.createDelay(0.05);
  wobble.delayTime.value = 0.014;
  wobble.connect(toneFilter);
  for (const [rate, depth] of [[0.53, 0.0006], [0.17, 0.0011]]) {
    const lfo = ac.createOscillator();
    lfo.frequency.value = rate;
    lfo.connect(gain(depth)).connect(wobble.delayTime);
    lfo.start();
  }
  const musicIn = gain(1);
  musicIn.connect(wobble);

  const verbIn = gain(0.3);
  const verb = ac.createConvolver();
  verb.normalize = true;
  verb.buffer = impulse(ac, 3, 3.2, rand);
  verbIn.connect(verb).connect(gain(0.6)).connect(toneFilter);

  const delayIn = gain(0.3);
  const delay = ac.createDelay(2);
  delay.delayTime.value = 0.6;
  const feedback = gain(0.32);
  const delayTone = filter('lowpass', 2200);
  delayIn.connect(delay).connect(delayTone).connect(feedback).connect(delay);
  delayTone.connect(gain(0.6)).connect(toneFilter);

  const keysIn = gain(1);
  const keysFilter = filter('lowpass', 1700, 0.6);
  keysIn.connect(keysFilter).connect(musicIn);
  send(keysFilter, 0.9, verbIn);

  const leadIn = gain(1);
  leadIn.connect(musicIn);
  send(leadIn, 0.9, verbIn);
  leadIn.connect(delayIn);

  const bassIn = gain(1);
  bassIn.connect(musicIn);

  const drumIn = gain(1);
  const drumFilter = filter('lowpass', 7500, 0.5);
  drumIn.connect(drumFilter).connect(musicIn);
  send(drumFilter, 0.12, verbIn);

  const layerIn = gain(1);
  layerIn.connect(musicIn);
  send(layerIn, 0.5, verbIn);

  const crackle = ac.createBufferSource();
  crackle.buffer = crackleBuffer(ac, 6.3, rand);
  crackle.loop = true;
  const crackleLevel = gain(0.05);
  crackle.connect(crackleLevel).connect(muffle);
  crackle.start(0, rand() * 6);

  const g = {
    ac,
    rand,
    noise: noiseBuffer(ac, 2, rand),
    sfxIn,
    keysIn,
    leadIn,
    bassIn,
    drumIn,
    layerIn,
    params: {
      keysCut: keysFilter.frequency,
      tone: toneFilter.frequency,
      verb: verbIn.gain,
      crackle: crackleLevel.gain,
      delayTime: delay.delayTime,
    },
  };
  const music = createMusic(g, { onMood: opts.onMood });

  return {
    music,
    parts: g,
    setLevel(v, t, smooth = 0.04) {
      master.gain.setTargetAtTime(v, t, smooth);
    },
    startMusic(t, fade = 3) {
      musicLevel.gain.cancelScheduledValues(t);
      musicLevel.gain.setValueAtTime(0, t);
      musicLevel.gain.linearRampToValueAtTime(1, t + fade);
      music.start(t);
    },
    setMuffle(on, t) {
      muffle.frequency.setTargetAtTime(on ? 1300 : 20000, t, 0.12);
    },
    sfx(name, t) {
      if (!Object.prototype.hasOwnProperty.call(SFX, name)) return false;
      SFX[name](g, t);
      if (DUCK.has(name)) {
        duck.gain.setTargetAtTime(0.5, t, 0.02);
        duck.gain.setTargetAtTime(1, t + 0.35, 0.3);
      }
      return true;
    },
  };
}
