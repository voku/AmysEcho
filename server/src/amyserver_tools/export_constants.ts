type DefaultLabelsModule = typeof import('../constants/defaultBaselineLabels.js');
type ModelPathsModule = typeof import('../constants/modelPaths.js');

async function importWithTsFallback<T>(relativePath: string): Promise<T> {
  const primary = new URL(relativePath, import.meta.url).href;
  try {
    return (await import(primary)) as T;
  } catch (error) {
    if (!relativePath.endsWith('.js')) {
      throw error;
    }
    const fallback = new URL(relativePath.replace(/\.js$/, '.ts'), import.meta.url).href;
    return (await import(fallback)) as T;
  }
}

async function main(): Promise<void> {
  const [{ DEFAULT_BASELINE_LABELS }, { BASELINE_MLP_MODEL_PATH }] = await Promise.all([
    importWithTsFallback<DefaultLabelsModule>('../constants/defaultBaselineLabels.js'),
    importWithTsFallback<ModelPathsModule>('../constants/modelPaths.js'),
  ]);

  const payload = {
    DEFAULT_BASELINE_LABELS,
    BASELINE_MLP_MODEL_PATH,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

void main();
