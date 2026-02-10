#!/usr/bin/env python3
"""Fetch DGS videos from signdict.org."""

import time
import urllib.parse

from scripts.dgs_common import (
    BASE_URL,
    download_video,
    ensure_dirs,
    ensure_manifest_shape,
    fetch_url,
    find_entry_url,
    find_video_url_direct,
    load_manifest,
    save_manifest,
    update_manifest_stats,
    upsert_manifest_entry,
)

TARGET_LABELS = [
    "alle", "blau", "essen", "fertig", "gelb", "gruen", 
    "nochmal", "rot", "satt", "schwester", "spielen", "trinken"
]

def main():
    ensure_dirs()
    manifest = ensure_manifest_shape(load_manifest())
    updated = False
    
    for label in TARGET_LABELS:
        try:
            print(f"\nProcessing {label}...")
            
            # Check if already in manifest
            if any(item.get("label") == label or item.get("id") == label for item in manifest["gestures"]):
                print(f"  {label} already in manifest. Skipping.")
                continue

            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(label)}"
            search_html = fetch_url(search_url)
            
            entry_url = find_entry_url(search_html)
            if not entry_url:
                # Check if search redirected directly
                video_url = find_video_url_direct(search_html)
                if not video_url:
                    print(f"  No entry found for {label}")
                    continue
            else:
                entry_html = fetch_url(entry_url)
                video_url = find_video_url_direct(entry_html)
            
            if not video_url:
                print(f"  No video URL found for {label}")
                continue
                
            filename = download_video(label, video_url)
            if filename:
                upsert_manifest_entry(manifest, label, [filename])
                updated = True
            
            time.sleep(1) # Be nice to the server
            
        except Exception as e:
            print(f"Error processing {label}: {e}")

    if updated:
        update_manifest_stats(manifest)
        save_manifest(manifest)
    else:
        print("\nNo manifest updates needed.")

if __name__ == "__main__":
    main()
