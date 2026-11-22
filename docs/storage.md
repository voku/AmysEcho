# Local storage: profiles, export, restore, delete

Card NG-2. Library code in `src/profiles/`; no user interface and not yet wired into the app.
Product rules: `docs/s0a-product-contract-v0.1.md`, sections 3 and 6.

## Verification status

- The profile logic (`profile.ts`, `store.ts`, `backup.ts`) is tested in Node against the in-memory
  backend (`test/profiles.test.mjs`, `test/profiles-backup.test.mjs`).
- **The IndexedDB adapter (`indexeddb-backend.ts`) has no automated test.** Node has no IndexedDB, so
  the file is only type-checked. Card NG-14 adds a real-browser test. Until then nothing here shows
  that data survives in a real browser, and the adapter must be treated as unverified.

## Layers

| File | Role |
| --- | --- |
| `backend.ts` | `KeyValueBackend`: `get`, `keys(prefix)`, atomic `write({ set, delete })`. Values are JSON values and are copied on the way in and out. |
| `memory-backend.ts` | In-memory backend for tests, with a failure hook (`failWrite`). |
| `indexeddb-backend.ts` | Browser backend: one object store, one readwrite transaction per `write`. |
| `profile.ts` | `ProfileV1`, id generation, strict `parseProfile`. |
| `store.ts` | `ProfileStore`: the key layout and every profile operation. |
| `backup.ts` | `exportProfile`, `importProfile`. |

## Key layout

```
app/schema                  1 (layout version, written on first use)
app/active-profile          id of the profile in use
profile/<id>/meta           the ProfileV1 record
profile/<id>/usage          { names, bytes }: how much data the profile holds
profile/<id>/data/<name>    data owned by that profile
```

- `<id>` is 16 random bytes from `crypto.getRandomValues` as 32 lowercase hex characters. It contains
  no timestamp and nothing derived from the name.
- `<name>` matches `[a-z0-9][a-z0-9._-]{0,63}`. Ids and names are checked before a key is built and
  cannot contain `/`, so one profile's accessor cannot address another profile's keys. Data lives
  below `data/` only, so a data entry named `usage` or `meta` does not touch those records.
- `ProfileStore.open` refuses to work (`StorageSchemaError`) when `app/schema` is anything other
  than `1`, or when data exists without a marker. It writes nothing in that case.

## What a profile owns

```ts
interface ProfileV1 {
  version: 1;
  id: string;            // opaque, random
  displayName: string;   // 1-40 characters, chosen by a caregiver; may be a nickname
  conceptIds: string[];  // unique concept ids for this child's board
}
```

`displayName` is the only personal text. It lives inside `profile/<id>/meta` and nowhere else: not in
keys, not in ids. It is stored in Unicode NFC form and trimmed, and the 1-40 character limit applies
to that form. A stored or imported name that is valid but not in NFC form (the first version of this
module stored names as typed) is read as its NFC form; the stored record is left as it is until the
next change to the profile writes it again. Surrounding whitespace in a stored name is rejected.
NFC can also make a name longer (a few characters have a longer normal form); a stored name that
exceeds 40 characters once normalised reads as `unreadable`.

The character rules below are stricter than in the first version of this module and are not
backwards compatible: a record whose name contains a now-forbidden format character is listed as
damaged (`unreadable`). Nothing in the app stores profiles yet, so no such record exists.

Characters in a name:

- Control characters and line or paragraph separators are rejected.
- Invisible format characters (Unicode category Cf) are rejected, because they can reorder or hide
  text so that a name looks different from what is stored: bidirectional marks, embeddings,
  overrides and isolates (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069), zero-width space, byte
  order mark, soft hyphen, tag characters (U+E0000-U+E007F) and the rest of that category.
- Two of them are allowed, because correct spellings need them: the zero-width non-joiner (U+200C,
  as in Persian names) and the zero-width joiner (U+200D, as in Sinhala and Bengali names). Each
  must stand directly between two characters that are neither whitespace nor format characters. At
  the start or end of a name, doubled, or next to a space they are rejected.
- Consequences for emoji: a single emoji works, emoji joined with a zero-width joiner (a family, for
  example) work, flags made of two regional-indicator letters (the German flag) work. The flags of
  England, Scotland and Wales are built from tag characters and are rejected.
- Arabic, Hebrew and other right-to-left names need none of the rejected characters and work.

Everything else a profile owns is stored through `store.data(id)` under `profile/<id>/data/`. Each
value must be plain JSON, nested at most 64 levels. Rejected, never altered: `undefined`, `NaN`,
infinite numbers, `Date`, `Map`, typed arrays, class instances, objects with getters or setters,
non-enumerable properties or symbol keys, and arrays with holes or extra properties. The one
alteration is that negative zero is stored as zero. The same per-value rules and the same size
limits (see "Size limits and usage") apply in `set`, in import and in restore, so anything `set`
accepted can be exported and restored unchanged.

