import json
import subprocess
from pathlib import Path

# Mapping labels to known SignDict IDs or keywords for search
SEARCH_MAP = {
    "alle": "https://dw-dgs.de/static/videos/alle.mp4",
    "blau": "https://dw-dgs.de/static/videos/blau.mp4",
    "essen": "https://dw-dgs.de/static/videos/essen.mp4",
    "fertig": "https://dw-dgs.de/static/videos/fertig.mp4",
    "gelb": "https://dw-dgs.de/static/videos/gelb.mp4",
    "gruen": "https://dw-dgs.de/static/videos/gruen.mp4",
    "nochmal": "https://dw-dgs.de/static/videos/nochmal.mp4",
    "rot": "https://dw-dgs.de/static/videos/rot.mp4",
    "satt": "https://dw-dgs.de/static/videos/satt.mp4",
    "schwester": "https://dw-dgs.de/static/videos/schwester.mp4",
    "spielen": "https://dw-dgs.de/static/videos/spielen.mp4",
    "trinken": "https://dw-dgs.de/static/videos/trinken.mp4",
}

DATA_DIR = Path("server/data/dgs_video_examples")
MANIFEST_PATH = Path("server/data/dgs_manifest.json")

def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def download_video(label: str, url: str) -> Path | None:
    """
    Downloads a video for a given label. 
    Uses yt-dlp if it's a video platform, or direct download.
    """
    output_path = DATA_DIR / f"{label}.mp4"
    if output_path.exists() and output_path.stat().st_size > 1000:
        print(f"Video for {label} already exists.")
        return output_path

    print(f"Downloading video for {label} from {url}...")
    try:
        # Try downloading using yt-dlp
        subprocess.run([
            "yt-dlp", 
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "-o", str(output_path),
            url
        ], check=True, capture_output=True)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"Failed to download {label} via yt-dlp: {e}. Stderr: {e.stderr.decode(errors='ignore') if e.stderr else 'N/A'}")
        return None
    except OSError as e:
        print(f"Failed to download {label} (yt-dlp not found or file error): {e}")
        return None

def main():
    ensure_dirs()
    
    # Load manifest once
    manifest = {"gestures": []}
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH) as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: Could not read or parse manifest file at {MANIFEST_PATH}. A new manifest will be created. Error: {e}")
    
    if "gestures" not in manifest:
        manifest["gestures"] = []
    
    updated = False
    for label, url in SEARCH_MAP.items():
        video_path = download_video(label, url)
        if video_path and video_path.exists():
            entry = {"label": label, "video": f"{label}.mp4"}
            if not any(e["label"] == label for e in manifest["gestures"]):
                manifest["gestures"].append(entry)
                updated = True
    
    # Write manifest once
    if updated:
        with open(MANIFEST_PATH, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"Updated manifest at {MANIFEST_PATH}")

    # Run the processor on the entire directory once
    print("Starting bulk processing of DGS videos...")
    try:
        subprocess.run([
            "python3", "scripts/process_dgs_videos.py",
            "--videos-dir", str(DATA_DIR),
            "--split-output",
            "--manifest", str(MANIFEST_PATH),
            "--max-frames", "150"
        ], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error during bulk processing: {e}")
    except OSError as e:
        print(f"Error during bulk processing (command not found): {e}")

if __name__ == "__main__":
    main()
