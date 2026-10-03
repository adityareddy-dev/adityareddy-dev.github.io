import { el, loadCSS } from '../core/dom.js';

const EDGE_X = 150;
const EDGE_TOP = 120;
const EDGE_BOTTOM = 150;
const MARKER_SIZE = 0.42;
const NEAR = 0.75;

// A fat amber arrow pointing down, drawn once.
function drawMarker(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 148;
  const g = canvas.getContext('2d');
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(64, 138);
  g.lineTo(14, 74);
  g.lineTo(44, 74);
  g.lineTo(44, 14);
  g.lineTo(84, 14);
  g.lineTo(84, 74);
  g.lineTo(114, 74);
  g.closePath();
  g.lineWidth = 18;
  g.strokeStyle = '#1b171f';
  g.stroke();
  g.fillStyle = '#ffb463';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#fff1dc';
  g.stroke();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Shows where to go: a marker over the thing, an arrow when it's off screen, a skip button and the first hints.
export function createGuide(ctx, { onSkip } = {}) {
  const { three: THREE, engine, interact, scene } = ctx;
  const story = ctx.data.story || {};
  loadCSS('./story.css', import.meta.url);

  // ---- the marker ---------------------------------------------------------------

  const gem = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: drawMarker(THREE), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
  );
  gem.center.set(0.5, 0);
  gem.renderOrder = 60;
  gem.name = 'story-marker';
  gem.visible = false;
  gem.castShadow = false;
  scene.add(gem);

  const box = new THREE.Box3();
  const spot = new THREE.Vector3();
  const screen = {};
  let target = null;
  let pulse = 0;

  // The two ends of the stairs, so a thing on the other floor points there first.
  function stairEnds() {
    const points = (ctx.world?.links || []).flatMap((link) => [link.a, link.b]).filter(Boolean);
    if (!points.length) return null;
    const sorted = [...points].sort((a, b) => a.y - b.y);
    return { bottom: sorted[0], top: sorted[sorted.length - 1] };
  }

  function setTarget(id) {
    const item = id ? interact.get(id) : null;
    if (!item) {
      target = null;
      return;
    }
    const at = interact.positionOf(item);
    let top = at.y + 0.8;
    if (item.object) {
      box.setFromObject(item.object);
      if (Number.isFinite(box.max.y) && box.max.y > at.y) top = box.max.y;
    }
    target = { id, label: item.label || '', floor: at.y, point: new THREE.Vector3(at.x, top, at.z) };
  }

  // ---- the arrow at the edge of the screen ------------------------------------------

  const pointerLabel = el('span', { class: 'story-pointer-label' });
  const pointerArrow = el('i', { class: 'story-pointer-arrow', 'aria-hidden': 'true' });
  const pointer = el('div', { class: 'story-pointer', hidden: true, 'aria-hidden': 'true' }, pointerArrow, pointerLabel);
  // Clicking it walks him there, or to the stairs if it's on the other floor.
  let via = null;
  pointer.addEventListener('click', () => {
    const item = target ? interact.get(target.id) : null;
    if (!item || !ctx.player || ctx.state.paused) return;
    ctx.player.moveTo(via || interact.standPoint(item, ctx.player.position));
  });
  const hudLayer = document.getElementById('hud-layer') || document.body;
  hudLayer.append(pointer);

  // The arrow stays off the clock, the meters and the score.
  const blocks = [];
  let dock = null;
  let measured = -1;
  function measure() {
    measured = pulse;
    blocks.length = 0;
    const phoneButton = document.querySelector('.phone-button');
    const d = phoneButton ? phoneButton.getBoundingClientRect() : null;
    dock = d && d.width && d.height ? d : null;
    for (const corner of hudLayer.querySelectorAll('.hud-tl, .hud-tr')) {
      const r = corner.getBoundingClientRect();
      if (r.width && r.height) blocks.push(r);
    }
  }

  // ---- skip -------------------------------------------------------------------------

  const skips = story.skips || {};
  const skipButton = el(
    'button',
    {
      class: 'story-skip',
      type: 'button',
      hidden: true,
      title: skips.title || 'Skip this part',
      onclick: () => {
        skipButton.blur();
        onSkip?.();
      },
    },
    skips.label || 'Skip',
  );
  const goal = hudLayer.querySelector('.hud-goal');
  if (goal) goal.append(skipButton);
  else hudLayer.append(skipButton);
  ctx.input?.onAction?.('skip', () => {
    if (skipButton.hidden || ctx.state.paused || ctx.state.phoneOpen) return;
    onSkip?.();
  });

  // ---- first hints ------------------------------------------------------------------

  const coachText = el('span');
  const coach = el('p', { class: 'story-coach', hidden: true, role: 'status' }, coachText);
  hudLayer.append(coach);
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const copy = story.intro?.coach || {};
  let coachKey = null;
  let coachTimer = 0;

  // On a narrow screen the hint goes under the objective, off the meters.
  const narrow = window.matchMedia?.('(max-width: 760px)');
  function placeCoach() {
    const line = narrow?.matches ? hudLayer.querySelector('.hud-tc') : null;
    const r = line ? line.getBoundingClientRect() : null;
    coach.style.top = r && r.height ? `${Math.round(r.bottom + 8)}px` : '';
  }
  window.addEventListener('resize', placeCoach);

  function showCoach(key) {
    const text = (touch && copy[`${key}Touch`]) || copy[key];
    if (!text || coachKey === key) return;
    coachKey = key;
    coachText.textContent = text;
    window.clearTimeout(coachTimer);
    placeCoach();
    window.requestAnimationFrame(placeCoach);
    coach.hidden = false;
    coach.classList.remove('is-in');
    void coach.offsetWidth;
    coach.classList.add('is-in');
  }

  function hideCoach(key) {
    if (key && key !== coachKey) return;
    coachKey = null;
    coach.classList.remove('is-in');
    window.clearTimeout(coachTimer);
    coachTimer = window.setTimeout(() => {
      if (!coachKey) coach.hidden = true;
    }, 260);
  }

  // ---- every frame ------------------------------------------------------------------

  function update(dt, paused) {
    const playing = ctx.state.phase === 'playing';
    if (!target || !playing) {
      gem.visible = false;
      pointer.hidden = true;
      return;
    }
    pulse += dt;
    const player = ctx.player?.position;
    const down = ctx.world?.storey ? ctx.world.storey === 'down' : !!player && player.y < -0.5;
    const wantDown = target.floor < -0.5;
    spot.copy(target.point);
    via = null;
    if (down !== wantDown) {
      const ends = stairEnds();
      if (ends) {
        // At the near end of the stairs it points at the far end instead.
        via = down ? ends.bottom : ends.top;
        const far = down ? ends.top : ends.bottom;
        const there = !!player && Math.hypot(player.x - via.x, player.z - via.z) < NEAR;
        if (there) via = far;
        spot.copy(via).setY(via.y + 0.55);
      }
    }
    // Standing next to it, he doesn't need the arrow on his head.
    if (player && Math.hypot(player.x - spot.x, player.z - spot.z) < NEAR) {
      gem.visible = false;
      pointer.hidden = true;
      return;
    }
    gem.visible = true;
    gem.position.set(spot.x, spot.y + 0.14 + Math.abs(Math.sin(pulse * 2.6)) * 0.12, spot.z);
    const size = MARKER_SIZE * (1 + Math.sin(pulse * 5.2) * 0.04);
    gem.scale.set(size, size * 1.15, 1);

    if (paused) {
      pointer.hidden = true;
      return;
    }
    engine.worldToScreen(gem.position, screen);
    const w = engine.width;
    const h = engine.height;
    const mx = Math.min(EDGE_X, w * 0.22);
    const inside = screen.x > 24 && screen.x < w - 24 && screen.y > 70 && screen.y < h - 40;
    if (inside) {
      pointer.hidden = true;
      return;
    }
    let x = Math.min(w - mx, Math.max(mx, screen.x));
    let y = Math.min(h - EDGE_BOTTOM, Math.max(EDGE_TOP, screen.y));
    if (pulse - measured > 0.5) measure();
    if (dock && y > dock.top - 70 && x > dock.left - 110) x = Math.max(mx, dock.left - 110);
    for (const r of blocks) {
      if (x > r.left - 44 && x < r.right + 44 && y < r.bottom + 30) y = Math.min(h - EDGE_BOTTOM, r.bottom + 34);
    }
    const angle = Math.atan2(screen.y - y, screen.x - x);
    pointer.hidden = false;
    pointer.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    pointerArrow.style.transform = `rotate(${angle.toFixed(3)}rad)`;
    if (pointerLabel.textContent !== target.label) pointerLabel.textContent = target.label;
  }

  return {
    update,
    setTarget,
    get target() {
      return target ? target.id : null;
    },
    setSkip(on) {
      skipButton.hidden = !on;
    },
    coach: showCoach,
    hideCoach,
    reset() {
      target = null;
      gem.visible = false;
      pointer.hidden = true;
      skipButton.hidden = true;
      hideCoach();
    },
  };
}
