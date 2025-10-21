import defaultBaselineLabels from '../../assets/config/defaultBaselineLabels.json';

if (!Array.isArray(defaultBaselineLabels) || !defaultBaselineLabels.every((item) => typeof item === 'string')) {
  throw new Error('defaultBaselineLabels.json muss eine Liste aus Strings enthalten');
}

export const DEFAULT_BASELINE_LABELS = Object.freeze(
  (defaultBaselineLabels as unknown[]).map((label) => String(label)),
);
