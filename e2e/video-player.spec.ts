import { APIRequestContext, expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

// A stable, long (~10min), embeddable public-domain video (Blender
// Foundation) used to exercise the real Plyr/YouTube integration. Unlike
// notes.spec.ts's CRUD tests (which use a random UUID as the video id, so the
// player never actually loads), these tests need a real video to load
// metadata, report duration and seek.
const REAL_VIDEO_ID = "YE7VzlLtp-4"; // Big Buck Bunny (Blender Foundation)

function videoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function makeNotePayload(videoId: string, title: string) {
  return {
    type: "VIDEO",
    video: {
      id: videoId,
      title,
      channel: "Playwright E2E",
      url: videoUrl(videoId),
    },
  };
}

// Parses Plyr's "current-time" control text (M:SS or H:MM:SS) into seconds.
function parseClockText(text: string): number {
  const parts = text.split(":").map((p) => Number.parseInt(p, 10));
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

/**
 * POST /api/notes is an idempotent get-or-create keyed by videoId (see
 * src/app/api/notes/route.ts): posting an already-used videoId silently
 * returns (and, via the title in this payload, overwrites metadata on) the
 * EXISTING note instead of creating a new one. Combined with this suite's
 * afterEach cleanup, reusing a videoId that already has a real note would
 * delete real user data (this happened once during development — a real note
 * for `dQw4w9WgXcQ` was destroyed this way). Always check first and refuse to
 * proceed if the video is already in use, instead of assuming we own it.
 */
async function createIsolatedVideoNote(
  request: APIRequestContext,
  videoId: string,
  title: string,
) {
  const existing = await request.get(
    `/api/notes?videoId=${encodeURIComponent(videoId)}`,
  );
  if (existing.status() !== 404) {
    throw new Error(
      `Refusing to run: a note already exists for video "${videoId}" ` +
        `(GET /api/notes?videoId=... returned ${existing.status()}, expected 404). ` +
        `Reusing it would let this test's cleanup delete real data. Pick a ` +
        `different test video id.`,
    );
  }

  const payload = makeNotePayload(videoId, title);
  const createRes = await request.post("/api/notes", { data: payload });
  expect(createRes.ok()).toBe(true);
  const note = (await createRes.json()) as { id: string };
  return { note, payload };
}

test.describe("video player", () => {
  let noteId: string | undefined;

  test.afterEach(async ({ request }) => {
    if (!noteId) return;
    await request.delete(`/api/notes/${noteId}`);
    noteId = undefined;
  });

  test("keeps transcript entries at a compact height", async ({
    page,
    request,
  }) => {
    // Doesn't need a real video to load: the entry row layout is independent
    // of player state, so a random id keeps this test fast.
    const videoId = randomUUID();
    const { note, payload } = await createIsolatedVideoNote(
      request,
      videoId,
      `E2E Height ${videoId}`,
    );
    noteId = note.id;

    const entryRes = await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: 5, body: "One short line of transcript text." },
    });
    expect(entryRes.ok()).toBe(true);

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    const entry = page.getByTestId("entry-item").first();
    await expect(entry).toBeVisible();

    const box = await entry.boundingBox();
    expect(box).not.toBeNull();
    // A single short line should render well under 120px; the regression
    // this guards against rendered ~350px of empty space per entry.
    expect(box!.height).toBeLessThan(120);
  });

  test("shows a timeline marker for each entry", async ({ page, request }) => {
    const { note, payload } = await createIsolatedVideoNote(
      request,
      REAL_VIDEO_ID,
      `E2E Markers ${randomUUID()}`,
    );
    noteId = note.id;

    await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: 10, body: "First" },
    });
    await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: 20, body: "Second" },
    });

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    await expect(page.locator(".plyr-timeline-marker")).toHaveCount(2, {
      timeout: 30_000,
    });
  });

  test("clicking a timestamp seeks the player", async ({ page, request }) => {
    const { note, payload } = await createIsolatedVideoNote(
      request,
      REAL_VIDEO_ID,
      `E2E Seek ${randomUUID()}`,
    );
    noteId = note.id;

    const targetSeconds = 30;
    await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: targetSeconds, body: "Seek target" },
    });

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    // Wait for the player to actually load metadata (marker rendering is
    // gated on the same duration state as seeking).
    await expect(page.locator(".plyr-timeline-marker")).toHaveCount(1, {
      timeout: 30_000,
    });

    const entry = page.getByTestId("entry-item").filter({ hasText: "Seek target" });
    await entry.getByRole("button", { name: "0:30" }).click();

    const currentTime = page.locator(".plyr__time--current");
    await expect
      .poll(
        async () => parseClockText(await currentTime.innerText()),
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(targetSeconds - 2);
  });

  test("editing an entry does not reload the player", async ({
    page,
    request,
  }) => {
    const { note, payload } = await createIsolatedVideoNote(
      request,
      REAL_VIDEO_ID,
      `E2E NoReload ${randomUUID()}`,
    );
    noteId = note.id;

    const targetSeconds = 40;
    await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: targetSeconds, body: "Reload guard" },
    });

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    await expect(page.locator(".plyr-timeline-marker")).toHaveCount(1, {
      timeout: 30_000,
    });

    const entry = page
      .getByTestId("entry-item")
      .filter({ hasText: "Reload guard" });
    await entry.getByRole("button", { name: "0:40" }).click();

    const currentTime = page.locator(".plyr__time--current");
    await expect
      .poll(async () => parseClockText(await currentTime.innerText()), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(targetSeconds - 2);

    await entry.getByTestId("entry-edit-button").click();
    await expect(page.getByTestId("note-editor")).toBeVisible();

    // If the player were destroyed and recreated (the bug), Plyr would
    // rebuild the iframe at 0:00 instead of keeping the seeked position.
    await expect
      .poll(async () => parseClockText(await currentTime.innerText()), {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(targetSeconds - 5);
  });
});
