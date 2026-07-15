"use client";

import { useRef, useState } from "react";
import type { Entry } from "./types";
import { formatTimestamp } from "./format";
import { YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";
import { MarkdownView, NoteEditor } from "./note-editor";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newT, setNewT] = useState(0);

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

  return (
    <div className="flex flex-col gap-6">
      <YouTubePlayer ref={playerRef} videoId={videoId} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="hud-label">transcript // {ordered.length} entries</span>
          {!adding && (
            <button
              type="button"
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
            return (
              <li
                key={entry.id}
                className="border-b border-border py-3 last:border-b-0"
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
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => seek(t)}
                      title="Seek player to this timestamp"
                      className="hud-label shrink-0 pt-0.5 text-accent-cyan hover:text-foreground"
                    >
                      {formatTimestamp(t)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <MarkdownView body={entry.body} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(entry.id);
                      }}
                      className="hud-label shrink-0 self-start text-muted hover:text-foreground"
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
