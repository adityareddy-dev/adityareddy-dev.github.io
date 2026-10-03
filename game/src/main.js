import * as THREE from 'three';
import { createBus } from './core/bus.js';
import { createSave } from './core/save.js';
import { createConfig, applyStoryConfig } from './core/config.js';
import { createState } from './core/state.js';
import { createClock } from './core/clock.js';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createCameraRig } from './core/camera.js';
import { createAssets } from './core/assets.js';
import { createCollide } from './core/collide.js';
import { createInteract } from './core/interact.js';
import { createRounds } from './core/rounds.js';
import { createMarker } from './core/marker.js';

const GAMES = ['coffee', 'gym', 'whiteboard', 'review', 'hunt'];
const $ = (id) => document.getElementById(id);

const config = createConfig();
const bus = createBus();
const save = createSave();
const state = createState({ bus, config });
const params = new URLSearchParams(window.location.search);
const ctx = {
  three: THREE,
  config,
  bus,
  state,
  save,
  data: { story: {}, content: {} },
  debug: params.has('debug'),
  autostart: params.has('autostart'),
};

// ready: everything is built and drawing. started: the visitor pressed start and the day runs.
let markReady;
let markStarted;
window.__game = {
  ctx,
  ready: new Promise((resolve) => (markReady = resolve)),
  started: new Promise((resolve) => (markStarted = resolve)),
};

// ---- loading screen --------------------------------------------------------

let lastPct = 0;
let lines = [];
let lineIndex = 0;

function progress(pct, label) {
  lastPct = Math.max(lastPct, pct);
  if (ctx.ui?.loading) {
    ctx.ui.loading.set(lastPct, label);
    return;
  }
  $('loading-bar').style.width = `${lastPct}%`;
  if (label) $('loading-text').textContent = label;
}

const lineTimer = window.setInterval(() => {
  if (!lines.length) return;
  lineIndex = (lineIndex + 1) % lines.length;
  progress(lastPct, lines[lineIndex]);
}, 1100);

function fatal(text, err) {
  if (err) console.error(err);
  window.clearInterval(lineTimer);
  if (text) $('fatal-text').textContent = text;
  $('loading').hidden = true;
  $('fatal').hidden = false;
}

// ---- boot ------------------------------------------------------------------

