Deterministic Builds & Version Freeze
====================================

Goals
- Pin critical dependencies to exact versions
- Generate reproducible dependency snapshots
- Fail CI if critical deps are unpinned

Critical packages
- App: react, react-native, expo, react-native-webview, react-native-reanimated, react-native-worklets-core, @nozbe/watermelondb
- Server: express, express-rate-limit

Workflow
1) Pin versions in `app/package.json` and `server/package.json` (no `^`, `~`, or `latest`).
2) Run full checks: `./scripts/full-check.sh`.
   - Runs Expo dependency checks (`expo install --check`, `expo-doctor`).
   - Produces `docs/deps/*.json` snapshots.
   - Runs `scripts/check-pins.js` to enforce pinning.
3) Publish from tags only; avoid drift between CI environments.

Notes
- To update a dependency, bump the exact version and re-run full checks.
- For native stacks (Android/iOS), prefer dev-client builds for iterative testing.

