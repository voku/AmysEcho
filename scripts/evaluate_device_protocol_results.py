#!/usr/bin/env python3
"""Evaluate Amy's Echo device protocol result artifacts and emit gate summaries."""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any

THERMAL_ORDER = {
    "cool": 0,
    "warm": 1,
    "hot": 2,
    "throttled": 3,
}

TIER_THRESHOLDS: dict[str, dict[str, float | str]] = {
    "P0": {
        "cold_start_total_ms_max": 5000.0,
        "warm_restart_total_ms_max": 2000.0,
        "camera_flip_total_ms_max": 2000.0,
        "fps_p50_min": 15.0,
        "fps_p95_min": 8.0,
        "drop_rate_pct_max": 15.0,
        "memory_growth_mb_max": 50.0,
        "battery_drain_pct_max": 10.0,
        "thermal_state_max": "warm",
    },
    "P1": {
        "cold_start_total_ms_max": 3000.0,
        "warm_restart_total_ms_max": 1000.0,
        "camera_flip_total_ms_max": 1000.0,
        "fps_p50_min": 25.0,
        "fps_p95_min": 15.0,
        "drop_rate_pct_max": 5.0,
        "memory_growth_mb_max": 30.0,
        "battery_drain_pct_max": 8.0,
        "thermal_state_max": "cool",
    },
    "P2": {
        "cold_start_total_ms_max": 3000.0,
        "warm_restart_total_ms_max": 1000.0,
        "camera_flip_total_ms_max": 1000.0,
        "fps_p50_min": 25.0,
        "fps_p95_min": 15.0,
        "drop_rate_pct_max": 5.0,
        "memory_growth_mb_max": 30.0,
        "battery_drain_pct_max": 8.0,
        "thermal_state_max": "cool",
    },
}


@dataclass
class DeviceInfo:
    device: str
    tier: str


def _parse_markdown_table_row(raw: str) -> list[str]:
    return [cell.strip() for cell in raw.strip().strip("|").split("|")]


def parse_device_matrix(device_matrix_path: Path) -> list[DeviceInfo]:
    lines = device_matrix_path.read_text(encoding="utf-8").splitlines()
    devices: list[DeviceInfo] = []
    for raw in lines:
        if not raw.strip().startswith("|"):
            continue
        cells = _parse_markdown_table_row(raw)
        if len(cells) < 2:
            continue
        if cells[0].lower() == "device" or set(cells[0]) == {"-"}:
            continue
        tier = cells[1].upper()
        if tier not in {"P0", "P1", "P2"}:
            continue
        devices.append(DeviceInfo(device=cells[0], tier=tier))
    if not devices:
        raise ValueError(f"No device rows parsed from {device_matrix_path}")
    return devices


def _parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    if math.isnan(parsed):
        return None
    return parsed


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _group_step_totals(rows: list[dict[str, str]]) -> dict[str, list[float]]:
    grouped: dict[tuple[str, str], float] = {}
    for row in rows:
        device = row.get("device", "").strip()
        run = row.get("run", "").strip()
        duration = _parse_float(row.get("duration_ms"))
        if not device or not run or duration is None:
            continue
        grouped[(device, run)] = grouped.get((device, run), 0.0) + duration

    totals: dict[str, list[float]] = {}
    for (device, _run), total in grouped.items():
        totals.setdefault(device, []).append(total)
    return totals


def _group_camera_flip(rows: list[dict[str, str]]) -> dict[str, dict[str, float]]:
    grouped: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        device = row.get("device", "").strip()
        if not device:
            continue
        flip_total = _parse_float(row.get("flip_total_ms"))
        if flip_total is None:
            step_duration = _parse_float(row.get("duration_ms"))
            if step_duration is not None:
                run = row.get("run", "").strip()
                key = f"{device}::{run}"
                grouped.setdefault(key, {"flip_total_ms": [], "dropped_frame_pct": []})
                grouped[key]["flip_total_ms"].append(step_duration)
                drop_pct = _parse_float(row.get("dropped_frame_pct"))
                if drop_pct is not None:
                    grouped[key]["dropped_frame_pct"].append(drop_pct)
                continue
            continue
        run = row.get("run", "").strip() or "aggregate"
        key = f"{device}::{run}"
        grouped.setdefault(key, {"flip_total_ms": [], "dropped_frame_pct": []})
        grouped[key]["flip_total_ms"].append(flip_total)
        drop_pct = _parse_float(row.get("dropped_frame_pct"))
        if drop_pct is not None:
            grouped[key]["dropped_frame_pct"].append(drop_pct)

    device_runs: dict[str, dict[str, list[float]]] = {}
    for key, values in grouped.items():
        device, _run = key.split("::", 1)
        device_runs.setdefault(device, {"flip_total_ms": [], "dropped_frame_pct": []})
        if values["flip_total_ms"]:
            device_runs[device]["flip_total_ms"].append(sum(values["flip_total_ms"]))
        if values["dropped_frame_pct"]:
            device_runs[device]["dropped_frame_pct"].append(values["dropped_frame_pct"][-1])

    output: dict[str, dict[str, float]] = {}
    for device, values in device_runs.items():
        output[device] = {
            "flip_total_ms": median(values["flip_total_ms"]) if values["flip_total_ms"] else math.nan,
            "dropped_frame_pct": median(values["dropped_frame_pct"]) if values["dropped_frame_pct"] else math.nan,
        }
    return output


