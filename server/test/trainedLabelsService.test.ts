import { buildTrainedLabelDescriptors, mergeTrainedLabels } from "../src/services/trainedLabelsService";

describe("mergeTrainedLabels", () => {
  it("returns labels from either legacy sample counts or training manifest entries", () => {
    const result = mergeTrainedLabels(
      "profile-1",
      { HALLO: 2 },
      [
        { profileId: "profile-1", label: "DANKE" },
        { profileId: "profile-2", label: "BITTE" },
      ],
    );

    expect(result).toEqual(expect.arrayContaining(["HALLO", "DANKE"]));
    expect(result).not.toContain("BITTE");
  });

  it("deduplicates labels and ignores blank entries", () => {
    const result = mergeTrainedLabels(
      "profile-1",
      { HALLO: 1, " ": 2 },
      [
        { profileId: "profile-1", label: " HALLO " },
        { profileId: "profile-1", label: "" },
      ],
    );

    expect(result).toEqual(["HALLO"]);
  });

  it("deduplicates labels case-insensitively across sources", () => {
    const result = mergeTrainedLabels(
      "profile-1",
      { hallo: 1 },
      [
        { profileId: "profile-1", label: "HALLO" },
        { profileId: "profile-1", label: "HaLLo" },
      ],
    );

    expect(result).toEqual(["hallo"]);
  });

  it("strips trailing UUID suffixes before deduplication", () => {
    const result = mergeTrainedLabels(
      "profile-1",
      {
        "hallo_123e4567-e89b-12d3-a456-426614174000": 1,
      },
      [
        { profileId: "profile-1", label: "HALLO-123e4567-e89b-12d3-a456-426614174000" },
        { profileId: "profile-1", label: "HALLO" },
      ],
    );

    expect(result).toEqual(["hallo"]);
  });

  it("normalizes NFKC and collapses whitespace before deduplication", () => {
    // U+00E9 (precomposed é) vs U+0065 U+0301 (decomposed é)
    const result = mergeTrainedLabels(
      "profile-1",
      { "caf\u00e9": 1 },
      [
        { profileId: "profile-1", label: "caf\u0065\u0301" },
        { profileId: "profile-1", label: "hello  world" },
      ],
    );

    expect(result).toEqual(expect.arrayContaining(["café", "hello world"]));
    expect(result).toHaveLength(2);
  });
});

describe("buildTrainedLabelDescriptors", () => {
  it("enriches trained labels with custom sign display metadata", () => {
    const result = buildTrainedLabelDescriptors(
      "profile-1",
      ["wasserzeichen", "TRINKEN"],
      [
        { id: "wasserzeichen", label: "Wasser bitte", emoji: "💧", profileId: "profile-1" },
      ],
    );

    expect(result).toEqual([
      {
        id: "wasserzeichen",
        normalizedId: "wasserzeichen",
        displayLabel: "Wasser bitte",
        emoji: "💧",
        isCustom: true,
      },
      {
        id: "TRINKEN",
        normalizedId: "trinken",
        displayLabel: "TRINKEN",
        emoji: null,
        isCustom: false,
      },
    ]);
  });
});
