export function parseEpochSchedule(raw: string | undefined, fallback: number[]): number[] {
	if (!raw || raw.trim().length === 0) {
		return fallback;
	}
	const parsed = raw
		.split(",")
		.map((value) => Number.parseInt(value.trim(), 10))
		.filter((value) => Number.isFinite(value) && value > 0);
	return parsed.length > 0 ? parsed : fallback;
}

export function resolveTrainingScore(
	report: Record<string, unknown>,
	targetProfileId: string | null,
): number {
	if (targetProfileId) {
		const profiles = report.profiles as Record<string, { accuracy?: unknown }> | undefined;
		const profileScore = profiles?.[targetProfileId]?.accuracy;
		if (typeof profileScore === "number") {
			return profileScore;
		}
	}
	const globalScore = (report.global as { accuracy?: unknown } | undefined)?.accuracy;
	return typeof globalScore === "number" ? globalScore : 0;
}
