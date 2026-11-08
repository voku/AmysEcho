# Amy's Echo NG: independent greenfield proof

This folder is not a migration of the old webapp/server/integration tree. NG relies on no legacy imports or runtime. Parent: [#1176](https://github.com/voku/AmysEcho/issues/1176); bootstrap: [#1179](https://github.com/voku/AmysEcho/issues/1179); board acceptance: [#1180](https://github.com/voku/AmysEcho/issues/1180).

## Local development

Use Node 24.15.0 or a compatible Node 24 release.

```sh
npm ci --prefix ng --ignore-scripts
npm --prefix ng run typecheck
npm --prefix ng run build
npm --prefix ng test
npm --prefix ng run smoke:offline
```

Serve `ng/dist/` from a local HTTP origin (`localhost` works for development), open the page, and select one of **five synthetic, not caregiver-approved** concept examples. Each emits German text with a bundled, original placeholder SVG. The application never requests camera access, and output remains visible if speech is unavailable or fails.

The speech adapter **only attempts** a voice when the browser advertises a German voice marked `localService`. It does not infer true offline TTS support from that flag. Speech errors are visible. Test with airplane mode on the approved actual device, not by counting CI checks.

A scoped service worker pre-caches the local HTML/CSS/JS/SVG/manifest bundle after installation. The CI asset smoke serves local assets, checks type-safety and exercises board clicks with `fetch` denied; **it does not prove physical-browser installation, cold-start offline capability, offline voice playback, browser storage persistence, or useful communication with a child**.

The current S1a UI intentionally has no profile persistence, export/restore/delete, or personal gesture capture. These are **required before S1 acceptance**, not optional 1.0 features. No real child data, samples or diagnostic logs may be committed or uploaded.

Before release, record caregiver-approved concept selection, offline device observations, a 5–10 attempt private communication session, effective accessible labels, profile isolation and recovery, and a verified no-camera/no-network cold start. See [S0a contract #1192](https://github.com/voku/AmysEcho/pull/1192).

## NG CI and privacy boundary

NG CI is independently path-scoped. The existing legacy CI is not suppressed for legacy code changes. Personal child data is excluded from the repository and public artifacts. Branch-protection/required-status semantics are not verified by this README; the bootstrap PR remains subject to that check.
