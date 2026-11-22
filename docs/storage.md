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
profile/<id>/data/<name>    data owned by that profile
```

- `<id>` is 16 random bytes from `crypto.getRandomValues` as 32 lowercase hex characters. It contains
  no timestamp and nothing derived from the name.
- `<name>` matches `[a-z0-9][a-z0-9._-]{0,63}`. Ids and names are checked before a key is built and
  cannot contain `/`, so one profile's accessor cannot address another profile's keys.
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
to that form. Names with control characters or invisible format characters (Unicode category Cf:
bidirectional overrides and isolates, zero-width characters, byte order mark, soft hyphen) are
rejected. This also rejects emoji that are joined with a zero-width joiner; single emoji are fine. A
stored or imported name that is not already in this form is rejected, not rewritten.

Everything else a profile owns is stored through `store.data(id)` under `profile/<id>/data/`. Each
value must be plain JSON, nested at most 64 levels. Rejected, never altered: `undefined`, `NaN`,
infinite numbers, `Date`, `Map`, typed arrays, class instances, objects with getters or setters,
non-enumerable properties or symbol keys, and arrays with holes or extra properties. The one
alteration is that negative zero is stored as zero. The same per-value rules apply in `set`, in
import and in restore, so anything `set` accepted can be exported and restored unchanged.

`list()` returns `{ profiles, damaged }`. A stored record that cannot be read (wrong version, unknown
fields, missing record, id mismatch) is listed under `damaged` with a reason and is never dropped
silently. `getActive()` returns `null` while the active profile's record is unreadable; the damage
itself is reported by `list()` only.

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

### Size limits

| Limit | Value | Constant |
| --- | --- | --- |
| Data names in one export | 10,000 | `MAX_EXPORT_DATA_NAMES` |
| Size of one export | 64 MiB, counted as UTF-8 bytes of the document written as compact JSON | `MAX_EXPORT_BYTES` |

An import over either limit is rejected with `ExportSizeError` before anything is written.
`exportProfile` applies the same limits and fails with the same error instead of producing a file
that could not be restored. `data(id).set` does not enforce them, so a profile can grow past what
can be exported; nothing warns about that yet. For scale: 300 gesture examples of 32 x 86 numbers are
about 17 MB. A file saved with indentation is larger on disk than the counted size.

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
  two tabs can still interleave (for example one writes data while the other deletes the profile).
- No migration: there is one schema version and one export version. Other versions are rejected.
- No sync and no network use of any kind.
