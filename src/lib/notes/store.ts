import { prisma } from "@/lib/prisma";
import { Prisma, NoteType } from "@/generated/prisma/client";

/*
 * Type-agnostic reads and deletes. Anything specific to a note type (creating a
 * video note, its entry anchors) lives in the per-type modules (e.g. video.ts).
 * Deletes rely on the schema's ON DELETE CASCADE: removing a note removes its
 * source and entries; removing an entry removes its anchor.
 */

// Source + entry count — enough to render a row in the list at `/`.
const noteListInclude = {
  video: { include: { video: true } },
  _count: { select: { entries: true } },
} satisfies Prisma.NoteInclude;

// Full note with its entries (generic order); per-type views may re-order.
const noteDetailInclude = {
  video: { include: { video: true } },
  entries: {
    include: { video: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.NoteInclude;

export type NoteListItem = Prisma.NoteGetPayload<{
  include: typeof noteListInclude;
}>;
export type NoteWithEntries = Prisma.NoteGetPayload<{
  include: typeof noteDetailInclude;
}>;

/** All notes, most-recently-updated first, for the list view. */
export function listNotes(): Promise<NoteListItem[]> {
  return prisma.note.findMany({
    include: noteListInclude,
    orderBy: { updatedAt: "desc" },
  });
}

/** The note's type (which anchor schema its entries use), or null if missing. */
export async function getNoteType(noteId: string): Promise<NoteType | null> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { type: true },
  });
  return note?.type ?? null;
}

/** A single note with its entries, or null if it doesn't exist. */
export function getNote(noteId: string): Promise<NoteWithEntries | null> {
  return prisma.note.findUnique({
    where: { id: noteId },
    include: noteDetailInclude,
  });
}

/** Delete a note (cascade removes its source + entries). Idempotent. */
export async function deleteNote(noteId: string): Promise<boolean> {
  const { count } = await prisma.note.deleteMany({ where: { id: noteId } });
  return count > 0;
}

/** Delete one entry (cascade removes its anchor). Idempotent. */
export async function deleteEntry(entryId: string): Promise<boolean> {
  const { count } = await prisma.entry.deleteMany({ where: { id: entryId } });
  return count > 0;
}
