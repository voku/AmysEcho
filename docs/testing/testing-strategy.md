# Amy's Echo Testing Strategy - Amy First Edition

## 🎯 Testing Mission
**Ensure Amy's communication works reliably, especially when she needs it most.**

> ℹ️ **Hinweis:** Dieses Dokument bezieht sich auf das aktuelle Webapp-Test-Setup.

## 📊 Test Coverage Goals

### Critical Communication Paths (P0)
- [ ] **Emergency gesture detection**: 100% coverage
- [ ] **Gesture history & replay**: 100% coverage
- [ ] **Automatic recovery system**: 100% coverage
- [ ] **Zero-downtime model updates**: 100% coverage
- [ ] **Pre-cached responses**: 100% coverage

### Core Functionality (P1)
- [ ] **Gesture recognition accuracy**: >90% coverage
- [ ] **Error handling**: >85% coverage
- [ ] **Performance under stress**: >80% coverage
- [ ] **Accessibility features**: >90% coverage

### Supporting Features (P2)
- [ ] **UI components**: >70% coverage
- [ ] **Utility functions**: >60% coverage
- [ ] **Integration tests**: >50% coverage

## ✅ Enforced Coverage Baseline (CI Gate)

To prevent coverage regressions, the webapp test pipeline now enforces a minimum V8 coverage baseline:

- Statements: **68%**
- Branches: **57%**
- Functions: **70%**
- Lines: **70%**

The gate runs in CI via `npm --prefix webapp run test:coverage` and fails the build if any threshold drops below baseline.

The branch threshold is intentionally lower as a **current floor** (close to measured baseline) to prevent regressions while the suite is still expanding. Treat it as transitional, and raise it incrementally (target: **65% branches** in the next quality-improvement cycle).

## ♿ Manual Accessibility Verification Cadence

- Governance source: `docs/security/governance-cadence.md`
- First completed cycle artifact: `docs/testing/accessibility-cycle-2026-q1.md`
- Latest completed cycle artifact: `docs/testing/accessibility-cycle-2026-q2.md`
- Required cadence:
  - monthly security governance record (release gate input),
  - quarterly manual accessibility cycle (keyboard + screen reader + reduced motion).


## 🔍 Bug-Finding Workflow (TDD + Context-Driven)

To increase **real quality** (not only coverage), use a structured loop that stays flexible to context:

1. **Choose a risk scenario first**
   - e.g. expired session (`401`), validation reject (`4xx`), transient network failure, stale cache/race conditions.
   - prioritize scenarios that can confuse Amy/caregivers or break communication continuity.

2. **Check existing solutions before implementing**
   - search for similar patterns in the codebase (`rg`) and confirm whether this problem is already solved elsewhere.
   - prefer reusing established mechanisms (for example shared retry/auth/error utilities) when they fit.
   - if a local fix is better, document why reuse was not chosen.

3. **Write a test for expected behavior (usually first)**
   - in most cases, start with a failing regression test (red).
   - if setup constraints require it, you may iterate test+code in small steps, but preserve the bug-reproduction evidence.
   - assert both internal state and user-visible outcome where relevant.

4. **Validate failure reason before fixing**
   - confirm the test fails for the intended bug (not for flaky setup/mocks).
   - adjust test scaffolding first if the failure signal is noisy.

5. **Implement and evaluate fix options**
   - choose the simplest robust fix when appropriate, but not blindly.
   - check whether the same pattern exists in other modules and whether a broader/shared fix is safer.
   - avoid refactor-only churn unless required for correctness.

6. **Verify at multiple levels**
   - focused test(s) for the touched area,
   - type-check,
   - broader suite to catch integration regressions.

7. **Document the lesson**
   - capture reusable guardrails in this strategy document (or linked docs) so future chats catch the class earlier.

### PR Quality Bar (recommended)
- Include at least one non-happy-path test for changed logic paths.
- Include at least one user-visible assertion where UX can diverge from server/internal state.
- In the PR description, summarize: **repro → test signal → chosen fix approach → verification**.

### Pattern Reuse & Cross-Codebase Checks
Before finalizing a fix, quickly validate:
- Does a shared utility/service already address this class of issue?
- Are there duplicate implementations that should be aligned?
- Does the same bug pattern appear in nearby modules (same API flow, same cache/update pattern, same retry logic)?

### Example Guardrails from SymbolStore work
- Avoid reporting global sync success when nothing was actually uploaded successfully.
- Avoid local state changes that falsely imply server success (e.g., auth-failed delete).
- Keep pending/queue state deterministic after partial failures to prevent stale re-merge/retry churn.
- Trigger background retries only when there is actionable pending work.


