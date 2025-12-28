# Copilot Coding Agent Instructions for Amy's Echo

## Repository overview
- **Mission:** Amy's Echo is a multimodal communication platform for non-verbal children focused on Deutsche Gebärdensprache (DGS) capture, training, and playback.
- **Project Status:** This project is in a mature state. All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness.
- **Source layout:**
  - `webapp/` React + TypeScript (Vite) UI with structured directories:
    - `src/components/` UI components
    - `src/hooks/` custom React hooks
    - `src/gesture/` gesture recognition pipeline
    - `src/training/` training queue and workflows
    - `src/services/` API clients and external services
    - `src/context/` React context providers
    - `src/types/` TypeScript type definitions
    - `src/utils/` utility functions
  - `server/` Node/TypeScript API plus Python training tools in `server/src/amyserver_tools/`.
  - `integration/` end-to-end tests that exercise the full training loop.
  - Docs live in `docs/` (start with `docs/planning/TODO.md` for current priorities).

### Additional Resources
- **Development Workflow**: See `docs/workflows/DEVELOPMENT_WORKFLOW.md` for detailed Amy First development processes
- **Testing Strategy**: See `docs/testing/TESTING_STRATEGY.md` for comprehensive testing guidelines
- **Current Status**: See `docs/planning/TODO.md` for up-to-date implementation status

## 🚨 AMY FIRST DEVELOPMENT PRINCIPLES

**CRITICAL**: Every line of code must enhance Amy's ability to communicate. When in doubt, choose reliability over elegance, simplicity over features, and Amy's needs over technical metrics.

### Amy First Commitments
- ✅ **Zero interruption** - Amy's communication never pauses
- ✅ **Zero confusion** - Simple, clear UI always
- ✅ **Zero delay** - Instant feedback for everything
- ✅ **Zero failure** - Multiple fallback layers
- ✅ **Zero judgment** - Celebrate attempts, not just success
- ✅ **Zero compromise** - Amy's needs come first

### Pre-Implementation Checklist
**Complete ALL items before writing code:**
- [ ] **Read the TODO.md completely** - Understand Amy's needs
- [ ] **Identify the "Amy Impact"** - How does this help Amy communicate?
- [ ] **Check existing implementation** - Don't duplicate work
- [ ] **Verify against Amy First principles** - Does this enhance communication?
- [ ] **Test current functionality** - Ensure nothing breaks
- [ ] **Document the "why"** - Explain how this serves Amy

## AI Assistant Workflow

**IMPORTANT**: Follow this step-by-step approach:

### 1. Discovery Phase (ALWAYS do this first)
- **Read the `docs/planning/TODO.md` or task description completely** to understand the current priorities.
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
- **Use German for all user-facing text and any error messages that Amy sees in the app.** Developer-facing logs, console output, and internal identifiers can remain in English.
- **Update the documentation** to reflect your changes. This includes the `docs/` directory and any relevant `README.md` files.

### 4. Verification Phase (MANDATORY)
- **Run the full test suite** - all tests must pass
- **Verify type checking** - no TypeScript errors
- **Test the actual functionality** - don't assume it works because tests pass
- **Check for integration issues** - ensure your changes work with existing features

## Build and test commands (run from repo root)

> **Note:** You can also run `./scripts/full-check.sh` to execute most of the checks below.
- **Webapp:**
  - Install: `npm ci --prefix webapp`
  - Type check: `npm run type-check --prefix webapp`
  - Lint: `npm run lint --prefix webapp`
  - Tests: `npm test --prefix webapp`
  - Build: `npm run build --prefix webapp`
- **Server:**
  - Install: `npm ci --prefix server` and `pip install -r server/requirements.txt` (preferably in a Python virtual environment)
  - Type check: `npm run type-check --prefix server`
  - Tests: `npm test --prefix server`
  - Build: `npm run build --prefix server`
- **Integration:**
  - Install: `npm ci --prefix integration`
  - Tests: `npm test --prefix integration`

## Testing Rules

- Never skip or comment out existing tests. Update them when behavior changes.
- Use mocks sparingly; only mock network or other system boundaries.
- Write tests for new functionality before or alongside implementation.
- Ensure all tests pass before considering work complete.
- Review the generated test coverage report to spot untested paths.

## Coding conventions to remember
- Keep user-facing flows simple with instant feedback and layered fallbacks.
- Avoid default exports in the webapp; prefer named exports that mirror existing modules.
- Follow established component/hook/service structures; do not introduce new architecture without strong justification.
- Minimize mocking—only mock true system boundaries (network, filesystem, etc.).
- Handle secrets safely; never commit keys or credentials.

## Shell Command Conventions
- Use `rg` (ripgrep, may require installation) for searching code (e.g., `rg -n -C3 "symbol(" --type=ts`); `grep -R` is acceptable if `rg` is unavailable.
- Use `ls` for directory listings. Avoid recursive `ls -R` unless necessary.

## Common AI Assistant Mistakes to Avoid

1. **Don't implement without understanding** - rushing to code without studying existing patterns
2. **Don't skip the discovery phase** - always explore the codebase first
3. **Don't create new architectural patterns** - follow existing conventions
4. **Don't assume tests pass** - always run them to verify
5. **Don't ignore type errors** - fix all TypeScript issues
6. **Don't mock internal app code** - only mock external boundaries
7. **Don't leave broken tests** - all tests must pass when you're done

## Questions AI Assistants Should Ask

Before starting implementation, consider:
- "What similar functionality already exists that I can learn from?"
- "What existing tests can guide my understanding?"
- "How do other components handle similar use cases?"
- "What patterns are already established for this type of change?"
- "Are there any integration points I need to be aware of?"

## AI Assistant Blind Spots and Mitigations

- **Local environment unknown** – specialized tools may not be installed. Confirm availability before relying on them.
- **External configuration assumptions** – hardware, permissions, or OS differences can affect outcomes. Ask users to highlight special constraints.
- **Hidden dependencies** – undocumented packages or services may be required. Request explicit dependency lists or installation steps.
- **Opaque runtime failures** – some commands may fail silently. Encourage verbose logging and sharing of error output.
- **User-specific settings** – API keys or environment variables can change behavior. Ask which configuration values are needed (without requesting secrets).
- **Incomplete validation steps** – missing tests or manual checks lead to gaps. Verify instructions and request clarification when necessary.
- **Context drift** – documentation and code can become unsynchronized. Prompt contributors to keep them aligned.
- **Time-limited visibility** – uncommitted or in-progress work is invisible. Ask about relevant WIP.
- **Need for human oversight** – automated checks cannot replace human judgment. Ensure final review and real-world testing.

## Quick pre-PR checklist
- [ ] I read `docs/planning/TODO.md` and aligned the change with current priorities.
- [ ] I followed Amy First principles and used German for all user-visible text.
- [ ] I updated or added tests and ran the relevant commands above.
- [ ] I updated documentation where behavior changed.
- [ ] I kept the implementation small, clear, and consistent with neighboring code.
