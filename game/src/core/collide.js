import * as THREE from 'three';

const CELL = 0.125;
const FLOOR_GAP = 0.6;

// Circle against boxes on the floor plane, plus a small grid path finder.
export function createCollide(ctx) {
  const grids = new Map();

  const boxes = () => ctx.world?.colliders || [];
  const onFloor = (box, y) => box.floor === undefined || Math.abs(box.floor - y) < FLOOR_GAP;

  function pushOut(p, box, radius) {
    const cx = Math.min(box.maxX, Math.max(box.minX, p.x));
    const cz = Math.min(box.maxZ, Math.max(box.minZ, p.z));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (radius - d);
      p.z += (dz / d) * (radius - d);
      return true;
    }
    // Centre is inside the box. Leave by the nearest side.
    const sides = [
      [p.x - box.minX, -1, 0],
      [box.maxX - p.x, 1, 0],
      [p.z - box.minZ, 0, -1],
      [box.maxZ - p.z, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    const [depth, sx, sz] = sides[0];
    p.x += sx * (depth + radius);
    p.z += sz * (depth + radius);
    return true;
  }

  function clampToBounds(p, radius) {
    const b = ctx.world?.bounds;
    if (!b) return;
    p.x = Math.min(b.maxX - radius, Math.max(b.minX + radius, p.x));
    p.z = Math.min(b.maxZ - radius, Math.max(b.minZ + radius, p.z));
  }

  function blocked(point, radius = ctx.config.player.radius) {
    for (const box of boxes()) {
      if (!onFloor(box, point.y)) continue;
      const cx = Math.min(box.maxX, Math.max(box.minX, point.x));
      const cz = Math.min(box.maxZ, Math.max(box.minZ, point.z));
      if ((point.x - cx) ** 2 + (point.z - cz) ** 2 < radius * radius - 1e-9) return true;
    }
    const b = ctx.world?.bounds;
    return !!b && (point.x < b.minX || point.x > b.maxX || point.z < b.minZ || point.z > b.maxZ);
  }

  // Takes the step from `from` to `to` and slides along anything solid.
  function move(from, to, radius = ctx.config.player.radius, out = new THREE.Vector3()) {
    if (ctx.world?.resolveMove) return ctx.world.resolveMove(from, to, radius, out);
    out.copy(to);
    for (let pass = 0; pass < 3; pass += 1) {
      let hit = false;
      for (const box of boxes()) {
        if (onFloor(box, from.y) && pushOut(out, box, radius)) hit = true;
      }
      if (!hit) break;
    }
    clampToBounds(out, radius);
    const y = ctx.world?.heightAt?.(out);
    if (typeof y === 'number') out.y = y;
    return out;
  }

  // Another storey: walk to the near end of a stair, cross it, carry on from the far end.
  function viaLink(from, to, radius) {
    for (const link of ctx.world?.links || []) {
      for (const [near, far] of [
        [link.a, link.b],
        [link.b, link.a],
      ]) {
        if (Math.abs(near.y - from.y) > FLOOR_GAP || Math.abs(far.y - to.y) > FLOOR_GAP) continue;
        const first = path(from, near, radius);
        const rest = path(far, to, radius);
        if (first && rest) return [...first, far.clone(), ...rest];
      }
    }
    return null;
  }

  const probe = new THREE.Vector3();
  function clear(from, to, radius = ctx.config.player.radius) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / (CELL * 0.5)));
    for (let i = 1; i <= steps; i += 1) {
      probe.lerpVectors(from, to, i / steps);
      probe.y = from.y;
      if (blocked(probe, radius)) return false;
    }
    return true;
  }

  function extent() {
    const b = ctx.world?.bounds;
    if (b) return b;
    const all = boxes();
    if (!all.length) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    return {
      minX: Math.min(...all.map((c) => c.minX)) - 1,
      maxX: Math.max(...all.map((c) => c.maxX)) + 1,
      minZ: Math.min(...all.map((c) => c.minZ)) - 1,
      maxZ: Math.max(...all.map((c) => c.maxZ)) + 1,
    };
  }

  function gridFor(y, radius) {
    const key = `${Math.round(y / FLOOR_GAP)}:${radius}`;
    if (grids.has(key)) return grids.get(key);
    const b = extent();
    const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / CELL));
    const rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / CELL));
    const solid = new Uint8Array(cols * rows);
    const p = new THREE.Vector3();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        p.set(b.minX + (c + 0.5) * CELL, y, b.minZ + (r + 0.5) * CELL);
        solid[r * cols + c] = blocked(p, radius) ? 1 : 0;
      }
    }
    const grid = { b, cols, rows, solid };
    grids.set(key, grid);
    return grid;
  }

  function nearestFree(grid, c, r) {
    if (!grid.solid[r * grid.cols + c]) return [c, r];
    for (let ring = 1; ring < 20; ring += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
          if (!grid.solid[rr * grid.cols + cc]) return [cc, rr];
        }
      }
    }
    return null;
  }

  // Waypoints from `from` to as near `to` as it can get. null when there is no way.
  function path(from, to, radius = ctx.config.player.radius) {
    if (ctx.world?.findPath) return ctx.world.findPath(from, to, radius);
    if (Math.abs(to.y - from.y) > FLOOR_GAP) return viaLink(from, to, radius);
    if (clear(from, to, radius) && !blocked(to, radius)) return [to.clone()];

    const grid = gridFor(from.y, radius);
    const { b, cols, rows, solid } = grid;
    const cell = (v) => [
      Math.min(cols - 1, Math.max(0, Math.floor((v.x - b.minX) / CELL))),
      Math.min(rows - 1, Math.max(0, Math.floor((v.z - b.minZ) / CELL))),
    ];
    const start = nearestFree(grid, ...cell(from));
    const goal = nearestFree(grid, ...cell(to));
    if (!start || !goal) return null;

    const size = cols * rows;
    const cost = new Float32Array(size).fill(Infinity);
    const parent = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const startIndex = start[1] * cols + start[0];
    const goalIndex = goal[1] * cols + goal[0];
    const open = [startIndex];
    cost[startIndex] = 0;
    const h = (i) => Math.hypot((i % cols) - goal[0], Math.floor(i / cols) - goal[1]);
    let found = false;

    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (cost[open[i]] + h(open[i]) < cost[open[best]] + h(open[best])) best = i;
      }
      const current = open.splice(best, 1)[0];
      if (current === goalIndex) {
        found = true;
        break;
      }
      if (closed[current]) continue;
      closed[current] = 1;
      const c = current % cols;
      const r = Math.floor(current / cols);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const next = rr * cols + cc;
          if (solid[next] || closed[next]) continue;
          if (dr && dc && (solid[r * cols + cc] || solid[rr * cols + c])) continue;
          const g = cost[current] + (dr && dc ? Math.SQRT2 : 1);
          if (g < cost[next]) {
            cost[next] = g;
            parent[next] = current;
            open.push(next);
          }
        }
      }
    }
    if (!found) return null;

    const points = [];
    for (let i = goalIndex; i !== -1 && i !== startIndex; i = parent[i]) {
      points.push(new THREE.Vector3(b.minX + ((i % cols) + 0.5) * CELL, from.y, b.minZ + (Math.floor(i / cols) + 0.5) * CELL));
    }
    points.reverse();
    const end = to.clone();
    end.y = from.y;
    if (points.length && !blocked(end, radius) && clear(points[points.length - 1], end, radius)) points.push(end);

    // Drop waypoints that a straight walk can skip.
    const smooth = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let far = i;
      for (let j = points.length - 1; j > i; j -= 1) {
        if (clear(anchor, points[j], radius)) {
          far = j;
          break;
        }
      }
      smooth.push(points[far]);
      anchor = points[far];
      i = far + 1;
    }
    return smooth;
  }

  return {
    move,
    blocked,
    clear,
    path,
    // Call after the world changes its colliders.
    refresh() {
      grids.clear();
    },
  };
}
