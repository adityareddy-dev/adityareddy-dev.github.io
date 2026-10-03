// Tiny event bus. Listeners run in the order they were added.
export function createBus() {
  const map = new Map();

  function on(name, fn) {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
    return () => off(name, fn);
  }

  function once(name, fn) {
    const stop = on(name, (payload) => {
      stop();
      fn(payload);
    });
    return stop;
  }

  function off(name, fn) {
    map.get(name)?.delete(fn);
  }

  function emit(name, payload) {
    for (const key of [name, '*']) {
      const set = map.get(key);
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          key === '*' ? fn(name, payload) : fn(payload);
        } catch (err) {
          console.error(`bus listener for "${name}" threw`, err);
        }
      }
    }
    return payload;
  }

  // Resolves with the payload the next time the event fires.
  function wait(name) {
    return new Promise((resolve) => once(name, resolve));
  }

  return { on, once, off, emit, wait };
}
