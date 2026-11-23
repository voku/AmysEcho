import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeatureSequence, parseFeatureSequence, FeatureSchemaError, SEQUENCE_STEPS, STEP_VALUES, FEATURE_SCHEMA_VERSION,
  HAND_PRESENCE_SHARE, HAND_BRIEF_SHARE, MAX_BRIDGED_GAP_MS, REST_SPEED, MIN_GESTURE_MS, MOVEMENT_GAP_MS, MIN_TRAVEL,
} from "../dist/recognition/features.js";
import { dtwDistance } from "../dist/recognition/dtw.js";
import {
  calibrateMaxDistance, limitKey, matchGesture, rankConcepts, MAX_CALIBRATED_MAX_DISTANCE, FALLBACK_MAX_DISTANCE,
} from "../dist/recognition/matcher.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";

const session = createSession(7);
// One-hand gestures unless a test says otherwise: sequences made with different hands are not compared at all.
const attempt = (gestureSeed, seed, sloppiness = 1, placement = session, hands = "right") => {
  const result = buildFeatureSequence(renderGesture(createGesture(gestureSeed, hands), { seed, session: placement, sloppiness }));
  assert.equal(result.ok, true);
  return result.sequence;
};
/** The key of a concept's limit for right-hand, body-anchored sequences, which `attempt` makes. */
const rightKey = (conceptId) => limitKey(conceptId, { anchor: "shoulders", hands: "right" });
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
  // Each cause has its own reason: no hand at all; a hand in too few frames; frames that all carry one timestamp.
  assert.deepEqual(buildFeatureSequence([frame(0, null), frame(1, null), frame(2, null)]), { ok: false, reason: "no_hands" });
  // Shoulders without any hand are "no_hands" as well; a hand in a single frame of them is not.
  const body = (tMs, right = null) => ({ ...frame(tMs, right), shoulders: [[0, 0], [10, 0]] });
  assert.deepEqual(buildFeatureSequence([body(0), body(1), body(2)]), { ok: false, reason: "no_hands" });
  assert.notEqual(buildFeatureSequence([body(0), body(1, hand(1, 1)), body(2)]).reason, "no_hands");
  assert.deepEqual(buildFeatureSequence([frame(7), frame(7), frame(7), frame(7)]), { ok: false, reason: "too_short" });
  assert.equal(buildFeatureSequence([frame(7), frame(7), frame(7), frame(8)]).ok, true);
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
  assert.deepEqual([...maxDistance.keys()].sort(), ["c1", "c2", "c3", "c4"].map(rightKey));
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
  const ambiguous = matchGesture(same, twins, { maxDistance: new Map([[rightKey("a"), 99], [rightKey("b"), 99]]), minMargin: 0.15 });
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
  const result = matchGesture(broken, [{ conceptId: "a", sequence: attempt(1, 2) }], { maxDistance: new Map([[rightKey("a"), 99]]), minMargin: 0.15 });
  assert.equal(result.kind, "unknown");
});

