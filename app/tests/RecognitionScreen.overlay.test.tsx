import { readFileSync } from 'fs';
import path from 'path';

test('RecognitionScreen exposes debug overlay and help button identifiers', () => {
  const file = readFileSync(path.join(__dirname, '../src/screens/RecognitionScreen.tsx'), 'utf8');
  // status container long-press toggle
  expect(file).toMatch(/testID=\"status-container\"/);
  // uncertainty help action button test id
  expect(file).toMatch(/testID=\"btn-help-me-choose\"/);
  // overlay shows path text
  expect(file).toMatch(/Path:/);
});

