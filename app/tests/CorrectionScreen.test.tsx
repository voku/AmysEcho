import { readFileSync } from 'fs';
import path from 'path';

test('CorrectionScreen has submit and cancel buttons with service call', () => {
  const file = readFileSync(path.join(__dirname, '../src/screens/CorrectionScreen.tsx'), 'utf8');
  expect(file).toMatch(/testID="btn-submit-correction"/);
  expect(file).toMatch(/testID="btn-cancel-correction"/);
  expect(file).toMatch(/correctionService\.logCorrection/);
});
