import type { ManifestEntry } from "../types.js";

export function mergeTrainedLabels(
  profileId: string,
  profileCounts: Record<string, number>,
  manifestEntries: ManifestEntry[],
): string[] {
  const normalizedLabelMap = new Map<string, string>();

  const addLabel = (rawLabel: string): void => {
    const label = rawLabel.trim();
    if (label.length === 0) {
      return;
    }

    const normalized = label.toLocaleLowerCase("de-DE");
    if (!normalizedLabelMap.has(normalized)) {
      normalizedLabelMap.set(normalized, label);
    }
  };

  for (const [label, count] of Object.entries(profileCounts)) {
    if (count > 0) {
      addLabel(label);
    }
  }

  for (const entry of manifestEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if ((entry.profileId ?? null) !== profileId) {
      continue;
    }

    if (typeof entry.label !== "string") {
      continue;
    }

    addLabel(entry.label);
  }

  return Array.from(normalizedLabelMap.values());
}