test("more examples never make a concept stricter than a single example", () => {
  const sequence = attempt(1, 1);
  assert.equal(calibrateMaxDistance([{ conceptId: "a", sequence }, { conceptId: "a", sequence }]).get(rightKey("a")), FALLBACK_MAX_DISTANCE);
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
  assert.equal(calibrateMaxDistance(withMislabelled).get(rightKey("a")), calibrateMaxDistance(good).get(rightKey("a")));
  // With nothing but inconsistent examples the limit stops at the upper bound.
  const inconsistent = [{ conceptId: "a", sequence: attempt(1, 1) }, { conceptId: "a", sequence: attempt(9, 2) }];
  assert.equal(calibrateMaxDistance(inconsistent).get(rightKey("a")), MAX_CALIBRATED_MAX_DISTANCE);
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

test("limits are per concept and kind of sequence: examples made with other hands never widen a concept", () => {
  // Sequences that are one constant apart in a single value are that far apart by DTW.
  const flat = (hands, value) => ({ schemaVersion: 2, anchor: "shoulders", hands, steps: Array.from({ length: SEQUENCE_STEPS }, () => Array.from({ length: STEP_VALUES }, (_, i) => (i === 0 ? value : 0))) });
  // Two right-hand examples of "a" far apart open its right-hand limit to the upper bound; "a" has one two-hand example.
  const examples = [{ conceptId: "a", sequence: flat("right", 0) }, { conceptId: "a", sequence: flat("right", 1.2) }, { conceptId: "a", sequence: flat("both", 0) }];
  const limits = calibrateMaxDistance(examples);
  assert.equal(limits.get(rightKey("a")), MAX_CALIBRATED_MAX_DISTANCE);
  assert.equal(limits.get(limitKey("a", { anchor: "shoulders", hands: "both" })), undefined);
  assert.equal(limits.size, 1);
  const options = { maxDistance: limits, minMargin: 0.15 };
  // A two-hand attempt 1.0 from the two-hand example is beyond the single example's limit; a right-hand one is within the right-hand limit.
  assert.equal(matchGesture(flat("both", 1), examples, options).reason, "too_far");
  assert.equal(matchGesture(flat("both", 0.7), examples, options).conceptId, "a");
  assert.equal(matchGesture(flat("right", 0.6 + 1.2), examples, options).conceptId, "a");
  // The key tells concepts, anchors and hands apart.
  assert.notEqual(limitKey("a", { anchor: "shoulders", hands: "right" }), limitKey("a", { anchor: "hands", hands: "right" }));
  assert.notEqual(limitKey("a", { anchor: "shoulders", hands: "right" }), limitKey("b", { anchor: "shoulders", hands: "right" }));
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

const unclear = { ok: false, reason: "hands_unclear" };

test("hand kind: seen for half of the gesture a hand belongs to it, seen for under a fifth it is dropped entirely, in between nothing is built", () => {
  assert.deepEqual([HAND_PRESENCE_SHARE, HAND_BRIEF_SHARE], [0.5, 0.2]);
  // The right hand moves for one second (one shoulder width per second); the left hand moves along for its first part.
  const withLeftFor = (ms) => capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t <= ms ? [20 - t / 10, 100] : null }));
  // Frames stand for 50 ms each, the first and last for 25: seen up to 150 ms is 17.5 %, up to 200 ms 22.5 %, up to 450 ms 47.5 %, up to 500 ms 52.5 %.
  const brief = built(withLeftFor(150));
  const above = built(withLeftFor(500));
  assert.equal(brief.hands, "right");
  assert.equal(above.hands, "both");
  // Neither brief nor there for half of it: leaving the hand out could make a two-hand gesture the one-hand gesture with the same path.
  assert.deepEqual(buildFeatureSequence(withLeftFor(200)), unclear);
  assert.deepEqual(buildFeatureSequence(withLeftFor(450)), unclear);
  // Dropped means: not a trace of it. The sequence is that of the right hand alone.
  const alone = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100] })));
  assert.deepEqual(brief, alone);
  assert.ok(brief.steps.every((step) => step.slice(0, STEP_VALUES / 2).every((value) => value === 0)));
  assert.ok(above.steps.every((step) => step[STEP_VALUES / 2 - 1] === 1), "a hand that belongs is filled in where it was not seen");
  // A hand that joins late is filled in before its first sighting as well.
  const late = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t >= 500 ? [20 - t / 10, 100] : null })));
  assert.equal(late.hands, "both");
  assert.ok(late.steps.every((step) => step[STEP_VALUES / 2 - 1] === 1));
  // The same the other way round.
  assert.equal(built(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100], right: t <= 150 ? [220 - t / 10, 100] : null }))).hands, "left");
  assert.deepEqual(buildFeatureSequence(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100], right: t <= 450 ? [220 - t / 10, 100] : null }))), unclear);
  // Two hands that take turns, each seen for under half of the time: nobody's gesture.
  assert.deepEqual(buildFeatureSequence(capture(1000, 50, (t) => (t < 450 ? { left: [20, 100] } : t > 550 ? { right: [120, 100] } : {}))), unclear);
});

test("hand kind: the shares are limits that a hand reaches when it is seen for exactly that share", () => {
  // The right hand moves for one second; frames every 50 ms, without the one at `skip`, so the last frame with the left
  // hand stands for 75 ms. Seen up to 150 ms (skip 200) the left hand is in view for exactly a fifth, up to 450 ms
  // (skip 500) for exactly half.
  const exactly = (until, skip) => capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t <= until ? [20 - t / 10, 100] : null }))
    .filter((frame) => frame.tMs !== skip);
  assert.deepEqual(buildFeatureSequence(exactly(150, 200)), unclear);
  assert.equal(built(exactly(100, 200)).hands, "right");
  assert.equal(built(exactly(450, 500)).hands, "both");
  assert.deepEqual(buildFeatureSequence(exactly(400, 500)), unclear);
  // Two hands each seen for under a fifth of the span of their movements: no hand belongs, nothing is built.
  const apart = capture(3000, 50, (t) => ({ left: t <= 400 ? [20 + t / 4, 60] : null, right: t >= 2600 ? [100 + (t - 2600) / 4, 100] : null }));
  assert.deepEqual(buildFeatureSequence(apart), unclear);
});

