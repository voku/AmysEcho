import type { ManifestEntry } from "../types.js";

export function mergeTrainedLabels(
  profileId: string,
  profileCounts: Record<string, number>,
  manifestEntries: ManifestEntry[],
): string[] {
  const labels = new Set<string>();

  for (const [label, count] of Object.entries(profileCounts)) {
    if (count > 0 && label.trim().length > 0) {
      labels.add(label.trim());
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

    const label = entry.label.trim();
    if (label.length > 0) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}
