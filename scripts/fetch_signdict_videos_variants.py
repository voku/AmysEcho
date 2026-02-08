#!/usr/bin/env python3
"""Fetch DGS videos and their variants from signdict.org."""

import time
import urllib.parse

from scripts.dgs_common import (
    BASE_URL,
    download_video,
    ensure_dirs,
    ensure_manifest_shape,
    fetch_url,
    find_entry_url,
    find_variant_links,
    find_video_url_direct,
    load_manifest,
    save_manifest,
    update_manifest_stats,
    upsert_manifest_entry,
)

# Comprehensive search terms for kid starter preset glosses
# Organized by category for better model accuracy
TARGET_LABELS = {
    # === COLORS (Farben) ===
    "rot": ["rot", "rosa", "pink"],
    "blau": ["blau"],
    "gelb": ["gelb"],
    "gruen": ["grün", "gruen"],
    "lila": ["lila", "violett", "purple"],
    "orange": ["orange"],
    "schwarz": ["schwarz"],
    "weiss": ["weiß", "weiss"],
    
    # === FOOD & DRINK (Essen & Trinken) ===
    "essen": ["essen", "mahlzeit", "frühstück", "mittagessen", "abendessen"],
    "trinken": ["trinken", "getränk"],
    "hunger": ["hunger", "hungrig"],
    "durst": ["durst", "durstig"],
    "satt": ["satt", "genug", "voll"],
    "apfel": ["apfel", "äpfel"],
    "banane": ["banane"],
    "brot": ["brot", "brötchen"],
    "wasser": ["wasser"],
    "milch": ["milch"],
    
    # === CAREGIVERS (Bezugspersonen) ===
    "mama": ["mama", "mutter", "mutti"],
    "papa": ["papa", "vater", "vati"],
    "schwester": ["schwester", "geschwister"],
    "bruder": ["bruder"],
    "oma": ["oma", "großmutter"],
    "opa": ["opa", "großvater"],
    "hilfe": ["hilfe", "helfen"],
    "bitte": ["bitte", "bitten"],
    "danke": ["danke", "danken", "dankeschön"],
    
    # === ACTIVITIES (Aktivitäten) ===
    "spielen": ["spielen", "spiel", "spielplatz", "spielzeug"],
    "schlafen": ["schlafen", "schlaf", "müde"],
    "fertig": ["fertig", "beendet", "schluss", "ende", "vorbei"],
    "nochmal": ["nochmal", "wiederholen", "noch mal", "erneut"],
    "stopp": ["stopp", "stop", "halt", "aufhören"],
    "mehr": ["mehr", "noch mehr"],
    "alle": ["alle", "alles", "jeder"],
    
    # === EMOTIONS (Gefühle) ===
    "gluecklich": ["glücklich", "froh", "freude", "fröhlich"],
    "traurig": ["traurig", "trauer", "weinen"],
    "muede": ["müde", "erschöpft"],
    "wuetend": ["wütend", "böse", "ärger", "zorn"],
    "angst": ["angst", "ängstlich", "furcht"],
    "liebe": ["liebe", "lieben", "liebhaben"],
    
    # === BASICS (Grundlagen) ===
    "ja": ["ja", "jawohl", "richtig"],
    "nein": ["nein", "nicht", "falsch"],
    "ich": ["ich", "mich", "selbst"],
    "du": ["du", "dich"],
    "wo": ["wo", "wohin", "woher"],
    "was": ["was", "welche", "welches"],
}

def main():
    ensure_dirs()
    manifest = ensure_manifest_shape(load_manifest())
    updated = False
    
    for label, search_terms in TARGET_LABELS.items():
        print(f"\n=== Processing label: {label} ===")
        
        # Get existing videos from manifest to avoid redundant work
        existing_entry = next((g for g in manifest["gestures"] if g.get("label") == label or g.get("id") == label), None)
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
            upsert_manifest_entry(manifest, label, video_files)
            updated = True
            print(f"  Updated manifest for {label} with {len(video_files)} unique videos.")
        else:
            print(f"  No new videos found for {label}")

    if updated:
        update_manifest_stats(manifest)
        save_manifest(manifest)
    else:
        print("\nNo manifest updates needed.")

if __name__ == "__main__":
    main()
