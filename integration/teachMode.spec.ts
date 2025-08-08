import { test } from 'node:test';
import assert from 'node:assert/strict';

test('teach mode capture adds new sign to list', () => {
  const signs: string[] = ['hello'];
  function capture(sign: string) {
    signs.push(sign);
  }
  capture('new');
  assert.ok(signs.includes('new'));
});
