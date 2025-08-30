import { SequenceRecognizer } from '../src/services/sequenceRecognizer';

describe('SequenceRecognizer', () => {
  it('recognizes gesture sequences within the allowed window', () => {
    const rec = new SequenceRecognizer([
      { id: 'seq', pattern: ['a', 'b'], windowMs: 1000 },
    ]);
    const base = 0;
    expect(rec.push('a', base)).toBeNull();
    expect(rec.push('b', base + 500)).toBe('seq');
  });

  it('rejects sequences that exceed the time window', () => {
    const rec = new SequenceRecognizer([
      { id: 'seq', pattern: ['a', 'b'], windowMs: 500 },
    ]);
    const base = 0;
    expect(rec.push('a', base)).toBeNull();
    expect(rec.push('b', base + 600)).toBeNull();
  });

  it('requires gestures to match the expected order', () => {
    const rec = new SequenceRecognizer([
      { id: 'seq', pattern: ['a', 'b'], windowMs: 1000 },
    ]);
    const base = 0;
    expect(rec.push('b', base)).toBeNull();
    expect(rec.push('a', base + 100)).toBeNull();
  });

  it('prunes old events and limits history size', () => {
    const rec = new SequenceRecognizer([
      { id: 'seq', pattern: ['a', 'b', 'c'], windowMs: 1000 },
    ]);
    const base = 0;
    for (let i = 0; i < 10; i++) {
      rec.push('a', base + i * 10);
    }
    expect(rec.eventCount).toBeLessThanOrEqual(3);
    rec.push('b', base + 2000);
    expect(rec.eventCount).toBe(1);
  });
});

