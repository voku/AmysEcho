import {
	findReusableBundleTrainingJob,
	releaseCompletedBundleTrainingJob,
} from '../src/services/bundleTrainingJobState.js';

describe('bundle training job state helpers', () => {
  it('reuses the active bundle job while it is queued or running', () => {
    const queuedJob = {
      id: 'job-queued',
      status: 'queued' as const,
      queueDepth: 3,
      retryAfterMs: 1000,
    };
    const runningJob = {
      id: 'job-running',
      status: 'running' as const,
      queueDepth: 0,
    };

    expect(
      findReusableBundleTrainingJob(queuedJob.id, new Map([[queuedJob.id, queuedJob]])),
    ).toEqual(queuedJob);
    expect(
      findReusableBundleTrainingJob(runningJob.id, new Map([[runningJob.id, runningJob]])),
    ).toEqual(runningJob);
  });

  it('does not reuse completed or failed bundle jobs and clears the active id once they finish', () => {
    const completedJob = { id: 'job-completed', status: 'completed' as const };
    const failedJob = { id: 'job-failed', status: 'failed' as const };

    expect(
      findReusableBundleTrainingJob(completedJob.id, new Map([[completedJob.id, completedJob]])),
    ).toBeNull();
    expect(
      findReusableBundleTrainingJob(failedJob.id, new Map([[failedJob.id, failedJob]])),
    ).toBeNull();

    expect(releaseCompletedBundleTrainingJob(completedJob.id, completedJob)).toBeNull();
    expect(releaseCompletedBundleTrainingJob(failedJob.id, failedJob)).toBeNull();
  });
});
