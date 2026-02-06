/**
 * Integration test for Metacom full-cycle communication:
 *   symbol selection → training bundle includes symbolId →
 *   recognition output maps to the same symbol/board.
 *
 * These tests verify the data flow across the webapp modules without
 * requiring a running server (the server-side persistence is tested
 * separately in server tests).
 */
import assert from 'node:assert';
import { test, describe } from 'node:test';

import { createTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import type { TrainingFrame } from '../../webapp/src/training/types.ts';
import { resolveGestureSymbol, resolveSymbolId } from '../../webapp/src/services/metacomMappingService.ts';
import { cellToSentenceSymbol } from '../../webapp/src/components/SentenceComposer.tsx';
import type { MetacomSymbolCell } from '../../webapp/src/types/metacom.ts';

// Minimal valid training frames (hand landmarks only)
function makeFrames(count: number): TrainingFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    landmarks: [
      Array.from({ length: 21 }, (_, j) => [0.1 + i * 0.01, 0.2 + j * 0.01, 0.3]),
    ],
    handedness: ['Right'] as readonly string[],
    poseLandmarks: Array.from({ length: 33 }, () => [0, 0, 0]),
    faceLandmarks: Array.from({ length: 468 }, () => [0, 0, 0]),
    timestampMs: 1000 + i * 33,
  }));
}

describe('Metacom full-cycle: symbol selection → training bundle → recognition', () => {
  test('training bundle includes symbolId from Metacom selection', async () => {
    const frames = makeFrames(15);

    const zip = await createTrainingZip({
      label: 'Ja',
      symbolId: 'metacom_ja',
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      frames,
    });

    assert.ok(zip instanceof Uint8Array, 'ZIP should be a Uint8Array');
    assert.ok(zip.length > 0, 'ZIP should not be empty');

    // Decompress and check metadata.json contains symbolId
    const { unzipSync } = await import('fflate');
    const entries = unzipSync(zip);

    assert.ok(entries['metadata.json'], 'ZIP must contain metadata.json');
    const metadata = JSON.parse(new TextDecoder().decode(entries['metadata.json']));
    assert.strictEqual(metadata.symbolId, 'metacom_ja', 'symbolId must be in metadata');
    assert.strictEqual(metadata.label, 'Ja', 'label must match');
    assert.strictEqual(metadata.profileId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  test('training bundle without symbolId omits the field', async () => {
    const frames = makeFrames(15);

    const zip = await createTrainingZip({
      label: 'custom_sign',
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      frames,
    });

    const { unzipSync } = await import('fflate');
    const entries = unzipSync(zip);
    const metadata = JSON.parse(new TextDecoder().decode(entries['metadata.json']));

    assert.strictEqual(metadata.symbolId, undefined, 'symbolId should not exist when not provided');
    assert.strictEqual(metadata.label, 'custom_sign');
  });

  test('mapping layer resolves gesture label to Metacom symbol', () => {
    const result = resolveGestureSymbol('Ja');
    assert.ok(result, 'Should resolve Ja');
    assert.strictEqual(result.symbolId, 'metacom_ja');
    assert.strictEqual(result.boardId, 'start');
    assert.strictEqual(result.emoji, '👍');
  });

  test('mapping layer resolves by symbolId', () => {
    const result = resolveGestureSymbol('AnyLabel', 'metacom_apfel');
    assert.ok(result, 'Should resolve by symbolId');
    assert.strictEqual(result.label, 'Apfel');
    assert.strictEqual(result.boardId, 'essen');
  });

  test('mapping layer resolves symbolId back to board location', () => {
    const result = resolveSymbolId('metacom_wasser');
    assert.ok(result, 'Should resolve symbolId');
    assert.strictEqual(result.label, 'Wasser');
    assert.strictEqual(result.boardId, 'trinken');
    assert.strictEqual(result.category, 'trinken');
  });

  test('full cycle: Metacom cell → SentenceSymbol → training bundle → recognition', async () => {
    // 1. User selects a Metacom cell
    const cell: MetacomSymbolCell = {
      id: 'metacom_hilfe',
      label: 'Hilfe',
      emoji: '🆘',
      position: 8,
      type: 'symbol',
      color: '#FFC9DE',
    };

    // 2. Cell is converted to a SentenceSymbol for the composer
    const sentenceSymbol = cellToSentenceSymbol(cell);
    assert.strictEqual(sentenceSymbol.id, 'metacom_hilfe');
    assert.strictEqual(sentenceSymbol.label, 'Hilfe');
    assert.strictEqual(sentenceSymbol.emoji, '🆘');

    // 3. Training bundle is created with symbolId from the cell
    const frames = makeFrames(15);
    const zip = await createTrainingZip({
      label: cell.label,
      symbolId: cell.symbolId ?? cell.id,
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      frames,
    });

    const { unzipSync } = await import('fflate');
    const entries = unzipSync(zip);
    const metadata = JSON.parse(new TextDecoder().decode(entries['metadata.json']));
    assert.strictEqual(metadata.symbolId, 'metacom_hilfe');
    assert.strictEqual(metadata.label, 'Hilfe');

    // 4. Recognition result is resolved via the mapping layer
    const recognition = resolveGestureSymbol(metadata.label, metadata.symbolId);
    assert.ok(recognition, 'Recognition should resolve');
    assert.strictEqual(recognition.symbolId, 'metacom_hilfe');
    assert.strictEqual(recognition.boardId, 'start');
    assert.strictEqual(recognition.emoji, '🆘');
    assert.strictEqual(recognition.audioText, 'Hilfe');
  });
});
