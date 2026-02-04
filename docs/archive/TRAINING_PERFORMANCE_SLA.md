# Training Performance SLA

Amy’s communication must remain responsive, so training jobs have a strict SLA.

## Configuration
- `TRAINING_JOB_TIMEOUT_MS` (hard timeout, default: 600000)
- `TRAINING_JOB_SLA_MS` (kid-friendly SLA, default: 120000)

The SLA is enforced even if the timeout is larger. When training exceeds the SLA:
- A warning is logged for regression tracking.
- The training job is marked failed with a German error message.

## Metrics
Training jobs now report:
- `trainingDurationMs`
- `workflowDurationMs`
- `captureToTrainMs` (when capture timestamps exist)
- `bundleFrames`

Use these metrics to detect regressions and optimize the capture → train loop.
