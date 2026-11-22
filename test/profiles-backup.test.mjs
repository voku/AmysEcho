import assert from "node:assert/strict";
import test from "node:test";
import { ExportFormatError, exportProfile, importProfile } from "../dist/profiles/backup.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileConflictError, ProfileStore } from "../dist/profiles/store.js";

const now = () => new Date("2026-03-04T05:06:07.089Z");
const openStore = async () => {
  const backend = new MemoryBackend();
  return { backend, store: await ProfileStore.open(backend) };
};
const DATA = {
  settings: { voice: "langsam", volume: 0.5, flags: [true, false, null] },
  "examples.hilfe": { schemaVersion: 1, steps: [[0.25, -1.5], [3, 4e-7]] },
  "notes_1-a": "Text mit Umlauten: äöüß",
  empty: {},
};
/** A store with one filled profile, its export, and the backend behind it. */
const filled = async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe", "trinken"]);
  for (const [name, value] of Object.entries(DATA)) await store.data(profile.id).set(name, value);
  return { backend, store, profile, exported: await exportProfile(store, profile.id, { now }) };
};
const profileKeys = (snapshot, id) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key.startsWith(`profile/${id}/`)));

test("export produces a versioned document with profile, data and an injected timestamp", async () => {
  const { profile, exported } = await filled();
  assert.deepEqual(exported, {
    format: "amys-echo-profile",
    version: 1,
    exportedAt: "2026-03-04T05:06:07.089Z",
    profile: { version: 1, id: profile.id, displayName: "Mia", conceptIds: ["hilfe", "trinken"] },
    data: DATA,
  });
  const { store } = await filled();
  const stamped = await exportProfile(store, (await store.list()).profiles[0].id);
  assert.match(stamped.exportedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  await assert.rejects(exportProfile(store, "f".repeat(32)), /no such profile/);
});

test("export, wipe, import reproduces the profile and its data exactly", async () => {
  const source = await filled();
  const text = JSON.stringify(source.exported);
  const ownedBefore = profileKeys(source.backend.snapshot(), source.profile.id);
  assert.equal(Object.keys(ownedBefore).length, 5);

  // Restore into a brand new store, from the JSON text a caregiver would keep.
  const target = await openStore();
  const restored = await importProfile(target.store, JSON.parse(text));
  assert.deepEqual(restored, source.profile);
  assert.deepEqual(await target.store.list(), { profiles: [source.profile], damaged: [] });
  assert.deepEqual(profileKeys(target.backend.snapshot(), source.profile.id), ownedBefore);
  assert.deepEqual(target.backend.snapshot(), { "app/schema": 1, ...ownedBefore });
  for (const [name, value] of Object.entries(DATA)) assert.deepEqual(await target.store.data(restored.id).get(name), value);
  assert.deepEqual(await exportProfile(target.store, restored.id, { now }), source.exported);

  // Same device: delete, then restore.
  await source.store.remove(source.profile.id);
  assert.deepEqual(source.backend.snapshot(), { "app/schema": 1 });
  await importProfile(source.store, JSON.parse(text));
  assert.deepEqual(profileKeys(source.backend.snapshot(), source.profile.id), ownedBefore);
});

test("a profile without data round-trips too", async () => {
  const { store } = await openStore();
  const profile = await store.create("Leer", []);
  const exported = await exportProfile(store, profile.id, { now });
  assert.deepEqual(exported.data, {});
  const target = await openStore();
  assert.deepEqual(await importProfile(target.store, JSON.parse(JSON.stringify(exported))), profile);
  assert.deepEqual(await target.store.data(profile.id).names(), []);
});

test("malformed, truncated and incompatible documents are rejected and change nothing", async () => {
  const source = await filled();
  const good = () => JSON.parse(JSON.stringify(source.exported));
  const without = (field) => {
    const document = good();
    delete document[field];
    return document;
  };
  const withData = (name, ...rest) => {
    const value = rest.length > 0 ? rest[0] : 1;
    const document = good();
    Object.defineProperty(document.data, name, { value, enumerable: true });
    return document;
  };
  const bad = {
    "not an object: null": null,
    "not an object: string": JSON.stringify(source.exported),
    "not an object: number": 1,
    "not an object: array": [good()],
    "empty object": {},
    "wrong format": { ...good(), format: "other-app-profile" },
    "version 2": { ...good(), version: 2 },
    "version as text": { ...good(), version: "1" },
    "missing format": without("format"),
    "missing version": without("version"),
    "missing exportedAt": without("exportedAt"),
    "missing profile": without("profile"),
    "missing data": without("data"),
    "extra top-level field": { ...good(), signature: "abc" },
    "exportedAt not a timestamp": { ...good(), exportedAt: "yesterday" },
    "exportedAt not UTC": { ...good(), exportedAt: "2026-03-04T05:06:07+01:00" },
    "exportedAt impossible date": { ...good(), exportedAt: "2026-13-45T05:06:07Z" },
    "profile version 2": { ...good(), profile: { ...good().profile, version: 2 } },
    "profile extra field": { ...good(), profile: { ...good().profile, birthDate: "2020-01-01" } },
    "profile bad id": { ...good(), profile: { ...good().profile, id: "../app" } },
    "profile bad name": { ...good(), profile: { ...good().profile, displayName: "" } },
    "profile duplicate concepts": { ...good(), profile: { ...good().profile, conceptIds: ["a", "a"] } },
    "data is an array": { ...good(), data: [] },
    "data is null": { ...good(), data: null },
    "data name with slash": withData("a/b"),
    "data name escaping the profile": withData(`../../${"f".repeat(32)}/meta`),
    "data name upper case": withData("Settings"),
    "data name empty": withData(""),
    "data name __proto__": withData("__proto__"),
    "data value not JSON": withData("when", new Date(0)),
    "data value NaN": withData("n", { deep: [NaN] }),
    "data value undefined": withData("u", undefined),
  };

  for (const { label, target } of [
    { label: "empty store", target: await openStore() },
    { label: "store holding the profile", target: source },
    { label: "store holding another profile", target: await filled() },
  ]) {
    const before = target.backend.snapshot();
    for (const [name, document] of Object.entries(bad)) {
      for (const onConflict of ["reject", "replace", "copy"]) {
        await assert.rejects(importProfile(target.store, document, { onConflict }), ExportFormatError, `${name} into ${label}`);
      }
    }
    assert.deepEqual(target.backend.snapshot(), before, label);
  }

  // A file cut off mid-way is not JSON, so it never reaches importProfile ...
  const text = JSON.stringify(source.exported);
  for (const length of [0, 1, 20, Math.floor(text.length / 2), text.length - 1]) {
    assert.throws(() => JSON.parse(text.slice(0, length)), SyntaxError);
  }
  // ... and a cut-off file that happens to be closed again lacks fields.
  const target = await openStore();
  const closedEarly = JSON.parse(`${text.slice(0, text.indexOf(',"profile"'))}}`);
  assert.deepEqual(Object.keys(closedEarly), ["format", "version", "exportedAt"]);
  await assert.rejects(importProfile(target.store, closedEarly), ExportFormatError);
  const dataCutShort = { ...good(), data: undefined };
  await assert.rejects(importProfile(target.store, dataCutShort), ExportFormatError);
  assert.deepEqual(target.backend.snapshot(), { "app/schema": 1 });
});

test("an unknown conflict mode is rejected before anything is written", async () => {
  const source = await filled();
  const target = await openStore();
  await assert.rejects(importProfile(target.store, source.exported, { onConflict: "merge" }), TypeError);
  assert.deepEqual(target.backend.snapshot(), { "app/schema": 1 });
});

/** A store whose profile has changed since the export: renamed, one value changed, one name added, one removed. */
const diverged = async () => {
  const source = await filled();
  const { store, profile } = source;
  await store.rename(profile.id, "Mia neu");
  await store.data(profile.id).set("settings", { voice: "schnell" });
  await store.data(profile.id).set("added-later", [1]);
  await store.data(profile.id).delete("empty");
  await store.setActive(profile.id);
  const other = await store.create("Ben", ["mehr"]);
  await store.data(other.id).set("settings", { voice: "ben" });
  return { ...source, other };
};

test("conflict mode reject is the default and leaves the existing profile alone", async () => {
  const { backend, store, exported } = await diverged();
  const before = backend.snapshot();
  await assert.rejects(importProfile(store, exported), ProfileConflictError);
  await assert.rejects(importProfile(store, exported, { onConflict: "reject" }), ProfileConflictError);
  await assert.rejects(importProfile(store, exported, {}), ProfileConflictError);
  assert.deepEqual(backend.snapshot(), before);
});

test("conflict mode replace swaps in the imported profile and drops data that is not in the export", async () => {
  const { backend, store, profile, other, exported } = await diverged();
  const otherBefore = profileKeys(backend.snapshot(), other.id);
  const restored = await importProfile(store, exported, { onConflict: "replace" });
  assert.deepEqual(restored, profile);
  assert.deepEqual(await exportProfile(store, profile.id, { now }), exported);
  assert.deepEqual((await store.data(profile.id).names()).sort(), Object.keys(DATA).sort());
  assert.equal(await store.data(profile.id).get("added-later"), undefined);
  assert.equal(await store.getActive(), profile.id);
  assert.deepEqual(profileKeys(backend.snapshot(), other.id), otherBefore);
  assert.equal((await store.list()).profiles.length, 2);
});

test("conflict mode copy imports under a new id and keeps the existing profile", async () => {
  const { backend, store, profile, exported } = await diverged();
  const before = backend.snapshot();
  const copy = await importProfile(store, exported, { onConflict: "copy" });
  assert.notEqual(copy.id, profile.id);
  assert.match(copy.id, /^[0-9a-f]{32}$/);
  assert.deepEqual(copy, { ...exported.profile, id: copy.id });
  const after = backend.snapshot();
  for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, key);
  assert.deepEqual(Object.keys(after).filter((key) => !(key in before)).every((key) => key.startsWith(`profile/${copy.id}/`)), true);
  assert.deepEqual(await exportProfile(store, copy.id, { now }), { ...exported, profile: copy });
  assert.equal((await store.get(profile.id)).displayName, "Mia neu");
  assert.equal((await store.list()).profiles.length, 3);

  // Without a conflict, replace and copy keep the exported id.
  for (const onConflict of ["replace", "copy"]) {
    const target = await openStore();
    assert.deepEqual(await importProfile(target.store, exported, { onConflict }), exported.profile);
  }
});

