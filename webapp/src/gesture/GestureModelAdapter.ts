/**
 * GestureModelAdapter — canonical interface for MLP gesture classifiers.
 *
 * Motivation (from docs/research/reference-repos/blind-spot-analysis-live-2026-03-25.md):
 * The kinivi reference pipeline uses a clean, minimal `KeyPointClassifier` wrapper
 * (construct once, call to predict). Amy's Echo historically embedded MLP invocation
 * directly in the orchestrator, making it impossible to swap classifier backends
 * (TFLite, ONNX, second-tier static model) without modifying inference code.
 *
 * This interface formalises the boundary so:
 *  - The MLP backend is testable in isolation.
 *  - Alternative backends can be dropped in without changing the detection pipeline.
 *  - Contract metadata is surfaced at the adapter layer, not scattered through callers.
 */

export interface GestureModelAdapterCandidate {
  label: string;
  score: number;
}

export interface GestureModelAdapterResult {
  /** Top-1 predicted label. */
  label: string;
  /** Top-1 confidence score in [0, 1]. */
  score: number;
  /** Full ranked candidate list (top-1 first). */
  candidates: GestureModelAdapterCandidate[];
}

export interface GestureModelAdapterMetadata {
  /** Feature contract identifier, e.g. 'wrist_relative_max_abs_v1'. */
  featureContractVersion: string;
  /** Model variant tag, e.g. 'mlp_multimodal_v1'. */
  modelVariant: string;
  /** Input feature vector length expected by this adapter. */
  inputSize: number;
}

/**
 * Minimal interface that any gesture classifier backend must implement.
 * The adapter owns model loading, warmup, and inference. Callers only need
 * to prepare the feature vector and call `predict`.
 */
export interface GestureModelAdapter {
  /** Expected length of the Float32Array passed to `predict`. */
  readonly inputSize: number;

  /** Metadata for logging and contract validation. */
  readonly metadata: GestureModelAdapterMetadata;

  /**
   * Run inference on a pre-computed feature vector.
   * Returns `null` when the model is not loaded or the input is invalid.
   *
   * @param features - Normalised feature vector (length === `inputSize`).
   * @param timestamp - Frame timestamp in milliseconds (for temporal features).
   */
  predict(features: Float32Array, timestamp: number): GestureModelAdapterResult | null;

  /**
   * Optional warmup pass to avoid cold-start latency on the first real frame.
   * Should be called once after model loading completes.
   */
  warmup?(): void;
}
