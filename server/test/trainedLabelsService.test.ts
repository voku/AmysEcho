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
});
