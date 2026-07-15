import { listNotes } from "@/lib/notes/store";
import { NotesAppShell } from "@/components/notes-app-shell";
import type { NoteListItem } from "@/components/types";

// Rendered per request: the boot notes list must reflect the current database
// (new notes captured by the extension), never a build-time snapshot.
export const dynamic = "force-dynamic";

// The single page route. This server component loads the notes list directly
// from the data layer at boot (no self-fetch over HTTP) and mounts the client
// shell. The address bar stays at `/` for the whole app.
export default async function Home() {
  const notes = await listNotes();

  // Serialize Prisma rows (Date) into the client-facing shape (ISO strings),
  // so the shell renders the boot payload and API responses with one code path.
  const initialNotes: NoteListItem[] = notes.map((n) => ({
    id: n.id,
    type: n.type,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    video: n.video
      ? {
          videoId: n.video.videoId,
          video: {
            id: n.video.video.id,
            title: n.video.video.title,
            channel: n.video.video.channel,
            url: n.video.video.url,
          },
        }
      : null,
    _count: { entries: n._count.entries },
  }));

  return <NotesAppShell initialNotes={initialNotes} />;
}
