import { NextResponse } from "next/server";
import { listNotes } from "@/lib/notes/store";
import { getNoteByVideoId, getOrCreateVideoNote } from "@/lib/notes/video";
import { createNoteSchema } from "@/lib/notes/schemas";
import { invalid, malformedJson, notFound, readJson } from "@/lib/http";

// GET /api/notes            -> list of notes for `/`
// GET /api/notes?videoId=ID -> that video's note + entries (or 404)
export async function GET(req: Request) {
  const videoId = new URL(req.url).searchParams.get("videoId");
  if (videoId) {
    const note = await getNoteByVideoId(videoId);
    return note ? NextResponse.json(note) : notFound("note");
  }
  return NextResponse.json(await listNotes());
}

// POST /api/notes — idempotent get-or-create, keyed by the source (videoId).
// Returns the note (created now or already existing) with its entries.
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return malformedJson();

  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { video } = parsed.data;
  const note = await getOrCreateVideoNote(video.id, {
    title: video.title,
    channel: video.channel,
    url: video.url,
  });
  return NextResponse.json(note);
}
