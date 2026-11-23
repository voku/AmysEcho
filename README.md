# Amy's Echo NG

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local-first communication aid (AAC) for children with special needs. A child picks a
**communication concept** on a board, or makes a **personal gesture** that a caregiver has taught
the app, and the device shows and speaks the German message. It started for Amy, who has 22q11
deletion syndrome and communicates with signs based on Deutsche Gebärdensprache (DGS); it is built
so that every child profile uses its own gestures.

Product plan and gates: [#1176](https://github.com/voku/AmysEcho/issues/1176).
Product, device and privacy contract (draft): [docs/s0a-product-contract-v0.1.md](docs/s0a-product-contract-v0.1.md).

## Status

Early rebuild. What exists today:

- an offline concept board with five **synthetic, not caregiver-approved** example concepts,
  German text, bundled placeholder symbols and speech through a local German voice when the
  browser offers one;
- a service worker that pre-caches the local bundle;
- child profiles with export, restore and delete, and a board per profile (its own concepts, order,
  German wording and text-only custom concepts), as library code tested in Node against an
  in-memory store ([docs/storage.md](docs/storage.md));
- a board that waits for local storage at start (up to 1.5 s, an unmeasured value) and then shows
  the active profile's own concepts. On a device without any profile it shows the example concepts
  under the plain "examples, not approved" line. Whenever a profile exists but its board cannot be
  shown (none chosen, no concepts chosen or loadable, unreadable profiles, storage that fails or
  answers late) the examples stand in under a German sentence that says they are examples and why.
  Every board of examples has a dashed frame and a "Beispiele" badge. The board does not show the
  child's name;
- a child's screen that is one screen high ([docs/board.md](docs/board.md)): a bar at the top shows
  the last sentence and speaks it again when tapped, the tiles fill the rest and the tapped tile
  stays marked. Looked at in headless Chromium at five window sizes; not tried on a device, with a
  child or with a screen reader;
- wording that is copied into the profile when concepts are chosen through `setBoardConcepts`, so
  such a board keeps its sentences when the catalogue changes. A board made another way, or
  restored from a backup without stored wording, follows the current catalogue;
- an app shell with a board region, a region for the caregiver area, and a controller that owns
  the page's one profile store and can re-mount the board without a reload;
- a caregiver area ([docs/caregiver.md](docs/caregiver.md)), opened by holding a small control
  for three seconds: a profile can be created, renamed, deleted, made the active board and given
  catalogue concepts in a chosen order, in the app, and the board shows the result without a
  reload. A header that stays says which board the child gets after closing, and concepts removed
  during a visit can be put back while the same board stays in the editor. Deleting a profile
  needs a two-second hold. The hold is a hurdle for a small child, not security.

Still missing in the caregiver area: rewording a concept, custom concepts, export and import, and
help with damaged entries; those exist as library code only or not at all. Also not built:
symbols for custom concepts, camera input and gesture recognition in the app. The caregiver area
is tested in Node against a fake DOM and was looked at in headless Chromium with a hand-run
script; there is no browser test in CI, and the browser storage adapter has no automated test.
Nothing here has been verified on a physical device, with a caregiver or with a child.

A child's first name may be stored as the profile name (owner decision of 2026-11-22, card NG-7);
how long data is kept, who counts as an authorised caregiver and deletion are still open there.
The browser storage adapter has run in headless Chromium only, in a hand-run script, and never
on a target device (card NG-14), so data entered now may not survive. A profile can be deleted in
the caregiver area, and there is no backup; clearing the site data of the browser removes all
profiles in this browser and the offline copy of the app.

## Try it

The app on `main` is deployed to GitHub Pages: <https://voku.github.io/AmysEcho/>. Open it in
Chrome on the phone; "Zum Startbildschirm hinzufügen" installs it, and after one visit it starts
offline. The board shows the examples until a caregiver sets up a profile (hold the control at the
bottom for three seconds).

The camera test is at <https://voku.github.io/AmysEcho/#kamera-testen>: "Kamera starten" loads the
hand tracker (about 25 MB, once), asks for the camera and shows whether no, one or two hands are
seen. Nothing is recorded or sent. Gesture teaching and recognition are not built yet.

## Principles

- **The board always works.** Camera, recognition and network are optional.
- **Per-child gestures.** Recognition compares against examples recorded for that child; there is
  no shared "sign language model".
- **Measured, not assumed.** Recognition changes must report numbers from held-out recordings,
  split by recording session. Synthetic fixtures prove the pipeline, not real-world accuracy.
- **Private by default.** No raw video is stored. No child recordings, landmarks or session data
  belong in this repository, in CI logs or in artifacts.
- **No backend** until a product requirement proves one is needed.

## Development

Node 22 or newer.

```sh
npm ci --ignore-scripts
npm run verify
```

`npm run verify` runs the type check, the build, the tests and the offline asset smoke check; the
single steps are `npm run typecheck`, `npm run build`, `npm test` and `npm run smoke:offline`.

Serve `dist/` from a local HTTP origin (`localhost` works) and open it in a browser.

`npm test` fails when it finds no test file or when no test passes.

The repository is developed with the governed [`voku/agent-loop`](https://github.com/voku/agent-loop)
workflow. That tooling is PHP (8.3 or newer) and is installed with Composer; the product itself
has no PHP. See [AGENTS.md](AGENTS.md). Set up in this order:

```sh
composer install
npm ci --ignore-scripts
vendor/bin/agent-loop enter <task-id>
```

`npm ci --ignore-scripts` has to come before `enter`: for a task that touches TypeScript or
JavaScript files the workflow builds a symbol map and needs `node_modules/typescript` for it. The
map is built from the files of the task's scope that already exist, so a task that names only new
files gets no map.

## The previous version

The first Amy's Echo (React, Express, Python training) is kept unchanged on the
[`main_old`](https://github.com/voku/AmysEcho/tree/main_old) branch as reference, including the
public DGS demo videos. It is not maintained. See
[docs/legacy-lessons.md](docs/legacy-lessons.md) for why it was restarted.

## License

[MIT](LICENSE) for the source code. Symbols and other assets carry their own licence records.
If you use this to help another child, let me know. That's why it's public.
