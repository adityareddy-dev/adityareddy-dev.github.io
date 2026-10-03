// Music and sound, all made with Web Audio at runtime. There are no audio files.
import { createGraph } from './graph.js';
import { MOOD_NAMES } from './music.js';
import { SFX } from './sfx.js';

const LOOKAHEAD = 0.35;
const TICK_MS = 50;
const MIN_GAP = { step: 0.07 };
const WIN_BACKSTOP_MS = 9000;

export function createAudio(ctx) {
  const { bus, state } = ctx;
  let ac = null;
  let graph = null;
  let unlocked = false;
  let started = false;
  let timer = 0;
  let suspendTimer = 0;
  let winTimer = 0;
  let muted = !!state?.muted;
  let volume = clampVolume(state?.volume ?? 0.8);
  let hidden = typeof document !== 'undefined' && !!document.hidden;
  let mood = 'chill';
  let muffled = false;
  let warned = false;
  const lastPlayed = new Map();

  const level = () => (muted ? 0 : volume ** 1.5);
  const running = () => !!ac && ac.state === 'running';

  function warnOnce(err) {
    if (warned) return;
    warned = true;
    console.warn('[audio]', err);
  }

  function changeMood(name) {
    if (name === mood) return;
    mood = name;
    if (name !== 'win') clearTimeout(winTimer);
    bus.emit('audio:mood', { mood });
  }

  function create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC({ latencyHint: 'interactive' });
    } catch {
      try {
        ac = new AC();
      } catch {
        return false;
      }
    }
    graph = createGraph(ac, { level: 0, onMood: changeMood });
    graph.music.setMood(mood, ac.currentTime, true);
    return true;
  }

  function tick() {
    if (!running()) return;
    try {
      graph.music.scheduleUntil(ac.currentTime + LOOKAHEAD, ac.currentTime);
    } catch (err) {
      warnOnce(err);
    }
  }

  function startTimer() {
    if (timer) return;
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = 0;
  }

  // Runs the context only while someone can hear it.
  function sync() {
    if (!ac || !unlocked) return;
    clearTimeout(suspendTimer);
    if (!hidden && !muted) {
      const go = () => {
        if (hidden || muted || !running()) return;
        graph.setLevel(level(), ac.currentTime);
        if (!started) {
          started = true;
          graph.startMusic(ac.currentTime + 0.05);
        }
        startTimer();
      };
      if (running()) go();
      else ac.resume().then(go, () => {});
    } else {
      stopTimer();
      if (running()) graph.setLevel(0, ac.currentTime, 0.03);
      suspendTimer = setTimeout(() => {
        if ((hidden || muted) && running()) ac.suspend().catch(() => {});
      }, hidden ? 0 : 160);
    }
  }

  async function unlock() {
    if (!ac && !create()) return false;
    const pending = running() ? null : ac.resume();
    try {
      // A silent blip, some mobile browsers want a sound inside the gesture.
      const blip = ac.createBufferSource();
      blip.buffer = ac.createBuffer(1, 1, ac.sampleRate);
      blip.connect(ac.destination);
      blip.start();
      await pending;
    } catch {
      return false;
    }
    if (!running()) return false;
    if (!unlocked) {
      unlocked = true;
      bus.emit('audio:unlock', {});
    }
    sync();
    return true;
  }

  function sfx(name) {
    if (!graph || !running() || muted || hidden) return;
    if (!Object.prototype.hasOwnProperty.call(SFX, name)) return;
    const now = ac.currentTime;
    const last = lastPlayed.get(name) ?? -1;
    if (now - last < (MIN_GAP[name] ?? 0.03)) return;
    lastPlayed.set(name, now);
    try {
      graph.sfx(name, now + 0.005);
    } catch (err) {
      warnOnce(err);
    }
  }

  function setMood(name) {
    if (!MOOD_NAMES.includes(name)) return;
    if (name === mood && name !== 'win') return;
    changeMood(name);
    if (graph) graph.music.setMood(name, ac.currentTime);
    if (name === 'win') {
      // The music hands back to chill by itself, this covers a silent or suspended context.
      clearTimeout(winTimer);
      winTimer = setTimeout(() => {
        if (mood !== 'win') return;
        if (graph) graph.music.setMood('chill', ac.currentTime);
        changeMood('chill');
      }, WIN_BACKSTOP_MS);
    }
  }

  bus.on('app:hidden', () => {
    hidden = true;
    sync();
  });
  bus.on('app:visible', () => {
    hidden = false;
    sync();
  });

  // Some browsers park the context after a call or an alarm. A tap brings it back.
  const nudge = () => {
    if (!ac) return;
    if (!unlocked) unlock();
    else if (!hidden && !muted && !running()) sync();
  };
  window.addEventListener('pointerdown', nudge, true);
  window.addEventListener('keydown', nudge, true);

  return {
    unlock,
    sfx,
    setMood,
    setMuted(on) {
      muted = !!on;
      sync();
    },
    setVolume(v) {
      volume = clampVolume(v);
      if (running() && !muted && !hidden) graph.setLevel(level(), ac.currentTime);
    },
    update() {
      const want = !!state?.phoneOpen;
      if (want === muffled) return;
      muffled = want;
      if (graph) graph.setMuffle(want, ac.currentTime);
    },
    get mood() {
      return mood;
    },
    get unlocked() {
      return unlocked && running();
    },
    get context() {
      return ac;
    },
  };
}

function clampVolume(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.8;
}
