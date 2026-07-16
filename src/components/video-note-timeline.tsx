"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Entry } from "./types";
import { formatTimestamp } from "./format";
import { MarkdownView, NoteEditor } from "./note-editor";
import { type YouTubePlayerHandle } from "./youtube-player";

const YouTubePlayer = dynamic(() => import("./youtube-player"), {
  ssr: false,
});

interface VideoNoteTimelineProps {
  videoId: string;
  entries: Entry[];
  onCreate: (values: { t: number; body: string }) => void;
  onUpdate: (entryId: string, values: { t: number; body: string }) => void;
  onDelete: (entryId: string) => void;
}

/**
 * The open VIDEO note: an embedded player on top and the entries as a
 * transcript (timestamp on the left, rendered markdown on the right). Clicking a
 * timestamp seeks the player. Editing/creating uses NoteEditor; all mutations
 * are handled optimistically by the shell.
 */
export function VideoNoteTimeline({
  videoId,
  entries,
  onCreate,
  onUpdate,
  onDelete,
}: VideoNoteTimelineProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newT, setNewT] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const ordered = [...entries].sort(
    (a, b) => (a.video?.t ?? 0) - (b.video?.t ?? 0),
  );

  function seek(t: number) {
    playerRef.current?.seekTo(t);
  }

  function startAdding() {
    setEditingId(null);
    setNewT(Math.floor(playerRef.current?.getCurrentTime() ?? 0));
    setAdding(true);
  }

  function revealEntry(entryId: string, t: number) {
    seek(t);
    const row = rowRefs.current.get(entryId);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(entryId);
      window.setTimeout(() => setHighlightedId(null), 1500);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <YouTubePlayer
        ref={playerRef}
        videoId={videoId}
        markers={ordered.map((entry) => ({
          id: entry.id,
          t: entry.video?.t ?? 0,
          onClick: () => revealEntry(entry.id, entry.video?.t ?? 0),
        }))}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="hud-label">transcript // {ordered.length} entries</span>
          {!adding && (
            <button
              type="button"
              data-testid="add-entry-button"
              onClick={startAdding}
              className="hud-label border border-accent-cyan px-3 py-1 text-accent-cyan hover:bg-accent-cyan hover:text-background"
            >
              add entry
            </button>
          )}
        </div>

        {adding && (
          <NoteEditor
            initialBody=""
            initialT={newT}
            submitLabel="create"
            onSubmit={(values) => {
              onCreate(values);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {ordered.length === 0 && !adding && (
          <p className="border border-border border-dashed p-6 text-center text-sm text-muted">
            No entries yet. Use ADD ENTRY, or capture from the timeline via the
            extension.
          </p>
        )}

        <ol className="flex flex-col">
          {ordered.map((entry) => {
            const t = entry.video?.t ?? 0;
            const isEditing = editingId === entry.id;
            const isHighlighted = highlightedId === entry.id;
            return (
              <li
                key={entry.id}
                data-testid="entry-item"
                data-entry-id={entry.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(entry.id, el);
                  else rowRefs.current.delete(entry.id);
                }}
                className={`border-b border-border py-3 last:border-b-0 transition-colors ${
                  isHighlighted ? "bg-accent-cyan/15" : ""
                }`}
              >
                {isEditing ? (
                  <NoteEditor
                    initialBody={entry.body}
                    initialT={t}
                    submitLabel="save"
                    onSubmit={(values) => {
                      onUpdate(entry.id, values);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => {
                      onDelete(entry.id);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => seek(t)}
                      title="Seek player to this timestamp"
                      className="hud-label shrink-0 text-accent-cyan hover:text-foreground"
                    >
                      {formatTimestamp(t)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <MarkdownView body={entry.body} />
                    </div>
                    <button
                      type="button"
                      data-testid="entry-edit-button"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(entry.id);
                      }}
                      className="hud-label shrink-0 text-muted hover:text-foreground"
                    >
                      edit
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
