import { el } from '../core/dom.js';
import { icon } from './icons.js';
import { groupContributions, prettyDate, prNumber, statRows } from './util.js';

export const APPS = [
  { id: 'resume', name: 'Resume', icon: 'resume' },
  { id: 'contributions', name: 'Contributions', icon: 'merge' },
  { id: 'articles', name: 'Articles', icon: 'article' },
  { id: 'judging', name: 'Judging', icon: 'medal', needs: 'judging' },
  { id: 'portfolio', name: 'Portfolio', icon: 'grid' },
  { id: 'settings', name: 'Settings', icon: 'sliders' },
];

const PHOTO = new URL('../../../assets/aditya-sm.jpg', import.meta.url).href;
const PLAIN = new URL('../../plain.html', import.meta.url).href;

const LINKS = [
  { key: 'github', label: 'GitHub', icon: 'code' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'person' },
  { key: 'npm', label: 'npm', icon: 'box' },
  { key: 'site', label: 'Site', icon: 'globe' },
];

const out = (href, props, ...children) => el('a', { href, target: '_blank', rel: 'noopener', ...props }, ...children);
const empty = (title, text) => el('div', { class: 'app-empty' }, el('strong', {}, title), text ? el('p', {}, text) : null);
const section = (title, ...children) => el('section', { class: 'app-section' }, el('h4', { class: 'app-heading' }, title), ...children);
const list = (value) => (Array.isArray(value) ? value : []);

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ---- resume -------------------------------------------------------------------

function resume(ctx) {
  const content = ctx.data.content || {};
  const p = content.person || {};
  const links = p.links || {};
  const name = p.name || 'Aditya Reddy';

  const photo = el('img', { class: 'cv-photo', src: PHOTO, alt: '', width: 64, height: 64, loading: 'lazy' });
  const avatar = el('div', { class: 'cv-avatar' }, el('span', {}, initials(name)), photo);
  photo.addEventListener('error', () => photo.remove());

  const chips = [
    p.email ? el('a', { class: 'chip-link', href: `mailto:${p.email}` }, icon('mail', 15), 'Email') : null,
    ...LINKS.filter((l) => links[l.key]).map((l) => out(links[l.key], { class: 'chip-link' }, icon(l.icon, 15), l.label)),
  ];

  const career = list(content.career);
  const skills = list(content.skills);
  const about = list(content.about);
  const story = list(content.story);

  return {
    nodes: [
      el(
        'header',
        { class: 'cv-head' },
        avatar,
        el(
          'div',
          { class: 'cv-id' },
          el('h3', {}, name),
          p.title ? el('p', { class: 'cv-title' }, p.title) : null,
          p.location ? el('p', { class: 'cv-place' }, icon('pin', 13), p.location) : null,
        ),
      ),
      p.tagline ? el('p', { class: 'cv-tagline' }, p.tagline) : null,
      el('div', { class: 'chip-row' }, chips),
      out(PLAIN + '?print=1', { class: 'ui-btn primary wide' }, icon('download', 17), 'Download as PDF'),
      about.length ? section('About', about.map((text) => el('p', { class: 'app-text' }, text))) : null,
      career.length
        ? section(
            'Experience',
            el(
              'ol',
              { class: 'timeline' },
              career.map((job) =>
                el(
                  'li',
                  {},
                  job.period ? el('span', { class: 'timeline-when' }, job.period) : null,
                  el('strong', {}, job.role || ''),
                  el('span', { class: 'timeline-where' }, [job.org, job.place].filter(Boolean).join(', ')),
                  list(job.points).map((point) => el('p', {}, point)),
                ),
              ),
            ),
          )
        : null,
      skills.length
        ? section(
            'Skills',
            skills.map((group, i) =>
              el(
                'div',
                { class: 'skill-group' },
                group.group ? el('span', { class: 'skill-label' }, group.group) : null,
                el('div', { class: 'chip-row' }, list(group.items).map((item) => el('span', { class: i === 0 ? 'chip strong' : 'chip' }, item))),
              ),
            ),
          )
        : null,
      story.length
        ? section(
            'How I got here',
            el('ol', { class: 'beats' }, story.map((beat) => el('li', {}, el('strong', {}, beat.heading || ''), el('p', {}, beat.text || '')))),
          )
        : null,
      !about.length && !career.length && !skills.length ? empty('The resume file is empty.', "That's a bug, not a statement.") : null,
    ],
  };
}

