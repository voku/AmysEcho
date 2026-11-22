import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { JsonValueError, cloneJson } from "../dist/profiles/backend.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileFormatError, newProfileId, normalizeDisplayName, parseProfile } from "../dist/profiles/profile.js";
import {
  DataNameError, NotDamagedError, ProfileStore, StorageSchemaError, UnknownProfileError,
} from "../dist/profiles/store.js";

const chr = (...codePoints) => String.fromCodePoint(...codePoints);

const ID = "0123456789abcdef0123456789abcdef";
const record = (overrides = {}) => ({ version: 1, id: ID, displayName: "Mia", conceptIds: ["hilfe", "mehr"], ...overrides });
const openStore = async () => {
  const backend = new MemoryBackend();
  return { backend, store: await ProfileStore.open(backend) };
};

test("profile ids are random 128-bit hex values with no trace of the name", async () => {
  const { backend, store } = await openStore();
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    const profile = await store.create("anna", []);
    assert.match(profile.id, /^[0-9a-f]{32}$/);
    assert.ok(!profile.id.includes("anna"));
    ids.add(profile.id);
  }
  assert.equal(ids.size, 200);
  assert.notEqual(newProfileId(), newProfileId());
  // Hex digits should be spread out; a timestamp or counter prefix would share long prefixes.
  const prefixes = new Set([...ids].map((id) => id.slice(0, 4)));
  assert.ok(prefixes.size > 190, `only ${prefixes.size} distinct 4-digit prefixes`);
  for (const key of await backend.keys("")) assert.ok(!key.toLowerCase().includes("anna"), key);
});

test("the display name is stored in the record only, never in a storage key", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("  Zoë Ünique  ", ["hilfe"]);
  assert.equal(profile.displayName, "Zoë Ünique");
  await store.data(profile.id).set("settings", { volume: 3 });
  await store.setActive(profile.id);
  await store.rename(profile.id, "Sternchen");
  const snapshot = backend.snapshot();
  for (const key of Object.keys(snapshot)) assert.doesNotMatch(key, /zo|nique|stern/i);
  const holders = Object.entries(snapshot).filter(([, value]) => JSON.stringify(value).includes("Sternchen"));
  assert.deepEqual(holders.map(([key]) => key), [`profile/${profile.id}/meta`]);
});

test("display names are trimmed and limited to 1-40 characters without control characters", () => {
  assert.equal(normalizeDisplayName("  Mia \n"), "Mia");
  assert.equal(normalizeDisplayName("x".repeat(40)), "x".repeat(40));
  assert.equal(normalizeDisplayName("🦊".repeat(40)), "🦊".repeat(40));
  for (const bad of ["", "   ", "x".repeat(41), "Mi\u0000a", "Mi\na", "Mi\u007fa", `Mi${String.fromCodePoint(0x2028)}a`, 7, null, undefined]) {
    assert.throws(() => normalizeDisplayName(bad), ProfileFormatError, JSON.stringify(bad));
  }
});

test("create, rename and setConceptIds validate their input and change nothing on rejection", async () => {
  const { backend, store } = await openStore();
  const profile = await store.create("Mia", ["hilfe"]);
  const before = backend.snapshot();
  await assert.rejects(store.create("", []), ProfileFormatError);
  await assert.rejects(store.create("Ben", ["hilfe", "hilfe"]), ProfileFormatError);
  await assert.rejects(store.create("Ben", ["Hilfe!"]), ProfileFormatError);
  await assert.rejects(store.rename(profile.id, "x".repeat(41)), ProfileFormatError);
  await assert.rejects(store.setConceptIds(profile.id, [1]), ProfileFormatError);
  await assert.rejects(store.setConceptIds(profile.id, "hilfe"), ProfileFormatError);
  assert.deepEqual(backend.snapshot(), before);

  assert.deepEqual(await store.rename(profile.id, " Mia M. "), { ...profile, displayName: "Mia M." });
  assert.deepEqual(await store.setConceptIds(profile.id, ["mehr", "pause"]), { ...profile, displayName: "Mia M.", conceptIds: ["mehr", "pause"] });
  assert.deepEqual(await store.get(profile.id), { version: 1, id: profile.id, displayName: "Mia M.", conceptIds: ["mehr", "pause"] });
});

