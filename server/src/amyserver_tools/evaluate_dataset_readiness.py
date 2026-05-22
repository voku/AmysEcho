#!/usr/bin/env python3
"""Evaluate whether the current training snapshot is ready for honest few-shot runs."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from amyserver_tools import train_mlp as train_mlp_module
    from amyserver_tools.config_constants import (
        MAX_AVG_FRAME_DELTA_MS,
        MIN_AVG_FRAME_DELTA_MS,
        MIN_CLIP_DURATION_MS,
        MIN_FACE_COVERAGE,
        MIN_HANDS_COVERAGE,
        MIN_POSE_COVERAGE,
        MIN_USABLE_FRAME_RATIO,
    )
    from amyserver_tools.feature_schema import (
        HAND_FEATURE_CONTRACT_VERSION,
        INPUT_FEATURE_SIZE,
        WINDOW_FEATURE_SIZE,
    )
    from amyserver_tools.train_mlp_fewshot import (
        _entry_bundle,
        _entry_label,
        _entry_profile,
        _load_manifest_entries,
        _partition_profiles,
    )
except ModuleNotFoundError:
    import train_mlp as train_mlp_module
    from config_constants import (
        MAX_AVG_FRAME_DELTA_MS,
        MIN_AVG_FRAME_DELTA_MS,
        MIN_CLIP_DURATION_MS,
        MIN_FACE_COVERAGE,
        MIN_HANDS_COVERAGE,
        MIN_POSE_COVERAGE,
        MIN_USABLE_FRAME_RATIO,
    )
    from feature_schema import (
        HAND_FEATURE_CONTRACT_VERSION,
        INPUT_FEATURE_SIZE,
        WINDOW_FEATURE_SIZE,
    )
    from train_mlp_fewshot import (
        _entry_bundle,
        _entry_label,
        _entry_profile,
        _load_manifest_entries,
        _partition_profiles,
    )


PROTOCOL_VERSION = "dataset_readiness_v1"
DEFAULT_SHOTS = (1, 3, 5, 10)
DEFAULT_SEEDS = (42, 1337, 2025)
DEFAULT_TEST_PROFILE_FRACTION = 0.2


def _parse_int_list(raw: str) -> list[int]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    try:
        return [int(value) for value in values]
    except ValueError as error:
        raise ValueError(f"Ungültige Ganzzahlliste: {raw}") from error


def _safe_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return int(value)
    return default


def _safe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def _safe_entry_label(entry: dict[str, Any]) -> str:
    try:
        return _entry_label(entry)
    except ValueError:
        raw = entry.get("label")
        if isinstance(raw, str) and raw.strip():
            return train_mlp_module.normalize_training_label(raw)
        return "unknown"


def _build_thresholds(
    *,
    shots: list[int],
    seeds: list[int],
    min_profiles: int,
    min_labels: int,
) -> dict[str, Any]:
    return {
        "shots": shots,
        "seeds": seeds,
        "test_profile_fraction": DEFAULT_TEST_PROFILE_FRACTION,
        "min_profiles": min_profiles,
        "min_labels": min_labels,
        "required_feature_contract_version": HAND_FEATURE_CONTRACT_VERSION,
        "expected_frame_feature_size": INPUT_FEATURE_SIZE,
        "expected_window_feature_size": WINDOW_FEATURE_SIZE,
        "min_usable_frame_ratio": float(MIN_USABLE_FRAME_RATIO),
        "min_clip_duration_ms": float(MIN_CLIP_DURATION_MS),
        "min_hands_coverage": float(MIN_HANDS_COVERAGE),
        "min_pose_coverage": float(MIN_POSE_COVERAGE),
        "min_face_coverage": float(MIN_FACE_COVERAGE),
        "min_avg_frame_delta_ms": float(MIN_AVG_FRAME_DELTA_MS),
        "max_avg_frame_delta_ms": float(MAX_AVG_FRAME_DELTA_MS),
    }


def _empty_summary(
    *,
    manifest_path: Path,
    data_dir: Path,
    shots: list[int],
    seeds: list[int],
    min_profiles: int,
    min_labels: int,
) -> dict[str, Any]:
    shot_summaries = [
        {
            "shot": shot,
            "configured_seed_count": len(seeds),
            "ready": False,
            "ready_for_some_seeds": False,
            "ready_label_count": 0,
            "ready_label_count_for_some_seeds": 0,
            "total_label_count": 0,
            "missing_labels": [],
        }
        for shot in shots
    ]
    return {
        "protocol": PROTOCOL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "blocked",
        "manifest": {
            "path": str(manifest_path),
            "data_dir": str(data_dir),
            "exists": manifest_path.exists(),
            "entry_count": 0,
            "label_count": 0,
            "accepted_bundle_count": 0,
            "accepted_label_count": 0,
            "accepted_profile_count": 0,
            "rejected_bundle_count": 0,
            "missing_landmark_bundle_count": 0,
            "feature_contract_mismatch_count": 0,
        },
        "holdout": {
            "ready": False,
            "accepted_profile_count": 0,
            "missing_profile_count": max(0, min_profiles),
        },
        "shots": shot_summaries,
        "labels": [],
        "rejected_bundles": [],
        "quality": {
            "warning_bundle_count": 0,
            "warning_counts": {},
        },
        "thresholds": _build_thresholds(
            shots=shots,
            seeds=seeds,
            min_profiles=min_profiles,
            min_labels=min_labels,
        ),
        "blockers": [],
        "warnings": [],
        "artifact_paths": {},
    }


def _resolve_bundle_dir(entry: dict[str, Any], data_dir: Path) -> Path:
    storage = entry.get("storage")
    if not isinstance(storage, dict):
        raise ValueError("missing_storage")
    relative = storage.get("directory")
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError("missing_storage_directory")
    return train_mlp_module.ensure_inside(data_dir, data_dir / relative.strip())


def _quality_warnings(
    *,
    metadata: dict[str, Any],
    timing_stats: dict[str, Any] | None,
    modality_coverage: dict[str, float] | None,
) -> list[str]:
    warnings: list[str] = []
    recording = train_mlp_module._extract_recording_metadata(metadata) or {}
    frame_count = _safe_float(recording.get("frameCount"))
    usable_frame_count = _safe_float(recording.get("usableFrameCount"))
    if frame_count and usable_frame_count is not None and frame_count > 0:
        if (usable_frame_count / frame_count) < MIN_USABLE_FRAME_RATIO:
            warnings.append("low_usable_frame_ratio")

    clip_duration_ms = _safe_float(recording.get("clipDurationMs"))
    if clip_duration_ms is not None and clip_duration_ms > 0 and clip_duration_ms < MIN_CLIP_DURATION_MS:
        warnings.append("short_clip")

    if timing_stats:
        avg_delta = _safe_float(timing_stats.get("averageDeltaMs"))
        if timing_stats.get("nonMonotonic"):
            warnings.append("non_monotonic_timestamps")
        if avg_delta is not None and (
            avg_delta < MIN_AVG_FRAME_DELTA_MS or avg_delta > MAX_AVG_FRAME_DELTA_MS
        ):
            warnings.append("avg_frame_delta_out_of_range")

    if modality_coverage:
        hands = _safe_float(modality_coverage.get("hands"))
        pose = _safe_float(modality_coverage.get("pose"))
        face = _safe_float(modality_coverage.get("face"))
        if hands is not None and hands < MIN_HANDS_COVERAGE:
            warnings.append("low_hands_coverage")
        if pose is not None and pose < MIN_POSE_COVERAGE:
            warnings.append("low_pose_coverage")
        if face is not None and face < MIN_FACE_COVERAGE:
            warnings.append("low_face_coverage")

    validation_summary = metadata.get("validationSummary")
    if isinstance(validation_summary, dict):
        issues = validation_summary.get("issues")
        if isinstance(issues, list) and any(isinstance(item, str) and item.strip() for item in issues):
            warnings.append("validation_summary_issues")

    return sorted(set(warnings))


def _analyze_bundle(entry: dict[str, Any], data_dir: Path) -> dict[str, Any]:
    bundle_id = _entry_bundle(entry)
    label = _entry_label(entry)
    profile_id = _entry_profile(entry)
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    feature_contract = metadata.get("featureContract")

    analysis: dict[str, Any] = {
        "bundle_id": bundle_id,
        "label": label,
        "profile_id": profile_id,
        "accepted_for_training": False,
        "window_count": 0,
        "frame_count": 0,
        "usable_frame_count": 0,
        "issue_codes": [],
        "warning_codes": [],
        "rejection_reasons": [],
        "used_clip_fallback": False,
    }

    if not train_mlp_module.has_expected_feature_contract(feature_contract):
        analysis["issue_codes"].append(
            "feature_contract_mismatch"
            if isinstance(feature_contract, dict)
            else "feature_contract_missing"
        )
        analysis["rejection_reasons"] = list(analysis["issue_codes"])
        return analysis

    try:
        bundle_dir = _resolve_bundle_dir(entry, data_dir)
    except ValueError as error:
        analysis["issue_codes"].append(str(error))
        analysis["rejection_reasons"] = list(analysis["issue_codes"])
        return analysis

    try:
        landmarks_relative = train_mlp_module.select_landmarks_relative_path(entry)
        landmarks_path = train_mlp_module.ensure_inside(
            bundle_dir,
            bundle_dir / Path(landmarks_relative),
        )
    except ValueError:
        analysis["issue_codes"].append("invalid_landmarks_path")
        analysis["rejection_reasons"] = list(analysis["issue_codes"])
        return analysis

    cache_path = bundle_dir / train_mlp_module.CACHE_FILENAME
    clip_path = train_mlp_module._resolve_clip_path(entry, bundle_dir)
    still_path = train_mlp_module._resolve_still_path(entry, bundle_dir)
    frame_list, load_stats = train_mlp_module.load_frame_list_for_bundle(
        landmarks_path,
        cache_path,
        clip_path,
        still_path,
    )

    if _safe_int(load_stats.get("bundle_missing_landmarks")) > 0:
        analysis["issue_codes"].append("missing_landmarks")
    if _safe_int(load_stats.get("bundle_fallback_extractions")) > 0:
        analysis["used_clip_fallback"] = True

    analysis["frame_count"] = len(frame_list)
    if not frame_list:
        analysis["issue_codes"].append("no_frames_loaded")
        analysis["rejection_reasons"] = sorted(set(analysis["issue_codes"]))
        return analysis

    timing_stats = train_mlp_module._apply_timing_weights(frame_list)
    frame_modality_counts, frame_modality_coverage = train_mlp_module._summarize_frame_modalities(frame_list)
    modality_coverage = train_mlp_module._resolve_modality_coverage(
        train_mlp_module._extract_modality_coverage(metadata),
        frame_modality_coverage,
    )
    analysis["warning_codes"] = _quality_warnings(
        metadata=metadata,
        timing_stats=timing_stats,
        modality_coverage=modality_coverage,
    )

    hand_focus = metadata.get("handFocus")
    normalized_frames: list[Any] = []
    frame_weights: list[float] = []
    for frame in frame_list:
        landmarks = frame.get("landmarks")
        if hand_focus and landmarks:
            landmarks = train_mlp_module.apply_hand_focus(
                landmarks,
                hand_focus,
                frame.get("handedness"),
            )
        vector = train_mlp_module._normalize_frame(
            landmarks,
            frame.get("poseLandmarks"),
            frame.get("faceLandmarks"),
        )
        if vector is None:
            continue
        normalized_frames.append(vector)
        frame_weights.append(float(frame.get("weight", 1.0)))

    analysis["usable_frame_count"] = len(normalized_frames)
    if not normalized_frames:
        analysis["issue_codes"].append("no_usable_frames")
        analysis["rejection_reasons"] = sorted(set(analysis["issue_codes"]))
        return analysis

    ctx = {
        "profile_id": profile_id,
        "source_bundle_id": bundle_id,
        "recording": train_mlp_module._extract_recording_metadata(metadata),
        "timing_stats": timing_stats,
        "modality_coverage": modality_coverage,
    }
    sign_samples = train_mlp_module.create_sliding_windows(
        normalized_frames,
        label,
        ctx,
        frame_weights,
        feature_mode=train_mlp_module.FEATURE_MODE,
    )
    analysis["window_count"] = len(sign_samples)
    if not sign_samples:
        analysis["issue_codes"].append("no_windows_generated")
        analysis["rejection_reasons"] = sorted(set(analysis["issue_codes"]))
        return analysis

    analysis["accepted_for_training"] = True
    analysis["rejection_reasons"] = []
    analysis["modality_frame_counts"] = frame_modality_counts
    analysis["modality_coverage"] = modality_coverage or {}
    analysis["timing_stats"] = timing_stats or {}
    return analysis


def _build_label_counts(
    bundle_analyses: list[dict[str, Any]],
) -> tuple[
    dict[str, dict[str, int]],
    dict[str, dict[str, Any]],
]:
    counts_by_label_profile: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    label_meta: dict[str, dict[str, Any]] = {}
    for bundle in bundle_analyses:
        label = str(bundle["label"])
        profile_id = str(bundle["profile_id"])
        current = label_meta.setdefault(
            label,
            {
                "label": label,
                "manifest_bundle_count": 0,
                "accepted_bundle_count": 0,
                "accepted_profile_ids": set(),
                "window_count": 0,
                "rejection_reasons": Counter(),
                "quality_warning_counts": Counter(),
            },
        )
        current["manifest_bundle_count"] += 1
        for reason in bundle.get("rejection_reasons", []):
            current["rejection_reasons"][str(reason)] += 1
        for warning in bundle.get("warning_codes", []):
            current["quality_warning_counts"][str(warning)] += 1
        if bundle.get("accepted_for_training"):
            current["accepted_bundle_count"] += 1
            current["window_count"] += _safe_int(bundle.get("window_count"))
            current["accepted_profile_ids"].add(profile_id)
            counts_by_label_profile[label][profile_id] += 1
    return counts_by_label_profile, label_meta


def _compute_shot_seed_status(
    *,
    profiles: list[str],
    per_profile_counts: dict[str, int],
    shot: int,
    seeds: list[int],
) -> dict[str, Any]:
    seed_results: list[dict[str, Any]] = []
    for seed in seeds:
        if len(profiles) < 2:
            seed_results.append(
                {
                    "seed": seed,
                    "ready": False,
                    "reason": "insufficient_profiles_for_split",
                    "train_bundle_count": 0,
                    "heldout_profile_ids": [],
                    "missing_train_bundles": shot,
                    "missing_heldout_profiles": 1,
                }
            )
            continue

        train_profiles, test_profiles = _partition_profiles(
            profiles=profiles,
            seed=seed,
            explicit_test_profiles=[],
            test_fraction=DEFAULT_TEST_PROFILE_FRACTION,
        )
        heldout_profile_ids = [
            profile_id
            for profile_id in test_profiles
            if _safe_int(per_profile_counts.get(profile_id)) > 0
        ]
        train_bundle_count = sum(
            _safe_int(per_profile_counts.get(profile_id))
            for profile_id in train_profiles
        )
        ready = len(heldout_profile_ids) > 0 and train_bundle_count >= shot
        seed_results.append(
            {
                "seed": seed,
                "ready": ready,
                "reason": "ready"
                if ready
                else (
                    "missing_heldout_profile"
                    if len(heldout_profile_ids) == 0
                    else "insufficient_train_bundles"
                ),
                "train_bundle_count": train_bundle_count,
                "heldout_profile_ids": heldout_profile_ids,
                "missing_train_bundles": max(0, shot - train_bundle_count),
                "missing_heldout_profiles": 0 if len(heldout_profile_ids) > 0 else 1,
            }
        )

    ready_seed_count = sum(1 for result in seed_results if result["ready"])
    failing_results = [result for result in seed_results if not result["ready"]]
    return {
        "configured_seed_count": len(seeds),
        "ready_seed_count": ready_seed_count,
        "ready_for_all_seeds": len(seeds) > 0 and ready_seed_count == len(seeds),
        "ready_for_some_seeds": ready_seed_count > 0,
        "ready_seeds": [result["seed"] for result in seed_results if result["ready"]],
        "failing_seeds": failing_results,
        "max_missing_train_bundles": max(
            [result["missing_train_bundles"] for result in failing_results],
            default=0,
        ),
        "max_missing_heldout_profiles": max(
            [result["missing_heldout_profiles"] for result in failing_results],
            default=0,
        ),
    }


def _summarize_labels(
    *,
    label_meta: dict[str, dict[str, Any]],
    counts_by_label_profile: dict[str, dict[str, int]],
    accepted_profiles: list[str],
    shots: list[int],
    seeds: list[int],
    min_profiles: int,
) -> tuple[list[dict[str, Any]], dict[int, list[dict[str, Any]]]]:
    labels: list[dict[str, Any]] = []
    missing_samples_by_shot: dict[int, list[dict[str, Any]]] = {shot: [] for shot in shots}

    for label, item in sorted(label_meta.items()):
        accepted_profile_count = len(item["accepted_profile_ids"])
        ready_shots: list[int] = []
        partially_ready_shots: list[int] = []
        shot_readiness: dict[str, dict[str, Any]] = {}

        per_profile_counts = counts_by_label_profile.get(label, {})
        for shot in shots:
            seed_status = _compute_shot_seed_status(
                profiles=accepted_profiles,
                per_profile_counts=per_profile_counts,
                shot=shot,
                seeds=seeds,
            )
            shot_key = str(shot)
            overall_missing_profiles = max(0, min_profiles - accepted_profile_count)
            shot_readiness[shot_key] = {
                **seed_status,
                "missing_profiles_overall": overall_missing_profiles,
            }
            if seed_status["ready_for_all_seeds"] and overall_missing_profiles == 0:
                ready_shots.append(shot)
            elif seed_status["ready_for_some_seeds"]:
                partially_ready_shots.append(shot)

            if not seed_status["ready_for_all_seeds"] or overall_missing_profiles > 0:
                missing_samples_by_shot[shot].append(
                    {
                        "label": label,
                        "accepted_bundle_count": int(item["accepted_bundle_count"]),
                        "accepted_profile_count": accepted_profile_count,
                        "configured_seed_count": seed_status["configured_seed_count"],
                        "ready_seed_count": seed_status["ready_seed_count"],
                        "ready_for_all_seeds": seed_status["ready_for_all_seeds"],
                        "ready_for_some_seeds": seed_status["ready_for_some_seeds"],
                        "missing_train_bundles": seed_status["max_missing_train_bundles"],
                        "missing_heldout_profiles": seed_status["max_missing_heldout_profiles"],
                        "missing_profiles_overall": overall_missing_profiles,
                        "failing_seeds": seed_status["failing_seeds"],
                    }
                )

        labels.append(
            {
                "label": label,
                "manifest_bundle_count": int(item["manifest_bundle_count"]),
                "accepted_bundle_count": int(item["accepted_bundle_count"]),
                "accepted_profile_count": accepted_profile_count,
                "window_count": int(item["window_count"]),
                "ready_shots": ready_shots,
                "partially_ready_shots": partially_ready_shots,
                "shot_readiness": shot_readiness,
                "rejection_reasons": dict(sorted(item["rejection_reasons"].items())),
                "quality_warning_counts": dict(sorted(item["quality_warning_counts"].items())),
            }
        )

    return labels, missing_samples_by_shot


def _summarize_shots(
    *,
    labels: list[dict[str, Any]],
    shots: list[int],
    seeds: list[int],
    holdout_ready: bool,
    min_labels: int,
) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    total_label_count = len(labels)

    for shot in shots:
        ready_label_count = 0
        partially_ready_label_count = 0
        missing_labels: list[dict[str, Any]] = []
        shot_key = str(shot)

        for label in labels:
            shot_readiness = label.get("shot_readiness", {}).get(shot_key, {})
            if shot_readiness.get("ready_for_all_seeds") and _safe_int(
                shot_readiness.get("missing_profiles_overall")
            ) == 0:
                ready_label_count += 1
                continue
            if shot_readiness.get("ready_for_some_seeds"):
                partially_ready_label_count += 1
            missing_labels.append(
                {
                    "label": label["label"],
                    "configured_seed_count": _safe_int(shot_readiness.get("configured_seed_count")),
                    "ready_seed_count": _safe_int(shot_readiness.get("ready_seed_count")),
                    "ready_for_all_seeds": bool(shot_readiness.get("ready_for_all_seeds")),
                    "ready_for_some_seeds": bool(shot_readiness.get("ready_for_some_seeds")),
                    "missing_train_bundles": _safe_int(shot_readiness.get("max_missing_train_bundles")),
                    "missing_heldout_profiles": _safe_int(
                        shot_readiness.get("max_missing_heldout_profiles")
                    ),
                    "missing_profiles": _safe_int(shot_readiness.get("missing_profiles_overall")),
                }
            )

        missing_labels.sort(
            # Prefer labels that still need more signer diversity before pure
            # bundle-volume gaps so the next recording effort improves holdout honesty first.
            key=lambda item: (
                item["missing_profiles"],
                item["missing_heldout_profiles"],
                item["missing_train_bundles"],
                item["label"],
            ),
            reverse=True,
        )
        summaries.append(
            {
                "shot": shot,
                "configured_seed_count": len(seeds),
                "ready": holdout_ready and ready_label_count >= min_labels,
                "ready_for_some_seeds": holdout_ready
                and (ready_label_count + partially_ready_label_count) >= min_labels,
                "ready_label_count": ready_label_count,
                "ready_label_count_for_some_seeds": ready_label_count + partially_ready_label_count,
                "total_label_count": total_label_count,
                "missing_labels": missing_labels,
            }
        )

    return summaries


def _build_missing_samples_payload(
    *,
    summary: dict[str, Any],
    missing_samples_by_shot: dict[int, list[dict[str, Any]]],
) -> dict[str, Any]:
    shot_items = []
    for shot in summary["thresholds"]["shots"]:
        shot_items.append(
            {
                "shot": shot,
                "labels": missing_samples_by_shot.get(shot, []),
            }
        )
    return {
        "protocol": PROTOCOL_VERSION,
        "generated_at": summary["generated_at"],
        "shots": shot_items,
    }


def build_dataset_readiness_summary(
    *,
    manifest_path: Path,
    data_dir: Path,
    shots: list[int],
    seeds: list[int],
    min_profiles: int,
    min_labels: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    summary = _empty_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=shots,
        seeds=seeds,
        min_profiles=min_profiles,
        min_labels=min_labels,
    )
    empty_missing_samples = _build_missing_samples_payload(
        summary=summary,
        missing_samples_by_shot={shot: [] for shot in shots},
    )

    if not manifest_path.exists():
        summary["blockers"].append("Kein Trainings-Manifest unter dem angeforderten Pfad gefunden.")
        return summary, empty_missing_samples

    try:
        entries = _load_manifest_entries(manifest_path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        summary["blockers"].append(f"Trainings-Manifest konnte nicht gelesen werden: {error}")
        return summary, empty_missing_samples

    if not entries:
        summary["manifest"]["exists"] = True
        summary["blockers"].append("Trainings-Manifest ist vorhanden, enthält aber keine Einträge.")
        return summary, empty_missing_samples

    bundle_analyses: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        try:
            bundle_analyses.append(_analyze_bundle(entry, data_dir))
        except (json.JSONDecodeError, KeyError, OSError, TypeError, ValueError) as error:
            bundle_analyses.append(
                {
                    "bundle_id": str(entry.get("id") or "unknown-bundle"),
                    "label": _safe_entry_label(entry),
                    "profile_id": _entry_profile(entry),
                    "accepted_for_training": False,
                    "window_count": 0,
                    "frame_count": 0,
                    "usable_frame_count": 0,
                    "issue_codes": ["analysis_error"],
                    "warning_codes": [],
                    "rejection_reasons": [str(error)],
                    "used_clip_fallback": False,
                }
            )

    counts_by_label_profile, label_meta = _build_label_counts(bundle_analyses)
    accepted_profiles = sorted(
        {
            str(bundle["profile_id"])
            for bundle in bundle_analyses
            if bundle.get("accepted_for_training")
        }
    )
    labels, missing_samples_by_shot = _summarize_labels(
        label_meta=label_meta,
        counts_by_label_profile=counts_by_label_profile,
        accepted_profiles=accepted_profiles,
        shots=shots,
        seeds=seeds,
        min_profiles=min_profiles,
    )

    accepted_label_count = sum(
        1 for label in labels if _safe_int(label.get("accepted_bundle_count")) > 0
    )
    rejected_bundles = [
        {
            "bundle_id": bundle["bundle_id"],
            "label": bundle["label"],
            "issue_codes": bundle.get("issue_codes", []),
            "warning_codes": bundle.get("warning_codes", []),
        }
        for bundle in bundle_analyses
        if not bundle.get("accepted_for_training")
    ]
    warning_counts = Counter()
    for bundle in bundle_analyses:
        for warning in bundle.get("warning_codes", []):
            warning_counts[str(warning)] += 1

    holdout_ready = len(accepted_profiles) >= min_profiles
    shot_summaries = _summarize_shots(
        labels=labels,
        shots=shots,
        seeds=seeds,
        holdout_ready=holdout_ready,
        min_labels=min_labels,
    )

    manifest_payload = summary["manifest"]
    manifest_payload["exists"] = True
    manifest_payload["entry_count"] = len(entries)
    manifest_payload["label_count"] = len(labels)
    manifest_payload["accepted_bundle_count"] = sum(
        1 for bundle in bundle_analyses if bundle.get("accepted_for_training")
    )
    manifest_payload["accepted_label_count"] = accepted_label_count
    manifest_payload["accepted_profile_count"] = len(accepted_profiles)
    manifest_payload["rejected_bundle_count"] = len(rejected_bundles)
    manifest_payload["missing_landmark_bundle_count"] = sum(
        1 for bundle in bundle_analyses if "missing_landmarks" in bundle.get("issue_codes", [])
    )
    manifest_payload["feature_contract_mismatch_count"] = sum(
        1
        for bundle in bundle_analyses
        if any(
            issue in {"feature_contract_missing", "feature_contract_mismatch"}
            for issue in bundle.get("issue_codes", [])
        )
    )

    summary["holdout"] = {
        "ready": holdout_ready,
        "accepted_profile_count": len(accepted_profiles),
        "missing_profile_count": max(0, min_profiles - len(accepted_profiles)),
    }
    summary["labels"] = labels
    summary["shots"] = shot_summaries
    summary["rejected_bundles"] = rejected_bundles
    summary["quality"] = {
        "warning_bundle_count": sum(1 for bundle in bundle_analyses if bundle.get("warning_codes")),
        "warning_counts": dict(sorted(warning_counts.items())),
    }

    blockers: list[str] = []
    warnings: list[str] = []
    if not holdout_ready:
        blockers.append(
            f"Signer-sicherer Holdout ist blockiert, weil weniger als {min_profiles} Profile nutzbare Bundles haben."
        )
    if accepted_label_count < min_labels:
        blockers.append(
            f"Mindestens {min_labels} Labels brauchen nutzbare Bundles, bevor eine ehrliche Few-Shot-Baseline laufen kann."
        )
    if not any(shot["ready"] for shot in shot_summaries):
        blockers.append(
            "Keine Ziel-Shot-Anzahl hat derzeit genug Holdout-sichere Labels für alle konfigurierten Seeds."
        )
    elif not all(shot["ready"] for shot in shot_summaries):
        warnings.append(
            "Nur ein Teil des 1/3/5/10-Shot-Durchlaufs ist derzeit für alle konfigurierten Seeds machbar."
        )

    if any(
        not shot["ready"] and shot["ready_for_some_seeds"]
        for shot in shot_summaries
    ):
        warnings.append(
            "Mindestens eine Shot-Stufe ist nur für einige Seeds machbar und nicht für alle Holdout-Aufteilungen."
        )

    if manifest_payload["rejected_bundle_count"] > 0:
        warnings.append(
            f"{manifest_payload['rejected_bundle_count']} Bundle(s) stehen im Manifest, sind aber fürs Training unbrauchbar."
        )
    if warning_counts:
        warnings.append("Einige akzeptierte Bundles haben noch Timing- oder Modalitätsqualitätswarnungen.")

    summary["blockers"] = blockers
    summary["warnings"] = warnings
    if blockers:
        summary["status"] = "blocked"
    elif warnings:
        summary["status"] = "partial"
    else:
        summary["status"] = "ready"

    missing_samples = _build_missing_samples_payload(
        summary=summary,
        missing_samples_by_shot=missing_samples_by_shot,
    )
    return summary, missing_samples


def _render_summary_markdown(summary: dict[str, Any]) -> str:
    manifest = summary["manifest"]
    holdout = summary["holdout"]
    lines = [
        "# Dataset readiness summary",
        "",
        f"- Protocol: `{summary['protocol']}`",
        f"- Generated at: `{summary['generated_at']}`",
        f"- Status: `{summary['status']}`",
        f"- Manifest path: `{manifest['path']}`",
        f"- Data dir: `{manifest['data_dir']}`",
        f"- Manifest entries: `{manifest['entry_count']}`",
        f"- Accepted bundles: `{manifest['accepted_bundle_count']}`",
        f"- Rejected bundles: `{manifest['rejected_bundle_count']}`",
        f"- Accepted labels: `{manifest['accepted_label_count']}`",
        f"- Accepted profiles: `{manifest['accepted_profile_count']}`",
        f"- Signer-safe holdout ready: `{holdout['ready']}`",
        "",
    ]

    blockers = summary.get("blockers", [])
    lines.append("## Blockers")
    lines.append("")
    if blockers:
        for blocker in blockers:
            lines.append(f"- {blocker}")
    else:
        lines.append("- None.")

    warnings = summary.get("warnings", [])
    lines.extend(["", "## Warnings", ""])
    if warnings:
        for warning in warnings:
            lines.append(f"- {warning}")
    else:
        lines.append("- None.")

    lines.extend(
        [
            "",
            "## Shot readiness",
            "",
            "| Shot | Ready for all seeds | Ready for some seeds | Ready labels | Ready labels (some seeds) | Total labels |",
            "| --- | --- | --- | ---: | ---: | ---: |",
        ]
    )
    for shot in summary.get("shots", []):
        lines.append(
            "| "
            f"{shot['shot']} | "
            f"{'yes' if shot['ready'] else 'no'} | "
            f"{'yes' if shot['ready_for_some_seeds'] else 'no'} | "
            f"{shot['ready_label_count']} | "
            f"{shot['ready_label_count_for_some_seeds']} | "
            f"{shot['total_label_count']} |"
        )

    lines.extend(
        [
            "",
            "## Label gaps",
            "",
            "| Label | Accepted bundles | Accepted profiles | Ready shots | Partially ready shots |",
            "| --- | ---: | ---: | --- | --- |",
        ]
    )
    for label in summary.get("labels", []):
        ready_shots = ",".join(str(value) for value in label.get("ready_shots", [])) or "-"
        partial_shots = ",".join(str(value) for value in label.get("partially_ready_shots", [])) or "-"
        lines.append(
            f"| {label['label']} | {label['accepted_bundle_count']} | {label['accepted_profile_count']} | "
            f"{ready_shots} | {partial_shots} |"
        )

    if summary.get("rejected_bundles"):
        lines.extend(["", "## Rejected bundles", ""])
        for bundle in summary["rejected_bundles"][:20]:
            issue_text = ", ".join(bundle.get("issue_codes", [])) or "unknown_issue"
            lines.append(f"- `{bundle['bundle_id']}` / `{bundle['label']}`: {issue_text}")

    return "\n".join(lines) + "\n"


def _write_outputs(
    output_dir: Path,
    summary: dict[str, Any],
    missing_samples: dict[str, Any],
) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "summary.json"
    markdown_path = output_dir / "summary.md"
    latest_json_path = output_dir / "latest.json"
    latest_markdown_path = output_dir / "latest.md"
    missing_samples_path = output_dir / "missing_samples.json"
    markdown = _render_summary_markdown(summary)
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(markdown, encoding="utf-8")
    latest_json_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    latest_markdown_path.write_text(markdown, encoding="utf-8")
    missing_samples_path.write_text(
        json.dumps(missing_samples, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return {
        "summary_json": str(summary_path),
        "summary_markdown": str(markdown_path),
        "latest_json": str(latest_json_path),
        "latest_markdown": str(latest_markdown_path),
        "missing_samples_json": str(missing_samples_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--shots", default="1,3,5,10")
    parser.add_argument("--min-profiles", type=int, default=2)
    parser.add_argument("--min-labels", type=int, default=2)
    args = parser.parse_args()

    shots = sorted(set(_parse_int_list(args.shots)))
    if not shots:
        parser.error("--shots must include at least one integer")
    if args.min_profiles <= 0:
        parser.error("--min-profiles must be a positive integer")
    if args.min_labels <= 0:
        parser.error("--min-labels must be a positive integer")

    summary, missing_samples = build_dataset_readiness_summary(
        manifest_path=args.manifest.resolve(),
        data_dir=args.data_dir.resolve(),
        shots=shots,
        seeds=list(DEFAULT_SEEDS),
        min_profiles=args.min_profiles,
        min_labels=args.min_labels,
    )
    summary["artifact_paths"] = _write_outputs(
        args.output_dir.resolve(),
        summary,
        missing_samples,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
