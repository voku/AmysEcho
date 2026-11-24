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
import { REST_SPLIT_MS, SEGMENT_GAP_MS, SEGMENT_MAX_MS, segmentStream } from "../dist/recognition/segment.js";

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

test("limits are per concept and kind of sequence, and never wider than the limit of the whole concept", () => {
  // Sequences that are one constant apart in a single value are that far apart by DTW.
  const flat = (hands, value) => ({ schemaVersion: 2, anchor: "shoulders", hands, steps: Array.from({ length: SEQUENCE_STEPS }, () => Array.from({ length: STEP_VALUES }, (_, i) => (i === 0 ? value : 0))) });
  const bothKey = (conceptId) => limitKey(conceptId, { anchor: "shoulders", hands: "both" });
  // Two right-hand examples of "a" 1.2 apart would open its right-hand limit to the upper bound. Over the whole concept,
  // as the matcher of schema version 1 calibrates it, the two-hand example lies on the first one: the median nearest
  // distance is 0, so the concept's limit is the fallback, and so is the right-hand limit.
  const examples = [{ conceptId: "a", sequence: flat("right", 0) }, { conceptId: "a", sequence: flat("right", 1.2) }, { conceptId: "a", sequence: flat("both", 0) }];
  const limits = calibrateMaxDistance(examples);
  assert.deepEqual([...limits.entries()], [[rightKey("a"), FALLBACK_MAX_DISTANCE]]);
  const options = { maxDistance: limits, minMargin: 0.15 };
  // A right-hand attempt 1.0 from its nearest example is too far; a two-hand one 0.7 from the single two-hand example is not.
  assert.equal(matchGesture(flat("right", 2.2), examples, options).reason, "too_far");
  assert.equal(matchGesture(flat("both", 1), examples, options).reason, "too_far");
  assert.equal(matchGesture(flat("both", 0.7), examples, options).conceptId, "a");
  // Each kind's own examples can make it stricter than the whole concept: right-hand examples 1.0 apart give 1.25; the
  // whole concept (nearest distances 1.0, 1.0, 1.2, 1.2) gives 1.375, which also caps the two-hand limit of 1.5.
  const wider = calibrateMaxDistance([0, 1, 5, 6.2].map((value, i) => ({ conceptId: "b", sequence: flat(i < 2 ? "right" : "both", value) })));
  assert.equal(wider.get(rightKey("b")), 1.25);
  assert.equal(wider.get(bothKey("b")), 1.375);
  // Examples with another anchor are not compared, for the whole concept either: right-hand examples 1.2 apart, once
  // anchored to the shoulders and once to the hands, give each anchor the upper bound.
  const anchored = (anchor, value) => ({ conceptId: "c", sequence: { ...flat("right", value), anchor } });
  const twoAnchors = calibrateMaxDistance([anchored("shoulders", 0), anchored("shoulders", 1.2), anchored("hands", 0), anchored("hands", 1.2)]);
  assert.equal(twoAnchors.get(rightKey("c")), MAX_CALIBRATED_MAX_DISTANCE);
  assert.equal(twoAnchors.get(limitKey("c", { anchor: "hands", hands: "right" })), MAX_CALIBRATED_MAX_DISTANCE);
  // As in schema version 1, the median runs over all examples of the concept, whatever their anchor: three tidy
  // examples with shoulders and two loose ones without give the loose kind the fallback, not the upper bound.
  const mixed = calibrateMaxDistance([anchored("shoulders", 0), anchored("shoulders", 0.1), anchored("shoulders", 0.2), anchored("hands", 0), anchored("hands", 1.2)]);
  assert.equal(mixed.get(limitKey("c", { anchor: "hands", hands: "right" })), FALLBACK_MAX_DISTANCE);
  assert.equal(mixed.get(rightKey("c")), FALLBACK_MAX_DISTANCE);
  // The key tells concepts, anchors and hands apart.
  assert.notEqual(limitKey("a", { anchor: "shoulders", hands: "right" }), limitKey("a", { anchor: "hands", hands: "right" }));
  assert.notEqual(limitKey("a", { anchor: "shoulders", hands: "right" }), limitKey("b", { anchor: "shoulders", hands: "right" }));
  assert.notEqual(rightKey("a"), bothKey("a"));
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
  // A hand that belongs is missing (all zero) after its last sighting, as in schema version 1, never held where it was
  // last seen: a hand that came and went must not look like a hand held still.
  const present = (sequence) => sequence.steps.map((step) => step[STEP_VALUES / 2 - 1]);
  assert.deepEqual(present(above).slice(0, 15), new Array(15).fill(1));
  assert.deepEqual(present(above).slice(19), new Array(13).fill(0));
  assert.ok(above.steps.slice(19).every((step) => step.slice(0, STEP_VALUES / 2).every((value) => value === 0)));
  // A hand that joins late is missing before its first sighting.
  const late = built(capture(1000, 50, (t) => ({ right: [100 + t / 10, 100], left: t >= 500 ? [20 - t / 10, 100] : null })));
  assert.equal(late.hands, "both");
  assert.deepEqual(present(late).slice(0, 14), new Array(14).fill(0));
  assert.deepEqual(present(late).slice(18), new Array(14).fill(1));
  // The same the other way round.
  assert.equal(built(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100], right: t <= 150 ? [220 - t / 10, 100] : null }))).hands, "left");
  assert.deepEqual(buildFeatureSequence(capture(1000, 50, (t) => ({ left: [100 + t / 10, 100], right: t <= 450 ? [220 - t / 10, 100] : null }))), unclear);
  // Two hands that take turns, each seen for under half of the time: nobody's gesture.
  assert.deepEqual(buildFeatureSequence(capture(1000, 50, (t) => (t < 450 ? { left: [20, 100] } : t > 550 ? { right: [120, 100] } : {}))), unclear);
});

