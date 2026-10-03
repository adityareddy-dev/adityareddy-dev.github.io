export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-02" to "Oct 2, 2026". Anything else comes back as it was.
export function prettyDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return value ? String(value) : '';
  return `${MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[3])}, ${m[1]}`;
}

export function prNumber(url) {
  const m = /\/(?:pull|issues)\/(\d+)/.exec(String(url ?? ''));
  return m ? `#${m[1]}` : '';
}

// Pull requests grouped by repo, in the order the data file lists the repos.
export function groupContributions(contributions = {}) {
  const merged = Array.isArray(contributions.merged) ? contributions.merged : [];
  const open = Array.isArray(contributions.open) ? contributions.open : [];
  const groups = new Map();
  const group = (repo) => {
    const key = repo || 'Other';
    if (!groups.has(key)) groups.set(key, { repo: key, merged: [], open: [] });
    return groups.get(key);
  };
  for (const row of Array.isArray(contributions.byProject) ? contributions.byProject : []) group(row.repo);
  for (const pr of merged) group(pr.repo).merged.push(pr);
  for (const pr of open) group(pr.repo).open.push(pr);
  return [...groups.values()].filter((g) => g.merged.length || g.open.length);
}

const STAT_LABELS = {
  npmVersion: 'On npm',
  npmReleases: 'Releases',
  firstPublished: 'First published',
  githubStars: 'GitHub stars',
  mergedPullRequests: 'Pull requests merged in the repo',
  dependencies: 'Dependencies',
  license: 'License',
};

// Turns a stats object into rows of label and value, skipping empty ones.
export function statRows(stats) {
  if (!stats || typeof stats !== 'object') return [];
  return Object.entries(stats)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      label: STAT_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
      value: key === 'firstPublished' ? prettyDate(value) : key === 'npmVersion' ? `v${value}` : String(value),
    }));
}

const TILE_COLOURS = ['#e8894a', '#4f9f7a', '#4c8fd6', '#c9647a', '#8a6fd1', '#c2a03a', '#3f9aa6', '#a07a5a'];

// The same app always gets the same tile colour.
export function tileColour(name) {
  let sum = 0;
  for (const ch of String(name || '')) sum = (sum * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLOURS[sum % TILE_COLOURS.length];
}

// Drag sideways to throw something away. locked() true means it springs back.
export function swipeable(node, { onSwipe, locked = () => false, onRefuse } = {}) {
  let start = null;
  let dragging = false;
  let dx = 0;
  let dragStamp = -1000;

  const reset = (animate = true) => {
    node.style.transition = animate ? 'transform 0.22s ease, opacity 0.22s ease' : '';
    node.style.transform = '';
    node.style.opacity = '';
  };

  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    start = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId };
    dragging = false;
    dx = 0;
  });

  node.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        // Fine without it.
      }
    }
    const shown = locked() ? dx * 0.18 : dx;
    node.style.transition = 'none';
    node.style.transform = `translateX(${shown}px)`;
    node.style.opacity = locked() ? '' : String(clamp(1 - Math.abs(dx) / 260, 0.25, 1));
  });

  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const wasDragging = dragging;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - start.time);
    start = null;
    dragging = false;
    if (!wasDragging) return;
    dragStamp = performance.now();
    const far = Math.abs(dx) > 90 || (Math.abs(dx) > 30 && speed > 0.6);
    if (e.type === 'pointerup' && far && !locked()) {
      node.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
      node.style.transform = `translateX(${Math.sign(dx) * 420}px)`;
      node.style.opacity = '0';
      onSwipe?.(Math.sign(dx));
      return;
    }
    reset(true);
    if (e.type === 'pointerup' && far && locked()) onRefuse?.();
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  // The click that follows a drag isn't a click. Handlers ask dragged() first.
  return { reset, dragged: () => performance.now() - dragStamp < 350 };
}

// Every focusable thing inside a node, in order.
export function focusables(node) {
  return [...node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (n) => !n.closest('[inert]') && n.getClientRects().length > 0,
  );
}

// Keeps Tab inside a node while it's the thing on top.
export function trapTab(node) {
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const list = focusables(node);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
