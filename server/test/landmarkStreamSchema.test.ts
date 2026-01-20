import { LandmarkStreamSchema } from "../src/types/landmarkStreamSchema";

describe("LandmarkStreamSchema", () => {
  it("accepts a valid payload", () => {
    const payload = {
      type: "landmarks",
      schemaVersion: 1,
      timestamp: Date.now(),
      landmarks: [
        [
          [0.1, 0.2, 0.0],
          [0.2, 0.3, 0.0],
        ],
      ],
      visibility: [[1, 1]],
      handednesses: ["Left"],
    };

    expect(() => LandmarkStreamSchema.parse(payload)).not.toThrow();
  });

  it("rejects mismatched visibility lengths", () => {
    const payload = {
      type: "landmarks",
      schemaVersion: 1,
      timestamp: Date.now(),
      landmarks: [
        [
          [0.1, 0.2, 0.0],
          [0.2, 0.3, 0.0],
        ],
      ],
      visibility: [[1]],
      handednesses: ["Left"],
    };

    const result = LandmarkStreamSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