test("hand kind: a brief hand is dropped only when it is seen in one unbroken visit", () => {
  // The right hand travels for three seconds; the left hand lies still and is seen only at the times given.
  const answer = (stepMs, seenAt) => {
    const result = buildFeatureSequence(capture(3000, stepMs, (t) => ({ right: [100 + t / 30, 100], left: seenAt.includes(t) ? [20, 60] : null })));
    return result.ok ? result.sequence.hands : result.reason;
  };
  // Frames every 250 ms. Two sightings 500 ms apart, the bridging limit, are one visit; 750 ms apart, two visits.
  assert.equal(answer(250, [1000, 1500]), "right");
  assert.equal(answer(250, [1000, 1750]), "hands_unclear");
  // Frames every 50 ms. Seen in at least half of the frames from its first to its last sighting, it is one visit; in
  // scattered frames, it is not.
  assert.equal(answer(50, [500, 550, 650]), "right");
  assert.equal(answer(50, [500, 650]), "right", "two of four frames: exactly half");
  assert.equal(answer(50, [500, 700]), "hands_unclear", "two of five frames");
  assert.equal(answer(50, [500, 650, 800]), "hands_unclear");
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

test("nothing is trimmed: the gesture is the whole time its hands are in view, rest, jitter and wrong frames included", () => {
  const x = (sequence, step) => sequence.steps[step][STEP_VALUES - 3];
  const random = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const noise = random(7);
  // A hand that rests for a second, travels and rests again: the first and last step are the frames at either end.
  const frames = capture(3000, 50, (t) => ({ right: [100 + Math.min(Math.max(t - 1000, 0), 1000) / 10 + noise() * 4, 100 + noise() * 4] }));
  const rested = built(frames);
  assert.ok(Math.abs(x(rested, 0) - (frames[0].right[0][0] - 100) / 100) < 1e-9, "the first step is the first frame");
  assert.ok(Math.abs(x(rested, 31) - (frames.at(-1).right[0][0] - 100) / 100) < 1e-9, "the last step is the last frame");
  // Frames before the first and after the last sighting of a hand are not part of it, and neither is a hand that is dropped.
  const framed = [{ ...frames[0], tMs: -100, right: null }, ...frames, { ...frames[0], tMs: 3100, right: null, left: hand(20, 60) }];
  assert.deepEqual(built(framed), rested);
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

test("movement: slower than the rest speed, shorter than the minimum or not far enough is no movement of its own", () => {
  assert.deepEqual([REST_SPEED, MIN_GESTURE_MS, MOVEMENT_GAP_MS, MIN_TRAVEL], [0.25, 300, 200, 0.1]);
  // The right hand is the only hand that belongs; a second hand is seen for a moment, so the right hand needs a movement
  // of its own. It travels from 1 s on, for `ms` at `speed` shoulder widths per second, or swings to and fro.
  const answer = (right) => {
    const result = buildFeatureSequence(capture(4000, 50, (t) => ({ right: right(t), left: t >= 3000 && t <= 3100 ? [20, 60] : null })));
    return result.ok ? result.sequence.hands : result.reason;
  };
  const travel = (speed, ms) => (t) => [100 + Math.min(Math.max(t - 1000, 0), ms) * speed / 10, 100];
  assert.equal(answer(travel(0.3, 1000)), "right");
  assert.equal(answer(travel(0.2, 1000)), "hands_unclear", "slower than the rest speed");
  assert.equal(answer(travel(1, 200)), "hands_unclear", "shorter than the minimum");
  // A pause of 150 ms inside a movement is part of it: two pieces of 200 ms make one movement.
  assert.equal(answer((t) => [100 + (Math.min(Math.max(t - 1000, 0), 200) + Math.min(Math.max(t - 1350, 0), 200)) / 10, 100]), "right");
  // Fast but getting only 5 hundredths of a shoulder width from where it started is jitter; 15 hundredths is a movement.
  const swings = (units, periodMs) => (t) => [120 + (t >= 1000 && t <= 2000 ? Math.sin((2 * Math.PI * (t - 1000)) / periodMs) * units : 0), 100];
  assert.equal(answer(swings(5, 400)), "hands_unclear");
  assert.equal(answer(swings(15, 500)), "right");
  // Fingers that close in place are no movement: the palm stays, although the mean of all 21 points travels 0.14
  // shoulder widths in 0.4 s.
  const closing = (t) => Array.from({ length: 21 }, (_, i) => {
    const bend = [0, 1, 5, 9, 13, 17].includes(i) ? 0 : Math.min(Math.max((t - 1000) / 400, 0), 1) * 20;
    return [120 + (i % 5) * 2, 100 - Math.floor(i / 5) * 5 + bend];
  });
  const shape = Array.from({ length: 81 }, (_, i) => ({ tMs: i * 50, left: i * 50 >= 3000 && i * 50 <= 3100 ? hand(20, 60) : null, right: closing(i * 50), shoulders: SHOULDERS }));
  assert.deepEqual(buildFeatureSequence(shape), unclear);
});

test("time: a low frame rate gives the same gesture; the steps are spaced evenly in frame order, as in schema version 1", () => {
  const path = (t) => ({ right: [100 + (t / 1500) ** 2 * 150, 100 + t / 30] });
  const steady = built(capture(1500, 33, path));
  const slowCamera = built(capture(1500, 140, path));
  assert.ok(dtwDistance(steady, slowCamera) < 0.05, `7 fps: ${dtwDistance(steady, slowCamera)}`);
  // A capture whose second half has four times the frames of the first: in frame order its middle comes late.
  const lopsided = [];
  for (let t = 0; t <= 1500; t += t < 750 ? 120 : 30) lopsided.push({ tMs: t, left: null, right: hand(100 + (t / 1500) ** 2 * 150, 100 + t / 30), shoulders: SHOULDERS });
  const y = (sequence, step) => sequence.steps[step][STEP_VALUES - 2];
  assert.ok(y(built(lopsided), 16) - y(steady, 16) > 0.03, `${y(built(lopsided), 16)} against ${y(steady, 16)}`);
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
  assert.deepEqual(lay, built(before(false).map((frame) => ({ ...frame, left: null }))));
});

test("shoulders seen only before the movement still anchor the gesture", () => {
  const frames = capture(2000, 50, (t) => ({ right: [100 + Math.max(t - 1000, 0) / 10, 100] }));
  const early = built(frames.map((frame) => (frame.tMs < 600 ? frame : { ...frame, shoulders: null })));
  assert.equal(early.anchor, "shoulders");
  assert.ok(dtwDistance(early, built(frames)) < 0.01);
  assert.equal(built(frames.map((frame) => ({ ...frame, shoulders: null }))).anchor, "hands");
});

// --- Cutting a continuous stream into gestures (card NG-53) ---


const STREAM_SHOULDERS = [[-50, 0], [50, 0]];
/** A made-up hand of 21 points around a wrist at (x, y), in pixels; shoulders are 100 px apart. */
const streamHand = (x, y) => Array.from({ length: 21 }, (_, index) => [x + (index % 5) * 3, y - Math.floor(index / 5) * 6]);
/** Frames every 40 ms from `fromMs` to `toMs`, the right hand at `place(tMs)` or out of view (null). */
const streamFrames = (fromMs, toMs, place) => {
  const frames = [];
  for (let tMs = fromMs; tMs <= toMs; tMs += 40) {
    const at = place(tMs);
    frames.push({ tMs, left: null, right: at === null ? null : streamHand(at[0], at[1]), shoulders: STREAM_SHOULDERS });
  }
  return frames;
};
/** A hand moving 100 px in a second from (0, 0), then out of view. */
const sweep = (fromMs) => (tMs) => (tMs < fromMs || tMs > fromMs + 1000 ? null : [(tMs - fromMs) / 10, 0]);
const spanOf = (segment) => [segment[0].tMs, segment[segment.length - 1].tMs];

test("segments: the hands out of view longer than the gap end a gesture; a shorter loss, which the builder bridges, never does", () => {
  assert.equal(SEGMENT_GAP_MS, MAX_BRIDGED_GAP_MS + 200);
  const first = sweep(0);
  const second = sweep(1000 + SEGMENT_GAP_MS + 100);
  const frames = streamFrames(0, 4000, (tMs) => first(tMs) ?? second(tMs));
  for (const mode of ["away", "rest"]) {
    const cut = segmentStream(frames, mode);
    assert.deepEqual(cut.segments.map(spanOf), [[0, 1000], [1800, 2800]], mode);
    assert.equal(cut.open, null);
  }
  // The hand lost for the longest gap the builder bridges, in the middle of one gesture: one segment.
  const lost = streamFrames(0, 3000, (tMs) => (tMs > 400 && tMs < 400 + MAX_BRIDGED_GAP_MS ? null : tMs <= 1500 ? [tMs / 10, 0] : null));
  assert.deepEqual(segmentStream(lost, "away").segments.map(spanOf), [[0, 1480]]);
});

test("segments: a gesture the stream may still be in is open, not finished; an empty stream has nothing", () => {
  const frames = streamFrames(0, 1200, sweep(0));
  assert.deepEqual(segmentStream(frames, "away").segments, [], "less than the gap since the hand was last seen");
  assert.deepEqual(spanOf(segmentStream(frames, "away").open), [0, 1000]);
  const later = segmentStream(frames, "away", 1000 + SEGMENT_GAP_MS + 1);
  assert.deepEqual(later.segments.map(spanOf), [[0, 1000]], "finished once the gap has passed");
  assert.equal(later.open, null);
  assert.deepEqual(segmentStream([], "away"), { segments: [], tooLong: 0, open: null });
  assert.deepEqual(segmentStream(streamFrames(0, 2000, () => null), "rest"), { segments: [], tooLong: 0, open: null });
});

test("segments: 'rest' also cuts in the middle of a rest in view after a movement; a rest alone, or a still hand, is not cut", () => {
  // Moves for a second, rests 1.6 s, moves back for a second, then leaves.
  const place = (tMs) => (tMs <= 1000 ? [tMs / 10, 0] : tMs <= 2600 ? [100, 0] : tMs <= 3600 ? [100 - (tMs - 2600) / 10, 0] : null);
  const frames = streamFrames(0, 6000, place);
  const rest = segmentStream(frames, "rest").segments.map(spanOf);
  assert.equal(rest.length, 2);
  // The cut is where the rest has lasted REST_SPLIT_MS, at the middle of that much rest: both parts keep some of it.
  // The hand stops at 1 s; the rest is measured from about 1.2 s (the speed looks back SPEED_SPAN_MS), so the cut lies
  // half of REST_SPLIT_MS later: never at the start of the rest, never past it.
  assert.ok(rest[0][1] >= 1000 + REST_SPLIT_MS / 2 && rest[0][1] < 1000 + REST_SPLIT_MS, `${rest[0]}`);
  assert.equal(rest[1][0], rest[0][1] + 40);
  assert.equal(rest[1][1], 3600);
  assert.deepEqual(segmentStream(frames, "away").segments.map(spanOf), [[0, 3600]], "'away' does not cut at a rest");
  // A hand held still in view, then gone: one segment, not cut (nothing moved before the rest).
  const still = streamFrames(0, 5000, (tMs) => (tMs <= 2500 ? [0, 0] : null));
  assert.deepEqual(segmentStream(still, "rest").segments.map(spanOf), [[0, 2480]]);
  // What is left after a cut and never moves again is no gesture.
  const tail = streamFrames(0, 6000, (tMs) => (tMs <= 1000 ? [tMs / 10, 0] : tMs <= 3500 ? [100, 0] : null));
  assert.equal(segmentStream(tail, "rest").segments.length, 1);
});

test("segments: a segment longer than SEGMENT_MAX_MS is dropped and counted, never compared", () => {
  const frames = streamFrames(0, SEGMENT_MAX_MS + 3000, (tMs) => (tMs <= SEGMENT_MAX_MS + 400 ? [(tMs / 10) % 100, 0] : null));
  const cut = segmentStream(frames, "away");
  assert.deepEqual(cut.segments, []);
  assert.equal(cut.tooLong, 1);
});
