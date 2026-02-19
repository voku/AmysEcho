import { mergeTrainedLabels } from "../src/services/trainedLabelsService";

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
});
