import { readFileSync } from 'fs';
import path from 'path';

test('CTA buttons expose accessibility labels', () => {
  const checks = [
    ['../src/screens/RecognitionScreen.tsx', 'btn-correction', 'Open correction screen'],
    ['../src/screens/CorrectionScreen.tsx', 'btn-submit-correction', 'Submit correction'],
    ['../src/screens/CorrectionScreen.tsx', 'btn-cancel-correction', 'Cancel'],
    ['../src/screens/OnboardingScreen.tsx', 'btn-next', 'Next'],
    ['../src/screens/OnboardingScreen.tsx', 'btn-skip', 'Skip'],
    ['../src/screens/PracticeScreen.tsx', 'btn-start-practice', 'Start Practice'],
    ['../src/screens/TeachScreen.tsx', 'btn-add-sign', 'Add New Sign'],
  ];
  for (const [filePath, testId, label] of checks) {
    const file = readFileSync(path.join(__dirname, filePath), 'utf8');
    const pattern = new RegExp(`testID="${testId}"[\\s\\S]*accessibilityLabel="${label}"`);
    expect(file).toMatch(pattern);
  }
});