test("parseProfile accepts a valid record and rejects everything else", () => {
  assert.deepEqual(parseProfile(record()), record());
  const bad = [
    null, undefined, "profile", 3, [], [record()],
    record({ version: 2 }), record({ version: "1" }),
    record({ id: "abc" }), record({ id: ID.toUpperCase() }), record({ id: `${ID}0` }), record({ id: 5 }), record({ id: "../../../app/active-profile1234567" }),
    record({ displayName: "" }), record({ displayName: " Mia" }), record({ displayName: 5 }), record({ displayName: "a\tb" }),
    record({ conceptIds: "hilfe" }), record({ conceptIds: ["hilfe", "hilfe"] }), record({ conceptIds: ["hilfe", 2] }), record({ conceptIds: [""] }),
    record({ birthDate: "2020-01-01" }),
    (({ conceptIds, ...rest }) => rest)(record()),
    (({ displayName, ...rest }) => rest)(record()),
    (({ version, ...rest }) => rest)(record()),
  ];
  for (const value of bad) assert.throws(() => parseProfile(value), ProfileFormatError, JSON.stringify(value));
});

test("two profiles keep the same data name apart", async () => {
  const { store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  await store.data(a.id).set("settings", { voice: "slow" });
  await store.data(b.id).set("settings", { voice: "fast" });
  await store.data(a.id).set("only-a", [1, 2, 3]);
  assert.deepEqual(await store.data(a.id).get("settings"), { voice: "slow" });
  assert.deepEqual(await store.data(b.id).get("settings"), { voice: "fast" });
  assert.equal(await store.data(b.id).get("only-a"), undefined);
  assert.deepEqual(await store.data(a.id).names(), ["only-a", "settings"]);
  assert.deepEqual(await store.data(b.id).names(), ["settings"]);
  await store.data(b.id).delete("settings");
  await store.data(b.id).delete("only-a");
  assert.deepEqual(await store.data(b.id).names(), []);
  assert.deepEqual(await store.data(a.id).get("only-a"), [1, 2, 3]);
  assert.deepEqual(await store.data(a.id).get("settings"), { voice: "slow" });
});

test("a data name cannot reach outside its profile", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  await store.data(b.id).set("secret", "b-only");
  const before = backend.snapshot();
  const crafted = [
    "", "/", "a/b", "..", "../meta", `../../${b.id}/data/secret`, `../../../profile/${b.id}/data/secret`,
    "..%2f", ".hidden", "UPPER", "sp ace", "a\\b", "x".repeat(65), "meta\u0000", 5, null, undefined,
  ];
  for (const name of crafted) {
    const label = JSON.stringify(name);
    await assert.rejects(store.data(a.id).get(name), DataNameError, label);
    await assert.rejects(store.data(a.id).set(name, "x"), DataNameError, label);
    await assert.rejects(store.data(a.id).delete(name), DataNameError, label);
  }
  assert.deepEqual(backend.snapshot(), before);
  for (const key of Object.keys(before)) assert.match(key, /^(app\/schema|profile\/[0-9a-f]{32}\/(meta|data\/[a-z0-9][a-z0-9._-]*))$/);
});

test("unknown and malformed profile ids are rejected before any key is built", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  await store.data(a.id).set("x", 1);
  const before = backend.snapshot();
  const missing = "f".repeat(32);
  for (const id of [missing, "", "abc", `${a.id}/data`, "../app", a.id.toUpperCase(), 7, null]) {
    const label = JSON.stringify(id);
    await assert.rejects(store.get(id), UnknownProfileError, label);
    await assert.rejects(store.rename(id, "X"), UnknownProfileError, label);
    await assert.rejects(store.setConceptIds(id, []), UnknownProfileError, label);
    await assert.rejects(store.remove(id), UnknownProfileError, label);
    if (id !== null) await assert.rejects(store.setActive(id), UnknownProfileError, label);
    await assert.rejects(store.readProfile(id), UnknownProfileError, label);
    await assert.rejects(async () => store.data(id).get("x"), UnknownProfileError, label);
    await assert.rejects(async () => store.data(id).set("x", 1), UnknownProfileError, label);
    await assert.rejects(async () => store.data(id).names(), UnknownProfileError, label);
  }
  assert.throws(() => store.data("not-an-id"), UnknownProfileError);
  assert.deepEqual(backend.snapshot(), before);
});

