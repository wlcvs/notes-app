# notes-app

A personal, timestamped notes app for YouTube videos. Open a video note and get a
transcript-style list of markdown entries anchored to specific timestamps — click a
timestamp to seek the embedded player, or click a marker on the player's progress bar
to jump to (and highlight) the corresponding entry.

It's the backend + web UI half of a two-part personal project:

- **notes-app** (this repo) — Next.js app: REST API, Postgres/Prisma data layer, and
  a single-route SPA UI for browsing/editing notes.
- **[notes-capture-ext](https://github.com/wlcvs/notes-capture-ext)** — a companion
  Chrome extension that injects a capture UI directly onto YouTube's own watch-page
  timeline, so notes can be created without leaving the video.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19, TypeScript
- **Prisma 7** over Postgres — one `Note` per source (currently `VIDEO`; the schema
  is deliberately generic so `STANDALONE`/`WEB`/`DOC` note types can slot in later
  without a redesign — see `prisma/schema.prisma`)
- **[@atomic-editor/editor](https://www.npmjs.com/package/@atomic-editor/editor)**
  (CodeMirror 6) for markdown entries — one component powers both the editable body
  and the read-only transcript render
- **[Plyr](https://plyr.io)** wrapping the YouTube IFrame API for the video player,
  with custom timeline markers rendered as React portals into Plyr's progress bar
- **Tailwind CSS 4** — a minimalist "HUD" visual style (monochrome + a single cyan
  accent)
- **Vitest** (unit) + **Playwright** (E2E, against a production build)

## Data model

```
Note (type: VIDEO)
 ├─ VideoNote  — 1:1 source extension, links the note to a Video (natural key = YouTube video id)
 └─ Entry[]    — generic annotations
     └─ VideoEntry — 1:1 anchor extension, a timestamp `t` in seconds
```

`POST /api/notes` is an **idempotent get-or-create keyed by video id** — posting a
video id that's already in use returns (and refreshes the metadata on) the existing
note rather than creating a duplicate. See `src/lib/notes/store.ts` and
`src/app/api/notes/route.ts`.

## Getting started

Requires **pnpm** and a local Postgres (via Docker Compose, or point `DATABASE_URL`
at your own instance).

```bash
docker compose up -d          # postgres on localhost:5434
cp .env.example .env
pnpm install
pnpm exec prisma migrate deploy
pnpm dev                      # http://localhost:3000
```

## Scripts

```bash
pnpm dev            # dev server (Turbopack)
pnpm build           # production build
pnpm start           # run the production build
pnpm lint            # eslint
pnpm test            # vitest --watch
pnpm test:run        # vitest --run
pnpm test:e2e        # builds, then runs the Playwright suite against it
pnpm test:e2e:ui     # same, with Playwright's UI runner
```

The E2E suite (`e2e/`) always runs against a production build (`playwright.config.ts`
runs `pnpm build && playwright test`), so it won't catch dev-only issues — notably,
anything specific to React Strict Mode's double-invoke of effects, which is disabled
in this app (`next.config.ts`) because of a real incompatibility between it and
Plyr's YouTube provider (see the comment there and in
`src/components/youtube-player.tsx` for the full writeup).

## API

- `GET /api/notes` — list notes
- `GET /api/notes?videoId=ID` — the note for a given YouTube video id (404 if none)
- `POST /api/notes` — idempotent get-or-create (see above)
- `GET/DELETE /api/notes/:noteId`
- `POST /api/notes/:noteId/entries` — add an entry
- `PATCH/DELETE /api/notes/:noteId/entries/:entryId`

Request/response shapes are validated with Zod — see `src/lib/notes/schemas.ts`.