def _read_sustained_summary(
    rows: list[dict[str, str]],
    gate_mode: str,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, dict[str, Any]]]]:
    selected: dict[str, dict[str, Any]] = {}
    by_device_mode: dict[str, dict[str, dict[str, Any]]] = {}
    for row in rows:
        device = row.get("device", "").strip()
        if not device:
            continue
        mode = row.get("mode", "").strip() or "default"
        normalized = {
            "device": device,
            "mode": mode,
            "fps_p50": _parse_float(row.get("fps_p50")),
            "fps_p95": _parse_float(row.get("fps_p95")),
            "drop_rate_pct": _parse_float(row.get("drop_rate_pct")),
            "frame_latency_p50_ms": _parse_float(row.get("frame_latency_p50_ms")),
            "frame_latency_p95_ms": _parse_float(row.get("frame_latency_p95_ms")),
            "memory_growth_mb": _parse_float(row.get("memory_growth_mb")),
            "battery_drain_pct": _parse_float(row.get("battery_drain_pct")),
            "thermal_state_20min": (row.get("thermal_state_20min") or "").strip().lower() or None,
        }
        by_device_mode.setdefault(device, {})[mode] = normalized

    for device, modes in by_device_mode.items():
        if gate_mode in modes:
            selected[device] = modes[gate_mode]
        elif len(modes) == 1:
            selected[device] = next(iter(modes.values()))
    return selected, by_device_mode


def _pass_lower_or_equal(actual: float | None, expected_max: float) -> bool:
    return actual is not None and actual <= expected_max


def _pass_greater_or_equal(actual: float | None, expected_min: float) -> bool:
    return actual is not None and actual >= expected_min


def _pass_thermal(actual: str | None, expected_max: str) -> bool:
    if actual is None:
        return False
    actual_rank = THERMAL_ORDER.get(actual.lower())
    expected_rank = THERMAL_ORDER.get(expected_max.lower())
    if actual_rank is None or expected_rank is None:
        return False
    return actual_rank <= expected_rank


