import { NextResponse } from "next/server";
import { deleteEntry, getNoteType } from "@/lib/notes/store";
import { updateVideoEntry } from "@/lib/notes/video";
import {
  updateEntrySchemaByType,
  type UpdateVideoEntryInput,
} from "@/lib/notes/schemas";
import { NoteType } from "@/generated/prisma/client";
import { invalid, malformedJson, notFound, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ noteId: string; entryId: string }> };

// PATCH /api/notes/[noteId]/entries/[entryId] — edit body and/or anchor.
export async function PATCH(req: Request, { params }: Ctx) {
  const { noteId, entryId } = await params;
  const type = await getNoteType(noteId);
  if (!type) return notFound("note");

  const body = await readJson(req);
  if (body === null) return malformedJson();

  const parsed = updateEntrySchemaByType[type].safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  switch (type) {
    case NoteType.VIDEO: {
      const data = parsed.data as UpdateVideoEntryInput;
      const entry = await updateVideoEntry({ entryId, t: data.t, body: data.body });
      return NextResponse.json(entry);
    }
  }
  const exhaustive: never = type;
  throw new Error(`unhandled note type: ${exhaustive}`);
}

// DELETE /api/notes/[noteId]/entries/[entryId] — remove one entry (cascade anchor).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { entryId } = await params;
  const deleted = await deleteEntry(entryId);
  return deleted ? new NextResponse(null, { status: 204 }) : notFound("entry");
}
