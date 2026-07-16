"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AtomicCodeMirrorEditor,
  type AtomicCodeMirrorEditorHandle,
} from "@atomic-editor/editor";
import "@atomic-editor/editor/styles.css";
import { EditorView } from "@codemirror/view";
import { formatTimestamp, parseTimestamp } from "./format";

/*
 * Markdown surface for entries, built on Atomic Editor (CodeMirror 6). One
 * component powers two uses: a read-only renderer for the transcript, and the
 * editable body inside NoteEditor. `body` is markdown; that is the stored format.
 */

// Shared mount guard: Atomic builds a contenteditable tree that must not be
// part of the server-rendered HTML (hydration mismatch).
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// Minimal HUD theme for the Atomic surface, scoped to our editor shell.
const atomicHudTheme = EditorView.theme(
  {
    "&": {
      background: "var(--surface)",
      color: "var(--foreground)",
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      fontSize: "0.9rem",
      lineHeight: "1.55",
    },
    ".cm-content": {
      padding: "0.5rem 0.75rem",
      caretColor: "var(--accent-cyan)",
      minHeight: "3rem",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--accent-cyan)",
    },
    "&.cm-focused .cm-selectionBackground, & ::selection": {
      background: "color-mix(in srgb, var(--accent-cyan) 28%, transparent)",
    },
    ".cm-activeLine": {
      background: "var(--surface-raised)",
    },
    ".cm-link": {
      color: "var(--accent-cyan)",
      textDecoration: "underline",
    },
    ".cm-list-bullet": {
      color: "var(--accent-cyan)",
    },
    ".cm-strong, .cm-heading": {
      color: "var(--foreground)",
      fontWeight: "600",
    },
    ".cm-emphasis": {
      fontStyle: "italic",
    },
    ".cm-code": {
      background: "var(--surface-raised)",
      padding: "0.1em 0.3em",
      borderRadius: "2px",
    },
    ".cm-blockQuote": {
      borderLeft: "2px solid var(--border-strong)",
      paddingLeft: "0.75rem",
      color: "var(--muted-strong)",
    },
    ".atomic-editor--inline-preview-decoration, .atomic-editor--inline-preview-strong, .atomic-editor--inline-preview-emphasis, .atomic-editor--inline-preview-code":
      {
        color: "var(--foreground)",
      },
  },
  { dark: true },
);

const ATOMIC_EXTENSIONS = [atomicHudTheme];

interface AtomicFieldProps {
  value: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
}

function AtomicFieldInner({
  value,
  editable = true,
  onChange,
}: AtomicFieldProps) {
  const editorRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);

  return (
    <AtomicCodeMirrorEditor
      markdownSource={value}
      readOnly={!editable}
      onMarkdownChange={onChange}
      editorHandleRef={editorRef}
      extensions={ATOMIC_EXTENSIONS}
      blurEditorOnMount={!editable}
    />
  );
}

function AtomicField({ value, editable = true, onChange }: AtomicFieldProps) {
  const isClient = useIsClient();
  const containerClass = `atomic-shell border border-border-strong bg-surface${
    editable ? "" : " atomic-shell--readonly"
  }`;

  if (!isClient) {
    return (
      <div className={containerClass}>
        <div className="whitespace-pre-wrap px-3 py-2 font-mono text-sm text-muted">
          {value || (editable ? "" : "(empty)")}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <AtomicFieldInner
        value={value}
        editable={editable}
        onChange={onChange}
      />
    </div>
  );
}

/** Read-only rendered markdown, used by the transcript rows. */
export function MarkdownView({ body }: { body: string }) {
  if (body.trim() === "") {
    return <p className="text-sm text-muted italic">(empty entry)</p>;
  }
  return (
    // Keyed by body so an optimistic edit re-renders with fresh content.
    <AtomicField key={body} value={body} editable={false} />
  );
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
 * Create / edit an entry. Body is markdown edited in Atomic Editor with
 * Obsidian-style live preview. Closing via Esc or click-outside discards the
 * current editing session without touching the persisted entry.
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
  const [timeText, setTimeText] = useState(formatTimestamp(initialT));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedT = parseTimestamp(timeText);
  const timeValid = parsedT !== null;

  function handleSubmit() {
    if (parsedT === null) return;
    onSubmit({ t: parsedT, body });
  }

  function handleCancel() {
    setConfirmingDelete(false);
    onCancel();
  }

  function handleDeleteConfirmed() {
    setConfirmingDelete(false);
    onDelete?.();
  }

  // Close on Esc, but ignore if a CodeMirror popup/tooltip is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      const cmTooltip = document.querySelector<HTMLElement>(
        ".cm-tooltip, .cm-tooltip-autocomplete, .cm-tooltip-hover",
      );
      if (cmTooltip) {
        // Let CodeMirror close its own popup first.
        active?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        return;
      }
      onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // Close on click outside; tolerate CodeMirror portals.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) return;

      const composedPath = event.composedPath?.() ?? [target];
      const isOutside =
        !containerRef.current.contains(target) &&
        !composedPath.some(
          (node) => node instanceof Node && containerRef.current?.contains(node),
        );

      if (!isOutside) return;

      // Don't close if the click is inside any CodeMirror tooltip/portal.
      const inCmPortal = composedPath.some(
        (node) =>
          node instanceof HTMLElement &&
          node.closest(".cm-tooltip, .cm-tooltip-autocomplete, .cm-tooltip-hover"),
      );
      if (inCmPortal) return;

      onCancel();
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [onCancel]);

  return (
    <div
      ref={containerRef}
      data-testid="note-editor"
      className="flex flex-col gap-3 border border-border-strong bg-surface-raised p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="hud-label">time</span>
          <input
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder="M:SS"
            data-testid="timestamp-input"
            className={`w-24 border bg-surface px-2 py-1 font-mono text-sm text-foreground focus:outline-none ${
              timeValid ? "border-border-strong" : "border-accent-red"
            }`}
          />
        </label>
        {!timeValid && (
          <span className="hud-label text-accent-red">invalid time</span>
        )}
      </div>

      <AtomicField value={body} editable onChange={setBody} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="submit-entry-button"
          onClick={handleSubmit}
          disabled={!timeValid}
          className="hud-label border border-accent-cyan px-3 py-1 text-accent-cyan hover:bg-accent-cyan hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          data-testid="cancel-entry-button"
          onClick={handleCancel}
          className="hud-label border border-border-strong px-3 py-1 text-muted-strong hover:text-foreground"
        >
          cancel
        </button>
        {onDelete && (
          <div className="ml-auto flex items-center gap-2">
            {confirmingDelete ? (
              <>
                  <button
                    type="button"
                    data-testid="confirm-delete-button"
                    onClick={handleDeleteConfirmed}
                    className="hud-label border border-accent-red bg-accent-red px-3 py-1 text-background hover:opacity-90"
                  >
                    confirm delete
                  </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="hud-label border border-border-strong px-3 py-1 text-muted-strong hover:text-foreground"
                >
                  keep
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="entry-delete-button"
                onClick={() => setConfirmingDelete(true)}
                className="hud-label border border-accent-red px-3 py-1 text-accent-red hover:bg-accent-red hover:text-background"
              >
                delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
