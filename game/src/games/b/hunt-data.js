// Built-in copy for the hunt, used when story.json has nothing. The shop is made up.

export const FALLBACK = {
  shop: {
    name: 'Squeaky Curd Outfitters',
    tagline: "Cheese curds, shipped cold, to people who can't wait.",
    note: 'Made up. Any resemblance to a real cheese shop is a coincidence and a compliment.',
  },
  incident: {
    title: 'Checkout is slow',
    summary: 'Customers click Place order and nothing happens for over a second. Then they click it again.',
    interaction: 'click on button.place-order',
  },
  timeLimitSec: 60,
  wrongGuessPenaltySec: 8,
  lowFocusClueDelayMs: 1500,
  points: { solve: 300, secondsLeftBonus: 3, wrongGuess: -40, timeout: 60, earlyCall: 60 },
  suspects: [
    { id: 'CurdCarousel', label: '<CurdCarousel>', desc: 'Spins product photos up top.', alibi: "It's above the fold and wasn't touched by the click." },
    { id: 'ChatBubble', label: '<ChatBubble>', desc: 'A support widget that says hi every 30 seconds.', alibi: 'It runs on a timer. The click barely waited before its handler started.' },
    { id: 'CouponField', label: '<CouponField>', desc: 'Checks codes like SQUEAK10.', alibi: 'It only does work when you type in it. Nobody typed.' },
    { id: 'ShippingEstimator', label: '<ShippingEstimator>', desc: 'Guesses how long cold cheese takes to arrive.', alibi: 'It did its work on the address step. It was idle during the click.' },
    { id: 'CartSummary', label: '<CartSummary>', desc: 'Adds up the curds.', alibi: "It re-rendered once, in 6 ms. That's allowed." },
    { id: 'PlaceOrderButton', label: '<PlaceOrderButton>', desc: "The button everyone's clicking twice.", alibi: "It's where the click landed, not where the time went." },
    { id: 'CurdConfetti', label: '<CurdConfetti>', desc: 'Throws tiny cheese curds across the screen when you order. Added last week.', alibi: null },
  ],
  culprit: 'CurdConfetti',
  clues: [
    { id: 'clue-input', text: "Input delay was 38 ms. The page wasn't busy when the click arrived.", meaning: 'So nothing running in the background held the click up.', clears: ['ChatBubble', 'CurdCarousel'] },
    { id: 'clue-processing', text: "Processing took 1,012 ms. Nearly all the time went into the click's own handlers.", meaning: "So it's something that runs because of this click, not something that ran earlier.", clears: ['CouponField', 'ShippingEstimator'] },
    { id: 'clue-render', text: 'During that click one component mounted 4,000 children. Another re-rendered once, in 6 ms.', meaning: "Adding up a cart doesn't take 4,000 anything.", clears: ['CartSummary', 'PlaceOrderButton'] },
  ],
  wrongGuess: ["Not that one. It's got an alibi, read it.", "Nope. The numbers don't point there."],
  readout: {
    header: 'slow interaction found',
    lines: [
      'interaction    click on button.place-order',
      'total          1,284 ms   (poor)',
      'input delay       38 ms',
      'processing     1,012 ms',
      'presentation     234 ms',
      '',
      'blame          <CurdConfetti>   91% of processing',
      'where          onPlaceOrder > celebrate()   CurdConfetti.jsx:42',
      'what           mounted 4,000 confetti curds before sending the order',
      '',
      'note           The order had not been sent yet. It celebrated first.',
    ],
    numbers: { totalMs: 1284, inputDelayMs: 38, processingMs: 1012, presentationMs: 234, blameShare: 0.91 },
    verdict: "It's <CurdConfetti>. Somebody throws a party on the main thread before the order even leaves the building.",
    fixHint: 'Send the order first. Then confetti, a lot less of it, after the next paint.',
  },
  after: {
    label: 'After the fix',
    lines: [
      'interaction    click on button.place-order',
      'total             96 ms   (good)',
      'input delay       31 ms',
      'processing        41 ms',
      'presentation      24 ms',
    ],
    numbers: { totalMs: 96, inputDelayMs: 31, processingMs: 41, presentationMs: 24 },
  },
  timeout: "Out of time. The readout names it anyway, the tool's faster than I am today.",
  solved: ['Confetti. A second of everyone\'s life, per order, for confetti.'],
};

// One of these works. story.json can bring its own list under rounds.hunt.fixes.
export const FIXES = [
  {
    id: 'order-first',
    correct: true,
    label: 'Send the order first. Throw the confetti after the next paint, and far less of it.',
    reply: 'The click answers first now. The party waits its turn.',
  },
  {
    id: 'memo',
    label: 'Wrap <CurdConfetti> in React.memo.',
    reply: "It mounts fresh on every order, so there's nothing for memo to skip. Still slow.",
  },
  {
    id: 'spinner',
    label: 'Show a spinner on the button while it works.',
    reply: "The spinner can't paint either. The thread is busy throwing curds.",
  },
];

// What the pretend page costs when you poke at it. Milliseconds, give or take.
export const QUICK = {
  'button.carousel-next': 18,
  'button.carousel-prev': 17,
  'button.qty-plus': 14,
  'button.qty-minus': 13,
  'button.apply-coupon': 31,
  'button.chat-bubble': 22,
};

export const STEPS = ['Feel it', 'Attach the tool', 'Name it', 'Fix it'];

export const HINTS = {
  start: 'Shop like a customer would. One click on this page drags.',
  felt: "That's the one. The graph says when. It can't say who. Attach the tool.",
  attachedCold: "Tool's on. Now click things and watch what it prints.",
  attachedWarm: "Tool's on. Click Place order again.",
  reading: "It's printing. Every line gives somebody an alibi. Name the culprit before the tool does and it's worth more.",
  ready: 'One suspect left without an alibi.',
  named: 'Pick the fix. Only one of these does anything.',
  fixed: 'Fix is in. Click Place order again, go on.',
  verified: 'Same button. It just answers now.',
  timeout: 'Time ran out.',
};
