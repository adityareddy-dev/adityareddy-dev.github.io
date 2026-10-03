import { el } from '../core/dom.js';
import { createHud } from './hud.js';
import { createPhone } from './phone.js';
import { createCards } from './card.js';
import { createLoading } from './loading.js';

const MAX_TOASTS = 3;

// Everything drawn over the canvas: HUD, phone, toasts, cards and the loading screen.
export function createUI(ctx) {
  const { bus, engine } = ctx;
  const hudLayer = document.getElementById('hud-layer');
  const phoneLayer = document.getElementById('phone-layer');
  const cardLayer = document.getElementById('card-layer');
  const toastLayer = document.getElementById('toast-layer');
  const layers = [hudLayer, phoneLayer, cardLayer, toastLayer];

  const hud = createHud(ctx, hudLayer);
  const phone = createPhone(ctx, phoneLayer);
  const cards = createCards(ctx, cardLayer);
  const loading = createLoading(ctx, { openResume: () => phone.open('resume') });

  // ---- toasts -------------------------------------------------------------------

  const toastBox = el('div', { class: 'toasts' });
  toastLayer.append(toastBox);

  function dropToast(node) {
    if (node.dataset.leaving) return;
    node.dataset.leaving = '1';
    window.clearTimeout(Number(node.dataset.timer));
    node.classList.add('is-leaving');
    window.setTimeout(() => node.remove(), 240);
  }

  function toast(text, seconds = 3.5) {
    if (text === null || text === undefined || text === '') return;
    const node = el('div', { class: 'toast', onclick: () => dropToast(node) }, String(text));
    toastBox.append(node);
    const live = [...toastBox.children].filter((n) => !n.dataset.leaving);
    for (const old of live.slice(0, Math.max(0, live.length - MAX_TOASTS))) dropToast(old);
    node.dataset.timer = String(window.setTimeout(() => dropToast(node), Math.max(1, Number(seconds) || 3.5) * 1000));
  }

  // A round or a card needs its buttons, so whatever was being said makes way.
  const clearToasts = () => {
    for (const node of [...toastBox.children]) dropToast(node);
  };
  bus.on('round:start', clearToasts);
  bus.on('card:open', clearToasts);

  // ---- the HUD and the toasts make room for an open phone ---------------------------

  function paintPhone(up) {
    hudLayer.classList.toggle('phone-up', up);
    toastLayer.classList.toggle('phone-up', up);
  }
  bus.on('phone:open', () => paintPhone(true));
  bus.on('phone:close', () => paintPhone(false));

  // ---- cheaper chrome on the lowest tier ------------------------------------------

  function paintTier() {
    const lite = engine.quality?.tier === 'min';
    for (const layer of layers) layer.classList.toggle('ui-lite', lite);
  }
  bus.on('quality:change', paintTier);
  bus.on('boot:ready', () => {
    hud.refresh();
    paintTier();
  });
  paintTier();

  return {
    hud: {
      show: hud.show,
      hide: hud.hide,
      setObjective: hud.setObjective,
    },
    phone,
    toast,
    showCard: cards.show,
    loading,
    update(dt) {
      hud.update(dt);
    },
  };
}
