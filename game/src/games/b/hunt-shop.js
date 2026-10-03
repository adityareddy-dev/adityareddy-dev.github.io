// The pretend checkout page inside a pretend browser. Nothing here talks to anything real.
import { el } from '../../core/dom.js';
import { fitCanvas } from './kit.js';

const PRODUCTS = [
  { name: 'Classic white', price: 9, tone: '#f3e3a6' },
  { name: 'Garlic dill', price: 9.5, tone: '#dfe39a' },
  { name: 'Cajun heat', price: 10, tone: '#f0b06c' },
  { name: 'Yellow cheddar', price: 9, tone: '#f5c542' },
];
const CART = [
  { name: 'Classic white curds', unit: '1 lb bag', price: 9, qty: 2 },
  { name: 'Garlic dill curds', unit: '1 lb bag', price: 9.5, qty: 1 },
];
const SHIPPING = 12;
const CODE = 'SQUEAK10';
const CURD_TONES = ['#f3e3a6', '#f5c542', '#f0b06c', '#fff3c9', '#e9d27a'];

const money = (n) => `$${n.toFixed(2)}`;

function comp(name, ...children) {
  return el('div', { class: 'comp', dataset: { comp: name } }, el('span', { class: 'comp-tag', 'aria-hidden': 'true' }, `<${name}>`), ...children);
}