test("remove deletes every key the profile owns and nothing else", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", ["hilfe"]);
  const b = await store.create("B", ["mehr"]);
  for (const name of ["settings", "examples.1", "examples.2"]) {
    await store.data(a.id).set(name, { owner: "a", name });
    await store.data(b.id).set(name, { owner: "b", name });
  }
  await store.setActive(a.id);
  const expected = Object.fromEntries(Object.entries(backend.snapshot()).filter(([key]) => !key.includes(a.id) && key !== "app/active-profile"));
  assert.equal(Object.keys(expected).length, 5);

  await store.remove(a.id);

  assert.deepEqual(backend.snapshot(), expected);
  assert.deepEqual(await backend.keys(`profile/${a.id}`), []);
  assert.equal(await store.getActive(), null);
  assert.deepEqual((await store.list()).profiles, [b]);
  assert.deepEqual(await store.data(b.id).get("examples.2"), { owner: "b", name: "examples.2" });
  await assert.rejects(store.get(a.id), UnknownProfileError);
  await assert.rejects(store.data(a.id).get("settings"), UnknownProfileError);
  await assert.rejects(store.data(a.id).set("settings", 1), UnknownProfileError);
  await assert.rejects(store.remove(a.id), UnknownProfileError);
  assert.deepEqual(backend.snapshot(), expected);
});

test("removing a profile that is not active keeps the active pointer", async () => {
  const { store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  assert.equal(await store.getActive(), null);
  await store.setActive(b.id);
  await store.remove(a.id);
  assert.equal(await store.getActive(), b.id);
  await store.setActive(null);
  assert.equal(await store.getActive(), null);
});

test("a failed remove leaves the whole profile in place", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  await store.data(a.id).set("one", 1);
  await store.data(a.id).set("two", 2);
  await store.data(a.id).set("three", 3);
  await store.setActive(a.id);
  const before = backend.snapshot();
  backend.failWrite();
  await assert.rejects(store.remove(a.id), InjectedWriteError);
  assert.deepEqual(backend.snapshot(), before);
  assert.equal(await store.getActive(), a.id);
  // remove is a single batch: with the failure armed for a second write it completes.
  backend.failWrite(2);
  await store.remove(a.id);
  assert.deepEqual(backend.snapshot(), { "app/schema": 1 });
});

test("the memory backend applies a batch completely or not at all", async () => {
  const backend = new MemoryBackend();
  await backend.write({ set: { a: 1, b: 2, c: 3 } });
  backend.failWrite(2);
  await backend.write({ set: { d: 4 } });
  await assert.rejects(backend.write({ delete: ["a", "b"], set: { c: 30, e: 5 } }), InjectedWriteError);
  assert.deepEqual(backend.snapshot(), { a: 1, b: 2, c: 3, d: 4 });
  await assert.rejects(backend.write({ set: { f: 6, g: new Date() } }), JsonValueError);
  assert.deepEqual(backend.snapshot(), { a: 1, b: 2, c: 3, d: 4 });
  await backend.write({ delete: ["a", "c", "missing"], set: { c: 30 } });
  assert.deepEqual(backend.snapshot(), { b: 2, c: 30, d: 4 });
  assert.deepEqual(await backend.keys("c"), ["c"]);
  assert.equal(await backend.get("a"), undefined);
});

