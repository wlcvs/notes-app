# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
docker compose up -d                # postgres on localhost:5434 (required for dev/build/e2e)
pnpm install
pnpm exec prisma migrate deploy      # apply migrations
pnpm exec prisma generate            # regenerate the client into src/generated/prisma (after schema changes)

pnpm dev                             # dev server, Turbopack, http://localhost:3000
pnpm build                           # production build
pnpm start                           # run the production build
pnpm lint                            # eslint

pnpm test                            # vitest --watch
pnpm test:run                        # vitest --run (single run, used in CI-style checks)
pnpm exec vitest run path/to.test.ts # a single unit test file

pnpm test:e2e                        # pnpm build && playwright test — full E2E suite
pnpm exec playwright test            # run E2E without rebuilding (reuses an existing prod server on :3000)
pnpm exec playwright test e2e/notes.spec.ts   # a single E2E file
```

E2E notes:
- `playwright.config.ts` always runs against a **production build** (`webServer` runs
  `pnpm start`), so it structurally cannot catch dev-only issues (see React Strict
  Mode note below).
- `e2e/video-player.spec.ts` exercises the real Plyr/YouTube integration against a
  real, stable public video (`YE7VzlLtp-4`). Tests that create a video note **must**
  first check `GET /api/notes?videoId=...` returns 404 before creating — `POST
  /api/notes` is idempotent-by-videoId, so reusing an id that already has a note
  would let the test's cleanup delete real data (this happened once during
  development). Use `createIsolatedVideoNote` in that file for this.
- Both E2E spec files track the note id they create in a `test.afterEach` at the
  `describe` level and delete it there, not inline per-test, so cleanup runs even if
  an assertion fails mid-test.

## Architecture

**Data model** — one `Note` per source, generic by design so more source/anchor
types can be added without a redesign (`prisma/schema.prisma`):

```
Note (type: VIDEO)
 ├─ VideoNote  — 1:1 source extension: links the note to a Video (Video.id = raw YouTube video id, the natural key)
 └─ Entry[]    — generic annotations, each with a markdown `body`
     └─ VideoEntry — 1:1 anchor extension: a timestamp `t` in seconds
```

Adding a new note type (e.g. `WEB`) means: one new enum member, one new `*Note`
source-extension model, one new `*Entry` anchor-extension model, one new
`z.discriminatedUnion` member in `src/lib/notes/schemas.ts`, and a new module beside
`src/lib/notes/video.ts` for its type-specific queries. `src/lib/notes/store.ts` stays
generic (list/get/delete work across all types via `Note`/`Entry` directly).

**`POST /api/notes` is idempotent, keyed by video id** (`getOrCreateVideoNote` in
`src/lib/notes/video.ts`): posting an already-used video id returns (and refreshes
the metadata on) the *existing* note rather than creating a duplicate — this lets the
browser extension write without a read round-trip first. This is a common gotcha
when writing tests or scripts against the API: never assume `POST /api/notes` created
a fresh, disposable note.

**API routes** (`src/app/api/notes/**`) are thin — they validate with Zod
(`src/lib/notes/schemas.ts`) and delegate straight to `src/lib/notes/store.ts` /
`video.ts`. `src/lib/http.ts` has the shared response helpers (`invalid`,
`notFound`, `malformedJson`).

**Frontend** is a single-route SPA (`src/components/notes-app-shell.tsx` toggles
between a list view and a detail view client-side; there's no router). The video note
detail view (`src/components/video-note-timeline.tsx`) composes:
- `src/components/youtube-player.tsx` — wraps `plyr` directly (not the `plyr-react`
  package — see the file's own top comment for why: `plyr-react`'s `instantiate`
  ignores the element ref it's given and does a global `document.querySelector`
  lookup instead, which combined with React Strict Mode's dev-only double-mount of
  effects made the player unreliable in `next dev`). Exposes an imperative handle
  (`seekTo`/`getCurrentTime`/`getDuration`) and renders timeline markers as React
  portals into Plyr's `.plyr__progress` element. **React Strict Mode is disabled**
  app-wide (`next.config.ts`) because of a second, deeper incompatibility: Plyr's
  YouTube provider registers pending players on the global, async
  `window.onYouTubeIframeAPIReady` callback, which has no way to cancel a
  registration for an instance destroyed before that callback fires — Strict Mode's
  double-invoke reliably crashes it. Also note: Plyr's YouTube provider never fires
  `"ready"`/`"loadedmetadata"` the way it does for native HTML5 video, and its
  `player.on()` proxy-to-container wiring isn't reliably rebound when the embed
  element gets swapped in — duration is read by **polling `player.duration`**
  directly rather than listening for an event.
- `src/components/note-editor.tsx` — `@atomic-editor/editor` (CodeMirror 6), one
  component (`AtomicField`) powers both the editable body and the read-only
  transcript render (`MarkdownView`) via an `editable` prop. The package's built-in
  theme wins over the app's own `EditorView.theme()` for shared properties (font
  size/family, `.cm-content` padding) because of CodeMirror's `StyleModule` mount
  order — themed instead via the package's documented `--atomic-editor-*` CSS custom
  properties in `src/app/globals.css`, with `!important` overrides only for the
  handful of properties the package hardcodes (not exposed as vars).

**Companion project**: [notes-capture-ext](https://github.com/wlcvs/notes-capture-ext)
is a Chrome extension that's the primary *write* client — it injects a capture UI
onto YouTube's own watch-page timeline and calls this app's REST API. When changing
the API contract (`src/lib/notes/schemas.ts`, route shapes), check whether the
extension's API client needs a matching update.
