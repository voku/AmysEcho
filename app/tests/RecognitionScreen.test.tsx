import { readFileSync } from 'fs';
import path from 'path';

test('RecognitionScreen has correction button navigating to Correction screen', () => {
  const file = readFileSync(path.join(__dirname, '../src/screens/RecognitionScreen.tsx'), 'utf8');
  expect(file).toMatch(/testID="btn-correction"/);
  expect(file).toMatch(/navigation.navigate\('Correction'\)/);
});
