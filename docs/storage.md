# Local storage: profiles, export, restore, delete

Card NG-2. Library code in `src/profiles/`. Since card NG-12 the board reads it at start (see
"Board data" below); there is still no screen that creates or changes a profile.
Product rules: `docs/s0a-product-contract-v0.1.md`, sections 3 and 6.

## Verification status

- The profile logic (`profile.ts`, `store.ts`, `backup.ts`) is tested in Node against the in-memory
  backend (`test/profiles.test.mjs`, `test/profiles-backup.test.mjs`).
- **The IndexedDB adapter (`indexeddb-backend.ts`) has no automated test.** Node has no IndexedDB, so
  the file is only type-checked. Card NG-14 adds a real-browser test. Until then nothing here shows
  that data survives in a real browser, and the adapter must be treated as unverified.
- The board data (`src/board-data.ts`) and the start-up decision (`src/startup.ts`) are tested in
  Node against the in-memory backend. The rendering, the start-up sequence (`runStartup`) and the
  app controller (`src/app.ts`) are tested against a minimal fake document, a fake speech engine
  and a timer fired by hand (`test/board.test.mjs`).
- Not tested after cards NG-12 and NG-28:
  - `src/main.ts` with working storage. The test that loads `main.js` runs in Node, where there is
    no IndexedDB, so it covers only "waiting line, then the examples with the storage sentence".
    That the board shows the active profile in a real browser is unverified until card NG-14. The
    controller itself is tested with working storage, on the in-memory backend.
  - `index.html` in a browser. A test reads the built file as text (regions, static line,
    `<noscript>`, policy); it does not show what a browser renders when the script fails to load.
  - The real timer in `createBoardHost` (`src/board.ts`) and the value of `STARTUP_WAIT_MS`
    (1500 ms). The value is a guess; no device has been measured.
  - Real layout, real speech and real `SpeechSynthesis` error events. The fake document has no
    layout and the fake engine reports errors only when a test calls them.
  - The service worker in a browser. A test runs its install step with a fake cache and checks the
    requests; it does not show that an update replaces every module on a device.

## Layers

| File | Role |
| --- | --- |
| `backend.ts` | `KeyValueBackend`: `get`, `keys(prefix)`, atomic `write({ set, delete })`. Values are JSON values and are copied on the way in and out. |
| `memory-backend.ts` | In-memory backend for tests, with a failure hook (`failWrite`). |
| `indexeddb-backend.ts` | Browser backend: one object store, one readwrite transaction per `write`. |
| `profile.ts` | `ProfileV1`, id generation, strict `parseProfile`. |
| `store.ts` | `ProfileStore`: the key layout and every profile operation. |
| `backup.ts` | `exportProfile`, `importProfile`. |
| `../board-data.ts` | Per-profile board: concept order, wording, custom concepts. Uses the public `ProfileStore` API only. |
| `../startup.ts` | `resolveStartupView`: what storage says the board should show. `runStartup`: the start-up sequence. |
| `../app.ts` | `createApp`: the page's one `ProfileStore`, start-up, `refreshBoard()`. |

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

## Board data

Cards NG-12 and NG-28. Code: `src/board-data.ts` (it sits next to `src/profiles/`, not inside,
because a test pins the list of files in that directory). It builds no storage keys of its own; it
uses `store.get`, `store.setConceptIds` and `store.data(id)`.

### Layout

Everything belongs to one profile:

```
profile/<id>/meta                        conceptIds: the board, concept ids in display order
profile/<id>/data/concept.<conceptId>    the wording of that concept on this board, or a custom concept
```

```json
{ "version": 1, "labelDe": "Hilfe", "speechDe": "Ich brauche Hilfe." }
{ "version": 1, "labelDe": "Ball", "speechDe": "Ich möchte mit dem Ball spielen.", "custom": true }
```

