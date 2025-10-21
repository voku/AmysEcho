import defaultBaselineLabels from '../../assets/config/defaultBaselineLabels.json';

export const DEFAULT_BASELINE_LABELS = Object.freeze(
  (defaultBaselineLabels as string[]).map((label) => String(label)),
);
