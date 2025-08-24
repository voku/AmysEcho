# AGENTS.md - Amy's Echo Contributor Guide

Amy's Echo is a multimodal communication platform for non-verbal children. This guide defines how to work in this repository. Study the existing code and tests before writing new code. Favor real implementations over mocks and do not skip tests.
For guidelines specific to the application or server, see the `AGENTS.md` files in the `app/` and `server/` directories.
Paths in this document are relative to the repository root unless noted otherwise.

## Workflow

1. **Read the spec**: `/spec/AmysEcho.md` is the source of truth.
2. **Check the TODOs**: `docs/TODO.md` lists actionable tasks.
3. **Understand existing code**: look at similar files and tests to follow established patterns.
   - App: `app/src/components/*`, hooks in `app/src/*/use*.ts`, tests in `app/test/*`.
   - Server: services in `server/src/services/*`, tools in `server/src/tools/*`, tests in `server/test/*`.
4. **Implement** changes in the proper directory. Do not introduce unnecessary abstractions or large mock setups.
5. **Test** your work (see Testing below).
6. **Commit and document** your changes.

## Testing

- Never skip or comment out existing tests. Update them when behavior changes.
- Use mocks sparingly; only mock network or other system boundaries.
- From the repository root run:

```bash
npm ci --prefix app
npm run type-check --prefix app
npm test --prefix app
(cd app && npx expo install --check)
(cd app && npx expo-doctor || echo "expo-doctor skipped/failed (non-blocking)")
npm ci --prefix server
npm run type-check --prefix server
pip install -r server/requirements.txt
npm test --prefix server
npm test --prefix integration
```

## Directory Overview

| Purpose                                  | Location            |
|------------------------------------------|---------------------|
| Project specification                    | `/spec/AmysEcho.md` |
| Implementation tasks                     | `docs/TODO.md`      |
| React Native application                 | `app/`              |
| Node/TS server and Python utilities      | `server/`           |
| Server services                          | `server/src/services/` |
| Server tools (Python/TS scripts)         | `server/src/tools/` |
| Integration tests                        | `integration/`      |
| Documentation                            | `docs/`             |

## Shell Conventions

- Use `rg` for searching code (e.g., `rg -n -C3 "symbol\(" --type=ts`); `grep -R` is acceptable if `rg` is unavailable.
- Use `ls` for directory listings. Avoid recursive `ls -R` unless necessary.
