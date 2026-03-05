import { describe, expect, it } from 'vitest';

import { createLlmDiagnosisPrompt, generateFixtureDiagnosisReport } from './fixtureDiagnosis';
import { loadGestureFixtures } from './fixtures/loadFixtures';

describe('fixtureDiagnosis', () => {
  it('builds a diagnosis report from real fixtures', async () => {
    const fixtures = await loadGestureFixtures();
    const report = await generateFixtureDiagnosisReport(fixtures);

    expect(report.summary.total).toBeGreaterThanOrEqual(2);
    expect(report.items).toHaveLength(report.summary.total);
    expect(report.gaps).toHaveLength(report.summary.total);
    expect(report.items.every((item) => item.expectedLabel.length > 0)).toBe(true);
  });

  it('creates an LLM prompt with strict no-patch instruction', async () => {
    const fixtures = await loadGestureFixtures();
    const report = await generateFixtureDiagnosisReport(fixtures);
    const prompt = createLlmDiagnosisPrompt(report, 'const code = true;');

    expect(prompt).toContain('Keine Code-Patches erstellen.');
    expect(prompt).toContain('Fixture-Report');
    expect(prompt).toContain('const code = true;');
  });
});
