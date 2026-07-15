"use client";

import { useEffect, useState } from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import { formatTimestamp, parseTimestamp } from "./format";

/*
 * Markdown surface for entries, built on Milkdown (ProseMirror). One low-level
 * field powers two uses: a read-only renderer for the transcript, and the
 * editable body inside NoteEditor. `body` is markdown; that is the stored format.
 */

interface MilkdownFieldProps {
  value: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
}

function MilkdownFieldInner({ value, editable = true, onChange }: MilkdownFieldProps) {
  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => editable,
        }));
        if (onChange) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown);
          });
        }
      })
      .use(commonmark)
      .use(gfm)
      .use(listener),
  );

  return <Milkdown />;
}

/**
 * Mount guard: Milkdown builds a contenteditable tree that must not be part of
 * the server-rendered HTML (hydration mismatch), so the editor is only created
 * after mount. Until then a plain-text fallback stands in.
 */
function MilkdownField({ value, editable = true, onChange }: MilkdownFieldProps) {
  const [mounted, setMounted] = useState(false);
  // Intentional: render the plain-text fallback on the server and the first
  // client render (matching HTML), then build the Milkdown contenteditable tree
  // only after mount to avoid a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="milkdown-shell whitespace-pre-wrap font-mono text-sm text-muted">
        {value || (editable ? "" : "(empty)")}
      </div>
    );
  }

  return (
    <div className="milkdown-shell">
      <MilkdownProvider>
        <MilkdownFieldInner value={value} editable={editable} onChange={onChange} />
      </MilkdownProvider>
    </div>
  );
}

/** Read-only rendered markdown, used by the transcript rows. */
export function MarkdownView({ body }: { body: string }) {
  if (body.trim() === "") {
    return <p className="text-sm text-muted italic">(empty entry)</p>;
  }
  return <MarkdownViewInner body={body} />;
}

// Keyed by body so an optimistic edit re-renders the read-only view with the
// new content instead of keeping a stale editor instance.
function MarkdownViewInner({ body }: { body: string }) {
  return <MilkdownField key={body} value={body} editable={false} />;
}

export interface NoteEditorProps {
  initialBody: string;
  initialT: number;
  submitLabel: string;
  onSubmit: (values: { t: number; body: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/**
 * Create / edit an entry. Body is markdown with a toggle between the rendered
 * Milkdown editor and the raw markdown source (both reflect the same string).
 * The timestamp is entered as `M:SS` and parsed back to raw seconds on submit.
 */
export function NoteEditor({
  initialBody,
  initialT,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: NoteEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [rawMode, setRawMode] = useState(false);
  const [timeText, setTimeText] = useState(formatTimestamp(initialT));

  const parsedT = parseTimestamp(timeText);
  const timeValid = parsedT !== null;

  function handleSubmit() {
    if (parsedT === null) return;
    onSubmit({ t: parsedT, body });
  }

  return (
    <div className="flex flex-col gap-3 border border-border-strong bg-surface-raised p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="hud-label">time</span>
          <input
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder="M:SS"
            className={`w-24 border bg-surface px-2 py-1 font-mono text-sm text-foreground focus:outline-none ${
              timeValid ? "border-border-strong" : "border-accent-red"
            }`}
          />
        </label>
        {!timeValid && (
          <span className="hud-label text-accent-red">invalid time</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRawMode((v) => !v)}
            className="hud-label border border-border-strong px-2 py-1 text-muted-strong hover:text-foreground"
          >
            {rawMode ? "rendered" : "raw"}
          </button>
        </div>
      </div>

      {rawMode ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-foreground focus:outline-none"
          placeholder="# markdown"
        />
      ) : (
        <MilkdownField value={body} editable onChange={setBody} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!timeValid}
          className="hud-label border border-accent-cyan px-3 py-1 text-accent-cyan hover:bg-accent-cyan hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="hud-label border border-border-strong px-3 py-1 text-muted-strong hover:text-foreground"
        >
          cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="hud-label ml-auto border border-accent-red px-3 py-1 text-accent-red hover:bg-accent-red hover:text-background"
          >
            delete
          </button>
        )}
      </div>
    </div>
  );
}
