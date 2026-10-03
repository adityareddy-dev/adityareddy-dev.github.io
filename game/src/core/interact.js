import * as THREE from 'three';

const GLOW = new THREE.Color(0xffd9a0);

// Registry of things the player can use. Tracks the nearest one and the hovered one.
export function createInteract(ctx) {
  const { bus, config } = ctx;
  const items = new Map();
  const lit = new Set();
  const here = new THREE.Vector3();
  const there = new THREE.Vector3();
  const caster = new THREE.Raycaster();
  let focused = null;
  let hovered = null;
  let pulse = 0;

  const isEnabled = (item) => (typeof item.enabled === 'function' ? !!item.enabled(item) : item.enabled !== false);

  function positionOf(item, out = new THREE.Vector3()) {
    if (item.position) return out.copy(item.position);
    if (item.object) return item.object.getWorldPosition(out);
    return out.set(0, 0, 0);
  }

  function setGlow(item, strength) {
    if (!item.object || item.highlight === false) return;
    item.object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const u = mesh.userData;
      if (strength > 0) {
        if (!u.glowMaterial) {
          u.plainMaterial = mesh.material;
          const make = (m) => (m.emissive ? m.clone() : m);
          u.glowMaterial = Array.isArray(mesh.material) ? mesh.material.map(make) : make(mesh.material);
        }
        mesh.material = u.glowMaterial;
        for (const m of [].concat(u.glowMaterial)) {
          if (!m.emissive) continue;
          m.emissive.copy(GLOW);
          m.emissiveIntensity = strength;
        }
      } else if (u.plainMaterial) {
        mesh.material = u.plainMaterial;
      }
    });
  }

  function refreshGlow() {
    const want = new Set([focused, hovered].filter(Boolean));
    for (const item of lit) {
      if (!want.has(item)) {
        setGlow(item, 0);
        lit.delete(item);
      }
    }
    const strength = 0.07 + 0.035 * Math.sin(pulse * 4);
    for (const item of want) {
      setGlow(item, strength);
      lit.add(item);
    }
  }

  function describe(item) {
    return { id: item.id, item, key: 'E', prompt: item.prompt || 'Use', label: item.label || item.id };
  }

  function setFocus(item) {
    if (item === focused) return;
    if (focused) bus.emit('interact:blur', { id: focused.id });
    focused = item;
    if (item) bus.emit('interact:focus', describe(item));
  }

  function setHover(item) {
    if (item === hovered) return;
    hovered = item;
    ctx.engine.canvas.style.cursor = item ? 'pointer' : '';
    bus.emit('interact:hover', { id: item ? item.id : null, item });
  }

  // The item under a ray, or null.
  function pick(ray) {
    const objects = [];
    for (const item of items.values()) {
      if (item.object && isEnabled(item)) objects.push(item.object);
    }
    if (!objects.length) return null;
    caster.set(ray.origin, ray.direction);
    const hit = caster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData.interactId && items.has(o.userData.interactId)) return items.get(o.userData.interactId);
    }
    return null;
  }

  function update(dt) {
    pulse += dt;
    const player = ctx.player;
    let best = null;
    let bestDistance = Infinity;
    if (player) {
      here.copy(player.position);
      for (const item of items.values()) {
        if (!isEnabled(item)) continue;
        positionOf(item, there);
        if (Math.abs(there.y - here.y) > Math.max(config.interact.floorTolerance, item.height || 0)) continue;
        const d = Math.hypot(there.x - here.x, there.z - here.z);
        if (d <= (item.radius ?? config.interact.radius) && d < bestDistance) {
          best = item;
          bestDistance = d;
        }
      }
    }
    setFocus(best);
    const pointer = ctx.input.pointer;
    if (pointer.type === 'mouse' && pointer.moved) setHover(pointer.inside ? pick(ctx.input.ray()) : null);
    refreshGlow();
  }

  // Uses an item. No id means the one in reach. Returns true if something happened.
  function use(id) {
    const item = id ? items.get(id) : focused;
    if (!item || !isEnabled(item)) return false;
    let handled = false;
    try {
      handled = item.onUse?.(ctx, item) === true;
    } catch (err) {
      console.error(`onUse for "${item.id}" threw`, err);
    }
    const event = {
      id: item.id,
      item,
      handled,
      claim() {
        event.handled = true;
      },
    };
    bus.emit('interact:use', event);
    if (!event.handled && item.app && ctx.ui?.phone) {
      ctx.ui.phone.open(item.app);
      event.handled = true;
    }
    if (!event.handled) bus.emit('interact:unhandled', { id: item.id, item });
    return event.handled;
  }

  function add(def) {
    if (!def || !def.id) throw new Error('An interactable needs an id.');
    if (items.has(def.id)) remove(def.id);
    const item = { highlight: true, enabled: true, ...def };
    if (item.object) item.object.userData.interactId = item.id;
    items.set(item.id, item);
    bus.emit('interact:add', { id: item.id, item });
    return {
      item,
      remove: () => remove(item.id),
      set: (patch) => Object.assign(item, patch),
    };
  }

  function remove(id) {
    const item = items.get(id);
    if (!item) return;
    if (lit.has(item)) {
      setGlow(item, 0);
      lit.delete(item);
    }
    if (focused === item) setFocus(null);
    if (hovered === item) setHover(null);
    if (item.object && item.object.userData.interactId === id) delete item.object.userData.interactId;
    items.delete(id);
    bus.emit('interact:remove', { id });
  }

  // Where to stand to use an item, walking in from a given point.
  function standPoint(item, from) {
    if (item.stand) return item.stand.clone();
    const p = positionOf(item);
    const reach = (item.radius ?? config.interact.radius) * 0.7;
    const dx = from.x - p.x;
    const dz = from.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const sameFloor = Math.abs(p.y - from.y) <= config.interact.floorTolerance;
    return new THREE.Vector3(p.x + (dx / d) * reach, sameFloor ? from.y : p.y, p.z + (dz / d) * reach);
  }

  return {
    add,
    remove,
    use,
    pick,
    update,
    standPoint,
    positionOf,
    get: (id) => items.get(id) || null,
    list: () => [...items.values()],
    get focused() {
      return focused;
    },
    get hovered() {
      return hovered;
    },
    // Drops focus and hover, for when an overlay takes over.
    clear() {
      setFocus(null);
      setHover(null);
      refreshGlow();
    },
  };
}