test("damaged stored records are reported by list instead of being skipped", async () => {
  const { backend, store } = await openStore();
  const good = await store.create("Good", []);
  const future = "a".repeat(32);
  const orphan = "b".repeat(32);
  const swapped = "c".repeat(32);
  await backend.write({
    set: {
      [`profile/${future}/meta`]: { version: 2, id: future, displayName: "Later", conceptIds: [], theme: "dark" },
      [`profile/${orphan}/data/settings`]: { volume: 1 },
      [`profile/${swapped}/meta`]: { version: 1, id: good.id, displayName: "Swapped", conceptIds: [] },
      "profile/not-an-id/meta": { version: 1 },
    },
  });
  const listing = await store.list();
  assert.deepEqual(listing.profiles, [good]);
  assert.deepEqual(listing.damaged.map((entry) => entry.id).sort(), [future, orphan, swapped, "not-an-id"].sort());
  for (const entry of listing.damaged) assert.ok(entry.reason.length > 0);
  await assert.rejects(store.get(future), ProfileFormatError);
  await assert.rejects(store.rename(future, "X"), ProfileFormatError);
  await assert.rejects(store.get(swapped), ProfileFormatError);

  // A damaged profile can still be deleted, and only it.
  await store.remove(future);
  await store.remove(orphan);
  assert.deepEqual((await store.list()).damaged.map((entry) => entry.id).sort(), [swapped, "not-an-id"].sort());
  assert.deepEqual(await store.get(good.id), good);
});

test("an unknown schema marker fails closed without touching the data", async () => {
  for (const marker of [2, 0, "1", null, { version: 1 }]) {
    const backend = new MemoryBackend();
    await backend.write({ set: { "app/schema": marker, [`profile/${ID}/meta`]: record() } });
    const before = backend.snapshot();
    await assert.rejects(ProfileStore.open(backend), StorageSchemaError, JSON.stringify(marker));
    assert.deepEqual(backend.snapshot(), before);
  }
  const unmarked = new MemoryBackend();
  await unmarked.write({ set: { [`profile/${ID}/meta`]: record() } });
  await assert.rejects(ProfileStore.open(unmarked), StorageSchemaError);
  assert.deepEqual(unmarked.snapshot(), { [`profile/${ID}/meta`]: record() });

  const fresh = new MemoryBackend();
  await ProfileStore.open(fresh);
  assert.deepEqual(fresh.snapshot(), { "app/schema": 1 });
  const reopened = await ProfileStore.open(fresh);
  assert.deepEqual(await reopened.list(), { profiles: [], damaged: [] });
});

test("data survives reopening the store on the same backend", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", ["hilfe"]);
  await store.data(a.id).set("settings", { volume: 2 });
  await store.setActive(a.id);
  const again = await ProfileStore.open(backend);
  assert.deepEqual((await again.list()).profiles, [a]);
  assert.equal(await again.getActive(), a.id);
  assert.deepEqual(await again.data(a.id).get("settings"), { volume: 2 });
});

test("values handed in or out are copies", async () => {
  const { backend, store } = await openStore();
  const concepts = ["hilfe"];
  const a = await store.create("A", concepts);
  concepts.push("mehr");
  assert.throws(() => a.conceptIds.push("pause"), TypeError);
  assert.deepEqual((await store.get(a.id)).conceptIds, ["hilfe"]);

  const value = { list: [1, 2], nested: { on: true } };
  await store.data(a.id).set("settings", value);
  value.list.push(3);
  value.nested.on = false;
  const read = await store.data(a.id).get("settings");
  assert.deepEqual(read, { list: [1, 2], nested: { on: true } });
  read.list.push(99);
  read.nested.on = "changed";
  assert.deepEqual(await store.data(a.id).get("settings"), { list: [1, 2], nested: { on: true } });

  const raw = await backend.get(`profile/${a.id}/meta`);
  raw.displayName = "changed";
  assert.equal((await store.get(a.id)).displayName, "A");
  backend.snapshot()[`profile/${a.id}/meta`] = null;
  assert.equal((await store.get(a.id)).displayName, "A");
});

test("only JSON values are stored", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const before = backend.snapshot();
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [undefined, NaN, Infinity, new Date(0), new Map(), () => 1, 1n, { deep: [undefined] }, [, 1], cyclic, new Uint8Array(2)]) {
    await assert.rejects(store.data(a.id).set("x", value), JsonValueError);
  }
  assert.deepEqual(backend.snapshot(), before);
  const fine = { n: null, t: true, s: "ä", f: 1.5, list: [[], {}], ["__proto__"]: "own" };
  assert.deepEqual(cloneJson(JSON.parse(JSON.stringify(fine))), JSON.parse(JSON.stringify(fine)));
});

