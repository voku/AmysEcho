# AGENTS.md - App Guidelines

Scope: All files under `app/`.

**Project Status:** All major features for the app have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## AI Assistant Workflow

**IMPORTANT**: AI assistants must follow this step-by-step approach:

### 1. Discovery Phase (ALWAYS do this first)
- **Read the `docs/TODO.md` or task description completely** to understand the current priorities.
- **Review the existing documentation** in the `docs/` directory to understand the project's architecture and features.
- **Examine the existing codebase structure** using `find` or `ls` commands.
- **Study similar existing files** - look for patterns, naming conventions, and architectural decisions.
- **Run the test suite** to understand current functionality and ensure nothing is broken.
- **Check dependencies and configuration files** (`package.json`, `tsconfig.json`, etc.)

### 2. Planning Phase (Before any implementation)
- **Create a detailed implementation plan** that explains:
  - Which files need to be created/modified
  - What existing patterns you'll follow
  - How your changes integrate with current architecture
  - What tests need to be added/updated
- **Identify potential breaking changes** and mitigation strategies
- **Plan your testing approach** - don't just implement features, plan how to verify they work

### 3. Implementation Phase
- **Start with tests** when adding new functionality (TDD approach)
- **Make small, incremental changes** - don't implement everything at once
- **Follow existing code patterns exactly** - don't introduce new architectural concepts without justification
- **Test continuously** - run relevant tests after each significant change

### 4. Verification Phase (MANDATORY)
- **Run the full test suite** - all tests must pass
- **Verify type checking** - no TypeScript errors
- **Test the actual functionality** - don't assume it works because tests pass
- **Check for integration issues** - ensure your changes work with existing features

## General Workflow

1. **Study the task**: read `docs/TODO.md`, issue description, or requirements completely.
2. **Explore codebase**: understand the current state and patterns.
3. **Understand existing code**: look at similar files and tests to follow established patterns.
   - App: `app/src/components/*`, hooks in `app/src/hooks/`, tests in `app/test/*`.
4. **Plan thoroughly** before implementing - explain your approach and get feedback if possible.
5. **Implement** changes in the proper directory. Do not introduce unnecessary abstractions or large mock setups.
6. **Use German for all user-facing text and error messages in the app.**
7. **Update the documentation** to reflect your changes. This includes the `docs/` directory and any relevant `README.md` files.

