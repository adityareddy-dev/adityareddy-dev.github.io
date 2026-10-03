// Colours one line of JavaScript or JSX. Good enough for a diff, not a parser.
import { el } from '../../core/dom.js';

const KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'of', 'in',
  'import', 'export', 'from', 'default', 'class', 'extends',
]);
const ATOMS = new Set(['true', 'false', 'null', 'undefined', 'NaN']);

const RULES = [
  ['comment', /\/\/.*/y],
  ['string', /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/y],
  ['tag', /<\/?[A-Za-z][\w.]*|<\/?>/y],
  ['number', /\d+(?:\.\d+)?/y],
  ['word', /[A-Za-z_$][\w$]*/y],
  ['op', /=>|\/>|[-+*/%=!<>&|?:]+/y],
  ['punct', /[{}()[\];,.]/y],
  ['space', /\s+/y],
];

export function tokens(line) {
  const out = [];
  const text = String(line ?? '');
  let i = 0;
  let inTag = false;
  let depth = 0;
  while (i < text.length) {
    let kind = '';
    let value = text[i];
    for (const [name, rule] of RULES) {
      rule.lastIndex = i;
      const m = rule.exec(text);
      if (m) {
        kind = name;
        value = m[0];
        break;
      }
    }
    const rest = text.slice(i + value.length);
    let cls = '';
    if (kind === 'comment') cls = 'c';
    else if (kind === 'string') cls = 's';
    else if (kind === 'number') cls = 'n';
    else if (kind === 'tag') {
      cls = 't';
      inTag = /[A-Za-z]/.test(value);
      depth = 0;
    } else if (kind === 'word') {
      if (KEYWORDS.has(value)) cls = 'k';
      else if (ATOMS.has(value)) cls = 'n';
      else if (inTag && depth === 0 && rest[0] === '=') cls = 'a';
      else if (/^\s*\(/.test(rest)) cls = 'f';
      else if (/^[A-Z]/.test(value)) cls = 'y';
    } else if (kind === 'op') {
      if (inTag && depth === 0 && (value === '>' || value === '/>')) {
        cls = 't';
        inTag = false;
      } else cls = 'o';
    } else if (kind === 'punct') {
      cls = 'p';
      if (inTag && value === '{') depth += 1;
      if (inTag && value === '}') depth = Math.max(0, depth - 1);
    }
    out.push({ text: value, cls });
    i += value.length;
  }
  return out;
}

// A <code> element with one span per coloured token.
export function highlight(line) {
  const code = el('code');
  for (const token of tokens(line)) {
    code.append(token.cls ? el('span', { class: `hl-${token.cls}` }, token.text) : document.createTextNode(token.text));
  }
  return code;
}