test("store operations issued together run one after another", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const results = await Promise.allSettled([
    store.data(a.id).set("one", 1),
    store.remove(a.id),
    store.data(a.id).set("two", 2),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "rejected"]);
  assert.deepEqual(backend.snapshot(), { "app/schema": 1 });
});

test("src/profiles uses no network API and imports only its own files", async () => {
  const directory = new URL("../src/profiles/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".ts"));
  assert.deepEqual(files.sort(), ["backend.ts", "backup.ts", "indexeddb-backend.ts", "memory-backend.ts", "profile.ts", "store.ts"]);
  for (const name of files) {
    const source = await readFile(new URL(name, directory), "utf8");
    for (const banned of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /\bimportScripts\b/, /https?:\/\//]) {
      assert.doesNotMatch(source, banned, `${name} mentions ${banned}`);
    }
    const specifiers = [...source.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) assert.match(specifier, /^\.\/[a-z-]+\.js$/, `${name} imports ${specifier}`);
    if (name !== "backend.ts" && name !== "profile.ts") assert.ok(specifiers.length > 0, `${name}: import scan found nothing`);
  }
});

test("cloneJson refuses getters, hidden properties, symbol keys and decorated arrays without calling anything", async () => {
  let calls = 0;
  const count = () => {
    calls += 1;
    return 1;
  };
  const withGetter = { plain: 1 };
  Object.defineProperty(withGetter, "computed", { get: count, enumerable: true });
  const withHiddenGetter = {};
  Object.defineProperty(withHiddenGetter, "computed", { get: count, enumerable: false });
  const withSetter = {};
  Object.defineProperty(withSetter, "sink", { set: count, enumerable: true });
  const withHidden = { plain: 1 };
  Object.defineProperty(withHidden, "hidden", { value: "dropped by JSON", enumerable: false });
  const withSymbol = { plain: 1, [Symbol("s")]: 1 };
  const decorated = [1, 2];
  decorated.note = "dropped by JSON";
  const hiddenlyDecorated = [1, 2];
  Object.defineProperty(hiddenlyDecorated, "note", { value: 1, enumerable: false });
  const symbolDecorated = [1];
  symbolDecorated[Symbol("s")] = 1;
  const getterElement = [1, 2];
  Object.defineProperty(getterElement, 1, { get: count, enumerable: true });
  const hiddenElement = [1, 2];
  Object.defineProperty(hiddenElement, 0, { value: 1, enumerable: false });
  const holeAndExtra = [1, , 3];
  holeAndExtra.note = 1;
  const cases = [
    [withGetter, /value\.computed is a getter/], [withHiddenGetter, /value\.computed is a getter/], [withSetter, /value\.sink is a getter or setter/],
    [withHidden, /value\.hidden/], [withSymbol, /symbol/],
    [decorated, /extra properties/], [hiddenlyDecorated, /extra properties/], [symbolDecorated, /extra properties/],
    [getterElement, /value\[1\] is a getter/], [hiddenElement, /value\[0\]/], [holeAndExtra, /value\[1\]/],
    [{ a: [{ b: withGetter }] }, /value\.a\[0\]\.b\.computed is a getter/], [[[decorated]], /value\[0\]\[0\]/],
  ];
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const before = backend.snapshot();
  for (const [value, path] of cases) {
    assert.throws(() => cloneJson(value), (error) => error instanceof JsonValueError && path.test(error.message), String(path));
    await assert.rejects(store.data(a.id).set("x", value), JsonValueError, String(path));
    await assert.rejects(backend.write({ set: { x: value } }), JsonValueError, String(path));
  }
  assert.equal(calls, 0);
  assert.deepEqual(backend.snapshot(), before);

  // Whatever JSON.parse produces is accepted and copied faithfully.
  const text = '{"__proto__":{"x":1},"constructor":null,"":[],"length":3,"list":[0,-0,1e300,[[]],{"0":"a"}],"toJSON":"text"}';
  const copy = cloneJson(JSON.parse(text));
  assert.equal(JSON.stringify(copy), '{"__proto__":{"x":1},"constructor":null,"":[],"length":3,"list":[0,0,1e+300,[[]],{"0":"a"}],"toJSON":"text"}');
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.ok(Object.isFrozen(cloneJson(Object.freeze([1]))) === false);
  assert.deepEqual(cloneJson(Object.freeze({ a: Object.freeze([1, 2]) })), { a: [1, 2] });
  assert.deepEqual(cloneJson(Object.assign(Object.create(null), { a: 1 })), { a: 1 });
});

test("display names are stored NFC-normalised and non-normalised stored names are rejected", async () => {
  const decomposed = `Ren${chr(0x65, 0x301)}`;
  const composed = `Ren${chr(0xe9)}`;
  assert.notEqual(decomposed, composed);
  assert.equal(normalizeDisplayName(decomposed), composed);
  assert.equal(normalizeDisplayName(` ${decomposed} `), composed);
  // 40 characters once composed, 80 code points as typed.
  assert.equal(normalizeDisplayName(chr(0x65, 0x301).repeat(40)), chr(0xe9).repeat(40));
  assert.throws(() => normalizeDisplayName(chr(0x65, 0x301).repeat(41)), ProfileFormatError);

  const { backend, store } = await openStore();
  const created = await store.create(decomposed, []);
  assert.equal(created.displayName, composed);
  assert.equal(backend.snapshot()[`profile/${created.id}/meta`].displayName, composed);
  assert.equal((await store.rename(created.id, `${decomposed}e`)).displayName, `${composed}e`);

  assert.deepEqual(parseProfile(record({ displayName: composed })), record({ displayName: composed }));
  assert.throws(() => parseProfile(record({ displayName: decomposed })), ProfileFormatError);
  await backend.write({ set: { [`profile/${created.id}/meta`]: { ...created, displayName: decomposed } } });
  const listing = await store.list();
  assert.deepEqual(listing.profiles, []);
  assert.deepEqual(listing.damaged.map((entry) => entry.id), [created.id]);
  assert.equal(backend.snapshot()[`profile/${created.id}/meta`].displayName, decomposed, "stored data is not rewritten");
});

test("display names with bidirectional or other invisible format characters are rejected", async () => {
  const { backend, store } = await openStore();
  const before = backend.snapshot();
  for (const codePoint of [0x202e, 0x202d, 0x202a, 0x200b, 0x200d, 0x200e, 0x200f, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff, 0xad, 0x61c, 0x2060, 0xe0001]) {
    const label = `U+${codePoint.toString(16)}`;
    for (const name of [`Mi${chr(codePoint)}a`, `${chr(codePoint)}Mia`, `Mia${chr(codePoint)}`]) {
      assert.throws(() => normalizeDisplayName(name), ProfileFormatError, label);
      assert.throws(() => parseProfile(record({ displayName: name })), ProfileFormatError, label);
      await assert.rejects(store.create(name, []), ProfileFormatError, label);
    }
  }
  assert.deepEqual(backend.snapshot(), before);
  for (const fine of [`Zo${chr(0xeb)}`, chr(0x1f98a), `${chr(0x645, 0x631, 0x64a, 0x645)}`, "Mia-Sophie 2", "O'Neil"]) {
    assert.equal(normalizeDisplayName(fine), fine);
  }
});

test("getActive does not name a profile whose stored record is unreadable", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  await store.setActive(a.id);
  await backend.write({ set: { [`profile/${a.id}/meta`]: { ...a, version: 2 } } });
  assert.equal(await store.getActive(), null);
  assert.deepEqual((await store.list()).damaged.map((entry) => entry.id), [a.id]);
  await assert.rejects(store.setActive(a.id), ProfileFormatError);
  // The pointer itself was not touched; once the record is readable again it applies again.
  await backend.write({ set: { [`profile/${a.id}/meta`]: a } });
  assert.equal(await store.getActive(), a.id);
  await backend.write({ set: { [`profile/${a.id}/meta`]: { ...a, id: b.id } } });
  assert.equal(await store.getActive(), null);
  await store.setActive(b.id);
  assert.equal(await store.getActive(), b.id);
});

