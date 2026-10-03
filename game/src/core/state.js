// The one game state store. Read fields directly, write through set().
export function createState({ bus, config }) {
  const meters = config.meters;

  function initial() {
    return {
      phase: 'loading',
      clock: config.clock.start,
      clockRunning: false,
      energy: meters.energy.start,
      energyMax: meters.energy.cap,
      focus: meters.focus.start,
      irritation: meters.irritation.start,
      score: 0,
      streak: 0,
      bestStreak: 0,
      counts: {},
      flags: {},
      dnd: false,
      muted: false,
      volume: 0.8,
      room: null,
      round: null,
      objective: '',
      paused: false,
      phoneOpen: false,
      phoneApp: null,
      quality: 'high',
    };
  }

  let data = initial();
  const subs = new Set();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function tidy(next) {
    next.energyMax = Math.max(1, Number(next.energyMax) || 1);
    next.energy = clamp(Number(next.energy) || 0, 0, next.energyMax);
    next.focus = clamp(Number(next.focus) || 0, 0, meters.focus.cap);
    next.irritation = clamp(Number(next.irritation) || 0, 0, meters.irritation.cap);
    next.score = Math.max(0, Math.round(Number(next.score) || 0));
    next.streak = Math.max(0, Math.round(Number(next.streak) || 0));
    next.bestStreak = Math.max(Number(next.bestStreak) || 0, next.streak);
    next.volume = clamp(Number(next.volume) || 0, 0, 1);
    next.dnd = !!next.dnd;
    next.muted = !!next.muted;
  }

  function set(patch) {
    if (!patch || typeof patch !== 'object') return [];
    const prev = data;
    const next = { ...data, ...patch };
    tidy(next);
    const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
    if (!changed.length) return changed;
    data = next;
    for (const sub of [...subs]) {
      if (sub.keys && !sub.keys.some((k) => changed.includes(k))) continue;
      try {
        sub.fn(store, changed, prev);
      } catch (err) {
        console.error('state subscriber threw', err);
      }
    }
    bus.emit('state:change', { changed, state: store, prev });
    return changed;
  }

  const store = {
    get: () => data,
    set,
    update: (fn) => set(fn(data)),
    add: (key, delta) => set({ [key]: (Number(data[key]) || 0) + delta }),
    subscribe(fn, keys) {
      const sub = { fn, keys: keys ? [].concat(keys) : null };
      subs.add(sub);
      return () => subs.delete(sub);
    },
    flag: (name) => data.flags[name],
    setFlag: (name, value = true) => set({ flags: { ...data.flags, [name]: value } }),
    count: (name, delta = 1) => {
      const value = (data.counts[name] || 0) + delta;
      set({ counts: { ...data.counts, [name]: value } });
      return value;
    },
    snapshot: () => JSON.parse(JSON.stringify(data)),
    // Back to the start of a day. Keeps the settings.
    reset() {
      const { muted, volume, dnd, quality } = data;
      set({ ...initial(), muted, volume, dnd, quality });
    },
  };

  for (const key of Object.keys(data)) {
    Object.defineProperty(store, key, {
      enumerable: true,
      get: () => data[key],
      set: (value) => set({ [key]: value }),
    });
  }

  return store;
}
