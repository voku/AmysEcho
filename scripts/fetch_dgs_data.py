import subprocess

from scripts.dgs_common import (
	DATA_DIR,
	FALLBACK_LABEL_URLS,
	MANIFEST_PATH,
	download_video,
	ensure_dirs,
	load_manifest,
	save_manifest,
)

def main():
    ensure_dirs()
    
    manifest = load_manifest()
    
    updated = False
    for label, urls in FALLBACK_LABEL_URLS.items():
        video_files = []
        for index, url in enumerate(urls):
            filename = download_video(label, url, f"fallback_{index}")
            if filename:
                video_files.append(filename)
        if video_files and not any(
            entry.get("label") == label for entry in manifest["gestures"]
        ):
            manifest["gestures"].append(
                {
                    "id": label,
                    "label": label,
                    "videos": video_files,
                    "totalVideoCount": len(video_files),
                }
            )
            updated = True
    
    # Write manifest once
    if updated:
        save_manifest(manifest)

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
