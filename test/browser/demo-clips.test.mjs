// Real-browser test of a demo clip ("Vormachen", card NG-56, src/demo-clips.ts): Chromium (Playwright)
// loads the built app and, under the page's own Content Security Policy, records a clip from
// Chromium's fake camera (a synthetic test pattern: no person, no child), turns it into the data URL
// that is stored, and plays it back in a video element.
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";

const DIST = new URL("../../dist/", import.meta.url);

test("demo clips: a clip is recorded from the camera without sound, stored as a video data URL and plays under the page's policy", async () => {
  const { server, origin } = await serveDist(DIST);
  let browser = null;
  try {
    // Launched inside the try: a browser that cannot start still lets the server close (card NG-60).
    browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const context = await browser.newContext();
    await context.grantPermissions(["camera"], { origin });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const { openDemoCamera, clipFromBlob, isDemoDataUrl, MAX_DEMO_DATA_URL_LENGTH } = await import("./demo-clips.js");
      const camera = await openDemoCamera("user");
      const audioTracks = camera.stream.getAudioTracks().length;
      const videoTracks = camera.stream.getVideoTracks().length;
      camera.start();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const blob = await camera.stop();
      camera.close();
      const live = camera.stream.getTracks().map((track) => track.readyState);
      const dataUrl = await clipFromBlob(blob);
      const video = document.createElement("video");
      video.muted = true;
      document.body.append(video);
      const loaded = await new Promise((resolve) => {
        video.addEventListener("loadeddata", () => resolve({ ok: true, width: video.videoWidth, height: video.videoHeight }), { once: true });
        video.addEventListener("error", () => resolve({ ok: false, code: video.error?.code ?? null }), { once: true });
        video.src = dataUrl;
      });
      return {
        audioTracks, videoTracks, live, type: blob.type, size: blob.size, prefix: dataUrl.slice(0, 40), length: dataUrl.length,
        valid: isDemoDataUrl(dataUrl), cap: MAX_DEMO_DATA_URL_LENGTH, loaded,
      };
    });
    assert.equal(result.audioTracks, 0, "no sound is recorded");
    assert.equal(result.videoTracks, 1);
    assert.ok(result.live.every((state) => state === "ended"), "the camera is stopped");
    assert.match(result.type, /^video\/(webm|mp4)/);
    assert.ok(result.size > 0);
    assert.match(result.prefix, /^data:video\/(webm|mp4)/);
    assert.equal(result.valid, true);
    assert.ok(result.length < result.cap / 4, `a 1.5 s clip is far below the cap (${result.length} characters)`);
    assert.deepEqual(result.loaded.ok, true, `the clip plays: ${JSON.stringify(result.loaded)}`);
    assert.ok(result.loaded.width > 0 && result.loaded.height > 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
