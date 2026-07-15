import { z } from "zod";
import { NoteType } from "@/generated/prisma/client";

/*
 * Payload validation. Two dimensions are per-type, mirroring the schema: the
 * note's SOURCE (discriminated by `type`) and each entry's ANCHOR (selected by
 * the owning note's type). A new note type adds one member to each union here.
 */

// --- Source: the body of POST /api/notes (idempotent get-or-create) ---

// Best-effort scrape: title/channel may be empty; the list falls back to url/id.
export const videoSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  channel: z.string(),
  url: z.string().min(1),
});
export type VideoSourceInput = z.infer<typeof videoSourceSchema>;

export const createNoteSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(NoteType.VIDEO),
    video: videoSourceSchema,
  }),
]);
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// --- Anchor: the body of the entries endpoints, one schema per note type ---

export const createVideoEntrySchema = z.object({
  t: z.number().int().nonnegative(), // seconds
  body: z.string(),
});
export type CreateVideoEntryInput = z.infer<typeof createVideoEntrySchema>;

export const updateVideoEntrySchema = z
  .object({
    t: z.number().int().nonnegative().optional(),
    body: z.string().optional(),
  })
  .refine((d) => d.t !== undefined || d.body !== undefined, {
    message: "provide at least one of `t` or `body`",
  });
export type UpdateVideoEntryInput = z.infer<typeof updateVideoEntrySchema>;

// Lookup by note type — the entries route picks the schema from the note it
// loaded, so the anchor shape always matches the note's type.
export const createEntrySchemaByType = {
  [NoteType.VIDEO]: createVideoEntrySchema,
} satisfies Record<NoteType, z.ZodTypeAny>;

export const updateEntrySchemaByType = {
  [NoteType.VIDEO]: updateVideoEntrySchema,
} satisfies Record<NoteType, z.ZodTypeAny>;
