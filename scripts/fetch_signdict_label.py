#!/usr/bin/env python3
"""Fetch DGS videos for a single label from signdict.org."""

import argparse
import os
import time
import urllib.parse

from scripts.dgs_common import (
    BASE_URL,
    download_video,
    ensure_dirs,
    fetch_custom_source_videos,
    fetch_fallback_videos,
    fetch_url,
    find_entry_url,
    find_variant_links,
    find_video_url_direct,
    load_manifest,
    save_manifest,
    upsert_manifest_entry,
    update_manifest_stats,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch signdict videos for one label")
    parser.add_argument("--label", required=True, help="Label ID (e.g. rot, kindergarten)")
    parser.add_argument(
        "--search-terms",
        default="",
        help="Comma-separated list of search terms to try (optional)",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.5,
        help="Sleep between variant requests to be polite",
    )
    return parser.parse_args()


def build_search_terms(label: str, search_terms: str) -> list[str]:
    if search_terms.strip():
        terms = [t.strip() for t in search_terms.split(",") if t.strip()]
        if terms:
            return terms
    return [label]


def find_existing_entry(manifest: dict, label: str) -> dict | None:
    for entry in manifest.get("gestures", []):
        if entry.get("id") == label or entry.get("label") == label:
            return entry
    return None


def ensure_manifest_shape(manifest: dict) -> dict:
    if "gestures" not in manifest or not isinstance(manifest.get("gestures"), list):
        manifest["gestures"] = []
    if "version" not in manifest:
        manifest["version"] = "3.0"
    if "description" not in manifest:
        manifest["description"] = "DGS video examples (auto-fetched)"
    return manifest


def main() -> None:
    args = parse_args()
    label = args.label.strip().lower()
    if not label:
        raise SystemExit("Label darf nicht leer sein.")

    ensure_dirs()
    manifest = ensure_manifest_shape(load_manifest())
    existing_entry = find_existing_entry(manifest, label)
    video_files: list[str] = []
    if existing_entry and isinstance(existing_entry.get("videos"), list):
        video_files = existing_entry["videos"]
    initial_count = len(video_files)

    skip_signdict = os.environ.get("AMY_DGS_SKIP_SIGNDICT", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if not skip_signdict:
        search_terms = build_search_terms(label, args.search_terms)

        for search_term in search_terms:
            print(f"\n=== Processing label: {label} (search: {search_term}) ===")
            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(search_term)}"
            search_html = fetch_url(search_url)
            if not search_html:
                continue

            entry_url = find_entry_url(search_html)
            if not entry_url:
                if find_video_url_direct(search_html):
                    print("  Search redirected directly to entry.")
                    entry_html = search_html
                else:
                    print(f"  No entry found for '{search_term}'")
                    continue
            else:
                print(f"  Found entry URL: {entry_url}")
                entry_html = fetch_url(entry_url)
                if not entry_html:
                    continue

            term_id = search_term.replace(" ", "_")
            main_vid_url = find_video_url_direct(entry_html)
            if main_vid_url:
                fname = download_video(label, main_vid_url, f"main_{term_id}")
                if fname and fname not in video_files:
                    video_files.append(fname)

            variant_links = find_variant_links(entry_html)
            print(f"  Found {len(variant_links)} variants.")

            for i, v_link in enumerate(variant_links):
                v_html = fetch_url(v_link)
                if v_html:
                    v_url = find_video_url_direct(v_html)
                    if v_url:
                        fname = download_video(label, v_url, f"var_{term_id}_{i}")
                        if fname and fname not in video_files:
                            video_files.append(fname)
                time.sleep(args.sleep_seconds)

            time.sleep(1)

    if len(video_files) > initial_count:
        upsert_manifest_entry(manifest, label, video_files)
        update_manifest_stats(manifest)
        save_manifest(manifest)
        print(f"Updated manifest for {label} with {len(video_files)} videos.")
    else:
        print("No new videos found from signdict; trying additional sources.")
        custom_files = fetch_custom_source_videos(label)
        for filename in custom_files:
            if filename not in video_files:
                video_files.append(filename)

        if len(video_files) <= initial_count:
            print("No new videos found from additional sources; trying fallback sources.")
            fallback_files = fetch_fallback_videos(label)
            for filename in fallback_files:
                if filename not in video_files:
                    video_files.append(filename)

        if len(video_files) > initial_count:
            upsert_manifest_entry(manifest, label, video_files)
            update_manifest_stats(manifest)
            save_manifest(manifest)
            print(f"Updated manifest for {label} with {len(video_files)} videos.")
        else:
            print("No new videos found; manifest unchanged.")


if __name__ == "__main__":
    main()
