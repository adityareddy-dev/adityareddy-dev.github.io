# A Day in the Life of Adi

A small 3D game that doubles as a portfolio. You walk around a house, get through one working day, and the resume is in the phone the whole time. Static files only, no build step. The page itself is `index.html` at the repo root, with a `<base href="game/">` so every path still resolves in this folder. It is live at https://adityareddy.dev/, and `game/index.html` only forwards there.

## Run it

```
python -m http.server 8101 --directory <repo root>
```

Then open http://localhost:8101/. It has to be served, the browser won't load modules from a file path.

| URL bit | What it does |
| --- | --- |
| `?autostart` | Skips the start button. |
| `?debug` | Small readout at the top: fps, quality tier, clock, room, position, pause reasons. |
| `?quality=min\|low\|medium\|high` | Forces a quality tier for this visit and turns auto scaling off. |

Keys: WASD or the arrows to walk, E to use things, P or Tab for the phone, M to mute, K to skip the part of the day that's up.

`plain.html` is the same content without the game. The skip link, the noscript note and the failure panel all point at it.

In the console, `window.__game.ctx` holds every module. `__game.ready` resolves once everything is built, `__game.started` once the day is running.

## What's where

```
index.html, style.css     the page, the layers the game draws into, shared tokens
ui.css                    the HUD, the phone, cards and toasts
plain.html, plain.css     the resume with no game
data/content.json         the facts: career, projects, contributions, articles
data/story.json           the script: beats, lines, notifications, scoring
assets/manifest.json      which model file is which
assets/furniture, assets/character   the models
src/main.js               boot order and the glue between modules
src/core/                 engine and loop, input, camera, clock, state, collisions, things you can use, the round frame
src/world/                the house, its lights and the small moving things
src/player/               the character, his emotes and speech bubble
src/ui/                   HUD, phone and its apps, cards, the title screen
src/games/                the five rounds: coffee, gym, whiteboard, review, hunt
src/story/                the director that runs the day, the notification storm, the deploy round
src/audio/                music and sound effects, all made in the browser
vendor/three/             three.js 0.186.1, copied in. vendor/README.md has the list
```

Plain ES modules, no bundler. `three` and `three/addons/` resolve through the importmap in `index.html`. Nothing loads from a CDN at runtime except Google Fonts.

A missing model or a missing key in a data file is never a crash. The game shows a placeholder or an empty state and carries on.

## Data files

The files win if this drifts.

### `assets/manifest.json`

```
{
  "models": {
    "<key>": {
      "file": "assets/furniture/desk.glb",   // relative to game/
      "scale": 1,
      "size": [w, h, d],       // at scale 1, in world units
      "center": [x, y, z],     // middle of the model measured from its origin
      "minY": 0,
      "animations": ["idle", "walk", ...]   // only on rigged models
    }
  },
  "character": "character"     // the key of the player model
}
```

One unit is one tile of the furniture kit. The character is about 0.67 tall.

### `data/content.json`

Public facts only. Everything the phone and `plain.html` show comes from here.

```
{
  "person": { "name", "title", "location", "tagline", "email", "links": { "site", "github", "linkedin", "npm" } },
  "about": ["paragraph", ...],
  "story": [{ "heading", "text" }],
  "career": [{ "role", "org", "place", "period", "points": ["..."] }],
  "skills": [{ "group", "items": ["..."] }],
  "projects": [{ "name", "summary", "url", "demo", "stats": { ... }, "highlights": ["..."] }],
  "contributions": {
    "merged": [{ "repo", "title", "url", "date" }],
    "open": [{ "repo", "title", "url", "date" }],
    "byProject": [{ "repo", "merged", "open" }]
  },
  "articles": [{ "title", "summary", "url", "date", "status" }],   // url and date can be null
  "judging": [],              // empty today, so the phone and the plain page leave the section out
  "generated": "2026-10-03"
}
```

Any list can be empty and any field can be missing or `null`.

### `data/story.json`

```
{
  "title", "subtitle",
  "intro": { "loading": ["..."], "tips": ["..."], "firstMinute": ["..."], "coach": { ... } },
  "clock": { "start": "07:00", "end": "23:00", "secondsPerGameHour": 26, "pauseInRounds": true, "pauseInPhone": true },
  "meters": {
    "energy": { "start", "cap", "drainPerGameHour", "lowAt" },
    "focus": { "start", "cap", "drainPerGameHour", "lowAt" },
    "irritation": { "start", "cap", "coolPerGameHour", "highAt" }
  },
  "beats": [{
    "id", "time": "07:20", "room", "objective",
    "prompt"?: "Make coffee",            // what the object's prompt says while this beat wants it
    "lead"?: "...",                      // objective while a time trigger waits for its minute
    "trigger": { "type": "start" | "beatDone" | "interact" | "time", "beat"?, "object"?, "at"? },
    "round"?: "coffee",
    "task"?: { "type": "dismissNotifications" | "storm" | "acknowledgePage" | "hold" | "freeRoam" | "writeup" | "endDay", ... },
    "choice"?: { "heading", "prompt", "options": [{ "text", "reply", "score" }] },
    "variants"?: [{ "when": { "meter", "below"?, "above"? }, ... }],   // the first match replaces those fields
    "optional"?: true, "skipAt"?: "08:50",
    "onDone": { "next", "score", "energy"?, "focus"?, "irritation"?, "counts"? },
    "onSkip"?: { "next", "dialogue" },
    "dialogue": ["..."], "music": "<mood>", "emote": "<emote id>"
  }],
  "sideQuests": [{ "id", "title", "object", "prompt", "availableFrom", "availableUntil", "intro", "choice"?, "done"?, "reward", "emote" }],
  "notifications": [{ "id", "app", "title", "body", "kind" }],
  "storm": { "durationSec", "count", "spawnEveryMs", "dnd": { ... }, "copy": { ... }, ... },
  "rounds": { "<round id>": { "title", "how", ... } },      // each round reads its own settings from here
  "scoring": { "streaks", "energyBonus", "irritationPenalty", "sleepHours", "titles": [{ "min", "title", "line" }], "summaryLines": ["..."], "writeupCard": { ... } },
  "door": { "label", "sign", "tryLines": ["..."], "options": { ... } },
  "objects": { "<object id>": { "prompt"?, "donePrompt"?, "lines"?, "again"?, "limit"?, "full"? }, "notYet", "nothing" },   // what things say outside their beat
  "skips": { "label", "title", "generic": ["..."], "<beat id>": "..." },
  "end": { "clock", "early", "after" },
  "idle": ["..."]
}
```

Beat order: `wake`, `phoneJunk`, `coffee`, `gym`, `standup`, `whiteboard`, `review`, `lunch`, `storm`, `page`, `hunt`, `fix`, `evening`, `writeup`, `lightsOut`.

A beat that waits on an object gives up after 200 game minutes, or at `skipAt` if that's later.

Text can hold `{shipped}`, `{reviewed}`, `{coffees}`, `{dismissed}`, `{sleep}`, `{score}`, `{streak}`, `{energy}`, `{irritation}`, `{shop}`.

## Credits

Models, fonts and libraries are listed in `CREDITS.md`.