test("a backend failure during import leaves no half-written profile", async () => {
  // Whichever backend write fails, the import either did not happen at all or happened completely.
  for (const onConflict of ["reject", "replace", "copy"]) {
    for (const nthWrite of [1, 2, 3]) {
      const target = onConflict === "reject" ? { ...(await openStore()), exported: (await filled()).exported } : await diverged();
      const before = target.backend.snapshot();
      target.backend.failWrite(nthWrite);
      const label = `${onConflict}, write ${nthWrite} fails`;
      if (nthWrite === 1) {
        await assert.rejects(importProfile(target.store, target.exported, { onConflict }), InjectedWriteError, label);
        assert.deepEqual(target.backend.snapshot(), before, label);
        assert.deepEqual((await target.store.list()).damaged, [], label);
        target.backend.failWrite(0);
        // The store is still usable afterwards.
        await importProfile(target.store, target.exported, { onConflict });
      } else {
        // One batch only: a later write does not exist, so the import completes.
        const restored = await importProfile(target.store, target.exported, { onConflict });
        assert.deepEqual(await exportProfile(target.store, restored.id, { now }), { ...target.exported, profile: restored }, label);
      }
    }
  }
});

test("the imported document and the exported one are not tied to stored state", async () => {
  const source = await filled();
  const target = await openStore();
  const document = JSON.parse(JSON.stringify(source.exported));
  await importProfile(target.store, document);
  document.data.settings.voice = "changed";
  document.profile.conceptIds.push("later");
  source.exported.data.settings.flags.push("changed");
  assert.deepEqual(await exportProfile(target.store, source.profile.id, { now }), JSON.parse(JSON.stringify({ ...source.exported, data: DATA })));
  assert.deepEqual(await exportProfile(source.store, source.profile.id, { now }), { ...source.exported, data: DATA });
});
