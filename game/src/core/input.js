import * as THREE from 'three';

const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

// Keyboard, pointer, zoom and click picking. Touch goes through pointer events.
export function createInput({ canvas, camera, bus, state }) {
  const down = new Set();
  const pressed = new Set();
  const released = new Set();
  const actionSubs = new Map();
  const bindings = {
    interact: ['KeyE', 'Enter'],
    phone: ['KeyP', 'Tab'],
    mute: ['KeyM'],
    skip: ['KeyK'],
    back: ['Escape'],
  };
  const pointer = { x: 0, y: 0, ndc: new THREE.Vector2(), down: false, inside: false, moved: false, type: 'mouse' };
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const forward = new THREE.Vector3();
  const active = new Map();
  const virtual = { x: 0, y: 0 };
  let zoom = 0;
  let press = null;
  let pinch = 0;
  let enabled = true;

  const typing = (e) => {
    const t = e.target;
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  };
  const onControl = (e) => {
    const t = e.target;
    return !!t && typeof t.closest === 'function' && !!t.closest('button, a, [role="button"], summary');
  };

  function fire(name, event) {
    for (const fn of [...(actionSubs.get(name) || [])]) {
      try {
        fn(event);
      } catch (err) {
        console.error(`action "${name}" handler threw`, err);
      }
    }
    bus.emit('input:action', { name, event });
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    // Typing in a field stays typing. Escape still gets out.
    if (typing(e)) {
      if (code === 'Escape' && !e.repeat) fire('back', e);
      return;
    }
    if (code === 'Tab') {
      // Tab opens the phone from the world. Shift+Tab, or Tab from a button, moves focus as usual.
      const at = document.activeElement;
      const world = !at || at === document.body || at === canvas;
      if (state.paused || state.phoneOpen || e.shiftKey || !world) return;
      e.preventDefault();
      if (!e.repeat) fire('phone', e);
      return;
    }
    const control = onControl(e);
    if (!control && (code === 'Space' || code.startsWith('Arrow'))) e.preventDefault();
    if (!down.has(code)) pressed.add(code);
    down.add(code);
    if (e.repeat) return;
    bus.emit('input:key', { code, event: e });
    for (const [name, codes] of Object.entries(bindings)) {
      if (!codes.includes(code)) continue;
      if (control && (code === 'Enter' || code === 'Space')) continue;
      fire(name, e);
    }
  }

  function onKeyUp(e) {
    if (down.delete(e.code)) released.add(e.code);
  }

  function clearKeys() {
    down.clear();
    pressed.clear();
    released.clear();
    active.clear();
    pointer.down = false;
    press = null;
  }

  function place(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.ndc.set((pointer.x / rect.width) * 2 - 1, -(pointer.y / rect.height) * 2 + 1);
    pointer.type = e.pointerType || 'mouse';
    pointer.moved = true;
  }

  function pinchDistance() {
    const [a, b] = [...active.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    place(e);
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointer.down = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety, not a need.
    }
    if (active.size === 1) press = { x: e.clientX, y: e.clientY, time: performance.now(), button: e.button };
    else {
      press = null;
      pinch = pinchDistance();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    place(e);
    pointer.inside = true;
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) {
      const d = pinchDistance();
      if (pinch > 0 && d > 0) zoom -= Math.log(d / pinch);
      pinch = d;
    }
  });

  function onPointerEnd(e) {
    const had = active.delete(e.pointerId);
    pointer.down = active.size > 0;
    if (!had || !press || e.type !== 'pointerup') {
      if (active.size === 0) press = null;
      return;
    }
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const quick = performance.now() - press.time < 600;
    const button = press.button;
    press = null;
    if (!enabled || moved > 8 || !quick || button !== 0) return;
    place(e);
    bus.emit('input:click', { x: pointer.x, y: pointer.y, ndc: pointer.ndc.clone(), ray: ray().clone(), event: e });
  }
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : 1;
      zoom += Math.max(-400, Math.min(400, e.deltaY * lines)) * 0.0012;
    },
    { passive: false },
  );

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearKeys();
  });

  function ray(ndc = pointer.ndc) {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  const anyDown = (codes) => codes.some((code) => down.has(code));

  const input = {
    bindings,
    pointer,
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = !!value;
      if (!enabled) clearKeys();
    },
    isDown: (code) => down.has(code),
    wasPressed: (code) => pressed.has(code),
    wasReleased: (code) => released.has(code),

    // Screen axes. x is right, y is up. Each runs from -1 to 1.
    axis(out = { x: 0, y: 0 }) {
      out.x = 0;
      out.y = 0;
      if (!enabled) return out;
      out.x = (anyDown(MOVE_KEYS.right) ? 1 : 0) - (anyDown(MOVE_KEYS.left) ? 1 : 0) + virtual.x;
      out.y = (anyDown(MOVE_KEYS.up) ? 1 : 0) - (anyDown(MOVE_KEYS.down) ? 1 : 0) + virtual.y;
      const length = Math.hypot(out.x, out.y);
      if (length > 1) {
        out.x /= length;
        out.y /= length;
      }
      return out;
    },

    // The same axes turned into a world direction on the floor, relative to the camera.
    moveVector(out = new THREE.Vector3()) {
      const a = input.axis();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      out.set(-forward.z * a.x + forward.x * a.y, 0, forward.x * a.x + forward.z * a.y);
      return out;
    },

    // For an on-screen stick. Values from -1 to 1.
    setVirtualAxis(x = 0, y = 0) {
      virtual.x = x;
      virtual.y = y;
    },

    onAction(name, fn) {
      if (!actionSubs.has(name)) actionSubs.set(name, new Set());
      actionSubs.get(name).add(fn);
      return () => actionSubs.get(name).delete(fn);
    },

    ray,
    raycast(objects, recursive = true, ndc = pointer.ndc) {
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects([].concat(objects), recursive);
    },
    // Where a ray meets the flat floor at height y. null if it never does.
    groundPoint(y = 0, r = ray()) {
      plane.constant = -y;
      const hit = r.intersectPlane(plane, new THREE.Vector3());
      return hit || null;
    },

    takeZoom() {
      const value = zoom;
      zoom = 0;
      return value;
    },
    endFrame() {
      pressed.clear();
      released.clear();
      pointer.moved = false;
    },
    clear: clearKeys,
  };

  return input;
}
