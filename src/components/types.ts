// Client-facing shapes for the notes UI. These mirror the API JSON (dates as
// ISO strings), not the Prisma row types (which use Date). The server component
// serializes `listNotes()` into `NoteListItem[]` before handing it to the shell,
// so the same rendering code handles both the boot payload and API responses.

export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  url: string;
}

export interface NoteListItem {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  video: { videoId: string; video: VideoMeta } | null;
  _count: { entries: number };
}

export interface Entry {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  // The VIDEO anchor: the timestamp in raw seconds.
  video: { entryId: string; t: number } | null;
}

export interface NoteDetail {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  video: { videoId: string; video: VideoMeta } | null;
  entries: Entry[];
}
