# AGENTS.md - App Guidelines

Scope: All files under `app/`.

## Coding

- Use TypeScript and React Native functional components.
- Keep source files in `src/` and tests in `test/`.
- Follow existing naming and hook patterns. Study similar modules before writing new ones.

## Testing

- When modifying code, update or add tests in `app/test`.
- Do not use `test.skip` or `describe.skip`.
- Keep mocks minimal; mock only external modules or native APIs.
- Run:

```bash
npm run type-check --prefix app
npm test --prefix app
(cd app && npx expo install --check)
(cd app && npx expo-doctor)
```
