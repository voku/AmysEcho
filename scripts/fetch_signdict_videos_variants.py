import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

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

DATA_DIR = Path("server/data/dgs_video_examples")
MANIFEST_PATH = Path("server/data/dgs_manifest.json")
BASE_URL = "https://signdict.org"

def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def fetch_url(url):
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except urllib.error.URLError as e:
        print(f"Error fetching {url} (URL error): {e}")
        return None
    except UnicodeDecodeError as e:
        print(f"Error fetching {url} (decode error): {e}")
        return None

def find_entry_url(search_html):
    # Match first result link
    match = re.search(r'<a class="so-search-result--link" href="([^"]+)">', search_html)
    if match:
        return BASE_URL + match.group(1)
    return None

def find_video_url_direct(html):
    # 1. Open Graph secure url
    match = re.search(r'<meta property="og:video:secure_url" content="([^"]+)">', html)
    if match:
        return match.group(1)
    
    # 2. Open Graph url
    match = re.search(r'<meta property="og:video:url" content="([^"]+)">', html)
    if match:
        return match.group(1)
    
    # 3. Video tag src
    match = re.search(r'<video[^>]+src="([^"]+)"', html)
    if match:
        return match.group(1)
    
    return None

def find_variant_links(html):
    # Look for: <a href='/entry/3415-trinken/video/5430' aria-label='Diese Variante wählen'>
    # The links are relative
    links = re.findall(r'<a href=\'([^\']+)\' aria-label=\'Diese Variante wählen\'>', html)
    # Also double quotes
    links += re.findall(r'<a href="([^"]+)" aria-label="Diese Variante wählen">', html)
    
    # Make unique and absolute
    return list({BASE_URL + link for link in links})

def download_video(label, video_url, index):
    filename = f"{label}_{index}.mp4"
    output_path = DATA_DIR / filename
    
    if output_path.exists():
        # Check size to ensure it's not a dummy file
        if output_path.stat().st_size > 1000:
            print(f"  File {filename} already exists. Skipping.")
            return str(filename)
    
    print(f"  Downloading {label} variant {index} from {video_url}...")
    try:
        urllib.request.urlretrieve(video_url, output_path)
        print(f"  Downloaded {filename}")
        return str(filename)
    except urllib.error.URLError as e:
        print(f"  Failed to download {filename} (URL error): {e}")
        return None
    except OSError as e:
        print(f"  Failed to download {filename} (file error): {e}")
        return None

def load_manifest():
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            try:
                return json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
    return {"gestures": []}

def update_manifest(label, video_files):
    manifest = load_manifest()
    
    # Remove existing entry for this label if any (we are replacing with fresh list)
    manifest["gestures"] = [g for g in manifest["gestures"] if g["label"] != label]
    
    # Add new entry with list of videos
    manifest["gestures"].append({
        "label": label,
        "videos": video_files
    })
    
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)

def main():
    ensure_dirs()
    
    for label, search_terms in TARGET_LABELS.items():
        print(f"\n=== Processing label: {label} ===")
        video_files = []
        
        # Load existing from manifest if we want to accumulate across terms
        manifest = load_manifest()
        existing_entry = next((g for g in manifest["gestures"] if g["label"] == label), None)
        if existing_entry:
            video_files = existing_entry.get("videos", [])

        for search_term in search_terms:
            print(f"  Searching for: '{search_term}'...")
            
            # 1. Search
            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(search_term)}"
            search_html = fetch_url(search_url)
            if not search_html:
                continue
            
            # 2. Find Entry Page
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

            # 3. Process Main Video + Variants
            # Use search_term hash or index to avoid filename collisions if downloading many
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

        if video_files:
            update_manifest(label, video_files)
            print(f"  Final manifest update for {label} with {len(video_files)} unique videos.")
        else:
            print(f"  No videos found for {label}")

if __name__ == "__main__":
    main()
