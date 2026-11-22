import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeatureSequence, parseFeatureSequence, FeatureSchemaError, SEQUENCE_STEPS, STEP_VALUES,
} from "../dist/recognition/features.js";
import { dtwDistance } from "../dist/recognition/dtw.js";
import {
  calibrateMaxDistance, matchGesture, rankConcepts, MAX_CALIBRATED_MAX_DISTANCE, FALLBACK_MAX_DISTANCE,
} from "../dist/recognition/matcher.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";

const session = createSession(7);
const attempt = (gestureSeed, seed, sloppiness = 1, placement = session) => {
  const result = buildFeatureSequence(renderGesture(createGesture(gestureSeed), { seed, session: placement, sloppiness }));
  assert.equal(result.ok, true);
  return result.sequence;
};
const hand = (x, y, size = 10) => Array.from({ length: 21 }, (_, i) => [x + (i % 5) * size * 0.2, y - Math.floor(i / 5) * size * 0.5]);

test("feature sequences have a fixed, versioned shape and are deterministic", () => {
  const a = attempt(1, 11);
  assert.equal(a.schemaVersion, 1);
  assert.equal(a.anchor, "shoulders");
  assert.equal(a.steps.length, SEQUENCE_STEPS);
  assert.ok(a.steps.every((step) => step.length === STEP_VALUES && step.every(Number.isFinite)));
  assert.deepEqual(attempt(1, 11), a);
});

test("camera position, zoom and tilt do not change the features", () => {
  const here = attempt(3, 21, 0, createSession(1));
  const there = attempt(3, 21, 0, createSession(2));
  assert.ok(dtwDistance(here, there) < 0.05, `distance ${dtwDistance(here, there)}`);
});

test("idle frames before and after the movement are ignored", () => {
  const frames = renderGesture(createGesture(4), { seed: 5, session, sloppiness: 0 });
  const idle = { tMs: 0, left: null, right: null, shoulders: frames[0].shoulders };
  const padded = [
    ...Array.from({ length: 12 }, (_, i) => ({ ...idle, tMs: i })),
    ...frames.map((frame) => ({ ...frame, tMs: frame.tMs + 100 })),
    ...Array.from({ length: 12 }, (_, i) => ({ ...idle, tMs: 100000 + i })),
  ];
  assert.deepEqual(buildFeatureSequence(padded), buildFeatureSequence(frames));
});

test("a short tracking dropout is bridged instead of read as a missing hand", () => {
  const frames = Array.from({ length: 12 }, (_, i) => ({ tMs: i * 33, left: null, right: hand(100 + i * 5, 100), shoulders: [[50, 80], [150, 80]] }));
  const withGap = frames.map((frame, i) => (i === 5 || i === 6 ? { ...frame, right: null } : frame));
  const full = buildFeatureSequence(frames);
  const bridged = buildFeatureSequence(withGap);
  assert.ok(full.ok && bridged.ok);
  assert.ok(dtwDistance(full.sequence, bridged.sequence) < 0.01);
});

test("without shoulders the sequence is anchored to the hands themselves and is not compared with body-anchored examples", () => {
  const frames = Array.from({ length: 8 }, (_, i) => ({ tMs: i * 33, left: null, right: hand(100 + i * 5, 100), shoulders: null }));
  const result = buildFeatureSequence(frames);
  assert.ok(result.ok);
  assert.equal(result.sequence.anchor, "hands");
  assert.deepEqual(rankConcepts(result.sequence, [{ conceptId: "a", sequence: attempt(1, 1) }]), []);
});

test("unusable input is rejected with a reason", () => {
  const frame = (tMs, right = hand(1, 1)) => ({ tMs, left: null, right, shoulders: null });
  assert.deepEqual(buildFeatureSequence([]), { ok: false, reason: "no_frames" });
  assert.deepEqual(buildFeatureSequence([frame(10), frame(5), frame(20)]), { ok: false, reason: "bad_timestamps" });
  assert.deepEqual(buildFeatureSequence([frame(0), frame(1, hand(1, 1).slice(1)), frame(2)]), { ok: false, reason: "bad_landmarks" });
  assert.deepEqual(buildFeatureSequence([frame(0), frame(1, [...hand(1, 1).slice(1), [Number.NaN, 0]]), frame(2)]), { ok: false, reason: "bad_landmarks" });
  assert.deepEqual(buildFeatureSequence([frame(0), frame(1), frame(2, null)]), { ok: false, reason: "too_short" });
  assert.deepEqual(buildFeatureSequence([frame(0, null), frame(1, null), frame(2, null)]), { ok: false, reason: "too_short" });
});

