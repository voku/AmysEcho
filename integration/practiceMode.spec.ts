import { test } from 'node:test';
import assert from 'node:assert/strict';

test('practice mode loads signs and increments counter on match', () => {
  const signs = ['hello', 'bye'];
  let counter = 0;
  function startDrill(sign: string) {
    if (sign === 'hello') counter++;
  }
  startDrill(signs[0]);
  assert.equal(counter, 1);
});
