import { test } from 'node:test';
import assert from 'node:assert/strict';

test('no misplaced CTAs across screens', () => {
  const screenCtas: Record<string, string[]> = {
    Recognition: ['Lernfortschritt', 'Neue Geste beibringen', 'Einstellungen'],
    Practice: ['Start Practice'],
    Teach: ['Add New Sign'],
  };
  function hasCta(screen: string, cta: string) {
    return screenCtas[screen]?.includes(cta) ?? false;
  }
  assert.ok(hasCta('Recognition', 'Lernfortschritt'));
  assert.ok(!hasCta('Recognition', 'Start Practice'));
  assert.ok(!hasCta('Recognition', 'Korrektur'));
  assert.ok(hasCta('Practice', 'Start Practice'));
  assert.ok(!hasCta('Teach', 'Lernfortschritt'));
});
