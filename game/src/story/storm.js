const COUNTED = ['swipe', 'tap', 'clear', 'silence'];

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The phone's side of the day: the morning junk, the afternoon storm and the page.
export function createStorm(ctx, { tell }) {
  const { bus, state, ui, config } = ctx;
  const story = ctx.data.story || {};
  const all = Array.isArray(story.notifications) ? story.notifications : [];
  const cfg = story.storm || {};
  const dndCfg = cfg.dnd || {};
  const pageNote = all.find((n) => n.kind === 'page') || {
    id: 'page',
    app: 'Pager',
    title: 'PAGE: checkout is slow',
    body: 'Place order takes over a second to respond.',
    kind: 'page',
  };

  let pool = [];
  let junk = null;
  let storm = null;
  let page = null;

  function deal() {
    pool = shuffle(all.filter((n) => n.kind !== 'page'));
  }

  function take(kinds) {
    if (!pool.length) deal();
    const index = kinds ? pool.findIndex((n) => kinds.includes(n.kind)) : 0;
    return pool.splice(index < 0 ? 0 : index, 1)[0] || null;
  }

  // ---- morning: a handful to swipe away ---------------------------------------------

  function startJunk(task = {}) {
    cancel();
    const want = Math.max(1, Number(task.count) || 5);
    const queue = [];
    for (let i = 0; i < want + 2; i += 1) {
      const n = take(task.kinds);
      if (n) queue.push(n);
    }
    return new Promise((resolve) => {
      junk = { want, queue, ids: new Set(), wait: 0.7, dismissed: 0, resolve };
    });
  }

  function endJunk(why) {
    if (!junk) return;
    const done = junk;
    junk = null;
    done.resolve({ dismissed: done.dismissed, why });
  }

  // ---- afternoon: the storm -----------------------------------------------------------

  function startStorm() {
    cancel();
    return new Promise((resolve) => {
      storm = { t: 0, sent: 0, wait: 0.5, dismissed: 0, row: 0, hinted: false, quiet: null, usedDnd: false, ids: new Set(), resolve };
      bus.emit('storm:start', {});
      if (state.dnd) {
        // He found the switch this morning. It still counts.
        storm.usedDnd = true;
        storm.quiet = (Number(cfg.pageDelayAfterDndMs) || 4000) / 1000;
        state.set({ score: state.score + (Number(dndCfg.bonus) || 0) });
        state.setFlag('dndUsed');
        tell(story.end?.stormBlocked);
      } else tell(cfg.copy?.start);
    });
  }

  function endStorm(why) {
    if (!storm) return;
    const done = storm;
    storm = null;
    const overwhelmed = state.irritation >= (config.meters.irritation.highAt ?? 70);
    if (why === 'time') tell(overwhelmed ? cfg.copy?.overwhelmed : cfg.copy?.survived);
    const result = { dnd: done.usedDnd || state.dnd, dismissed: done.dismissed, sent: done.sent, overwhelmed, why };
    bus.emit('storm:end', { dnd: result.dnd, dismissed: result.dismissed });
    done.resolve(result);
  }

  // ---- the page -----------------------------------------------------------------------

  function sendPage() {
    return new Promise((resolve) => {
      page = { resolve };
      ui.phone.notify(pageNote);
    });
  }

  function endPage(why) {
    if (!page) return;
    const done = page;
    page = null;
    done.resolve({ why });
  }

  // ---- events -------------------------------------------------------------------------

  bus.on('notify:dismiss', (e) => {
    if (!e) return;
    if (junk && junk.ids.has(e.id) && COUNTED.includes(e.how)) {
      junk.ids.delete(e.id);
      junk.dismissed += 1;
      state.count('dismissed');
      if (junk.dismissed >= junk.want) endJunk('cleared');
    }
    if (storm && storm.ids.has(e.id)) {
      if (e.how === 'timeout') {
        storm.row = 0;
        return;
      }
      if (!COUNTED.includes(e.how)) return;
      storm.ids.delete(e.id);
      storm.dismissed += 1;
      storm.row += 1;
      state.count('dismissed');
      let points = Number(cfg.pointsPerSwipe) || 0;
      if (cfg.streakEvery && storm.row % cfg.streakEvery === 0) points += Number(cfg.streakBonus) || 0;
      state.set({ score: state.score + points, irritation: state.irritation + (Number(cfg.irritationPerSwipe) || 0) });
    }
  });

  bus.on('dnd:change', (e) => {
    if (!e?.dnd) return;
    if (junk) endJunk('dnd');
    if (storm && storm.quiet === null) {
      storm.usedDnd = true;
      storm.quiet = (Number(cfg.pageDelayAfterDndMs) || 4000) / 1000;
      state.set({ score: state.score + (Number(dndCfg.bonus) || 0), irritation: state.irritation + (Number(dndCfg.irritation) || 0) });
      state.setFlag('dndUsed');
      tell(dndCfg.onEnable?.[0]);
    }
  });

  bus.on('notify:open', (e) => {
    if (page && e?.kind === 'page') endPage('opened');
  });

  function cancel() {
    endJunk('cancelled');
    endStorm('cancelled');
    endPage('cancelled');
  }

  // held: a round or a card is up, so the phone gives him a moment.
  function update(dt, held) {
    if (held) return;
    if (junk) {
      junk.wait -= dt;
      if (junk.wait <= 0 && junk.queue.length) {
        const n = junk.queue.shift();
        junk.wait = 0.95;
        if (ui.phone.notify(n) !== false) junk.ids.add(n.id);
      }
      if (!junk.queue.length && state.dnd) endJunk('dnd');
    }
    if (storm) {
      storm.t += dt;
      if (storm.quiet !== null) {
        storm.quiet -= dt;
        if (storm.quiet <= 0) endStorm('dnd');
        return;
      }
      const length = Number(cfg.durationSec) || 40;
      const count = Number(cfg.count) || 26;
      storm.wait -= dt;
      if (storm.wait <= 0 && storm.sent < count) {
        const n = take();
        const [slow, fast] = Array.isArray(cfg.spawnEveryMs) ? cfg.spawnEveryMs : [1600, 450];
        const k = Math.min(1, storm.t / length);
        storm.wait = (slow + (fast - slow) * k) / 1000;
        storm.sent += 1;
        if (n && ui.phone.notify(n) !== false) {
          storm.ids.add(n.id);
          state.set({ irritation: state.irritation + (Number(cfg.irritationPerArrival) || 0) });
        }
        if (!storm.hinted && storm.sent >= (Number(dndCfg.unlockAfter) || 8)) {
          storm.hinted = true;
          tell(dndCfg.hint);
        }
      }
      if (storm.t >= length || (storm.sent >= count && storm.wait < -2.5)) endStorm('time');
    }
  }

  deal();

  return {
    update,
    cancel,
    deal,
    startJunk,
    startStorm,
    sendPage,
    get active() {
      return junk ? 'junk' : storm ? 'storm' : page ? 'page' : null;
    },
    get stats() {
      return storm ? { t: storm.t, sent: storm.sent, dismissed: storm.dismissed, quiet: storm.quiet } : junk ? { dismissed: junk.dismissed, left: junk.queue.length } : null;
    },
  };
}
