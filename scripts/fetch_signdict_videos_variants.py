#!/usr/bin/env python3
"""Fetch DGS videos and their variants from signdict.org."""

import time
import urllib.parse

from scripts.dgs_common import (
    BASE_URL,
    download_video,
    ensure_dirs,
    fetch_url,
    find_entry_url,
    find_variant_links,
    find_video_url_direct,
    load_manifest,
    save_manifest,
)

# Refined search terms to remove linguistic noise
TARGET_LABELS = {
    "alle": ["alle", "alles", "jeder"],
    "blau": ["blau"],
    "essen": ["essen", "mahlzeit", "frühstück", "mittagessen", "abendessen", "hunger"],
    "fertig": ["fertig", "beendet", "schluss", "ende", "vorbei"],
    "gelb": ["gelb"],
    "gruen": ["grün"],
    "nochmal": ["nochmal", "wiederholen", "noch mal", "erneut"],
    "rot": ["rot", "rosa", "pink"],
    "satt": ["satt", "genug", "voll"],
    "schwester": ["schwester", "geschwister"],
    "spielen": ["spielen", "spiel", "spielplatz", "spielzeug"],
    "trinken": ["trinken", "getränk", "durst", "wasser", "milch", "saft", "tee", "kaffee"]
}

def main():
    ensure_dirs()
    manifest = load_manifest()
    updated = False
    
    for label, search_terms in TARGET_LABELS.items():
        print(f"\n=== Processing label: {label} ===")
        
        # Get existing videos from manifest to avoid redundant work
        existing_entry = next((g for g in manifest["gestures"] if g["label"] == label), None)
        video_files = existing_entry.get("videos", []) if existing_entry and "videos" in existing_entry else []
        initial_count = len(video_files)

        for search_term in search_terms:
            print(f"  Searching for: '{search_term}'...")
            
            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(search_term)}"
            search_html = fetch_url(search_url)
            if not search_html:
                continue
            
            entry_url = find_entry_url(search_html)
            if not entry_url:
                if find_video_url_direct(search_html):
                    print("    Search redirected directly to entry.")
                    entry_html = search_html
                else:
                    print(f"    No entry found for '{search_term}'")
                    continue
            else:
                print(f"    Found entry URL: {entry_url}")
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
            print(f"    Found {len(variant_links)} variants.")
            
            for i, v_link in enumerate(variant_links):
                v_html = fetch_url(v_link)
                if v_html:
                    v_url = find_video_url_direct(v_html)
                    if v_url:
                        fname = download_video(label, v_url, f"var_{term_id}_{i}")
                        if fname and fname not in video_files:
                            video_files.append(fname)
                time.sleep(0.5)
            
            time.sleep(1)

        if len(video_files) > initial_count:
            # Update manifest in memory
            manifest["gestures"] = [g for g in manifest["gestures"] if g["label"] != label]
            manifest["gestures"].append({
                "label": label,
                "videos": video_files
            })
            updated = True
            print(f"  Updated memory for {label} with {len(video_files)} unique videos.")
        else:
            print(f"  No new videos found for {label}")

    if updated:
        save_manifest(manifest)
    else:
        print("\nNo manifest updates needed.")

if __name__ == "__main__":
    main()