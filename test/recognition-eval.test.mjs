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
import { evaluateBySession, simulateProfile } from "../dist/recognition/evaluate.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";

const GESTURES = 15;
/** The profile of the first cards: right-hand gestures, some with the left hand as well; examples recorded without a rest. */
const simulate = (sloppiness, unknownKind) => simulateProfile({ hands: "default", gestures: GESTURES, sloppiness, unknownKind, examples: {} });

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
  assert.ok(report.unknownRecall >= 0.9, line("other-fingers", report));
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

// --- One hand, two hands and what a real capture adds (card NG-18) ---

const CONDITIONS = [
  ["no disturbance", {}],
  ["second hand passes for 100 ms", { strayHandMs: 100 }],
  ["second hand passes for 250 ms", { strayHandMs: 250 }],
  ["second hand passes for 450 ms", { strayHandMs: 450 }],
  ["second hand passes for 700 ms", { strayHandMs: 700 }],
  ["other hand rests in view throughout", { otherHandRests: true }],
  ["a hand lost for 150 ms", { dropoutMs: 150 }],
  ["a hand lost for 300 ms", { dropoutMs: 300 }],
  ["a hand lost for 450 ms", { dropoutMs: 450 }],
  ["a hand lost for 600 ms", { dropoutMs: 600 }],
  ["hands rest 0.5 s before and after", { restBeforeMs: 500, restAfterMs: 500 }],
  ["hands rest 1 s before and after", { restBeforeMs: 1000, restAfterMs: 1000 }],
  ["hands rest 2 s before and after", { restBeforeMs: 2000, restAfterMs: 2000 }],
  ["15 frames per second", { frameMs: 67 }],
  ["7 frames per second", { frameMs: 143 }],
  ["7 to 15 frames per second, unsteady", { frameMs: 100, frameJitter: 0.45 }],
];
const PROFILES = ["right", "left", "both", "mixed"];

test("one-hand, two-hand and mixed profiles under the disturbances of a real capture: measured and reported", (t) => {
  const cell = (report) => `${percent(report.top1)} / ${percent(report.top3)} / ${percent(report.wrongAccept)} / ${percent(report.falseReject)}`;
  t.diagnostic(`per profile: top-1 / top-3 / spoken as a wrong concept / answered "unknown" (12 gestures, 72 examples, 120 attempts each)`);
  let worstWrong = 0;
  for (const [name, attempts] of CONDITIONS) {
    const reports = PROFILES.map((hands) => simulateProfile({ hands, gestures: 12, sloppiness: 1.5, unknownKind: "unrelated", attempts }));
    t.diagnostic(`${name}: ${PROFILES.map((hands, index) => `${hands} ${cell(reports[index])}`).join(" | ")}`);
    for (const [index, report] of reports.entries()) {
      worstWrong = Math.max(worstWrong, report.wrongAccept);
      // The number that matters most: whatever the disturbance, a known gesture is not spoken as another concept.
      assert.ok(report.wrongAccept <= 0.02, `${name}, ${PROFILES[index]}: ${line(name, report)}`);
      assert.ok(report.falseAccept <= 0.05, `${name}, ${PROFILES[index]}: ${line(name, report)}`);
      if (name === "no disturbance") assert.ok(report.top1 >= 0.95, `${PROFILES[index]}: ${line(name, report)}`);
    }
  }
  t.diagnostic(`worst "spoken as a wrong concept" over all rows: ${percent(worstWrong)}`);
});

test("a capture from which no sequence can be built counts as an 'unknown' answer, not as a hit or a miss left out", () => {
  const sequence = buildFeatureSequence(renderGesture(createGesture(1, "right"), { seed: 1, session: createSession(1), sloppiness: 0 })).sequence;
  const report = evaluateBySession([
    { conceptId: "a", sessionId: "teach", sequence },
    { conceptId: "a", sessionId: "teach", sequence: null },
    { conceptId: "a", sessionId: "use", sequence },
    { conceptId: "a", sessionId: "use", sequence: null },
    { conceptId: null, sessionId: "use", sequence: null },
  ], ["teach"]);
  assert.equal(report.examples, 1);
  assert.deepEqual([report.knownAttempts, report.top1, report.top3, report.falseReject, report.wrongAccept], [2, 0.5, 0.5, 0.5, 0]);
  assert.deepEqual([report.unknownAttempts, report.unknownRecall], [1, 1]);
});
