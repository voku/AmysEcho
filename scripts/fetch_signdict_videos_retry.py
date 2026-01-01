import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

TARGET_LABELS = {
    "fertig": "fertig",
    "gruen": "grün",
    "nochmal": "noch mal",
    "trinken": "trinken"
}

DATA_DIR = Path("server/data/dgs_video_examples")
MANIFEST_PATH = Path("server/data/dgs_manifest.json")
BASE_URL = "https://signdict.org"

def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def fetch_url(url):
    print(f"Fetching {url}...")
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
    with urllib.request.urlopen(req) as response:
        return response.read().decode('utf-8')

def find_video_url_direct(html):
    # Look for og:video:url
    match = re.search(r'<meta property="og:video:secure_url" content="([^"]+)">', html)
    if not match:
        match = re.search(r'<meta property="og:video:url" content="([^"]+)">', html)
    if match:
        return match.group(1)
    
    # Or in video tag
    match = re.search(r'<video[^>]+src="([^"]+)"', html)
    if match:
        return match.group(1)
    return None

def find_entry_url(search_html):
    match = re.search(r'<a class="so-search-result--link" href="([^"]+)">', search_html)
    if match:
        return BASE_URL + match.group(1)
    return None

def download_video(label, video_url):
    output_path = DATA_DIR / f"{label}.mp4"
    if output_path.exists():
        print(f"File {output_path} already exists. Skipping.")
        return output_path
    
    print(f"Downloading {label} from {video_url}...")
    try:
        urllib.request.urlretrieve(video_url, output_path)
        print(f"Downloaded {label}")
        return output_path
    except urllib.error.URLError as e:
        print(f"Failed to download {label} (URL error): {e}")
        return None
    except OSError as e:
        print(f"Failed to download {label} (file error): {e}")
        return None

def update_manifest(label):
    manifest = {"gestures": []}
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            try:
                manifest = json.load(f)
            except json.JSONDecodeError:
                pass
    
    existing = next((item for item in manifest["gestures"] if item["label"] == label), None)
    if not existing:
        manifest["gestures"].append({"label": label, "video": f"{label}.mp4"})
        with open(MANIFEST_PATH, "w") as f:
            json.dump(manifest, f, indent=2)

def main():
    ensure_dirs()
    
    for label_key, search_term in TARGET_LABELS.items():
        try:
            print(f"\nProcessing {label_key} (search: {search_term})...")
            search_url = f"{BASE_URL}/search?q={urllib.parse.quote(search_term)}"
            html = fetch_url(search_url)
            
            # Check if we are directly on the video page
            video_url = find_video_url_direct(html)
            
            if not video_url:
                # If not, check for entry link
                entry_url = find_entry_url(html)
                if entry_url:
                    print(f"Found entry URL: {entry_url}")
                    entry_html = fetch_url(entry_url)
                    video_url = find_video_url_direct(entry_html)
            
            if not video_url:
                print(f"No video URL found for {label_key}")
                continue
                
            if download_video(label_key, video_url):
                update_manifest(label_key)
            
            time.sleep(1)
            
        except urllib.error.URLError as e:
            print(f"Error processing {label_key} (URL error): {e}")
        except OSError as e:
            print(f"Error processing {label_key} (file error): {e}")

if __name__ == "__main__":
    main()
