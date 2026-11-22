// Runs every test/*.test.mjs file and fails when no test ran.
// `node --test <glob>` exits 0 when the glob matches nothing, so a renamed
// directory or a broken build step could pass the gate without testing anything.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";

const directory = resolve(process.argv[2] ?? "test");

let files;
try {
  files = readdirSync(directory)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(directory, name));
} catch (error) {
  console.error(`run-tests: cannot read ${directory}: ${error.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`run-tests: no *.test.mjs file in ${directory}`);
  process.exit(1);
}

const fileSet = new Set(files);
let passed = 0;
let failed = 0;

// Some Node versions report each file as a test of its own; those do not count.
const isRealTest = (data) => data.details?.type !== "suite" && !fileSet.has(data.name);

const stream = run({ files, concurrency: true });
stream.on("test:pass", (data) => {
  if (isRealTest(data) && data.skip === undefined && data.todo === undefined) passed += 1;
});
stream.on("test:fail", () => {
  failed += 1;
});
stream.compose(spec).pipe(process.stdout);

stream.on("end", () => {
  if (failed > 0) {
    process.exitCode = 1;
    return;
  }
  if (passed === 0) {
    console.error(`run-tests: ${files.length} test file(s), but no test passed`);
    process.exitCode = 1;
  }
});
