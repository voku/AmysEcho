#!/usr/bin/env python3
"""Evaluate whether the current training snapshot is ready for honest few-shot runs."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
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
    )


DEFAULT_SHOTS = (1, 3, 5, 10)


def _parse_int_list(raw: str) -> list[int]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    try:
        return [int(value) for value in values]
    except ValueError as error:
        raise ValueError(f"Invalid integer list: {raw}") from error


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


def _empty_summary(manifest_path: Path, data_dir: Path, shots: list[int]) -> dict[str, Any]:
    shot_summaries = [
        {
            "shot": shot,
            "ready": False,
            "ready_label_count": 0,
            "total_label_count": 0,
            "missing_labels": [],
        }
        for shot in shots
    ]
    return {
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
            "missing_profile_count": 2,
        },
        "shots": shot_summaries,
        "labels": [],
        "rejected_bundles": [],
        "quality": {
            "warning_bundle_count": 0,
            "warning_counts": {},
        },
        "thresholds": {
            "shots": shots,
            "min_profiles_for_holdout": 2,
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
        },
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


def _summarize_labels(
    bundle_analyses: list[dict[str, Any]],
    shots: list[int],
) -> list[dict[str, Any]]:
    label_map: dict[str, dict[str, Any]] = {}
    for bundle in bundle_analyses:
        label = str(bundle["label"])
        current = label_map.setdefault(
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
        if bundle.get("accepted_for_training"):
            current["accepted_bundle_count"] += 1
            current["window_count"] += _safe_int(bundle.get("window_count"))
            current["accepted_profile_ids"].add(str(bundle["profile_id"]))
        for reason in bundle.get("rejection_reasons", []):
            current["rejection_reasons"][str(reason)] += 1
        for warning in bundle.get("warning_codes", []):
            current["quality_warning_counts"][str(warning)] += 1

    labels: list[dict[str, Any]] = []
    for label, item in sorted(label_map.items()):
        accepted_profile_count = len(item["accepted_profile_ids"])
        ready_shots: list[int] = []
        missing_by_shot: list[dict[str, int]] = []
        for shot in shots:
            missing_accepted_bundles = max(0, (shot + 1) - int(item["accepted_bundle_count"]))
            missing_profiles = max(0, 2 - accepted_profile_count)
            if missing_accepted_bundles == 0 and missing_profiles == 0:
                ready_shots.append(shot)
            else:
                missing_by_shot.append(
                    {
                        "shot": shot,
                        "missing_accepted_bundles": missing_accepted_bundles,
                        "missing_profiles": missing_profiles,
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
                "missing_by_shot": missing_by_shot,
                "rejection_reasons": dict(sorted(item["rejection_reasons"].items())),
                "quality_warning_counts": dict(sorted(item["quality_warning_counts"].items())),
            }
        )

    return labels


def _summarize_shots(
    labels: list[dict[str, Any]],
    shots: list[int],
    holdout_ready: bool,
) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    total_label_count = len(labels)
    for shot in shots:
        missing_labels: list[dict[str, Any]] = []
        ready_label_count = 0
        for label in labels:
            accepted_bundle_count = _safe_int(label.get("accepted_bundle_count"))
            accepted_profile_count = _safe_int(label.get("accepted_profile_count"))
            missing_accepted_bundles = max(0, (shot + 1) - accepted_bundle_count)
            missing_profiles = max(0, 2 - accepted_profile_count)
            if missing_accepted_bundles == 0 and missing_profiles == 0:
                ready_label_count += 1
                continue
            missing_labels.append(
                {
                    "label": label["label"],
                    "missing_accepted_bundles": missing_accepted_bundles,
                    "missing_profiles": missing_profiles,
                }
            )

        missing_labels.sort(
            key=lambda item: (
                item["missing_profiles"],
                item["missing_accepted_bundles"],
                item["label"],
            ),
            reverse=True,
        )
        summaries.append(
            {
                "shot": shot,
                "ready": holdout_ready and ready_label_count >= 2,
                "ready_label_count": ready_label_count,
                "total_label_count": total_label_count,
                "missing_labels": missing_labels,
            }
        )

    return summaries


def build_dataset_readiness_summary(
    *,
    manifest_path: Path,
    data_dir: Path,
    shots: list[int],
) -> dict[str, Any]:
    summary = _empty_summary(manifest_path, data_dir, shots)
    if not manifest_path.exists():
        summary["blockers"].append("No training manifest snapshot exists at the requested path.")
        return summary

    try:
        entries = _load_manifest_entries(manifest_path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        summary["blockers"].append(f"Training manifest could not be parsed: {error}")
        return summary

    if not entries:
        summary["manifest"]["exists"] = True
        summary["blockers"].append("Training manifest exists but contains no entries.")
        return summary

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

    labels = _summarize_labels(bundle_analyses, shots)
    accepted_profile_ids = sorted(
        {
            str(bundle["profile_id"])
            for bundle in bundle_analyses
            if bundle.get("accepted_for_training")
        }
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

    holdout_ready = len(accepted_profile_ids) >= 2
    shot_summaries = _summarize_shots(labels, shots, holdout_ready)

    manifest_payload = summary["manifest"]
    manifest_payload["exists"] = True
    manifest_payload["entry_count"] = len(entries)
    manifest_payload["label_count"] = len(labels)
    manifest_payload["accepted_bundle_count"] = sum(
        1 for bundle in bundle_analyses if bundle.get("accepted_for_training")
    )
    manifest_payload["accepted_label_count"] = accepted_label_count
    manifest_payload["accepted_profile_count"] = len(accepted_profile_ids)
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
        "accepted_profile_count": len(accepted_profile_ids),
        "missing_profile_count": max(0, 2 - len(accepted_profile_ids)),
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
            "Signer-safe holdout is blocked because fewer than 2 profiles have usable bundles."
        )
    if accepted_label_count < 2:
        blockers.append(
            "At least 2 labels need usable bundles before an honest few-shot baseline can run."
        )
    if not any(shot["ready"] for shot in shot_summaries):
        blockers.append(
            "No target shot count currently has at least 2 holdout-safe labels."
        )
    elif not all(shot["ready"] for shot in shot_summaries):
        warnings.append(
            "Only part of the 1/3/5/10-shot sweep is currently feasible with honest holdout."
        )
    if manifest_payload["rejected_bundle_count"] > 0:
        warnings.append(
            f"{manifest_payload['rejected_bundle_count']} bundle(s) are present in the manifest but unusable for training."
        )
    if warning_counts:
        warnings.append("Some accepted bundles still carry timing or modality quality warnings.")

    summary["blockers"] = blockers
    summary["warnings"] = warnings
    if blockers:
        summary["status"] = "blocked"
    elif warnings:
        summary["status"] = "partial"
    else:
        summary["status"] = "ready"
    return summary


def _render_summary_markdown(summary: dict[str, Any]) -> str:
    manifest = summary["manifest"]
    holdout = summary["holdout"]
    lines = [
        "# Dataset readiness summary",
        "",
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
            "| Shot | Ready | Ready labels | Total labels |",
            "| --- | --- | ---: | ---: |",
        ]
    )
    for shot in summary.get("shots", []):
        lines.append(
            f"| {shot['shot']} | {'yes' if shot['ready'] else 'no'} | "
            f"{shot['ready_label_count']} | {shot['total_label_count']} |"
        )

    lines.extend(
        [
            "",
            "## Label gaps",
            "",
            "| Label | Accepted bundles | Accepted profiles | Ready shots | Missing next requirements |",
            "| --- | ---: | ---: | --- | --- |",
        ]
    )
    for label in summary.get("labels", []):
        next_gap = label.get("missing_by_shot", [])
        next_gap_text = ", ".join(
            [
                f"{gap['shot']}-shot: +{gap['missing_accepted_bundles']} bundles / +{gap['missing_profiles']} profiles"
                for gap in next_gap[:2]
            ]
        )
        ready_shots = ",".join(str(value) for value in label.get("ready_shots", [])) or "-"
        lines.append(
            f"| {label['label']} | {label['accepted_bundle_count']} | {label['accepted_profile_count']} | "
            f"{ready_shots} | {next_gap_text or '-'} |"
        )

    if summary.get("rejected_bundles"):
        lines.extend(["", "## Rejected bundles", ""])
        for bundle in summary["rejected_bundles"][:20]:
            issue_text = ", ".join(bundle.get("issue_codes", [])) or "unknown_issue"
            lines.append(f"- `{bundle['bundle_id']}` / `{bundle['label']}`: {issue_text}")

    return "\n".join(lines) + "\n"


def _write_outputs(output_dir: Path, summary: dict[str, Any]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "summary.json"
    markdown_path = output_dir / "summary.md"
    latest_json_path = output_dir / "latest.json"
    latest_markdown_path = output_dir / "latest.md"
    markdown = _render_summary_markdown(summary)
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(markdown, encoding="utf-8")
    latest_json_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    latest_markdown_path.write_text(markdown, encoding="utf-8")
    return {
        "summary_json": str(summary_path),
        "summary_markdown": str(markdown_path),
        "latest_json": str(latest_json_path),
        "latest_markdown": str(latest_markdown_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--shots", default="1,3,5,10")
    args = parser.parse_args()

    shots = _parse_int_list(args.shots)
    if not shots:
        parser.error("--shots must include at least one integer")

    summary = build_dataset_readiness_summary(
        manifest_path=args.manifest.resolve(),
        data_dir=args.data_dir.resolve(),
        shots=shots,
    )
    summary["artifact_paths"] = _write_outputs(args.output_dir.resolve(), summary)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
