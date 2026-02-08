import subprocess

from scripts.dgs_common import (
    DATA_DIR,
    FALLBACK_LABEL_URLS,
    MANIFEST_PATH,
    download_video,
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
    for label, urls in FALLBACK_LABEL_URLS.items():
        video_files = []
        for index, url in enumerate(urls):
            filename = download_video(label, url, f"fallback_{index}")
            if filename:
                video_files.append(filename)
        if video_files:
            upsert_manifest_entry(manifest, label, video_files)
            updated = True

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
