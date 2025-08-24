# AGENTS.md - Server Guidelines

Scope: All files under `server/`. Paths are relative to this directory.

## Coding

- The server uses TypeScript with Node.js. Place runtime code in `src/` and tests in `test/`.
- Python utilities live in `src/tools`; ensure any Python scripts remain runnable.
- Follow existing service and middleware patterns. Study similar files before adding new ones.

## Testing

- Avoid `test.skip` or `describe.skip` and limit mocks to external systems.
- Run:

```bash
pip install -r server/requirements.txt
npm test --prefix server
```
