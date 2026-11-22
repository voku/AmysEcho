import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeatureSequence, parseFeatureSequence, FeatureSchemaError, SEQUENCE_STEPS, STEP_VALUES, FEATURE_SCHEMA_VERSION,
  HAND_PRESENCE_SHARE, HAND_MOVING_SHARE, MAX_BRIDGED_GAP_MS, REST_SPEED, MIN_GESTURE_MS, MOVEMENT_GAP_MS,
} from "../dist/recognition/features.js";
import { dtwDistance } from "../dist/recognition/dtw.js";
import {
  calibrateMaxDistance, matchGesture, rankConcepts, MAX_CALIBRATED_MAX_DISTANCE, FALLBACK_MAX_DISTANCE,
} from "../dist/recognition/matcher.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";

const session = createSession(7);
// One-hand gestures unless a test says otherwise: sequences made with different hands are not compared at all.
const attempt = (gestureSeed, seed, sloppiness = 1, placement = session, hands = "right") => {
  const result = buildFeatureSequence(renderGesture(createGesture(gestureSeed, hands), { seed, session: placement, sloppiness }));
  assert.equal(result.ok, true);
  return result.sequence;
};
const hand = (x, y, size = 10) => Array.from({ length: 21 }, (_, i) => [x + (i % 5) * size * 0.2, y - Math.floor(i / 5) * size * 0.5]);

test("feature sequences have a fixed, versioned shape and are deterministic", () => {
  const a = attempt(1, 11);
  assert.equal(FEATURE_SCHEMA_VERSION, 2);
  assert.equal(a.schemaVersion, 2);
  assert.equal(a.anchor, "shoulders");
  assert.equal(a.hands, "right");
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
  const [withIdle, without] = [buildFeatureSequence(padded), buildFeatureSequence(frames)];
  assert.ok(withIdle.ok && without.ok);
  assert.equal(withIdle.sequence.hands, without.sequence.hands);
  // Not identical to the last digit: the length that speed is measured in comes from all frames of a capture.
  assert.ok(dtwDistance(withIdle.sequence, without.sequence) < 0.02, `distance ${dtwDistance(withIdle.sequence, without.sequence)}`);
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
    null, "x", { ...good, schemaVersion: 1 }, { ...good, schemaVersion: 3 }, { ...good, schemaVersion: undefined }, { ...good, anchor: "head" },
    { ...good, hands: "none" }, { ...good, hands: undefined },
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

// --- One hand and two hands, time and rest (card NG-18) ---

/** Shoulders one hundred units apart, so a speed in units per second divided by 100 is in shoulder widths per second. */
const SHOULDERS = [[50, 80], [150, 80]];
/** A capture with a frame every `stepMs`; `at(t)` gives the hands at that time (null, or [x, y] of the hand). */
function capture(totalMs, stepMs, at) {
  const frames = [];
  for (let tMs = 0; tMs <= totalMs; tMs += stepMs) {
    const { left = null, right = null } = at(tMs);
    frames.push({ tMs, left: left && hand(left[0], left[1]), right: right && hand(right[0], right[1]), shoulders: SHOULDERS });
  }
  return frames;
}
const built = (frames) => {
  const result = buildFeatureSequence(frames);
  assert.equal(result.ok, true, result.reason);
  return result.sequence;
};

test("hand kind: a hand belongs to the gesture when it is seen for half of its duration, and is dropped entirely below that", () => {
  assert.equal(HAND_PRESENCE_SHARE, 0.5);
  // The right hand moves for one second (one shoulder width per second); the left hand moves along for its first part.
  const withLeftFor = (ms) => capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t <= ms ? [20 - t / 10, 100] : null }));
  // Frames stand for 50 ms each, the first and last for 25: seen up to 450 ms is 47.5 %, up to 500 ms is 52.5 %.
  const below = built(withLeftFor(450));
  const above = built(withLeftFor(500));
  assert.equal(below.hands, "right");
  assert.equal(above.hands, "both");
  // Dropped means: not a trace of it. The sequence is that of the right hand alone.
  const alone = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100] })));
  assert.deepEqual(below, alone);
  assert.ok(below.steps.every((step) => step.slice(0, STEP_VALUES / 2).every((value) => value === 0)));
  assert.ok(above.steps.every((step) => step[STEP_VALUES / 2 - 1] === 1), "a hand that belongs is filled in where it was not seen");
  // A hand that joins late is filled in before its first sighting as well.
  const late = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t >= 500 ? [20 - t / 10, 100] : null })));
  assert.equal(late.hands, "both");
  assert.ok(late.steps.every((step) => step[STEP_VALUES / 2 - 1] === 1));
  // The same the other way round.
  assert.equal(built(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100], right: t <= 450 ? [220 - t / 10, 100] : null }))).hands, "left");
});

