# Jinote

A personal accountability coach for your phone. Built with Expo (SDK 57) and Google's Gemini API (free tier).

Six tabs:

- **Home** — the featured goal (100 push-ups in one set): scoreboard, progress bar, 7-day chart, quick log, tasks, and a Today strip showing what's on the schedule today.
- **Goals** — all goals with their own progress bars, plus a to-buy list.
- **Journal** — a notes system with three note types: quick notes (free text, stamped with the date and time), recipes (photo, ingredients, numbered steps, notes), and checklists (a title plus checkable items). Filterable by type, searchable by title and content.
- **Schedule** — recurring classes and one-off events: a week view (today highlighted) plus a "coming up" list. Each event can carry a reminder lead time.
- **Chat** — a coach that can see your data and change it for you.
- **Settings** — which reminders the coach is allowed to send, and when.

Everything is stored on the device with AsyncStorage. Only the Chat screen calls an API; the rest works fully offline — including notifications, which are scheduled locally with no push server involved.

## Run it

```bash
npm install
cp .env.example .env      # optional: add your key (see below)
npm start                 # phone: scan the QR code with Expo Go
npm run web               # or open it in a browser at http://localhost:8081
```

Without a key the Chat screen runs in **mock mode** (a MOCK badge shows in its header) and understands a few typed commands: `log 24`, `remind me to <task>`, `note down <thought>` (saved as a quick note), `buy <item>`. Everything outside Chat behaves the same with or without a key.

> **Why not `npx expo start`?** The parent folder name contains a colon, which breaks how npm and npx add `node_modules/.bin` to `PATH`. The npm scripts call Expo's CLI through `node` directly to get around this. Renaming the folder to drop the colon also fixes it.

## Gemini API setup

**Gemini is the default and only needs a free-tier key** — that's the point of using it here instead of Claude. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), put it in `.env`, then restart Expo:

```
EXPO_PUBLIC_GEMINI_API_KEY=AIza...
```

**Security note:** `EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. That's fine for running on your own phone during development, but anyone with a build of the app could extract the key. Before sharing the app, move the API call behind a small server that holds the key.

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_GEMINI_MODEL` | `gemini-3.6-flash` | Any Gemini model with function-calling support works. |
| `EXPO_PUBLIC_LLM_PROVIDER` | `gemini` | Set to `claude` to use the Claude API instead — needs a paid Anthropic key (`EXPO_PUBLIC_ANTHROPIC_API_KEY`, `EXPO_PUBLIC_ANTHROPIC_MODEL`). Everything else about the coach (personality, state block, tools, ambiguity handling) is identical either way. |
| `EXPO_PUBLIC_USE_MOCK` | `false` | `true` forces mock mode even with a key set. |

### Swapping providers

The coach's personality, tools, and turn logic don't belong to either provider:

- [personality.ts](src/agent/personality.ts) — the one shared system prompt
- [tools.ts](src/agent/tools.ts) — the 15 tools, defined once as plain `{name, description, properties, required}` specs, with two converters (`toAnthropicTools`, `toGeminiFunctionDeclarations`) that produce each provider's own wire format — uppercase `Schema.type` and a `nullable` flag for Gemini, `anyOf: [type, "null"]` and `additionalProperties: false` for Claude — from the same source
- [types.ts](src/agent/types.ts) — the `AgentBackend` interface both backends implement, and `TurnOutput` / `TurnError`

[claude.ts](src/agent/claude.ts) and [gemini.ts](src/agent/gemini.ts) each own only what's actually provider-specific: the HTTP call, their message/content wire shape, the tool-call loop against that shape, and mapping that provider's errors to a readable message. A stored chat transcript only replays on the backend whose shape it matches (checked at runtime); switching providers mid-history just falls back to that message's plain text instead of crashing.

## The coach (Chat)

**Personality:** direct and accountability-focused, calls out excuses and inconsistency, but warm, not a drill sergeant — genuinely on your side. Coaches you on whatever you're tracking, not just the featured goal. Replies are 2–5 sentences, plain text, occasional natural emoji is fine, at most one question per reply. It's in [personality.ts](src/agent/personality.ts), shared by every provider.

**What it can see.** Every message is sent with a freshly built state block ([context.ts](src/agent/context.ts)): the featured goal and progress, streak, best result, days to deadline, other goals, open tasks, unbought items, the 5 most recent notes (of any type, trimmed), today's and tomorrow's schedule, and today's date. Each item carries its id so the coach can act without guessing, and it's told never to ask for something already in the block. The block is kept small (a few hundred tokens) — the schedule only ever contributes today and tomorrow, never the whole semester.