test("a damaged entry is removable by the exact id segment list reported, and nothing else is", async () => {
  const { backend, store } = await openStore();
  const good = await store.create("Good", ["hilfe"]);
  await store.data(good.id).set("settings", { volume: 1 });
  const future = "a".repeat(32);
  const planted = {
    "profile/ab/meta": { version: 1 },
    "profile/ab/data/settings": 1,
    "profile/abc/meta": { version: 1 },
    "profile//x": 1,
    "profile/bare": 1,
    [`profile/${future}/meta`]: { version: 2 },
    [`profile/${future}/data/settings`]: 2,
    "app/active-profile": future,
  };
  await backend.write({ set: planted });
  const kept = { "app/schema": 1, [`profile/${good.id}/meta`]: good, [`profile/${good.id}/data/settings`]: { volume: 1 } };
  const reported = (await store.list()).damaged.map((entry) => entry.id).sort();
  assert.deepEqual(reported, ["", "ab", "abc", "bare", future].sort());

  const before = backend.snapshot();
  for (const segment of ["a", "zz", "f".repeat(32), "ab/", "/ab", "ab/data", `ab/../${good.id}`, `../profile/${good.id}`, "/", "..", ".", 5, null, undefined]) {
    await assert.rejects(store.removeDamaged(segment), UnknownProfileError, JSON.stringify(segment));
  }
  await assert.rejects(store.removeDamaged(good.id), NotDamagedError);
  assert.deepEqual(backend.snapshot(), before);

  await store.removeDamaged("ab");
  assert.deepEqual(backend.snapshot(), { ...before, "profile/ab/meta": undefined, "profile/ab/data/settings": undefined, __drop: undefined } && Object.fromEntries(Object.entries(before).filter(([key]) => !key.startsWith("profile/ab/"))));
  assert.ok("profile/abc/meta" in backend.snapshot());
  await store.removeDamaged("");
  assert.ok(!("profile//x" in backend.snapshot()));
  assert.ok("profile/bare" in backend.snapshot());
  await store.removeDamaged("bare");
  await store.removeDamaged("abc");
  await store.removeDamaged(future);
  assert.deepEqual(backend.snapshot(), kept);
  assert.deepEqual(await store.list(), { profiles: [good], damaged: [] });
  await assert.rejects(store.removeDamaged("ab"), UnknownProfileError);

  await backend.write({ set: { "profile/ab/meta": 1, "profile/ab/data/x": 2 } });
  backend.failWrite();
  await assert.rejects(store.removeDamaged("ab"), InjectedWriteError);
  assert.deepEqual(backend.snapshot(), { ...kept, "profile/ab/meta": 1, "profile/ab/data/x": 2 });
});