test("hand kind: a second hand that only rests in view while the other one moves is not part of the gesture; when nothing moves, every hand in view is", () => {
  assert.equal(HAND_MOVING_SHARE, 0.2);
  const resting = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: [20 + (t % 100) / 100, 100] })));
  assert.equal(resting.hands, "right");
  assert.deepEqual(resting, built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100] }))));
  // It moves along for a fifth of the time or more: it belongs.
  const movesFor = (ms) => built(capture(2000, 50, (t) => ({ right: [100 + t / 10, 100], left: [20 - Math.min(t, ms) / 10, 100] }))).hands;
  assert.equal(movesFor(300), "right");
  assert.equal(movesFor(500), "both");
  // A posture that is only held: there is no movement to tell the hands apart by.
  assert.equal(built(capture(600, 50, () => ({ right: [120, 100], left: [20, 100] }))).hands, "both");
});

test("like with like: an attempt is only compared with examples made with the same hands, and 'unknown' says which examples were missing", () => {
  const options = { maxDistance: new Map(), minMargin: 0.15 };
  const right = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100] })));
  // The same movement, mirrored to the other hand: as close as two different hands can get.
  const left = built(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100] })));
  const both = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: [20 - t / 10, 100] })));
  assert.deepEqual([right.hands, left.hands, both.hands], ["right", "left", "both"]);
  const examples = [{ conceptId: "l", sequence: left }, { conceptId: "b", sequence: both }];
  assert.deepEqual(rankConcepts(right, examples), []);
  assert.deepEqual(matchGesture(right, examples, options), { kind: "unknown", reason: "other_hands", ranked: [] });
  assert.equal(matchGesture(left, examples, options).conceptId, "l");
  assert.deepEqual(rankConcepts(both, examples).map((entry) => entry.conceptId), ["b"]);
  // Shoulders seen in the examples and not in the attempt: its own reason, before the hands are looked at.
  const unanchored = built(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100] })).map((frame) => ({ ...frame, shoulders: null })));
  assert.equal(unanchored.anchor, "hands");
  assert.deepEqual(matchGesture(unanchored, examples, options), { kind: "unknown", reason: "other_anchor", ranked: [] });
  assert.deepEqual(matchGesture(right, [], options), { kind: "unknown", reason: "no_examples", ranked: [] });
  // Calibration looks at siblings of the same kind only: one right-hand and one left-hand example are two single examples.
  assert.equal(calibrateMaxDistance([{ conceptId: "a", sequence: right }, { conceptId: "a", sequence: left }]).size, 0);
  assert.equal(calibrateMaxDistance([{ conceptId: "a", sequence: right }, { conceptId: "a", sequence: right }]).size, 1);
});