**What it can do** ([tools.ts](src/agent/tools.ts)) — all offline, all against your local data:

| Tool | Effect |
|---|---|
| `log_progress` | Log a value toward a goal ("did 24 push-ups") |
| `create_goal` | New goal with title, target, best/cumulative, optional deadline |
| `set_deadline` | Set, change, or clear a goal's deadline |
| `add_task` / `complete_task` | Add a task, or check one off |
| `add_buy_item` / `mark_bought` | Add something to buy, or mark it bought |
| `save_note` | Save a quick note, or a checklist with its items |
| `save_recipe` | Save a recipe with its ingredients and steps |
| `search_notes` | Search notes by title and content |
| `add_event` | Add a recurring class or a one-off event |
| `delete_event` | Remove an event from the schedule |
| `get_schedule` | Read today, tomorrow, or the next 7 days |

When it can't tell which goal, task or item you mean, it's instructed to ask rather than guess. Every change appears in the chat as a green line, and the tool handlers check their own input, so a bad id or number comes back to the coach as an error it has to deal with instead of a crash. The coach never touches photos — attaching one to a recipe is manual, from Journal itself.

**Errors:** a rejected key, rate limiting (including the free tier's), being offline, a refusal, or a malformed reply all come back as a readable message in the chat. If a tool already ran before the failure, that change is kept and stays visible.

## How a turn works

```
your message
   │
   ▼
build state block (goals, streak, tasks, to-buy, recent notes, today+tomorrow's schedule)
   │
   ▼
call the model ──► called a tool? ── yes ──► run it locally, send the result back, call again
   │                                          (up to 6 rounds)
   no
   ▼
short reply + a green line for each change
```

Each turn's raw provider messages (tool calls and results) are saved with the chat message and replayed exactly on later requests, so the conversation stays consistent. (On Claude this also means prompt caching can reuse the prefix; Gemini has no equivalent here.)

## Storage

| Key | Contents |
|---|---|
| `jinesist.coach.v2` | `{ goals, entries, tasks, toBuy }` |
| `jinesist.notes.v1` | `{ notes }` — quick notes, recipes, and checklists (a recipe's photo is a file path only, see below) |
| `jinesist.schedule.v1` | `{ events }` — recurring and one-off events, each with an optional reminder lead time |
| `jinesist.notifications.v1` | Which reminders are on, and the daily reminder time |
| `jinesis.messages.v1` | Chat history |
| `jinesist.coach.v1` | Stage 2 data, converted into the featured goal on first launch, then kept as a backup |
| `jinesist.journal.v1` | Stage 3-5 journal (plain-text-only notes), converted into quick notes on first launch, then kept as a backup |
| `jinesis.data.v1` | The old Chat to-do/note lists. Open to-dos became tasks and notes became quick notes ([migrateChatData.ts](src/storage/migrateChatData.ts)); kept as a backup |

**Reset all data** (bottom of Home, behind a confirmation) clears goals, progress, tasks, the to-buy list, notes (including any recipe photos), and the schedule; your notification settings are left alone. **Clear** in the Chat header only deletes the conversation.

### Goal types

- **Best result** (push-ups): only your highest single result counts. Logging again the same day replaces that day's entry, and the record never drops.
- **Cumulative** (money saved, books read): every log adds to the total.

**Day streak** counts consecutive days with a logged value above 0, back from today. If today isn't logged yet it counts from yesterday, so the streak doesn't break until the day is over.

## Schedule

Two kinds of event ([schedule/store.ts](src/schedule/store.ts)):

- **Recurring** — repeats weekly on one or more days (a class), with an optional start and end date (e.g. a semester).
- **One-off** — a single date (an exam, an appointment).

Every event has a title, start time, optional end time, optional location, optional note, and an optional reminder lead time (5, 10, 15, 30 or 60 minutes before it starts — see [Notifications](#notifications)). The Schedule screen shows the current week (today's row is highlighted) and a "coming up" list of each event's next occurrence, soonest first ([schedule/occurrences.ts](src/schedule/occurrences.ts)); tapping an event edits it, editing can delete it. Home's Today strip is the same data filtered to just today, with a compact "nothing scheduled" state when there's nothing on.

## Notes (Journal)

Three kinds of note ([notes/store.ts](src/notes/store.ts)):

- **Quick note** — free text, stamped with the date and time. The always-visible composer at the top of Journal only ever creates this kind, for fast capture; "+ New note" is where you pick a type explicitly.
- **Recipe** — title, optional photo, an ingredients list, numbered steps, and an optional notes field (cook time, servings, where it's from).
- **Checklist** — a title plus items you can check off, add, or remove individually.

Journal has a type filter (All / Quick / Recipes / Lists) and a search box that matches title and content across every type; both combine, and results stay newest-first. Deleting a note deletes its recipe photo file too, if it has one.

**Photos** ([notes/photos.ts](src/notes/photos.ts)) come from the camera or photo library via `expo-image-picker`, then are copied into the app's own document directory with `expo-file-system` (its class-based `File`/`Directory`/`Paths` API, not the older function-based one) — AsyncStorage only ever holds the resulting `file://` path, never image bytes. Both packages are native-only: photo attachment hides itself in the web preview (`photosSupported` is `false` there) rather than pretending to work. `notes/store.ts` itself has no dependency on either package — deleting a photo file is the caller's job (`RecipeCard`, Home's reset) — so the note data logic stays plain and testable under Node the same way `coach/store.ts` and `schedule/store.ts` are.

## Notifications

Local notifications only ([expo-notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)): no push server, no backend, nothing leaves the device. Four kinds, each switchable on its own in **Settings**, with one master switch that turns everything off without losing the individual choices:

| Reminder | When it fires |
|---|---|
| Daily log reminder | At a time you pick (7pm by default), unless the featured goal is already logged that day |
| Streak at risk | 10pm, only when a live streak would break tonight — "3 days streak ends in 2 hours" |
| Schedule reminders | The lead time before an event that has one set (set it when creating or editing the event) |
| Deadline warnings | 9am, a week before a goal's deadline and again the day before |

Everything starts **off**, so nothing is scheduled and no permission is requested at launch. The OS prompt appears the first time you turn a type on ([SettingsScreen.tsx](src/screens/SettingsScreen.tsx) is the only caller of `requestPermission`). If permission is denied, the settings still save and the screen says so, with a shortcut to the system settings, rather than silently doing nothing.

**Wording** comes from [notifications/voice.ts](src/notifications/voice.ts), hand-written to match the coach's voice in [personality.ts](src/agent/personality.ts). A scheduled OS notification has no network round trip, so it can't ask the model for a line — the copy is fixed, but it's the same character.

**How scheduling works.** [plan.ts](src/notifications/plan.ts) is a pure function: goals, entries, events and preferences in, a list of `{id, title, body, date}` out, projected a week ahead and capped at 60 (iOS allows 64 pending). [scheduler.ts](src/notifications/scheduler.ts) is the only file that touches expo-notifications; it cancels everything and replays the plan, which is always correct because nothing else in the app schedules notifications. [NotificationsEngine.tsx](src/notifications/NotificationsEngine.tsx) sits at the app root and re-runs that whenever the data behind a reminder changes — logging progress, adding or editing an event, changing a deadline, flipping a setting — and on every return to the foreground, which rolls the week-long window forward. So no mutation site has to remember to reschedule anything.

Because the plan is only rebuilt while the app is running, the rolling window is what covers the gap: reminders already handed to the OS still fire on time with the app closed, but occurrences past the window need the app opened once to be scheduled. Everything that depends on data that can change (like "did I log today?") is corrected the moment you open the app, which is also the only way that data can change.

`notifications/store.ts`, `plan.ts` and `voice.ts` have no native imports, so the logic is testable under plain Node the same way `notes/store.ts` is. On web the whole feature reports itself unsupported instead of half-working.

## Deploying as a web app (PWA)

The web build is a static site — no server, no accounts, no shared backend. Everyone who opens it gets their own local data in their own browser, exactly like the phone app.

```bash
npm run build:web   # exports the static site to dist/
npm run serve:web   # serves that same dist/ folder locally, for a final check before deploying
```

**What makes it installable:**

- [public/manifest.json](public/manifest.json) — name, standalone display mode, and the dark palette (`#1c1a17` background, `#c98a3b` theme/accent color).
- [public/icons/](public/icons/) — 192/512px icons for the manifest, plus 120/152/167/180px Apple touch icons, all generated from `assets/icon.png`.
- [public/index.html](public/index.html) — the customized HTML template (`npx expo customize public/index.html` generates this; don't regenerate it blindly, it now carries the PWA `<head>` tags). Links the manifest, sets the Apple "add to home screen" meta tags (`apple-mobile-web-app-capable`, `black-translucent` status bar, `apple-touch-icon`) needed for a fullscreen iOS install, and registers the service worker.
- [public/sw.js](public/sw.js) — deliberately simple: network-first, falling back to the cache only when offline, and only for same-origin requests (the Gemini API call is never cached). No fixed precache list, since Metro's JS bundle filename changes every build — the cache fills itself the first time each asset is fetched, so the app works offline after that first visit. Expo's own PWA guide warns that an aggressive service worker can trap users on a stale build; this one can't, because it always prefers the network when it's available.
- `web.output: "single"` in `app.json` — one `index.html`, no server needed, matching a plain static host.

**Confirmed working, not assumed:** the production build (`npm run build:web` + `npm run serve:web`, not the dev server) was checked in a real browser — manifest and icons resolve, the service worker registers, controls the page, and actually caches same-origin assets; the app still renders with the network fully cut; and data written to AsyncStorage survives a reload (AsyncStorage's web build is backed directly by `window.localStorage`, which is what these checks exercised).

**What's disabled on web, and how:**

- **Notifications** — `notificationsSupported` in [notifications/scheduler.ts](src/notifications/scheduler.ts) is `false` on web (iOS PWAs don't support the Notifications API the way native apps do), and Settings shows a plain explanation instead of toggles that would do nothing.
- **Recipe photos** — `photosSupported` in [notes/photos.ts](src/notes/photos.ts) is `false` on web, and the photo field explains why instead of failing silently when the camera/library pickers don't work.

Both flags already existed from earlier stages (they originally covered the Expo dev preview); the messaging was reworded from "in this preview" to "on web" now that this is a real deployed destination, not a temporary preview.

### Deploying (Netlify — recommended)

Of the three options, Netlify is the easiest for this app: no repo required if you don't want one, no subpath configuration, and Expo's own docs call it out as having the highest compatibility with Expo web builds. [public/_redirects](public/_redirects) is already set up for it.

**Fastest — no account setup beyond signing up:**
1. `npm run build:web`
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `dist` folder in.
3. You'll get a URL immediately (something like `https://random-name-123abc.netlify.app`).

**Repeatable — for a stable name and future updates:**
1. `npm install --global netlify-cli`
2. `netlify login`
3. `netlify init` from the project root — choose "Create & configure a new site," pick a team, and give it a name (this fixes your final URL).
4. `npm run build:web`
5. `netlify deploy --prod --dir dist`
6. Re-run steps 4–5 whenever you want to push an update.

Either way, the final link is `https://<your-site-name>.netlify.app` — that's what you share. Netlify serves everything over HTTPS by default, which the service worker and camera/notification permissions all require anyway.

**Other options**, if you'd rather use one of them: Vercel needs a `vercel.json` with `{"buildCommand": "expo export -p web", "outputDirectory": "dist"}` and then `vercel`. GitHub Pages needs a public repo, the `gh-pages` package, and `experiments.baseUrl` set to `/your-repo-name` in `app.json` — doable, but the subpath adds a step and your URL becomes `https://<username>.github.io/<repo-name>` instead of a clean domain.

### Installing on a phone

- **iOS (Safari only — Chrome/Firefox on iOS can't install PWAs):** open the link, tap Share, then "Add to Home Screen." It launches fullscreen with no Safari chrome, using the icon and dark status bar configured above.
- **Android (Chrome):** open the link, tap the menu, then "Install app" (or Chrome may prompt automatically).

Send the same Netlify URL to anyone else — they install it the same way, and their data stays local to their own device. There's nothing to configure per-person and nothing shared between installs.

## Files

- [src/agent/](src/agent/) — coach personality, state block, tools, both provider backends, mock backend
- [src/coach/](src/coach/) — goal store, date maths, streak and chart calculations, amount formatting
- [src/notes/](src/notes/), [src/storage/](src/storage/) — notes store, photo handling, and the shared AsyncStorage store
- [src/schedule/](src/schedule/) — event store, occurrence maths, time-of-day helpers, screen pieces
- [src/notifications/](src/notifications/) — reminder preferences, the plan builder, notification wording, the expo-notifications wrapper
- [src/design/](src/design/) — theme, fonts, cards, buttons, dialogs
- [src/home/](src/home/), [src/goals/](src/goals/), [src/components/](src/components/) — screen pieces
- [src/screens/](src/screens/), [src/navigation/](src/navigation/) — the six screens and the tab bar
- [public/](public/) — the PWA manifest, icons, service worker, and customized `index.html` (see [Deploying as a web app](#deploying-as-a-web-app-pwa))

## Scripts

- `npm start` — Expo dev server
- `npm run web` — dev server, opened in a browser
- `npm run build:web` — exports the static PWA build to `dist/`
- `npm run serve:web` — serves that build locally, to check it before deploying
- `npm run typecheck` — TypeScript, no emit
