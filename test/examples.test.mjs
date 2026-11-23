import assert from "node:assert/strict";
import test from "node:test";
import { exportProfile, importProfile } from "../dist/profiles/backup.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileSizeError, ProfileStore, isDataName } from "../dist/profiles/store.js";
import { FEATURE_SCHEMA_VERSION, HAND_POINTS, SEQUENCE_STEPS, STEP_VALUES, buildFeatureSequence } from "../dist/recognition/features.js";
import { calibrateMaxDistance, DEFAULT_MIN_MARGIN, matchGesture } from "../dist/recognition/matcher.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";
import {
  EXAMPLE_BYTES_ESTIMATE, EXAMPLE_DECIMALS, EXAMPLE_RECORD_VERSION, ExampleFormatError, countExamples, createExampleRecord, deleteExample, deleteExamples,
  exampleConceptOf, exampleName, handTravel, isExampleConceptId, listExamples, parseExampleRecord, roundFeature, saveExample, sequenceFromRecording, usageLevel,
} from "../dist/recognition/examples.js";

// All data here is synthetic: generated gestures and made-up tracker numbers.

/** A feature sequence of a generated gesture: right hand, left hand or both. */
function sequenceOf(hands, seed = 1) {
  const result = buildFeatureSequence(renderGesture(createGesture(seed, hands), { seed: seed * 7, session: createSession(100), sloppiness: 0.5, disturbance: { restBeforeMs: 300, restAfterMs: 300 } }));
  assert.equal(result.ok, true, result.reason);
  return result.sequence;
}
const FACTS = { capturedAt: new Date("2026-11-23T10:11:12.345Z"), frames: 42, durationMs: 2800.4 };
const recordOf = (hands, conceptId = "trinken", seed = 1) => createExampleRecord(conceptId, sequenceOf(hands, seed), FACTS);
const openStore = async (limits) => {
  const backend = new MemoryBackend();
  return { backend, store: await ProfileStore.open(backend, limits === undefined ? {} : { limits }) };
};
const damage = (value, conceptId) => {
  try {
    parseExampleRecord(value, conceptId);
  } catch (error) {
    assert.ok(error instanceof ExampleFormatError, String(error));
    return error.kind;
  }
  return "readable";
};

// --- The record ---

test("record: a sequence becomes a versioned record with every field, rounded to the stored precision, and reads back unchanged", () => {
  const sequence = sequenceOf("right");
  const record = createExampleRecord("trinken", sequence, FACTS);
  assert.deepEqual(Object.keys(record).sort(), ["anchor", "capturedAt", "conceptId", "decimals", "durationMs", "featureSchemaVersion", "frames", "hands", "steps", "version"]);
  assert.equal(record.version, EXAMPLE_RECORD_VERSION);
  assert.equal(record.conceptId, "trinken");
  assert.equal(record.capturedAt, "2026-11-23T10:11:12.345Z");
  assert.equal(record.featureSchemaVersion, FEATURE_SCHEMA_VERSION);
  assert.equal(record.anchor, sequence.anchor);
  assert.equal(record.hands, "right");
  assert.equal(record.decimals, EXAMPLE_DECIMALS);
  assert.equal(record.frames, 42);
  assert.equal(record.durationMs, 2800);
  assert.equal(record.steps.length, SEQUENCE_STEPS);
  // Rounded: never more than half a unit of the last decimal away, and some values really changed.
  let moved = 0;
  record.steps.forEach((step, i) => step.forEach((value, j) => {
    assert.ok(Math.abs(value - sequence.steps[i][j]) <= 0.5 / 10 ** EXAMPLE_DECIMALS + 1e-12);
    assert.equal(roundFeature(value), value);
    if (value !== sequence.steps[i][j]) moved += 1;
  }));
  assert.ok(moved > 0);
  // Through JSON (as the store keeps it) and back: the same record, and the matcher's sequence.
  const read = parseExampleRecord(JSON.parse(JSON.stringify(record)), "trinken");
  assert.deepEqual(read.record, record);
  assert.deepEqual(read.sequence, { schemaVersion: FEATURE_SCHEMA_VERSION, anchor: record.anchor, hands: "right", steps: record.steps });
});

