import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const iconsDir = new URL("../public/icons/", import.meta.url);
const RECORD = "licences.json";

test("every bundled icon has a source and licence record, and every record names a bundled icon", async () => {
  const record = JSON.parse(await readFile(new URL(RECORD, iconsDir), "utf8"));
  assert.equal(record.version, 1);
  assert.ok(Array.isArray(record.files));
  const files = (await readdir(iconsDir)).filter((name) => name !== RECORD).sort();
  const listed = record.files.map((entry) => entry.file);
  assert.equal(new Set(listed).size, listed.length, "a file is listed twice");
  assert.deepEqual([...listed].sort(), files);
  for (const entry of record.files) {
    for (const field of ["what", "source", "licence"]) {
      assert.equal(typeof entry[field], "string", `${entry.file} has no ${field}`);
      assert.ok(entry[field].trim().length > 0, `${entry.file} has an empty ${field}`);
    }
  }
});

test("bundled icons are MIT until an owner decision on card NG-15 allows another licence", async () => {
  const record = JSON.parse(await readFile(new URL(RECORD, iconsDir), "utf8"));
  for (const entry of record.files) assert.equal(entry.licence, "MIT", `${entry.file}`);
  const docs = await readFile(new URL("../docs/assets.md", import.meta.url), "utf8");
  assert.match(docs, /No third-party symbol set is bundled/);
});