- Without `custom`, the entry is the wording of a catalogue concept (`src/concepts.ts`) for this
  profile. It is written when the concept is chosen for the board (a copy of the catalogue wording
  at that moment) and when a caregiver rewords it. The two cases are stored the same way and cannot
  be told apart later.
- With `custom: true`, the entry is a concept of this profile only. It has no symbol yet and the
  board shows it as a text button; symbol images are a later card.
- A custom concept exists as soon as its entry is stored. It is on the board only when its id is in
  `conceptIds`.

Consequences of copying the wording when a concept is chosen:

- A board does not change when a later version of the app changes a catalogue sentence or label.
  The stored wording is shown. Only the symbol is taken from the current catalogue.
- An entry without `custom` under an id the current catalogue does not have is the stored wording
  of a concept an earlier catalogue had (a "retired" concept). It is a valid board member: it is
  shown as a text button (the symbol went with the catalogue entry), spoken, can be chosen again
  with `setBoardConcepts` and reworded with `setWording`. Nothing is reported as a problem.
- If the catalogue has that id again later, the stored wording stays and the symbol is the
  catalogue's.
- A board from before this rule, or one made with `store.create` or `store.setConceptIds` directly,
  has no entries. It keeps working and shows the current catalogue wording, as before, until its
  concepts are chosen through `setBoardConcepts`, which stores the wording of that moment.
- Every board concept now costs one data name and a few dozen bytes of the profile's size limits.
- An export is self-contained for wording: it carries the label and sentence of every concept
  chosen through this module, so a restored board reads the same on any app version. It does not
  carry symbols; those come from the catalogue of the app that shows the board.

### Limits

| What | Rule | Constant |
| --- | --- | --- |
| Concept id written by this module | `[a-z0-9][a-z0-9-]{0,39}` | `MAX_BOARD_CONCEPT_ID_LENGTH` |
| `labelDe` | 1-40 code points | `MAX_LABEL_LENGTH` |
| `speechDe` | 1-200 code points | `MAX_SPEECH_LENGTH` |

- Text is stored in Unicode NFC form and trimmed; the limits count that form. Whitespace at the
  ends, including line breaks and line or paragraph separators, is trimmed away. Inside the text,
  control characters (so also line breaks and tabs) and line and paragraph separators are rejected,
  as are unpaired surrogates and invisible format characters, with the same exception as for
  display names (a zero-width joiner or non-joiner between two visible characters).
- A stored label or sentence longer than twice its limit in UTF-16 units is reported as unreadable
  from its length alone, before it is normalised.
- The id rule is narrower than what `conceptIds` accepts (64 characters, also `.` and `_`), so that
  `concept.<id>` is always a valid data name. A custom id must not be a catalogue id.
- The store's limits apply on top: at most 500 ids in `conceptIds`, and the profile's size limits.

### Writing

All writes validate first and store nothing when they refuse. A refusal by this module is a
`BoardDataError` with a `kind`. Refusals by the store pass through unchanged: `UnknownProfileError`,
`ProfileFormatError` (a damaged profile record, or more than 500 concept ids), `ProfileSizeError`
(the profile would outgrow one export), and storage errors.

| Function | Does | Store writes |
| --- | --- | --- |
| `setBoardConcepts(store, id, ids, catalogue)` | Sets the board and its order, and stores the catalogue wording for every chosen catalogue concept that has no entry yet. Every id must be a catalogue concept or have a readable entry in this profile (custom or retired); no duplicates. | one per wording to copy, then 1 |
| `setWording(store, id, conceptId, wording, catalogue)` | Rewords a catalogue concept, a custom concept (it stays custom) or a retired concept. | 1 |
| `clearWording(store, id, conceptId, catalogue)` | For a catalogue concept on the board: stores the current catalogue wording again. For one that is not on the board, and for an unreadable entry: deletes the entry. Refuses a custom concept (`custom-concept`) and a readable retired one (`retired-concept`). | 1 |
| `putCustomConcept(store, id, conceptId, wording, catalogue)` | Creates or replaces a custom concept. Does not put it on the board. | 1 |
| `removeCustomConcept(store, id, conceptId, catalogue)` | Takes a custom or retired concept off the board and deletes its entry. Also clears an unreadable or missing entry, but only under an id that is not in the catalogue. | 2 |
| `listCustomConcepts(store, id)` | Read only: the profile's custom concepts (not the retired ones), and the ids of unreadable entries. | 0 |

