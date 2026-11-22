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
- a board that shows the active profile when one is stored, and the example concepts otherwise.

Not built yet: a caregiver screen. Nothing in the app can create, choose or edit a profile, so in
practice the board still shows the examples. Also not built: symbols for custom concepts, camera
input and gesture recognition in the app. The browser storage adapter has no automated test.
Nothing here has been verified on a physical device or with a child.

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
