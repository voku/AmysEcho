# Amy's Echo Development Workflow - Amy First Edition

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. This document reflects the current state of the project and the established workflow.

## 🚨 CRITICAL: Amy First Development Principles

**Every line of code must enhance Amy's ability to communicate. When in doubt, choose reliability over elegance, simplicity over features, and Amy's needs over technical metrics.**

### Core Commitments
- ✅ **Zero interruption** - Amy's communication never pauses
- ✅ **Zero confusion** - Simple, clear UI always
- ✅ **Zero delay** - Instant feedback for everything
- ✅ **Zero failure** - Multiple fallback layers
- ✅ **Zero judgment** - Celebrate attempts, not just success
- ✅ **Zero compromise** - Amy's needs come first

## 📋 Development Workflow

### Phase 1: Pre-Implementation Checklist
**Complete ALL items before writing code:**

- [x] **Read the TODO.md completely** - Understand Amy's needs
- [x] **Identify the "Amy Impact"** - How does this help Amy communicate?
- [x] **Check existing implementation** - Don't duplicate work
- [x] **Verify against Amy First principles** - Does this enhance communication?
- [x] **Test current functionality** - Ensure nothing breaks
- [x] **Document the "why"** - Explain how this serves Amy

### Phase 2: Implementation
**Follow this exact order:**

1. **Start with tests** - Write tests that verify Amy's communication works
2. **Implement core functionality** - Focus on communication reliability
3. **Add error handling** - Ensure graceful degradation
4. **Test edge cases** - What happens when things go wrong?
5. **Verify performance** - Does it work at 1% battery?
6. **Update documentation** - Keep TODO.md accurate

### Phase 3: Validation
**Before marking complete:**

- [ ] **Test at 5% battery** - Full functionality maintained?
- [ ] **Test during model updates** - Recognition uninterrupted?
- [ ] **Test with poor network** - Graceful offline mode?
- [ ] **Test error scenarios** - Child-friendly messages only?
- [ ] **Test emergency gestures** - Immediate response?
- [ ] **Verify accessibility** - Cognitive load assessment
- [ ] **Performance check** - No frame drops?
- [ ] **Amy scenario test** - Works when she needs it most?

## 🔧 Code Quality Standards

### File Structure
```
webapp/src/
├── services/           # Business logic, Amy-first services
├── components/         # Reusable UI components
├── gesture/            # Gesture recognition pipeline
├── constants/          # Webapp constants
├── utils/              # Utility functions
└── types/              # TypeScript definitions
```

### Naming Conventions
- **Services**: `{Feature}Service` (e.g., `GestureHistoryService`)
- **Components**: `PascalCase` (e.g., `GestureComparison`)
- **Files**: `kebab-case` (e.g., `gesture-history-service.ts`)
- **Functions**: `camelCase` (e.g., `getCachedResponse`)
- **Constants with fixed thresholds**: include the numeric value in the name for LLM clarity
  - ✅ Good: `BATCH_INTERVAL_MS_35`, `DEFAULT_TTL_MS_250`, `MAX_BATCH_SIZE_6`
  - ❌ Avoid: `BATCH_INTERVAL`, `DEFAULT_TTL`, `MAX_SIZE`
  - **Rationale**: LLMs can instantly understand threshold values without searching for definitions, improving code comprehension and modification accuracy

### Code Comments
```typescript
/**
 * Amy First: This function ensures zero-downtime model updates
 * so Amy's communication is never interrupted during updates.
 */
function activatePendingModel(): Promise<boolean> {
  // Implementation that prioritizes Amy's communication
}
```

## 🧪 Testing Strategy

### DGS Training Workflow Smoke Check (Server)

For integration-sensitive training changes (trainer, metadata contract, model serving, sweep tooling), run:

```bash
npm run train:workflow:smoke --prefix server
```

This command runs a lightweight end-to-end workflow using repository DGS landmark videos:
- realistic training cycle (small config),
- generated model artifact + metadata contract checks,
- sweep-tool execution against the generated manifest.

Use this before larger/full training runs to catch obvious regressions quickly.

### Test Categories
1. **Communication Tests** - Does Amy's gesture recognition work?
2. **Reliability Tests** - Does it work under stress/failure?
3. **Performance Tests** - Does it work at low battery/network?
4. **Accessibility Tests** - Is it usable for Amy's cognitive needs?