async function boot() {
  // Every part starts downloading now. They're still put together in order further down.
  const load = (path) => {
    const pending = import(path);
    pending.catch(() => {});
    return pending;
  };
  const parts = {
    ui: load('./ui/index.js'),
    audio: load('./audio/index.js'),
    world: load('./world/index.js'),
    player: load('./player/index.js'),
    story: load('./story/index.js'),
    games: GAMES.map((id) => load(`./games/${id}.js`)),
  };

  const canvas = $('game-canvas');
  let engine;
  try {
    engine = createEngine({ canvas, bus, state, save, config });
  } catch (err) {
    fatal("This browser won't draw 3D for me. Everything's on the plain page though.", err);
    return false;
  }

  Object.assign(ctx, { engine, scene: engine.scene, camera: engine.camera, renderer: engine.renderer });
  ctx.input = createInput({ canvas, camera: engine.camera, bus, state });
  ctx.rig = createCameraRig({ camera: engine.camera, input: ctx.input, config, bus });
  ctx.assets = createAssets({ bus });
  ctx.clock = createClock({ bus, state, config });
  ctx.collide = createCollide(ctx);
  ctx.interact = createInteract(ctx);
  ctx.rounds = createRounds(ctx);
  ctx.marker = createMarker(ctx);
  if (params.get('quality')) engine.quality.set(params.get('quality'), { remember: false });
  progress(8);

  const [story, content] = await Promise.all([
    ctx.assets.json(config.paths.story),
    ctx.assets.json(config.paths.content),
    ctx.assets.loadManifest(config.paths.manifest),
  ]);
  ctx.data.story = story || {};
  ctx.data.content = content || {};
  applyStoryConfig(config, ctx.data.story);
  state.reset();
  ctx.clock.reset();
  state.set({ muted: !!save.get('muted', false), volume: Number(save.get('volume', 0.8)) });
  lines = Array.isArray(story?.intro?.loading) ? story.intro.loading : [];
  progress(18, lines[0]);

  // The models start coming down while the phone and the sound get built.
  parts.world.then((m) => ctx.assets.preload([...(m.MODELS || []), 'character'].filter((key) => ctx.assets.has(key)))).catch(() => {});

  // The phone has to work from the first second, so the UI comes up before the heavy parts.
  ctx.ui = await (await parts.ui).createUI(ctx);
  wirePhone();
  progress(28);

  ctx.audio = await (await parts.audio).createAudio(ctx);
  wireAudio();
  progress(34);

  ctx.world = await (await parts.world).createWorld(ctx);
  ctx.collide.refresh();
  progress(72);

  ctx.player = await (await parts.player).createPlayer(ctx);
  progress(84);

  await Promise.all(
    GAMES.map(async (id, i) => {
      try {
        ctx.rounds.register((await parts.games[i]).default);
      } catch (err) {
        console.error(`Round "${id}" did not load.`, err);
      }
    }),
  );
  progress(92);

  ctx.director = await (await parts.story).createDirector(ctx);
  wireWorld();
  if (ctx.debug) wireDebug();

  // Nothing moves until the visitor starts the day. The phone works all the same.
  engine.pause('loading');
  if (engine.width < 600) ctx.rig.setZoom(12, true);
  ctx.rig.snap();
  progress(96);
  await engine.warm();
  engine.start();
  progress(100);
  window.clearInterval(lineTimer);
  state.set({ phase: 'ready' });
  bus.emit('boot:ready', {});
  markReady(true);

  await ctx.ui.loading.done();
  engine.resume('loading');
  engine.measure(true);
  await ctx.director.start();
  markStarted(true);
  return true;
}

// ---- glue ------------------------------------------------------------------

function wirePhone() {
  const { engine, ui, input } = ctx;

  bus.on('phone:open', (e) => {
    engine.pause('phone');
    state.set({ phoneOpen: true, phoneApp: e?.app || null });
  });
  bus.on('phone:app', (e) => {
    if (state.phoneOpen) state.set({ phoneApp: e?.app || null });
  });
  bus.on('phone:close', () => {
    engine.resume('phone');
    state.set({ phoneOpen: false, phoneApp: null });
  });
  bus.on('card:open', () => engine.pause('card'));
  bus.on('card:close', () => engine.resume('card'));

  input.onAction('phone', () => {
    if (engine.isPausedBy('card')) return;
    state.phoneOpen ? ui.phone.close() : ui.phone.open();
  });
  input.onAction('back', () => {
    if (state.phoneOpen) ui.phone.close();
  });
  input.onAction('mute', () => state.set({ muted: !state.muted }));
}