test("record: rounding gives plain numbers, never negative zero, also from typed arrays", () => {
  assert.equal(roundFeature(0.123456), 0.1235);
  assert.equal(roundFeature(-0.123449), -0.1234);
  assert.ok(Object.is(roundFeature(-0.00001), 0));
  const sequence = sequenceOf("both");
  // A Float32Array is not JSON for the store; the record holds plain arrays.
  const typed = { ...sequence, steps: sequence.steps.map((step) => Float32Array.from(step)) };
  const record = createExampleRecord("hilfe", typed, FACTS);
  assert.ok(record.steps.every((step) => Array.isArray(step) && step.length === STEP_VALUES));
  assert.ok(!JSON.stringify(record).includes("-0,") && !JSON.stringify(record).includes("-0]"));
  assert.equal(damage(JSON.parse(JSON.stringify(record)), "hilfe"), "readable");
});

test("record: one-hand (left or right) and two-hand gestures are stored with their hands", () => {
  for (const hands of ["right", "left", "both"]) {
    const record = recordOf(hands, "hilfe", 3);
    assert.equal(record.hands, hands);
    assert.equal(parseExampleRecord(record, "hilfe").sequence.hands, hands);
  }
  // The slot of the hand that is not part of a one-hand gesture is all zero; a two-hand record fills both.
  const right = recordOf("right");
  assert.ok(right.steps.every((step) => step.slice(0, STEP_VALUES / 2).every((value) => value === 0)));
  const both = recordOf("both");
  assert.ok(both.steps.some((step) => step.slice(0, STEP_VALUES / 2).some((value) => value !== 0)));
});

test("record: a record of another version or feature schema is reported with its kind, never read as this one", () => {
  const record = recordOf("right");
  assert.equal(damage({ ...record, version: 2 }), "unsupported-version");
  assert.equal(damage({ ...record, featureSchemaVersion: FEATURE_SCHEMA_VERSION + 1 }), "unsupported-version");
  assert.equal(damage({ ...record, featureSchemaVersion: 1 }), "incompatible");
  assert.equal(damage({ ...record, version: 0 }), "unreadable");
  assert.equal(damage({ ...record, version: "1" }), "unreadable");
  const { featureSchemaVersion, ...withoutSchema } = record;
  assert.equal(featureSchemaVersion, FEATURE_SCHEMA_VERSION);
  assert.equal(damage(withoutSchema), "unreadable");
});

test("record: a damaged record is unreadable, never repaired", () => {
  const record = recordOf("both");
  const cases = {
    "not an object": null,
    "an array": [record],
    "an extra field": { ...record, video: "none" },
    "a missing field": (({ frames, ...rest }) => rest)(record),
    "another concept than the data name": record,
    "a bad concept id": { ...record, conceptId: "Trinken" },
    "a malformed time": { ...record, capturedAt: "23.11.2026" },
    "a date that does not exist": { ...record, capturedAt: "2026-02-31T10:00:00.000Z" },
    "another precision": { ...record, decimals: 3 },
    "values that are not rounded": { ...record, steps: record.steps.map((step, i) => (i === 0 ? [0.123456, ...step.slice(1)] : step)) },
    "a short step": { ...record, steps: record.steps.map((step, i) => (i === 3 ? step.slice(1) : step)) },
    "too few steps": { ...record, steps: record.steps.slice(1) },
    "a number that is not finite": { ...record, steps: record.steps.map((step, i) => (i === 0 ? [Number.NaN, ...step.slice(1)] : step)) },
    "an unknown hand kind": { ...record, hands: "none" },
    "an unknown anchor": { ...record, anchor: "head" },
    "a negative frame count": { ...record, frames: -1 },
    "a fractional duration": { ...record, durationMs: 1.5 },
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.equal(damage(value, name === "another concept than the data name" ? "hilfe" : "trinken"), "unreadable", name);
  }
  assert.equal(damage(record, "trinken"), "readable");
});

test("record: creating refuses what cannot be stored", () => {
  const sequence = sequenceOf("right");
  assert.throws(() => createExampleRecord("Trinken", sequence, FACTS), ExampleFormatError);
  assert.throws(() => createExampleRecord("mein.ball", sequence, FACTS), ExampleFormatError);
  assert.throws(() => createExampleRecord("trinken", sequence, { ...FACTS, capturedAt: new Date(Number.NaN) }), ExampleFormatError);
  assert.throws(() => createExampleRecord("trinken", sequence, { ...FACTS, frames: -1 }), ExampleFormatError);
  assert.throws(() => createExampleRecord("trinken", { ...sequence, schemaVersion: 1 }, FACTS));
  assert.throws(() => createExampleRecord("trinken", { ...sequence, steps: sequence.steps.slice(1) }, FACTS));
});

