# AGENTS.md - Server Guidelines

Scope: All files under `server/`. Paths are relative to this directory.

## Prerequisites

- Node.js: >=18
- npm: >=10
- Python: >=3.10
- OS packages needed by native deps (OpenSSL, build-essential, etc.)

## Coding

- The server uses TypeScript with Node.js. Place runtime code in `src/` and tests in `test/`.
- Python utilities live in `src/tools`; ensure scripts:
  - include a shebang (e.g., `#!/usr/bin/env python3`),
  - have executable permissions where appropriate (`chmod +x`),
  - are invokable as modules (e.g., `python -m server.src.tools.my_tool`) and do not run on import.
- Follow existing service and middleware patterns. Study similar files before adding new ones.

## Testing

- Avoid `test.skip` or `describe.skip` and limit mocks to external systems.
- Run these commands from within the `server/` directory:

```bash
pip install -r requirements.txt
npm run type-check # or: npx tsc -p tsconfig.json --noEmit
npm test
# Optional (only if present in repo):
# ruff check . && ruff format --check .
# pytest -q .  # if Python tests exist
```
