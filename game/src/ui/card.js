import { el, fill } from '../core/dom.js';
import { icon } from './icons.js';
import { trapTab } from './util.js';

const TYPES = ['writeup', 'door', 'note'];
const GAME_URL = 'https://adityareddy.dev/game/';
const SAFE_CLOSE = ['leave', 'ok', 'close', 'cancel'];

function wrap(g, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Draws the card as a 1200 by 630 picture, the size link previews like.
async function drawCard({ gameTitle, heading, title, line, stats }) {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;

  try {
    await Promise.race([
      Promise.all([document.fonts.load('560 80px Fraunces'), document.fonts.load('600 28px Inter'), document.fonts.load('800 28px Inter')]),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch {
    // System fonts will do.
  }
  const serif = "Fraunces, Georgia, 'Times New Roman', serif";
  const sans = "Inter, system-ui, 'Segoe UI', sans-serif";

  const back = g.createLinearGradient(0, 0, W, H);
  back.addColorStop(0, '#2b2533');
  back.addColorStop(1, '#17151c');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W - 120, 60, 0, W - 120, 60, 620);
  glow.addColorStop(0, 'rgba(255, 180, 99, 0.34)');
  glow.addColorStop(1, 'rgba(255, 180, 99, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // The day as a line, sunrise to lights out. It stays under the numbers.
  g.strokeStyle = 'rgba(255, 180, 99, 0.55)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(70, 596);
  g.bezierCurveTo(360, 596, 520, 534, 700, 552);
  g.bezierCurveTo(880, 570, 1000, 596, 1130, 596);
  g.stroke();

  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffb463';
  g.font = `800 22px ${sans}`;
  try {
    g.letterSpacing = '4px';
  } catch {
    // Older browsers skip the spacing.
  }
  g.fillText(String(gameTitle).toUpperCase(), 72, 96);
  if (heading) {
    g.fillStyle = 'rgba(247, 242, 234, 0.6)';
    g.fillText(String(heading).toUpperCase(), 72, 132);
  }
  try {
    g.letterSpacing = '0px';
  } catch {
    // Same.
  }

  g.fillStyle = '#f7f2ea';
  let size = 92;
  g.font = `560 ${size}px ${serif}`;
  let titleLines = wrap(g, title, W - 144);
  while (titleLines.length > 2 && size > 56) {
    size -= 8;
    g.font = `560 ${size}px ${serif}`;
    titleLines = wrap(g, title, W - 144);
  }
  let y = 150 + size;
  for (const row of titleLines.slice(0, 2)) {
    g.fillText(row, 72, y);
    y += size * 1.08;
  }

  g.fillStyle = 'rgba(247, 242, 234, 0.82)';
  g.font = `500 32px ${sans}`;
  y += 4;
  for (const row of wrap(g, line || '', W - 200).slice(0, 2)) {
    g.fillText(row, 72, y);
    y += 44;
  }

  let x = 72;
  const baseY = 470;
  for (const stat of (stats || []).slice(0, 4)) {
    g.font = `560 64px ${serif}`;
    g.fillStyle = '#f7f2ea';
    const value = String(stat.value);
    g.fillText(value, x, baseY);
    const wide = g.measureText(value).width;
    g.font = `600 20px ${sans}`;
    g.fillStyle = 'rgba(247, 242, 234, 0.6)';
    const label = String(stat.label);
    g.fillText(label, x, baseY + 32);
    x += Math.max(wide, g.measureText(label).width) + 56;
  }

  g.font = `600 22px ${sans}`;
  g.fillStyle = 'rgba(247, 242, 234, 0.75)';
  g.textAlign = 'right';
  g.fillText(GAME_URL.replace('https://', '').replace(/\/$/, ''), W - 72, 96);
  g.textAlign = 'left';
  return canvas;
}

// Numbers count up from nothing, one tile after the other.
function countUp(nodes) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const began = performance.now();
  const items = nodes
    .map((node, i) => ({ node, text: node.textContent, to: Number(node.textContent), places: (node.textContent.split('.')[1] || '').length, from: began + i * 80 }))
    .filter((it) => /^[0-9]+([.][0-9]+)?$/.test(it.text) && it.to > 0);
  if (!items.length) return;
  for (const it of items) it.node.textContent = (0).toFixed(it.places);
  const tick = (now) => {
    let left = false;
    for (const it of items) {
      const k = Math.min(1, Math.max(0, (now - it.from) / 600));
      it.node.textContent = k >= 1 ? it.text : (it.to * (1 - (1 - k) ** 3)).toFixed(it.places);
      if (k < 1) left = true;
    }
    if (left) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Cards sit on top of everything and wait for a button.
export function createCards(ctx, layer) {
  const { bus, state } = ctx;
  const story = ctx.data.story || {};
  const copy = story.scoring?.writeupCard || {};
  const sfx = (name) => ctx.audio?.sfx?.(name);
  const queue = [];
  let showing = false;
  let serial = 0;

  function next() {
    const job = queue.shift();
    if (!job) {
      showing = false;
      return;
    }
    showing = true;
    present(job.data, (action) => {
      job.resolve(action);
      next();
    });
  }

  function present(data, done) {
    const type = TYPES.includes(data.type) ? data.type : 'note';
    const values = { ...state.snapshot(), ...state.counts, shop: story.rounds?.hunt?.shop?.name, ...(data.values || {}) };
    const text = (value) => fill(value, values);
    const lastFocus = document.activeElement;
    const openedAt = performance.now();
    const titleId = `card-title-${(serial += 1)}`;
    const fallback =
      type === 'writeup'
        ? [
            { id: 'replay', label: 'Play again' },
            { id: 'resume', label: 'See the resume' },
          ]
        : [{ id: 'ok', label: 'Okay' }];
    const actions = Array.isArray(data.actions) && data.actions.length ? data.actions : fallback;
    const lines = (Array.isArray(data.lines) ? data.lines : data.lines ? [data.lines] : []).map(text);
    const stats = Array.isArray(data.stats) ? data.stats : [];
    const fields = Array.isArray(data.fields)
      ? data.fields
      : data.fields && typeof data.fields === 'object'
        ? Object.entries(data.fields).map(([label, value]) => ({ label, text: value }))
        : [];
    const share = data.share || (type === 'writeup' && copy.shareText ? { text: copy.shareText, url: GAME_URL } : null);
    let closed = false;

    function close(id) {
      if (closed) return;
      closed = true;
      backdrop.classList.add('is-leaving');
      window.setTimeout(() => backdrop.remove(), 220);
      bus.emit('card:close', { type: data.type, action: id });
      if (lastFocus && document.contains(lastFocus) && !lastFocus.closest('#card-layer')) lastFocus.focus?.({ preventScroll: true });
      done(id);
    }

    // A key held down from the world shouldn't press a button that just appeared.
    const settled = () => performance.now() - openedAt > 250;

    const buttons = actions.map((a, i) => {
      const props = {
        class: i === 0 && !data.plain ? 'btn primary' : 'btn',
        onclick: (e) => {
          if (!settled()) {
            e.preventDefault();
            return;
          }
          sfx('ui_tap');
          close(a.id);
        },
      };
      return a.href
        ? el('a', { ...props, href: a.href, target: '_blank', rel: 'noopener' }, text(a.label))
        : el('button', { ...props, type: 'button' }, text(a.label));
    });
    const long = actions.some((a) => String(a.label || '').length > 30);

    // ---- share and save ---------------------------------------------------------

    let shareRow = null;
    if (share) {
      const url = share.url || GAME_URL;
      const filled = text(share.text || '');
      const message = filled.includes(url) ? filled : `${filled} ${url}`.trim();
      const note = el('span', { class: 'card-share-note', role: 'status' });
      const field = el('textarea', { class: 'card-share-text', readonly: true, rows: 3, hidden: true, 'aria-label': 'Text to share' }, message);
      const shareLabel = el('span', {}, copy.shareButton || 'Share');
      const shareButton = el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            sfx('ui_tap');
            let ok = false;
            try {
              await navigator.clipboard.writeText(message);
              ok = true;
            } catch {
              ok = false;
            }
            if (ok) {
              shareLabel.textContent = 'Copied';
              note.textContent = 'Paste it anywhere.';
              window.setTimeout(() => {
                shareLabel.textContent = copy.shareButton || 'Share';
                note.textContent = '';
              }, 2400);
              return;
            }
            field.hidden = false;
            field.focus();
            field.select();
            note.textContent = "The clipboard said no. It's selected, copy it from here.";
          },
        },
        icon('copy', 16),
        shareLabel,
      );
      const saveButton = el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            sfx('ui_tap');
            const canvas = await drawCard({
              gameTitle: story.title || 'A Day in the Life of Adi',
              heading: data.heading ? text(data.heading) : '',
              title: text(data.title || ''),
              line: lines[0] || '',
              stats: stats.map((s) => ({ label: text(s.label), value: text(s.value) })),
            });
            if (!canvas) {
              note.textContent = "This browser wouldn't draw the picture.";
              return;
            }
            canvas.toBlob((blob) => {
              if (!blob) return;
              const href = URL.createObjectURL(blob);
              const link = el('a', { href, download: 'a-day-in-the-life-of-adi.png' });
              document.body.append(link);
              link.click();
              link.remove();
              window.setTimeout(() => URL.revokeObjectURL(href), 4000);
              note.textContent = 'Saved.';
            }, 'image/png');
          },
        },
        icon('image', 16),
        'Save image',
      );
      shareRow = el('div', { class: 'card-share' }, shareButton, saveButton, note, field);
    }

    const card = el(
      'div',
      { class: `panel card card-${type}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      type === 'door' ? el('span', { class: 'card-stamp', 'aria-hidden': 'true' }, icon('lock', 22)) : null,
      data.heading ? el('p', { class: 'card-heading' }, text(data.heading)) : null,
      el('h2', { class: 'card-title', id: titleId }, text(data.title || '')),
      lines.length ? el('div', { class: 'card-lines' }, lines.map((line) => el('p', {}, line))) : null,
      stats.length
        ? el('dl', { class: 'card-stats' }, stats.map((s) => el('div', {}, el('dt', {}, text(s.label)), el('dd', {}, text(s.value)))))
        : null,
      fields.length
        ? el('dl', { class: 'card-fields' }, fields.map((f) => el('div', {}, el('dt', {}, text(f.label)), el('dd', {}, text(f.text ?? f.value ?? '')))))
        : null,
      shareRow,
      el('div', { class: long ? 'card-actions stacked' : 'card-actions' }, buttons),
    );
    const backdrop = el('div', { class: `card-backdrop card-backdrop-${type}` }, card);
    trapTab(card);
    backdrop.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const safe = actions.find((a) => SAFE_CLOSE.includes(a.id));
      if (safe && settled()) close(safe.id);
    });

    layer.append(backdrop);
    if (type === 'writeup') countUp([...card.querySelectorAll('.card-stats dd')]);
    bus.emit('card:open', { type: data.type });
    (buttons[0] || card).focus({ preventScroll: true });
  }

  // Resolves with the id of the button that closed it.
  function show(data = {}) {
    return new Promise((resolve) => {
      queue.push({ data: data || {}, resolve });
      if (!showing) next();
    });
  }

  return { show, draw: drawCard };
}