def evaluate_result_dir(
    result_dir: Path,
    *,
    gate_mode: str = "main_thread",
    remediation_owner: str = "Performance owner (unassigned)",
    remediation_target_date: str = "TBD",
) -> dict[str, Any]:
    device_infos = parse_device_matrix(result_dir / "device_matrix.md")
    cold_totals = _group_step_totals(_read_csv_rows(result_dir / "cold_start_results.csv"))
    warm_totals = _group_step_totals(_read_csv_rows(result_dir / "warm_restart_results.csv"))
    camera = _group_camera_flip(_read_csv_rows(result_dir / "camera_flip_results.csv"))
    sustained_selected, sustained_by_device_mode = _read_sustained_summary(
        _read_csv_rows(result_dir / "sustained_session_summary.csv"),
        gate_mode=gate_mode,
    )

    devices_output: list[dict[str, Any]] = []
    failed_actions: list[dict[str, str]] = []

    for info in device_infos:
        thresholds = TIER_THRESHOLDS[info.tier]
        cold_total = median(cold_totals.get(info.device, [])) if cold_totals.get(info.device) else None
        warm_total = median(warm_totals.get(info.device, [])) if warm_totals.get(info.device) else None
        camera_metrics = camera.get(info.device, {})
        sustained = sustained_selected.get(info.device, {})

        g1 = _pass_lower_or_equal(cold_total, float(thresholds["cold_start_total_ms_max"])) and _pass_lower_or_equal(
            warm_total, float(thresholds["warm_restart_total_ms_max"])
        )
        g2 = _pass_greater_or_equal(sustained.get("fps_p50"), float(thresholds["fps_p50_min"])) and _pass_greater_or_equal(
            sustained.get("fps_p95"), float(thresholds["fps_p95_min"])
        ) and _pass_lower_or_equal(sustained.get("drop_rate_pct"), float(thresholds["drop_rate_pct_max"]))
        g3 = _pass_lower_or_equal(
            sustained.get("memory_growth_mb"),
            float(thresholds["memory_growth_mb_max"]),
        ) and _pass_thermal(
            sustained.get("thermal_state_20min"),
            str(thresholds["thermal_state_max"]),
        ) and _pass_lower_or_equal(
            sustained.get("battery_drain_pct"),
            float(thresholds["battery_drain_pct_max"]),
        )
        g4 = _pass_lower_or_equal(
            camera_metrics.get("flip_total_ms"),
            float(thresholds["camera_flip_total_ms_max"]),
        ) and _pass_lower_or_equal(
            camera_metrics.get("dropped_frame_pct"),
            float(thresholds["drop_rate_pct_max"]),
        )

        verdicts = {
            "G1": "Pass" if g1 else "Fail",
            "G2": "Pass" if g2 else "Fail",
            "G3": "Pass" if g3 else "Fail",
            "G4": "Pass" if g4 else "Fail",
        }

        if info.tier in {"P0", "P1"}:
            for gate, verdict in verdicts.items():
                if verdict == "Fail":
                    failed_actions.append(
                        {
                            "action": f"Remediate {gate} for {info.device} ({info.tier}) using gate_mode={gate_mode}",
                            "owner": remediation_owner,
                            "target_date": remediation_target_date,
                        }
                    )

        devices_output.append(
            {
                "device": info.device,
                "tier": info.tier,
                "metrics": {
                    "cold_start_total_ms_median": cold_total,
                    "warm_restart_total_ms_median": warm_total,
                    "camera_flip_total_ms_median": camera_metrics.get("flip_total_ms"),
                    "camera_flip_dropped_frame_pct_median": camera_metrics.get("dropped_frame_pct"),
                    "gate_mode": sustained.get("mode"),
                    "fps_p50": sustained.get("fps_p50"),
                    "fps_p95": sustained.get("fps_p95"),
                    "drop_rate_pct": sustained.get("drop_rate_pct"),
                    "frame_latency_p50_ms": sustained.get("frame_latency_p50_ms"),
                    "frame_latency_p95_ms": sustained.get("frame_latency_p95_ms"),
                    "memory_growth_mb": sustained.get("memory_growth_mb"),
                    "battery_drain_pct": sustained.get("battery_drain_pct"),
                    "thermal_state_20min": sustained.get("thermal_state_20min"),
                },
                "gates": verdicts,
                "comparison_modes": sustained_by_device_mode.get(info.device, {}),
            }
        )

    p0_fail = any(
        any(device["gates"][gate] == "Fail" for gate in ("G1", "G2", "G3", "G4"))
        for device in devices_output
        if device["tier"] == "P0"
    )
    p1_fail = any(
        any(device["gates"][gate] == "Fail" for gate in ("G1", "G2", "G3", "G4"))
        for device in devices_output
        if device["tier"] == "P1"
    )

    if p0_fail:
        fleet_verdict = "NO-GO"
        rationale = "At least one required P0 gate failed."
    elif p1_fail:
        fleet_verdict = "CONDITIONAL GO"
        rationale = "All P0 devices passed, but at least one P1 gate failed."
    else:
        fleet_verdict = "GO"
        rationale = "All required P0 devices passed and no P1 device failed."

    return {
        "result_dir": str(result_dir),
        "gate_mode": gate_mode,
        "devices": devices_output,
        "fleet_verdict": fleet_verdict,
        "rationale": rationale,
        "remediation_actions": failed_actions,
    }


