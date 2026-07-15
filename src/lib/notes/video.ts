import { prisma } from "@/lib/prisma";
import { NoteType, Prisma } from "@/generated/prisma/client";
import type { VideoSourceInput } from "./schemas";

/*
 * VIDEO note type. Owns get-or-create of the video note (keyed by videoId) and
 * the CRUD of its timestamped entries. The anchor (VideoEntry.t) is written
 * alongside the generic Entry via nested writes / a transaction.
 */

const videoNoteInclude = {
  video: { include: { video: true } },
  entries: {
    include: { video: true },
    // Video entries read back in timeline order (join Entry -> VideoEntry).
    orderBy: { video: { t: "asc" } },
  },
} satisfies Prisma.NoteInclude;

export type VideoNoteWithEntries = Prisma.NoteGetPayload<{
  include: typeof videoNoteInclude;
}>;

const videoEntryInclude = { video: true } satisfies Prisma.EntryInclude;
export type VideoEntryRecord = Prisma.EntryGetPayload<{
  include: typeof videoEntryInclude;
}>;

type VideoMeta = Omit<VideoSourceInput, "id">;

// Never overwrite stored title/channel/url with an empty scrape.
function nonEmptyMeta(meta: VideoMeta): Partial<VideoMeta> {
  const update: Partial<VideoMeta> = {};
  if (meta.title) update.title = meta.title;
  if (meta.channel) update.channel = meta.channel;
  if (meta.url) update.url = meta.url;
  return update;
}

/**
 * Idempotent: upserts the Video and returns the note for that video, creating
 * the Note (+ VideoNote source) on first sight. Keyed by the raw YouTube id, so
 * the extension writes without a read round-trip first.
 */
export function getOrCreateVideoNote(
  videoId: string,
  meta: VideoMeta,
): Promise<VideoNoteWithEntries> {
  return prisma.$transaction(async (tx) => {
    await tx.video.upsert({
      where: { id: videoId },
      create: { id: videoId, ...meta },
      update: nonEmptyMeta(meta),
    });

    const existing = await tx.videoNote.findUnique({
      where: { videoId },
      select: { noteId: true },
    });
    const noteId = existing
      ? existing.noteId
      : (
          await tx.note.create({
            data: { type: NoteType.VIDEO, video: { create: { videoId } } },
            select: { id: true },
          })
        ).id;

    return tx.note.findUniqueOrThrow({
      where: { id: noteId },
      include: videoNoteInclude,
    });
  });
}

/** Look up a video note by its noteId, or null. Entries in time order. */
export function getVideoNoteById(
  noteId: string,
): Promise<VideoNoteWithEntries | null> {
  return prisma.note.findFirst({
    where: { id: noteId, type: NoteType.VIDEO },
    include: videoNoteInclude,
  });
}

/** Look up a video's note by raw YouTube id, or null. Entries in time order. */
export function getNoteByVideoId(
  videoId: string,
): Promise<VideoNoteWithEntries | null> {
  return prisma.note
    .findFirst({
      where: { video: { videoId } },
      include: videoNoteInclude,
    })
    .then((n) => n);
}

/** All video notes for the list view, most-recently-updated first. */
export function listVideoNotes(): Promise<VideoNoteWithEntries[]> {
  return prisma.note.findMany({
    where: { type: NoteType.VIDEO },
    include: videoNoteInclude,
    orderBy: { updatedAt: "desc" },
  });
}

/** Create one entry (+ its timestamp anchor) under a video note. */
export function addVideoEntry(input: {
  noteId: string;
  t: number;
  body: string;
}): Promise<VideoEntryRecord> {
  return prisma.entry.create({
    data: {
      noteId: input.noteId,
      body: input.body,
      video: { create: { t: input.t } },
    },
    include: videoEntryInclude,
  });
}

/**
 * Update an entry's body and/or its timestamp, in one transaction so the
 * generic Entry.body and the VideoEntry.t anchor never drift apart.
 */
export function updateVideoEntry(input: {
  entryId: string;
  t?: number;
  body?: string;
}): Promise<VideoEntryRecord> {
  return prisma.$transaction(async (tx) => {
    if (input.body !== undefined) {
      await tx.entry.update({
        where: { id: input.entryId },
        data: { body: input.body },
      });
    }
    if (input.t !== undefined) {
      await tx.videoEntry.update({
        where: { entryId: input.entryId },
        data: { t: input.t },
      });
    }
    return tx.entry.findUniqueOrThrow({
      where: { id: input.entryId },
      include: videoEntryInclude,
    });
  });
}
