import { createBody } from './body.js';
import { createEmotes, EMOTES } from './emotes.js';
import { createBubble } from './bubble.js';

const ALIAS = { wave: 'emote-yes', yes: 'emote-yes', no: 'emote-no', use: 'interact-right', stand: 'idle' };
const ONE_SHOT = /^(emote-|interact-|pick-up|jump|attack-)/;
const TIRED_PACE = 0.72;
const ACCEL = 14;
const STRIDE = 0.34;
const POSED = new Set(['sit', 'lie', 'sprint']);

export async function createPlayer(ctx) {
  const { three: THREE, scene, input, bus, config, collide, state, engine } = ctx;
  const c = config.player;

  const object3D = new THREE.Group();
  object3D.name = 'player';
  const pivot = new THREE.Group();
  object3D.add(pivot);
  const body = await createBody(ctx);
  pivot.add(body.root);
  scene.add(object3D);

  const blob = makeBlob(THREE, c.radius);
  object3D.add(blob);
  const emotes = createEmotes(ctx);

  const headPoint = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  function headAnchor() {
    object3D.updateWorldMatrix(true, true);
    body.headCentre(headPoint);
    return anchor.copy(headPoint).setY(headPoint.y + body.height * 0.27);
  }
  const sayPoint = new THREE.Vector3();
  const bubble = createBubble(ctx, () => sayPoint.copy(headAnchor()).setY(anchor.y + (emotes.active ? body.height * 0.66 : 0.04)));

  const spawn = ctx.world?.spawns?.start;
  if (spawn) {
    object3D.position.copy(spawn.position);
    object3D.rotation.y = spawn.facing || 0;
  }

  const wish = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const next = new THREE.Vector3();
  const fixed = new THREE.Vector3();
  let path = [];
  let settle = null;
  let stuck = 0;
  let stride = 0;
  let control = true;
  let anim = 'idle';
  let lie = 0;
  let seat = null;
  let moodIn = 6;

  const lowEnergy = () => state.energy < (config.meters.energy.lowAt ?? 30);
  const annoyed = () => state.irritation >= (config.meters.irritation.highAt ?? 70);

  function endWalk(arrived) {
    path = [];
    stuck = 0;
    const done = settle;
    settle = null;
    done?.(arrived);
  }

  function face(dx, dz, dt) {
    let diff = Math.atan2(dx, dz) - object3D.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    object3D.rotation.y += diff * (1 - Math.exp(-c.turnSpeed * dt));
  }

  function step(dx, dz, distance, dt) {
    const from = object3D.position;
    next.set(from.x + dx * distance, from.y, from.z + dz * distance);
    collide.move(from, next, c.radius, fixed);
    const moved = Math.hypot(fixed.x - from.x, fixed.z - from.z);
    from.copy(fixed);
    face(dx, dz, dt);
    stride += moved;
    if (stride > STRIDE) {
      stride = 0;
      ctx.audio?.sfx('step');
    }
    return moved;
  }

  // With no floor height from the world, ease toward the height of the next waypoint.
  function climb(target, left, moved) {
    if (ctx.world?.heightAt || left <= 0) return;
    object3D.position.y += (target.y - object3D.position.y) * Math.min(1, moved / left);
  }

  function getUp() {
    if (!POSED.has(anim)) return;
    if (seat) {
      const back = seat;
      seat = null;
      if (!collide.blocked(back, c.radius)) object3D.position.copy(back);
      else object3D.position.y = back.y;
    }
    setAnim('idle');
  }

  function update(dt) {
    const top = c.speed * (lowEnergy() ? TIRED_PACE : 1);
    const ease = 1 - Math.exp(-ACCEL * dt);
    let walking = false;
    let pace = 0;
    input.moveVector(wish);
    const push = wish.length();

    if (control && push > 0.01) {
      getUp();
      if (settle || path.length) endWalk(false);
      const want = top * Math.min(1, push);
      vel.x += ((wish.x / push) * want - vel.x) * ease;
      vel.z += ((wish.z / push) * want - vel.z) * ease;
      const speed = Math.hypot(vel.x, vel.z);
      if (speed > 0.01) step(vel.x / speed, vel.z / speed, speed * dt, dt);
      pace = speed / c.speed;
      walking = true;
    } else if (path.length) {
      const target = path[0];
      const dx = target.x - object3D.position.x;
      const dz = target.z - object3D.position.z;
      const left = Math.hypot(dx, dz);
      if (left <= c.arriveDistance) {
        if (!ctx.world?.heightAt) object3D.position.y = target.y;
        path.shift();
        if (!path.length) {
          vel.set(0, 0, 0);
          endWalk(true);
        } else walking = true;
        pace = Math.hypot(vel.x, vel.z) / c.speed;
      } else {
        // Ease off over the last stretch so he doesn't stop dead.
        const cap = path.length === 1 ? top * Math.max(0.4, Math.min(1, left / 0.3)) : top;
        const speed = Math.hypot(vel.x, vel.z) + (cap - Math.hypot(vel.x, vel.z)) * ease;
        const want = Math.min(left, speed * dt);
        const moved = step(dx / left, dz / left, want, dt);
        vel.set((dx / left) * speed, 0, (dz / left) * speed);
        climb(target, left, moved);
        stuck = moved < want * 0.2 ? stuck + dt : 0;
        if (stuck > 0.5) {
          vel.set(0, 0, 0);
          endWalk(false);
        }
        pace = speed / c.speed;
        walking = true;
      }
    } else if (vel.x || vel.z) {
      // Keys let go: coast to a stop over a few frames.
      vel.multiplyScalar(Math.exp(-ACCEL * 1.4 * dt));
      const speed = Math.hypot(vel.x, vel.z);
      if (speed < 0.12) vel.set(0, 0, 0);
      else {
        step(vel.x / speed, vel.z / speed, speed * dt, dt);
        pace = speed / c.speed;
        walking = true;
      }
    }

    if (walking) setAnim('walk');
    else if (anim === 'walk') setAnim('idle');

    const lying = anim === 'lie' ? 1 : 0;
    lie += (lying - lie) * (1 - Math.exp(-12 * dt));
    if (Math.abs(lying - lie) < 0.002) lie = lying;
    pivot.rotation.x = (-Math.PI / 2) * lie;
    pivot.position.set(0, body.height * 0.26 * lie, body.height * 0.5 * lie);

    body.update(dt, pace);
    blob.visible = blob.userData.wanted && lie < 0.5 && !seat;

    moodIn -= dt;
    if (moodIn <= 0) {
      moodIn = 9 + Math.random() * 6;
      if (!emotes.active && anim !== 'lie') {
        const tired = lowEnergy();
        if (annoyed() && (!tired || Math.random() < 0.5)) api.emote('scribble', 2.2);
        else if (tired) api.emote('zzz', 2.2);
      }
    }
    emotes.update(dt, emotes.active ? headAnchor() : anchor, object3D.visible);
  }

  // Walks to a point on the floor. Resolves true on arrival, false if it gets cut short.
  function moveTo(point) {
    if (settle || path.length) endWalk(false);
    getUp();
    const to = new THREE.Vector3(point.x, point.y ?? object3D.position.y, point.z);
    const route = collide.path(object3D.position, to, c.radius);
    if (!route || !route.length) return Promise.resolve(false);
    path = route;
    return new Promise((resolve) => {
      settle = resolve;
    });
  }

  function setAnim(name) {
    let want = ALIAS[name] || name || 'idle';
    if (want !== 'lie' && !body.has(want)) want = 'idle';
    const once = ONE_SHOT.test(want);
    if (want === anim && !once) return;
    const clip = want === 'lie' ? (body.has('static') ? 'static' : 'idle') : want;
    body.play(clip, { once });
    if (want === anim) return;
    anim = want;
    bus.emit('player:anim', { name: want });
  }

  body.onFinished = (clip) => {
    if (anim === clip) setAnim('idle');
  };

  // Sits or lies at a spot and remembers where to stand up again.
  function settleAt(point, facing, pose) {
    if (settle || path.length) endWalk(false);
    vel.set(0, 0, 0);
    if (!seat) seat = object3D.position.clone();
    const far = object3D.position.distanceTo(point) > 1.5;
    object3D.position.copy(point);
    if (typeof facing === 'number') object3D.rotation.y = facing;
    setAnim(pose);
    if (far) bus.emit('player:teleport', { position: object3D.position });
  }

  // Tired and annoyed show up on their own. Story emotes come from the director.
  bus.on('meter:low', ({ meter }) => meter === 'energy' && api.emote('zzz'));
  bus.on('meter:high', () => api.emote('scribble'));

  const setBlob = () => {
    blob.userData.wanted = !engine.quality?.settings?.shadows;
  };
  bus.on('quality:change', setBlob);
  setBlob();

  const api = {
    object3D,
    update,
    moveTo,
    setAnim,
    height: body.height,
    emotes: EMOTES,
    get position() {
      return object3D.position;
    },
    get facing() {
      return object3D.rotation.y;
    },
    get anim() {
      return anim;
    },
    get moving() {
      return anim === 'walk';
    },
    get currentEmote() {
      return emotes.name;
    },
    // A world point just over the head, for anything that wants to pin to him.
    headPosition(out = new THREE.Vector3()) {
      return out.copy(headAnchor());
    },
    stop() {
      if (settle || path.length) endWalk(false);
      vel.set(0, 0, 0);
    },
    teleport(point, facing) {
      if (settle || path.length) endWalk(false);
      vel.set(0, 0, 0);
      seat = null;
      if (anim !== 'idle') setAnim('idle');
      object3D.position.copy(point);
      if (typeof facing === 'number') object3D.rotation.y = facing;
      bus.emit('player:teleport', { position: object3D.position });
    },
    setControl(on) {
      control = !!on;
    },
    emote(name, seconds = 2.5) {
      if (!name || name === 'none') {
        emotes.clear();
        return;
      }
      emotes.show(name, seconds);
      emotes.update(0, headAnchor(), object3D.visible);
      bus.emit('player:emote', { name });
    },
    // A speech bubble over his head. The promise resolves when it goes away.
    say(text, seconds) {
      return bubble.show(text, seconds);
    },
    // The point is where his feet go, so pass the seat height as y.
    sitAt(point, facing) {
      settleAt(point, facing, 'sit');
    },
    // He lies on his back, centred on the point, feet toward `facing`.
    lieAt(point, facing) {
      settleAt(point, facing, 'lie');
    },
    // Runs on the spot, for the treadmill.
    runAt(point, facing) {
      settleAt(point, facing, 'sprint');
    },
    stand() {
      getUp();
    },
  };
  return api;
}

// A soft dark disc under the feet for when real shadows are off.
function makeBlob(THREE, radius) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.9, 24),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  blob.renderOrder = 1;
  blob.name = 'player-blob';
  return blob;
}