function wireAudio() {
  const { audio } = ctx;
  audio.setMuted(state.muted);
  audio.setVolume(state.volume);
  state.subscribe(() => {
    audio.setMuted(state.muted);
    audio.setVolume(state.volume);
    save.set('muted', state.muted);
    save.set('volume', state.volume);
  }, ['muted', 'volume']);

  // Browsers only let sound start after a real tap or key press.
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    Promise.resolve(audio.unlock()).catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function wireWorld() {
  const { engine, input, rig, clock, interact, world, player, director, ui, audio, marker } = ctx;

  rig.follow(player.object3D);
  if (world.bounds) rig.setBounds(world.bounds);
  bus.on('player:teleport', () => rig.snap());

  function clockStep(dt) {
    const held = engine.pausedBy.some((reason) => {
      if (reason === 'round') return config.clock.pauseInRounds;
      if (reason === 'phone') return config.clock.pauseInPhone;
      return true;
    });
    if (!held) clock.update(dt);
  }

  function roomStep() {
    const room = world.roomAt ? world.roomAt(player.position) || null : null;
    if (room === state.room) return;
    const from = state.room;
    state.set({ room });
    if (from) bus.emit('room:leave', { room: from, to: room });
    if (room) bus.emit('room:enter', { room, from });
    world.setCutaway?.(room);
  }

  engine.onUpdate(clockStep, { order: 0, always: true, name: 'clock' });
  engine.onUpdate((dt, paused) => director.update(dt, paused), { order: 10, always: true, name: 'director' });
  engine.onUpdate((dt) => player.update(dt), { order: 20, name: 'player' });
  engine.onUpdate((dt) => world.update(dt), { order: 30, name: 'world' });
  engine.onUpdate(roomStep, { order: 35, name: 'rooms' });
  engine.onUpdate((dt) => interact.update(dt), { order: 40, name: 'interact' });
  engine.onUpdate((dt) => rig.update(dt), { order: 50, always: true, name: 'camera' });
  if (ui.update) engine.onUpdate((dt, paused) => ui.update(dt, paused), { order: 60, always: true, name: 'ui' });
  if (audio.update) engine.onUpdate((dt, paused) => audio.update(dt, paused), { order: 61, always: true, name: 'audio' });
  engine.onUpdate(() => input.endFrame(), { order: 1000, always: true, name: 'input' });

  input.onAction('interact', () => {
    if (!engine.paused && input.enabled && interact.use()) audio.sfx('ui_tap');
  });

  // The things are small on screen, so a near miss still counts.
  const nearCaster = new THREE.Raycaster();
  const nearAim = new THREE.Vector2();
  function pickNear(ray, ndc) {
    const direct = interact.pick(ray);
    if (direct || !ndc) return direct;
    for (const reach of [14, 28]) {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        nearAim.set(ndc.x + (Math.cos(a) * reach * 2) / engine.width, ndc.y + (Math.sin(a) * reach * 2) / engine.height);
        nearCaster.setFromCamera(nearAim, ctx.camera);
        const item = interact.pick(nearCaster.ray);
        if (item) return item;
      }
    }
    return null;
  }

  bus.on('input:click', async ({ ray, ndc }) => {
    if (engine.paused) return;
    const item = pickNear(ray, ndc);
    if (item) {
      if (interact.focused !== item) {
        const arrived = await player.moveTo(interact.standPoint(item, player.position));
        if (!arrived || engine.paused) return;
      }
      if (interact.use(item.id)) audio.sfx('ui_tap');
      return;
    }
    const point = world.groundAt ? world.groundAt(ray) : input.groundPoint(player.position.y, ray);
    if (!point) return;
    marker.show(point);
    bus.emit('move:to', { point });
    player.moveTo(point);
  });

  roomStep();
  engine.quality.apply();
}

function wireDebug() {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:90;padding:4px 10px;border-radius:8px;' +
    'background:rgba(0,0,0,.6);color:#fff;font:12px/1.4 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
  document.body.append(box);
  let wait = 0;
  ctx.engine.onUpdate(
    (dt) => {
      wait -= dt;
      if (wait > 0) return;
      wait = 0.25;
      const p = ctx.player.position;
      const e = ctx.engine;
      box.textContent =
        `${e.fps.toFixed(0)} fps  ${e.quality.tier}${e.quality.auto ? ' auto' : ''}  ` +
        `${ctx.clock.format()}  ${state.room || 'nowhere'}  ` +
        `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  ${e.pausedBy.join('+') || 'running'}`;
    },
    { order: 900, always: true, name: 'debug' },
  );
}

boot()
  .then((ok) => {
    markReady(ok);
    markStarted(ok);
  })
  .catch((err) => {
    fatal("Something broke while loading. The plain page works though.", err);
    markReady(false);
    markStarted(false);
  });