## 🧭 Identity Model Guardrails: Account vs. User/Profile

Amy's Echo uses two related but different identity concepts that must stay separated in code and tests:

- **Account (Konto)**
  - Authentication identity from register/login (caregiver-facing auth context).
  - Owns session/token lifecycle (login, refresh, logout, password reset, account deletion/change password).
- **User/Profile (Kind-Profil)**
  - Communication identity used for recognition/training/personalization.
  - Carries `profileId`, model scope, uploads, gesture history, and per-child settings.

### Practical boundary by UI flow
- **Register/Login**: validates account/session behavior and bootstraps profile linkage, but must not silently replace profile-scoped data assumptions.
- **Settings**: account actions (credentials/session) and profile actions (active profile, profile export/management) must be tested as separate concerns.
- **Uploads/Training**: requests must be scoped by active `profileId`; a valid account token is required but not a substitute for profile selection.

### Test checklist for identity-related changes
When touching auth/profile/upload code, add/verify tests for:
1. **Auth success + missing/invalid profile linkage** (must fail safely with clear message).
2. **Valid token + missing profile context** (upload/training must be blocked).
3. **Profile switch during active session** (requests target new profile, not stale one).
4. **Session expiry (`401`) during profile operations** (no false local success, preserve server truth).
5. **Account-level actions do not mutate wrong profile state** (and vice versa).

### Naming recommendation for tests and docs
To avoid ambiguity in future chats and PRs:
- use **account/konto** for authentication/session constructs,
- use **profile/user/child profile** for communication/training scope.

If legacy code uses `user` for both, tests should explicitly assert which identity is intended.

## 📐 Canonical Training/Runtime Contract Guardrails

To prevent cross-layer drift in Amy's training flow, treat these contracts as canonical:

- **Runtime frame batches:** `webapp/src/types/frames.ts` (`FrameBatchPayload`).
  - Includes `landmarks` and optional `frames`, `handednesses`, `poseLandmarks`, `faceLandmarks`, `timestamps`.
  - Hooks/components must import this shared type instead of redefining local payload interfaces.
- **Trained-label source of truth:** `server/data/datasets/training_manifest.json` entries loaded via server manifest APIs.
  - The trained-label response should be derived from canonical manifest entries for the requested profile.
  - Avoid reintroducing prelaunch fallback paths that read legacy label stores for this endpoint.

### Contract Regression Checks

- Add/keep unit tests that fail when payload fields are dropped or renamed.
- Add/keep tests ensuring label normalization/deduplication (case, UUID suffix, Unicode normalization) still works on manifest-derived labels.

## 🧪 Test Categories

### 1. Communication Reliability Tests
**Priority: CRITICAL - Amy must be able to communicate**

#### Emergency Gesture Tests
```typescript
describe('Emergency Gesture Detection', () => {
  it('should detect "hilfe" gesture within 50ms', async () => {
    // Test emergency gesture priority processing
  });

  it('should work at 1% battery with full functionality', async () => {
    // Test emergency gestures under resource constraints
  });

  it('should bypass all throttling and delays', async () => {
    // Test emergency priority queue
  });
});
```

#### Gesture History Tests
```typescript
describe('Gesture History Service', () => {
  it('should store last 10 gestures for instant replay', async () => {
    // Test gesture history persistence
  });

  it('should replay gesture with original audio response', async () => {
    // Test instant replay functionality
  });

  it('should maintain history across app restarts', async () => {
    // Test persistence and recovery
  });
});
```

#### Automatic Recovery Tests
```typescript
describe('Automatic Recovery System', () => {
  it('should recover from gesture pipeline crashes without user intervention', async () => {
    // Test automatic error recovery
  });

  it('should attempt multiple recovery strategies', async () => {
    // Test fallback recovery mechanisms
  });

  it('should log recovery attempts for caregiver review', async () => {
    // Test caregiver logging without showing to Amy
  });
});
```

### 2. Performance & Stress Tests
**Priority: HIGH - Must work when Amy needs it most**

#### Battery Performance Tests
```typescript
describe('Low Battery Performance', () => {
  it('should maintain full gesture recognition at 5% battery', async () => {
    // Test performance under battery constraints
  });

  it('should not throttle recognition for battery optimization', async () => {
    // Test Amy First principle: no throttling
  });
});
```

#### Network Failure Tests
```typescript
describe('Network Failure Handling', () => {
  it('should switch to offline mode seamlessly', async () => {
    // Test graceful network failure handling
  });

  it('should use cached responses when offline', async () => {
    // Test pre-cached response system
  });
});
```

