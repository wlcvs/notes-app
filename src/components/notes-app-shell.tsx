"use client";

import { useEffect, useRef, useState } from "react";
import type { Entry, NoteDetail, NoteListItem } from "./types";
import { formatDateTime, formatTimestamp } from "./format";
import { VideoNoteTimeline } from "./video-note-timeline";

/*
 * Single-route SPA shell. The address bar always stays at `/`:
 *  - Opening a note is client state, not navigation.
 *  - Browser back/forward toggle list <-> note via the History API (pushState
 *    keeps the same URL; popstate restores the view).
 *  - The open note id is persisted in sessionStorage so F5 reopens it.
 * A note's entries are loaded from the local API when it is opened, and all
 * entry mutations are optimistic (no reload).
 */

const SESSION_KEY = "notes-app:open-note";

type HistoryView =
  | { view: "list" }
  | { view: "note"; noteId: string };

interface NotesAppShellProps {
  initialNotes: NoteListItem[];
}

export function NotesAppShell({ initialNotes }: NotesAppShellProps) {
  const [notes, setNotes] = useState<NoteListItem[]>(initialNotes);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // --- History + sessionStorage wiring -------------------------------------

  // popstate listener (its own effect so React strict-mode add/remove is clean).
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state = event.state as HistoryView | null;
      if (state && state.view === "note") {
        window.sessionStorage.setItem(SESSION_KEY, state.noteId);
        setDetailLoading(true);
        setDetailError(null);
        setOpenNoteId(state.noteId);
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
        setOpenNoteId(null);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Initialize history once: tag the current entry as the list, then (if a note
  // was open before a reload) push it back on top so back/forward has a base.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const here = window.location.href;
    window.history.replaceState({ view: "list" } satisfies HistoryView, "", here);

    const saved = window.sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      window.history.pushState(
        { view: "note", noteId: saved } satisfies HistoryView,
        "",
        here,
      );
      // Legitimate browser-state restore: reopen the note the user had open
      // before the reload. This runs exactly once (guarded by `bootstrapped`).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenNoteId(saved);
    }
  }, []);

  // --- Load the open note's entries from the API ---------------------------

  useEffect(() => {
    // The list view (openNoteId === null) clears detail state via the
    // navigation handlers, so the effect only runs to load an open note.
    if (openNoteId === null) return;

    let cancelled = false;

    fetch(`/api/notes/${openNoteId}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("not_found");
        if (!res.ok) throw new Error("failed");
        return (await res.json()) as NoteDetail;
      })
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetailLoading(false);
        if (err instanceof Error && err.message === "not_found") {
          // The note is gone: fall back to the list.
          window.sessionStorage.removeItem(SESSION_KEY);
          setDetail(null);
          setOpenNoteId(null);
        } else {
          setDetailError("Failed to load note.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [openNoteId]);

  // --- Navigation (URL never changes) --------------------------------------

  function openNote(noteId: string) {
    window.history.pushState(
      { view: "note", noteId } satisfies HistoryView,
      "",
      window.location.href,
    );
    window.sessionStorage.setItem(SESSION_KEY, noteId);
    setMutationError(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setOpenNoteId(noteId);
  }

  function goBackToList() {
    // Defer to the browser so the History API stack stays consistent; the
    // popstate handler restores the list view.
    window.history.back();
  }

  // --- List bookkeeping for optimistic mutations ---------------------------

  function touchList(noteId: string, when: string, entryDelta = 0) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? {
              ...n,
              updatedAt: when,
              _count: {
                entries: Math.max(0, n._count.entries + entryDelta),
              },
            }
          : n,
      ),
    );
  }

  // --- Optimistic entry mutations ------------------------------------------

  async function handleCreate(values: { t: number; body: string }) {
    if (!detail) return;
    const noteId = detail.id;
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}`;
    const optimistic: Entry = {
      id: tempId,
      body: values.body,
      createdAt: now,
      updatedAt: now,
      video: { entryId: tempId, t: values.t },
    };

    setMutationError(null);
    setDetail((d) =>
      d && d.id === noteId
        ? { ...d, updatedAt: now, entries: [...d.entries, optimistic] }
        : d,
    );
    touchList(noteId, now, +1);

    try {
      const res = await fetch(`/api/notes/${noteId}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: values.t, body: values.body }),
      });
      if (!res.ok) throw new Error("failed");
      const real = (await res.json()) as Entry;
      setDetail((d) =>
        d && d.id === noteId
          ? {
              ...d,
              entries: d.entries.map((e) => (e.id === tempId ? real : e)),
            }
          : d,
      );
    } catch {
      setDetail((d) =>
        d && d.id === noteId
          ? { ...d, entries: d.entries.filter((e) => e.id !== tempId) }
          : d,
      );
      touchList(noteId, now, -1);
      setMutationError("Failed to create entry.");
    }
  }

  async function handleUpdate(
    entryId: string,
    values: { t: number; body: string },
  ) {
    if (!detail) return;
    const noteId = detail.id;
    const now = new Date().toISOString();
    const previous = detail.entries.find((e) => e.id === entryId);

    setMutationError(null);
    setDetail((d) =>
      d && d.id === noteId
        ? {
            ...d,
            entries: d.entries.map((e) =>
              e.id === entryId
                ? {
                    ...e,
                    body: values.body,
                    updatedAt: now,
                    video: { entryId: e.id, t: values.t },
                  }
                : e,
            ),
          }
        : d,
    );
    touchList(noteId, now);

    try {
      const res = await fetch(`/api/notes/${noteId}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: values.t, body: values.body }),
      });
      if (!res.ok) throw new Error("failed");
      const real = (await res.json()) as Entry;
      setDetail((d) =>
        d && d.id === noteId
          ? { ...d, entries: d.entries.map((e) => (e.id === entryId ? real : e)) }
          : d,
      );
    } catch {
      if (previous) {
        setDetail((d) =>
          d && d.id === noteId
            ? {
                ...d,
                entries: d.entries.map((e) =>
                  e.id === entryId ? previous : e,
                ),
              }
            : d,
        );
      }
      setMutationError("Failed to save entry.");
    }
  }

  async function handleDelete(entryId: string) {
    if (!detail) return;
    const noteId = detail.id;
    const now = new Date().toISOString();
    const previousEntries = detail.entries;

    setMutationError(null);
    setDetail((d) =>
      d && d.id === noteId
        ? { ...d, entries: d.entries.filter((e) => e.id !== entryId) }
        : d,
    );
    touchList(noteId, now, -1);

    try {
      const res = await fetch(`/api/notes/${noteId}/entries/${entryId}`, {
        method: "DELETE",
      });
      if (res.status !== 204 && !res.ok) throw new Error("failed");
    } catch {
      setDetail((d) =>
        d && d.id === noteId ? { ...d, entries: previousEntries } : d,
      );
      touchList(noteId, now, +1);
      setMutationError("Failed to delete entry.");
    }
  }

  // --- Render ---------------------------------------------------------------

  const showingNote = openNoteId !== null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="mb-8 flex items-baseline justify-between border-b border-border-strong pb-3">
        <span className="font-mono text-sm tracking-widest text-foreground">
          NOTES
        </span>
        <span className="hud-label">
          {showingNote ? "note // open" : `list // ${notes.length} notes`}
        </span>
      </header>

      {mutationError && (
        <div className="mb-4 flex items-center justify-between border border-accent-red bg-surface px-3 py-2">
          <span className="text-sm text-accent-red">{mutationError}</span>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="hud-label text-accent-red hover:text-foreground"
          >
            dismiss
          </button>
        </div>
      )}

      {showingNote ? (
        <NoteView
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onBack={goBackToList}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ) : (
        <NoteList notes={notes} onOpen={openNote} />
      )}
    </div>
  );
}