test("stored sequences with another schema version or shape are rejected", () => {
  const good = attempt(1, 1);
  assert.deepEqual(parseFeatureSequence(JSON.parse(JSON.stringify(good))), good);
  for (const bad of [
    null, "x", { ...good, schemaVersion: 2 }, { ...good, schemaVersion: undefined }, { ...good, anchor: "head" },
    { ...good, steps: good.steps.slice(1) }, { ...good, steps: good.steps.map((step) => step.slice(1)) },
    { ...good, steps: good.steps.map((step, i) => (i === 3 ? step.map(() => null) : step)) },
    { ...good, steps: new Array(32) }, { ...good, steps: good.steps.map(() => new Array(good.steps[0].length)) },
  ]) {
    assert.throws(() => parseFeatureSequence(bad), FeatureSchemaError);
  }
});

test("DTW distance is zero for identical sequences, symmetric, and tolerant of speed changes", () => {
  const a = attempt(2, 1, 0);
  const b = attempt(5, 2, 0);
  assert.equal(dtwDistance(a, a), 0);
  for (let pair = 0; pair < 30; pair += 1) {
    const x = attempt(pair + 1, pair, 2);
    const y = attempt(pair + 2, pair + 50, 2);
    assert.equal(dtwDistance(x, y), dtwDistance(y, x));
  }
  const frames = renderGesture(createGesture(2), { seed: 1, session, sloppiness: 0 });
  const active = frames.filter((frame) => frame.right !== null);
  // Same movement with a slow first half: every early frame is shown three times.
  const uneven = active.flatMap((frame, i) => (i < active.length / 2 ? [frame, frame, frame] : [frame])).map((frame, i) => ({ ...frame, tMs: i * 33 }));
  const slowStart = buildFeatureSequence(uneven);
  assert.ok(slowStart.ok);
  assert.ok(dtwDistance(a, slowStart.sequence) < dtwDistance(a, b) / 5);
});

test("a repetition of a taught gesture is recognised; ranked concepts support a correction list", () => {
  const examples = [1, 2, 3, 4].flatMap((g) => [1, 2, 3].map((n) => ({ conceptId: `c${g}`, sequence: attempt(g, g * 10 + n) })));
  const maxDistance = calibrateMaxDistance(examples);
  assert.deepEqual([...maxDistance.keys()].sort(), ["c1", "c2", "c3", "c4"]);
  const result = matchGesture(attempt(3, 999), examples, { maxDistance, minMargin: 0.15 });
  assert.equal(result.kind, "match");
  assert.equal(result.conceptId, "c3");
  assert.equal(result.ranked.length, 3);
  assert.equal(result.ranked[0].conceptId, "c3");
  assert.ok(result.ranked[0].distance <= result.ranked[1].distance);
});

test("unknown is a normal answer: no examples, too far, or two concepts equally close", () => {
  const options = { maxDistance: new Map(), minMargin: 0.15 };
  assert.deepEqual(matchGesture(attempt(1, 1), [], options), { kind: "unknown", reason: "no_examples", ranked: [] });

  const examples = [1, 2].flatMap((g) => [1, 2, 3].map((n) => ({ conceptId: `c${g}`, sequence: attempt(g, g * 10 + n) })));
  const far = matchGesture(attempt(9, 5), examples, { maxDistance: calibrateMaxDistance(examples), minMargin: 0.15 });
  assert.equal(far.kind, "unknown");
  assert.equal(far.reason, "too_far");
  assert.equal(far.ranked.length, 2);

  const same = attempt(1, 77);
  const twins = [{ conceptId: "a", sequence: attempt(1, 78) }, { conceptId: "b", sequence: attempt(1, 78) }];
  const ambiguous = matchGesture(same, twins, { maxDistance: new Map([["a", 99], ["b", 99]]), minMargin: 0.15 });
  assert.equal(ambiguous.kind, "unknown");
  assert.equal(ambiguous.reason, "ambiguous");
});

test("the same sequence stored under two concepts is ambiguous, even at distance zero", () => {
  const sequence = attempt(1, 1);
  const twins = [{ conceptId: "a", sequence }, { conceptId: "b", sequence }];
  const result = matchGesture(sequence, twins, { maxDistance: new Map(), minMargin: 0.15 });
  assert.equal(result.kind, "unknown");
  assert.equal(result.reason, "ambiguous");
});

test("a distance that is not a number is never accepted", () => {
  const broken = { ...attempt(1, 1), steps: attempt(1, 1).steps.map((step) => step.map(() => Number.NaN)) };
  const result = matchGesture(broken, [{ conceptId: "a", sequence: attempt(1, 2) }], { maxDistance: new Map([["a", 99]]), minMargin: 0.15 });
  assert.equal(result.kind, "unknown");
});