test("hand kind: presence decides, not movement; a hand in view is never dropped because the other one moves", () => {
  const alone = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100] })));
  // The other hand rests in view while the right one moves: a two-hand capture, with the resting hand in it.
  const resting = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: [20 + (t % 100) / 100, 100] })));
  assert.equal(resting.hands, "both");
  assert.ok(resting.steps.every((step) => step[STEP_VALUES / 2 - 1] === 1));
  assert.deepEqual(matchGesture(resting, [{ conceptId: "a", sequence: alone }], { maxDistance: new Map(), minMargin: 0.15 }).reason, "other_hands");
  // A posture that is only held, with two hands in view.
  assert.equal(built(capture(600, 50, () => ({ right: [120, 100], left: [20, 100] }))).hands, "both");
  // The right hand holds a sign without travelling; the hand in the lap fidgets for 600 ms. The gesture is not "the hand that fidgeted".
  const fidget = (t) => 20 + Math.sin(Math.min(Math.max((t - 600) / 600, 0), 1) * 2 * Math.PI) * 12;
  const held = built(capture(2000, 50, (t) => ({ right: [120, 100], left: [fidget(t), 160] })));
  assert.equal(held.hands, "both");
  assert.ok(held.steps.every((step) => step[STEP_VALUES - 1] === 1), "the hand that makes the sign is in every step");
  // Two signs that differ only in where the still right hand is stay apart, whatever the lap hand does.
  const elsewhere = built(capture(2000, 50, (t) => ({ right: [150, 60], left: [fidget(t), 160] })));
  assert.ok(dtwDistance(held, elsewhere) > 0.4, `distance ${dtwDistance(held, elsewhere)}`);
});

test("hand kind: a hand that stays without a movement of its own, while another hand was in view briefly, gives no sequence", () => {
  // The right hand lies still for three seconds. Somebody's hand is seen for 300 ms, too slow or too short to count as moving.
  const blip = capture(3000, 50, (t) => ({ right: [120, 100], left: t >= 1000 && t <= 1300 ? [20 + (t - 1000) / 100, 60] : null }));
  assert.deepEqual(buildFeatureSequence(blip), unclear);
  // Without the other hand it is a held posture, and with a movement of its own the right hand is a gesture.
  assert.equal(built(capture(3000, 50, () => ({ right: [120, 100] }))).hands, "right");
  const own = capture(3000, 50, (t) => ({ right: [120 + Math.min(Math.max(t - 500, 0), 1000) / 10, 100], left: t >= 1000 && t <= 1100 ? [20, 60] : null }));
  assert.equal(built(own).hands, "right");
  // The brief hand moves across while the right hand lies still: read as two hands over that moment, never as the right hand's gesture.
  const crossing = buildFeatureSequence(capture(3000, 50, (t) => ({ right: [120, 100], left: t >= 1000 && t <= 1500 ? [20 + (t - 1000) / 5, 60] : null })));
  assert.ok(!crossing.ok || crossing.sequence.hands === "both", JSON.stringify(crossing.ok ? crossing.sequence.hands : crossing.reason));
});