export function createShop({ shop, onAct, signal }) {
  let frozen = false;
  let slide = 0;
  let slideT = 0;
  let chatT = 24;
  let chatShow = 0;
  let bannerT = 0;
  let discount = 0;
  const qty = CART.map((item) => item.qty);
  const curds = [];

  // Every click on the page goes through here. While the page hangs it only counts as an angry click.
  function act(target, name, extra = {}) {
    if (frozen) {
      onAct({ rage: true });
      return false;
    }
    onAct({ target, comp: name, ...extra });
    return true;
  }

  // ---- browser chrome ----
  const slug = String(shop.name || 'shop').toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).join('') || 'shop';
  const tabSpin = el('i', { class: 'hb-spin' });
  const chrome = el(
    'div',
    { class: 'hb-chrome', 'aria-hidden': 'true' },
    el('span', { class: 'hb-dots' }, el('i'), el('i'), el('i')),
    el('span', { class: 'hb-tab' }, tabSpin, el('span', { class: 'hb-fav' }), el('span', { class: 'hb-tab-text' }, `Checkout · ${shop.name}`)),
  );
  const url = el('div', { class: 'hb-url', 'aria-hidden': 'true' }, el('span', { class: 'hb-lock' }), `${slug}.example/checkout`);

  // ---- carousel ----
  const track = el(
    'div',
    { class: 'sp-track' },
    PRODUCTS.map((p) => {
      const pile = el('i', { class: 'sp-curd' });
      pile.style.setProperty('--tone', p.tone);
      return el('div', { class: 'sp-slide' }, el('span', { class: 'sp-photo' }, pile), el('span', { class: 'sp-slide-text' }, el('b', {}, p.name), el('small', {}, `${money(p.price)} a pound`)));
    }),
  );
  const turn = (by) => {
    slide = (slide + by + PRODUCTS.length) % PRODUCTS.length;
    slideT = 0;
    track.style.transform = `translateX(${-slide * 100}%)`;
  };
  const carousel = comp(
    'CurdCarousel',
    el('button', { class: 'sp-arrow', type: 'button', 'aria-label': 'Previous photo', onclick: () => act('button.carousel-prev', 'CurdCarousel') && turn(-1) }, '‹'),
    el('div', { class: 'sp-window' }, track),
    el('button', { class: 'sp-arrow', type: 'button', 'aria-label': 'Next photo', onclick: () => act('button.carousel-next', 'CurdCarousel') && turn(1) }, '›'),
  );
  carousel.classList.add('sp-carousel');

  // ---- cart ----
  const subtotalNode = el('b');
  const totalNode = el('b');
  const lineNodes = [];
  function totals() {
    const subtotal = CART.reduce((sum, item, i) => sum + item.price * qty[i], 0);
    CART.forEach((item, i) => {
      lineNodes[i].count.textContent = String(qty[i]);
      lineNodes[i].sum.textContent = money(item.price * qty[i]);
    });
    subtotalNode.textContent = money(subtotal);
    totalNode.textContent = money(subtotal * (1 - discount) + SHIPPING);
  }
  const change = (i, by, target) => {
    if (!act(target, 'CartSummary')) return;
    qty[i] = Math.min(9, Math.max(1, qty[i] + by));
    totals();
  };
  const cart = comp(
    'CartSummary',
    el(
      'ul',
      { class: 'sp-cart' },
      CART.map((item, i) => {
        const count = el('b');
        const sum = el('span', { class: 'sp-sum' });
        lineNodes.push({ count, sum });
        return el(
          'li',
          {},
          el('span', { class: 'sp-item' }, item.name, el('small', {}, item.unit)),
          el(
            'span',
            { class: 'sp-qty' },
            el('button', { type: 'button', 'aria-label': `One less ${item.name}`, onclick: () => change(i, -1, 'button.qty-minus') }, '−'),
            count,
            el('button', { type: 'button', 'aria-label': `One more ${item.name}`, onclick: () => change(i, 1, 'button.qty-plus') }, '+'),
          ),
          sum,
        );
      }),
    ),
    el('div', { class: 'sp-subtotal' }, el('span', {}, 'Subtotal'), subtotalNode),
  );
  cart.classList.add('sp-cartbox');

  // ---- coupon, shipping, the button ----
  const couponNote = el('small', { class: 'sp-coupon-note' });
  const couponInput = el('input', { class: 'sp-coupon', type: 'text', placeholder: 'Coupon code', 'aria-label': 'Coupon code', maxlength: '12', autocomplete: 'off', spellcheck: false });
  const apply = () => {
    if (!act('button.apply-coupon', 'CouponField')) return;
    const typed = couponInput.value.trim().toUpperCase();
    if (!typed) couponNote.textContent = `Try ${CODE}.`;
    else if (typed === CODE) {
      discount = 0.1;
      couponNote.textContent = 'Ten percent off. Squeak.';
    } else couponNote.textContent = "That's not a code.";
    totals();
  };
  couponInput.addEventListener('keydown', (e) => e.key === 'Enter' && apply(), { signal });
  const coupon = comp('CouponField', el('div', { class: 'sp-coupon-row' }, couponInput, el('button', { type: 'button', class: 'sp-apply', onclick: apply }, 'Apply')), couponNote);
  const shipping = comp('ShippingEstimator', el('span', {}, 'Cold shipping'), el('b', {}, `${money(SHIPPING)}, 2 days`));
  shipping.classList.add('sp-ship');
  const orderButton = el('button', { class: 'sp-order', type: 'button', onclick: () => act('button.place-order', 'PlaceOrderButton', { order: true }) }, el('span', {}, 'Place order'), el('i', { class: 'sp-busy' }));
  const order = comp('PlaceOrderButton', orderButton);

  // ---- chat widget ----
  const chatMsg = el('span', { class: 'sp-chat-msg' }, 'Hi! Need help picking a curd?');
  const chat = comp(
    'ChatBubble',
    chatMsg,
    el(
      'button',
      {
        class: 'sp-chat-btn',
        type: 'button',
        'aria-label': 'Chat',
        onclick: () => {
          if (!act('button.chat-bubble', 'ChatBubble')) return;
          chatMsg.textContent = 'Hi. I say hi every 30 seconds. That is the whole job.';
          chatShow = 3.5;
        },
      },
      el('i'),
    ),
  );
  chat.classList.add('sp-chat');

  // ---- confetti ----
  const canvas = el('canvas', { class: 'sp-confetti-canvas' });
  const confetti = comp('CurdConfetti', canvas);
  confetti.classList.add('sp-confetti');

  const bannerText = el('b');
  const bannerSub = el('small');
  const banner = el('div', { class: 'sp-banner', role: 'status' }, el('i', { 'aria-hidden': 'true' }), el('span', {}, bannerText, bannerSub));
  const note = shop.note ? el('p', { class: 'sp-note' }, shop.note) : null;

  const page = el(
    'div',
    { class: 'hb-page' },
    el('header', { class: 'sp-head' }, el('span', { class: 'sp-logo', 'aria-hidden': 'true' }), el('span', {}, el('b', {}, shop.name), el('small', {}, shop.tagline))),
    el('div', { class: 'sp-grid' }, el('div', { class: 'sp-left' }, carousel, cart), el('div', { class: 'sp-right' }, coupon, shipping, el('div', { class: 'sp-total' }, el('span', {}, 'Total'), totalNode), order)),
    note,
    chat,
    confetti,
    banner,
  );
  const blocker = el('div', { class: 'sp-blocker', hidden: true });
  blocker.addEventListener('pointerdown', () => onAct({ rage: true }), { signal });
  const view = el('div', { class: 'hb-view' }, page, blocker);
  const root = el('div', { class: 'hb-browser' }, chrome, url, view);
  totals();

  function burst(count) {
    const box = canvas.getBoundingClientRect();
    const from = orderButton.getBoundingClientRect();
    const x0 = from.left + from.width / 2 - box.left;
    const y0 = from.top - box.top;
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.5;
      const speed = 150 + Math.random() * 330;
      curds.push({
        x: x0 + (Math.random() - 0.5) * from.width * 0.8,
        y: y0,
        vx: Math.cos(angle) * speed - 60,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 3.5,
        spin: Math.random() * 6,
        turn: (Math.random() - 0.5) * 9,
        tone: CURD_TONES[Math.floor(Math.random() * CURD_TONES.length)],
        age: 0,
      });
    }
  }

  function drawCurds(dt) {
    if (!curds.length && !canvas.dataset.dirty) return;
    const { g, width: W, height: H } = fitCanvas(canvas);
    g.clearRect(0, 0, W, H);
    canvas.dataset.dirty = curds.length ? '1' : '';
    for (let i = curds.length - 1; i >= 0; i -= 1) {
      const c = curds[i];
      c.age += dt;
      c.vy += 620 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.spin += c.turn * dt;
      if (c.y > H + 12 || c.age > 3.2) {
        curds.splice(i, 1);
        continue;
      }
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.spin);
      g.fillStyle = c.tone;
      g.strokeStyle = 'rgba(120, 84, 10, 0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(0, 0, c.r * 1.25, c.r * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  return {
    root,
    orderButton,
    update(dt) {
      if (!frozen) {
        slideT += dt;
        if (slideT > 3.4) turn(1);
        chatT += dt;
        if (chatT >= 30) {
          chatT = 0;
          chatMsg.textContent = 'Hi! Need help picking a curd?';
          chatShow = 3;
        }
        if (chatShow > 0) chatShow -= dt;
        chat.classList.toggle('talking', chatShow > 0);
        if (bannerT > 0) {
          bannerT -= dt;
          if (bannerT <= 0) banner.classList.remove('show');
        }
      }
      drawCurds(frozen ? 0 : dt);
    },
    setFrozen(on) {
      const hadFocus = root.contains(document.activeElement) ? document.activeElement : null;
      frozen = !!on;
      root.classList.toggle('frozen', frozen);
      blocker.hidden = !frozen;
      page.inert = frozen;
      if (!frozen) orderButton.focus({ preventScroll: true });
      else if (hadFocus) hadFocus.blur();
    },
    placed({ text, sub = '', count = 0 }) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.add('show');
      bannerT = sub.length > 30 ? 2.6 : 1.6;
      if (count) burst(count);
    },
    light(id, on) {
      const node = root.querySelector(`.comp[data-comp="${id}"]`);
      if (node) node.classList.toggle('lit', !!on);
    },
    mark(id, kind) {
      const node = root.querySelector(`.comp[data-comp="${id}"]`);
      if (node) node.dataset.mark = kind || '';
    },
    nudge(on) {
      orderButton.classList.toggle('nudge', !!on);
    },
    get frozen() {
      return frozen;
    },
  };
}
