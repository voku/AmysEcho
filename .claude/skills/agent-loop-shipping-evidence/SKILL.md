---
name: agent-loop-shipping-evidence
description: Prove merged, shipped, or released claims against an exact candidate SHA and exact integrated commit instead of branch names or historical PR state.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Shipping Evidence

**Trigger Anchor:** Merged, shipped, or released claim -> prove exact candidate SHA against integrated SHA and target ref via `agent-loop verify`, never trust branch names or closed PR metadata.

## Invariant

A branch name, PR number, `merged=true`, or past closed PR status is NOT shipping evidence.
Freeze the candidate SHA **after** any rebase, then identify the exact integrated commit:

```bash
vendor/bin/agent-loop verify \
  --candidate-sha=<full-source-candidate-sha> \
  --integrated-sha=<full-integrated-sha> \
  --target-ref=<target-branch-or-frozen-ref> \
  --format=toon
```

The check resolves the target ref to an exact commit and proves:
1. `candidate -> integrated` by Git ancestry (or `candidate tree == integrated tree` for squash merges).
2. `integrated -> target` by Git ancestry.

### Bad vs Good Shipping Claim

### Bad
```text
# Unverified claim based on remote metadata
"The PR #42 was merged into main, so the bug fix is shipped."
```

### Good
```bash
# Exact cryptographic verification of integrated ancestry
vendor/bin/agent-loop verify \
  --candidate-sha=9f83a2e7c41b80d5... \
  --integrated-sha=e4b2d1c981a0f32a... \
  --target-ref=main \
  --format=toon
```

## Release Claims

For a tagged release claim, bind the proof to the exact tag:

```bash
vendor/bin/agent-loop verify \
  --candidate-sha=<full-source-candidate-sha> \
  --integrated-sha=<full-integrated-sha> \
  --target-ref=main \
  --release-tag=<version> \
  --format=toon
```

For cross-package work, a local Composer path repository is development evidence only. Shipped status requires released dependency versions passing the clean-consumer gate.