Cleaning up unreadable entries:

- Under a catalogue id: `clearWording`. `removeCustomConcept` refuses such an id
  (`catalogue-concept`) unless the entry is a readable custom concept.
- Under an id that is not in the catalogue: `removeCustomConcept`.
- An entry whose name is `concept.` followed by something that is not a valid concept id (listed in
  `unreadableIds`) cannot be addressed by this module. Only `store.data(id).delete(name)` removes it.
- `removeCustomConcept` deletes `concept.<id>` and nothing else. See "Open decisions".

What is atomic and what is not:

- Each store write is atomic (one backend batch).
- `setBoardConcepts` cannot be one write. The public store API writes either one data entry or the
  profile record; the only call that writes both is `restoreProfile`, which rewrites the whole
  profile and would lose a data write made in between. So the wordings are written first, one
  write each, and `conceptIds` last. If any write fails, `conceptIds` is unchanged: the board is
  the one from before the call and reads without a problem. Wordings copied before the failure
  stay stored. They do no harm: for a concept on the board they equal what it showed (unless the
  catalogue changed since the board was made, in which case that concept now shows the stored
  copy); for a concept not on the board they are not shown, and will be used as its wording if it
  is chosen later. Calling again finishes the job. A test injects a failure at every write.
- `removeCustomConcept` is two writes: first the id is taken out of `conceptIds`, then the entry is
  deleted. If the second fails, the board no longer names the concept and reads without a problem;
  the entry is still there and listed by `listCustomConcepts`. Calling the function again finishes
  it. A test injects that failure.
- Putting a new custom concept on the board is two calls by the caller (`putCustomConcept`, then
  `setBoardConcepts`). After a failure in between the concept exists and is not on the board.
- The checks read before they write, and that is not one step with the write. Two of these calls at
  the same time for one profile, or two tabs, can interleave: for example a board can be set to
  name a custom concept that is being removed. Reading then reports the id as `unknown-concept` and
  leaves it off, so the board is short of a concept the caregiver chose until it is set again. No
  id is shown as another concept. A board that is already on screen is not updated by a write; it
  changes when the page is loaded again or `app.refreshBoard()` is called.

### Reading

`resolveBoard(store, id, catalogue)` returns `{ profile, entries, problems }`. `entries` follow
`conceptIds`. It rejects only when the profile record itself cannot be read or storage fails.

Per id, the profile's entry decides before the catalogue does. Each entry has a `source`:

| Entry in the profile | Id in the catalogue | Shown | `source` |
| --- | --- | --- | --- |
| readable, `custom` | no | stored wording, text only | `custom` |
| readable, `custom` | yes | stored wording, text only; problem `custom-shadows-catalogue` | `custom` |
| readable, no `custom` | yes | stored wording, catalogue symbol | `catalogue` |
| readable, no `custom` | no | stored wording, text only | `retired` |
| none | yes | catalogue wording and symbol | `catalogue` |
| unreadable | yes | catalogue wording and symbol; problem `damaged-wording` | `catalogue` |
| unreadable | no | left off; problem `damaged-custom-concept` | |
| none | no | left off; problem `unknown-concept` | |

`damaged-custom-concept` keeps its name from card NG-12; the unreadable entry may have been a
custom or a retired concept, which can no longer be told. The two damaged kinds carry `damage`:
`unsupported-version` (a `version` greater than 1; a newer app wrote it) or `unreadable`. An id is
never shown as some other concept.

What the board does with problems:

- It sets `data-board-problems` on the board region to the number of problems (`0` for a profile
  without any; the attribute is absent when the view is not a profile).
