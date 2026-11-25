// Demo clips ("Vormachen", card NG-56, src/demo-clips.ts): what is stored, what is refused, and that
// a clip travels in a profile backup. Every clip here is a few made-up bytes, no video of anyone.
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_CLIP_VERSION, MAX_DEMO_DATA_URL_LENGTH, DemoClipError, isDemoDataUrl, listDemoClipIds, readDemoClip, readDemoEntry, removeDemoClip, setDemoClip,
} from "../dist/demo-clips.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileSizeError, ProfileStore } from "../dist/profiles/store.js";
import { EXPORT_ENVELOPE_RESERVE, exportProfile, importProfile } from "../dist/profiles/backup.js";

const CLIP = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC";

async function storeWithMia(limits) {
  const store = await ProfileStore.open(new MemoryBackend(), limits === undefined ? {} : { limits });
  const mia = await store.create("Mia", ["trinken", "hilfe"]);
  return { store, mia };
}

test("demo clips: only base64 WebM or MP4 video data URLs within the size cap are clips", () => {
  for (const value of [
    CLIP, "data:video/mp4;base64,AAAAGGZ0eXBtcDQy", "data:video/webm;codecs=vp9;base64,GkXf", "data:video/webm;codecs=vp8,opus;base64,GkXf",
    "data:video/mp4;codecs=avc1.42E01E;base64,AAAA", "data:video/mp4; codecs=avc1.42E01E;base64,AAAA", "data:video/webm;codecs=\"vp9\";base64,GkXf",
  ]) assert.equal(isDemoDataUrl(value), true, value);
  for (const value of [
    null, 1, "", "data:video/ogg;base64,AAAA", "data:image/png;base64,AAAA", "data:video/webm,GkXf", "data:video/webm;base64,<script>",
    "data:text/html;base64,PHNjcmlwdD4=", "https://example.invalid/clip.webm", "blob:https://example.invalid/1",
    `data:video/webm;base64,${"A".repeat(MAX_DEMO_DATA_URL_LENGTH)}`,
  ]) assert.equal(isDemoDataUrl(value), false, String(value).slice(0, 40));
});

test("demo clips: a stored entry is read strictly; a newer version is reported, not overwritten", () => {
  assert.deepEqual(readDemoEntry(undefined), { state: "missing" });
  assert.deepEqual(readDemoEntry({ version: 1, dataUrl: CLIP }), { state: "ok", dataUrl: CLIP });
  for (const value of [null, [], "x", { version: 1 }, { version: 1, dataUrl: "data:image/png;base64,AA" }, { version: 1, dataUrl: CLIP, extra: 1 }, { version: 0, dataUrl: CLIP }]) {
    assert.deepEqual(readDemoEntry(value), { state: "damaged", damage: "unreadable" });
  }
  assert.deepEqual(readDemoEntry({ version: 2, dataUrl: CLIP, more: true }), { state: "damaged", damage: "unsupported-version" });
});

test("demo clips: set, list, read and remove one profile's clips; invalid input and a newer clip are refused without a write", async () => {
  const { store, mia } = await storeWithMia();
  const other = await store.create("Ben", ["trinken"]);
  assert.deepEqual(await listDemoClipIds(store, mia.id), []);
  await setDemoClip(store, mia.id, "trinken", CLIP);
  assert.deepEqual(await store.data(mia.id).get("demo.trinken"), { version: DEMO_CLIP_VERSION, dataUrl: CLIP });
  assert.deepEqual(await readDemoClip(store, mia.id, "trinken"), { state: "ok", dataUrl: CLIP });
  assert.deepEqual(await listDemoClipIds(store, mia.id), ["trinken"]);
  // Another profile sees nothing of it.
  assert.deepEqual(await listDemoClipIds(store, other.id), []);
  assert.deepEqual(await readDemoClip(store, other.id, "trinken"), { state: "missing" });
  // A name that is no concept id is not listed and never read.
  await store.data(mia.id).set("demo.x_y", { version: 1, dataUrl: CLIP });
  assert.deepEqual(await listDemoClipIds(store, mia.id), ["trinken"]);
  assert.deepEqual(await readDemoClip(store, mia.id, "../x"), { state: "missing" });

  const before = JSON.stringify(await store.data(mia.id).names());
  await assert.rejects(setDemoClip(store, mia.id, "Trinken!", CLIP), (error) => error instanceof DemoClipError && error.kind === "invalid-concept-id");
  await assert.rejects(setDemoClip(store, mia.id, "hilfe", "data:image/png;base64,AA"), (error) => error instanceof DemoClipError && error.kind === "invalid-clip");
  assert.equal(JSON.stringify(await store.data(mia.id).names()), before);
  await store.data(mia.id).set("demo.hilfe", { version: 2, dataUrl: CLIP });
  await assert.rejects(setDemoClip(store, mia.id, "hilfe", CLIP), (error) => error instanceof DemoClipError && error.kind === "unsupported-entry");
  assert.deepEqual(await store.data(mia.id).get("demo.hilfe"), { version: 2, dataUrl: CLIP });

  // Removing deletes whatever is stored, a newer version too (a caregiver asked for it); a missing clip is no error.
  await removeDemoClip(store, mia.id, "hilfe");
  await removeDemoClip(store, mia.id, "trinken");
  await removeDemoClip(store, mia.id, "trinken");
  await removeDemoClip(store, mia.id, "not an id");
  assert.deepEqual(await listDemoClipIds(store, mia.id), []);
});

test("demo clips: a clip counts toward the profile's size; one that does not fit is refused by the store", async () => {
  const { store, mia } = await storeWithMia({ maxBytes: EXPORT_ENVELOPE_RESERVE + 30_000 });
  const big = `data:video/webm;base64,${"A".repeat(20_000)}`;
  await setDemoClip(store, mia.id, "trinken", big);
  await assert.rejects(setDemoClip(store, mia.id, "hilfe", big), ProfileSizeError);
  assert.deepEqual(await readDemoClip(store, mia.id, "hilfe"), { state: "missing" });
});

test("demo clips: exported with the profile and restored on another device; deleting the profile deletes them", async () => {
  const { store, mia } = await storeWithMia();
  await setDemoClip(store, mia.id, "trinken", CLIP);
  const exported = JSON.parse(JSON.stringify(await exportProfile(store, mia.id)));
  assert.deepEqual(exported.data["demo.trinken"], { version: 1, dataUrl: CLIP });
  const elsewhere = await ProfileStore.open(new MemoryBackend());
  const restored = await importProfile(elsewhere, exported);
  assert.deepEqual(await readDemoClip(elsewhere, restored.id, "trinken"), { state: "ok", dataUrl: CLIP });
  await store.remove(mia.id);
  await assert.rejects(readDemoClip(store, mia.id, "trinken"));
});