`list()` returns `{ profiles, damaged }`. A stored record that cannot be read is listed under
`damaged` and is never dropped silently. Each damaged entry has the `id` segment of its key, a
free-text `reason`, and a `kind`:

- `"unsupported-version"`: the stored record is an object whose `version` is a number greater than
  1. A newer version of the app wrote it. The record and its data are most likely intact; this app
  version just cannot read them.
- `"unreadable"`: everything else (unknown fields, missing record, id mismatch, malformed key, a
  stored name that is invalid or has surrounding whitespace).

What a user interface must do with this (card NG-13):

- "Damaged" does not mean "broken". For `unsupported-version`, do not offer deletion; tell the carer
  to update the app.
- Removing a damaged entry deletes its record and all of its data and cannot be undone. There is no
  export of a damaged entry. `removeDamaged` does not look at `kind`; the caller decides.
- `getActive()` returns `null` while the active profile's record is unreadable, and the damage is
  reported by `list()` only. `getActive() === null` together with a non-empty `damaged` list must
  not lead into a "create a profile" flow, as if the device were new. Show the damaged entries.

Removing damaged entries:

- A damaged profile with a well-formed id can be removed with `remove(id)`.
- Any damaged entry, including one whose key has a malformed id segment (`profile/ab/meta`,
  `profile//x`), can be removed with `removeDamaged(segment)`, where `segment` is exactly the `id`
  that `list()` reported. It deletes only `profile/<segment>` and keys below `profile/<segment>/`,
  refuses a segment containing `/`, and refuses a profile that is readable (`NotDamagedError`).

## Export format

```json
{
  "format": "amys-echo-profile",
  "version": 1,
  "exportedAt": "2026-03-04T05:06:07.089Z",
  "profile": {
    "version": 1,
    "id": "3f9c0a1b2d4e5f60718293a4b5c6d7e8",
    "displayName": "Mia",
    "conceptIds": ["hilfe", "trinken"]
  },
  "data": {
    "settings": { "volume": 0.5 }
  }
}
```

`importProfile` checks the whole document before it writes anything: format, version, timestamp,
the profile record, every data name, every value, and that there are no other fields. Only then are
the record and all data written in one atomic batch. A malformed, cut-off or other-version document
is rejected with `ExportFormatError` and the store stays as it was; a storage failure during the
write leaves no partial profile. The caller turns file text into a value with `JSON.parse`; text
that is not JSON fails there and never reaches the store.

`exportedAt` must be a real UTC calendar timestamp in the form `exportProfile` writes
(`YYYY-MM-DDTHH:MM:SS.sssZ`; the milliseconds may be left out). Dates such as 31 February or hour 24
are rejected.

### Size limits and usage

| Limit | Value | Constant |
| --- | --- | --- |
| Data names in one profile | 10,000 | `MAX_EXPORT_DATA_NAMES` |
| Size of one export | 64 MiB, as UTF-8 bytes of the document written as compact JSON | `MAX_EXPORT_BYTES` |
| Part of that size kept for everything except data | 34 KiB | `EXPORT_ENVELOPE_RESERVE` |

The limits are enforced when data is written, not only when it is exported. Within one store
instance (one open tab) a profile therefore cannot grow into something that can no longer be backed
up. Two instances writing at the same time are not coordinated; see "Two tabs" below.

- Each profile has a usage record, `profile/<id>/usage` = `{ names, bytes }`. `bytes` is the sum,
  over all data entries, of the UTF-8 bytes of the value as compact JSON, plus the length of the
  name, plus 4 (two quotes, a colon and a comma, as the entry appears in an export).
- `data(id).set` and `delete` update the record in the same atomic batch as the value. `create` and
  restore write it too. Overwriting a name counts the difference to the old value.
- A write is refused with `ProfileSizeError`, and no data changes, when it would give the profile
  more than 10,000 names or more than 64 MiB minus 34 KiB of counted bytes. Restore applies the same
  rule; `importProfile` reports it as `ExportSizeError` before anything is written. A value whose
  JSON text is too long for the JavaScript engine to build is refused the same way. A refusal may
  correct a usage record that was wrong, and it reads the whole profile to count it, so do not
  retry a refused write in a loop.
- A write that adds neither a name nor bytes is always accepted, also for a profile that is already
  over a limit, so such a profile can be made smaller. A write that would add to a profile that is
  already over a limit is refused with a message saying so and that entries must be deleted.
- The count is conservative. The reserve of 34 KiB is more than the largest possible rest of an
  export document (fixed fields plus a profile record with a 40-character name and 500 concept ids
  of 64 characters: just under 34,000 bytes; a test builds it). So counted bytes plus the reserve
  are never less than the real size of the export, and usually a little more. A document that is
  within 64 MiB but leaves less than the reserve free is refused on import.
- `set` and `delete` trust the stored record. If it is missing or cannot be right (data written
  before the record existed, negative or non-integer numbers), they count again from the data.
  `set` also counts again before it refuses a write for size (see "Two tabs" below).
