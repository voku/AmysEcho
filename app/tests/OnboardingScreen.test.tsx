import { readFileSync } from 'fs';
import path from 'path';

test('OnboardingScreen has next and skip buttons with navigation', () => {
  const file = readFileSync(path.join(__dirname, '../src/screens/OnboardingScreen.tsx'), 'utf8');
  expect(file).toMatch(/testID="btn-next"/);
  expect(file).toMatch(/testID="btn-skip"/);
  expect(file).toMatch(/navigation.replace\('Recognition'\)/);
});
