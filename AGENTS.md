# AGENTS.md - Amy's Echo Contributor Guide

Amy's Echo is a multimodal communication platform for non-verbal children. This guide defines how to work in this repository. Favor real implementations over mocks and do not skip tests.

For guidelines specific to the server, see the `AGENTS.md` file within the `server/` directory. Paths in this document are relative to the repository root unless noted otherwise.

### Additional Resources
- **Development Workflow**: See `docs/DEVELOPMENT_WORKFLOW.md` for detailed Amy First development processes
- **Testing Strategy**: See `docs/TESTING_STRATEGY.md` for comprehensive testing guidelines
- **Current Status**: See `docs/TODO.md` for up-to-date implementation status (now accurately reflects reality)

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
- [x] **Read the TODO.md completely** - Understand Amy's needs
- [x] **Identify the "Amy Impact"** - How does this help Amy communicate?
- [x] **Check existing implementation** - Don't duplicate work
- [x] **Verify against Amy First principles** - Does this enhance communication?
- [x] **Test current functionality** - Ensure nothing breaks
- [x] **Document the "why"** - Explain how this serves Amy

## Project Status

This project is in a mature state. All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

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

## LLM-Optimized Code Patterns

**IMPORTANT**: This codebase is developed by LLM agents and should be optimized for LLM understanding and modification.

### Code Optimization Principles for LLMs

1. **Prefer Standard Library APIs Over Custom Abstractions**
   - ✅ Use `Date.now()` instead of custom timestamp wrappers
   - ✅ Use `.filter()`, `.map()`, `.reduce()` instead of custom array utilities
   - ✅ Standard APIs are trained knowledge - LLMs understand them instantly
   - ❌ Avoid custom abstractions that require "mental mapping"

2. **When to Extract Functions (LLM-Optimized)**
   - ✅ Extract when logic is complex AND used multiple times
   - ✅ Extract when the function name clearly describes what it does
   - ✅ Extract when it reduces total token count significantly
   - ❌ Don't extract simple one-liners like `Date.now() - timestamp`
   - ❌ Don't create wrapper functions around standard APIs

3. **Duplication Guidelines**
   - **Small duplications are OK** - `const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)` can be duplicated
   - **Large duplications should be extracted** - Complex algorithms, multi-step processes
   - **Standard patterns are OK** - `.filter(x => x.success).length / total` is clear
   - **Business logic should be centralized** - Amy-specific logic belongs in dedicated services

4. **Token Efficiency**
   - Shorter code isn't always better for LLMs
   - Standard patterns require less cognitive load than custom abstractions
   - LLMs process `Date.now()` faster than `getCurrentTimestamp()` because it's trained knowledge

### Examples

**❌ Over-abstracted (harder for LLMs)**:
```typescript
const cutoff = getDaysCutoff(7);
const recent = filterByTimeWindow(items, windowMs);
const rate = calculateSuccessRate(recent);
```

**✅ LLM-optimized (clear standard patterns)**:
```typescript
const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
const recent = items.filter(item => item.timestamp > cutoff);
const rate = recent.filter(r => r.success).length / recent.length;
```

**✅ When to extract (complex, reused logic)**:
```typescript
// This is complex enough to extract
function calculateGestureConfidenceWithContext(
  baseConfidence: number,
  recentHistory: GesturePattern[],
  userHabits: CommunicationHabit[]
): number {
  // 20+ lines of complex scoring logic
  // Used in multiple places
  // Name clearly describes purpose
}
```

## General Workflow

1. **Study the task**: read `docs/TODO.md`, issue description, or requirements completely.
2. **Explore codebase**: understand the current state and patterns.
3. **Understand existing code**: look at similar files and tests to follow established patterns.
   - Webapp: `webapp/src/components/*`, hooks in `webapp/src/hooks/`, tests alongside source files.
   - Server: services in `server/src/services/*`, tools in `server/src/tools/*`, tests in `server/test/*`.
4. **Plan thoroughly** before implementing - explain your approach and get feedback if possible.
5. **Implement** changes in the proper directory. Follow LLM-optimized code patterns (see above).
6. **Use German for all user-facing text and any error messages that Amy sees in the app. Developer-facing logs, console output, and internal identifiers can remain in English.**
7. **Update the documentation** to reflect your changes. This includes the `docs/` directory and any relevant `README.md` files.

## Testing Rules

- Never skip or comment out existing tests. Update them when behavior changes.
- Use mocks sparingly; only mock network or other system boundaries.
- Write tests for new functionality before or alongside implementation.
- Ensure all tests pass before considering work complete.
- Review the generated test coverage report to spot untested paths.

## Commands to Run from Repository Root

```bash
npm ci --prefix webapp
npm run type-check --prefix webapp
npm run lint --prefix webapp
npm test --prefix webapp
npm run build --prefix webapp
npm ci --prefix server
npm run type-check --prefix server
pip install -r server/requirements.txt
npm test --prefix server
npm ci --prefix integration
npm test --prefix integration
```

## Directory Structure

| Component                                | Path                   |
| ---------------------------------------- | ---------------------- |
| Web application                          | `webapp/`              |
| Webapp components                        | `webapp/src/components/`|
| Webapp hooks                             | `webapp/src/hooks/`    |
| Webapp gesture code                      | `webapp/src/gesture/`  |
| Server services                          | `server/src/services/` |
| Server TypeScript tools                  | `server/src/tools/`    |
| Server Python tools                      | `server/src/amyserver_tools/` |
| Server tests                             | `server/test/`         |
| Node/TS server and Python utilities      | `server/`              |
| Integration tests                        | `integration/`         |

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