- It writes one `console.warn` line per problem with the kind, the concept id and, where there is
  one, the damage. No label, no sentence and no profile name is logged. A custom concept id is
  caregiver-chosen text and does appear.
- On a profile's own board it shows one plain line when a concept is missing or shown with other
  wording than stored. `custom-shadows-catalogue` alone shows no line: the child sees the concept
  as stored. When no concept could be loaded at all, the examples stand in (see below).
- Telling the caregiver which concepts are affected, and offering repair, is card NG-13.

An entry is read strictly: exactly the fields above, version 1, text already in stored form.

### Isolation and backup

- Every function takes one profile id and reaches storage only through that profile's record and
  data accessor. A custom concept or a stored wording of one profile is unknown to every other
  profile, also under the same id. Tests cover this.
- The entries are ordinary profile data, so `exportProfile` includes them, `importProfile` restores
  them, and `remove` deletes them with the profile. Import does not validate them as board entries;
  an invalid one is reported when the board is read.

### The page: regions and the app controller

`index.html` gives `#app` a fixed structure: `#board-region` and `#caregiver-region` (empty and
hidden until card NG-13). `createApp(boardRegion, options)` in `src/app.ts` writes only into the
board region: its children and its `data-startup`, `data-startup-late`, `data-board-fallback` and
`data-board-problems` attributes. Nothing replaces the children of `#app`.

Until the script runs, the board region holds a static line saying that the board has not started
and what to do if it stays that way, and a `<noscript>` line. Neither claims that anything is
loading. The script replaces them with the waiting line as its first step.

The controller owns the page's one `ProfileStore`:

- `openBackend` is called once. Start-up reads through that store.
- `app.store()` resolves to that same instance for every caller, or to `null` when storage could
  not be opened. It is not opened again later.
- `app.refreshBoard()` reads the view again from the same store and mounts it. It is meant for the
  caregiver area after a change, so it replaces the board also when something was selected, and
  stops running speech. Calls are carried out one after another in call order, each after start-up
  has finished; the last one decides what is shown. If storage never answers, a refresh waits with
  start-up.
- `app.started` resolves when start-up has dealt with the answer of storage.

### What the board shows

`resolveStartupView(store, catalogue)` in `src/startup.ts` says what storage holds; the board then
always has concepts to tap. Either the child's own board is shown, or the example concepts stand
in under one sentence that says they are examples and why. The reason is in `data-board-fallback`
on the board region (absent when there is none).

| View from storage | When | Board | `data-board-fallback` |
| --- | --- | --- | --- |
| `demo`, `storage: "empty"` | No stored profile at all. | Examples, labelled as not approved. | absent |
| `profile`, at least one concept loaded | `getActive()` names a readable profile. | The profile's own concepts. One line when a concept is missing or differs. | absent |
| `profile`, no concepts chosen | | Examples. | `empty-profile` |
| `profile`, none of the chosen concepts could be loaded | | Examples. | `unloadable-profile` |
| `damaged` | No readable active profile, and `list()` reports damaged entries. | Examples. | `damaged` |
| `no-active` | Readable profiles, none active, nothing damaged. | Examples. | `no-active` |
| `demo`, `storage: "unavailable"` | Storage could not be opened or read, including an unknown storage layout. | Examples. | `storage-unavailable` |

Three more reasons come from the start-up sequence, not from storage: `timeout`, `timeout-kept`
and `render-failed` (below). Each of the eight reasons has its own sentence; none tells the child to
delete anything.

`damaged` wins over `no-active` when both apply. An active-profile pointer that is not an id, or
names a profile that is not stored, counts as no active profile; reading does not repair it. With a
readable active profile, damaged entries elsewhere are not looked for. Opening the store on an
empty device writes `app/schema` and nothing else.

The board region carries nothing that identifies the child: no display name and no profile id,
neither as text nor in an attribute. The views still carry `displayName` for the caregiver area.
Concept labels and sentences are shown, and those are caregiver-written text.