test("data names: one per example, within the store's rules, and they name their concept", () => {
  const longest = "a".repeat(40);
  const name = exampleName(longest, "0123456789ab");
  assert.equal(name, `gesture.${longest}.0123456789ab`);
  assert.ok(isDataName(name), "a valid data name of the store");
  assert.equal(exampleConceptOf(name), longest);
  assert.equal(exampleConceptOf("concept.trinken"), null);
  assert.equal(exampleConceptOf("gesture.trinken"), null);
  assert.equal(exampleConceptOf("gesture.trinken.0123456789aG"), null);
  assert.ok(isExampleConceptId("custom-1") && !isExampleConceptId("a.b") && !isExampleConceptId("a".repeat(41)));
  assert.throws(() => exampleName("a.b", "0123456789ab"), ExampleFormatError);
  assert.throws(() => exampleName("trinken", "xyz"), ExampleFormatError);
});

test("size: an example at the stored precision fits the estimate and is well under half of full precision", () => {
  for (const hands of ["right", "both"]) {
    const sequence = sequenceOf(hands, 5);
    const stored = JSON.stringify(createExampleRecord("trinken", sequence, FACTS)).length;
    const full = JSON.stringify(sequence.steps).length;
    assert.ok(stored < EXAMPLE_BYTES_ESTIMATE, `${hands}: ${stored}`);
    assert.ok(stored < full / 2, `${hands}: ${stored} of ${full}`);
  }
});

test("rounding does not change the matcher's decisions on a small synthetic profile", () => {
  const examples = [];
  const attempts = [];
  for (let g = 0; g < 6; g += 1) {
    const hands = ["right", "both", "left"][g % 3];
    for (let r = 0; r < 3; r += 1) examples.push({ conceptId: `c${g}`, sequence: sequenceOf(hands, g + 1) });
    for (let r = 0; r < 3; r += 1) {
      const built = buildFeatureSequence(renderGesture(createGesture(g + 1, hands), { seed: 900 + g * 10 + r, session: createSession(103), sloppiness: 1 }));
      if (built.ok) attempts.push(built.sequence);
    }
  }
  // Examples of the same gesture with other seeds so that they differ.
  examples.forEach((example, at) => {
    const g = Number(example.conceptId.slice(1));
    const built = buildFeatureSequence(renderGesture(createGesture(g + 1, ["right", "both", "left"][g % 3]), { seed: 50 + at, session: createSession(101), sloppiness: 1 }));
    if (built.ok) example.sequence = built.sequence;
  });
  const rounded = examples.map((example) => ({ conceptId: example.conceptId, sequence: parseExampleRecord(createExampleRecord("x", example.sequence, FACTS)).sequence }));
  const full = calibrateMaxDistance(examples);
  const less = calibrateMaxDistance(rounded);
  const decide = (list, limits, attempt) => {
    const result = matchGesture(attempt, list, { maxDistance: limits, minMargin: DEFAULT_MIN_MARGIN });
    return result.kind === "match" ? result.conceptId : result.reason;
  };
  assert.ok(attempts.length >= 15);
  for (const attempt of attempts) assert.equal(decide(rounded, less, attempt), decide(examples, full, attempt));
});

// --- Through the profile store ---

