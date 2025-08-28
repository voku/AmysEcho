# AGENTS.md - Amy's Echo Contributor Guide

Amy's Echo is a multimodal communication platform for non-verbal children. This guide defines how to work in this repository. Favor real implementations over mocks and do not skip tests.

For guidelines specific to the application or server, see the `AGENTS.md` files within the `app/` and `server/` directories. Paths in this document are relative to the repository root unless noted otherwise.

## AI Assistant Workflow

**IMPORTANT**: AI assistants (Codex, Gemini, etc.) must follow this step-by-step approach:

### 1. Discovery Phase (ALWAYS do this first)
- **Read the TODO.md or task description completely**
- **Examine the existing codebase structure** using `find` or `ls` commands
- **Study similar existing files** - look for patterns, naming conventions, and architectural decisions
- **Run the test suite** to understand current functionality and ensure nothing is broken
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
   - Server: services in `server/src/services/*`, tools in `server/src/tools/*`, tests in `server/test/*`.
4. **Plan thoroughly** before implementing - explain your approach and get feedback if possible.
5. **Implement** changes in the proper directory. Do not introduce unnecessary abstractions or large mock setups.
6. **Use German for all user-facing text and error messages in the app.**

## Automated Agent Workflow (`auto-agent.sh`)

For complex, iterative tasks like fixing a large number of type errors or refactoring a module, an automated agent script is available. This script, `scripts/auto-agent.sh`, runs the Gemini CLI in a loop, feeding the results of one run into the prompt for the next. This creates a continuous feedback cycle that allows the agent to work towards a goal autonomously.

**Prerequisite**: The workflow requires the Gemini CLI to be installed and configured on the host machine. Container-only environments may not include Gemini, so confirm availability with the user before attempting to run `scripts/auto-agent.sh`.

### How it Works

1.  **Initial Prompt**: The loop starts with a high-level goal defined in a prompt file (by default, `docs/TODO.md`).
2.  **Execution**: It runs the Gemini CLI in a non-interactive mode (`--approval-mode yolo`) and saves the full output to a log file in `logs/gemini/`.
3.  **Analysis**: After each run, the script analyzes the log for error patterns (e.g., `TypeScript error`, `failed`).
4.  **Follow-up Prompt**: It then generates a new prompt for the next iteration. 
    - If errors were found, the new prompt instructs the agent to fix the errors, providing the full log of the failed run as context.
    - If no errors were found, the prompt instructs the agent to continue the task based on the summary of the last run.
5.  **Loop**: The process repeats until a maximum number of retries is reached.

### How to Use

**To start the agent:**

```bash
# Start the agent in the background
nohup bash scripts/auto-agent.sh &

# Save its PID for easy access
echo $! > logs/gemini/auto_last_pid
```

**To monitor the agent's progress:**

```bash
# Tail the main log for the entire session
tail -f $(ls -1t logs/gemini/agent-run-*.log | head -n1)

# Tail the log of the current, active Gemini run
tail -f $(ls -1t logs/gemini/run-*.log | head -n1)
```

**To stop the agent:**

```bash
kill $(cat logs/gemini/auto_last_pid)
```

### Best Practices

-   **Use for focused tasks**: This tool is most effective when the initial prompt (`docs/TODO.md`) is clear and specific (e.g., "Fix all TypeScript errors in the `app/src/services` directory").
-   **Monitor the first few runs**: Check the logs to ensure the agent is on the right track before leaving it to run unattended.
-   **Review the results**: After the agent finishes, review the code changes and test them thoroughly. The agent is a tool to accelerate development, not replace human oversight.

## Testing Rules

- Never skip or comment out existing tests. Update them when behavior changes.
- Use mocks sparingly; only mock network or other system boundaries.
- Write tests for new functionality before or alongside implementation.
- Ensure all tests pass before considering work complete.

## Commands to Run from Repository Root

```bash
npm ci --prefix app
npm run type-check --prefix app
npm test --prefix app
(cd app && npx expo install --check)
# Optional: `expo-doctor` can fail when offline; run when networked
(cd app && npx expo-doctor || echo "expo-doctor skipped/failed (non-blocking)")
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
| React Native app                         | `app/`                 |
| App screens                              | `app/src/screens/`     |
| App components                           | `app/src/components/`  |
| App tests                                | `app/test/`            |
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

- **Local environment unknown** – tools like Gemini or `auto-agent.sh` may not be installed. Confirm with the user before relying on them.
- **External configuration assumptions** – hardware, permissions, or OS differences can affect outcomes. Ask users to highlight special constraints.
- **Hidden dependencies** – undocumented packages or services may be required. Request explicit dependency lists or installation steps.
- **Opaque runtime failures** – some commands may fail silently. Encourage verbose logging and sharing of error output.
- **User-specific settings** – API keys or environment variables can change behavior. Ask which configuration values are needed (without requesting secrets).
- **Incomplete validation steps** – missing tests or manual checks lead to gaps. Verify instructions and request clarification when necessary.
- **Context drift** – documentation and code can become unsynchronized. Prompt contributors to keep them aligned.
- **Time-limited visibility** – uncommitted or in-progress work is invisible. Ask about relevant WIP.
- **Need for human oversight** – automated checks cannot replace human judgment. Ensure final review and real-world testing.