// --- List view --------------------------------------------------------------

function NoteList({
  notes,
  onOpen,
}: {
  notes: NoteListItem[];
  onOpen: (noteId: string) => void;
}) {
  const ordered = [...notes].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  if (ordered.length === 0) {
    return (
      <p className="border border-dashed border-border p-10 text-center text-sm text-muted">
        No notes yet. Capture one from a YouTube timeline with the extension.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((note) => {
        const meta = note.video?.video;
        const title = meta?.title || meta?.url || note.video?.videoId || note.id;
        const channel = meta?.channel;
        return (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onOpen(note.id)}
              className="flex w-full flex-col gap-1 border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent-cyan hover:bg-surface-raised"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="truncate font-medium text-foreground">
                  {title}
                </span>
                <span className="hud-label shrink-0 text-accent-cyan">
                  {note.type}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="truncate text-sm text-muted">
                  {channel || "unknown channel"}
                </span>
                <span className="hud-label shrink-0">
                  {note._count.entries} entries // {formatDateTime(note.updatedAt)}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- Open-note view ---------------------------------------------------------

function NoteView({
  detail,
  loading,
  error,
  onBack,
  onCreate,
  onUpdate,
  onDelete,
}: {
  detail: NoteDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onCreate: (values: { t: number; body: string }) => void;
  onUpdate: (entryId: string, values: { t: number; body: string }) => void;
  onDelete: (entryId: string) => void;
}) {
  const meta = detail?.video?.video;
  const title = meta?.title || meta?.url || detail?.video?.videoId || "note";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-medium text-foreground">
            {title}
          </h1>
          {meta?.channel && (
            <p className="truncate text-sm text-muted">{meta.channel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="hud-label shrink-0 border border-border-strong px-3 py-1 text-muted-strong hover:text-foreground"
        >
          back
        </button>
      </div>

      {loading && !detail && (
        <p className="hud-label text-muted">loading note...</p>
      )}
      {error && <p className="text-sm text-accent-red">{error}</p>}

      {detail?.video && (
        <VideoNoteTimeline
          videoId={detail.video.videoId}
          entries={detail.entries}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}

      {detail && !detail.video && (
        <p className="text-sm text-muted">
          This note type has no video source. Entries:{" "}
          {detail.entries.length}. Timestamp anchors are shown as{" "}
          {formatTimestamp(0)} for reference only.
        </p>
      )}
    </div>
  );
}
