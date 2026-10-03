import { el } from '../core/dom.js';
import { icon } from './icons.js';
import { clamp } from './util.js';

const TIP_MS = 4200;

// The loading screen, and the title screen it turns into.
export function createLoading(ctx, { openResume } = {}) {
  const story = ctx.data.story || {};
  const root = document.getElementById('loading');
  const box = root?.querySelector('.loading-box');
  const bar = document.getElementById('loading-bar');
  const text = document.getElementById('loading-text');
  const title = document.getElementById('loading-title');
  const sub = document.getElementById('loading-sub');
  const track = root?.querySelector('.loading-track');
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  if (title && story.title) title.textContent = story.title;
  if (sub && story.subtitle) sub.textContent = story.subtitle;

  const pct = el('span', { class: 'loading-pct', 'aria-hidden': 'true' }, '0%');
  track?.after(pct);

  function hide() {
    if (!root) return;
    root.classList.add('done');
    window.setTimeout(() => {
      root.hidden = true;
    }, 600);
  }

  function swapText(next) {
    if (!text) return;
    text.classList.add('is-swapping');
    window.setTimeout(() => {
      text.textContent = next;
      text.classList.remove('is-swapping');
    }, 180);
  }

  return {
    set(value, label) {
      const shown = clamp(Number(value) || 0, 0, 100);
      if (bar) bar.style.width = `${shown}%`;
      pct.textContent = `${Math.round(shown)}%`;
      if (label && text) text.textContent = label;
    },

    // Resolves when the visitor starts the day. With ?autostart it doesn't wait.
    done() {
      if (ctx.autostart || !root || !box) {
        hide();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const tips = Array.isArray(story.intro?.tips) ? story.intro.tips : [];
        let tipIndex = 0;
        let tipTimer = 0;
        if (text) text.textContent = tips[0] || '';
        if (tips.length > 1) {
          tipTimer = window.setInterval(() => {
            tipIndex = (tipIndex + 1) % tips.length;
            swapText(tips[tipIndex]);
          }, TIP_MS);
        }

        const start = el('button', { class: 'loading-start', type: 'button', onclick: go }, icon('play', 18), el('span', {}, 'Start the day'));
        const resume = el(
          'button',
          {
            class: 'loading-resume',
            type: 'button',
            onclick: () => openResume?.(),
          },
          icon('resume', 16),
          el('span', {}, 'Just the resume'),
        );
        const about = el(
          'a',
          { class: 'loading-resume', href: new URL('../../../about-me/', import.meta.url).href },
          icon('person', 16),
          el('span', {}, 'About me, no walking required'),
        );
        const tool = el(
          'a',
          { class: 'loading-resume', href: 'https://adityareddy.dev/react-inp-blame/' },
          icon('bolt', 16),
          el('span', {}, 'react-inp-blame'),
        );
        const keys = coarse
          ? el('p', { class: 'loading-keys' }, 'Tap the floor to walk. Tap things to use them.')
          : el(
              'p',
              { class: 'loading-keys' },
              el('span', {}, el('span', { class: 'kbd' }, 'WASD'), ' walk'),
              el('span', {}, el('span', { class: 'kbd' }, 'E'), ' use'),
              el('span', {}, el('span', { class: 'kbd' }, 'P'), ' phone'),
              el('span', {}, el('span', { class: 'kbd' }, 'M'), ' mute'),
            );

        function go() {
          window.clearInterval(tipTimer);
          start.disabled = true;
          // Sound has to start from a real click.
          try {
            Promise.resolve(ctx.audio?.unlock?.()).catch(() => {});
          } catch {
            // The day starts either way.
          }
          hide();
          document.getElementById('game-canvas')?.focus({ preventScroll: true });
          resolve();
        }

        root.classList.add('is-ready');
        box.append(el('div', { class: 'loading-actions' }, start, resume, about, tool), keys);
        start.focus({ preventScroll: true });
      });
    },
  };
}
