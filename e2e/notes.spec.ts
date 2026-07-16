import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

function videoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function makeNotePayload(videoId: string) {
  return {
    type: "VIDEO",
    video: {
      id: videoId,
      title: `E2E Test Video ${videoId}`,
      channel: "Playwright E2E",
      url: videoUrl(videoId),
    },
  };
}

test.describe("notes app", () => {
  // Tracks the note created by the running test so afterEach can always clean
  // it up, even if an assertion fails partway through the test body.
  let noteId: string | undefined;

  test.afterEach(async ({ request }) => {
    if (!noteId) return;
    await request.delete(`/api/notes/${noteId}`);
    noteId = undefined;
  });

  test("lists notes and opens one", async ({ page, request }) => {
    const videoId = randomUUID();
    const payload = makeNotePayload(videoId);
    const createRes = await request.post("/api/notes", { data: payload });
    expect(createRes.ok()).toBe(true);
    const note = (await createRes.json()) as { id: string };
    noteId = note.id;

    await page.goto("/");

    const noteItem = page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title });
    await expect(noteItem).toBeVisible();

    await noteItem.click();
    await expect(page.getByTestId("back-button")).toBeVisible();
    await expect(page.getByRole("heading", { name: payload.video.title })).toBeVisible();
  });

  test("creates an entry from the note view", async ({ page, request }) => {
    const videoId = randomUUID();
    const payload = makeNotePayload(videoId);
    const createRes = await request.post("/api/notes", { data: payload });
    expect(createRes.ok()).toBe(true);
    const note = (await createRes.json()) as { id: string };
    noteId = note.id;

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    await page.getByTestId("add-entry-button").click();
    await expect(page.getByTestId("note-editor")).toBeVisible();
    await page.getByTestId("timestamp-input").fill("1:23");
    await page.getByTestId("submit-entry-button").click();

    const entry = page.getByTestId("entry-item").filter({ hasText: "1:23" });
    await expect(entry).toBeVisible();
  });

  test("edits and deletes an entry", async ({ page, request }) => {
    const videoId = randomUUID();
    const payload = makeNotePayload(videoId);
    const createRes = await request.post("/api/notes", { data: payload });
    expect(createRes.ok()).toBe(true);
    const note = (await createRes.json()) as { id: string };
    noteId = note.id;

    const entryRes = await request.post(`/api/notes/${note.id}/entries`, {
      data: { t: 0, body: "Seeded entry" },
    });
    expect(entryRes.ok()).toBe(true);

    await page.goto("/");
    await page
      .getByTestId("note-list-item")
      .filter({ hasText: payload.video.title })
      .click();

    const entry = page
      .getByTestId("entry-item")
      .filter({ hasText: "Seeded entry" });
    await expect(entry).toBeVisible();

    // Edit the entry timestamp
    await entry.getByTestId("entry-edit-button").click();
    await expect(page.getByTestId("note-editor")).toBeVisible();
    await page.getByTestId("timestamp-input").fill("5:00");
    await page.getByTestId("submit-entry-button").click();

    await expect(entry).toContainText("5:00");

    // Delete it
    await entry.getByTestId("entry-edit-button").click();
    await page.getByTestId("entry-delete-button").click();
    await page.getByTestId("confirm-delete-button").click();

    await expect(entry).not.toBeVisible();
  });
});