// ---- contributions --------------------------------------------------------------

function repoLink(repo) {
  const [owner, ...rest] = String(repo).split('/');
  const name = rest.join('/');
  return out(
    `https://github.com/${repo}`,
    { class: 'pr-repo' },
    name ? el('span', { class: 'pr-owner' }, `${owner}/`) : null,
    name ? el('wbr') : null,
    el('strong', {}, name || owner),
  );
}

function contributions(ctx) {
  const c = ctx.data.content?.contributions || {};
  const groups = groupContributions(c);
  const mergedTotal = list(c.merged).length;
  const openTotal = list(c.open).length;
  if (!groups.length) {
    return { nodes: [empty('No public pull requests to list yet.', 'When one goes up, it shows here with a link.')] };
  }

  let mode = 'all';
  let query = '';
  const results = el('div', { class: 'pr-groups' });
  const count = el('p', { class: 'pr-count', 'aria-live': 'polite' });

  const row = (pr, status) =>
    el(
      'li',
      { class: `pr pr-${status}` },
      el('span', { class: 'pr-state', title: status === 'merged' ? 'Merged' : 'Open' }, icon(status === 'merged' ? 'merge' : 'pull', 15)),
      el(
        'div',
        { class: 'pr-main' },
        pr.url ? out(pr.url, { class: 'pr-title' }, pr.title || pr.url) : el('span', { class: 'pr-title' }, pr.title || ''),
        el('span', { class: 'pr-meta' }, [prNumber(pr.url), status === 'merged' ? 'merged' : 'open', prettyDate(pr.date)].filter(Boolean).join(' · ')),
      ),
    );

  function paint() {
    const q = query.trim().toLowerCase();
    const hit = (pr, repo) => !q || `${repo} ${pr.title || ''}`.toLowerCase().includes(q);
    let shown = 0;
    const cards = [];
    for (const g of groups) {
      const merged = mode === 'open' ? [] : g.merged.filter((pr) => hit(pr, g.repo));
      const open = mode === 'merged' ? [] : g.open.filter((pr) => hit(pr, g.repo));
      if (!merged.length && !open.length) continue;
      shown += merged.length + open.length;
      cards.push(
        el(
          'section',
          { class: 'pr-group' },
          el(
            'header',
            {},
            repoLink(g.repo),
            el(
              'span',
              { class: 'pr-tally' },
              g.merged.length ? el('span', { class: 'tally merged' }, `${g.merged.length} merged`) : null,
              g.open.length ? el('span', { class: 'tally open' }, `${g.open.length} open`) : null,
            ),
          ),
          el('ul', {}, merged.map((pr) => row(pr, 'merged')), open.map((pr) => row(pr, 'open'))),
        ),
      );
    }
    const total = mergedTotal + openTotal;
    count.textContent = shown === total ? '' : `${shown} of ${total}`;
    results.replaceChildren(...(cards.length ? cards : [empty('Nothing matches that.', 'Try a repo name, or a word from a title.')]));
  }

  const tabs = [
    ['all', 'All'],
    ['merged', 'Merged'],
    ['open', 'Open'],
  ].map(([id, label]) =>
    el(
      'button',
      {
        class: 'seg-btn',
        type: 'button',
        'aria-pressed': String(id === mode),
        onclick: (e) => {
          mode = id;
          for (const b of tabs) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          ctx.audio?.sfx?.('ui_tap');
          paint();
        },
      },
      label,
    ),
  );

  const search = el('input', {
    class: 'app-search-input',
    type: 'search',
    placeholder: 'Search pull requests',
    'aria-label': 'Search pull requests',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (e) => {
      query = e.target.value;
      paint();
    },
  });

  paint();
  return {
    nodes: [
      el(
        'div',
        { class: 'tiles' },
        el('div', { class: 'tile' }, el('strong', {}, String(mergedTotal)), el('span', {}, 'Merged')),
        el('div', { class: 'tile' }, el('strong', {}, String(openTotal)), el('span', {}, 'Open')),
        el('div', { class: 'tile' }, el('strong', {}, String(groups.length)), el('span', {}, groups.length === 1 ? 'Project' : 'Projects')),
      ),
      el('p', { class: 'app-note' }, "Pull requests to other people's projects. Every row links to the real thing."),
      el('label', { class: 'app-search' }, icon('search', 16), search),
      el('div', { class: 'seg-row' }, el('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' }, tabs), count),
      results,
    ],
  };
}

