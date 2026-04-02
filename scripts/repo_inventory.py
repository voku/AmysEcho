#!/usr/bin/env python3
"""Generate a tracked-file inventory and cleanup planning baseline for Amy's Echo."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]


def run_git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO_ROOT, text=True)


def get_tracked_files() -> list[str]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=REPO_ROOT)
    return [part.decode("utf-8") for part in output.split(b"\0") if part]


def normalize_extension(path: str) -> str:
    name = Path(path).name
    if name.startswith(".") and name.count(".") == 1:
        return name.lower()
    suffix = Path(path).suffix.lower()
    return suffix if suffix else "[no_ext]"


def top_level(path: str) -> str:
    return path.split("/", 1)[0]


def size_bucket(size_bytes: int) -> str:
    if size_bytes < 10 * 1024:
        return "<10KB"
    if size_bytes < 100 * 1024:
        return "10KB-100KB"
    if size_bytes < 1024 * 1024:
        return "100KB-1MB"
    if size_bytes < 10 * 1024 * 1024:
        return "1MB-10MB"
    return ">10MB"


def age_bucket(last_commit: dt.datetime, now: dt.datetime) -> str:
    age_days = (now - last_commit).days
    if age_days <= 30:
        return "0-30d"
    if age_days <= 90:
        return "31-90d"
    if age_days <= 180:
        return "91-180d"
    if age_days <= 365:
        return "181-365d"
    return ">365d"


def collect_last_touch_timestamps() -> dict[str, int]:
    out = subprocess.check_output(
        [
            "git",
            "-c",
            "core.quotePath=false",
            "log",
            "--name-only",
            "-z",
            "--pretty=format:COMMIT %ct%x00",
        ],
        cwd=REPO_ROOT,
    )
    current_ts: int | None = None
    first_seen: dict[str, int] = {}

    for raw_token in out.split(b"\0"):
        if not raw_token:
            continue
        token = raw_token.decode("utf-8", errors="replace")
        if token.startswith("COMMIT "):
            current_ts = int(token.split()[1])
            continue
        if current_ts is not None and token not in first_seen:
            first_seen[token] = current_ts
    return first_seen


def to_table(counter: Counter[str], limit: int = 20) -> list[dict[str, Any]]:
    return [{"key": key, "count": count} for key, count in counter.most_common(limit)]


def generate_report(output_json: Path, output_md: Path, include_files: bool = False) -> None:
    files = get_tracked_files()
    now = dt.datetime.now(dt.timezone.utc)
    last_touch_map = collect_last_touch_timestamps()

    ext_counter: Counter[str] = Counter()
    top_level_counter: Counter[str] = Counter()
    size_counter: Counter[str] = Counter()
    age_counter: Counter[str] = Counter()

    file_rows: list[dict[str, Any]] = []
    suspicious_names: list[str] = []
    large_files: list[tuple[int, str]] = []

    for file_path in files:
        abs_path = REPO_ROOT / file_path
        try:
            size = abs_path.stat().st_size
        except FileNotFoundError:
            continue
        ext = normalize_extension(file_path)
        top = top_level(file_path)

        ext_counter[ext] += 1
        top_level_counter[top] += 1
        size_counter[size_bucket(size)] += 1

        ts = last_touch_map.get(file_path)
        if ts is not None:
            last_touch = dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc)
            age_group = age_bucket(last_touch, now)
            age_counter[age_group] += 1
            last_touch_iso = last_touch.date().isoformat()
        else:
            last_touch_iso = None
            age_counter["unknown"] += 1

        if any(char in file_path for char in ['"', "'", " "]):
            suspicious_names.append(file_path)

        if size >= 10 * 1024 * 1024:
            large_files.append((size, file_path))

        file_rows.append(
            {
                "path": file_path,
                "top_level": top,
                "extension": ext,
                "size_bytes": size,
                "last_commit_date": last_touch_iso,
            }
        )

    total_size = sum(row["size_bytes"] for row in file_rows)

    root_notes = {
        "webapp": "Frontend React + TypeScript communication UI",
        "server": "API + ML/training services and datasets",
        "integration": "End-to-end/integration tests",
        "docs": "Architecture, planning, operations, and runbooks",
        "scripts": "Automation and validation helpers",
        "data": "Shared baseline model/data assets",
        "deployment": "Deployment and environment configs",
        "spec": "Design/protocol specs",
        ".github": "CI and automation workflows",
        "skills": "Codex skill definitions",
    }

    cleanup_candidates = {
        "tracked_large_artifacts": [
            {"path": path, "size_bytes": size}
            for size, path in sorted(large_files, reverse=True)[:30]
        ],
        "suspicious_filenames": sorted(suspicious_names),
        "likely_generated_or_backup": [
            row["path"]
            for row in file_rows
            if row["path"].startswith("server/data/backups/")
            or row["path"].startswith("server/data/dgs_video_examples/")
            or row["path"].endswith(".zip")
        ][:200],
    }

    payload: dict[str, Any] = {
        "generated_at_utc": now.isoformat(),
        "tracked_file_count": len(file_rows),
        "tracked_total_size_bytes": total_size,
        "tracked_total_size_mb": round(total_size / (1024 * 1024), 2),
        "summary": {
            "by_extension": to_table(ext_counter, 30),
            "by_top_level": to_table(top_level_counter, 30),
            "by_size_bucket": to_table(size_counter, 10),
            "by_age_bucket": to_table(age_counter, 10),
        },
        "root_notes": root_notes,
        "cleanup_candidates": cleanup_candidates,
    }
    if include_files:
        payload["files"] = file_rows

    output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    md_lines = [
        "# Repository Inventory Baseline",
        "",
        f"Generated: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "",
        f"Tracked files: **{len(file_rows)}**",
        f"Tracked size: **{payload['tracked_total_size_mb']} MB**",
        "",
        "## Top-level fit map",
        "",
        "| Root | Role | Files |",
        "|---|---|---:|",
    ]

    for row in payload["summary"]["by_top_level"]:
        root = row["key"]
        md_lines.append(
            f"| `{root}` | {root_notes.get(root, 'Unclassified / utility')} | {row['count']} |"
        )

    try:
        output_json_display = output_json.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        output_json_display = output_json.as_posix()

    md_lines.extend(
        [
            "",
            "## File grouping snapshot",
            "",
            "### By extension (top 15)",
            "",
            "| Extension | Count |",
            "|---|---:|",
        ]
    )

    for row in payload["summary"]["by_extension"][:15]:
        md_lines.append(f"| `{row['key']}` | {row['count']} |")

    md_lines.extend(
        [
            "",
            "### By size bucket",
            "",
            "| Size bucket | Count |",
            "|---|---:|",
        ]
    )

    for row in payload["summary"]["by_size_bucket"]:
        md_lines.append(f"| {row['key']} | {row['count']} |")

    md_lines.extend(
        [
            "",
            "### By last commit age",
            "",
            "| Age | Count |",
            "|---|---:|",
        ]
    )

    for row in payload["summary"]["by_age_bucket"]:
        md_lines.append(f"| {row['key']} | {row['count']} |")

    md_lines.extend(
        [
            "",
            "## Cleanup-first candidates",
            "",
            "### Large tracked artifacts (top 20)",
            "",
            "| File | Size (MB) |",
            "|---|---:|",
        ]
    )

    for size, path in sorted(large_files, reverse=True)[:20]:
        md_lines.append(f"| `{path}` | {size / (1024 * 1024):.2f} |")

    md_lines.extend(["", "### Suspicious file names", ""])

    if suspicious_names:
        for name in sorted(suspicious_names):
            md_lines.append(f"- `{name}`")
    else:
        md_lines.append("- None")

    md_lines.extend(
        [
            "",
            "## Suggested cleanup phases",
            "",
            "1. **History-safe artifact cleanup**: remove tracked generated/backups with `git rm --cached`, then enforce `.gitignore` patterns for equivalent paths.",
            "2. **Naming normalization**: rename suspicious/quoted files to canonical lowercase snake-case filenames and update references.",
            "3. **Test and mock colocation**: move ad-hoc fixtures from runtime data folders into `server/test/fixtures` or `integration/fixtures` where possible.",
            "4. **Docs split/merge pass**: split oversized docs into index + focused sub-docs and archive stale docs under `docs/archive`.",
            "5. **Automation**: re-run this inventory in CI and fail if tracked artifact budget is exceeded.",
            "",
            "## Machine-readable data",
            "",
            f"See `{output_json_display}` for aggregated metadata.",
            "",
        ]
    )

    output_md.write_text("\n".join(md_lines), encoding="utf-8")


def main() -> None:
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--json",
        default=f"docs/analysis/repo-inventory-{today}.summary.json",
        help="Path for machine-readable output",
    )
    parser.add_argument(
        "--md",
        default=f"docs/analysis/repo-inventory-{today}.md",
        help="Path for markdown summary",
    )
    parser.add_argument(
        "--include-files",
        action="store_true",
        help="Include per-file metadata list in JSON output (large artifact; use only for local analysis)",
    )
    args = parser.parse_args()

    output_json = REPO_ROOT / args.json
    output_md = REPO_ROOT / args.md
    if args.include_files and not output_json.name.endswith(".full.json"):
        raise SystemExit(
            "When using --include-files, --json must end with '.full.json' to avoid committing large artifacts."
        )
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    generate_report(output_json=output_json, output_md=output_md, include_files=args.include_files)


if __name__ == "__main__":
    main()