The sequence (`runStartup` in `src/startup.ts`, run by `createApp`):

1. A waiting line ("Die Tafel wird geladen.") with nothing to tap; `data-startup="pending"` on the
   board region. No example concept can be tapped before it is known whose board this is.
2. If storage answers within `STARTUP_WAIT_MS` (1500 ms; unmeasured until card NG-14), exactly one
   board is mounted, for the view from the table. `data-startup` is `demo-empty`,
   `demo-unavailable`, `profile`, `damaged` or `no-active`.
3. If it does not, the examples are mounted with the `timeout` sentence
   (`data-startup="demo-timeout"`). If storage never answers, that board stays.
4. If storage answers after that:
   - The view shows examples too (every row of the table except the profile's own board): the
     buttons stay as they are and only the sentence and `data-board-fallback` change. No re-mount,
     a selection and running speech are kept. `data-startup` follows the view,
     `data-startup-late="same-board"`.
   - The view is a profile's own board and no concept has been chosen yet: the board is replaced
     (`data-startup-late="replaced"`, `data-startup="profile"`).
   - The view is a profile's own board and the child has already chosen something: the examples
     stay, with the `timeout-kept` sentence saying that the own board appears when the page is
     loaded again (`data-startup-late="kept"`, `data-startup` stays `demo-timeout`). So a child
     with a profile on a slow device can be left on the examples for that session.
5. If a view cannot be drawn, the examples are shown with the `render-failed` sentence
   (`data-startup="failed"`). If not even those can be drawn, a plain line replaces whatever is
   there, also the waiting line (`data-startup="unrenderable"`); it asks to reload the page or tell
   a caregiver and does not claim that anything is loading.
6. Nothing in the sequence throws, also when showing the waiting line or setting the timer fails.
   In that case the static line of the page stays until a board is mounted.

What this does and does not promise: once the waiting line is gone there are concepts to tap in
every state except `unrenderable`. Until storage answers or the bound passes there are none. The
concepts are the child's own only in the `profile` row with at least one loaded concept; in every
other row they are the synthetic examples, which no caregiver has approved for that child.

Mounting a board stops running speech first. A speech error is shown only for the latest request to
speak on the board that is on screen; an error for an earlier request, also for the same concept,
or for a board that was replaced, is ignored.

### Decisions applied, owner may reverse

- **Examples stand in when the own board cannot be shown** (damaged, no active profile, no
  concepts chosen, none loadable), instead of a message without buttons. To reverse: in
  `mountBoard` (`src/board.ts`) render heading and sentence only when `fallbackCause(view)` is one
  of those four causes, and change the sentences in `FALLBACK_LINES`.
- **Wording is copied into the profile when a concept is chosen.** To reverse: remove the copy
  loop in `setBoardConcepts` and let `clearWording` delete the entry for a board concept
  (`src/board-data.ts`). Entries already stored keep overriding the catalogue until they are
  cleared; a profile that should follow the catalogue again needs them removed.
- **The display name is not shown on the board.** To reverse: add a line with `view.displayName` to
  the profile branch of `mountBoard`.

### Open decisions

- Removing a custom or retired concept deletes only `concept.<id>`. Data stored per concept later
  (gesture examples) is not known here. Either it is purged together with the concept, or a concept
  id is never used again, so that a new concept cannot inherit old examples. That is a decision for
  the gesture cards.
- A wording copied by a `setBoardConcepts` call that failed before it set the board stays stored
  for a concept that is not on the board, and is used if that concept is chosen later, also when
  the catalogue has changed in between. Whether choosing should refresh such a copy needs a way to
  tell a copy from a caregiver's own wording, which the stored shape does not have.

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
  decided before personal data is stored (board card NG-7). That decision is pending. The app reads
  storage at start but has no screen that creates a profile or writes profile data, so no personal
  data is stored today.
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