#### Memory Stress Tests
```typescript
describe('Memory Management', () => {
  it('should maintain stable memory usage over 24 hours', async () => {
    // Test long-term memory stability
  });

  it('should recover from memory pressure gracefully', async () => {
    // Test memory recovery mechanisms
  });
});
```

### 3. Accessibility Tests
**Priority: HIGH - Must work for Amy's cognitive and motor needs**

#### Cognitive Load Tests
```typescript
describe('Cognitive Accessibility', () => {
  it('should show only encouraging messages during errors', async () => {
    // Test child-friendly error handling
  });

  it('should provide instant visual feedback for every attempt', async () => {
    // Test visual confirmation system
  });
});
```

#### Motor Accessibility Tests
```typescript
describe('Motor Accessibility', () => {
  it('should accept partial gesture completion', async () => {
    // Test tremor compensation
  });

  it('should adapt to Amy's gesture size preferences', async () => {
    // Test gesture size tolerance
  });
});
```

### 4. Integration Tests
**Priority: MEDIUM - Ensure all components work together**

#### End-to-End Communication Tests
```typescript
describe('End-to-End Communication', () => {
  it('should process gesture from detection to audio response in <100ms', async () => {
    // Test complete communication pipeline
  });

  it('should maintain communication during model updates', async () => {
    // Test zero-downtime updates
  });
});
```

## 🔧 Test Infrastructure

### Timer-driven Hooks & React 19 Compatibility
Validate timer-driven polling flows (for example, `useTrainingUploader`) in integration tests when React 19's strict effect lifecycle prevents setTimeout-based polling from executing in unit tests. 

**Best Practice**: When you encounter tests that rely on timer-based effects:
1. ✅ **Convert to integration tests** - Move to `integration/test/` for full lifecycle testing
2. ✅ **Document the conversion** - Add comments explaining why (see `useTrainingUploader.test.tsx` lines 104-107, 142-145, 206-209, 237-240)
3. ❌ **Avoid `it.skip()`** - Skipped tests provide no regression value and violate the "never skip tests" rule; move such cases to `integration/test/` instead.
4. ⚠️ **Use fake timers sparingly** - Only when async storage or network mocks remain reliable under simulated time



### Blind-Spot Follow-up: Queue State vs. Retryability
Recent deep-dive analysis found a production-risk blind spot: the queue UI and manual sync summary can report "packages waiting" even when all remaining bundles are blocked by an expired session.

Guardrails:
- Return retry diagnostics from queue sync (`uploaded`, `remaining`, `blocked`) so UI messaging can distinguish connectivity issues from auth/session issues.
- Treat auth-failed bundles as retryable only when a valid token is available; skip them otherwise to avoid endless failing loops.
- Trigger automatic queue sync when a token becomes available again so caregivers do not need to manually re-record or clear bundles.

### Real Video Upload Integration Guardrail
Add and keep an integration test that uploads a **real video fixture** through the webapp helpers (`createTrainingZip` + `uploadTrainingZip`) into a spun-up server. This catches blind spots that unit tests miss:

1. Queue/API wiring can look correct in mocks while multipart/zip payloads still fail in live requests.
2. `metadata.recording` fields (`clipBytes`, `clipMimeType`, `clipDurationMs`) can drift and break server-side validation silently.
3. Upload success is not enough: verify the persisted bundle metadata and stored clip file remain consistent with the original fixture.

Reference implementation: `integration/test/webapp-video-upload.test.ts`.

### Test Utilities
```typescript
// test/utils/testHelpers.ts
export const createMockGesture = (gesture: string, confidence = 0.8) => ({
  id: gesture,
  label: gesture,
  confidence,
  timestamp: Date.now()
});

export const simulateLowBattery = () => {
  // Mock low battery conditions
};

export const simulateNetworkFailure = () => {
  // Mock network failure
};
```

### Training Recorder UI State
The training recorder UI contains complex banner/status logic that is shared between the live
recording screen and follow-up review states. Keep the derived text logic inside
`webapp/src/components/trainingRecorderUtils.ts` and cover it with unit tests in
`webapp/src/components/trainingRecorderUtils.test.ts` to guard against regressions when
refactoring the `TrainingRecorder` component.

### Test Data
```typescript
// test/fixtures/commonGestures.ts
export const commonGestures = [
  { id: 'hallo', label: 'Hallo', emoji: '👋' },
  { id: 'hilfe', label: 'Hilfe', emoji: '🆘' },
  { id: 'danke', label: 'Danke', emoji: '🙏' }
];
```

