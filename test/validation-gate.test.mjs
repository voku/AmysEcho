import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runner = join(root, "scripts", "run-tests.mjs");
const cardsDirectory = join(root, ".agent-loop", "todo", "cards");

/** Runs the test runner on a directory holding the given files; returns its exit status. */
function runOn(files) {
  const directory = mkdtempSync(join(tmpdir(), "amys-echo-gate-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
    // A nested runner must not report into this test run.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [runner, directory], { env, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const passing = 'import { test } from "node:test"; test("ok", () => {});';

test("the test runner fails when it finds no test file", () => {
  const result = runOn({ "notes.txt": "nothing to run" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no \*\.test\.mjs file/);
});

test("the test runner fails when the directory does not exist", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [runner, join(tmpdir(), "amys-echo-gate-missing")], {
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot read/);
});

test("the test runner fails when the files hold no test or only skipped tests", () => {
  const none = runOn({ "empty.test.mjs": "export const nothing = 1;" });
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /no test passed/);

  const skipped = runOn({
    "skipped.test.mjs": 'import { test } from "node:test"; test("later", { skip: true }, () => {});',
  });
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stderr, /no test passed/);
});

test("the test runner passes with one passing test and fails with one failing test", () => {
  assert.equal(runOn({ "one.test.mjs": passing }).status, 0);

  const failing = runOn({
    "one.test.mjs": passing,
    "two.test.mjs": 'import { test } from "node:test"; test("bad", () => { throw new Error("no"); });',
  });
  assert.notEqual(failing.status, 0);
});

test("npm test uses the test runner", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  assert.equal(scripts.test, "node scripts/run-tests.mjs");
  assert.match(scripts.verify, /npm test/);
});

/** The Validation field of a board card, or null when the card has none. */
function validationField(cardText) {
  const match = /^- \*\*Validation:\*\*(.*)$/m.exec(cardText);
  return match === null ? null : match[1].trim();
}

/**
 * Why a card's validation is not acceptable, or null when it is. A card of
 * the `human` domain is work for a person and is validated by hand.
 */
function validationProblem(cardText) {
  const field = validationField(cardText);
  if (field === null) return null;
  if (/^- \*\*Domain:\*\* human$/m.test(cardText)) return null;
  const install = field.indexOf("npm ci --ignore-scripts");
  const verify = field.indexOf("npm run verify");
  if (verify === -1) return "does not name npm run verify";
  if (install === -1) return "does not name npm ci --ignore-scripts";
  if (install > verify) return "names npm run verify before npm ci --ignore-scripts";
  return null;
}

test("the card check accepts the two commands in order and names what is missing", () => {
  const card = (field, domain = "product") =>
    `# NG-0: Example\n\n- **Lane:** READY\n- **Domain:** ${domain}\n- **Validation:** ${field}\n`;
  assert.equal(validationProblem(card("npm ci --ignore-scripts && npm run verify")), null);
  assert.equal(validationProblem(card("npm ci --ignore-scripts && npm run verify && npm audit")), null);
  assert.equal(validationProblem("# NG-0: Example\n\n- **Lane:** HUMAN\n"), null);
  assert.equal(validationProblem(card("Manual protocol on the device", "human")), null);
  assert.match(validationProblem(card("Manual protocol on the device", "humane")), /npm run verify/);
  assert.match(validationProblem(card("npm test")), /npm run verify/);
  assert.match(validationProblem(card("")), /npm run verify/);
  assert.match(validationProblem(card("npm run verify")), /npm ci/);
  assert.match(validationProblem(card("npm run verify && npm ci --ignore-scripts")), /before/);
});

test("every board card with a Validation field names the validation commands", () => {
  const names = readdirSync(cardsDirectory).filter((name) => name.endsWith(".md"));
  assert.ok(names.length > 0, `no board card in ${cardsDirectory}`);
  const problems = [];
  let checked = 0;
  for (const name of names) {
    const text = readFileSync(join(cardsDirectory, name), "utf8");
    if (validationField(text) !== null && !/^- \*\*Domain:\*\* human$/m.test(text)) checked += 1;
    const problem = validationProblem(text);
    if (problem !== null) problems.push(`${name}: ${problem}`);
  }
  assert.ok(checked > 0, "no board card with a Validation field to run");
  assert.deepEqual(problems, []);
});