// ---- articles -------------------------------------------------------------------

function articles(ctx) {
  const rows = list(ctx.data.content?.articles);
  if (!rows.length) {
    return { nodes: [empty('Nothing published yet.', 'When something is, it goes here first.')] };
  }
  return {
    nodes: rows.map((a) =>
      el(
        'article',
        { class: 'post' },
        el(
          'div',
          { class: 'post-top' },
          a.status ? el('span', { class: 'tag' }, a.status) : null,
          a.date ? el('span', { class: 'post-date' }, prettyDate(a.date)) : null,
        ),
        el('h3', {}, a.title || 'Untitled'),
        a.summary ? el('p', { class: 'app-text' }, a.summary) : null,
        a.url ? out(a.url, { class: 'ui-btn' }, 'Read it', icon('external', 15)) : el('p', { class: 'post-none' }, 'No link yet. It gets one when it is out.'),
      ),
    ),
  };
}

// ---- judging --------------------------------------------------------------------

function judging(ctx) {
  const rows = list(ctx.data.content?.judging);
  if (!rows.length) {
    return {
      nodes: [
        el(
          'div',
          { class: 'app-empty tall' },
          el('span', { class: 'app-empty-ico' }, icon('medal', 30)),
          el('strong', {}, 'Nothing to show here yet.'),
          el('p', {}, "No judging on record, so the frames on the wall stay empty. I'd rather leave a gap than pad it."),
        ),
      ],
    };
  }
  return {
    nodes: rows.map((j) => {
      const title = j.title || j.name || j.role || 'Judging';
      const where = [j.org || j.event, j.place].filter(Boolean).join(', ');
      const when = j.date || j.year || j.period;
      return el(
        'article',
        { class: 'post' },
        el('div', { class: 'post-top' }, when ? el('span', { class: 'post-date' }, prettyDate(when)) : null),
        el('h3', {}, title),
        where ? el('p', { class: 'app-text' }, where) : null,
        j.summary || j.note ? el('p', { class: 'app-text' }, j.summary || j.note) : null,
        j.url ? out(j.url, { class: 'ui-btn' }, 'See it', icon('external', 15)) : null,
      );
    }),
  };
}

// ---- portfolio ------------------------------------------------------------------

function portfolio(ctx) {
  const rows = list(ctx.data.content?.projects);
  if (!rows.length) {
    return { nodes: [empty('No projects listed yet.', 'They show up here when there is something to link to.')] };
  }
  return {
    nodes: rows.map((p) => {
      const stats = statRows(p.stats);
      const onGitHub = /github\.com/.test(p.url || '');
      return el(
        'article',
        { class: 'project' },
        el('h3', {}, p.name || 'Project'),
        p.summary ? el('p', { class: 'app-text' }, p.summary) : null,
        el(
          'div',
          { class: 'btn-row' },
          p.demo ? out(p.demo, { class: 'ui-btn primary' }, 'See it live', icon('external', 15)) : null,
          p.url ? out(p.url, { class: 'ui-btn' }, onGitHub ? 'Code' : 'Open', icon('external', 15)) : null,
        ),
        stats.length
          ? el('dl', { class: 'stats' }, stats.map((s) => el('div', {}, el('dt', {}, s.label), el('dd', {}, s.value))))
          : null,
        list(p.highlights).length ? el('ul', { class: 'points' }, p.highlights.map((h) => el('li', {}, h))) : null,
      );
    }),
  };
}

// ---- settings -------------------------------------------------------------------

function toggle(label, onChange) {
  const button = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': 'false' }, el('i'));
  button.addEventListener('click', () => onChange(button.getAttribute('aria-checked') !== 'true'));
  return {
    button,
    set: (on) => button.setAttribute('aria-checked', String(!!on)),
  };
}

