// Real-browser test of the password-protected backup file (card NG-58): Chromium (Playwright) loads
// the built app and, under the page's own Content Security Policy, encrypts a synthetic profile with
// a demo clip at the full PBKDF2 rounds through Web Crypto, hands it over as a download, and
// restores the downloaded file into a fresh store. No real child data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";

const DIST = new URL("../../dist/", import.meta.url);

test("backup: a profile with a clip is encrypted at full strength, downloaded and restored under the page's policy", async () => {
  const { server, origin } = await serveDist(DIST);
  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin);
    const downloading = page.waitForEvent("download");
    const made = await page.evaluate(async () => {
      const { MemoryBackend } = await import("./profiles/memory-backend.js");
      const { ProfileStore } = await import("./profiles/store.js");
      const { exportProfile } = await import("./profiles/backup.js");
      const { BACKUP_ITERATIONS, backupFileName, encryptBackup } = await import("./profiles/backup-file.js");
      const { setDemoClip } = await import("./demo-clips.js");
      const { downloadFile } = await import("./caregiver.js");
      const store = await ProfileStore.open(new MemoryBackend());
      const mia = await store.create("Mia", ["trinken"]);
      await setDemoClip(store, mia.id, "trinken", "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC");
      const started = performance.now();
      const text = await encryptBackup(await exportProfile(store, mia.id), "Sonnenblume 42");
      const encryptMs = Math.round(performance.now() - started);
      downloadFile(new Blob([text], { type: "application/octet-stream" }), backupFileName(new Date("2026-11-25T10:00:00Z")));
      return { encryptMs, iterations: BACKUP_ITERATIONS, length: text.length };
    });
    const download = await downloading;
    assert.equal(download.suggestedFilename(), "amys-echo-sicherung-2026-11-25.amysecho");
    const text = await readFile(await download.path(), "utf8");
    assert.equal(text.length, made.length);
    // Only the readable part counts: in the random ciphertext any short text can turn up by chance.
    assert.equal(JSON.stringify({ ...JSON.parse(text), data: "" }).includes("Mia"), false);
    assert.equal(JSON.parse(text).kdf.iterations, made.iterations);
    const restored = await page.evaluate(async (fileText) => {
      const { MemoryBackend } = await import("./profiles/memory-backend.js");
      const { ProfileStore } = await import("./profiles/store.js");
      const { importProfile } = await import("./profiles/backup.js");
      const { decryptBackup, BackupFileError } = await import("./profiles/backup-file.js");
      let wrong = "accepted";
      try {
        await decryptBackup(fileText, "Sonnenblume 43");
      } catch (error) {
        wrong = error instanceof BackupFileError ? error.reason : String(error);
      }
      const elsewhere = await ProfileStore.open(new MemoryBackend());
      const profile = await importProfile(elsewhere, await decryptBackup(fileText, "Sonnenblume 42"));
      return { wrong, name: profile.displayName, clip: (await elsewhere.data(profile.id).get("demo.trinken"))?.dataUrl.slice(0, 22) };
    }, text);
    assert.deepEqual(restored, { wrong: "password", name: "Mia", clip: "data:video/webm;base64" });
    // A second or so in a desktop Chromium; recorded so a slow device can be compared (card NG-6).
    assert.ok(made.encryptMs < 20_000, `encrypting took ${made.encryptMs} ms`);
    console.log(`# backup: encrypting at ${made.iterations} rounds took ${made.encryptMs} ms`);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
