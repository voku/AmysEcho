import json
import subprocess

from scripts.dgs_common import (
    DATA_DIR,
    FALLBACK_LABEL_URLS,
    MANIFEST_PATH,
    download_video,
    ensure_dirs,
)

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
    for label, urls in FALLBACK_LABEL_URLS.items():
        for index, url in enumerate(urls):
            filename = download_video(label, url, f"fallback_{index}")
            if filename:
                entry = {
                    "id": label,
                    "label": label,
                    "video": filename,
                }
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
