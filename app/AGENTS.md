# AGENTS.md - App Guidelines

Scope: All files under `app/`. Paths are relative to this directory.

## Coding

- Use TypeScript in strict mode (no implicit any; prefer exact types) and React Native functional components.
- Keep source files in `src/` and tests in `test/`.
- Place reusable UI components under `src/components/`.
- Follow existing naming and hook patterns. Study similar modules before writing new ones.
- Write all UI text and error messages in German.

## Testing

- When modifying code, update or add tests in `test/`.
- Do not use `test.skip` or `describe.skip`.
- Keep mocks minimal; mock only external modules or native APIs (no app internals).
- When snapshots are intended, update them deliberately: `npm test -- --updateSnapshot`.
- Run these commands from the **repository root** to ensure a consistent workflow:

```bash
npm ci --prefix app
npm run type-check --prefix app
npm test --prefix app
(cd app && npx expo install --check)
(cd app && npx --yes expo-doctor || echo "expo-doctor skipped/failed (non-blocking)")
```

