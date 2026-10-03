import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX_DT = 1 / 20;

// Renderer, scene, camera, main loop, pause reasons and quality scaling.
export function createEngine({ canvas, bus, state, save, config }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = config.look.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.look.background);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 120);
  camera.position.set(6, 6, 6);
  camera.lookAt(0, 0, 0);

  // Soft fill light from a generated room, so standard materials never look flat.
  let ownEnvironment = null;
  function buildEnvironment() {
    if (scene.environment && scene.environment !== ownEnvironment) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    ownEnvironment?.dispose();
    // The blur shader makes Direct3D print a harmless precision note, so don't log it.
    const check = renderer.debug.checkShaderErrors;
    renderer.debug.checkShaderErrors = false;
    ownEnvironment = pmrem.fromScene(room, 0.04).texture;
    renderer.debug.checkShaderErrors = check;
    scene.environment = ownEnvironment;
    pmrem.dispose();
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  scene.environmentIntensity = config.look.environmentIntensity;

  const projected = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let running = false;
  let last = 0;
  let time = 0;
  let realTime = 0;
  let frames = 0;
  let fps = 60;
  const reasons = new Set();
  let hooks = [];

  // ---- quality -------------------------------------------------------------

  const order = config.quality.order;
  const tiers = config.quality.tiers;
  const guess = guessTier(renderer);
  const saved = save?.get('quality', 'auto');
  const quality = {
    tier: guess.tier,
    ceiling: guess.ceiling,
    auto: true,
    gpu: guess.gpu,
    get settings() {
      return tiers[quality.tier];
    },
    set(tier, { remember = true } = {}) {
      if (!tiers[tier]) return;
      quality.auto = false;
      if (remember) save?.set('quality', tier);
      applyTier(tier);
    },
    setAuto({ remember = true } = {}) {
      quality.auto = true;
      quality.ceiling = guess.ceiling;
      if (remember) save?.set('quality', 'auto');
      resetSampling();
    },
    apply: () => applyTier(quality.tier, true),
  };
  if (saved && saved !== 'auto' && tiers[saved]) {
    quality.auto = false;
    quality.tier = saved;
  }

  let post = null;
  let postLoading = false;
  let bloom = null;
  let sampleSum = 0;
  let sampleCount = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  let settle = 1;
  let sampling = false;
  let dirty = true;
  let holding = false;
  let builds = 0;
  let pausedFor = 0;
  let sinceDraw = 0;

  function resetSampling() {
    sampleSum = 0;
    sampleCount = 0;
    slowWindows = 0;
    fastWindows = 0;
    settle = 1;
  }

  // Resolves when every shader in the scene is built. Never hangs the caller.
  function compiled(limit = 6000) {
    // Some browsers can only build them on the spot.
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) {
      try {
        renderer.compile(scene, camera);
      } catch (err) {
        console.error('Shaders did not build ahead of time.', err);
      }
      return Promise.resolve();
    }
    const giveUp = new Promise((resolve) => window.setTimeout(resolve, limit));
    return Promise.race([renderer.compileAsync(scene, camera), giveUp]).catch(() => {});
  }

  // New shaders build in the background and the last frame stays up until they're ready.
  function rebuild() {
    builds += 1;
    const mine = builds;
    holding = true;
    compiled(3000).then(() => {
      if (mine !== builds) return;
      holding = false;
      dirty = true;
    });
  }

  function applyShadows(t) {
    const flipped = renderer.shadowMap.enabled !== t.shadows;
    renderer.shadowMap.enabled = t.shadows;
    scene.traverse((o) => {
      if (o.isLight && o.shadow) {
        if (o.userData.wantsShadow === undefined) o.userData.wantsShadow = o.castShadow;
        const want = t.shadows && o.userData.wantsShadow;
        o.castShadow = want;
        if (want) {
          const size = Math.min(t.shadowSize, o.userData.shadowSizeMax || t.shadowSize);
          if (o.shadow.mapSize.x !== size) {
            o.shadow.mapSize.set(size, size);
            o.shadow.map?.dispose();
            o.shadow.map = null;
          }
        }
      }
      if (flipped && o.material) {
        for (const m of [].concat(o.material)) m.needsUpdate = true;
      }
    });
    if (flipped && running) rebuild();
  }

  function applyTier(tier, force = false) {
    const changed = tier !== quality.tier;
    quality.tier = tier;
    const t = tiers[tier];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatio));
    applyShadows(t);
    if (t.post && bloom && !post && !postLoading) loadPost();
    resize();
    resetSampling();
    dirty = true;
    if (changed || force) {
      state.set({ quality: tier });
      bus.emit('quality:change', { tier, settings: t, auto: quality.auto });
    }
  }

  async function loadPost() {
    postLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
      ]);
      const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      const composer = new EffectComposer(renderer, target);
      const pass = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.5, 1.6);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(pass);
      composer.addPass(new OutputPass());
      post = { composer, bloom: pass };
      tuneBloom();
      resize();
    } catch (err) {
      console.warn('Post effects did not load, carrying on without them.', err);
    }
    postLoading = false;
  }

  function tuneBloom() {
    if (!post || !bloom) return;
    post.bloom.strength = bloom.strength;
    post.bloom.radius = bloom.radius;
    post.bloom.threshold = bloom.threshold;
  }

  // Looks at about a second of frames at a time. A long frame counts, up to a quarter second.
  function sample(ms) {
    sampleSum += Math.min(ms, 250);
    sampleCount += 1;
    if (sampleSum < config.quality.windowMs || sampleCount < 3) return;
    const avg = sampleSum / sampleCount;
    sampleSum = 0;
    sampleCount = 0;
    fps = 1000 / avg;
    if (!sampling || !quality.auto) return;
    if (settle > 0) {
      settle -= 1;
      return;
    }
    const index = order.indexOf(quality.tier);
    if (avg > config.quality.slowFrameMs) {
      fastWindows = 0;
      slowWindows += 1;
      // A crawl goes straight to the bottom. Anything milder steps down one at a time.
      const crawl = avg > config.quality.slowFrameMs * config.quality.crawl;
      if ((crawl || slowWindows >= 2) && index > 0) {
        const to = crawl ? 0 : index - 1;
        quality.ceiling = order[to];
        applyTier(order[to]);
      }
    } else if (avg < config.quality.fastFrameMs) {
      slowWindows = 0;
      fastWindows += 1;
      if (fastWindows >= 5 && index < order.indexOf(quality.ceiling)) applyTier(order[index + 1]);
    } else {
      slowWindows = 0;
      fastWindows = 0;
    }
  }

  // ---- size ----------------------------------------------------------------

  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight || window.innerHeight));
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (post) {
      post.composer.setPixelRatio(renderer.getPixelRatio());
      post.composer.setSize(w, h);
    }
    dirty = true;
    bus.emit('engine:resize', { width: w, height: h, pixelRatio: renderer.getPixelRatio() });
  }

  let resizeQueued = false;
  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  }
  window.addEventListener('resize', queueResize);
  if (window.ResizeObserver) new ResizeObserver(queueResize).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    bus.emit(document.hidden ? 'app:hidden' : 'app:visible', {});
    resetSampling();
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    bus.emit('engine:contextlost', {});
  });
  // The generated room light lives on the GPU, so it has to be made again.
  canvas.addEventListener('webglcontextrestored', () => {
    buildEnvironment();
    applyTier(quality.tier, true);
    bus.emit('engine:contextrestored', {});
  });

  // ---- loop ----------------------------------------------------------------

  function render() {
    dirty = false;
    sinceDraw = 0;
    if (post && bloom && quality.settings.post) post.composer.render();
    else renderer.render(scene, camera);
  }

  function frame(now) {
    const raw = last ? Math.min(1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (holding) return;
    const dt = Math.min(raw, MAX_DT);
    const paused = reasons.size > 0;
    if (!paused) sample(raw * 1000);
    if (holding) return;
    frames += 1;
    realTime += dt;
    if (!paused) time += dt;
    for (const hook of hooks) {
      if (paused && !hook.always) continue;
      try {
        hook.fn(dt, paused);
      } catch (err) {
        hook.errors = (hook.errors || 0) + 1;
        if (hook.errors <= 3) console.error(`update hook "${hook.name}" threw`, err);
      }
    }
    if (!paused) {
      pausedFor = 0;
      render();
      return;
    }
    // Behind a round, the phone or a card the house stands still, so it only gets drawn now and then.
    pausedFor += raw;
    sinceDraw += raw;
    if (dirty || pausedFor < config.quality.pausedGrace || sinceDraw >= 1 / config.quality.pausedFps) render();
  }

  function setPaused() {
    const paused = reasons.size > 0;
    if (state.paused !== paused) state.set({ paused });
  }

  const engine = {
    three: THREE,
    renderer,
    scene,
    camera,
    canvas,
    quality,
    get post() {
      return post;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get time() {
      return time;
    },
    get realTime() {
      return realTime;
    },
    get frames() {
      return frames;
    },
    get fps() {
      return fps;
    },
    get running() {
      return running;
    },
    get paused() {
      return reasons.size > 0;
    },
    get pausedBy() {
      return [...reasons];
    },

    start() {
      if (running) return;
      running = true;
      last = 0;
      applyTier(quality.tier, true);
      renderer.setAnimationLoop(frame);
    },
    stop() {
      running = false;
      renderer.setAnimationLoop(null);
    },
    // The room light and every shader, built before the first frame so that frame doesn't freeze the page.
    async warm() {
      await new Promise((resolve) => {
        const timer = window.setTimeout(resolve, 150);
        requestAnimationFrame(() => {
          window.clearTimeout(timer);
          resolve();
        });
      });
      buildEnvironment();
      await compiled();
      render();
    },
    // Asks for a fresh frame while the world is paused.
    redraw() {
      dirty = true;
    },
    // Auto scaling only measures once the game is really running.
    measure(on = true) {
      sampling = on;
      resetSampling();
    },

    // fn(dt, paused). Lower order runs first. always: true keeps running while paused.
    onUpdate(fn, { order = 0, always = false, name = fn.name || 'anonymous' } = {}) {
      const hook = { fn, order, always, name };
      hooks = [...hooks, hook].sort((a, b) => a.order - b.order);
      return () => {
        hooks = hooks.filter((h) => h !== hook);
      };
    },

    pause(reason = 'manual') {
      const was = reasons.size > 0;
      reasons.add(reason);
      setPaused();
      if (!was) bus.emit('engine:pause', { reason, reasons: [...reasons] });
    },
    resume(reason = 'manual') {
      if (!reasons.delete(reason)) return;
      setPaused();
      if (reasons.size === 0) bus.emit('engine:resume', { reason });
    },
    isPausedBy: (reason) => reasons.has(reason),

    resize,
    render,

    // Glow for very bright things, on the top tier only. Pass false to turn it off.
    setBloom(options = {}) {
      bloom = options === false ? null : { strength: 0.2, radius: 0.5, threshold: 1.6, ...options };
      tuneBloom();
      dirty = true;
      if (bloom && quality.settings.post && !post && !postLoading) loadPost();
    },
    get bloom() {
      return bloom;
    },

    // World position to CSS pixels on the canvas.
    worldToScreen(position, out = {}) {
      projected.copy(position).project(camera);
      out.x = (projected.x * 0.5 + 0.5) * width;
      out.y = (-projected.y * 0.5 + 0.5) * height;
      out.visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
      return out;
    },
  };

  resize();
  return engine;
}

function guessTier(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    gpu = '';
  }
  const name = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(name)) return { tier: 'min', ceiling: 'low', gpu };
  const phone = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const integrated = /intel|adreno|mali|powervr/.test(name) && !/\barc\b/.test(name);
  if (phone || weak || integrated) return { tier: 'medium', ceiling: 'high', gpu };
  return { tier: 'high', ceiling: 'high', gpu };
}
