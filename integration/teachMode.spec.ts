import { test } from 'node:test';
import assert from 'node:assert/strict';

async function teachNewSign(label: string, save: (l: string) => Promise<void>, retrain: () => Promise<void>) {
  await save(label);
  await retrain();
}

test('teach mode saves sample then triggers retraining', async () => {
  const saved: string[] = [];
  let retrained = false;

  const save = async (l: string) => {
    saved.push(l);
  };
  const retrain = async () => {
    retrained = true;
  };

  await teachNewSign('new-sign', save, retrain);

  assert.deepEqual(saved, ['new-sign']);
  assert.equal(retrained, true);
});