function settings(ctx, phone) {
  const { state, bus, engine } = ctx;
  const story = ctx.data.story || {};
  const sfx = (name) => ctx.audio?.sfx?.(name);
  const row = (title, note, control, extra = '') =>
    el('div', { class: `set-row ${extra}` }, el('div', { class: 'set-text' }, el('strong', {}, title), note ? el('span', {}, note) : null), control);

  const volume = el('input', {
    class: 'slider',
    type: 'range',
    min: '0',
    max: '100',
    step: '1',
    'aria-label': 'Music volume',
    oninput: (e) => {
      state.set({ volume: Number(e.target.value) / 100 });
      paintSlider();
    },
  });
  const volumeText = el('span', { class: 'set-value' });
  const paintSlider = () => {
    volume.style.setProperty('--fill', `${volume.value}%`);
    volumeText.textContent = `${volume.value}`;
  };

  const mute = toggle('Mute', (on) => {
    state.set({ muted: on });
    sfx('ui_tap');
  });
  const dnd = toggle(story.storm?.dnd?.label || 'Do not disturb', (on) => {
    phone.setDnd(on);
    sfx('ui_tap');
  });

  const qualityNote = el('span');
  const qualityButtons = [
    ['low', 'Low'],
    ['auto', 'Auto'],
    ['high', 'High'],
  ].map(([id, label]) =>
    el(
      'button',
      {
        class: 'seg-btn',
        type: 'button',
        dataset: { quality: id },
        onclick: () => {
          if (id === 'auto') engine.quality.setAuto();
          else engine.quality.set(id);
          sfx('ui_tap');
          sync();
        },
      },
      label,
    ),
  );

  const restartBox = el('div', { class: 'set-confirm', hidden: true });
  const restartButton = el(
    'button',
    {
      class: 'ui-btn',
      type: 'button',
      onclick: () => {
        restartBox.hidden = false;
        restartButton.hidden = true;
        restartBox.querySelector('button')?.focus();
      },
    },
    icon('restart', 16),
    'Restart',
  );
  restartBox.append(
    el(
      'button',
      {
        class: 'ui-btn danger',
        type: 'button',
        onclick: () => {
          restartBox.hidden = true;
          restartButton.hidden = false;
          phone.close();
          bus.emit('day:restart', {});
        },
      },
      'Yes, restart',
    ),
    el(
      'button',
      {
        class: 'ui-btn',
        type: 'button',
        onclick: () => {
          restartBox.hidden = true;
          restartButton.hidden = false;
          restartButton.focus();
        },
      },
      'Never mind',
    ),
  );

  function sync() {
    if (document.activeElement !== volume) volume.value = String(Math.round(state.volume * 100));
    paintSlider();
    mute.set(state.muted);
    dnd.set(state.dnd);
    const q = engine.quality;
    const picked = q.auto ? 'auto' : q.tier === 'high' ? 'high' : q.tier === 'medium' ? '' : 'low';
    for (const b of qualityButtons) b.setAttribute('aria-pressed', String(b.dataset.quality === picked));
    qualityNote.textContent = q.auto
      ? `Auto drops the detail when frames get slow. Running at ${q.tier} now.`
      : `Fixed at ${q.tier}. Auto picks for you.`;
  }

  const keys = [
    ['WASD', 'Walk. Arrows work too, or click the floor.'],
    ['E', 'Use the thing in front of you'],
    ['P', 'Phone'],
    ['M', 'Mute'],
    ['Esc', 'Put the phone away'],
  ];

  sync();
  return {
    sync,
    nodes: [
      section(
        'Sound',
        row('Music volume', null, el('div', { class: 'set-slider' }, volume, volumeText), 'stack'),
        row('Mute', 'M does the same.', mute.button),
      ),
      section('Notifications', row(story.storm?.dnd?.label || 'Do not disturb', 'Blocks the junk. A page still gets through.', dnd.button)),
      section('Graphics', row('Quality', qualityNote, el('div', { class: 'seg', role: 'group', 'aria-label': 'Quality' }, qualityButtons), 'stack')),
      section('The day', row('Restart the day', 'Back to 07:00. The score goes too.', el('div', { class: 'set-restart' }, restartButton, restartBox))),
      section('Keys', el('dl', { class: 'keys' }, keys.map(([key, what]) => el('div', {}, el('dt', {}, el('span', { class: 'kbd' }, key)), el('dd', {}, what))))),
      el('p', { class: 'app-note center' }, 'Rather read than play? ', out(PLAIN, {}, 'The plain page'), ' has all of it.'),
    ],
  };
}

const VIEWS = { resume, contributions, articles, judging, portfolio, settings };

// Builds one app. Gives back { nodes, sync? }.
export function renderApp(id, ctx, phone) {
  const view = VIEWS[id];
  if (!view) return { nodes: [] };
  try {
    return view(ctx, phone);
  } catch (err) {
    console.error(`phone app "${id}" failed`, err);
    return { nodes: [empty("This app didn't open.", 'The plain page has the same content.')] };
  }
}