## 📈 Test Execution Strategy

### Continuous Integration
```yaml
# .github/workflows/test.yml
name: Amy First Testing
on: [push, pull_request]

jobs:
  test-communication:
    name: Test Critical Communication Paths
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Communication Tests
        run: npm test -- --testPathPattern=communication
      - name: Run Emergency Tests
        run: npm test -- --testPathPattern=emergency

  test-reliability:
    name: Test System Reliability
    runs-on: ubuntu-latest
    steps:
      - name: Run Recovery Tests
        run: npm test -- --testPathPattern=recovery
      - name: Run Performance Tests
        run: npm test -- --testPathPattern=performance
```

### Pre-Commit Hooks
```bash
#!/bin/sh
# .husky/pre-commit

# Run critical communication tests
npm test -- --testPathPattern="(communication|emergency)" --passWithNoTests

# Check for Amy First violations
npm run lint:amy-first
```

> ℹ️ **Schneller Fokuslauf:** Verwende `npm test -- <relativer/pfad/zur/datei.test.tsx>` innerhalb des `webapp/`-Ordners, um gezielt
> eine einzelne Testdatei auszuführen.

## 📊 Test Reporting

### Coverage Reports
```typescript
// test/utils/coverageReporter.ts
export const generateAmyFirstReport = (coverageData) => {
  const criticalPaths = [
    'services/gestureHistoryService',
    'services/automaticRecoveryService',
    'services/zeroDowntimeModelService'
  ];

  const report = {
    criticalPathCoverage: calculateCoverage(coverageData, criticalPaths),
    emergencyGestureTests: countTests('emergency'),
    recoveryTests: countTests('recovery'),
    performanceTests: countTests('performance')
  };

  return report;
};
```

### Test Reporting Note

Do not introduce a dedicated test dashboard as a product surface. Keep test
reporting in CI output, focused docs, and targeted fixtures instead.

## 🚨 Test Failure Handling

### Critical Test Failures
**If any of these tests fail, STOP deployment:**

1. Emergency gesture detection (<50ms response)
2. Gesture history persistence
3. Automatic recovery functionality
4. Zero-downtime model updates
5. Pre-cached response system

### Response Protocol
```typescript
// test/utils/failureHandler.ts
export const handleTestFailure = (testName: string, error: Error) => {
  if (isCriticalTest(testName)) {
    // Block deployment
    notifyTeam(`🚨 CRITICAL TEST FAILED: ${testName}`, error);
    return { action: 'block_deployment' };
  }

  if (isHighPriorityTest(testName)) {
    // Require manual review
    notifyTeam(`⚠️ HIGH PRIORITY TEST FAILED: ${testName}`, error);
    return { action: 'require_review' };
  }

  // Log and continue
  logWarning(`Test failed: ${testName}`, error);
  return { action: 'log_only' };
};
```

## 🎯 Success Criteria

### Test Results
- [ ] **Critical path tests**: 100% pass rate
- [ ] **Emergency tests**: 100% pass rate
- [ ] **Recovery tests**: >95% pass rate
- [ ] **Performance tests**: >90% pass rate
- [ ] **Accessibility tests**: >95% pass rate

### Coverage Metrics
- [ ] **Emergency systems**: 100% coverage
- [ ] **Communication pipeline**: >95% coverage
- [ ] **Error handling**: >90% coverage
- [ ] **Recovery systems**: >95% coverage

### Performance Benchmarks
- [ ] **Test execution time**: <5 minutes for critical paths
- [ ] **Memory usage**: <500MB during test execution
- [ ] **False positive rate**: <1% for critical tests

## 📞 Communication

### Test Result Notifications
- **Critical failures**: Immediate Slack notification to entire team
- **High priority failures**: Daily summary email
- **Performance regressions**: Weekly trend analysis

### Documentation Updates
- **Test results**: Automatically updated in README
- **Coverage reports**: Published to team dashboard
- **Failure analysis**: Weekly retrospective meetings

## 🔄 Continuous Improvement

### Test Maintenance
- [ ] Review and update tests quarterly
- [ ] Add tests for new Amy usage patterns
- [ ] Optimize test execution time
- [ ] Improve test reliability and reduce flakes

### Process Improvements
- [ ] Automate test result analysis
- [ ] Implement test impact analysis
- [ ] Add performance regression detection
- [ ] Create test data management system

**Remember: Every test failure represents a potential barrier to Amy's communication. Fix test failures with the same urgency as fixing Amy's communication issues.** ❤️