test("dropout: a hand of the gesture that is lost for up to 500 ms between two sightings is filled in; longer, and the attempt fails", () => {
  assert.equal(MAX_BRIDGED_GAP_MS, 500);
  // Two hands move for two seconds; the left one is not seen between 600 ms and `until`.
  const lostUntil = (until, stepMs = 50) => capture(2000, stepMs, (t) => ({ right: [100 + t / 20, 100], left: t > 600 && t < until ? null : [20 - t / 20, 100] }));
  const whole = built(lostUntil(600));
  const bridged = buildFeatureSequence(lostUntil(1100));
  assert.ok(bridged.ok);
  assert.equal(bridged.sequence.hands, "both");
  // The movement was even, so what is filled in is what was there.
  assert.ok(dtwDistance(whole, bridged.sequence) < 0.01, `distance ${dtwDistance(whole, bridged.sequence)}`);
  assert.deepEqual(buildFeatureSequence(lostUntil(1150)), { ok: false, reason: "hand_lost" });
  // The limit is time, not frames: at 7 frames per second three lost frames are too long, at 30 they are nothing.
  assert.deepEqual(buildFeatureSequence(lostUntil(1100, 140)).ok, false);
  assert.equal(built(capture(2000, 33, (t) => ({ right: [100 + t / 20, 100], left: t > 600 && t < 700 ? null : [20 - t / 20, 100] }))).hands, "both");
  // A one-hand gesture's own hand is held to the same limit.
  const oneHand = (until) => buildFeatureSequence(capture(2000, 50, (t) => ({ right: t > 600 && t < until ? null : [100 + t / 20, 100] })));
  assert.equal(oneHand(1100).ok, true);
  assert.deepEqual(oneHand(1150), { ok: false, reason: "hand_lost" });
});

test("segmentation: hands that rest in view before and after the movement are not part of the gesture", () => {
  // A resting hand is never quite still: it wanders by a hundredth of a shoulder width.
  const wobble = (t) => Math.sin(t / 37) * 0.5;
  const moving = (t) => ({ right: [100 + t / 10, 100] });
  const withRest = (restMs) => capture(1000 + 2 * restMs, 50, (t) => ({
    right: t < restMs ? [100 + wobble(t), 100 + wobble(t + 9)] : t > restMs + 1000 ? [200 + wobble(t), 100 + wobble(t + 9)] : [100 + (t - restMs) / 10, 100],
  }));
  const plain = built(capture(1000, 50, moving));
  for (const restMs of [500, 1000, 3000]) {
    const rested = built(withRest(restMs));
    assert.ok(dtwDistance(plain, rested) < 0.03, `${restMs} ms of rest: distance ${dtwDistance(plain, rested)}`);
  }
  // Without the cut the hand would stand still for most of the sequence.
  const start = (sequence) => sequence.steps[0][STEP_VALUES - 3];
  const rested = built(withRest(3000));
  assert.ok(Math.abs(rested.steps[8][STEP_VALUES - 3] - start(rested)) > 0.15, "a quarter into the sequence the hand is well on its way");
});

