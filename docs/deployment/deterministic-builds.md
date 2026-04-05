Deterministic Builds & Version Freeze
====================================

Goals
- Pin critical dependencies to exact versions
- Generate reproducible dependency snapshots
- Fail CI if critical deps are unpinned

Critical packages
 - Webapp: react, react-dom, vite
 - Server: express, express-rate-limit

Workflow
1) Pin versions in `webapp/package.json` and `server/package.json` (no `^`, `~`, or `latest`).
2) Run full checks: `./scripts/full-check.sh`.
   - Produces `docs/deps/*.json` snapshots.
   - Runs `scripts/check-pins.js` to enforce pinning.
3) Publish from tags only; avoid drift between CI environments.

Notes
- To update a dependency, bump the exact version and re-run full checks.
- The webapp uses Vite for building; no native mobile build steps required.

