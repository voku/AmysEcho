import assert from "node:assert/strict";
import test from "node:test";
import { HAND_CONNECTIONS, PREVIEW_COLOURS } from "../dist/capture/capture.js";
import { SEQUENCE_STEPS, buildFeatureSequence } from "../dist/recognition/features.js";
import { createGesture, createLookAlike, createSession, renderGesture } from "../dist/recognition/synthetic.js";
import { exampleFit } from "../dist/teach/fit.js";
import { REPLAY_COLOURS, REPLAY_CONNECTIONS, REPLAY_HAND_SIZE, replayBox, replaySteps, replayStepMs } from "../dist/teach/replay.js";

// All data here is synthetic: generated gestures, no recording of a person (card NG-4).

const session = createSession(100);
/** One attempt of a generated gesture as a feature sequence. */
function attempt(gesture, seed, sloppiness = 0.3, disturbance = { restBeforeMs: 200, restAfterMs: 200 }) {
  const result = buildFeatureSequence(renderGesture(gesture, { seed, session, sloppiness, disturbance }));
  assert.equal(result.ok, true, result.reason);
  return result.sequence;
}
const examplesOf = (conceptId, gesture, seeds) => seeds.map((seed) => ({ conceptId, sequence: attempt(gesture, seed) }));

// --- How a new recording fits (src/teach/fit.ts) ---

test("fit: a repetition of the concept's own gesture fits; the first example of a concept is 'first'", () => {
  const trinken = createGesture(11, "right");
  const mehr = createGesture(12, "right");
  const examples = [...examplesOf("trinken", trinken, [1, 2, 3]), ...examplesOf("mehr", mehr, [4, 5, 6])];
  assert.deepEqual(exampleFit(attempt(trinken, 40), "trinken", examples), { kind: "fits" });
  const pause = createGesture(13, "right");
  assert.equal(exampleFit(attempt(pause, 41), "pause", examples).kind, "first");
  assert.equal(exampleFit(attempt(pause, 41), "pause", []).kind, "first");
});

test("fit: another concept's gesture recorded by mistake 'resembles' that concept", () => {
  const trinken = createGesture(21, "right");
  const mehr = createGesture(22, "right");
  const examples = [...examplesOf("trinken", trinken, [1, 2, 3]), ...examplesOf("mehr", mehr, [4, 5, 6])];
  // The caregiver means "trinken" but makes the gesture of "mehr".
  assert.deepEqual(exampleFit(attempt(mehr, 42), "trinken", examples), { kind: "resembles", otherId: "mehr" });
  // Also as the first example of a new concept.
  assert.deepEqual(exampleFit(attempt(mehr, 43), "pause", examples), { kind: "resembles", otherId: "mehr" });
});

test("fit: a different gesture under a concept that no other concept takes 'differs' from the earlier examples", () => {
  const trinken = createGesture(31, "right");
  const examples = examplesOf("trinken", trinken, [1, 2, 3]);
  const unrelated = createGesture(32, "right");
  assert.equal(exampleFit(attempt(unrelated, 44), "trinken", examples).kind, "differs");
  // A look-alike is judged by the matcher's own limits, which this card does not change: whatever the
  // matcher answers for it, the advice says the same (here it ends elsewhere and still counts as fitting).
  const lookAlike = attempt(createLookAlike(trinken, 45, "ends-elsewhere"), 46);
  assert.equal(exampleFit(lookAlike, "trinken", examples).kind, "fits");
});

test("fit: one-hand and two-hand gestures are treated alike, and examples made with other hands are named", () => {
  const both = createGesture(51, "both");
  const bothExamples = examplesOf("ball", both, [1, 2, 3]);
  assert.deepEqual(exampleFit(attempt(both, 47), "ball", bothExamples), { kind: "fits" });
  const right = createGesture(52, "right");
  assert.deepEqual(exampleFit(attempt(right, 48), "ball", bothExamples), { kind: "other-hands", hands: "both" });
  const left = createGesture(53, "left");
  const leftExamples = examplesOf("winken", left, [4, 5, 6]);
  assert.deepEqual(exampleFit(attempt(left, 49), "winken", leftExamples), { kind: "fits" });
});

test("fit: examples recorded with the shoulders seen are not compared with one recorded without them", () => {
  const gesture = createGesture(61, "right");
  const examples = examplesOf("hilfe", gesture, [1, 2]);
  const withoutShoulders = { ...attempt(gesture, 50), anchor: "hands" };
  assert.deepEqual(exampleFit(withoutShoulders, "hilfe", examples), { kind: "other-anchor" });
});

