import { createGuide } from './guide.js';
import { createStorm } from './storm.js';
import { createDeployRound } from './deploy.js';

const FAST = 55;
const PATIENCE = 200;
const WAKE_WAIT = 16;
const JUNK_WAIT = 45;
const PAGE_WAIT = 30;
const NUDGE_AFTER = 9;
const HINT_AFTER = 20;
const IDLE_AFTER = 24;
const WIN_SECONDS = 7;
const WIN_PAUSE = 1800;
const RUN_FOR = 2600;
const BENCH_WAIT = 450;
const COACH = { wake: 'move', phoneJunk: 'phone', coffee: 'use' };
const FIELD_LABELS = { what: 'What', why: 'Why', fix: 'Fix', proof: 'Proof' };
const PHONE_TASKS = ['dismissNotifications', 'storm', 'acknowledgePage'];

const num = (value) => Number(value) || 0;
const last = (list) => (Array.isArray(list) && list.length ? list[list.length - 1] : '');

// Runs the day in data/story.json, one beat after another.
export function createDirector(ctx) {
  const { bus, state, clock, rounds, ui, audio, player, interact, config, engine } = ctx;
  const story = ctx.data.story || {};
  const beats = (Array.isArray(story.beats) ? story.beats : []).filter((b) => b && b.id);
  const byId = new Map(beats.map((b) => [b.id, b]));
  const order = new Map(beats.map((b, i) => [b.id, i]));
  const quests = Array.isArray(story.sideQuests) ? story.sideQuests : [];
  const things = story.objects || {};
  const skips = story.skips || {};
  const endCopy = story.end || {};
  const scoring = story.scoring || {};
  const copy = scoring.writeupCard || {};
  const doorCopy = story.door || {};
  const idleLines = Array.isArray(story.idle) ? story.idle : [];
  const highAt = config.meters.irritation.highAt ?? 70;
  const perHour = config.clock.secondsPerGameHour || 26;
  const lastCall = config.clock.end - 100;
  const roamIndex = beats.findIndex((b) => b.task?.type === 'freeRoam');
  const anchors = () => ctx.world?.anchors || {};
  const minutes = (time, fallback) => clock.parse(time, fallback);

  rounds.register(createDeployRound(ctx));
  const guide = createGuide(ctx, { onSkip: () => skip() });
  const storm = createStorm(ctx, { tell });

  // The stations that only run a round: the beat each one belongs to.
  const stationOf = {};
  for (const b of beats) {
    const id = b.trigger?.object;
    if (b.round && id && !stationOf[id] && !interact.get(id)?.app) stationOf[id] = b;
  }

  const coached = new Set();
  const waiting = [];
  const basePrompts = new Map();
  let epoch = 0;
  let busy = 0;
  let beat = null;
  let stage = 'idle';
  let target = null;
  let at = 0;
  let age = 0;
  let deadline = Infinity;
  let ffTo = null;
  let nudged = false;
  let hinted = false;
  let ended = false;
  let endData = null;
  let endOpen = false;
  let incident = false;
  let history = {};
  let questState = {};
  let uses = {};
  let replayed = {};
  let doorTries = 0;
  let doorThought = false;
  let genericSkips = 0;
  let mood = null;
  let moodHold = 0;
  let still = 0;
  let idleNext = 0;

  // ---- saying things ---------------------------------------------------------------

  // A line at the bottom of the screen. Waits if a round or a card is in the way.
  let cardsUp = 0;
  const covered = () => !!state.round || cardsUp > 0;
  function tell(text, seconds) {
    if (!text) return;
    if (covered()) waiting.push([text, seconds]);
    else ui.toast(text, seconds);
  }
  function flush() {
    if (covered()) return;
    for (const [text, seconds] of waiting.splice(0)) ui.toast(text, seconds);
  }
  bus.on('round:end', () => window.setTimeout(flush, 0));
  bus.on('card:open', () => {
    cardsUp += 1;
  });
  bus.on('card:close', () => {
    cardsUp = Math.max(0, cardsUp - 1);
    window.setTimeout(flush, 0);
  });

  function think(text, seconds) {
    if (!text) return;
    still = 0;
    player.say(text, seconds);
  }

  // ---- music -------------------------------------------------------------------------

  function tune() {
    if (moodHold > 0) return;
    let want = 'chill';
    if (ended) want = 'night';
    else if (beat && stage !== 'lead') {
      want = beat.music || 'chill';
      if (want === 'win') want = incident ? 'urgent' : 'chill';
    }
    if (want === 'chill' && state.irritation >= highAt) want = 'irritated';
    if (want === mood) return;
    mood = want;
    audio.setMood(want);
  }
  bus.on('meter:high', tune);
  bus.on('meter:ok', tune);

  // The edge of the screen warms up when he's had enough, and pulses while the page is open.
  const vignette = document.getElementById('vignette');
  function tint() {
    if (!vignette) return;
    const live = state.phase === 'playing' && !ended;
    vignette.classList.toggle('is-hot', live && state.irritation >= highAt);
    vignette.classList.toggle('is-urgent', live && incident);
  }
  for (const name of ['meter:high', 'meter:ok', 'incident:start', 'incident:end', 'day:start', 'day:end']) bus.on(name, tint);

  // ---- prompts, the marker and the skip button ---------------------------------------

  const evening = () => roamIndex >= 0 && !!beat && order.get(beat.id) >= roamIndex;

  function questOpen(q) {
    if (questState[q.id] || ended || !beat) return false;
    const now = clock.now;
    if (now < minutes(q.availableFrom, 0) || now > minutes(q.availableUntil, config.clock.end)) return false;
    // A screen with an app on it is busy until the evening.
    return interact.get(q.object)?.app ? evening() : true;
  }

  function setPrompt(id, text) {
    const item = id ? interact.get(id) : null;
    if (!item || !text) return;
    if (!basePrompts.has(id)) basePrompts.set(id, item.prompt);
    item.prompt = text;
  }

  // A round station that has nothing more to give today.
  function spent(id) {
    const b = stationOf[id];
    const c = things[id] || {};
    if (!b || !history[b.id]) return false;
    if (c.limit) return (state.counts[b.round === 'coffee' ? 'coffees' : b.round] || 0) >= c.limit;
    return history[b.id] !== 'skipped' || !!replayed[id];
  }

  function paintPrompts() {
    for (const [id, text] of basePrompts) {
      const item = interact.get(id);
      if (item) item.prompt = text;
    }
    // The bed is for getting up and for the evening. In between it's just a bed.
    const bed = interact.get('bed');
    if (bed) bed.enabled = ended || !beat || roamIndex < 0 || beat.trigger?.type === 'start' || evening();
    if (ended) setPrompt('bed', things.bed?.after);
    else if (beat) {
      for (const [id, c] of Object.entries(things)) {
        if (!c) continue;
        if (c.donePrompt && spent(id)) setPrompt(id, c.donePrompt);
        else if (c.prompt) setPrompt(id, c.prompt);
      }
      const seen = new Set();
      for (const q of quests) {
        if (seen.has(q.object) || !questOpen(q)) continue;
        seen.add(q.object);
        setPrompt(q.object, q.prompt);
      }
      if (beat.task?.type === 'freeRoam') setPrompt(beat.task.exit, beat.task.exitPrompt);
      if (stage !== 'lead') setPrompt(target || (beat.trigger?.type === 'start' ? 'bed' : null), beat.prompt);
    }
    interact.clear();
  }

  function pointAt() {
    if (ended || !beat || stage === 'lead') guide.setTarget(null);
    else if (target) guide.setTarget(target);
    else if (beat.task?.type === 'freeRoam') {
      const open = quests.find(questOpen);
      guide.setTarget(open ? open.object : beat.task.exit);
    } else guide.setTarget(null);
  }

  const showSkip = () => guide.setSkip(!ended && !busy && !!beat && stage !== 'lead');

  // ---- scores and meters -----------------------------------------------------------

  function reward(r) {
    if (!r) return;
    state.set({
      score: state.score + num(r.score),
      energy: state.energy + num(r.energy),
      focus: state.focus + num(r.focus),
      irritation: state.irritation + num(r.irritation),
    });
    for (const [name, n] of Object.entries(r.counts || {})) state.count(name, num(n));
  }

  // Takes a round's result: points, meters, the streak, a face and a line.
  function settle(result, { streak = true, fallback } = {}) {
    const d = result.detail || {};
    if (d.energyMax) state.set({ energyMax: state.energyMax + num(d.energyMax) });
    reward({ score: result.score, energy: d.energy, focus: d.focus, irritation: d.irritation, counts: d.counts });
    if (result.aborted) {
      if (streak) state.set({ streak: 0 });
      player.emote('sweat');
      tell(skips.gaveUp);
      return;
    }
    if (streak && result.success) {
      const cfg = scoring.streaks?.roundsWon || {};
      const run = state.streak + 1;
      const bonus = run >= 2 ? num(cfg.bonusPerStep) * Math.min(run - 1, num(cfg.maxSteps) || run) : 0;
      state.set({ streak: run, score: state.score + bonus });
      if (bonus) audio.sfx('level_up');
    } else if (streak) state.set({ streak: 0 });
    if (result.score > 0) think(`+${result.score}`, 1.6);
    player.emote(d.emote || (result.success ? 'heart' : 'sweat'));
    tell(d.line || fallback, 5);
  }

  // Something that takes over the screen. Gives null if the day ended or restarted meanwhile.
  async function during(work) {
    const mine = epoch;
    busy += 1;
    guide.setSkip(false);
    let out = null;
    try {
      out = await work();
    } finally {
      if (mine === epoch) {
        busy = Math.max(0, busy - 1);
        showSkip();
      }
    }
    return mine === epoch ? out : null;
  }

  // ---- beats -----------------------------------------------------------------------

  function meets(when) {
    if (!when) return false;
    const value = state[when.meter];
    if (typeof value !== 'number') return false;
    if (when.below !== undefined && !(value < when.below)) return false;
    if (when.above !== undefined && !(value > when.above)) return false;
    return true;
  }

  function begin(id, afterWin = false) {
    const raw = byId.get(id);
    if (!raw) {
      finishDay('bed');
      return;
    }
    const variant = (raw.variants || []).find((v) => meets(v.when));
    beat = variant ? { ...raw, ...variant } : raw;
    target = beat.trigger?.type === 'interact' ? beat.trigger.object : null;
    at = minutes(beat.trigger?.at || beat.time, clock.now);
    age = 0;
    nudged = false;
    hinted = false;
    const cap = Math.min(at, lastCall);
    ffTo = clock.now < cap ? cap : null;
    if (beat.trigger?.type === 'time' && clock.now < at) {
      stage = 'lead';
      state.set({ objective: beat.lead || beat.objective || '' });
      paintPrompts();
      pointAt();
      showSkip();
      tune();
      return;
    }
    activate(afterWin);
  }

  function opening(b) {
    const lines = b.dialogue || [];
    if (b.id === 'phoneJunk') return story.intro?.firstMinute?.[1] || lines[0];
    if (b.id === 'coffee') return story.intro?.firstMinute?.[3] || lines[0];
    // The line about do not disturb only makes sense when it's on.
    if (b.task?.type === 'acknowledgePage' && !state.dnd && lines.length > 1) return lines[1];
    return lines[0];
  }

  // afterWin: the last beat just went well, so its moment gets a breath before this one speaks.
  function activate(afterWin = false) {
    const b = beat;
    const type = b.task?.type;
    stage = target ? 'wait' : 'task';
    age = 0;
    // A beat that starts late still gets its full wait, whatever its skip time says.
    deadline = target ? Math.max(minutes(b.skipAt, 0), Math.max(clock.now, at) + PATIENCE) : Infinity;
    state.set({ objective: b.objective || '' });
    bus.emit('beat:start', { id: b.id });
    paintPrompts();
    pointAt();
    showSkip();
    tune();
    const hint = COACH[b.id];
    if (hint && !coached.has(hint)) {
      coached.add(hint);
      guide.coach(hint);
    }
    const open = () => {
      player.emote(b.trigger?.type === 'start' ? b.emote : 'exclaim');
      if (!nudged) think(opening(b));
    };
    if (afterWin) {
      const mine = epoch;
      window.setTimeout(() => {
        if (mine === epoch && beat === b && !ended && !busy && !state.round) open();
      }, WIN_PAUSE);
    } else open();
    if (type === 'dismissNotifications') clearJunk(b);
    else if (type === 'storm') weather(b);
    else if (type === 'acknowledgePage') page(b);
  }

  function complete(outcome, line) {
    const b = beat;
    if (!b || ended) return;
    history[b.id] = outcome;
    guide.hideCoach();
    if (outcome === 'done') reward(b.onDone);
    tell(line, 5);
    bus.emit('beat:done', { id: b.id, skipped: outcome === 'skipped' });
    const chosen = outcome === 'skipped' && b.onSkip && 'next' in b.onSkip ? b.onSkip.next : b.onDone?.next;
    const next = chosen === undefined ? beats[order.get(b.id) + 1]?.id : chosen;
    if (next && byId.has(next)) begin(next, outcome !== 'skipped');
    else finishDay('bed');
  }

  function skipLine(b) {
    const own = b.onSkip?.dialogue?.[0] || skips[b.id];
    if (own) return own;
    const generic = Array.isArray(skips.generic) ? skips.generic : [];
    genericSkips += 1;
    return generic.length ? generic[(genericSkips - 1) % generic.length] : '';
  }

  // Moves the day past a beat nobody finished.
  function giveUp() {
    const b = beat;
    if (!b || ended || stage === 'lead') return;
    const type = b.task?.type;
    if (b.trigger?.type === 'start') {
      player.stand();
      return;
    }
    if (type === 'freeRoam') {
      complete('done');
      return;
    }
    if (type === 'endDay') {
      lightsOut();
      return;
    }
    if (PHONE_TASKS.includes(type)) {
      storm.cancel();
      ui.phone.clear();
    }
    if (type === 'hold') endIncident(false);
    complete('skipped', skipLine(b));
  }

  function skip() {
    if (busy || engine.paused) return;
    giveUp();
  }

  function endIncident(success) {
    if (!incident) return;
    incident = false;
    bus.emit('incident:end', { success });
  }

  // ---- the phone's beats -----------------------------------------------------------

  async function clearJunk(b) {
    const mine = epoch;
    const out = await storm.startJunk(b.task);
    if (mine !== epoch || beat !== b || out.why === 'cancelled') return;
    complete('done', out.why === 'dnd' ? story.storm?.dnd?.onEnable?.[0] : story.intro?.firstMinute?.[2]);
  }

  async function weather(b) {
    const mine = epoch;
    const out = await storm.startStorm();
    if (mine !== epoch || beat !== b || out.why === 'cancelled') return;
    complete('done');
  }

  async function page(b) {
    const mine = epoch;
    incident = true;
    bus.emit('incident:start', {});
    ctx.rig?.shake(0.05, 0.25);
    const out = await storm.sendPage();
    if (mine !== epoch || beat !== b || out.why === 'cancelled') return;
    ui.phone.close();
    complete('done', last(b.dialogue));
  }

  // ---- what happens when he uses the thing the beat is about ---------------------------

  function act() {
    const b = beat;
    const type = b.task?.type;
    ffTo = null;
    if (clock.now < at) clock.set(at);
    if (b.round) playBeat(b);
    else if (b.choice) standup(b);
    else if (type === 'hold') deploy(b);
    else if (type === 'writeup') writeup(b);
    else if (type === 'endDay') lightsOut();
    else {
      player.setAnim('use');
      player.emote(b.emote || 'heart');
      audio.sfx('success');
      complete('done', last(b.dialogue));
    }
  }

  // The gym round starts once he's on the bench, and he gets off it after.
  async function workout(id) {
    const bench = id === 'gym' ? anchors().gymBench : null;
    if (!bench) return rounds.run(id);
    const mine = epoch;
    player.lieAt(bench.position, bench.facing);
    await new Promise((resolve) => window.setTimeout(resolve, BENCH_WAIT));
    if (mine !== epoch) return null;
    const result = await rounds.run(id);
    if (mine === epoch) player.stand();
    return result;
  }

  async function playBeat(b) {
    const result = await during(() => workout(b.round));
    if (!result) return;
    settle(result, { fallback: last(b.dialogue) });
    if (beat === b) complete(result.success ? 'done' : 'failed');
  }

  async function standup(b) {
    const options = b.choice.options || [];
    const chair = anchors().deskChair;
    if (chair) player.sitAt(chair.position, chair.facing);
    const picked = await during(() =>
      ui.showCard({
        type: 'note',
        plain: true,
        heading: b.choice.heading,
        title: b.choice.prompt,
        actions: options.map((o, i) => ({ id: `pick${i}`, label: o.text })),
      }),
    );
    if (picked === null) return;
    player.stand();
    const option = options[num(String(picked).replace('pick', ''))] || options[0] || {};
    reward(option);
    player.emote(b.emote || 'exclaim');
    if (beat === b) complete('done', option.reply);
  }

  async function deploy(b) {
    const result = await during(() => rounds.run('deploy', { task: b.task, lines: b.dialogue, title: b.task?.title }));
    // Closing it early leaves the fix waiting on the desk.
    if (!result || !result.success) return;
    endIncident(beats.some((x) => x.round === 'hunt' && history[x.id] === 'done'));
    mood = 'win';
    moodHold = WIN_SECONDS;
    audio.setMood('win');
    player.emote(b.emote || 'heart');
    if (beat === b) complete('done', last(b.dialogue));
  }

  async function writeup(b) {
    const fields = Object.entries(copy.fields || {}).map(([key, text]) => ({ label: FIELD_LABELS[key] || key, text }));
    const out = await during(() =>
      ui.showCard({
        type: 'note',
        heading: copy.heading,
        title: story.rounds?.hunt?.incident?.title || b.objective,
        fields,
        actions: [{ id: 'file', label: copy.fileButton || 'File it' }],
      }),
    );
    if (out === null) return;
    audio.sfx('stamp');
    player.emote(b.emote || 'exclaim');
    if (beat === b) complete('done', last(b.dialogue));
  }

  function tuckIn() {
    const bed = anchors().bed;
    if (bed) player.lieAt(bed.position, bed.facing);
    player.emote('zzz', 4);
  }

  function lightsOut() {
    tuckIn();
    complete('done');
  }

  // ---- side quests -------------------------------------------------------------------

  async function runQuest(q) {
    if (!q.choice) {
      questState[q.id] = 'done';
      player.setAnim('use');
      reward(q.reward);
      player.emote(q.emote || 'heart');
      audio.sfx('success');
      think(q.intro?.[0]);
      tell(q.done?.[0], 5);
      bus.emit('sidequest:done', { id: q.id });
    } else {
      const options = q.choice.options || [];
      const picked = await during(() =>
        ui.showCard({
          type: 'note',
          plain: true,
          heading: things.sideQuest,
          title: q.title,
          lines: [...(q.intro || []), q.choice.prompt],
          actions: [...options.map((o, i) => ({ id: `pick${i}`, label: o.text })), { id: 'cancel', label: q.later || 'Not now' }],
        }),
      );
      if (picked === null) return;
      const option = picked === 'cancel' ? null : options[num(String(picked).replace('pick', ''))];
      if (!option) questState[q.id] = 'later';
      else {
        questState[q.id] = option.correct ? 'done' : 'missed';
        tell(option.reply, 5);
        if (option.correct) {
          reward(q.reward);
          player.emote(q.emote || 'heart');
          audio.sfx('success');
          bus.emit('sidequest:done', { id: q.id });
        } else {
          player.emote('scribble');
          audio.sfx('fail');
        }
      }
    }
    paintPrompts();
    pointAt();
  }

  // ---- everything else in the house ------------------------------------------------

  async function door() {
    const lines = doorCopy.tryLines || ['403. Staff only.'];
    const line = lines[Math.min(doorTries, lines.length - 1)];
    doorTries += 1;
    audio.sfx('door_locked');
    const o = doorCopy.options || {};
    const action = await during(() =>
      ui.showCard({
        type: 'door',
        title: doorCopy.sign || 'Staff only',
        lines: [line],
        actions: [
          { id: 'leave', label: o.leave?.label || 'Fair enough' },
          { id: 'imAdi', label: o.imAdi?.label || "I'm Adi", href: o.imAdi?.url || 'https://adityareddy.dev/tracker/' },
        ],
      }),
    );
    if (action === 'imAdi') tell(o.imAdi?.confirm, 5);
  }

  async function bedEarly() {
    const c = things.bed || {};
    const action = await during(() =>
      ui.showCard({
        type: 'note',
        title: c.title || 'Call it a day?',
        lines: c.line ? [c.line] : [],
        values: { time: clock.format() },
        actions: [
          { id: 'cancel', label: c.stay || 'Not yet' },
          { id: 'sleep', label: c.sleep || 'Lights out' },
        ],
      }),
    );
    if (action !== 'sleep') return;
    tuckIn();
    finishDay('early');
  }

  async function freePlay(id, late) {
    const result = await during(() => workout(id));
    if (!result) return;
    settle(result, { streak: !!late });
    if (late && !result.aborted) history[late.id] = result.success ? 'done' : 'failed';
    paintPrompts();
  }

  // A round station outside its own beat.
  function station(e) {
    const b = stationOf[e.id];
    if (!b) return false;
    e.claim();
    const c = things[e.id] || {};
    if (order.get(beat.id) < order.get(b.id)) think(things.notYet);
    else if (c.limit) {
      if ((state.counts[b.round === 'coffee' ? 'coffees' : b.round] || 0) >= c.limit) think(c.full);
      else freePlay(b.round);
    } else if (history[b.id] === 'skipped' && !replayed[e.id]) {
      replayed[e.id] = true;
      freePlay(b.round, b);
    } else think(c.again || things.nothing);
    return true;
  }

  // Things with a line or two and nothing else.
  function fiddle(e) {
    const c = things[e.id];
    if (!c || !Array.isArray(c.lines) || !c.lines.length) return false;
    e.claim();
    const n = uses[e.id] || 0;
    uses[e.id] = n + 1;
    think(c.lines[n % c.lines.length]);
    if (n < 2 && !ended) reward({ energy: c.energy, focus: c.focus, irritation: c.irritation });
    const seat = anchors()[e.id];
    if (e.id === 'sofa' && seat) player.sitAt(seat.position, seat.facing);
    else if (e.id === 'treadmill' && seat && player.runAt) {
      player.runAt(seat.position, seat.facing);
      window.setTimeout(() => player.anim === 'sprint' && player.stand(), RUN_FOR);
    } else player.setAnim('use');
    return true;
  }

  bus.on('interact:use', (e) => {
    if (!e || e.handled || busy || state.round) return;
    const id = e.id;
    if (id === 'backOfficeDoor') {
      e.claim();
      door();
      return;
    }
    if (ended) {
      if (id === 'bed') {
        e.claim();
        showEnd();
      } else fiddle(e);
      return;
    }
    if (state.phase !== 'playing' || !beat) return;

    if (stage === 'wait' && id === target) {
      e.claim();
      act();
      return;
    }
    if (stage === 'task' && beat.trigger?.type === 'start' && id === 'bed') {
      e.claim();
      player.stand();
      return;
    }
    // An optional beat steps aside when he goes for the next thing instead.
    const after = stage === 'wait' && beat.optional ? byId.get(beat.onSkip?.next ?? beat.onDone?.next) : null;
    const leaving = beat.task?.type === 'freeRoam' && id === beat.task.exit;
    if (leaving || after?.trigger?.object === id) {
      e.claim();
      if (leaving) complete('done');
      else giveUp();
      if (!ended && stage === 'wait' && target === id) act();
      return;
    }
    const quest = quests.find((q) => q.object === id && questOpen(q));
    if (quest) {
      e.claim();
      runQuest(quest);
      return;
    }
    if (id === 'bed') {
      e.claim();
      bedEarly();
      return;
    }
    if (station(e)) return;
    const done = quests.find((q) => q.object === id && questState[q.id] === 'done' && q.done?.[1]);
    if (done) {
      e.claim();
      think(done.done[1]);
      return;
    }
    fiddle(e);
  });

  bus.on('interact:unhandled', () => tell(things.nothing));

  // Walking into the room a beat is about gets its second line.
  bus.on('room:enter', ({ room } = {}) => {
    if (!beat || ended || nudged || stage !== 'wait' || age < 1 || room !== beat.room) return;
    const lines = beat.dialogue || [];
    if (lines.length < 3 || opening(beat) === lines[1]) return;
    nudged = true;
    think(lines[1]);
  });

  bus.on('interact:focus', (e) => {
    if (state.phase !== 'playing' || !e) return;
    if (e.id === 'backOfficeDoor' && !doorThought) {
      doorThought = true;
      think(doorCopy.adiThought);
    } else if (e.id === 'coffeeMachine' && state.energy < 40) player.emote('coffee');
  });

  bus.on('clock:hour', () => {
    if (state.phase !== 'playing' || busy || ended || !beat) return;
    paintPrompts();
    pointAt();
  });

  // ---- the end of the day ------------------------------------------------------------

  function summary(values) {
    const lines = Array.isArray(scoring.summaryLines) ? scoring.summaryLines : [];
    const did = (round) => beats.some((b) => b.round === round && history[b.id] === 'done');
    const beatDone = (type) => beats.some((b) => b.task?.type === type && history[b.id] === 'done');
    const picks = [
      [10, beatDone('hold')],
      [2, did('hunt')],
      [9, !!state.flag('dndUsed')],
      [8, questState.plant === 'done'],
      [4, values.reviewed > 0],
      [5, beatDone('storm') && !state.flag('dndUsed')],
      [6, beats.some((b) => b.round === 'whiteboard' && history[b.id] === 'failed')],
      [3, beatDone('acknowledgePage')],
      [1, values.dismissed > 0],
      [7, beats.some((b) => b.choice && history[b.id] === 'done')],
    ];
    const middle = picks.filter(([i, ok]) => ok && lines[i]).slice(0, 2).map(([i]) => lines[i]);
    return [lines[0], ...middle, lines.length > 1 ? lines[lines.length - 1] : null].filter(Boolean);
  }

  function finishDay(why) {
    if (ended) return;
    ended = true;
    epoch += 1;
    busy = 0;
    if (rounds.active) rounds.abort('day over');
    storm.cancel();
    endIncident(false);
    beat = null;
    stage = 'ended';
    target = null;
    ffTo = null;
    clock.stop();
    guide.reset();

    const pen = scoring.irritationPenalty || {};
    const over = Math.max(0, state.irritation - num(pen.perPointOver ?? 70));
    const bonus = Math.round(state.energy * num(scoring.energyBonus?.perPointLeftAtEnd));
    state.set({ score: state.score + bonus + Math.round(over * num(pen.points)) });

    const s = scoring.sleepHours || {};
    const coffees = state.counts.coffees || 0;
    const lost = Math.max(0, coffees - num(s.freeCoffees ?? 2)) * num(s.minusPerExtraCoffee ?? 1) + (state.irritation > highAt ? num(s.minusIfIrritationOver70 ?? 1) : 0);
    const sleep = Math.max(num(s.min ?? 4), num(s.base ?? 8) - lost);
    const titles = Array.isArray(scoring.titles) ? scoring.titles : [];
    const rank = [...titles].reverse().find((t) => state.score >= num(t.min)) || titles[0] || { title: '', line: '' };
    const values = {
      sleep,
      coffees,
      shipped: state.counts.shipped || 0,
      reviewed: state.counts.reviewed || 0,
      dismissed: state.counts.dismissed || 0,
    };
    const how = why === 'clock' ? endCopy.clock : why === 'early' ? endCopy.early : null;
    endData = { title: rank.title, line: rank.line, values, lines: [how, rank.line, ...summary(values)].filter(Boolean) };

    state.set({ phase: 'ended', objective: endCopy.after || '' });
    paintPrompts();
    moodHold = 0;
    tune();
    waiting.length = 0;
    bus.emit('day:end', { score: state.score, streak: state.streak, bestStreak: state.bestStreak, title: rank.title, line: rank.line });
    audio.sfx(why === 'clock' ? 'stamp' : 'level_up');
    showEnd();
  }

  async function showEnd() {
    if (!endData || endOpen) return;
    endOpen = true;
    const mine = epoch;
    const d = endData;
    const action = await ui.showCard({
      type: 'writeup',
      heading: copy.dayHeading || copy.heading,
      title: d.title,
      lines: d.lines,
      values: d.values,
      stats: [
        { label: copy.scoreLabel || 'Score', value: state.score },
        { label: copy.streakLabel || 'Best streak', value: state.bestStreak },
        { label: copy.shippedLabel || 'Shipped', value: d.values.shipped },
        { label: copy.sleepLabel || 'Hours of sleep', value: d.values.sleep },
      ],
      actions: [
        { id: 'replay', label: copy.replayButton || 'Play another day' },
        { id: 'resume', label: copy.resumeButton || 'Show me the resume' },
      ],
    });
    endOpen = false;
    if (mine !== epoch) return;
    if (action === 'replay') bus.emit('day:restart', {});
    else if (action === 'resume') ui.phone.open('resume');
  }

  bus.on('clock:end', () => finishDay('clock'));

  // ---- a new day ---------------------------------------------------------------------

  function fresh() {
    epoch += 1;
    busy = 0;
    beat = null;
    stage = 'idle';
    target = null;
    ffTo = null;
    deadline = Infinity;
    ended = false;
    endData = null;
    incident = false;
    history = {};
    questState = {};
    uses = {};
    replayed = {};
    doorTries = 0;
    doorThought = false;
    genericSkips = 0;
    mood = null;
    moodHold = 0;
    still = 0;
    waiting.length = 0;
    storm.cancel();
    storm.deal();
    guide.reset();
  }

  function start() {
    fresh();
    state.set({ phase: 'playing' });
    clock.start();
    bus.emit('day:start', {});
    tell(story.intro?.firstMinute?.[0]);
    if (beats.length) begin(beats[0].id);
    else state.set({ objective: endCopy.after || '' });
  }

  bus.on('day:restart', () => {
    epoch += 1;
    if (rounds.active) rounds.abort('restart');
    ui.phone.close();
    ui.phone.clear();
    ui.phone.setDnd(false);
    state.reset();
    clock.reset();
    player.say('');
    player.emote('none');
    const spawn = ctx.world?.spawns?.start;
    if (spawn) player.teleport(spawn.position, spawn.facing);
    start();
  });

  // ---- every frame -------------------------------------------------------------------

  function update(dt, paused) {
    guide.update(dt, paused);
    if (moodHold > 0) {
      moodHold -= dt;
      if (moodHold <= 0) {
        mood = null;
        tune();
      }
    }
    if (state.phase !== 'playing' || ended) return;
    storm.update(
      dt,
      engine.pausedBy.some((reason) => reason !== 'phone'),
    );
    if (paused || busy || !beat) return;

    if (ffTo !== null) {
      const left = ffTo - clock.now;
      if (left <= 0) ffTo = null;
      else clock.update((Math.min(left, FAST * dt) * perHour) / 60);
    }

    age += dt;
    if (stage === 'lead') {
      if (clock.now >= at && age > 1.5) activate();
      return;
    }

    const lines = beat.dialogue || [];
    const there = stage !== 'wait' || !beat.room || state.room === beat.room;
    if (!nudged && there && age > NUDGE_AFTER && lines.length >= 3 && opening(beat) !== lines[1]) {
      nudged = true;
      think(lines[1]);
    }

    const type = beat.task?.type;
    if (stage === 'wait') {
      if (clock.now >= deadline) giveUp();
    } else if (beat.trigger?.type === 'start') {
      if (age > 0.4 && player.anim !== 'lie') complete('done', last(lines));
      else if (age > WAKE_WAIT) player.stand();
    } else if (type === 'dismissNotifications') {
      if (age > JUNK_WAIT) giveUp();
    } else if (type === 'acknowledgePage') {
      if (age > PAGE_WAIT) giveUp();
    } else if (type === 'freeRoam') {
      if (clock.now >= minutes(beat.task.until, config.clock.end)) complete('done');
      else if (!hinted && age > HINT_AFTER) {
        hinted = true;
        tell(beat.task.hint, 5);
      }
    }
    if (ended || !beat) return;

    // Left standing around, he talks to himself.
    still = player.moving ? 0 : still + dt;
    if (still > IDLE_AFTER && idleLines.length && age > NUDGE_AFTER + 6 && !PHONE_TASKS.includes(type)) {
      think(idleLines[idleNext % idleLines.length]);
      idleNext += 1 + Math.floor(Math.random() * 3);
    }
  }

  return {
    start,
    update,
    // Extras, for tests and the curious.
    skip: giveUp,
    get beat() {
      return beat ? beat.id : null;
    },
    get stage() {
      return ended ? 'ended' : busy ? 'busy' : stage;
    },
    get target() {
      return guide.target;
    },
    get ended() {
      return ended;
    },
    get history() {
      return { ...history };
    },
    get quests() {
      return { ...questState };
    },
  };
}
