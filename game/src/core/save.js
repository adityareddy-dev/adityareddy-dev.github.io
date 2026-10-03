// localStorage wrapper. Falls back to memory when storage is blocked.
export function createSave(key = 'adi-day:v1') {
  let data = {};
  let persistent = true;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw) data = JSON.parse(raw) || {};
  } catch {
    persistent = false;
  }

  function flush() {
    if (!persistent) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch {
      persistent = false;
    }
  }

  return {
    get persistent() {
      return persistent;
    },
    get(name, fallback = null) {
      return name in data ? data[name] : fallback;
    },
    set(name, value) {
      data[name] = value;
      flush();
      return value;
    },
    remove(name) {
      delete data[name];
      flush();
    },
    all() {
      return { ...data };
    },
    clear() {
      data = {};
      try {
        window.localStorage.removeItem(key);
      } catch {
        persistent = false;
      }
    },
  };
}
