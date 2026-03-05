import { GestureDetectionStep } from '../core/ProcessingSteps';
import type { GestureDetectorConfig } from '../config/GestureConfig';
import { LandmarkTemplateDetector, normalizeLandmarks, type LandmarkTemplate } from '../landmarkTemplateDetector';
import type { GestureFixture } from './fixtures/recordFixture';

export interface FixtureDiagnosisItem {
  fixtureName: string;
  expectedLabel: string;
  predictedLabel: string | null;
  confidence: number;
  expectedConfidence: number;
  pass: boolean;
  method: string | null;
}

export interface FixtureDiagnosisGap {
  fixtureName: string;
  expectedLabel: string;
  expectedScore: number;
  strongestOtherLabel: string | null;
  strongestOtherScore: number;
  gap: number;
}

export interface FixtureDiagnosisReport {
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    averageConfidence: number;
  };
  items: FixtureDiagnosisItem[];
  gaps: FixtureDiagnosisGap[];
}

const defaultConfig = {
  thresholds: { mlpConfidence: 0.4 },
} as unknown as GestureDetectorConfig;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function toTemplate(fixture: GestureFixture): LandmarkTemplate {
  const firstFrame = fixture.landmarks[0];
  const firstHand = firstFrame?.[0] ?? [];
  const handedness = firstFrame && firstFrame.length >= 2 ? 'both' : 'left';

  return {
    id: `fixture-${normalizeLabel(fixture.gestureName)}`,
    label: fixture.gestureName,
    profileId: 'integration-fixtures',
    landmarks: normalizeLandmarks(firstHand as [number, number, number][]),
    handedness,
    createdAt: fixture.capturedAt,
  };
}

async function runFixture(step: GestureDetectionStep, fixture: GestureFixture) {
  let bestResult: Awaited<ReturnType<GestureDetectionStep['execute']>> | null = null;

  for (let index = 0; index < fixture.landmarks.length; index += 1) {
    const frame = fixture.landmarks[index] ?? [];
    const result = await step.execute({
      landmarks: frame,
      rawLandmarks: frame,
      timestamp: Date.now() + index,
      processingStep: 'integration_fixture',
      skipExpensiveSteps: false,
      rawResults: { gestures: [], landmarks: frame as never, handednesses: [] },
      normalizedResults: { hands: [], landmarks: [], handednesses: [] },
    } as any);

    if (!bestResult || result.confidence > bestResult.confidence) {
      bestResult = result;
    }
  }

  return bestResult;
}

function buildGapForFixture(fixture: GestureFixture, templates: LandmarkTemplate[]): FixtureDiagnosisGap {
  const detector = new LandmarkTemplateDetector();
  detector.setTemplates(templates);

  const firstFrame = fixture.landmarks[0] ?? [];
  const expectedLabel = normalizeLabel(fixture.gestureName);

  let expectedScore = 0;
  let strongestOtherScore = 0;
  let strongestOtherLabel: string | null = null;

  for (const template of templates) {
    detector.setTemplates([template]);
    const score = detector.detect(firstFrame)?.confidence ?? 0;
    const label = normalizeLabel(template.label);

    if (label === expectedLabel) {
      expectedScore = score;
      continue;
    }

    if (score > strongestOtherScore) {
      strongestOtherScore = score;
      strongestOtherLabel = label;
    }
  }

  return {
    fixtureName: fixture.gestureName,
    expectedLabel,
    expectedScore,
    strongestOtherLabel,
    strongestOtherScore,
    gap: expectedScore - strongestOtherScore,
  };
}

export async function generateFixtureDiagnosisReport(fixtures: GestureFixture[]): Promise<FixtureDiagnosisReport> {
  const templateDetector = new LandmarkTemplateDetector();
  const templates = fixtures.map(toTemplate);
  templateDetector.setTemplates(templates);

  const step = new GestureDetectionStep(defaultConfig, templateDetector);
  const items: FixtureDiagnosisItem[] = [];

  for (const fixture of fixtures) {
    const result = await runFixture(step, fixture);
    const expectedLabel = normalizeLabel(fixture.gestureName);
    const predictedLabel = result?.gesture ?? null;
    const confidence = result?.confidence ?? 0;

    const pass = predictedLabel === expectedLabel && confidence >= fixture.expectedConfidence;

    items.push({
      fixtureName: fixture.gestureName,
      expectedLabel,
      predictedLabel,
      confidence,
      expectedConfidence: fixture.expectedConfidence,
      pass,
      method: result?.metadata?.method ?? null,
    });
  }

  const gaps = fixtures.map((fixture) => buildGapForFixture(fixture, templates));
  const passed = items.filter((item) => item.pass).length;
  const averageConfidence = items.length === 0 ? 0 : items.reduce((total, item) => total + item.confidence, 0) / items.length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      passed,
      failed: items.length - passed,
      averageConfidence,
    },
    items,
    gaps,
  };
}

export function createLlmDiagnosisPrompt(report: FixtureDiagnosisReport, pipelineCode: string): string {
  return `# LLM Diagnose: Gestenerkennung (nur Analyse, keine Patches)\n\n## Regeln\n- Keine Code-Patches erstellen.\n- Nur Ursachenanalyse mit Belegen aus den Daten.\n- Fokus auf Landmark-Qualität, Normalisierung, zeitliche Aggregation und Modell-Diskriminierung.\n\n## Fixture-Report\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\n## Relevanter Pipeline-Code\n\n\`\`\`ts\n${pipelineCode}\n\`\`\`\n\n## Fragen\n1. Wo verliert die Pipeline die Trennschärfe zwischen Top-Kandidaten?\n2. Ist das Problem eher in Landmark-Vorverarbeitung, Template-Matching oder MLP-Auswahl?\n3. Welche messbare Hypothese erklärt 50/50-Ausgaben bei trainierten Gesten?\n4. Welche Metrik sollte als nächstes erhoben werden, bevor wir Code ändern?\n`;
}
