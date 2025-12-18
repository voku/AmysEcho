# Copilot Coding Agent Instructions for Amy's Echo

## Repository overview
- **Mission:** Amy's Echo is a multimodal communication platform for non-verbal children focused on Deutsche Gebärdensprache (DGS) capture, training, and playback.
- **Principles:** Follow the Amy First commitments in `AGENTS.md` (zero interruption/confusion/delay/failure/judgment/compromise) and favor reliability over cleverness.
- **Source layout:**
  - `webapp/` React + TypeScript (Vite) UI; gesture pipeline in `webapp/src/gesture/`, training queue in `webapp/src/training/`.
  - `server/` Node/TypeScript API plus Python training tools in `server/src/amyserver_tools/`.
  - `integration/` end-to-end tests that exercise the full training loop.
  - Docs live in `docs/` (start with `docs/TODO.md` for current priorities).

## How to work
1. **Start with discovery:** Read `docs/TODO.md`, skim relevant folders, and mirror existing patterns. Prefer real implementations over mocks.
2. **Plan before coding:** Outline the files you will change, patterns you will follow, and tests you will run. Keep changes incremental.
3. **German UI text:** Every user-facing string must be in German. Developer-facing comments/logs/tests may remain English.
4. **Testing discipline:** Never skip or comment out tests. Add/adjust coverage alongside code changes. Verify type checks and linting before finishing.
5. **Documentation:** Update `docs/` or in-repo READMEs whenever behavior or workflows change.

## Build and test commands (run from repo root)
- **Webapp:**
  - Install: `npm ci --prefix webapp`
  - Type check: `npm run type-check --prefix webapp`
  - Lint: `npm run lint --prefix webapp`
  - Tests: `npm test --prefix webapp`
  - Build: `npm run build --prefix webapp`
- **Server:**
  - Install: `npm ci --prefix server` and `pip install -r server/requirements.txt`
  - Type check: `npm run type-check --prefix server`
  - Tests: `npm test --prefix server`
- **Integration:**
  - Install: `npm ci --prefix integration`
  - Tests: `npm test --prefix integration`

## Coding conventions to remember
- Keep user-facing flows simple with instant feedback and layered fallbacks.
- Avoid default exports in the webapp; prefer named exports that mirror existing modules.
- Follow established component/hook/service structures; do not introduce new architecture without strong justification.
- Minimize mocking—only mock true system boundaries (network, filesystem, etc.).
- Handle secrets safely; never commit keys or credentials.

## Quick pre-PR checklist
- [ ] I read `docs/TODO.md` and aligned the change with current priorities.
- [ ] I followed Amy First principles and used German for all user-visible text.
- [ ] I updated or added tests and ran the relevant commands above.
- [ ] I updated documentation where behavior changed.
- [ ] I kept the implementation small, clear, and consistent with neighboring code.
