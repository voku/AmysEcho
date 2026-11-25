import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { JsonValueError, cloneJson } from "../dist/profiles/backend.js";
import { ExportSizeError, exportProfile } from "../dist/profiles/backup.js";
import { InjectedWriteError, MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileFormatError, newProfileId, normalizeDisplayName, parseProfile } from "../dist/profiles/profile.js";
import {
  DataNameError, EXPORT_ENVELOPE_RESERVE, MAX_EXPORT_BYTES, MAX_EXPORT_DATA_NAMES, NotDamagedError, ProfileSizeError,
  ProfileStore, StorageSchemaError, UnknownProfileError,
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
  for (const key of Object.keys(before)) assert.match(key, /^(app\/schema|profile\/[0-9a-f]{32}\/(meta|usage|data\/[a-z0-9][a-z0-9._-]*))$/);
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
  assert.equal(Object.keys(expected).length, 6);

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
  assert.deepEqual(files.sort(), ["backend.ts", "backup-file.ts", "backup.ts", "indexeddb-backend.ts", "memory-backend.ts", "profile.ts", "store.ts"]);
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

test("display names are stored NFC-normalised and a stored name that is not NFC is read normalised", async () => {
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

  // A record as the first version of this module stored it: valid, but not NFC.
  assert.deepEqual(parseProfile(record({ displayName: composed })), record({ displayName: composed }));
  assert.deepEqual(parseProfile(record({ displayName: decomposed })), record({ displayName: composed }));
  const key = `profile/${created.id}/meta`;
  await backend.write({ set: { [key]: { ...created, displayName: decomposed } } });
  const read = { ...created, displayName: composed };
  assert.deepEqual(await store.list(), { profiles: [read], damaged: [] });
  assert.deepEqual(await store.get(created.id), read);
  await store.setActive(created.id);
  assert.equal(await store.getActive(), created.id);
  assert.equal(backend.snapshot()[key].displayName, decomposed, "reading does not rewrite stored data");
  await store.setConceptIds(created.id, ["hilfe"]);
  assert.equal(backend.snapshot()[key].displayName, composed, "the next write of the record stores the normal form");

  // Only the normal form is tolerated; everything else about a name stays strict on read.
  for (const displayName of [` ${decomposed}`, `${decomposed} `, `${decomposed}${chr(0x202e)}`, `${chr(0x200d)}${decomposed}`, chr(0x65, 0x301).repeat(41), ""]) {
    assert.throws(() => parseProfile(record({ displayName })), ProfileFormatError, JSON.stringify(displayName));
  }
  await backend.write({ set: { [key]: { ...created, displayName: `${decomposed}${chr(0x202e)}` } } });
  assert.deepEqual((await store.list()).damaged.map((entry) => [entry.id, entry.kind]), [[created.id, "unreadable"]]);
});

test("display names with bidirectional or other invisible format characters are rejected", async () => {
  const { backend, store } = await openStore();
  const before = backend.snapshot();
  for (const codePoint of [0x202e, 0x202d, 0x202a, 0x202b, 0x202c, 0x200b, 0x200e, 0x200f, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff, 0xad, 0x61c, 0x2060, 0x2061, 0x180e, 0xfff9, 0xe0001, 0xe0020, 0xe0067, 0xe007f]) {
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
  const kept = Object.fromEntries(Object.entries(backend.snapshot()).filter(([key]) => key === "app/schema" || key.startsWith(`profile/${good.id}/`)));
  assert.deepEqual(Object.keys(kept), ["app/schema", `profile/${good.id}/data/settings`, `profile/${good.id}/meta`, `profile/${good.id}/usage`]);
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

test("names spelled with a zero-width joiner or non-joiner are accepted, other invisible characters are not", () => {
  const ZWNJ = chr(0x200c);
  const ZWJ = chr(0x200d);
  const accepted = {
    "Persian Alireza with non-joiner": chr(0x639, 0x644, 0x6cc, 0x200c, 0x631, 0x636, 0x627),
    "Sinhala Sri with joiner": chr(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3),
    "Bengali ya-phala form with joiner": chr(0x9b0, 0x200d, 0x9cd, 0x9af, 0x9be),
    "Arabic without controls": chr(0x645, 0x62d, 0x645, 0x62f),
    "Hebrew without controls": chr(0x5d3, 0x5d5, 0x5d3),
    "Arabic and Latin with a space": `${chr(0x645, 0x631, 0x64a, 0x645)} M`,
    "family emoji joined with joiners": chr(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467),
    "emoji with variation selector and joiner": chr(0x2764, 0xfe0f, 0x200d, 0x1f525),
    "German flag (regional indicators)": chr(0x1f1e9, 0x1f1ea),
    "name with flag": `Mia ${chr(0x1f1e9, 0x1f1ea)}`,
    "single emoji": chr(0x1f98a),
  };
  for (const [label, name] of Object.entries(accepted)) {
    assert.equal(normalizeDisplayName(name), name.normalize("NFC"), label);
    assert.equal(normalizeDisplayName(`  ${name} `), name.normalize("NFC"), label);
    assert.deepEqual(parseProfile(record({ displayName: name.normalize("NFC") })).displayName, name.normalize("NFC"), label);
  }
  assert.ok(normalizeDisplayName(accepted["Persian Alireza with non-joiner"]).includes(ZWNJ));
  assert.ok(normalizeDisplayName(accepted["Sinhala Sri with joiner"]).includes(ZWJ));

  const englandFlag = chr(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  const rejected = {
    "leading non-joiner": `${ZWNJ}Mia`,
    "trailing non-joiner": `Mia${ZWNJ}`,
    "leading joiner": `${ZWJ}Mia`,
    "trailing joiner": `Mia${ZWJ}`,
    "joiner before trailing space": `Mia${ZWJ} `,
    "joiner after leading space": ` ${ZWJ}Mia`,
    "doubled joiner": `Mi${ZWJ}${ZWJ}a`,
    "doubled non-joiner": `Mi${ZWNJ}${ZWNJ}a`,
    "joiner next to non-joiner": `Mi${ZWNJ}${ZWJ}a`,
    "joiner after a space": `Mia ${ZWJ}Lu`,
    "non-joiner before a space": `Mia${ZWNJ} Lu`,
    "joiner next to a no-break space": `Mia${chr(0xa0)}${ZWJ}Lu`,
    "only a joiner": ZWJ,
    "joiner next to a bidi mark": `Mi${chr(0x200e)}${ZWJ}a`,
    "right-to-left override inside": `Mia${chr(0x202e)}aiM`,
    "right-to-left override in the Persian name": chr(0x639, 0x644, 0x6cc, 0x202e, 0x631, 0x636, 0x627),
    "isolate around a name": `${chr(0x2067)}Mia${chr(0x2069)}`,
    "zero-width space inside": `Mi${chr(0x200b)}a`,
    "England flag (tag characters)": englandFlag,
    "Scotland flag (tag characters)": chr(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f),
    "Wales flag (tag characters)": chr(0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f),
  };
  for (const [label, name] of Object.entries(rejected)) {
    assert.throws(() => normalizeDisplayName(name), ProfileFormatError, label);
    assert.throws(() => parseProfile(record({ displayName: name })), ProfileFormatError, label);
  }
});

test("damaged entries say whether a newer app version wrote them", async () => {
  const { backend, store } = await openStore();
  const good = await store.create("Good", []);
  const ids = Object.fromEntries(["newer", "muchNewer", "fractional", "older", "textVersion", "noVersion", "notObject", "array", "badName", "missing"].map((label, i) => [label, String(i).repeat(32)]));
  const meta = (label, value) => [`profile/${ids[label]}/meta`, value];
  await backend.write({
    set: Object.fromEntries([
      meta("newer", { version: 2, id: ids.newer, displayName: "Later", conceptIds: [], theme: "dark" }),
      meta("muchNewer", { version: 17 }),
      meta("fractional", { version: 1.5, id: ids.fractional }),
      meta("older", { version: 0, id: ids.older, displayName: "Old", conceptIds: [] }),
      meta("textVersion", { version: "2", id: ids.textVersion, displayName: "Text", conceptIds: [] }),
      meta("noVersion", { id: ids.noVersion, displayName: "None", conceptIds: [] }),
      meta("notObject", 2),
      meta("array", [2]),
      meta("badName", { version: 1, id: ids.badName, displayName: "", conceptIds: [] }),
      [`profile/${ids.missing}/data/settings`, 1],
      ["profile/v2/meta", { version: 2 }],
    ]),
  });
  const listing = await store.list();
  assert.deepEqual(listing.profiles, [good]);
  const kinds = Object.fromEntries(listing.damaged.map((entry) => [entry.id, entry.kind]));
  assert.deepEqual(kinds, {
    [ids.newer]: "unsupported-version",
    [ids.muchNewer]: "unsupported-version",
    [ids.fractional]: "unsupported-version",
    [ids.older]: "unreadable",
    [ids.textVersion]: "unreadable",
    [ids.noVersion]: "unreadable",
    [ids.notObject]: "unreadable",
    [ids.array]: "unreadable",
    [ids.badName]: "unreadable",
    [ids.missing]: "unreadable",
    v2: "unreadable",
  });
  for (const entry of listing.damaged) assert.ok(entry.reason.length > 0);
});

test("cloneJson rejects Array subclasses like other class instances", () => {
  class Examples extends Array {}
  const examples = Examples.from([1, 2]);
  assert.ok(Array.isArray(examples));
  assert.throws(() => cloneJson(examples), JsonValueError);
  assert.throws(() => cloneJson({ list: [examples] }), /value\.list\[0\] is not a plain array/);
  const disguised = Object.setPrototypeOf([1, 2], { length: 0 });
  assert.throws(() => cloneJson(disguised), JsonValueError);
  assert.deepEqual(cloneJson(Array.from(examples)), [1, 2]);
});

test("restoreProfile does not call getters on its argument", async () => {
  const { backend, store } = await openStore();
  const before = backend.snapshot();
  const fail = () => assert.fail("getter was called");
  const viaGetter = (name, rest) => Object.defineProperty({ ...rest }, name, { get: fail, enumerable: true });
  await assert.rejects(store.restoreProfile(viaGetter("profile", { data: {} })), JsonValueError);
  await assert.rejects(store.restoreProfile(viaGetter("data", { profile: record() })), JsonValueError);
  await assert.rejects(store.restoreProfile({ profile: viaGetter("displayName", { version: 1, id: ID, conceptIds: [] }), data: {} }), JsonValueError);
  await assert.rejects(store.restoreProfile({ profile: viaGetter("id", { version: 1, displayName: "Mia", conceptIds: [] }), data: {} }), JsonValueError);
  await assert.rejects(store.restoreProfile({ profile: record(), data: viaGetter("settings", {}) }), JsonValueError);
  for (const contents of [null, undefined, 5, "x"]) await assert.rejects(store.restoreProfile(contents), JsonValueError);
  await assert.rejects(store.restoreProfile({ data: {} }), JsonValueError);
  assert.deepEqual(backend.snapshot(), before);
});

// ---- usage accounting -------------------------------------------------

const entryBytes = (name, value) => Buffer.byteLength(JSON.stringify(value), "utf8") + name.length + 4;
/** Counted independently of the store, from what is actually stored. */
const recount = (snapshot, id) => {
  const prefix = `profile/${id}/data/`;
  const entries = Object.entries(snapshot).filter(([key]) => key.startsWith(prefix));
  return { names: entries.length, bytes: entries.reduce((sum, [key, value]) => sum + entryBytes(key.slice(prefix.length), value), 0) };
};
const openSmall = async (maxDataNames, dataBytes) => {
  const backend = new MemoryBackend();
  return { backend, store: await ProfileStore.open(backend, { limits: { maxDataNames, maxBytes: EXPORT_ENVELOPE_RESERVE + dataBytes } }) };
};

test("usage is recorded with every data write and reported with the limits", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const b = await store.create("B", []);
  const limits = { maxNames: MAX_EXPORT_DATA_NAMES, maxBytes: MAX_EXPORT_BYTES - EXPORT_ENVELOPE_RESERVE };
  assert.deepEqual(limits, { maxNames: 10_000, maxBytes: 64 * 1024 * 1024 - 34 * 1024 });
  assert.deepEqual(await store.usage(a.id), { names: 0, bytes: 0, ...limits });
  assert.deepEqual(backend.snapshot()[`profile/${a.id}/usage`], { names: 0, bytes: 0 });

  const euro = chr(0x20ac);
  await store.data(a.id).set("settings", { text: `${euro}${chr(0x1f98a)}` });
  // {"text":"<3 bytes><4 bytes>"} is 18 bytes, the name 8, plus 4.
  assert.deepEqual(await store.usage(a.id), { names: 1, bytes: 30, ...limits });
  await store.data(a.id).set("x", [1, 2, 3]);
  assert.deepEqual(await store.usage(a.id), { names: 2, bytes: 30 + 7 + 1 + 4, ...limits });
  await store.data(a.id).set("settings", null);
  assert.deepEqual(await store.usage(a.id), { names: 2, bytes: 4 + 8 + 4 + 12, ...limits });
  await store.data(a.id).delete("settings");
  await store.data(a.id).delete("never-there");
  assert.deepEqual(await store.usage(a.id), { names: 1, bytes: 12, ...limits });
  assert.deepEqual(backend.snapshot()[`profile/${a.id}/usage`], recount(backend.snapshot(), a.id));
  assert.deepEqual(await store.usage(b.id), { names: 0, bytes: 0, ...limits });

  // The record is not data: not listed, not readable or writable as a data name.
  assert.deepEqual(await store.data(a.id).names(), ["x"]);
  assert.deepEqual((await store.readProfile(a.id)).data, { x: [1, 2, 3] });
  await store.data(a.id).set("usage", "a data entry that happens to be called usage");
  assert.deepEqual(backend.snapshot()[`profile/${a.id}/usage`], recount(backend.snapshot(), a.id));
  assert.equal(backend.snapshot()[`profile/${a.id}/usage`].names, 2);
  await assert.rejects(store.data(a.id).get("../usage"), DataNameError);

  await assert.rejects(store.usage("f".repeat(32)), UnknownProfileError);
  await assert.rejects(store.usage("nope"), UnknownProfileError);
  await store.remove(a.id);
  assert.deepEqual(await backend.keys(`profile/${a.id}`), []);
  await assert.rejects(store.usage(a.id), UnknownProfileError);
});

test("set refuses what would not fit into one export and changes nothing", async () => {
  const { backend, store } = await openSmall(3, 100);
  const a = await store.create("A", []);
  const set = (name, value) => store.data(a.id).set(name, value);
  await set("a", "x".repeat(40)); // 42 + 1 + 4 = 47
  await set("b", "x".repeat(40)); // 94 in total
  const before = backend.snapshot();
  assert.deepEqual(await store.usage(a.id), { names: 2, bytes: 94, maxNames: 3, maxBytes: 100 });
  await assert.rejects(set("c", "xx"), ProfileSizeError); // 4 + 1 + 4 = 9 -> 103
  await assert.rejects(set("a", "x".repeat(47)), ProfileSizeError); // overwrite: 94 - 47 + 54 = 101
  assert.deepEqual(backend.snapshot(), before);
  await set("a", "x".repeat(46)); // exactly 100
  assert.deepEqual(await store.usage(a.id), { names: 2, bytes: 100, maxNames: 3, maxBytes: 100 });
  await set("a", ""); // an overwrite that adds no bytes is always accepted (above the limit too: see the next tests)
  await set("c", 1);
  const full = backend.snapshot();
  await assert.rejects(set("d", 1), ProfileSizeError); // fourth name
  assert.deepEqual(backend.snapshot(), full);
  await set("c", 2); // overwriting does not need a free name
  await store.data(a.id).delete("b");
  await set("d", 1);
  assert.deepEqual(await store.usage(a.id), { names: 3, bytes: 7 + 6 + 6, maxNames: 3, maxBytes: 100 });

  // restoreProfile is held to the same limits.
  const profile = record();
  const atLimit = { a: "x".repeat(46), b: "x".repeat(40) };
  const snapshot = backend.snapshot();
  await assert.rejects(store.restoreProfile({ profile, data: { ...atLimit, a: "x".repeat(47) } }), ProfileSizeError);
  await assert.rejects(store.restoreProfile({ profile, data: { a: 1, b: 2, c: 3, d: 4 } }), ProfileSizeError);
  await assert.rejects(store.restoreProfile({ profile: a, data: { a: 1, b: 2, c: 3, d: 4 } }, "replace"), ProfileSizeError);
  assert.deepEqual(backend.snapshot(), snapshot);
  await store.restoreProfile({ profile, data: atLimit });
  assert.deepEqual(await store.usage(ID), { names: 2, bytes: 100, maxNames: 3, maxBytes: 100 });

  await assert.rejects(ProfileStore.open(new MemoryBackend(), { limits: { maxBytes: EXPORT_ENVELOPE_RESERVE - 1 } }), TypeError);
  await assert.rejects(ProfileStore.open(new MemoryBackend(), { limits: { maxDataNames: -1 } }), TypeError);
});

test("with the built-in limits a value or a name count that could not be exported is refused at set", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const before = backend.snapshot();
  await assert.rejects(store.data(a.id).set("big", "x".repeat(MAX_EXPORT_BYTES)), ProfileSizeError);
  await assert.rejects(store.data(a.id).set("big", "x".repeat(MAX_EXPORT_BYTES - EXPORT_ENVELOPE_RESERVE)), ProfileSizeError);
  assert.deepEqual(backend.snapshot(), before);

  await store.restoreProfile({ profile: a, data: Object.fromEntries(Array.from({ length: MAX_EXPORT_DATA_NAMES }, (_, i) => [`n${i}`, i])) }, "replace");
  const full = backend.snapshot();
  await assert.rejects(store.data(a.id).set("one-more", 1), ProfileSizeError);
  assert.deepEqual(backend.snapshot(), full);
  await store.data(a.id).set("n0", "overwritten");
  assert.equal((await store.usage(a.id)).names, MAX_EXPORT_DATA_NAMES);
});

test("a missing or impossible usage record is counted again from the data", async () => {
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  await store.data(a.id).set("one", [1, 2, 3]);
  await store.data(a.id).set("two", { text: chr(0xe4) });
  const key = `profile/${a.id}/usage`;
  const correct = recount(backend.snapshot(), a.id);
  assert.deepEqual(backend.snapshot()[key], correct);

  // As written by the first version of this module: no usage record at all.
  await backend.write({ delete: [key] });
  assert.equal((await store.usage(a.id)).bytes, correct.bytes);
  assert.deepEqual(backend.snapshot()[key], correct, "written back");

  for (const bad of [{ names: -1, bytes: 5 }, { names: 2, bytes: -5 }, { names: 2, bytes: NaN }, { names: 1.5, bytes: 5 }, { names: "2", bytes: 5 }, { names: 2 }, { names: 2, bytes: 5, extra: 1 }, [2, 5], null, 7, "usage", { names: 2, bytes: 2 ** 60 }]) {
    const stored = Number.isNaN(bad?.bytes) ? { names: 2, bytes: null } : bad;
    await backend.write({ set: { [key]: stored } });
    const usage = await store.usage(a.id);
    assert.deepEqual({ names: usage.names, bytes: usage.bytes }, correct, JSON.stringify(bad));
    assert.deepEqual(backend.snapshot()[key], correct, JSON.stringify(bad));
  }

  // set and delete repair it in the same batch as their own change.
  await backend.write({ delete: [key] });
  await store.data(a.id).set("three", true);
  assert.deepEqual(backend.snapshot()[key], recount(backend.snapshot(), a.id));
  await backend.write({ set: { [key]: { names: -3, bytes: -3 } } });
  await store.data(a.id).delete("one");
  assert.deepEqual(backend.snapshot()[key], recount(backend.snapshot(), a.id));
  assert.equal(backend.snapshot()[key].names, 2);

  // A failed write leaves value and usage as they were.
  const before = backend.snapshot();
  backend.failWrite();
  await assert.rejects(store.data(a.id).set("four", 4), InjectedWriteError);
  backend.failWrite();
  await assert.rejects(store.data(a.id).delete("two"), InjectedWriteError);
  assert.deepEqual(backend.snapshot(), before);
});

test("two stores on one backend can make the usage record drift; usage() and export correct it", async () => {
  const backend = new MemoryBackend();
  const limits = { maxDataNames: 10, maxBytes: EXPORT_ENVELOPE_RESERVE + 100 };
  const first = await ProfileStore.open(backend, { limits });
  const second = await ProfileStore.open(backend, { limits });
  const a = await first.create("A", []);
  const key = `profile/${a.id}/usage`;
  // Both read "empty", each adds 65 bytes and records 65: 130 bytes stored, 65 recorded.
  await Promise.all([first.data(a.id).set("a", "x".repeat(58)), second.data(a.id).set("b", "x".repeat(58))]);
  assert.deepEqual(await backend.keys(`profile/${a.id}/data/`), [`profile/${a.id}/data/a`, `profile/${a.id}/data/b`]);
  const counted = recount(backend.snapshot(), a.id);
  assert.deepEqual(counted, { names: 2, bytes: 130 });
  assert.deepEqual(backend.snapshot()[key], { names: 1, bytes: 65 }, "the record is plausible and too low");

  // Export finds the truth: it refuses, and corrects the record while doing so.
  await assert.rejects(exportProfile(first, a.id), ExportSizeError);
  assert.deepEqual(backend.snapshot()[key], counted, "corrected by the export attempt");
  // The data is not lost: with raised limits the export is still produced.
  const rescued = await exportProfile(first, a.id, { limits: { maxBytes: EXPORT_ENVELOPE_RESERVE + 1000 } });
  assert.deepEqual(Object.keys(rescued.data), ["a", "b"]);

  // usage() alone corrects it as well, and reports the amount over the limit.
  await backend.write({ set: { [key]: { names: 1, bytes: 65 } } });
  assert.deepEqual(await second.usage(a.id), { names: 2, bytes: 130, maxNames: 10, maxBytes: 100 });
  assert.deepEqual(backend.snapshot()[key], counted);
  // A record that is too high is corrected the same way.
  await backend.write({ set: { [key]: { names: 9, bytes: 99 } } });
  assert.equal((await first.usage(a.id)).bytes, 130);
  assert.deepEqual(backend.snapshot()[key], counted);
  await backend.write({ set: { [key]: { names: 9, bytes: 99 } } });
  assert.equal((await first.readProfile(a.id)).usage.bytes, 130);
  assert.deepEqual(backend.snapshot()[key], counted);

  // Once corrected, growth is refused, with a message that says what to do ...
  const before = backend.snapshot();
  await assert.rejects(first.data(a.id).set("c", 1), (error) => error instanceof ProfileSizeError && /already over the limit/.test(error.message) && /delete entries/.test(error.message));
  await assert.rejects(first.data(a.id).set("a", "x".repeat(59)), /already over the limit/);
  assert.deepEqual(backend.snapshot(), before);
  // ... and anything that adds neither a name nor bytes is accepted, so the profile can be reduced.
  await first.data(a.id).set("a", "y".repeat(58));
  assert.deepEqual(backend.snapshot()[key], counted, "same size, still over the limit, accepted");
  await first.data(a.id).set("a", "x".repeat(40));
  assert.deepEqual(await first.usage(a.id), { names: 2, bytes: 112, maxNames: 10, maxBytes: 100 });
  await assert.rejects(first.data(a.id).set("a", "x".repeat(41)), /already over the limit/);
  await first.data(a.id).set("b", "x".repeat(40));
  assert.deepEqual(await first.usage(a.id), { names: 2, bytes: 94, maxNames: 10, maxBytes: 100 });
  await exportProfile(first, a.id);
  await first.data(a.id).set("c", 1);
  await assert.rejects(first.data(a.id).set("d", 1), (error) => error instanceof ProfileSizeError && !/already over/.test(error.message));

  // Too many names: overwriting and deleting still work, adding does not.
  const tight = await ProfileStore.open(backend, { limits: { maxDataNames: 2, maxBytes: EXPORT_ENVELOPE_RESERVE + 1000 } });
  await assert.rejects(tight.data(a.id).set("e", 1), /already over the limit/);
  await assert.rejects(tight.data(a.id).set("c", "longer than before"), /already over the limit/);
  await tight.data(a.id).set("c", 2);
  await tight.data(a.id).delete("c");
  assert.equal((await tight.usage(a.id)).names, 2);
  await assert.rejects(tight.data(a.id).set("c", 1), (error) => error instanceof ProfileSizeError && !/already over/.test(error.message));
});

test("a value whose JSON text the engine cannot build is refused as too large", async () => {
  // Building a real text beyond the engine's string limit needs hundreds of megabytes,
  // so the engine's refusal is simulated for one marked value.
  const { backend, store } = await openStore();
  const a = await store.create("A", []);
  const before = backend.snapshot();
  const original = JSON.stringify;
  JSON.stringify = (value, ...rest) => {
    if (value === "too long for one string" || value?.huge === "too long for one string") throw new RangeError("Invalid string length");
    return original(value, ...rest);
  };
  try {
    await assert.rejects(store.data(a.id).set("big", "too long for one string"), ProfileSizeError);
    await assert.rejects(store.data(a.id).set("big", { huge: "too long for one string" }), ProfileSizeError);
    await assert.rejects(store.restoreProfile({ profile: record(), data: { big: "too long for one string" } }), ProfileSizeError);
    await assert.rejects(store.restoreProfile({ profile: a, data: { ok: 1, big: "too long for one string" } }, "replace"), ProfileSizeError);
  } finally {
    JSON.stringify = original;
  }
  assert.deepEqual(backend.snapshot(), before);
  await store.data(a.id).set("big", "too long for one string");
});

/** A backend that counts writes and can be told to refuse them all. */
const watched = (backend) => {
  const state = { writes: 0, refuse: false };
  return {
    state,
    get: (key) => backend.get(key),
    keys: (prefix) => backend.keys(prefix),
    write: async (batch) => {
      state.writes += 1;
      if (state.refuse) throw new InjectedWriteError("storage refuses writes");
      return backend.write(batch);
    },
  };
};

test("export and usage still answer when the usage record cannot be corrected", async () => {
  const memory = new MemoryBackend();
  const backend = watched(memory);
  const store = await ProfileStore.open(backend);
  const a = await store.create("A", []);
  await store.data(a.id).set("one", [1, 2, 3]);
  await store.data(a.id).set("two", "x".repeat(10));
  const key = `profile/${a.id}/usage`;
  const counted = recount(memory.snapshot(), a.id);
  const expected = { ...counted, maxNames: MAX_EXPORT_DATA_NAMES, maxBytes: MAX_EXPORT_BYTES - EXPORT_ENVELOPE_RESERVE };

  // A consistent record: reading attempts no write at all.
  backend.state.writes = 0;
  assert.deepEqual(await store.usage(a.id), expected);
  assert.deepEqual((await exportProfile(store, a.id)).data, { one: [1, 2, 3], two: "x".repeat(10) });
  assert.deepEqual((await store.readProfile(a.id)).usage, counted);
  assert.equal(backend.state.writes, 0);

  for (const [label, plant] of [
    ["no usage record", { delete: [key] }],
    ["record too low", { set: { [key]: { names: 1, bytes: 5 } } }],
    ["record too high", { set: { [key]: { names: 9, bytes: 9999 } } }],
  ]) {
    await memory.write(plant);
    const before = memory.snapshot();
    backend.state.refuse = true;
    backend.state.writes = 0;
    assert.deepEqual(await store.usage(a.id), expected, label);
    assert.deepEqual((await exportProfile(store, a.id)).data, { one: [1, 2, 3], two: "x".repeat(10) }, label);
    assert.deepEqual((await exportProfile(store, a.id, { limits: { maxBytes: MAX_EXPORT_BYTES * 2 } })).profile, a, label);
    assert.deepEqual((await store.readProfile(a.id)).usage, counted, label);
    assert.equal(backend.state.writes, 4, `${label}: each read tried to correct the record`);
    assert.deepEqual(memory.snapshot(), before, label);
    // Writes that are the point of the call still fail loudly.
    await assert.rejects(store.data(a.id).set("three", 3), InjectedWriteError, label);
    backend.state.refuse = false;
    assert.deepEqual(await store.usage(a.id), expected, label);
    assert.deepEqual(memory.snapshot()[key], counted, `${label}: corrected once storage accepts writes again`);
  }
});

test("a usage record that is too high does not make set refuse data that fits", async () => {
  const memory = new MemoryBackend();
  const backend = watched(memory);
  const store = await ProfileStore.open(backend, { limits: { maxDataNames: 3, maxBytes: EXPORT_ENVELOPE_RESERVE + 100 } });
  const a = await store.create("A", []);
  const key = `profile/${a.id}/usage`;
  await store.data(a.id).set("one", "x".repeat(10)); // 12 + 3 + 4 = 19
  const tooHigh = { names: 3, bytes: 140 };

  // Recorded as over both limits, really one small entry: a small value is accepted.
  await memory.write({ set: { [key]: tooHigh } });
  await store.data(a.id).set("two", "y".repeat(10));
  assert.deepEqual(memory.snapshot()[key], { names: 2, bytes: 38 });
  assert.deepEqual(memory.snapshot()[key], recount(memory.snapshot(), a.id));
  // Recorded as just below the limit: the planned total would be over, the real one is not.
  await memory.write({ set: { [key]: { names: 2, bytes: 95 } } });
  await store.data(a.id).set("two", "y".repeat(20));
  assert.deepEqual(memory.snapshot()[key], recount(memory.snapshot(), a.id));
  // Recorded as full of names.
  await memory.write({ set: { [key]: { names: 3, bytes: 48 } } });
  await store.data(a.id).set("six", 1);
  assert.deepEqual(memory.snapshot()[key], { names: 3, bytes: 48 + 8 });

  // The decision does not depend on being able to store the correction.
  await memory.write({ delete: [`profile/${a.id}/data/six`], set: { [key]: tooHigh } });
  backend.state.refuse = true;
  await assert.rejects(store.data(a.id).set("six", 1), InjectedWriteError);
  backend.state.refuse = false;
  await store.data(a.id).set("six", 1);
  assert.deepEqual(memory.snapshot()[key], recount(memory.snapshot(), a.id));

  // What really does not fit is still refused, and the refusal leaves a correct record behind.
  await memory.write({ set: { [key]: tooHigh } });
  const data = Object.fromEntries(Object.entries(memory.snapshot()).filter(([name]) => name.includes("/data/")));
  await assert.rejects(store.data(a.id).set("seven", 1), (error) => error instanceof ProfileSizeError && !/already over/.test(error.message));
  await assert.rejects(store.data(a.id).set("one", "x".repeat(70)), (error) => error instanceof ProfileSizeError && !/already over/.test(error.message));
  assert.deepEqual(memory.snapshot()[key], recount(memory.snapshot(), a.id));
  // Genuinely over the limit (written under a higher limit): refused as before.
  await memory.write({ set: { [`profile/${a.id}/data/one`]: "x".repeat(90), [key]: tooHigh } });
  await assert.rejects(store.data(a.id).set("one", "x".repeat(91)), /already over the limit/);
  await memory.write({ set: { [key]: { names: 1, bytes: 1 } } });
  assert.ok((await store.usage(a.id)).bytes > 100);
  await assert.rejects(store.data(a.id).set("one", "x".repeat(91)), /already over the limit/);
  await store.data(a.id).set("one", "x".repeat(10));
  assert.deepEqual(Object.keys(data).length, 3);
  assert.deepEqual(memory.snapshot()[key], recount(memory.snapshot(), a.id));
});