- `store.usage(id)` returns `{ names, bytes, maxNames, maxBytes }`, where `maxBytes` is the most
  `bytes` may reach. Use it to warn a carer well before a write is refused (card NG-19). It is the
  authoritative and slow call: it reads all of the profile's data, counts it, and writes the record
  when the stored one differs. So this read can write. `bytes` or `names` can be above the maximum.
- `exportProfile` reads all data anyway, so it counts too, corrects the record when it differs, and
  checks the limits against the count. Within one store instance, and with the limits
  the data was written under, that check does not fail.

#### Two tabs

Two `ProfileStore` instances on the same storage (two open tabs) do not coordinate. If both write to
the same profile at the same moment, each updates the usage record from the value it read, and one
update is lost. The record can then be too low (two additions) or too high (two deletions), and a
record that is too low lets the profile grow past the limits. Nothing notices this at once.

- It heals when `usage(id)` or an export runs in any tab: they count and try to replace the record.
  If that write fails, the count is still returned and the export still produced; the next count
  tries again.
- A record that is too high does not block data that fits: before `set` refuses anything for size
  it counts the real data and decides on that.
- These reads write the usage key. If another tab removed the profile in between, a read can
  recreate that one key. It holds only the two counts, the leftover is listed as damaged, and
  `removeDamaged` (or `remove`) clears it.
- If the profile really is over a limit, `exportProfile` fails with `ExportSizeError`, further
  growth is refused, and deleting or shrinking entries is accepted until it fits again.
- The data is not lost in the meantime: `exportProfile(store, id, { limits })` with higher limits
  still produces the document. `importProfile` accepts that document only into a store that was
  itself opened with those higher limits (`ProfileStore.open(backend, { limits })`); passing the
  limits to `importProfile` alone is not enough, and a store with the built-in limits refuses it.
  No part of the app opens a store with raised limits yet; a way to restore such a backup is part
  of card NG-22.
- `usage(id)` reads the whole profile, so it is slow for a large one. Call it deliberately (when a
  storage view opens, before a teaching session), not on every render, and do not rely on a value
  cached from an earlier call.

For scale: 300 gesture examples of 32 x 86 numbers are about 17 MB. A file saved with indentation is
larger on disk than the counted size. The limits can be lowered per store
(`ProfileStore.open(backend, { limits })`); that exists for tests.

The export contains the display name and all profile data in readable form. It is not encrypted.

### When the profile already exists

`importProfile(store, document, { onConflict })`:

- `"reject"` (default): fails with `ProfileConflictError`; nothing changes.
- `"replace"`: every key of the stored profile is removed and the imported record and data are
  written, in the same atomic batch. Data that is not in the export is gone afterwards.
- `"copy"`: the stored profile stays; the import is written under a new random id with the same
  display name, concepts and data.

Without a conflict all three modes store the profile under its exported id.

## Delete

`remove(id)` deletes every key below `profile/<id>/` in one atomic batch, clears
`app/active-profile` if it named that profile, and then checks that no key is left. Other profiles
are not touched.

Delete cannot recall exported copies. A file that was exported earlier stays wherever the caregiver
put it and can be imported again. The user interface must say so (card NG-13).

## Why IndexedDB

- Size: later cards store gesture examples per profile; `localStorage` is limited to a few megabytes
  of strings and is synchronous.
- Transactions: one readwrite transaction per batch gives the all-or-nothing writes that restore
  and delete rely on.

Browsers may evict IndexedDB data (storage pressure, "clear site data", some private modes). There is
no permanence guarantee. The export file is the backup.

## Not done here

- `ProfileV1` here has a caregiver-chosen `displayName`. The `ProfileV1` shape in section 3 of
  `docs/s0a-product-contract-v0.1.md` has no such field. The two differ until the contract is
  updated or the field is removed here. That is an owner decision and is not made in this module.
- Section 6 of the product contract says an authorised caregiver and a retention policy must be
  decided before personal data is stored (board card NG-7). That decision is pending. Nothing in the
  app uses this module yet, so no personal data is stored today.
- Deletion is logical. After `remove`, the keys are gone for the app, but the browser may keep
  remnants in its on-disk database files until it compacts them. No secure erase is attempted.
- No encryption at rest and no export password (human decision pending; card NG-22).
- No `navigator.storage.persist()` request and no quota handling.
- No user interface: profile selection, export, restore and delete controls come with card NG-13.
- No stored gesture examples (card NG-19).
- No real-browser test of the IndexedDB adapter (card NG-14).
- No coordination between two open tabs. One `ProfileStore` runs its operations one after another;
  two tabs can still interleave (for example one writes data while the other deletes the profile,
  which leaves data without a record, listed as damaged). The usage record can drift the same way;
  "Two tabs" above says how far and how it heals.
- No migration: there is one schema version and one export version. Other versions are rejected.
- No sync and no network use of any kind.
