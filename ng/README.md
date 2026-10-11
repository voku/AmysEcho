# Amy's Echo NG: independent S0b bootstrap

This is a **greenfield, locally built NG implementation**. The former `webapp/`, `server/`, and `integration/` are **read-only reference material** and must not be imported or installed for NG. Parent plan: [#1176](https://github.com/voku/AmysEcho/issues/1176); S0b: [#1179](https://github.com/voku/AmysEcho/issues/1179).

## Run from a clean checkout

Node **24.15.0** or compatible Node 24. Uses the exact, independently recorded `ng/package-lock.json`.

```sh
npm ci --prefix ng --ignore-scripts
npm --prefix ng run typecheck
npm --prefix ng run build
npm --prefix ng test
npm --prefix ng run smoke:offline
```

Open `ng/dist/index.html` using a local static HTTP server to view the temporary bootstrap. No backend is required. The S0b bootstrap is plain TypeScript on purpose: S1 will select and justify the actual accessible React/PWA shell. This is **not** a gesture recognizer or a deployable offline AAC product.

The smoke test serves exactly three local files on a loopback HTTP port and checks responses. It is **not** proof of browser offline caching, installed voices, real device support, or the S1 communication workflow.

## Security / isolation / CI

- NG CI is path-scoped to `ng/**` and `.github/workflows/ng-ci.yml`. Type checking, build, tests, loopback smoke and dependency audit must run; no `continue-on-error` or skipped assertions.
- Legacy `CI` ignores *NG-only* path changes. DGS integration CI is already path-scoped. Changing legacy files still triggers their existing checks/security audits unchanged.
- Never commit personal samples, raw video, landmark sequences or profile exports. Local-only data belongs in ignored `ng/local-data/` or `ng/private/`; this is no substitute for a pre-commit privacy review.
- No CI artifact contains private samples, secrets or biometric features.
- **Branch protection:** the GitHub app returned 403 reading `main` protection, while GET rulesets returned an empty list. This does **not** prove no required checks exist. Verify that NG CI may be merged without legacy `CI` being required/pending before final merge.
