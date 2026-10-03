import { formatTime, parseTime } from './config.js';

// Game clock in minutes since midnight. Also runs the slow meter drain.
export function createClock({ bus, state, config }) {
  let exact = state.clock;
  let ended = false;
  let timers = [];
  const edges = { energy: false, focus: false, irritation: false };

  function drain(minutes) {
    const hours = minutes / 60;
    const m = config.meters;
    const tense = state.irritation >= m.irritation.highAt;
    return {
      energy: state.energy - m.energy.drainPerGameHour * hours,
      focus: state.focus - m.focus.drainPerGameHour * hours * (tense ? 2 : 1),
      irritation: state.irritation - m.irritation.coolPerGameHour * hours,
    };
  }

  function checkEdges() {
    const m = config.meters;
    const now = {
      energy: state.energy < m.energy.lowAt,
      focus: state.focus < m.focus.lowAt,
      irritation: state.irritation >= m.irritation.highAt,
    };
    for (const meter of Object.keys(now)) {
      if (now[meter] === edges[meter]) continue;
      edges[meter] = now[meter];
      const name = !now[meter] ? 'meter:ok' : meter === 'irritation' ? 'meter:high' : 'meter:low';
      bus.emit(name, { meter, value: state[meter] });
    }
  }

  function update(dt) {
    checkEdges();
    if (!state.clockRunning || ended) return;
    const before = Math.floor(exact);
    exact = Math.min(config.clock.end, exact + dt * (60 / config.clock.secondsPerGameHour));
    const minute = Math.floor(exact);

    if (minute !== before) {
      state.set({ clock: minute, ...drain(minute - before) });
      bus.emit('clock:tick', { clock: minute, time: formatTime(minute) });
      if (Math.floor(before / 60) !== Math.floor(minute / 60)) {
        bus.emit('clock:hour', { hour: Math.floor(minute / 60), clock: minute });
      }
      const due = timers.filter((t) => minute >= t.at);
      timers = timers.filter((t) => minute < t.at);
      for (const t of due) {
        try {
          t.fn(minute);
        } catch (err) {
          console.error('clock timer threw', err);
        }
      }
    }

    if (exact >= config.clock.end) {
      ended = true;
      state.set({ clockRunning: false });
      bus.emit('clock:end', { clock: minute });
    }
  }

  return {
    update,
    parse: parseTime,
    format: (minutes = state.clock) => formatTime(minutes),
    start() {
      state.set({ clockRunning: true });
    },
    stop() {
      state.set({ clockRunning: false });
    },
    // Jumps the clock. Does not drain meters for the skipped time.
    set(time) {
      exact = Math.min(config.clock.end, Math.max(0, parseTime(time, state.clock)));
      ended = exact >= config.clock.end;
      const minute = Math.floor(exact);
      state.set({ clock: minute });
      bus.emit('clock:tick', { clock: minute, time: formatTime(minute) });
    },
    // Runs fn once when the clock reaches the time. Returns a cancel function.
    at(time, fn) {
      const timer = { at: parseTime(time, config.clock.end), fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    reset() {
      ended = false;
      timers = [];
      exact = config.clock.start;
      state.set({ clock: config.clock.start, clockRunning: false });
    },
    // Minutes since midnight with the fraction, for smooth things like the sun.
    get now() {
      return exact;
    },
    get progress() {
      const { start, end } = config.clock;
      return Math.min(1, Math.max(0, (exact - start) / (end - start)));
    },
    get ended() {
      return ended;
    },
  };
}
