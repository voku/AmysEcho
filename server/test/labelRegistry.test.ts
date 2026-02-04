import { describe, expect, it } from "@jest/globals";
import {
buildLabelManifest,
getVideosForLabel,
isValidLabel,
loadBaselineLabels,
loadDgsManifest,
} from "../src/services/labelRegistry.js";

describe("LabelRegistry", () => {
describe("loadBaselineLabels", () => {
it("should return 12 baseline labels", async () => {
const labels = await loadBaselineLabels();
expect(labels).toHaveLength(12);
expect(labels).toContain("alle");
expect(labels).toContain("blau");
expect(labels).toContain("trinken");
});

it("should return lowercase labels", async () => {
const labels = await loadBaselineLabels();
for (const label of labels) {
expect(label).toBe(label.toLowerCase());
}
});
});

describe("loadDgsManifest", () => {
it("should load manifest with gestures", async () => {
const manifest = await loadDgsManifest();
expect(manifest).not.toBeNull();
expect(manifest?.gestures).toBeDefined();
expect(manifest?.gestures?.length).toBe(12);
});

it("should include variation data", async () => {
const manifest = await loadDgsManifest();
const trinken = manifest?.gestures.find((g) => g.id === "trinken");
expect(trinken).toBeDefined();
expect(trinken?.variations?.main).toBeDefined();
expect(trinken?.variations?.var).toBeDefined();
expect(trinken?.totalVideoCount).toBeGreaterThan(20);
});
});

describe("buildLabelManifest", () => {
it("should build complete manifest with all labels", async () => {
const manifest = await buildLabelManifest();
expect(manifest.labels).toHaveLength(12);
expect(manifest.stats.totalLabels).toBe(12);
expect(manifest.stats.totalVideos).toBe(126);
});

it("should include label metadata", async () => {
const manifest = await buildLabelManifest();
const blau = manifest.labels.find((l) => l.id === "blau");
expect(blau).toBeDefined();
expect(blau?.displayName).toBe("Blau");
expect(blau?.emoji).toBe("🔵");
expect(blau?.category).toBe("color");
});

it("should build variation map", async () => {
const manifest = await buildLabelManifest();
const alleVariation = manifest.variations.get("alle");
expect(alleVariation).toBeDefined();
expect(alleVariation?.mainVideo).toBe("alle.mp4");
expect(alleVariation?.allVideos.length).toBeGreaterThan(5);
});
});

describe("isValidLabel", () => {
it("should return true for valid labels", async () => {
expect(await isValidLabel("alle")).toBe(true);
expect(await isValidLabel("blau")).toBe(true);
expect(await isValidLabel("trinken")).toBe(true);
});

it("should handle case-insensitive lookup", async () => {
// The function lowercases input, so uppercase should also work
expect(await isValidLabel("ALLE")).toBe(true);
expect(await isValidLabel("Alle")).toBe(true);
expect(await isValidLabel("alle")).toBe(true);
});

it("should return false for invalid labels", async () => {
expect(await isValidLabel("invalid")).toBe(false);
expect(await isValidLabel("unknown")).toBe(false);
});
});

describe("getVideosForLabel", () => {
it("should return videos for valid label", async () => {
const videos = await getVideosForLabel("alle");
expect(videos.length).toBeGreaterThan(0);
expect(videos).toContain("alle.mp4");
});

it("should return empty array for invalid label", async () => {
const videos = await getVideosForLabel("nonexistent");
expect(videos).toEqual([]);
});

it("should include all video variations", async () => {
const videos = await getVideosForLabel("trinken");
expect(videos.length).toBeGreaterThan(20);
expect(videos.some((v) => v.includes("_main_"))).toBe(true);
expect(videos.some((v) => v.includes("_var_"))).toBe(true);
});
});
});
