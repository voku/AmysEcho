# Test Fixture Generation (Deterministic)

This repository keeps the production/demo model bundle separate from generated
test fixtures.

## Baseline Fixture
The helper `server/test/helpers/ensureBaselineModel.ts` creates a minimal
`.npz` model at an explicit temporary path. Tests must pass that path directly;
the helper must not write to `server/data/models/global/`.

### Manual Regeneration
1. Ensure Python + NumPy are available.
2. Run the helper through a Node script (or Jest test) that calls:
   ```ts
   await ensureBaselineModelFixture(path.join(tmpDir, "models", "global", "amy_model.npz"));
   ```

### Deterministic Smoke Test
The test `server/test/baselineFixtureSmoke.test.ts` validates the fixture by:
- Loading the file in TypeScript (zip structure + required entries).
- Loading the file in Python (NumPy read + required keys).

If this test fails, fix the fixture generator. Do not regenerate the committed
global demo model from a test.