test("hand kind: which hands belong is decided over the whole time a hand is in view, never over a cut by movement", () => {
  // The right hand rests, moves from 1000 to 3000 ms and rests until 3600 ms, in view throughout. The left hand is seen
  // from `from` until `until`, travelling at `speed` shoulder widths per second while it is seen.
  const frames = (until, speed, from = 500) => capture(3600, 50, (t) => ({
    right: [100 + Math.min(Math.max(t - 1000, 0), 2000) / 20, 100],
    left: t >= from && t <= until ? [20 + (t - from) * speed / 10, 60] : null,
  }));
  // The left hand moves for 400 ms and leaves just before the right hand starts. It is in view for under a fifth of the
  // capture, but it moved on its own, so it may belong: never the right hand's gesture alone.
  assert.deepEqual(buildFeatureSequence(frames(900, 1)), unclear);
  // It leaves a little after the right hand has started: the same.
  assert.deepEqual(buildFeatureSequence(frames(1150, 1, 750)), unclear);
  // The same hand moving for 250 ms, under the shortest movement, or not moving at all, is a hand that passed by.
  assert.equal(built(frames(750, 1)).hands, "right");
  assert.equal(built(frames(900, 0)).hands, "right");
  assert.deepEqual(built(frames(900, 0)), built(frames(0, 0)));
  // Slowly, 0.3 shoulder widths per second for 320 ms of 2 s (16 %): too little for a movement that cuts, but more
  // than jitter, so it is never dropped. Held still for that time, it is.
  const slow = (speed) => buildFeatureSequence(capture(2000, 40, (t) => ({ right: [100 + t / 20, 100], left: t >= 600 && t <= 920 ? [20 + (t - 600) * speed / 10, 60] : null })));
  assert.deepEqual(slow(0.3), unclear);
  assert.equal(slow(0).sequence.hands, "right");
  // A dropped hand seen just after the movement does not stretch the gesture: the cut follows the hands that belong.
  const alone = (extra) => built(capture(1500, 50, (t) => ({ right: t <= 1000 ? [100 + t / 10, 100] : null, left: extra && t > 1000 && t <= 1100 ? [20, 60] : null })));
  assert.deepEqual(alone(true), alone(false));
  // The left hand moves after the right hand has ended.
  const after = (from, until) => capture(4000, 50, (t) => ({
    right: [100 + Math.min(Math.max(t - 500, 0), 2000) / 20, 100],
    left: t >= from && t <= until ? [20 + (t - from) / 10, 60] : null,
  }));
  assert.deepEqual(buildFeatureSequence(after(2600, 3000)), unclear);
  assert.deepEqual(buildFeatureSequence(after(2400, 2900)), unclear);
  assert.equal(built(after(2600, 2850)).hands, "right");
  // A still left hand seen through the rest before the movement and gone during it: over the movement it is all but
  // absent, over the time a hand is in view it is not (29 %). Nothing is built; it is never dropped.
  assert.deepEqual(buildFeatureSequence(frames(1050, 0, 0)), unclear);
  // Seen for half of that time it belongs, although it is seen during little of the movement.
  assert.equal(built(frames(1800, 0, 0)).hands, "both");
  assert.deepEqual(buildFeatureSequence(frames(1700, 0, 0)), unclear);
  // The right hand lies still and is not seen for a moment while the left hand makes a gesture. The right hand is in
  // view for most of the time, so it belongs; the left hand moved on its own, so it may belong as well: nothing is built.
  const occluded = capture(3000, 50, (t) => ({
    right: t > 900 && t < 1500 ? null : [120, 100],
    left: t >= 1000 && t <= 1400 ? [20 + (t - 1000) / 5, 60] : null,
  }));
  assert.deepEqual(buildFeatureSequence(occluded), unclear);
});

test("movement: jitter of a resting hand and a change of shape in place are no movement, so they never cut the gesture", () => {
  assert.equal(MIN_TRAVEL, 0.1);
  const x = (sequence, step) => sequence.steps[step][STEP_VALUES - 3];
  // Three seconds of a resting right hand that jitters by a fiftieth of a shoulder width (two units) from frame to frame.
  const random = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const noise = random(7);
  const jittered = capture(3000, 50, () => ({ right: [120 + noise() * 7, 100 + noise() * 7] }));
  // Uncut, the sequence is the whole time the hand is in view: the first step is at the first frame.
  const whole = built(jittered);
  assert.ok(Math.abs(x(whole, 0) - (jittered[0].right[0][0] - 100) / 100) < 1e-9, "the gesture starts with the first frame");
  // Stronger jitter, about 0.03 shoulder widths from frame to frame: positions averaged over 200 ms still do not get
  // the minimum distance apart, in none of twenty captures.
  for (let k = 0; k < 20; k += 1) {
    const strong = capture(3000, 50, () => ({ right: [120 + noise() * 10, 100 + noise() * 10] }));
    assert.ok(Math.abs(x(built(strong), 0) - (strong[0].right[0][0] - 100) / 100) < 1e-9, `capture ${k} was cut`);
  }
  // A shape that changes in place: the fingers close, the palm stays. The capture is not cut to the closing.
  const closing = (t) => Array.from({ length: 21 }, (_, i) => {
    const palm = [0, 1, 5, 9, 13, 17].includes(i);
    const bend = palm ? 0 : Math.min(Math.max((t - 1000) / 400, 0), 1) * 20;
    return [120 + (i % 5) * 2, 100 - Math.floor(i / 5) * 5 + bend];
  });
  const frames = Array.from({ length: 61 }, (_, i) => ({ tMs: i * 50, left: null, right: closing(i * 50), shoulders: SHOULDERS }));
  const shape = built(frames);
  // The mean of all 21 points travels 0.14 shoulder widths in 0.4 s here, but the palm does not move: the sequence is
  // the whole capture, so a quarter into it the fingers are still open. Cut to the closing, they would be half closed.
  assert.deepEqual(shape.steps[8], shape.steps[0]);
  assert.notDeepEqual(shape.steps[31], shape.steps[0]);
  // From 1 to 2 s the hand swings fast to and fro. Getting 5 hundredths of a shoulder width from where it started, it
  // is not cut out (a quarter into the sequence it is still at rest); getting 15 hundredths away, it is.
  const swings = (units, periodMs) => built(capture(3000, 50, (t) => ({
    right: [120 + (t >= 1000 && t <= 2000 ? Math.sin((2 * Math.PI * (t - 1000)) / periodMs) * units : 0), 100],
  })));
  assert.ok(Math.abs(x(swings(5, 400), 4) - x(swings(5, 400), 0)) < 1e-9, "5 hundredths: the whole capture");
  assert.ok(Math.abs(x(swings(15, 500), 4) - x(swings(15, 500), 0)) > 0.01, "15 hundredths: cut to the movement");
});

