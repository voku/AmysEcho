type BundleTrainStatus = "queued" | "running" | "completed" | "failed";

type BundleTrainingJob = {
	id: string;
	status: BundleTrainStatus;
	queueDepth?: number;
	retryAfterMs?: number;
};

function isActiveBundleTrainingJob(job: BundleTrainingJob | undefined): boolean {
	return job?.status === "queued" || job?.status === "running";
}

export function findReusableBundleTrainingJob(
	activeBundleTrainingJobId: string | null,
	trainingJobs: ReadonlyMap<string, BundleTrainingJob>,
): BundleTrainingJob | null {
	if (!activeBundleTrainingJobId) {
		return null;
	}
	const job = trainingJobs.get(activeBundleTrainingJobId);
	return isActiveBundleTrainingJob(job) ? job : null;
}

export function releaseCompletedBundleTrainingJob(
	activeBundleTrainingJobId: string | null,
	job: BundleTrainingJob,
): string | null {
	if (activeBundleTrainingJobId !== job.id) {
		return activeBundleTrainingJobId;
	}
	return isActiveBundleTrainingJob(job) ? activeBundleTrainingJobId : null;
}
