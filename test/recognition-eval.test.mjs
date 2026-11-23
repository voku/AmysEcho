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
import { Worker } from "node:worker_threads";
import { buildFeatureSequence } from "../dist/recognition/features.js";
import { evaluateBySession, simulateHandCases, simulateProfile, simulateProfileUnder } from "../dist/recognition/evaluate.js";
import { createGesture, createSession, renderGesture } from "../dist/recognition/synthetic.js";

/**
 * `EVAL_FULL=1 npm test` runs the profiles at the size of the tables in docs/recognition.md: 5 attempts and 4 unknown
 * movements per gesture in each of the two later sessions. Plain `npm test` runs the same rows with fewer attempts
 * (below), so that it stays fast; every row and every limit is the same.
 */
const FULL = process.env.EVAL_FULL === "1";
const FIRST_CARD_SIZE = FULL ? { attemptsPerGesture: 5, unknownsPerGesture: 4 } : { attemptsPerGesture: 2, unknownsPerGesture: 2 };
const CONDITION_SIZE = FULL ? { attemptsPerGesture: 5, unknownsPerGesture: 4 } : { attemptsPerGesture: 2, unknownsPerGesture: 1 };

/**
 * Unknown movements spoken as a concept by the matcher of schema version 1 (commit 70bf62b) on the same captures, at
 * either size (docs/recognition.md says how it was measured). An unknown movement spoken as a concept is as bad as a
 * wrong concept: the device may never do it more often than that matcher did.
 */
const OLD_UNKNOWN_ACCEPTED = FULL
  ? { unrelated: 1 / 120, "other-fingers": 3 / 120, "ends-elsewhere": 1 }
  : { unrelated: 0, "other-fingers": 3 / 60, "ends-elsewhere": 1 };
const noMoreThanOld = (kind, report) => assert.ok(report.falseAccept <= OLD_UNKNOWN_ACCEPTED[kind] + 1e-12, `${line(kind, report)}; schema version 1: ${percent(OLD_UNKNOWN_ACCEPTED[kind])}`);

const GESTURES = 15;
/** The profile of the first cards: right-hand gestures, some with the left hand as well; examples recorded without a rest. */
const simulate = (sloppiness, unknownKind) => simulateProfile({ hands: "default", gestures: GESTURES, sloppiness, unknownKind, examples: {}, ...FIRST_CARD_SIZE });

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
  noMoreThanOld("unrelated", report);
});

test("synthetic profile, look-alikes with two fingers held differently are rejected", (t) => {
  const report = simulate(1.5, "other-fingers");
  t.diagnostic(line("other-fingers", report));
  assert.ok(report.top1 >= 0.95, line("other-fingers", report));
  assert.ok(report.unknownRecall >= 0.9, line("other-fingers", report));
  noMoreThanOld("other-fingers", report);
});

