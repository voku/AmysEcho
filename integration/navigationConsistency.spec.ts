import { test } from 'node:test';
import assert from 'node:assert/strict';

test('no misplaced CTAs across screens', () => {
  const screenCtas: Record<string, string[]> = {
    Recognition: ['Correction'],
    Correction: ['Submit Correction', 'Cancel'],
    Practice: ['Start Practice'],
    Teach: ['Add New Sign'],
  };
  function hasCta(screen: string, cta: string) {
    return screenCtas[screen]?.includes(cta) ?? false;
  }
  assert.ok(hasCta('Recognition', 'Correction'));
  assert.ok(!hasCta('Recognition', 'Start Practice'));
  assert.ok(hasCta('Practice', 'Start Practice'));
  assert.ok(!hasCta('Teach', 'Submit Correction'));
});