### Test File Structure
```
webapp/src/
├── components/*.test.tsx     # Component tests
├── hooks/*.test.tsx          # Hook tests
├── gesture/__tests__/*       # Gesture pipeline tests
└── training/*.test.ts        # Training bundle + queue tests
```

### Test Naming
```typescript
describe('GestureHistoryService', () => {
  describe('addGesture', () => {
    it('should store gesture for instant replay', () => {
      // Test that helps Amy communicate reliably
    });
  });
});
```

## 📊 Success Metrics

### Communication Success
- [ ] **Response time**: <50ms for emergency gestures, <100ms for all others
- [ ] **Uptime during critical moments**: 100% (no exceptions)
- [ ] **Cache hit rate**: >90% for common gestures
- [ ] **Recovery success rate**: >95% from errors

### User Experience
- [ ] **Gesture recognition accuracy**: >85% for Amy's patterns
- [ ] **Error messages shown to Amy**: 0 (only encouraging messages)
- [ ] **Interrupted communications**: 0 during model updates
- [ ] **Battery impact**: <5% degradation from optimizations

### Technical Excellence
- [ ] **Test coverage**: >90% for critical communication paths
- [ ] **Memory usage**: Stable over 24+ hour periods
- [ ] **Bundle size**: Optimized for Amy's device constraints
- [ ] **TypeScript errors**: 0 in strict mode

## 🚨 Red Flags - Stop and Reassess

### Never Implement
- ❌ Features that reduce gesture recognition accuracy
- ❌ Optimizations that increase response time
- ❌ Error handling that shows technical messages to Amy
- ❌ Updates that interrupt active communication
- ❌ Complexity that increases cognitive load

### Always Verify
- ✅ Works at 1% battery with full functionality
- ✅ Handles network failures gracefully
- ✅ Shows only encouraging messages during errors
- ✅ Maintains recognition during model updates
- ✅ Provides instant feedback for every gesture attempt

## 🔄 Continuous Improvement

### Weekly Reviews
- [ ] Review error logs for patterns
- [ ] Analyze gesture recognition success rates
- [ ] Check performance metrics
- [ ] Validate accessibility compliance
- [ ] Test with real Amy usage patterns

### Monthly Goals
- [ ] Improve response time by 10%
- [ ] Increase cache hit rate by 5%
- [ ] Reduce error recovery time by 20%
- [ ] Enhance accessibility features

## 📞 Support and Communication

### For Amy's Caregivers
- **Error logs**: Available in caregiver dashboard
- **Performance metrics**: Real-time in admin panel
- **Usage analytics**: Privacy-first, opt-in only
- **Emergency support**: 24/7 technical assistance

### For Developers
- **Documentation**: Keep TODO.md accurate and up-to-date
- **Code reviews**: Focus on Amy's communication impact
- **Testing**: Prioritize communication reliability tests
- **Performance**: Optimize for Amy's usage patterns

## 📸 Webapp Screenshots (Documentation Standard)

When UI changes need a screenshot, follow this flow and document it directly in the relevant `docs/` file.

### Step-by-step
1. **Start the dev server** (repo root):
   ```bash
   npm run dev --prefix webapp -- --host 0.0.0.0 --port 5173
   ```
2. **Open demo mode**: `http://localhost:5173/AmysEcho/` → click **"Ohne Anmeldung fortfahren (Demo)"**.
3. **Open learning**: click **"Lernen entdecken"**.
4. **Start training**: choose a sign in the learning list and click **"Trainieren"**.
5. **Capture the screenshot**: full-page so the context is visible.

### Example (training view)
- **Save file as**: `docs/training/screenshots/training-preview-toggle.png`
- **Reference in docs** (Markdown):
  ```md
  ![Training view with raw/skeleton toggle](./screenshots/training-preview-toggle.png)
  ```

## 🎯 Remember: Amy's Communication Is Sacred

Every decision, every line of code, every optimization must serve one purpose: **enhancing Amy's ability to communicate with her family and caregivers**.

When you implement a feature, ask yourself:
- Does this help Amy communicate more reliably?
- Does this reduce Amy's frustration?
- Does this work when Amy needs it most?
- Does this maintain full functionality under stress?

If the answer to any of these is "no", reconsider the implementation.

**Amy First. Always.** ❤️
