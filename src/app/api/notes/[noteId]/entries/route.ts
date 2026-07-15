import { NextResponse } from "next/server";
import { getNoteType } from "@/lib/notes/store";
import { addVideoEntry } from "@/lib/notes/video";
import {
  createEntrySchemaByType,
  type CreateVideoEntryInput,
} from "@/lib/notes/schemas";
import { NoteType } from "@/generated/prisma/client";
import { invalid, malformedJson, notFound, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ noteId: string }> };

// POST /api/notes/[noteId]/entries — create an entry whose payload is validated
// against the owning note's type (VIDEO: { t, body }).
export async function POST(req: Request, { params }: Ctx) {
  const { noteId } = await params;
  const type = await getNoteType(noteId);
  if (!type) return notFound("note");

  const body = await readJson(req);
  if (body === null) return malformedJson();

  const parsed = createEntrySchemaByType[type].safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  switch (type) {
    case NoteType.VIDEO: {
      const data = parsed.data as CreateVideoEntryInput;
      const entry = await addVideoEntry({ noteId, t: data.t, body: data.body });
      return NextResponse.json(entry, { status: 201 });
    }
  }
  // Exhaustive over NoteType; a new type adds a case above.
  const exhaustive: never = type;
  throw new Error(`unhandled note type: ${exhaustive}`);
}
