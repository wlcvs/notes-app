import { NextResponse } from "next/server";
import { deleteNote, getNote, getNoteType } from "@/lib/notes/store";
import { getVideoNoteById } from "@/lib/notes/video";
import { NoteType } from "@/generated/prisma/client";
import { notFound } from "@/lib/http";

type Ctx = { params: Promise<{ noteId: string }> };

// GET /api/notes/[noteId] — the note with its entries, in the type's natural
// order (VIDEO: by timestamp; other types fall back to the generic read).
export async function GET(_req: Request, { params }: Ctx) {
  const { noteId } = await params;
  const type = await getNoteType(noteId);
  if (!type) return notFound("note");

  const note =
    type === NoteType.VIDEO
      ? await getVideoNoteById(noteId)
      : await getNote(noteId);
  return note ? NextResponse.json(note) : notFound("note");
}

// DELETE /api/notes/[noteId] — remove the whole note (cascade source + entries).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { noteId } = await params;
  const deleted = await deleteNote(noteId);
  return deleted ? new NextResponse(null, { status: 204 }) : notFound("note");
}
