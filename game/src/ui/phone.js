import { el } from '../core/dom.js';
import { icon } from './icons.js';
import { APPS, renderApp } from './apps.js';
import { clamp, swipeable, tileColour, trapTab } from './util.js';

const BANNER_MS = 6000;
const MAX_BANNERS = 4;
const MAX_STACK = 30;

// The phone, its apps, the little phone in the corner and every notification.
export function createPhone(ctx, layer) {
  const { bus, state, clock } = ctx;
  const story = ctx.data.story || {};
  const sfx = (name) => ctx.audio?.sfx?.(name);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dndLabel = story.storm?.dnd?.label || 'Do not disturb';
  const hint = story.intro?.phoneHint || 'Phone (P)';
  const idleLine = story.intro?.tips?.[1] || '';

  let isOpen = false;
  let current = null;
  let appSync = null;
  let lastFocus = null;
  let unlockTimer = 0;

  // ---- the device ---------------------------------------------------------------

  const statusTime = el('span', { class: 'phone-status-time' });
  const statusDnd = el('span', { class: 'status-ico', hidden: true, title: dndLabel }, icon('moon', 13));
  const statusMute = el('span', { class: 'status-ico', hidden: true, title: 'Muted' }, icon('speakerOff', 13));
  const batteryFill = el('i');
  const statusBar = el(
    'div',
    { class: 'phone-status' },
    statusTime,
    el('span', { class: 'phone-island', 'aria-hidden': 'true' }),
    el(
      'span',
      { class: 'phone-status-right' },
      statusDnd,
      statusMute,
      el('span', { class: 'status-signal', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i')),
      el('span', { class: 'status-battery', title: 'Energy' }, batteryFill),
    ),
  );

  const homeTime = el('strong', { class: 'home-time' });
  const homeSub = el('span', { class: 'home-sub' });
  // An app with nothing in it stays off the home screen. Things in the house can still open it.
  const stocked = (app) => !app.needs || (ctx.data?.content?.[app.needs] || []).length > 0;
  const appButtons = APPS.filter(stocked).map((app) =>
    el(
      'button',
      {
        class: `app-icon app-${app.id}`,
        type: 'button',
        dataset: { app: app.id },
        onclick: () => {
          sfx('ui_tap');
          phone.open(app.id);
        },
      },
      el('span', { class: 'app-tile' }, icon(app.icon, 27)),
      el('span', { class: 'app-name' }, app.name),
    ),
  );
  const quickDnd = el(
    'button',
    {
      class: 'quick quick-dnd',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        sfx('ui_tap');
        phone.setDnd(!state.dnd);
      },
    },
    icon('moon', 17),
    el('span', {}, dndLabel),
  );
  const quickMuteIcon = el('span', { class: 'quick-ico' });
  const quickMuteText = el('span');
  const quickMute = el(
    'button',
    {
      class: 'quick quick-mute',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        state.set({ muted: !state.muted });
        sfx('ui_tap');
      },
    },
    quickMuteIcon,
    quickMuteText,
  );
  const stackList = el('ul', { class: 'stack-list' });
  const stackEmpty = el('p', { class: 'stack-empty' }, 'No notifications. Enjoy it while it lasts.');
  const stackCount = el('span', { class: 'stack-count' });
  const clearButton = el('button', { class: 'stack-clear', type: 'button', hidden: true, onclick: () => clearAll() }, 'Clear all');
  const home = el(
    'section',
    { class: 'phone-home', 'aria-label': 'Home screen' },
    el('div', { class: 'home-clock' }, homeTime, homeSub),
    el('div', { class: 'phone-grid' }, appButtons),
    el('div', { class: 'home-quick' }, quickDnd, quickMute),
    el('div', { class: 'home-stack' }, el('div', { class: 'stack-head' }, el('h3', {}, 'Notifications', stackCount), clearButton), stackList, stackEmpty),
  );

  const appTitle = el('h2', { class: 'phone-app-title', tabindex: '-1' });
  const backButton = el(
    'button',
    {
      class: 'phone-back',
      type: 'button',
      'aria-label': 'Back to the home screen',
      onclick: () => {
        sfx('ui_tap');
        phone.open();
      },
    },
    icon('back', 20),
    el('span', {}, 'Home'),
  );
  const body = el('div', { class: 'phone-body' });
  const appView = el('section', { class: 'phone-app' }, el('header', { class: 'phone-app-head' }, backButton, appTitle), body);
  appView.inert = true;

  const lockTime = el('strong');
  const lock = el('div', { class: 'phone-lock', 'aria-hidden': 'true' }, el('span', { class: 'lock-ico' }, icon('lock', 18)), lockTime);

  const homeBar = el(
    'button',
    {
      class: 'phone-homebar',
      type: 'button',
      'aria-label': 'Home',
      onclick: () => {
        sfx('ui_tap');
        current ? phone.open() : phone.close();
      },
    },
    el('i'),
  );

  const screen = el('div', { class: 'phone-screen', dataset: { view: 'home' } }, statusBar, el('div', { class: 'phone-views' }, home, appView), lock, homeBar);
  const closeButton = el(
    'button',
    { class: 'phone-close', type: 'button', 'aria-label': 'Put the phone away', title: 'Put it away (P)', onclick: () => phone.close() },
    icon('close', 15),
  );
  const device = el('div', { class: 'phone', role: 'dialog', 'aria-label': 'Phone', tabindex: '-1' }, el('div', { class: 'phone-frame' }, screen), closeButton);
  device.inert = true;
  trapTab(device);

  const scrim = el('div', { class: 'phone-scrim', onclick: () => phone.close() });
  const rail = el('div', { class: 'notice-rail', role: 'region', 'aria-label': 'Notifications' });

  const miniTime = el('strong', { class: 'mini-time' });
  const miniBadge = el('span', { class: 'mini-badge', hidden: true });
  const miniMoon = el('span', { class: 'mini-moon', hidden: true }, icon('moon', 11));
  const button = el(
    'button',
    { class: 'phone-button', type: 'button', 'aria-label': hint, title: hint, onclick: () => phone.toggle() },
    el(
      'span',
      { class: 'mini-screen' },
      el('span', { class: 'mini-island' }),
      miniMoon,
      miniTime,
      el('span', { class: 'mini-label' }, 'Phone ', el('span', { class: 'kbd' }, 'P')),
    ),
    miniBadge,
  );

  layer.append(scrim, device, rail, button);

  // ---- painting -----------------------------------------------------------------

  function paintTime() {
    const time = clock.format(state.clock);
    statusTime.textContent = time;
    homeTime.textContent = time;
    lockTime.textContent = time;
    miniTime.textContent = time;
  }

  function paintFlags() {
    statusDnd.hidden = !state.dnd;
    statusMute.hidden = !state.muted;
    miniMoon.hidden = !state.dnd;
    quickDnd.setAttribute('aria-pressed', String(!!state.dnd));
    quickMute.setAttribute('aria-pressed', String(!state.muted));
    quickMuteIcon.replaceChildren(icon(state.muted ? 'speakerOff' : 'speaker', 17));
    quickMuteText.textContent = state.muted ? 'Sound off' : 'Sound on';
    batteryFill.style.width = `${clamp((state.energy / (state.energyMax || 100)) * 100, 6, 100)}%`;
    batteryFill.classList.toggle('low', state.energy < (ctx.config.meters?.energy?.lowAt ?? 30));
    scrim.classList.toggle('is-clickable', state.phase === 'playing' || state.phase === 'ended');
  }

  function paintSub() {
    homeSub.textContent = state.objective ? `Now: ${state.objective}` : idleLine;
  }

  // How high the corner banners reach, so toasts can sit above them.
  function measureRail() {
    const top = !isOpen && rail.childElementCount ? Math.max(0, window.innerHeight - rail.getBoundingClientRect().top) : 0;
    document.documentElement.style.setProperty('--ui-rail-top', `${Math.round(top)}px`);
  }

  // ---- views ----------------------------------------------------------------------

  function show(app) {
    current = app;
    appSync = null;
    if (app) {
      const meta = APPS.find((a) => a.id === app);
      const view = renderApp(app, ctx, phone);
      appSync = view.sync || null;
      appTitle.textContent = meta.name;
      body.className = `phone-body body-${app}`;
      body.replaceChildren(...view.nodes.flat().filter(Boolean));
      body.scrollTop = 0;
    }
    screen.dataset.view = app ? 'app' : 'home';
    home.inert = !!app;
    appView.inert = !app;
  }

  function playUnlock() {
    if (reduced) return;
    window.clearTimeout(unlockTimer);
    screen.classList.remove('is-unlocking');
    void screen.offsetWidth;
    screen.classList.add('is-unlocking');
    unlockTimer = window.setTimeout(() => screen.classList.remove('is-unlocking'), 880);
  }

  const phone = {
    get isOpen() {
      return isOpen;
    },
    get app() {
      return current;
    },

    // No app means the home screen. Already open? Then it only switches.
    open(app) {
      const known = APPS.some((a) => a.id === app) ? app : null;
      const was = isOpen;
      const from = current;
      if (!was) {
        isOpen = true;
        lastFocus = document.activeElement;
        device.inert = false;
        layer.classList.add('phone-open');
        sfx('ui_tap');
        if (!known) playUnlock();
      }
      show(known);
      if (!was) bus.emit('phone:open', { app: known });
      bus.emit('phone:app', { app: known });
      if (known) appTitle.focus({ preventScroll: true });
      else if (was && from) (appButtons.find((b) => b.dataset.app === from) || device).focus({ preventScroll: true });
      else device.focus({ preventScroll: true });
      paintStack();
      measureRail();
    },

    close() {
      if (!isOpen) return;
      isOpen = false;
      device.inert = true;
      layer.classList.remove('phone-open');
      bus.emit('phone:close', {});
      const keep = lastFocus && document.contains(lastFocus) && lastFocus.closest?.('#round-layer, #card-layer, #loading');
      (keep ? lastFocus : document.getElementById('game-canvas'))?.focus?.({ preventScroll: true });
      lastFocus = null;
      paintStack();
      measureRail();
    },

    toggle() {
      isOpen ? phone.close() : phone.open();
    },

    setDnd(on) {
      const next = !!on;
      if (next === state.dnd) return;
      state.set({ dnd: next });
      bus.emit('dnd:change', { dnd: state.dnd });
      if (!next) return;
      for (const rec of [...notes.values()]) {
        if (rec.banner && !rec.page) settleBanner(rec, 'silence');
      }
    },

    notify,
    clear: wipe,
  };

  // ---- notifications ----------------------------------------------------------

  const notes = new Map();
  let serial = 0;

  function tile(n, page) {
    return el(
      'span',
      { class: 'note-tile', style: { background: page ? 'var(--bad)' : tileColour(n.app) }, 'aria-hidden': 'true' },
      page ? icon('bell', 15) : String(n.app || '?').trim().charAt(0).toUpperCase(),
    );
  }

  function leave(node, animate = true) {
    if (!node || node.dataset.leaving) return;
    node.dataset.leaving = '1';
    node.style.pointerEvents = 'none';
    if (!animate || reduced || !node.isConnected) {
      node.remove();
      return;
    }
    node.style.height = `${node.offsetHeight}px`;
    void node.offsetHeight;
    node.classList.add('is-leaving');
    window.setTimeout(() => node.remove(), 260);
  }

  function gone(rec, how, from) {
    const { n } = rec;
    const payload = { id: n.id, kind: n.kind || 'junk', app: n.app, from };
    if (how === 'open') bus.emit('notify:open', payload);
    else bus.emit('notify:dismiss', { ...payload, how });
  }

  function dropBanner(rec) {
    window.clearTimeout(rec.timer);
    leave(rec.banner);
    rec.banner = null;
  }

  function dropRow(rec) {
    leave(rec.row);
    rec.row = null;
    notes.delete(rec.key);
  }

  // A banner ends once. Timed out or silenced ones stay in the stack.
  function settleBanner(rec, how) {
    if (!rec.banner) return;
    const stays = how === 'timeout' || how === 'silence';
    dropBanner(rec);
    if (stays) rec.row.hidden = false;
    else dropRow(rec);
    if (how === 'swipe' || how === 'tap') sfx('dismiss');
    if (how === 'open') sfx('ui_tap');
    gone(rec, how, 'banner');
    paintStack();
  }

  function settleRow(rec, how, quiet = false) {
    if (!notes.has(rec.key)) return;
    dropBanner(rec);
    dropRow(rec);
    if (!quiet) sfx(how === 'open' ? 'ui_tap' : 'dismiss');
    gone(rec, how, 'stack');
    paintStack();
  }

  function refuse(node) {
    sfx('fail');
    if (reduced || !node?.animate) return;
    node.animate(
      [0, -8, 7, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 400, easing: 'ease' },
    );
  }

  function actionsFor(rec, from) {
    const { n } = rec;
    const settle = (how) => (from === 'banner' ? settleBanner(rec, how) : settleRow(rec, how));
    if (rec.page) {
      const labels = n.actions || {};
      return el(
        'div',
        { class: 'note-actions' },
        el(
          'button',
          {
            class: 'note-btn strong',
            type: 'button',
            onclick: (e) => {
              e.stopPropagation();
              settle('open');
            },
          },
          labels.acknowledge || 'On it',
        ),
        labels.snooze
          ? el(
              'button',
              {
                class: 'note-btn',
                type: 'button',
                onclick: (e) => {
                  e.stopPropagation();
                  const button = e.currentTarget;
                  refuse(button.closest('.notice, .note-row'));
                  if (!labels.refused) return;
                  button.textContent = labels.refused;
                  window.clearTimeout(button.back);
                  button.back = window.setTimeout(() => {
                    button.textContent = labels.snooze;
                  }, 1800);
                },
              },
              labels.snooze,
            )
          : null,
      );
    }
    return null;
  }

  function quietButton(rec) {
    return el(
      'button',
      {
        class: 'note-quiet',
        type: 'button',
        title: dndLabel,
        onclick: (e) => {
          e.stopPropagation();
          sfx('ui_tap');
          phone.setDnd(true);
          if (rec.banner) settleBanner(rec, 'silence');
        },
      },
      icon('moon', 12),
      'Silence',
    );
  }

  function buildBanner(rec) {
    const { n, page } = rec;
    const node = el(
      'div',
      { class: `notice notice-${n.kind || 'junk'}`, role: page ? 'alert' : 'status' },
      el(
        'div',
        { class: 'note-head' },
        tile(n, page),
        el('span', { class: 'note-app' }, n.app || 'Phone'),
        el('span', { class: 'note-when' }, 'now'),
        page ? null : quietButton(rec),
        page
          ? null
          : el(
              'button',
              {
                class: 'note-x',
                type: 'button',
                'aria-label': `Dismiss: ${n.title || n.app || 'notification'}`,
                onclick: (e) => {
                  e.stopPropagation();
                  settleBanner(rec, 'tap');
                },
              },
              icon('close', 13),
            ),
      ),
      el('strong', { class: 'note-title' }, n.title || ''),
      n.body ? el('span', { class: 'note-body' }, n.body) : null,
      actionsFor(rec, 'banner'),
    );
    const drag = swipeable(node, {
      locked: () => page,
      onSwipe: () => settleBanner(rec, 'swipe'),
      onRefuse: () => refuse(node),
    });
    node.addEventListener('click', () => {
      if (drag.dragged()) return;
      settleBanner(rec, page ? 'open' : 'tap');
    });
    // A banner under the pointer waits.
    node.addEventListener('pointerenter', () => window.clearTimeout(rec.timer));
    node.addEventListener('pointerleave', () => {
      if (page || !rec.banner) return;
      window.clearTimeout(rec.timer);
      rec.timer = window.setTimeout(() => settleBanner(rec, 'timeout'), BANNER_MS / 2);
    });
    return node;
  }

  function buildRow(rec) {
    const { n, page } = rec;
    const node = el(
      'li',
      { class: `note-row note-${n.kind || 'junk'}` },
      tile(n, page),
      el(
        'div',
        { class: 'note-text' },
        el('span', { class: 'note-app' }, n.app || 'Phone'),
        el('strong', { class: 'note-title' }, n.title || ''),
        n.body ? el('span', { class: 'note-body' }, n.body) : null,
        actionsFor(rec, 'stack'),
      ),
      page
        ? null
        : el(
            'button',
            { class: 'note-x', type: 'button', 'aria-label': `Dismiss: ${n.title || n.app || 'notification'}`, onclick: () => settleRow(rec, 'tap') },
            icon('close', 13),
          ),
    );
    swipeable(node, {
      locked: () => page,
      onSwipe: () => settleRow(rec, 'swipe'),
      onRefuse: () => refuse(node),
    });
    return node;
  }

  function paintStack() {
    const all = [...notes.values()];
    const listed = all.filter((rec) => rec.row && !rec.row.hidden);
    const loose = listed.filter((rec) => !rec.page).length;
    const paging = all.some((rec) => rec.page);
    stackEmpty.hidden = listed.length > 0;
    clearButton.hidden = loose === 0;
    stackCount.textContent = listed.length ? String(listed.length) : '';
    miniBadge.hidden = all.length === 0;
    miniBadge.textContent = all.length > 99 ? '99+' : String(all.length);
    layer.classList.toggle('has-page', paging);
    button.setAttribute('aria-label', all.length ? `${hint}, ${all.length} ${all.length === 1 ? 'notification' : 'notifications'}` : hint);
  }

  function clearAll() {
    const loose = [...notes.values()].filter((rec) => !rec.page);
    if (!loose.length) return;
    sfx('dismiss');
    for (const rec of loose) settleRow(rec, 'clear', true);
  }

  // Empties the phone without telling anyone. For a new day.
  function wipe() {
    for (const rec of [...notes.values()]) {
      window.clearTimeout(rec.timer);
      rec.banner?.remove();
      rec.row?.remove();
    }
    notes.clear();
    paintStack();
  }

  // kind "page" gets through do not disturb. Nothing else does.
  function notify(n = {}) {
    const page = n.kind === 'page';
    const delivered = !state.dnd || page;
    bus.emit('notify', { ...n, delivered });
    if (!delivered) return false;

    sfx(page ? 'page_alarm' : 'notify');
    if (!isOpen) {
      sfx('phone_buzz');
      button.classList.remove('is-buzzing');
      void button.offsetWidth;
      button.classList.add('is-buzzing');
    }

    const rec = { key: (serial += 1), n, page, banner: null, row: null, timer: 0 };
    notes.set(rec.key, rec);
    rec.row = buildRow(rec);
    rec.row.hidden = true;
    stackList.prepend(rec.row);
    rec.banner = buildBanner(rec);
    rail.append(rec.banner);
    if (!page) rec.timer = window.setTimeout(() => settleBanner(rec, 'timeout'), BANNER_MS);

    const banners = [...notes.values()].filter((r) => r.banner && !r.page);
    for (const old of banners.slice(0, Math.max(0, banners.length - MAX_BANNERS))) settleBanner(old, 'timeout');
    const rows = [...notes.values()].filter((r) => !r.page);
    for (const old of rows.slice(0, Math.max(0, rows.length - MAX_STACK))) {
      window.clearTimeout(old.timer);
      old.banner?.remove();
      old.row?.remove();
      notes.delete(old.key);
    }
    paintStack();
    return true;
  }

  // ---- wiring -------------------------------------------------------------------

  state.subscribe((s, changed) => {
    if (changed.includes('clock')) paintTime();
    if (changed.includes('objective')) paintSub();
    if (changed.some((k) => k === 'dnd' || k === 'muted' || k === 'energy' || k === 'energyMax' || k === 'phase')) paintFlags();
    if (appSync && changed.some((k) => k === 'dnd' || k === 'muted' || k === 'volume' || k === 'quality')) appSync();
  });
  bus.on('quality:change', () => appSync?.());
  bus.on('day:restart', wipe);
  if ('ResizeObserver' in window) new ResizeObserver(measureRail).observe(rail);
  window.addEventListener('resize', measureRail);

  paintTime();
  paintFlags();
  paintSub();
  paintStack();

  return phone;
}
