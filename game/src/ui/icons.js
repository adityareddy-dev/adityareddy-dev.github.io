// Small line icons, drawn here so nothing has to be downloaded.
const PATHS = {
  bolt: '<path d="M13 2.5 4.5 13.5h6.2l-1.2 8L18 10.5h-6.2z" fill="currentColor" stroke="none"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
  scribble: '<path d="M3 15c1.4-6 3.6-6 4.6-.6s2.6 3.8 3.6-2 3-4.6 4 .8 2.6 3.4 5.3-3.2"/>',
  speaker: '<path d="M4 9.5v5h3.5l5 4v-13l-5 4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.6 6.4a8.2 8.2 0 0 1 0 11.2"/>',
  speakerOff: '<path d="M4 9.5v5h3.5l5 4v-13l-5 4z"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
  moon: '<path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  external: '<path d="M14 5h5v5M19 5l-8.5 8.5M11 7H6.5A1.5 1.5 0 0 0 5 8.5v9A1.5 1.5 0 0 0 6.5 19h9a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 8 8 5.5L20 8"/>',
  code: '<path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3.2 3.2 3.2 13.8 0 17M12 3.5c-3.2 3.2-3.2 13.8 0 17"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  restart: '<path d="M5.2 13a7 7 0 1 0 1.7-5.5"/><path d="M5 4.5v4h4"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  merge: '<circle cx="7" cy="6" r="2.2"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="13" r="2.2"/><path d="M7 8.2v7.6M7 8.2c0 3.4 2.8 4.8 7.8 4.8"/>',
  pull: '<circle cx="7" cy="6" r="2.2"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M7 8.2v7.6M17 15.8V10a3 3 0 0 0-3-3h-2.5M13.5 4.5 11 7l2.5 2.5"/>',
  article: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="m9 13.5-1.5 7.5 4.5-2.5 4.5 2.5-1.5-7.5"/>',
  resume: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.8" r="2"/><path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14.5 10h3.5M14.5 13.5h3.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  sliders: '<path d="M4.5 7h8M17.5 7h2M4.5 12h2M11.5 12h8M4.5 17h6M15.5 17h4"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="13" cy="17" r="2.2"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  flame: '<path d="M12 3c.8 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-1.9.9-3 1.6-4.4C9.6 10.2 11.2 8.6 12 3z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 5-4.5 3.5 3 2.5-2 4 3.5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
  keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10.5h.01M10.3 10.5h.01M13.7 10.5h.01M17 10.5h.01M8 14h8"/>',
};

const NS = 'http://www.w3.org/2000/svg';

// icon('moon') gives an svg element that takes its colour from the text around it.
export function icon(name, size = 18) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ico', `ico-${name}`);
  svg.innerHTML = PATHS[name] || '';
  return svg;
}

export const hasIcon = (name) => name in PATHS;
