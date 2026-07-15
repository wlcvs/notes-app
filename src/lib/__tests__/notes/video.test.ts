import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  getOrCreateVideoNote,
  getNoteByVideoId,
  listVideoNotes,
  addVideoEntry,
  updateVideoEntry,
} from "@/lib/notes/video";

const meta = {
  title: "Building agents",
  channel: "AI Channel",
  url: "https://www.youtube.com/watch?v=abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateVideoNote", () => {
  it("creates the note (+ source) on first sight of a video", async () => {
    prismaMock.video.upsert.mockResolvedValue({ id: "abc123" });
    prismaMock.videoNote.findUnique.mockResolvedValue(null);
    prismaMock.note.create.mockResolvedValue({ id: "note1" });
    const finalNote = { id: "note1", entries: [] };
    prismaMock.note.findUniqueOrThrow.mockResolvedValue(finalNote);

    const result = await getOrCreateVideoNote("abc123", meta);

    expect(result).toBe(finalNote);
    expect(prismaMock.video.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "abc123" },
        create: { id: "abc123", ...meta },
      }),
    );
    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { type: "VIDEO", video: { create: { videoId: "abc123" } } },
      }),
    );
    expect(prismaMock.note.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "note1" } }),
    );
  });

  it("returns the existing note without creating a second one", async () => {
    prismaMock.video.upsert.mockResolvedValue({ id: "abc123" });
    prismaMock.videoNote.findUnique.mockResolvedValue({ noteId: "existing" });
    const finalNote = { id: "existing", entries: [] };
    prismaMock.note.findUniqueOrThrow.mockResolvedValue(finalNote);

    const result = await getOrCreateVideoNote("abc123", meta);

    expect(result).toBe(finalNote);
    expect(prismaMock.note.create).not.toHaveBeenCalled();
    expect(prismaMock.note.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "existing" } }),
    );
  });

  it("never overwrites stored metadata with empty scraped values", async () => {
    prismaMock.video.upsert.mockResolvedValue({ id: "abc123" });
    prismaMock.videoNote.findUnique.mockResolvedValue({ noteId: "n" });
    prismaMock.note.findUniqueOrThrow.mockResolvedValue({ id: "n" });

    await getOrCreateVideoNote("abc123", {
      title: "",
      channel: "Real Channel",
      url: "",
    });

    expect(prismaMock.video.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { channel: "Real Channel" } }),
    );
  });
});

describe("getNoteByVideoId", () => {
  it("finds a note by raw video id", async () => {
    const note = { id: "n1", entries: [] };
    prismaMock.note.findFirst.mockResolvedValue(note);

    const result = await getNoteByVideoId("abc123");

    expect(result).toBe(note);
    expect(prismaMock.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { video: { videoId: "abc123" } } }),
    );
  });

  it("returns null when no note exists for the video", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    expect(await getNoteByVideoId("nope")).toBeNull();
  });
});

describe("listVideoNotes", () => {
  it("lists VIDEO notes newest-updated first", async () => {
    const rows = [{ id: "n1" }];
    prismaMock.note.findMany.mockResolvedValue(rows);

    const result = await listVideoNotes();

    expect(result).toBe(rows);
    expect(prismaMock.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "VIDEO" },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });
});

describe("addVideoEntry", () => {
  it("creates an entry with its timestamp anchor in one nested write", async () => {
    const entry = { id: "e1", body: "note", video: { entryId: "e1", t: 42 } };
    prismaMock.entry.create.mockResolvedValue(entry);

    const result = await addVideoEntry({ noteId: "n1", t: 42, body: "note" });

    expect(result).toBe(entry);
    expect(prismaMock.entry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { noteId: "n1", body: "note", video: { create: { t: 42 } } },
      }),
    );
  });
});

describe("updateVideoEntry", () => {
  it("updates only the body when t is omitted", async () => {
    const entry = { id: "e1", body: "edited" };
    prismaMock.entry.findUniqueOrThrow.mockResolvedValue(entry);

    const result = await updateVideoEntry({ entryId: "e1", body: "edited" });

    expect(result).toBe(entry);
    expect(prismaMock.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { body: "edited" },
    });
    expect(prismaMock.videoEntry.update).not.toHaveBeenCalled();
  });

  it("updates only the anchor when body is omitted", async () => {
    prismaMock.entry.findUniqueOrThrow.mockResolvedValue({ id: "e1" });

    await updateVideoEntry({ entryId: "e1", t: 99 });

    expect(prismaMock.videoEntry.update).toHaveBeenCalledWith({
      where: { entryId: "e1" },
      data: { t: 99 },
    });
    expect(prismaMock.entry.update).not.toHaveBeenCalled();
  });

  it("updates both body and anchor together", async () => {
    prismaMock.entry.findUniqueOrThrow.mockResolvedValue({ id: "e1" });

    await updateVideoEntry({ entryId: "e1", t: 10, body: "both" });

    expect(prismaMock.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { body: "both" },
    });
    expect(prismaMock.videoEntry.update).toHaveBeenCalledWith({
      where: { entryId: "e1" },
      data: { t: 10 },
    });
  });
});
