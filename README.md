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
- a service worker that pre-caches the local bundle.

Not built yet: child profiles, export/restore/delete, camera input and gesture recognition.
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
npm run typecheck
npm run build
npm test
npm run smoke:offline
```

Serve `dist/` from a local HTTP origin (`localhost` works) and open it in a browser.

The repository is developed with the governed [`voku/agent-loop`](https://github.com/voku/agent-loop)
workflow. That tooling is PHP and is installed with `composer install`; the product itself has no
PHP. See [AGENTS.md](AGENTS.md).

## The previous version

The first Amy's Echo (React, Express, Python training) is kept unchanged on the
[`main_old`](https://github.com/voku/AmysEcho/tree/main_old) branch as reference, including the
public DGS demo videos. It is not maintained. See
[docs/legacy-lessons.md](docs/legacy-lessons.md) for why it was restarted.

## License

[MIT](LICENSE) for the source code. Symbols and other assets carry their own licence records.
If you use this to help another child, let me know. That's why it's public.
