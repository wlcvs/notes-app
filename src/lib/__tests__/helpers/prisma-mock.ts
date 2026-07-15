import { vi } from "vitest";

// Mirrors the debt-tracker helper: an in-memory stand-in for the Prisma client
// so lib tests never touch a database. $transaction runs the callback against
// the same mock (or awaits an array), matching Prisma's interactive/batch API.
export const prismaMock = {
  note: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    deleteMany: vi.fn(),
  },
  videoNote: {
    findUnique: vi.fn(),
  },
  video: {
    upsert: vi.fn(),
  },
  entry: {
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  videoEntry: {
    update: vi.fn(),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return arg(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
