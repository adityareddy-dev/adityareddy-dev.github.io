// Defaults. story.json overrides clock and meters at boot.
export function createConfig() {
  return {
    paths: {
      manifest: 'assets/manifest.json',
      content: 'data/content.json',
      story: 'data/story.json',
    },
    clock: {
      start: 7 * 60,
      end: 23 * 60,
      secondsPerGameHour: 26,
      pauseInRounds: true,
      pauseInPhone: true,
    },
    meters: {
      energy: { start: 55, cap: 100, drainPerGameHour: 5, lowAt: 30 },
      focus: { start: 60, cap: 100, drainPerGameHour: 2, lowAt: 30 },
      irritation: { start: 10, cap: 100, coolPerGameHour: 4, highAt: 70 },
    },
    // One unit is one tile of the furniture kit. The character is about 0.67 tall.
    player: { height: 0.67, radius: 0.14, speed: 1.7, turnSpeed: 12, arriveDistance: 0.06 },
    interact: { radius: 0.75, floorTolerance: 1.1 },
    camera: {
      fov: 32,
      yaw: Math.PI / 4,
      pitch: 0.84,
      distance: 10,
      minDistance: 5,
      maxDistance: 22,
      lookHeight: 0.35,
      followLambda: 6,
      zoomLambda: 10,
    },
    quality: {
      order: ['min', 'low', 'medium', 'high'],
      tiers: {
        high: { pixelRatio: 2, shadows: true, shadowSize: 2048, post: true },
        medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, post: false },
        low: { pixelRatio: 1, shadows: true, shadowSize: 512, post: false },
        min: { pixelRatio: 0.75, shadows: false, shadowSize: 0, post: false },
      },
      slowFrameMs: 24,
      fastFrameMs: 18,
      // How long one look at the frame rate lasts, and how many times over slow counts as a crawl.
      windowMs: 1200,
      crawl: 3,
      // While the world is paused it's drawn smoothly for a moment, then this often.
      pausedGrace: 0.5,
      pausedFps: 4,
    },
    look: { background: 0x1b1a22, exposure: 1, environmentIntensity: 0.5 },
  };
}

// "07:30" to minutes since midnight. Numbers pass through.
export function parseTime(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

export function formatTime(minutes) {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Copies the clock and meter numbers out of story.json when they're there.
export function applyStoryConfig(config, story) {
  if (!story || typeof story !== 'object') return config;
  const c = story.clock;
  if (c && typeof c === 'object') {
    config.clock.start = parseTime(c.start, config.clock.start);
    config.clock.end = parseTime(c.end, config.clock.end);
    if (Number(c.secondsPerGameHour) > 0) config.clock.secondsPerGameHour = Number(c.secondsPerGameHour);
    if (typeof c.pauseInRounds === 'boolean') config.clock.pauseInRounds = c.pauseInRounds;
    if (typeof c.pauseInPhone === 'boolean') config.clock.pauseInPhone = c.pauseInPhone;
  }
  const m = story.meters;
  if (m && typeof m === 'object') {
    for (const name of ['energy', 'focus', 'irritation']) {
      if (!m[name] || typeof m[name] !== 'object') continue;
      for (const [key, value] of Object.entries(m[name])) {
        if (typeof value === 'number' && Number.isFinite(value)) config.meters[name][key] = value;
      }
    }
  }
  return config;
}
