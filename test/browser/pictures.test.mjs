// Real-browser test of turning a chosen file into a stored picture (`pictureFromFile`, cards
// NG-8673323346005092805 and NG-8673317704447615766, docs/caregiver.md "Own pictures").
//
// Chromium (Playwright) loads the built app and calls `pictureFromFile` from caregiver.js in the
// page, under the page's own Content Security Policy. Every image is synthetic, made in the test or
// in the page: no symbol set, no photo of anyone.
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { serveDist } from "../../scripts/offline-smoke.mjs";

const DIST = new URL("../../dist/", import.meta.url);

test("pictures: a chosen file is redrawn on a canvas; scripts never run, size is capped, and what is not a picture is refused", async () => {
  const { server, origin } = await serveDist(DIST);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const { pictureFromFile, PictureRefusal } = await import("./caregiver.js");
      const { isSymbolDataUrl } = await import("./board-data.js");
      const refusal = async (file) => {
        try {
          await pictureFromFile(file);
          return "accepted";
        } catch (error) {
          return error instanceof PictureRefusal ? error.reason : String(error);
        }
      };
      const sizeOf = async (dataUrl) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      };
      // An SVG that tries to run script on load and in a script element.
      const svg = new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" onload="window.ran=1"><script>window.ran=1</script>'
        + '<rect width="600" height="300" fill="#e33"/><circle cx="300" cy="150" r="100" fill="#fff"/></svg>',
      ], { type: "image/svg+xml" });
      const fromSvg = await pictureFromFile(svg);
      // A noisy 1200 x 900 picture made on a canvas.
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      const pixels = context.createImageData(1200, 900);
      for (let i = 0; i < pixels.data.length; i += 1) pixels.data[i] = i % 4 === 3 ? 255 : (i * 7919) % 256;
      context.putImageData(pixels, 0, 0);
      const photo = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const fromPhoto = await pictureFromFile(photo);
      // A small file that declares a huge picture (7000 x 6000, 42 megapixels).
      const huge = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="7000" height="6000"><rect width="7000" height="6000" fill="#3a3"/></svg>'], { type: "image/svg+xml" });
      // The picture is shown under the page's CSP (img-src 'self' data:).
      const shown = document.createElement("img");
      document.body.append(shown);
      shown.src = fromSvg;
      let csp = "loaded";
      try { await shown.decode(); } catch { csp = "blocked"; }
      return {
        svg: { prefix: fromSvg.slice(0, 22), valid: isSymbolDataUrl(fromSvg), size: await sizeOf(fromSvg) },
        photo: { valid: isSymbolDataUrl(fromPhoto), size: await sizeOf(fromPhoto) },
        ran: window.ran ?? null,
        text: await refusal(new Blob(["hello"], { type: "text/plain" })),
        broken: await refusal(new Blob(["not a png"], { type: "image/png" })),
        huge: await refusal(huge),
        csp,
      };
    });
    assert.deepEqual(result.svg, { prefix: "data:image/png;base64,", valid: true, size: [256, 128] });
    assert.equal(result.photo.valid, true);
    assert.deepEqual(result.photo.size, [256, 192]);
    assert.equal(result.ran, null, "a script of the SVG ran");
    assert.equal(result.text, "type");
    assert.equal(result.broken, "unreadable");
    assert.equal(result.huge, "pixels");
    assert.equal(result.csp, "loaded");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
