// Timestamp presentation. `t` is stored in raw seconds; `MM:SS` / `H:MM:SS` is
// display only. These helpers convert between the two for the transcript and the
// editor's timestamp field.

/** Seconds -> `M:SS` (or `H:MM:SS` past an hour). */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  if (h > 0) {
    const mm = String(m).padStart(2, "0");
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

/**
 * Parse a user-entered timestamp into seconds. Accepts plain seconds (`90`),
 * `M:SS`, or `H:MM:SS`. Returns null when the input can't be parsed.
 */
export function parseTimestamp(input: string): number | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);

  const parts = raw.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  return parts.reduce((acc, p) => acc * 60 + Number.parseInt(p, 10), 0);
}

/** ISO string -> compact local date-time for the list's "last updated". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
