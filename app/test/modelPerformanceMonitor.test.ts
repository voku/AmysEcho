import { ModelPerformanceMonitor } from '../src/services/ModelPerformanceMonitor';

describe('ModelPerformanceMonitor', () => {
  test('detects confidence drop', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.9);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: 'ok', confidence: 0.7 });
    }
    expect(m.isDegraded()).toBe(true);
  });

  test('detects high uncertain rate', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.9);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: i < 5 ? 'uncertain' : 'ok', confidence: 0.9, requiresConfirmation: i < 5 });
    }
    expect(m.isDegraded()).toBe(true);
  });

  test('passes healthy performance', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.8);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: 'ok', confidence: 0.8 });
    }
    expect(m.isDegraded()).toBe(false);
  });
});