test("store: examples are stored one data name each, listed per concept oldest first, and counted from their names", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["trinken", "hilfe"]);
  const saved = [];
  for (let i = 0; i < 5; i += 1) {
    saved.push(await saveExample(store, mia.id, "trinken", sequenceOf(i % 2 === 0 ? "right" : "both", i + 1), { ...FACTS, capturedAt: new Date(Date.UTC(2026, 10, 23, 10, 5 - i)) }));
  }
  await saveExample(store, mia.id, "hilfe", sequenceOf("left", 9), FACTS);
  await store.data(mia.id).set("concept.trinken", { version: 1, labelDe: "Trinken", speechDe: "Ich möchte etwas trinken.", copied: true });
  const names = await store.data(mia.id).names();
  assert.equal(names.filter((name) => name.startsWith("gesture.trinken.")).length, 5);
  assert.equal(new Set(saved.map((example) => example.name)).size, 5);
  for (const example of saved) assert.match(example.name, /^gesture\.trinken\.[0-9a-f]{12}$/);
  const listing = await listExamples(store, mia.id, "trinken");
  assert.deepEqual(listing.damaged, []);
  // Oldest first: the last one saved was captured first.
  assert.deepEqual(listing.examples.map((example) => example.name), [...saved].reverse().map((example) => example.name));
  assert.deepEqual(listing.examples.map((example) => example.record.hands), ["right", "both", "right", "both", "right"]);
  assert.deepEqual((await listExamples(store, mia.id)).examples.length, 6);
  assert.deepEqual([...await countExamples(store, mia.id)].sort(), [["hilfe", 1], ["trinken", 5]]);
  // What is stored is exactly the record: no picture, no landmarks.
  const raw = await store.data(mia.id).get(saved[0].name);
  assert.deepEqual(Object.keys(raw).sort(), ["anchor", "capturedAt", "conceptId", "decimals", "durationMs", "featureSchemaVersion", "frames", "hands", "steps", "version"]);
});

test("store: damaged and newer entries are listed with their kind, never dropped; deleting leaves a newer app's entry alone", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["trinken"]);
  const good = await saveExample(store, mia.id, "trinken", sequenceOf("right"), FACTS);
  const record = recordOf("right");
  const data = store.data(mia.id);
  await data.set("gesture.trinken.00000000000a", { ...record, version: 2 });
  await data.set("gesture.trinken.00000000000b", { ...record, extra: true });
  await data.set("gesture.trinken.00000000000c", { ...record, featureSchemaVersion: 1 });
  // Under another concept's name: unreadable, not counted for this one.
  await data.set("gesture.hilfe.00000000000d", record);
  const listing = await listExamples(store, mia.id, "trinken");
  assert.deepEqual(listing.examples.map((example) => example.name), [good.name]);
  assert.deepEqual(listing.damaged.map((entry) => [entry.name, entry.kind]), [
    ["gesture.trinken.00000000000a", "unsupported-version"],
    ["gesture.trinken.00000000000b", "unreadable"],
    ["gesture.trinken.00000000000c", "incompatible"],
  ]);
  assert.deepEqual((await listExamples(store, mia.id, "hilfe")).damaged.map((entry) => entry.kind), ["unreadable"]);

  await assert.rejects(deleteExample(store, mia.id, "gesture.trinken.00000000000a"), (error) => error instanceof ExampleFormatError && error.kind === "unsupported-version");
  await assert.rejects(deleteExample(store, mia.id, "concept.trinken"), ExampleFormatError);
  await deleteExample(store, mia.id, "gesture.trinken.00000000000b");
  assert.equal(await data.get("gesture.trinken.00000000000b"), undefined);
  // All of a tile: the readable and the unusable ones; a newer app's entry stays.
  assert.equal(await deleteExamples(store, mia.id, "trinken"), 2);
  assert.deepEqual((await data.names()).sort(), ["gesture.hilfe.00000000000d", "gesture.trinken.00000000000a"]);
  // Deleting one that is already gone is not an error.
  await deleteExample(store, mia.id, good.name);
});

test("store: examples of one profile are not visible to another", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["trinken"]);
  const ben = await store.create("Ben", ["trinken"]);
  await saveExample(store, mia.id, "trinken", sequenceOf("right"), FACTS);
  assert.equal((await listExamples(store, ben.id, "trinken")).examples.length, 0);
  assert.equal((await countExamples(store, ben.id)).size, 0);
  assert.equal(await deleteExamples(store, ben.id, "trinken"), 0);
  assert.equal((await listExamples(store, mia.id, "trinken")).examples.length, 1);
});

