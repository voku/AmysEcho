/**
 * Public evaluation gate on synthetic gestures.
 *
 * It simulates one child profile: a caregiver records a few examples of each
 * gesture in two sessions, and the child uses them in two later sessions with a
 * different camera placement. The floors below are regression limits set under
 * the measured values. They are not product accuracy claims: synthetic gestures
 * are far easier than a real child's.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildFeatureSequence } from "../dist/recognition/features.js";
import { evaluateBySession } from "../dist/recognition/evaluate.js";
import { createGesture, createLookAlike, createSession, renderGesture } from "../dist/recognition/synthetic.js";

const GESTURES = 15;
const EXAMPLE_SESSIONS = ["teach-1", "teach-2"];
const TEST_SESSIONS = ["use-1", "use-2"];

function simulate(sloppiness, unknownKind) {
  const attempts = [];
  let seed = 1;
  const add = (gesture, conceptId, sessionId, placement) => {
    const result = buildFeatureSequence(renderGesture(gesture, { seed: seed += 1, session: placement, sloppiness }));
    assert.equal(result.ok, true);
    attempts.push({ conceptId, sessionId, sequence: result.sequence });
  };
  [...EXAMPLE_SESSIONS, ...TEST_SESSIONS].forEach((sessionId, index) => {
    const placement = createSession(100 + index);
    const teaching = EXAMPLE_SESSIONS.includes(sessionId);
    for (let g = 0; g < GESTURES; g += 1) {
      for (let repeat = 0; repeat < (teaching ? 3 : 5); repeat += 1) add(createGesture(g + 1), `concept-${g}`, sessionId, placement);
      if (!teaching) {
        for (let other = 0; other < 4; other += 1) {
          const unknown = unknownKind === "unrelated"
            ? createGesture(5000 + (seed += 1))
            : createLookAlike(createGesture(g + 1), seed += 1, unknownKind);
          add(unknown, null, sessionId, placement);
        }
      }
    }
  });
  return evaluateBySession(attempts, EXAMPLE_SESSIONS);
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;
const line = (name, report) => `${name}: top1 ${percent(report.top1)}, top3 ${percent(report.top3)}, `
  + `wrong concept ${percent(report.wrongAccept)}, known rejected ${percent(report.falseReject)}, `
  + `unknown rejected ${percent(report.unknownRecall)}, unknown accepted ${percent(report.falseAccept)} `
  + `(${report.examples} examples, ${report.knownAttempts} known and ${report.unknownAttempts} unknown attempts)`;

test("synthetic profile, sloppy repetitions, unrelated unknown movements", (t) => {
  const report = simulate(1.5, "unrelated");
  t.diagnostic(line("unrelated", report));
  assert.ok(report.top1 >= 0.95, line("unrelated", report));
  assert.ok(report.top3 >= 0.98, line("unrelated", report));
  assert.ok(report.wrongAccept <= 0.02, line("unrelated", report));
  assert.ok(report.falseAccept <= 0.05, line("unrelated", report));
});

test("synthetic profile, look-alikes with two fingers held differently are rejected", (t) => {
  const report = simulate(1.5, "other-fingers");
  t.diagnostic(line("other-fingers", report));
  assert.ok(report.top1 >= 0.95, line("other-fingers", report));
  assert.ok(report.unknownRecall >= 0.75, line("other-fingers", report));
});

test("synthetic profile, look-alikes that end elsewhere: known limit, measured and reported", (t) => {
  const report = simulate(1.5, "ends-elsewhere");
  t.diagnostic(line("ends-elsewhere", report));
  // Known limit (docs/recognition.md): most of these are accepted. No floor is
  // asserted on purpose; a floor here would only pin the weakness in place.
  assert.ok(report.top1 >= 0.95, line("ends-elsewhere", report));
  assert.ok(Number.isFinite(report.unknownRecall));
});

test("attempts are never scored against examples from their own session", () => {
  const sequence = buildFeatureSequence(renderGesture(createGesture(1), { seed: 1, session: createSession(1), sloppiness: 0 })).sequence;
  assert.throws(() => evaluateBySession([{ conceptId: "a", sessionId: "s", sequence }], ["s"]), RangeError);
  assert.throws(() => evaluateBySession([{ conceptId: "a", sessionId: "s", sequence }], []), RangeError);
  // An identical attempt in the example session would be a guaranteed hit if it were scored.
  const report = evaluateBySession([
    { conceptId: "a", sessionId: "teach", sequence },
    { conceptId: "a", sessionId: "teach", sequence },
    { conceptId: null, sessionId: "teach", sequence },
    { conceptId: "a", sessionId: "use", sequence },
  ], ["teach"]);
  assert.equal(report.examples, 2);
  assert.equal(report.knownAttempts, 1);
  assert.equal(report.unknownAttempts, 0);
});
