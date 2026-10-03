const HOODIE = ['#4a7fe6', '#2f58b8'];
const JEANS = ['#474b5c', '#2e3140'];
const SHOES = ['#fbf7f0', '#d9d3c7'];
const SKIN = ['#b98158', '#94603d'];
const FADE = 0.18;

// The rigged model when the file is there, a box figure when it isn't.
export async function createBody(ctx) {
  const key = ctx.assets.manifest?.character || 'character';
  const model = ctx.assets.has(key) ? await ctx.assets.model(key, { fallback: false }) : null;
  if (model) {
    try {
      return riggedBody(ctx, model);
    } catch (err) {
      console.warn('Character model unusable, using the simple one', err?.message || err);
    }
  }
  return simpleBody(ctx);
}

function riggedBody(ctx, model) {
  const { three: THREE } = ctx;
  const root = new THREE.Group();
  root.add(model);

  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const height = size.y > 0.2 && size.y < 3 ? size.y : ctx.config.player.height;

  dress(THREE, model);
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });

  const head = model.getObjectByName('head');
  const headLift = height * 0.24;

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map((model.animations || []).map((clip) => [clip.name, clip]));
  const actions = new Map();
  let current = null;
  let finished = null;

  mixer.addEventListener('finished', (e) => {
    if (e.action === current) finished?.(e.action.getClip().name);
  });

  function action(name) {
    if (!actions.has(name)) actions.set(name, mixer.clipAction(clips.get(name)));
    return actions.get(name);
  }

  function play(name, { once = false } = {}) {
    if (!clips.has(name)) return false;
    const next = action(name);
    next.enabled = true;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = 1;
    next.reset().play();
    if (current && current !== next) next.crossFadeFrom(current, FADE, false);
    current = next;
    return true;
  }

  play('idle');

  return {
    root,
    height,
    rigged: true,
    has: (name) => clips.has(name),
    play,
    // pace is walking speed over full speed, it keeps the feet from sliding.
    update(dt, pace = 1) {
      if (current && current.getClip().name === 'walk') current.timeScale = Math.max(0.55, Math.min(1.5, pace * 1.15));
      mixer.update(dt);
    },
    headCentre(out) {
      if (!head) return root.getWorldPosition(out).setY(out.y + height * 0.8);
      return head.localToWorld(out.set(0, headLift, 0));
    },
    set onFinished(fn) {
      finished = fn;
    },
  };
}

// Repaints the palette so he's in a hoodie, jeans and white trainers, on his own copy of the texture.
function dress(THREE, model) {
  const meshes = [];
  model.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  const source = meshes[0]?.material?.map;
  const image = source?.image;
  if (!image || !image.width) return;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d');
  g.drawImage(image, 0, 0);
  const cw = canvas.width / 16;
  const ch = canvas.height / 4;

  const strip = (col, row, colours) => {
    const grad = g.createLinearGradient(0, row * ch, 0, (row + 1) * ch);
    grad.addColorStop(0, colours[0]);
    grad.addColorStop(1, colours[1]);
    g.fillStyle = grad;
    g.fillRect(col * cw, row * ch, cw, ch);
  };
  strip(3, 2, HOODIE);
  strip(11, 2, JEANS);
  strip(5, 2, SHOES);
  strip(13, 3, SKIN);
  strip(12, 3, SKIN);
  strip(11, 3, [HOODIE[1], HOODIE[1]]);

  const map = source.clone();
  map.source = new THREE.TextureSource(canvas);
  map.needsUpdate = true;
  const material = meshes[0].material.clone();
  material.map = map;
  for (const mesh of meshes) mesh.material = material;

  // Bare arms become sleeves and bare legs become jeans.
  const body = meshes.find((m) => m.name === 'body-mesh') || meshes[0];
  const geometry = body.geometry.clone();
  const uv = geometry.getAttribute('uv');
  const joints = geometry.getAttribute('skinIndex');
  const weights = geometry.getAttribute('skinWeight');
  if (!uv || !joints || !weights) return;
  const bones = body.skeleton.bones;
  for (let i = 0; i < uv.count; i += 1) {
    if (Math.floor(uv.getX(i) * 16) !== 13) continue;
    let best = 0;
    for (let k = 1; k < 4; k += 1) {
      if (weights.getComponent(i, k) > weights.getComponent(i, best)) best = k;
    }
    const bone = bones[joints.getComponent(i, best)]?.name || '';
    const col = bone.startsWith('arm') ? 3 : bone.startsWith('leg') ? 11 : -1;
    if (col < 0) continue;
    uv.setXY(i, (col + 0.5) / 16, Math.max(0.52, Math.min(0.73, uv.getY(i) - 0.25)));
  }
  uv.needsUpdate = true;
  body.geometry = geometry;
}

