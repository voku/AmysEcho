import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webappRoot = path.resolve(scriptDir, '..');
const reportDir = path.join(webappRoot, 'diagnostics', 'gesture');
const pipelinePath = path.join(webappRoot, 'src', 'gesture', 'core', 'ProcessingSteps.ts');

async function main() {
  if (typeof globalThis.window === 'undefined') {
    (globalThis as { window?: Record<string, unknown> }).window = {};
  }

  const [{ createLlmDiagnosisPrompt, generateFixtureDiagnosisReport }, { loadGestureFixtures }] = await Promise.all([
    import('../src/gesture/testing/fixtureDiagnosis'),
    import('../src/gesture/testing/fixtures/loadFixtures'),
  ]);

  const fixtures = await loadGestureFixtures();
  const report = await generateFixtureDiagnosisReport(fixtures);
  const pipelineCode = await readFile(pipelinePath, 'utf8');
  const prompt = createLlmDiagnosisPrompt(report, pipelineCode);

  await mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `fixture-report-${timestamp}.json`);
  const promptPath = path.join(reportDir, `fixture-diagnose-prompt-${timestamp}.md`);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(promptPath, prompt, 'utf8');

  console.log(`Fixture-Diagnosebericht geschrieben: ${path.relative(webappRoot, reportPath)}`);
  console.log(`LLM-Diagnoseprompt geschrieben: ${path.relative(webappRoot, promptPath)}`);
}

main().catch((error) => {
  console.error('Fehler beim Erstellen der Fixture-Diagnose:', error);
  process.exitCode = 1;
});
