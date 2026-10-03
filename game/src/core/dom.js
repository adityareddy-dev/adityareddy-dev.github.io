const sheets = new Map();

// Adds a stylesheet once. Pass import.meta.url as base to load a file beside your module.
export function loadCSS(href, base = document.baseURI) {
  const url = new URL(href, base).href;
  if (!sheets.has(url)) {
    sheets.set(
      url,
      new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve(true);
        link.onerror = () => {
          console.warn(`Stylesheet did not load: ${url}`);
          resolve(false);
        };
        document.head.append(link);
      }),
    );
  }
  return sheets.get(url);
}

// el('button', { class: 'btn', onclick: fn }, 'Text') builds an element.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Swaps {name} in a string for values. Unknown names stay as they are.
export function fill(text, values = {}) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}
