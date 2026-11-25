// The password-protected backup file (card NG-58, src/profiles/backup-file.ts), with Node's own Web
// Crypto. Every profile here is synthetic; the clip is a few made-up bytes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_FILE_FORMAT, BackupFileError, MIN_BACKUP_ITERATIONS, backupFileName, decryptBackup, encryptBackup, isBackupPassword,
} from "../dist/profiles/backup-file.js";
import { exportProfile, importProfile } from "../dist/profiles/backup.js";
import { MemoryBackend } from "../dist/profiles/memory-backend.js";
import { ProfileStore } from "../dist/profiles/store.js";
import { setDemoClip } from "../dist/demo-clips.js";

const FAST = { iterations: MIN_BACKUP_ITERATIONS };
const CLIP = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYEC";
const PASSWORD = "Sonnenblume 42";

async function miaExport() {
  const store = await ProfileStore.open(new MemoryBackend());
  const mia = await store.create("Mia", ["trinken", "hilfe"]);
  await store.data(mia.id).set("concept.trinken", { version: 1, labelDe: "Trinken", speechDe: "Ich möchte trinken.", copied: true });
  await setDemoClip(store, mia.id, "trinken", CLIP);
  return { store, mia, document: await exportProfile(store, mia.id, { now: () => new Date("2026-11-25T12:00:00Z") }) };
}

test("backup file: the export is encrypted; nothing about the child can be read without the password", async () => {
  const { document } = await miaExport();
  const text = await encryptBackup(document, PASSWORD, FAST);
  const file = JSON.parse(text);
  assert.deepEqual(Object.keys(file).sort(), ["cipher", "data", "format", "kdf", "version"]);
  assert.equal(file.format, BACKUP_FILE_FORMAT);
  assert.equal(file.version, 1);
  assert.deepEqual({ ...file.kdf, salt: typeof file.kdf.salt }, { name: "PBKDF2", hash: "SHA-256", iterations: MIN_BACKUP_ITERATIONS, salt: "string" });
  assert.equal(file.cipher.name, "AES-GCM");
  // The readable part of the file (everything but the random ciphertext, where any short text can turn up by chance)
  // holds nothing of the child; the ciphertext is not the export itself.
  const readable = JSON.stringify({ ...file, data: "" });
  for (const secret of ["Mia", "Trinken", "trinken", "GkXfo59", "2026-11-25", "demo."]) assert.equal(readable.includes(secret), false, `"${secret}" is not readable in the file`);
  assert.equal(Buffer.from(file.data, "base64").toString("latin1").includes(JSON.stringify(document.profile)), false);
  // A new salt and IV each time: the same export never gives the same file.
  assert.notEqual(await encryptBackup(document, PASSWORD, FAST), text);
  assert.deepEqual(await decryptBackup(text, PASSWORD), document);
});

test("backup file: a wrong password, a changed file and other files are refused", async () => {
  const { document } = await miaExport();
  const text = await encryptBackup(document, PASSWORD, FAST);
  const refused = async (input, password, reason) => {
    await assert.rejects(decryptBackup(input, password), (error) => error instanceof BackupFileError && error.reason === reason, `${reason}: ${input.slice(0, 40)}`);
  };
  await refused(text, "sonnenblume 42", "password");
  await refused(text, "", "password");
  const file = JSON.parse(text);
  const flipped = Buffer.from(file.data, "base64");
  flipped[flipped.length - 20] ^= 1;
  await refused(JSON.stringify({ ...file, data: flipped.toString("base64") }), PASSWORD, "password");
  for (const changed of [
    "not json", "[]", "{}", JSON.stringify({ ...file, format: "amys-echo-profile" }), JSON.stringify({ ...file, version: 2 }),
    JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: 1000 } }), JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: 1e9 } }), JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: 3_000_000 } }),
    JSON.stringify({ ...file, kdf: { ...file.kdf, hash: "SHA-1" } }), JSON.stringify({ ...file, cipher: { name: "AES-CBC", iv: file.cipher.iv } }),
    JSON.stringify({ ...file, data: "***" }), JSON.stringify({ ...file, cipher: { ...file.cipher, iv: "AAAA" } }),
    // A plain, unencrypted profile export is no backup file.
    JSON.stringify(document),
  ]) await refused(changed, PASSWORD, "format");
  // An encrypted content that is not a readable export.
  const broken = await encryptBackup({ ...document, format: "something-else" }, PASSWORD, FAST);
  await refused(broken, PASSWORD, "format");
});

test("backup file: passwords of at least 8 characters, counted as characters; the file name names no child", async () => {
  assert.equal(isBackupPassword("1234567"), false);
  assert.equal(isBackupPassword("12345678"), true);
  assert.equal(isBackupPassword("🌻🌻🌻🌻🌻🌻🌻🌻"), true, "eight characters, sixteen UTF-16 units");
  assert.equal(isBackupPassword(null), false);
  const { document } = await miaExport();
  await assert.rejects(encryptBackup(document, "kurz", FAST), RangeError);
  await assert.rejects(encryptBackup(document, PASSWORD, { iterations: 10 }), RangeError);
  // NFC: the same password typed as composed or decomposed characters opens the file.
  const text = await encryptBackup(document, "Bärenstark!", FAST);
  assert.deepEqual(await decryptBackup(text, "Bärenstark!"), document);
  assert.equal(backupFileName(new Date(2026, 10, 25, 23, 59)), "amys-echo-sicherung-2026-11-25.amysecho", "the local day, also just before midnight");
  assert.equal(backupFileName(new Date(Number.NaN)), "amys-echo-sicherung.amysecho");
});

test("backup file: a profile with its demo clip moves to another device", async () => {
  const { document } = await miaExport();
  const text = await encryptBackup(document, PASSWORD, FAST);
  const elsewhere = await ProfileStore.open(new MemoryBackend());
  const restored = await importProfile(elsewhere, await decryptBackup(text, PASSWORD));
  assert.equal(restored.displayName, "Mia");
  assert.deepEqual(await elsewhere.data(restored.id).get("demo.trinken"), { version: 1, dataUrl: CLIP });
});