test("more examples never make a concept stricter than a single example", () => {
  const sequence = attempt(1, 1);
  assert.equal(calibrateMaxDistance([{ conceptId: "a", sequence }, { conceptId: "a", sequence }]).get("a"), FALLBACK_MAX_DISTANCE);
  const attempts = Array.from({ length: 40 }, (_, i) => attempt(1 + (i % 8), 500 + i, 1));
  const accepted = (examples) => attempts.filter((query) => {
    const result = matchGesture(query, examples, { maxDistance: calibrateMaxDistance(examples), minMargin: 0.15 });
    return result.kind === "match";
  }).length;
  const one = Array.from({ length: 8 }, (_, g) => ({ conceptId: `c${g}`, sequence: attempt(g + 1, g, 0) }));
  const two = [...one, ...Array.from({ length: 8 }, (_, g) => ({ conceptId: `c${g}`, sequence: attempt(g + 1, 100 + g, 0) }))];
  assert.ok(accepted(two) >= accepted(one), `${accepted(two)} accepted with two tidy examples, ${accepted(one)} with one`);
});

test("one mislabelled example among good ones does not open the concept", () => {
  const good = [1, 2, 3].map((n) => ({ conceptId: "a", sequence: attempt(1, n, 0.5) }));
  const withMislabelled = [...good, { conceptId: "a", sequence: attempt(9, 4) }];
  assert.equal(calibrateMaxDistance(withMislabelled).get("a"), calibrateMaxDistance(good).get("a"));
  // With nothing but inconsistent examples the limit stops at the upper bound.
  const inconsistent = [{ conceptId: "a", sequence: attempt(1, 1) }, { conceptId: "a", sequence: attempt(9, 2) }];
  assert.equal(calibrateMaxDistance(inconsistent).get("a"), MAX_CALIBRATED_MAX_DISTANCE);
});

test("degenerate shoulders are bad input, not a sequence of non-numbers", () => {
  const frames = [0, 1, 2].map((tMs) => ({ tMs, left: null, right: hand(10, 10), shoulders: [[0, 0], [1e-320, 0]] }));
  assert.deepEqual(buildFeatureSequence(frames), { ok: false, reason: "bad_landmarks" });
});

test("a single-example concept uses the fallback limit", () => {
  const examples = [{ conceptId: "solo", sequence: attempt(1, 1, 0) }];
  const options = { maxDistance: calibrateMaxDistance(examples), minMargin: 0.15 };
  assert.equal(matchGesture(attempt(1, 2, 0.5), examples, options).kind, "match");
  let accepted = 0;
  for (let other = 0; other < 100; other += 1) {
    if (matchGesture(attempt(200 + other, other), examples, options).kind === "match") accepted += 1;
  }
  assert.ok(accepted <= 2, `${accepted} of 100 unrelated movements accepted`);
});

test("a hand of zero size is bad input, not an empty gesture", () => {
  const dot = Array.from({ length: 21 }, () => [5, 5]);
  const frames = [0, 1, 2].map((tMs) => ({ tMs, left: null, right: dot, shoulders: [[0, 0], [10, 0]] }));
  assert.deepEqual(buildFeatureSequence(frames), { ok: false, reason: "bad_landmarks" });
});

test("without shoulders, losing one hand in the first frame barely moves the anchor", () => {
  const frames = Array.from({ length: 10 }, (_, i) => ({ tMs: i * 33, left: hand(40 + i * 3, 100), right: hand(160 - i * 3, 100), shoulders: null }));
  const full = buildFeatureSequence(frames);
  const firstLost = buildFeatureSequence(frames.map((frame, i) => (i === 0 ? { ...frame, right: null } : frame)));
  assert.ok(full.ok && firstLost.ok);
  // The first steps differ because a hand is missing there; once both hands are visible the positions must agree.
  const lastFull = full.sequence.steps.at(-1);
  const lastLost = firstLost.sequence.steps.at(-1);
  const largest = Math.max(...lastFull.map((value, index) => Math.abs(value - lastLost[index])));
  assert.ok(largest < 0.2, `largest difference ${largest}`);
});

test("DTW rejects empty sequences and invalid bands", () => {
  const a = attempt(1, 1);
  assert.throws(() => dtwDistance({ ...a, steps: [] }, { ...a, steps: [] }), RangeError);
  for (const band of [-1, 0.5, Number.NaN]) assert.throws(() => dtwDistance(a, a, band), RangeError);
});

test("a concept with a single example gets no calibrated limit", () => {
  const limits = calibrateMaxDistance([{ conceptId: "solo", sequence: attempt(1, 1) }]);
  assert.equal(limits.size, 0);
});

test("the recognition modules use no DOM, network or storage API", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const name of ["features", "dtw", "matcher", "evaluate", "synthetic"]) {
    const source = await readFile(new URL(`../src/recognition/${name}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(document|window|navigator|fetch|localStorage|indexedDB|XMLHttpRequest)\b/, name);
    assert.ok([...source.matchAll(/from "([^"]+)"/g)].every((match) => match[1].startsWith("./")), `${name} imports only local modules`);
  }
});