// Head, hair, hoodie, arms and legs out of boxes. Limbs swing from the shoulder and the hip.
function simpleBody(ctx) {
  const { three: THREE } = ctx;
  const height = ctx.config.player.height;
  const u = height / 0.67;
  const root = new THREE.Group();
  const figure = new THREE.Group();
  figure.scale.setScalar(u);
  root.add(figure);

  const paint = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const skin = paint(0x9a6240);
  const hair = paint(0x1e1a18);
  const hoodie = paint(0x3f6fd8);
  const jeans = paint(0x3a3d4a);
  const shoe = paint(0xf2efe8);

  function box(parent, material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function limb(x, y, material, length, end, endDepth) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    figure.add(pivot);
    box(pivot, material, 0.075, length, 0.08, 0, -length / 2, 0);
    box(pivot, end, 0.08, 0.045, endDepth, 0, -length - 0.02, (endDepth - 0.08) / 2);
    return pivot;
  }

  const torso = box(figure, hoodie, 0.23, 0.2, 0.15, 0, 0.29, 0);
  box(figure, hoodie, 0.17, 0.06, 0.07, 0, 0.385, -0.085);
  box(figure, hoodie, 0.13, 0.05, 0.02, 0, 0.24, 0.078);
  const head = new THREE.Group();
  head.position.set(0, 0.41, 0);
  figure.add(head);
  box(head, skin, 0.25, 0.21, 0.23, 0, 0.105, 0);
  box(head, hair, 0.27, 0.08, 0.25, 0, 0.22, -0.005);
  box(head, hair, 0.27, 0.14, 0.06, 0, 0.14, -0.1);
  box(head, hair, 0.03, 0.02, 0.01, -0.06, 0.12, 0.116);
  box(head, hair, 0.03, 0.02, 0.01, 0.06, 0.12, 0.116);
  const armL = limb(0.155, 0.385, hoodie, 0.17, skin, 0.08);
  const armR = limb(-0.155, 0.385, hoodie, 0.17, skin, 0.08);
  const legL = limb(0.06, 0.2, jeans, 0.155, shoe, 0.12);
  const legR = limb(-0.06, 0.2, jeans, 0.155, shoe, 0.12);

  const known = new Set(['idle', 'walk', 'sit', 'static', 'emote-yes', 'emote-no', 'interact-right']);
  let name = 'idle';
  let once = 0;
  let phase = 0;
  let swing = 0;
  let seated = 0;
  let finished = null;

  return {
    root,
    height,
    rigged: false,
    has: (clip) => known.has(clip),
    play(clip, opts = {}) {
      if (!known.has(clip)) return false;
      name = clip;
      once = opts.once ? 0.7 : 0;
      return true;
    },
    update(dt, pace = 1) {
      const walking = name === 'walk';
      phase += dt * (walking ? 11 * Math.max(0.55, pace) : 2.2);
      swing += ((walking ? 0.75 : 0) - swing) * Math.min(1, dt * 12);
      seated += ((name === 'sit' ? 1 : 0) - seated) * Math.min(1, dt * 10);
      const s = Math.sin(phase) * swing;
      legL.rotation.x = s - seated * 1.5;
      legR.rotation.x = -s - seated * 1.5;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      figure.position.y = Math.abs(Math.sin(phase)) * 0.014 * swing * u - seated * 0.13 * u;
      torso.scale.y = 1 + (name === 'static' ? 0 : Math.sin(phase) * 0.012 * (1 - swing));
      head.rotation.set(0, 0, 0);
      if (once > 0) {
        const t = (0.7 - once) / 0.7;
        if (name === 'emote-yes') head.rotation.x = Math.sin(t * Math.PI * 4) * 0.3;
        if (name === 'emote-no') head.rotation.y = Math.sin(t * Math.PI * 4) * 0.45;
        if (name === 'interact-right') armR.rotation.x = -Math.sin(t * Math.PI) * 1.4;
        once -= dt;
        if (once <= 0) finished?.(name);
      }
    },
    headCentre(out) {
      return head.localToWorld(out.set(0, 0.11, 0));
    },
    set onFinished(fn) {
      finished = fn;
    },
  };
}
