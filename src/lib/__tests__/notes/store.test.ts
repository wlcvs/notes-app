import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  listNotes,
  getNote,
  deleteNote,
  deleteEntry,
} from "@/lib/notes/store";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("store.listNotes", () => {
  it("returns notes ordered by updatedAt desc with source + entry count", async () => {
    const rows = [{ id: "n1" }, { id: "n2" }];
    prismaMock.note.findMany.mockResolvedValue(rows);

    const result = await listNotes();

    expect(result).toBe(rows);
    expect(prismaMock.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: "desc" },
        include: expect.objectContaining({
          _count: { select: { entries: true } },
        }),
      }),
    );
  });
});

describe("store.getNote", () => {
  it("loads a note by id with its entries", async () => {
    const note = { id: "n1", entries: [] };
    prismaMock.note.findUnique.mockResolvedValue(note);

    const result = await getNote("n1");

    expect(result).toBe(note);
    expect(prismaMock.note.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" } }),
    );
  });

  it("returns null when the note is missing", async () => {
    prismaMock.note.findUnique.mockResolvedValue(null);
    expect(await getNote("nope")).toBeNull();
  });
});

describe("store.deleteNote", () => {
  it("returns true when a note was removed", async () => {
    prismaMock.note.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteNote("n1")).toBe(true);
    expect(prismaMock.note.deleteMany).toHaveBeenCalledWith({
      where: { id: "n1" },
    });
  });

  it("returns false (idempotent) when nothing matched", async () => {
    prismaMock.note.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteNote("missing")).toBe(false);
  });
});

describe("store.deleteEntry", () => {
  it("returns true when an entry was removed", async () => {
    prismaMock.entry.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteEntry("e1")).toBe(true);
    expect(prismaMock.entry.deleteMany).toHaveBeenCalledWith({
      where: { id: "e1" },
    });
  });

  it("returns false when the entry was already gone", async () => {
    prismaMock.entry.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteEntry("gone")).toBe(false);
  });
});
