# Contributing to Amy's Echo

Thanks for your interest in improving Amy's Echo! This project supports one child, so every contribution must be made with care.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/planning/todo.md` file serves as a living document for ongoing improvements.

## Getting Started
- Read `AGENTS.md` for workflow and `spec/AmysEcho.md` for the project requirements.
- Run `npm install` in the repo root to install shared tools.
- Each package has its own dependencies; run `npm install` inside `webapp/`, `server/`, and `integration/` when working there.

## Development Workflow
1. Create your changes on top of `main` and keep commits focused.
2. Run the full test suite before submitting:
   ```bash
   npm run type-check --prefix webapp
   npm test --prefix webapp
   pip install -r server/requirements.txt
   npm test --prefix server
   npm test --prefix integration
   ```
   Or run `./scripts/full-check.sh` from the repo root to execute all of the above checks.
3. Update `docs/planning/todo.md` when completing a task from the action plan.
4. Submit a pull request with a clear description of the change and its motivation.

## Code Style
- TypeScript uses strict mode; keep types explicit.
- Prefer functional components in React.
- Write tests for new functionality or regression fixes.

## Commit Guidelines
- Use present tense, e.g., `Add onboarding test`.
- Reference relevant tasks or issues when possible.
- Avoid committing generated files or local environment changes.

Thank you for helping turn Amy's gestures into understanding.
