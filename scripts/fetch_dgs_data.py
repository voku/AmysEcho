import subprocess

from scripts.dgs_common import (
    DATA_DIR,
    MANIFEST_PATH,
    ensure_dirs,
    fetch_custom_source_videos,
    load_custom_sources,
    load_manifest,
    save_manifest,
    update_manifest_stats,
    upsert_manifest_entry,
)


def main():
    ensure_dirs()

    manifest = load_manifest()

    updated = False
    custom_labels = load_custom_sources()
    for label in custom_labels.keys():
        video_files = fetch_custom_source_videos(label)
        if video_files:
            upsert_manifest_entry(manifest, label, video_files)
            updated = True

    if updated:
        update_manifest_stats(manifest)
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