test("segmentation: slower than the rest speed is rest, a burst shorter than the minimum is not a movement, and a short pause does not end one", () => {
  assert.deepEqual([REST_SPEED, MIN_GESTURE_MS, MOVEMENT_GAP_MS], [0.25, 300, 200]);
  const x = (sequence, step) => sequence.steps[step][STEP_VALUES - 3];
  // One second of rest, two seconds of travel at `speed` shoulder widths per second, one second of rest.
  const travel = (speed) => built(capture(4000, 50, (t) => ({ right: [100 + Math.min(Math.max(t - 1000, 0), 2000) * speed / 10, 100] })));
  const slow = travel(0.2);
  const fast = travel(0.3);
  // Below the rest speed nothing "moves": the gesture is the whole capture, a quarter of which is the rest before.
  assert.ok(Math.abs(x(slow, 7) - x(slow, 0)) < 0.001, "still at rest after a fifth of the sequence");
  assert.ok(Math.abs(x(fast, 7) - x(fast, 0)) > 0.1, "cut to the movement");
  // A burst of 250 ms in a long rest is jitter, not a gesture: the capture stays whole.
  const burst = (ms) => built(capture(4000, 50, (t) => ({ right: [100 + Math.min(Math.max(t - 2000, 0), ms) / 5, 100] })));
  assert.ok(Math.abs(x(burst(150), 12) - x(burst(150), 0)) < 0.001);
  assert.ok(Math.abs(x(burst(600), 12) - x(burst(600), 0)) > 0.3);
  // A pause of 150 ms inside a movement is part of it; the gesture runs from the first to the last movement.
  const paused = built(capture(4000, 50, (t) => {
    const moved = Math.min(Math.max(t - 1000, 0), 600) + Math.min(Math.max(t - 1750, 0), 600);
    return { right: [100 + moved / 10, 100] };
  }));
  assert.ok(Math.abs(x(paused, 31) - x(paused, 0)) > 1.1, "both halves of the movement are in the sequence");
  // Two short pieces with a pause, or with the hand unseen for 300 ms, between them are one movement of more than the
  // minimum; taken apart, neither piece would be a movement and the capture would stay whole.
  const pieces = (between) => built(capture(4000, 50, (t) => {
    const [piece, resume] = between === "unseen" ? [150, 1450] : [100, 1400];
    const moved = Math.min(Math.max(t - 1000, 0), piece) + Math.min(Math.max(t - resume, 0), piece);
    return { right: between === "unseen" && t > 1150 && t < 1450 ? null : [100 + moved / 5, 100] };
  }));
  for (const between of ["pause", "unseen"]) {
    // In the whole capture the last quarter is rest; cut to the movement, the hand is still under way there.
    assert.ok(Math.abs(x(pieces(between), 31) - x(pieces(between), 24)) > 0.05, `${between}: cut to the movement`);
  }
});

test("time: the sequence is laid out by the timestamps, so a low or unsteady frame rate gives the same gesture", () => {
  const path = (t) => ({ right: [100 + (t / 1500) ** 2 * 150, 100 + t / 30] });
  const steady = built(capture(1500, 33, path));
  const slowCamera = built(capture(1500, 140, path));
  // Frames at uneven times between 60 and 150 ms apart.
  const uneven = [];
  for (let t = 0, i = 0; t <= 1500; t += 60 + ((i * 37) % 90), i += 1) uneven.push({ tMs: t, left: null, right: hand(100 + (t / 1500) ** 2 * 150, 100 + t / 30), shoulders: SHOULDERS });
  assert.ok(dtwDistance(steady, slowCamera) < 0.05, `7 fps: ${dtwDistance(steady, slowCamera)}`);
  assert.ok(dtwDistance(steady, built(uneven)) < 0.05, `uneven: ${dtwDistance(steady, built(uneven))}`);
  // A capture whose second half has four times the frames of the first: by frame number its middle would be far off.
  const lopsided = [];
  for (let t = 0; t <= 1500; t += t < 750 ? 120 : 30) lopsided.push({ tMs: t, left: null, right: hand(100 + (t / 1500) ** 2 * 150, 100 + t / 30), shoulders: SHOULDERS });
  const y = (sequence, step) => sequence.steps[step][STEP_VALUES - 2];
  assert.ok(Math.abs(y(built(lopsided), 16) - y(steady, 16)) < 0.03, `${y(built(lopsided), 16)} against ${y(steady, 16)}`);
});

test("a second hand that passes through for a moment changes nothing; one that passes before the gesture does not start it", () => {
  const alone = built(capture(1500, 50, (t) => ({ right: [100 + t / 15, 100] })));
  const passing = built(capture(1500, 50, (t) => ({ right: [100 + t / 15, 100], left: t >= 500 && t <= 900 ? [20 + (t - 500) / 4, 60] : null })));
  assert.equal(passing.hands, "right");
  assert.deepEqual(passing, alone);
  // The right hand rests for a second while the left one crosses the picture, then makes the gesture.
  const before = built(capture(2500, 50, (t) => ({
    right: [100 + Math.max(t - 1000, 0) / 15, 100],
    left: t >= 200 && t <= 700 ? [20 + (t - 200) / 4, 60] : null,
  })));
  assert.equal(before.hands, "right");
  assert.ok(dtwDistance(before, alone) < 0.03, `distance ${dtwDistance(before, alone)}`);
});