test("fit: accepted by its own examples but closer to another concept's, the recording 'resembles' that one, never 'differs'", () => {
  // Hand-made sequences that stay at one point, so each distance is the distance of the points.
  const at = (x, y) => ({ schemaVersion: 2, anchor: "shoulders", hands: "right", steps: Array.from({ length: SEQUENCE_STEPS }, () => { const step = new Array(86).fill(0); step[0] = x; step[1] = y; return step; }) });
  // Own examples 1.0 apart (limit 1.25), another concept's single example (limit 0.75).
  const examples = [{ conceptId: "own", sequence: at(0, 0) }, { conceptId: "own", sequence: at(1, 0) }, { conceptId: "oth", sequence: at(1.5, 1) }];
  // 1.005 from "oth" (beyond its 0.75), 1.03 from both own examples (within 1.25): the matcher says too_far for "oth".
  assert.deepEqual(exampleFit(at(0.5, 0.9), "own", examples), { kind: "resembles", otherId: "oth" });
  // Far from everything and closest to its own examples: "differs".
  assert.deepEqual(exampleFit(at(0.5, -2), "own", examples), { kind: "differs" });
  // Far from everything, closest to "oth": its own examples do not accept it either, so it "differs".
  assert.deepEqual(exampleFit(at(3, 3), "own", examples), { kind: "differs" });
  // A first example far from everything is not said to resemble anything.
  assert.deepEqual(exampleFit(at(3, 3), "neu", examples), { kind: "first" });
});

// --- The replay (src/teach/replay.ts) ---

test("replay: bones and colours are those of the camera preview", () => {
  assert.deepEqual(REPLAY_CONNECTIONS, HAND_CONNECTIONS);
  assert.deepEqual(REPLAY_COLOURS, PREVIEW_COLOURS);
});

test("replay: every step gives back 21 points per hand in view, the hand drawn at a fixed size, mirrored like the front camera", () => {
  for (const hands of ["right", "left", "both"]) {
    const sequence = attempt(createGesture(71, hands), 60);
    const steps = replaySteps(sequence);
    assert.equal(steps.length, SEQUENCE_STEPS);
    const sides = new Set(steps.flatMap((step) => step.hands.map((hand) => hand.side)));
    assert.deepEqual([...sides].sort(), hands === "both" ? ["left", "right"] : [hands]);
    for (const step of steps) {
      for (const hand of step.hands) {
        assert.equal(hand.points.length, 21);
        for (const point of hand.points) assert.ok(point.every(Number.isFinite));
        // Wrist to middle-finger base is the hand size the features divide by: this checks the weight is undone
        // (steps between frames are interpolated, so it is within a percent; a wrong weight is off by a factor of 4.5).
        const [wrist, base] = [hand.points[0], hand.points[9]];
        assert.ok(Math.abs(Math.hypot(base[0] - wrist[0], base[1] - wrist[1]) / REPLAY_HAND_SIZE - 1) < 0.01);
      }
    }
    // Mirrored: the wrist x is the stored one with its sign flipped.
    const offset = hands === "left" || hands === "both" ? 0 : 43;
    const first = steps.find((step) => step.hands.length > 0);
    const at = steps.indexOf(first);
    assert.ok(Math.abs(first.hands[0].points[0][0] + sequence.steps[at][offset + 40]) < 1e-9);
  }
});

test("replay: a hand that is not in view in a step is left out of that step", () => {
  const sequence = attempt(createGesture(81, "both"), 61);
  const steps = sequence.steps.map((step, at) => (at < 5 ? step.map((value, index) => (index < 43 ? 0 : value)) : step));
  const replay = replaySteps({ steps });
  assert.deepEqual(replay.slice(0, 5).map((step) => step.hands.map((hand) => hand.side)), Array(5).fill(["right"]));
  assert.equal(replay[10].hands.length, 2);
  assert.deepEqual(replaySteps({ steps: [new Array(86).fill(0)] }), [{ hands: [] }]);
});

test("replay: the box keeps every point of the whole movement inside the canvas; the step time follows the recording", () => {
  const steps = replaySteps(attempt(createGesture(91, "both"), 62));
  const box = replayBox(steps, 240, 180);
  for (const step of steps) {
    for (const hand of step.hands) {
      for (const point of hand.points) {
        const [x, y] = box.place(point);
        assert.ok(x >= 11.999 && x <= 228.001 && y >= 11.999 && y <= 168.001, `${x} ${y}`);
      }
    }
  }
  const empty = replayBox([], 100, 100);
  assert.deepEqual(empty.place([0, 0]), [50, 50]);
  assert.equal(replayStepMs(3200), 100);
  assert.equal(replayStepMs(100), 40);
  assert.equal(replayStepMs(60000), 250);
  assert.equal(replayStepMs(Number.NaN), 100);
});
