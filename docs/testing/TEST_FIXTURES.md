# Test Fixture Generation (Deterministic)

This repository relies on a deterministic baseline model fixture to keep
MLP-related tests stable across environments.

## Baseline Fixture
The helper `server/test/helpers/ensureBaselineModel.ts` creates a minimal
`.npz` model when no baseline exists. It is used by multiple Jest suites.

### Manual Regeneration
1. Ensure Python + NumPy are available.
2. Run the helper through a Node script (or Jest test) that calls:
   ```ts
   await ensureBaselineModelFixture();
   ```

### Deterministic Smoke Test
The test `server/test/baselineFixtureSmoke.test.ts` validates the fixture by:
- Loading the file in TypeScript (zip structure + required entries).
- Loading the file in Python (NumPy read + required keys).

If this test fails, regenerate the fixture and re-run the smoke test.