test("one-hand and two-hand gesture with the same path: an attempt whose second hand is seen too little is never answered with the one-hand concept by a silent drop", () => {
  const options = { maxDistance: new Map(), minMargin: 0.15 };
  const right = (t) => [100 + Math.min(Math.max(t - 400, 0), 1000) / 10, 100];
  // The left hand comes along and is seen for `share` of the right hand's second of movement (of 1.8 s in view).
  const two = (share) => capture(1800, 40, (t) => ({ right: right(t), left: share >= 1 || (t >= 400 && t <= 400 + share * 1000) ? [40 - Math.min(Math.max(t - 400, 0), 1000) / 25, 110] : null }));
  const examples = [
    { conceptId: "one", sequence: built(capture(1800, 40, (t) => ({ right: right(t) }))) },
    { conceptId: "two", sequence: built(two(1)) },
  ];
  const answer = (share) => {
    const result = buildFeatureSequence(two(share));
    return result.ok ? matchGesture(result.sequence, examples, options).conceptId ?? "unknown" : result.reason;
  };
  assert.equal(answer(1), "two");
  for (const share of [0.75, 0.45, 0.4]) assert.equal(answer(share), "hands_unclear", `seen for ${share}`);
  // Only a hand seen for under a fifth of the time and without a movement of its own is taken for a hand passing
  // through; then the attempt is the one-hand gesture.
  assert.equal(answer(0.1), "one");
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
  // A camera that delivers no frames for a while has lost the hand just the same: the limit is on time, not on frames without a hand.
  const stalled = (ms) => buildFeatureSequence(capture(2000, 50, (t) => ({ right: [100 + t / 20, 100] })).map((frame) => (frame.tMs > 600 ? { ...frame, tMs: frame.tMs + ms - 50 } : frame)));
  assert.equal(stalled(500).ok, true);
  assert.deepEqual(stalled(550), { ok: false, reason: "hand_lost" });
  assert.deepEqual(stalled(60000), { ok: false, reason: "hand_lost" });
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

test("a second hand that passes through for a moment changes nothing; one that moved on its own before the gesture is never left out", () => {
  const alone = built(capture(1500, 50, (t) => ({ right: [100 + t / 15, 100] })));
  const passing = built(capture(1500, 50, (t) => ({ right: [100 + t / 15, 100], left: t >= 500 && t <= 700 ? [20 + (t - 500) / 4, 60] : null })));
  assert.equal(passing.hands, "right");
  assert.deepEqual(passing, alone);
  // The right hand rests for a second while the left one crosses the picture for 350 ms, then makes the gesture. The
  // left hand's movement may be the first part of a two-hand gesture: no sequence.
  const before = (moving) => capture(2500, 50, (t) => ({
    right: [100 + Math.max(t - 1000, 0) / 15, 100],
    left: t >= 200 && t <= 550 ? [20 + (moving ? (t - 200) / 2 : 0), 60] : null,
  }));
  assert.deepEqual(buildFeatureSequence(before(true)), unclear);
  // A hand that only lay in view before the gesture, briefly, and left, is not part of it.
  const lay = built(before(false));
  assert.equal(lay.hands, "right");
  assert.ok(dtwDistance(lay, alone) < 0.03, `distance ${dtwDistance(lay, alone)}`);
});

test("shoulders seen only before the movement still anchor the gesture", () => {
  const frames = capture(2000, 50, (t) => ({ right: [100 + Math.max(t - 1000, 0) / 10, 100] }));
  const early = built(frames.map((frame) => (frame.tMs < 600 ? frame : { ...frame, shoulders: null })));
  assert.equal(early.anchor, "shoulders");
  assert.ok(dtwDistance(early, built(frames)) < 0.01);
  assert.equal(built(frames.map((frame) => ({ ...frame, shoulders: null }))).anchor, "hands");
});
