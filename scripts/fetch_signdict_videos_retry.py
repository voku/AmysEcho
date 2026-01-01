#!/usr/bin/env python3
"""Retry fetching specific DGS videos from signdict.org with better search terms."""

import time
import urllib.parse

from scripts.dgs_common import (
    BASE_URL,
    download_video,
    ensure_dirs,
    fetch_url,
    find_entry_url,
    find_video_url_direct,
    load_manifest,
    save_manifest,
)

TARGET_LABELS = {
    "fertig": "fertig",
    "gruen": "grün",
    "nochmal": "noch mal",
    "trinken": "trinken"
}

def main():
    ensure_dirs()
    manifest = load_manifest()
    updated = False
    
    for label_key, search_term in TARGET_LABELS.items():
        try:
            print(f"\nProcessing {label_key} (search: {search_term})...")
            
            # Check if already in manifest
            if any(item["label"] == label_key for item in manifest["gestures"]):
                print(f"  {label_key} already in manifest. Skipping.")
                continue

            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(search_term)}"
            html = fetch_url(search_url)
            
            # Check if we are directly on the video page
            video_url = find_video_url_direct(html)
            
            if not video_url:
                # If not, check for entry link
                entry_url = find_entry_url(html)
                if entry_url:
                    print(f"  Found entry URL: {entry_url}")
                    entry_html = fetch_url(entry_url)
                    video_url = find_video_url_direct(entry_html)
            
            if not video_url:
                print(f"  No video URL found for {label_key}")
                continue
                
            if download_video(label_key, video_url):
                manifest["gestures"].append({"label": label_key, "video": f"{label_key}.mp4"})
                updated = True
            
            time.sleep(1)
            
        except Exception as e:
            print(f"Error processing {label_key}: {e}")

    if updated:
        save_manifest(manifest)
    else:
        print("\nNo manifest updates needed.")

if __name__ == "__main__":
    main()