def render_summary_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Device performance protocol summary",
        "",
        f"- Result directory: `{summary['result_dir']}`",
        f"- Gate mode: `{summary['gate_mode']}`",
        f"- Fleet verdict: **{summary['fleet_verdict']}**",
        f"- Rationale: {summary['rationale']}",
        "",
        "## Per-device metrics and gate verdicts",
        "",
        "| Device | Tier | Mode | Cold start | Warm restart | Camera flip | Drop % | FPS p50 | FPS p95 | Memory growth | Battery drain | Thermal | G1 | G2 | G3 | G4 |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ]
    for device in summary["devices"]:
        metrics = device["metrics"]
        lines.append(
            "| "
            f"{device['device']} | "
            f"{device['tier']} | "
            f"{metrics.get('gate_mode') or '-'} | "
            f"{metrics.get('cold_start_total_ms_median') if metrics.get('cold_start_total_ms_median') is not None else '-'} | "
            f"{metrics.get('warm_restart_total_ms_median') if metrics.get('warm_restart_total_ms_median') is not None else '-'} | "
            f"{metrics.get('camera_flip_total_ms_median') if metrics.get('camera_flip_total_ms_median') is not None else '-'} | "
            f"{metrics.get('drop_rate_pct') if metrics.get('drop_rate_pct') is not None else '-'} | "
            f"{metrics.get('fps_p50') if metrics.get('fps_p50') is not None else '-'} | "
            f"{metrics.get('fps_p95') if metrics.get('fps_p95') is not None else '-'} | "
            f"{metrics.get('memory_growth_mb') if metrics.get('memory_growth_mb') is not None else '-'} | "
            f"{metrics.get('battery_drain_pct') if metrics.get('battery_drain_pct') is not None else '-'} | "
            f"{metrics.get('thermal_state_20min') or '-'} | "
            f"{device['gates']['G1']} | {device['gates']['G2']} | {device['gates']['G3']} | {device['gates']['G4']} |"
        )

    comparison_devices = [
        device for device in summary["devices"] if len(device.get("comparison_modes", {})) > 1
    ]
    if comparison_devices:
        lines.extend(["", "## Optional mode comparison", ""])
        for device in comparison_devices:
            lines.append(f"### {device['device']}")
            lines.append("")
            lines.append("| Mode | FPS p50 | FPS p95 | Drop % | Memory growth | Battery drain | Thermal |")
            lines.append("| --- | ---: | ---: | ---: | ---: | ---: | --- |")
            for mode, metrics in sorted(device["comparison_modes"].items()):
                lines.append(
                    f"| {mode} | "
                    f"{metrics.get('fps_p50') if metrics.get('fps_p50') is not None else '-'} | "
                    f"{metrics.get('fps_p95') if metrics.get('fps_p95') is not None else '-'} | "
                    f"{metrics.get('drop_rate_pct') if metrics.get('drop_rate_pct') is not None else '-'} | "
                    f"{metrics.get('memory_growth_mb') if metrics.get('memory_growth_mb') is not None else '-'} | "
                    f"{metrics.get('battery_drain_pct') if metrics.get('battery_drain_pct') is not None else '-'} | "
                    f"{metrics.get('thermal_state_20min') or '-'} |"
                )
            lines.append("")

    return "\n".join(lines) + "\n"


def render_gate_interpretation_markdown(summary: dict[str, Any], result_date: str) -> str:
    lines = [
        f"# APR-P0-4 Gate Interpretation Snapshot — {result_date}",
        "",
        "## Purpose",
        "Provide an interpreted APR-P0-4 gate verdict using the canonical G1-G4 mapping from `docs/testing/benchmarks/device-performance-protocol.md`.",
        "",
        "## Input evidence used",
        f"- `{summary['result_dir']}/device_matrix.md`",
        f"- `{summary['result_dir']}/cold_start_results.csv`",
        f"- `{summary['result_dir']}/warm_restart_results.csv`",
        f"- `{summary['result_dir']}/camera_flip_results.csv`",
        f"- `{summary['result_dir']}/sustained_session_summary.csv`",
        "",
        "## Per-device gate verdicts",
        "",
        "| Device | Tier | G1 Startup | G2 Real-time loop | G3 Long-session stability | G4 Camera transition | Verdict basis |",
        "|--------|------|------------|-------------------|---------------------------|----------------------|---------------|",
    ]
    for device in summary["devices"]:
        failing = [gate for gate, verdict in device["gates"].items() if verdict == "Fail"]
        basis = (
            f"Failures: {', '.join(failing)}"
            if failing
            else f"All required thresholds passed in mode={device['metrics'].get('gate_mode') or '-'}"
        )
        lines.append(
            f"| {device['device']} | {device['tier']} | {device['gates']['G1']} | {device['gates']['G2']} | {device['gates']['G3']} | {device['gates']['G4']} | {basis} |"
        )

    lines.extend(
        [
            "",
            "## Fleet verdict",
            f"- **{summary['fleet_verdict']}**",
            f"- **Rationale:** {summary['rationale']}",
            "",
            "## Remediation ownership",
            "| Action | Owner | Target date |",
            "|--------|-------|-------------|",
        ]
    )
    if summary["remediation_actions"]:
        for action in summary["remediation_actions"]:
            lines.append(
                f"| {action['action']} | {action['owner']} | {action['target_date']} |"
            )
    else:
        lines.append("| No remediation required | - | - |")

    return "\n".join(lines) + "\n"


def write_outputs(result_dir: Path, summary: dict[str, Any]) -> None:
    result_date = result_dir.name
    (result_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    (result_dir / "summary.md").write_text(
        render_summary_markdown(summary),
        encoding="utf-8",
    )
    (result_dir / "apr-p0-4-gate-interpretation.md").write_text(
        render_gate_interpretation_markdown(summary, result_date=result_date),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result-dir", type=Path, required=True)
    parser.add_argument("--gate-mode", default="main_thread")
    parser.add_argument(
        "--remediation-owner",
        default="Performance owner (unassigned)",
    )
    parser.add_argument("--remediation-target-date", default="TBD")
    args = parser.parse_args()

    summary = evaluate_result_dir(
        args.result_dir,
        gate_mode=args.gate_mode,
        remediation_owner=args.remediation_owner,
        remediation_target_date=args.remediation_target_date,
    )
    write_outputs(args.result_dir, summary)
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
