"""Shared manifest parser/validator for script-trained and API-trained artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

HAND_FOCUS_VALUES = {
    "dominant_only",
    "both_equal",
    "both_asymmetric",
    "either_hand",
}

ALLOWED_ENTRY_KEYS = {
    "id",
    "profileId",
    "label",
    "symbolId",
    "capturedAt",
    "source",
    "storage",
    "receivedAt",
    "metadata",
}
ALLOWED_STORAGE_KEYS = {"directory", "bundle", "files", "clip", "still"}
ALLOWED_MANIFEST_KEYS = {"version", "generatedAt", "jobId", "entries"}
ALLOWED_METADATA_KEYS = {
    "label",
    "profileId",
    "symbolId",
    "source",
    "capturedAt",
    "clipFilename",
    "stillFilename",
    "modalities",
    "smoothing",
    "handedness",
    "validationSummary",
    "handFocus",
    "augmentation",
    "variationData",
    "recording",
    "featureContract",
}


def _require_dict(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def _reject_unknown_keys(obj: dict[str, Any], allowed: set[str], name: str) -> None:
    unknown = sorted(set(obj.keys()) - allowed)
    if unknown:
        raise ValueError(f"{name} has unknown keys: {unknown}")


def _require_non_empty_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _require_nullable_string(value: Any, name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string or null")
    return value


def _parse_storage(raw: Any) -> dict[str, Any]:
    storage = _require_dict(raw, "entry.storage")
    _reject_unknown_keys(storage, ALLOWED_STORAGE_KEYS, "entry.storage")

    directory = _require_non_empty_string(storage.get("directory"), "entry.storage.directory")
    files = storage.get("files")
    if not isinstance(files, list):
        raise ValueError("entry.storage.files must be an array")

    normalized_files = [_require_non_empty_string(item, "entry.storage.files[]") for item in files]

    parsed: dict[str, Any] = {"directory": directory, "files": normalized_files}
    for optional_key in ("bundle", "clip", "still"):
        if optional_key in storage:
            parsed[optional_key] = _require_non_empty_string(storage[optional_key], f"entry.storage.{optional_key}")
    return parsed


def _parse_metadata(raw: Any) -> dict[str, Any]:
    metadata = _require_dict(raw, "entry.metadata")
    _reject_unknown_keys(metadata, ALLOWED_METADATA_KEYS, "entry.metadata")

    parsed: dict[str, Any] = {}
    for key in ("profileId", "source", "capturedAt"):
        if key in metadata:
            parsed[key] = _require_nullable_string(metadata[key], f"entry.metadata.{key}")

    for key in ("label", "symbolId", "clipFilename", "stillFilename"):
        if key in metadata:
            parsed[key] = _require_non_empty_string(metadata[key], f"entry.metadata.{key}")

    if "handFocus" in metadata:
        hand_focus = _require_non_empty_string(metadata["handFocus"], "entry.metadata.handFocus")
        if hand_focus not in HAND_FOCUS_VALUES:
            raise ValueError(f"entry.metadata.handFocus must be one of {sorted(HAND_FOCUS_VALUES)}")
        parsed["handFocus"] = hand_focus

    if "augmentation" in metadata:
        augmentation = _require_dict(metadata["augmentation"], "entry.metadata.augmentation")
        _reject_unknown_keys(augmentation, {"mirrorSafe"}, "entry.metadata.augmentation")
        if "mirrorSafe" in augmentation and not isinstance(augmentation["mirrorSafe"], bool):
            raise ValueError("entry.metadata.augmentation.mirrorSafe must be a boolean")
        parsed["augmentation"] = augmentation


    for object_key in ("modalities", "smoothing", "handedness", "validationSummary", "variationData", "recording"):
        if object_key in metadata:
            parsed[object_key] = _require_dict(metadata[object_key], f"entry.metadata.{object_key}")

    if "featureContract" in metadata:
        contract = _require_dict(metadata["featureContract"], "entry.metadata.featureContract")
        _reject_unknown_keys(contract, {"version"}, "entry.metadata.featureContract")
        if "version" in contract and not isinstance(contract["version"], str):
            raise ValueError("entry.metadata.featureContract.version must be a string")
        parsed["featureContract"] = contract

    return parsed


def parse_training_manifest_entry(raw: Any) -> dict[str, Any]:
    entry = _require_dict(raw, "entry")
    _reject_unknown_keys(entry, ALLOWED_ENTRY_KEYS, "entry")

    parsed: dict[str, Any] = {
        "label": _require_non_empty_string(entry.get("label"), "entry.label"),
        "storage": _parse_storage(entry.get("storage")),
    }

    for key in ("id", "symbolId", "receivedAt"):
        if key in entry:
            parsed[key] = _require_non_empty_string(entry[key], f"entry.{key}")

    for key in ("profileId", "capturedAt", "source"):
        if key in entry:
            parsed[key] = _require_nullable_string(entry[key], f"entry.{key}")

    if "metadata" in entry:
        parsed["metadata"] = _parse_metadata(entry["metadata"])

    return parsed


def parse_training_manifest(raw: Any) -> dict[str, Any]:
    manifest = _require_dict(raw, "manifest")
    _reject_unknown_keys(manifest, ALLOWED_MANIFEST_KEYS, "manifest")

    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise ValueError("manifest.entries must be an array")

    parsed_entries = [parse_training_manifest_entry(entry) for entry in entries]
    parsed: dict[str, Any] = {"entries": parsed_entries}

    for key in ("version", "generatedAt", "jobId"):
        if key in manifest:
            parsed[key] = _require_non_empty_string(manifest[key], f"manifest.{key}")

    return parsed


def load_training_manifest(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return parse_training_manifest(json.load(handle))


def save_training_manifest(path: str | Path, manifest: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_training_manifest(manifest)
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(parsed, handle, indent=2)
        handle.write("\n")
    return parsed