test("synthetic profile, look-alikes that end elsewhere: known limit, measured and reported", (t) => {
  const report = simulate(1.5, "ends-elsewhere");
  t.diagnostic(line("ends-elsewhere", report));
  // Known limit (docs/recognition.md): most of these are accepted. No floor is
  // asserted on purpose; a floor here would only pin the weakness in place.
  assert.ok(report.top1 >= 0.95, line("ends-elsewhere", report));
  assert.ok(Number.isFinite(report.unknownRecall));
  noMoreThanOld("ends-elsewhere", report);
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

/** Runs a function of `evaluate.js` in a worker thread, so that measurements run side by side. The result is the same as in this thread. */
const inWorker = (name, ...args) => new Promise((resolve, reject) => {
  const worker = new Worker(`
    const { parentPort, workerData } = require("node:worker_threads");
    import(workerData.module).then((module) => parentPort.postMessage(module[workerData.name](...workerData.args)));
  `, { eval: true, workerData: { module: new URL("../dist/recognition/evaluate.js", import.meta.url).href, name, args } });
  worker.once("message", resolve);
  worker.once("error", reject);
  worker.once("exit", (code) => reject(new Error(`worker stopped with code ${code}`)));
});
const simulateInWorker = (options, disturbances) => inWorker("simulateProfileUnder", options, disturbances);

test("profiles measured in a worker thread give the same reports as in this thread", async () => {
  const options = { hands: "mixed", gestures: 3, sloppiness: 1.5, unknownKind: "unrelated", attemptsPerGesture: 1, unknownsPerGesture: 1 };
  const disturbances = [{}, { strayHandMs: 450 }];
  assert.deepEqual(await simulateInWorker(options, disturbances), simulateProfileUnder(options, disturbances));
  assert.deepEqual((await Promise.all([inWorker("simulateHandCases", 0, 2), inWorker("simulateHandCases", 2, 1)])).flat(), simulateHandCases(0, 3));
});

test("one-hand, two-hand and mixed profiles under the disturbances of a real capture: measured and reported", async (t) => {
  const cell = (report) => `${percent(report.top1)} / ${percent(report.top3)} / ${percent(report.wrongAccept)} / ${percent(report.falseReject)} / ${percent(report.falseAccept)}`;
  // Each profile's examples are recorded and calibrated once and used for every row.
  const byProfile = await Promise.all(PROFILES.map((hands) => simulateInWorker({ hands, gestures: 12, sloppiness: 1.5, unknownKind: "unrelated", ...CONDITION_SIZE }, CONDITIONS.map(([, attempts]) => attempts))));
  const { examples, knownAttempts, unknownAttempts } = byProfile[0][0];
  t.diagnostic(`per profile: top-1 / top-3 / spoken as a wrong concept / answered "unknown" / unknown movements spoken as a concept `
    + `(12 gestures, ${examples} examples, ${knownAttempts} attempts and ${unknownAttempts} unknown movements each)`);
  let worstWrong = 0;
  for (const [row, [name]] of CONDITIONS.entries()) {
    const reports = byProfile.map((reportsOfProfile) => reportsOfProfile[row]);
    t.diagnostic(`${name}: ${PROFILES.map((hands, index) => `${hands} ${cell(reports[index])}`).join(" | ")}`);
    for (const [index, report] of reports.entries()) {
      worstWrong = Math.max(worstWrong, report.wrongAccept);
      // The numbers that matter most: whatever the disturbance, a known gesture is not spoken as another concept and an
      // unknown movement is not spoken as a concept. The matcher of schema version 1 did neither in any cell, at either size.
      assert.equal(report.wrongAccept, 0, `${name}, ${PROFILES[index]}: ${line(name, report)}`);
      assert.equal(report.falseAccept, 0, `${name}, ${PROFILES[index]}: ${line(name, report)}`);
      if (name === "no disturbance") assert.ok(report.top1 >= 0.95, `${PROFILES[index]}: ${line(name, report)}`);
    }
  }
  t.diagnostic(`worst "spoken as a wrong concept" over all rows: ${percent(worstWrong)}`);
});

test("the hand that does not sign is in view, fidgets, trembles or belongs to somebody else: measured and reported", async (t) => {
  // In two halves side by side; each case has its own seeds, so the halves are the cases of one run.
  const cases = (await Promise.all([inWorker("simulateHandCases", 0, 50), inWorker("simulateHandCases", 50)])).flat();
  t.diagnostic("per case: top-1 / spoken as a wrong concept / answered \"unknown\"; for attempts that are no sign: spoken as a concept");
  for (const { name, report } of cases) {
    t.diagnostic(report.knownAttempts > 0
      ? `${name}: ${percent(report.top1)} / ${percent(report.wrongAccept)} / ${percent(report.falseReject)} (${report.examples} examples, ${report.knownAttempts} attempts)`
      : `${name}: spoken as a concept ${percent(report.falseAccept)} (${report.examples} examples, ${report.unknownAttempts} attempts)`);
  }
  assert.equal(cases.length, 99);
  // A second hand seen for under a fifth of the time a hand is in view, without a movement of its own, is taken for a
  // hand passing through, by the rule (docs/recognition.md). These rows are measured and reported (the matcher of
  // schema version 1 speaks the wrong concept in them as well); a limit here would only pin the weakness in place.
  const byRule = (name) => /second hand seen for (30|20|10)% of the movement/.test(name);
  assert.equal(cases.filter(({ name }) => byRule(name)).length, 3);
  for (const { name, report } of cases) {
    if (byRule(name)) continue;
    // Everywhere else the answer may be "unknown", never another concept.
    if (report.knownAttempts > 0) assert.equal(report.wrongAccept, 0, name);
    else assert.equal(report.falseAccept, 0, name);
  }
  const top1 = (part) => cases.find(({ name }) => name.includes(part)).report.top1;
  // Where the attempt shows the hands the examples showed, the sign is still recognised.
  for (const part of ["the lap hand fidgeted in one of three", "fidgets after the sign", "one hand held still, and a one-hand sign", "differ only in the shape", "both hands tremble", "second hand seen throughout"]) {
    assert.ok(top1(part) >= 0.95, `${part}: ${percent(top1(part))}`);
  }
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