test("store: examples are part of the export, come back with a restore (also as a copy), and go with the profile", async () => {
  const { store } = await openStore();
  const mia = await store.create("Mia", ["trinken", "hilfe"]);
  const one = await saveExample(store, mia.id, "trinken", sequenceOf("right"), FACTS);
  const both = await saveExample(store, mia.id, "hilfe", sequenceOf("both", 2), FACTS);
  const exported = JSON.parse(JSON.stringify(await exportProfile(store, mia.id)));
  assert.deepEqual(Object.keys(exported.data).sort(), [one.name, both.name].sort());
  assert.deepEqual(exported.data[one.name], one.record);

  const other = await openStore();
  const restored = await importProfile(other.store, exported);
  const listing = await listExamples(other.store, restored.id);
  assert.deepEqual(listing.examples.map((example) => [example.record.conceptId, example.record.hands]).sort(), [["hilfe", "both"], ["trinken", "right"]]);
  assert.deepEqual(listing.examples.find((example) => example.name === one.name).record, one.record);
  // A copy under a new id carries them as well: the record holds no profile id that could disagree.
  const copy = await importProfile(store, exported, { onConflict: "copy" });
  assert.notEqual(copy.id, mia.id);
  assert.equal((await listExamples(store, copy.id)).examples.length, 2);

  await store.remove(mia.id);
  await assert.rejects(listExamples(store, mia.id));
  const { backend } = other;
  await other.store.remove(restored.id);
  assert.deepEqual((await backend.keys("profile/")).filter((key) => key.includes("gesture.")), []);
  assert.equal((await listExamples(store, copy.id)).examples.length, 2);
});

test("store: a write over the profile's limit is refused with ProfileSizeError and stores nothing; usage tells it beforehand", async () => {
  const record = recordOf("both");
  const entry = JSON.stringify(record).length + 40;
  // Room for two examples and a half, not for three.
  const { store } = await openStore({ maxBytes: 34 * 1024 + Math.round(entry * 2.5) });
  const mia = await store.create("Mia", ["trinken"]);
  await saveExample(store, mia.id, "trinken", sequenceOf("both"), FACTS);
  assert.equal(usageLevel(await store.usage(mia.id)), "ok");
  await saveExample(store, mia.id, "trinken", sequenceOf("both", 2), FACTS);
  assert.equal(usageLevel(await store.usage(mia.id)), "full");
  const before = await store.data(mia.id).names();
  await assert.rejects(saveExample(store, mia.id, "trinken", sequenceOf("both", 3), FACTS), ProfileSizeError);
  assert.deepEqual(await store.data(mia.id).names(), before);
  // Deleting makes room again.
  await deleteExample(store, mia.id, before[0]);
  assert.notEqual(usageLevel(await store.usage(mia.id)), "full");
  await saveExample(store, mia.id, "trinken", sequenceOf("both", 3), FACTS);
});

test("usage levels: room, near the limit (bytes or names), full", () => {
  const max = { maxNames: 100, maxBytes: 1_000_000 };
  assert.equal(usageLevel({ ...max, names: 0, bytes: 0 }), "ok");
  assert.equal(usageLevel({ ...max, names: 89, bytes: 899_999 }), "ok");
  assert.equal(usageLevel({ ...max, names: 90, bytes: 0 }), "near");
  assert.equal(usageLevel({ ...max, names: 0, bytes: 900_000 }), "near");
  assert.equal(usageLevel({ ...max, names: 100, bytes: 0 }), "full");
  assert.equal(usageLevel({ ...max, names: 0, bytes: 1_000_000 - EXAMPLE_BYTES_ESTIMATE + 1 }), "full");
  assert.equal(usageLevel({ ...max, names: 0, bytes: 1_000_000 - EXAMPLE_BYTES_ESTIMATE }), "near");
});

// --- From the camera's tracker frames ---

const WIDTH = 640;
const HEIGHT = 480;
/** A tracker hand: 21 normalised points around a wrist at (x, y). */
function trackerHand(x, y, label) {
  const landmarks = Array.from({ length: HAND_POINTS }, (_, index) => {
    if (index === 0) return { x, y };
    const finger = Math.floor((index - 1) / 4);
    const joint = (index - 1) % 4 + 1;
    return { x: x + (finger - 2) * 0.02, y: y - joint * 0.024 };
  });
  return { landmarks, label, score: 0.95 };
}
const POSE = Array.from({ length: 33 }, (_, index) => ({ x: index === 11 ? 0.62 : index === 12 ? 0.38 : 0.5, y: 0.55, visibility: 0.99 }));
/** A recording of `count` frames at 10 per second; `hands(i)` gives the hands of frame i. */
function recording(count, hands) {
  return Array.from({ length: count }, (_, i) => ({
    timestampMs: 5000 + i * 100, imageWidth: WIDTH, imageHeight: HEIGHT, hands: hands(i), pose: i % 5 === 0 ? POSE : null, poseRan: i % 5 === 0,
  }));
}

