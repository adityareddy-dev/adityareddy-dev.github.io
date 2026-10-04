import { el } from '../core/dom.js';
import { icon } from './icons.js';
import { clamp } from './util.js';

const METERS = [
  { id: 'energy', label: 'Energy', icon: 'bolt' },
  { id: 'focus', label: 'Focus', icon: 'focus' },
  { id: 'irritation', label: 'Irritation', icon: 'scribble' },
];

// Clock, meters, objective, score, mute and the use prompt.
export function createHud(ctx, layer) {
  const { bus, state, clock, config } = ctx;
  const story = ctx.data.story || {};
  const streakNames = story.scoring?.streaks?.names || [];
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const sfx = (name) => ctx.audio?.sfx?.(name);

  // ---- top left: time and meters ---------------------------------------------

  const dayIcon = el('span', { class: 'hud-daypart' });
  const clockText = el('strong', { class: 'hud-clock' }, clock.format(state.clock));
  const roomText = el('span', { class: 'hud-room' });
  const dayFill = el('b');
  const timeBox = el(
    'div',
    { class: 'hud-time glass' },
    dayIcon,
    el('div', { class: 'hud-time-text' }, clockText, roomText),
    el('i', { class: 'hud-day', 'aria-hidden': 'true' }, dayFill),
  );

  const meters = {};
  const meterRows = METERS.map((m) => {
    const fill = el('i', { class: 'meter-fill' });
    const track = el('span', { class: 'meter-track' }, fill);
    const num = el('span', { class: 'meter-num' });
    const row = el(
      'div',
      { class: `meter meter-${m.id}`, role: 'meter', 'aria-label': m.label, 'aria-valuemin': '0' },
      el('span', { class: 'meter-ico' }, icon(m.icon, 13)),
      el('span', { class: 'meter-name' }, m.label),
      track,
      num,
    );
    meters[m.id] = { row, fill, track, num };
    return row;
  });
  const meterBox = el('div', { class: 'hud-meters glass' }, meterRows);

  // ---- top middle: what to do now --------------------------------------------

  const objectiveText = el('p', { class: 'hud-objective' });
  const goalBox = el('div', { class: 'hud-goal glass', hidden: true, role: 'status' }, el('span', { class: 'hud-goal-tag' }, 'Now'), objectiveText);

  // ---- top right: score, streak, sound ---------------------------------------

  const scoreNum = el('strong', { class: 'hud-score-num' }, '0');
  const scoreBox = el('div', { class: 'hud-score glass' }, el('span', { class: 'hud-score-label' }, 'Score'), scoreNum);
  const streakCount = el('b');
  const streakName = el('span');
  const streakBox = el('div', { class: 'hud-streak glass', hidden: true }, icon('flame', 14), streakCount, streakName);
  const muteButton = el('button', {
    class: 'hud-round-btn hud-mute glass',
    type: 'button',
    onclick: () => {
      state.set({ muted: !state.muted });
      sfx('ui_tap');
      muteButton.blur();
    },
  });

  // ---- bottom: the use prompt -------------------------------------------------

  const promptKey = el('span', { class: 'kbd' }, coarse ? 'Tap' : 'E');
  const promptText = el('span', { class: 'hud-prompt-text' });
  const promptLabel = el('small');
  const promptBox = el(
    'button',
    {
      class: 'hud-prompt glass',
      type: 'button',
      hidden: true,
      onclick: () => {
        promptBox.blur();
        if (!ctx.engine.paused) ctx.interact?.use();
      },
    },
    promptKey,
    promptText,
    promptLabel,
  );

  const root = el(
    'div',
    { class: 'hud is-waiting' },
    el('div', { class: 'hud-tl' }, timeBox, meterBox),
    el('div', { class: 'hud-tc' }, goalBox),
    el('div', { class: 'hud-tr' }, el('div', { class: 'hud-points' }, scoreBox, streakBox), muteButton),
    promptBox,
  );
  if (ctx.debug) root.classList.add('has-debug');
  layer.append(root);

  // ---- painting ---------------------------------------------------------------

  let shownScore = state.score;
  let lastObjective = null;

  function paintClock() {
    clockText.textContent = clock.format(state.clock);
    const hour = Math.floor(state.clock / 60);
    const night = hour < 6 || hour >= 18;
    if (dayIcon.dataset.part !== (night ? 'night' : 'day')) {
      dayIcon.dataset.part = night ? 'night' : 'day';
      dayIcon.replaceChildren(icon(night ? 'moon' : 'sun', 16));
    }
    const span = config.clock.end - config.clock.start || 1;
    dayFill.style.width = `${clamp(((state.clock - config.clock.start) / span) * 100, 0, 100)}%`;
  }

  function paintRoom() {
    roomText.textContent = ctx.world?.rooms?.[state.room]?.name || '';
  }

  function paintMeters() {
    const m = config.meters;
    const caps = { energy: state.energyMax, focus: m.focus.cap, irritation: m.irritation.cap };
    for (const { id } of METERS) {
      const value = state[id];
      const part = meters[id];
      part.fill.style.width = `${clamp((value / (caps[id] || 100)) * 100, 0, 100)}%`;
      part.num.textContent = String(Math.round(value));
      part.row.setAttribute('aria-valuenow', String(Math.round(value)));
      part.row.setAttribute('aria-valuemax', String(Math.round(caps[id])));
      part.row.title = `${part.row.getAttribute('aria-label')} ${Math.round(value)} of ${Math.round(caps[id])}`;
    }
    // The gym raises the cap, and the bar gets longer with it.
    meters.energy.track.style.setProperty('--stretch', String(clamp(state.energyMax / (m.energy.cap || 100), 1, 1.35)));
    meters.energy.row.classList.toggle('is-alert', state.energy < m.energy.lowAt);
    meters.focus.row.classList.toggle('is-alert', state.focus < m.focus.lowAt);
    meters.irritation.row.classList.toggle('is-alert', state.irritation >= m.irritation.highAt);
  }

  function chip(id, delta) {
    const node = el('span', { class: `meter-chip ${delta > 0 ? 'up' : 'down'}` }, `${delta > 0 ? '+' : ''}${Math.round(delta)}`);
    node.addEventListener('animationend', () => node.remove());
    meters[id].row.append(node);
    window.setTimeout(() => node.remove(), 1600);
  }

  function paintObjective() {
    const text = state.objective || '';
    if (text === lastObjective) return;
    lastObjective = text;
    objectiveText.textContent = text;
    goalBox.hidden = !text;
    goalBox.classList.remove('is-new');
    if (text) {
      void goalBox.offsetWidth;
      goalBox.classList.add('is-new');
    }
  }

  function paintStreak() {
    const n = state.streak;
    streakBox.hidden = n < 2;
    streakCount.textContent = `x${n}`;
    streakName.textContent = streakNames[Math.min(n, streakNames.length - 1)] || '';
  }

  function paintMute() {
    muteButton.replaceChildren(icon(state.muted ? 'speakerOff' : 'speaker', 18));
    muteButton.setAttribute('aria-pressed', String(!!state.muted));
    muteButton.setAttribute('aria-label', state.muted ? 'Sound is off. Turn it on' : 'Sound is on. Turn it off');
    muteButton.title = state.muted ? 'Sound off (M)' : 'Sound on (M)';
    muteButton.classList.toggle('is-off', !!state.muted);
  }

  function paintPhase() {
    root.classList.toggle('is-waiting', state.phase === 'loading' || state.phase === 'ready');
  }

  state.subscribe((s, changed, prev) => {
    if (changed.includes('clock')) paintClock();
    if (changed.includes('room')) paintRoom();
    if (changed.includes('objective')) paintObjective();
    if (changed.includes('streak')) paintStreak();
    if (changed.includes('muted')) paintMute();
    if (changed.includes('phase')) paintPhase();
    // The day is over, so the counter shows the final score as the card does.
    if (changed.includes('phase') && state.phase === 'ended') {
      shownScore = state.score;
      scoreNum.textContent = String(state.score);
    }
    if (changed.some((k) => k === 'energy' || k === 'energyMax' || k === 'focus' || k === 'irritation')) {
      paintMeters();
      for (const { id } of METERS) {
        const delta = state[id] - prev[id];
        if (changed.includes(id) && Math.abs(delta) >= 3 && state.phase === 'playing') chip(id, delta);
      }
    }
    if (changed.includes('score') && state.score > prev.score) {
      scoreBox.classList.remove('is-bump');
      void scoreBox.offsetWidth;
      scoreBox.classList.add('is-bump');
    }
  });

  bus.on('interact:focus', ({ prompt, label }) => {
    promptText.textContent = prompt || label || '';
    promptLabel.textContent = prompt && label && label !== prompt ? label : '';
    promptBox.hidden = false;
  });
  bus.on('interact:blur', () => {
    promptBox.hidden = true;
  });

  paintClock();
  paintRoom();
  paintMeters();
  paintObjective();
  paintStreak();
  paintMute();
  paintPhase();

  return {
    root,
    show() {
      root.classList.remove('is-hidden');
    },
    hide() {
      root.classList.add('is-hidden');
    },
    setObjective(text) {
      state.set({ objective: text || '' });
    },
    // The score counts up instead of jumping.
    update(dt) {
      const target = state.score;
      if (shownScore === target) return;
      const step = (target - shownScore) * Math.min(1, dt * 9);
      shownScore = Math.abs(target - shownScore) < 1 ? target : shownScore + step;
      scoreNum.textContent = String(Math.round(shownScore));
    },
    refresh() {
      paintRoom();
      paintMeters();
    },
  };
}