test("restoreProfile checks its data argument itself", async () => {
  const { backend, store } = await openStore();
  const existing = await store.create("A", []);
  const before = backend.snapshot();
  const profile = record();
  const hidden = {};
  Object.defineProperty(hidden, "settings", { value: 1, enumerable: false });
  for (const data of [[], ["x"], [{ a: 1 }], null, undefined, "settings", 5, true, new Map([["settings", 1]]), hidden]) {
    for (const onConflict of ["reject", "replace", "copy"]) {
      await assert.rejects(store.restoreProfile({ profile, data }, onConflict), JsonValueError, JSON.stringify(data));
      await assert.rejects(store.restoreProfile({ profile: existing, data }, onConflict), JsonValueError, JSON.stringify(data));
    }
  }
  for (const data of [{ "a/b": 1 }, { UPPER: 1 }, { "": 1 }, { ok: 1, "../meta": 2 }, { 0: "x", "-1": "y" }]) {
    await assert.rejects(store.restoreProfile({ profile, data }), DataNameError, JSON.stringify(data));
  }
  await assert.rejects(store.restoreProfile({ profile, data: { ok: undefined } }), JsonValueError);
  await assert.rejects(store.restoreProfile({ profile: record({ version: 2 }), data: {} }), ProfileFormatError);
  assert.deepEqual(backend.snapshot(), before);
  for (const key of Object.keys(backend.snapshot())) assert.doesNotMatch(key, /data\/(0|-1)$/);

  assert.deepEqual(await store.restoreProfile({ profile, data: { 0: "digit names are valid", settings: [] } }), profile);
  assert.deepEqual(await store.data(ID).names(), ["0", "settings"]);
});