test("recording: one-hand and two-hand recordings become sequences with their hands, frames and duration", () => {
  // The child's right hand is MediaPipe's "Right" on unflipped frames (docs/capture.md).
  const one = sequenceFromRecording(recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right")]));
  assert.equal(one.ok, true, one.reason);
  assert.equal(one.sequence.hands, "right");
  assert.equal(one.sequence.anchor, "shoulders");
  assert.equal(one.frames, 20);
  assert.equal(one.durationMs, 1900);
  const two = sequenceFromRecording(recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right"), trackerHand(0.7 - i * 0.01, 0.5, "Left")]));
  assert.equal(two.ok, true, two.reason);
  assert.equal(two.sequence.hands, "both");
  // Both store and read back with their hands.
  assert.equal(parseExampleRecord(createExampleRecord("trinken", two.sequence, { capturedAt: FACTS.capturedAt, frames: two.frames, durationMs: two.durationMs })).record.hands, "both");
});

test("recording: what the matcher cannot use comes back with its reason", () => {
  assert.deepEqual(sequenceFromRecording([]), { ok: false, reason: "no_frames", frames: 0, durationMs: 0 });
  assert.equal(sequenceFromRecording(recording(15, () => [])).reason, "no_hands");
  assert.equal(sequenceFromRecording(recording(2, () => [trackerHand(0.4, 0.5, "Right")])).reason, "too_short");
  // A second hand seen for a third of the time: nobody can say whether it belongs.
  assert.equal(sequenceFromRecording(recording(30, (i) => [trackerHand(0.3 + i * 0.005, 0.5, "Right"), ...(i < 10 ? [trackerHand(0.7, 0.5, "Left")] : [])])).reason, "hands_unclear");
  // The hand gone for a second in the middle.
  assert.equal(sequenceFromRecording(recording(30, (i) => (i >= 10 && i < 20 ? [] : [trackerHand(0.3 + i * 0.005, 0.5, "Right")]))).reason, "hand_lost");
});

test("recording: a two-hand recording in which one hand lies still is marked, by the hand's own travel; one moving a little is not", () => {
  const still = sequenceFromRecording(recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right"), trackerHand(0.7, 0.5, "Left")]));
  assert.equal(still.ok, true, still.reason);
  assert.equal(still.sequence.hands, "both");
  assert.equal(still.stillHand, true);
  const moving = sequenceFromRecording(recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right"), trackerHand(0.7 - i * 0.01, 0.5, "Left")]));
  assert.equal(moving.stillHand, false);
  // One hand only: never marked.
  assert.equal(sequenceFromRecording(recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right")])).stillHand, false);
  // The measure: shoulder widths (here 0.24 x 640 px), on palm centres averaged over 200 ms.
  const frames = recording(20, (i) => [trackerHand(0.3 + i * 0.01, 0.5, "Right")]).map((frame) => ({
    tMs: frame.timestampMs - 5000,
    right: frame.hands[0].landmarks.map((point) => [point.x * WIDTH, point.y * HEIGHT]),
    left: null,
    shoulders: [[0.62 * WIDTH, 0.55 * HEIGHT], [0.38 * WIDTH, 0.55 * HEIGHT]],
  }));
  const travel = handTravel(frames, "right");
  // 0.19 of the width minus half a step of smoothing at each end (the first and last averages take one neighbour), over 0.24.
  assert.ok(Math.abs(travel - 0.18 / 0.24) < 0.001, String(travel));
  assert.equal(handTravel(frames, "left"), Number.POSITIVE_INFINITY);
  // Jitter of a resting hand (0.002 of the width, 3 px) stays under the movement floor.
  const jitter = frames.map((frame, i) => ({ ...frame, right: frames[0].right.map(([x, y]) => [x + (i % 2 === 0 ? 3 : -3), y]) }));
  assert.ok(handTravel(jitter, "right") < 0.1);
});
